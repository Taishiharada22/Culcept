/**
 * Phase 3-N Plan P2 Step 2 G3-B — Live judge harness runner (= 実 LLM 呼出)
 *
 * 設計書: docs/alter-plan-p2-llm-step2-readiness-v3.md §3 + GPT G3 補正
 *
 * 役割 (= GPT G3 必須 1+2+5 + 「worst 10 4 類型分類」):
 *   - 250 ケース (= 5 user × 50 anchor) を Step 1 vs Step 2 LLM で 実行
 *   - judge LLM で 3 軸採点 + worst 4 類型分類
 *   - best 10 / worst 10 抽出
 *   - latency / cost 実測
 *   - 結果 docs に出力
 *
 * 実行方法 (= 2 段階、 GPT 補正):
 *   1. pilot (= 10 ケース、 ~30 call、 ~$0.10): `npx tsx tests/eval/runJudgeHarnessLive.ts pilot`
 *   2. full (= 250 ケース、 ~1250 call、 ~$1-3): `npx tsx tests/eval/runJudgeHarnessLive.ts full`
 *
 * 環境 (= 必須):
 *   - GEMINI_API_KEY (= 必須)
 *   - OPENAI_API_KEY (= 推奨、 fallback)
 *   - 本 script 内部で PLAN_FLAGS.alterNoteLive + personalModelIntegration を強制 ON (= env 不要)
 *
 * 4 類型分類 (= GPT 追加要求):
 *   - "too_generic" (= 平均的すぎる)
 *   - "weak_personalization" (= 個人化が弱い)
 *   - "over_interpretation" (= 解釈が過剰)
 *   - "too_polished" (= 文体が綺麗すぎて匿名化)
 *
 * 不変原則:
 *   - 既存 Stargazer module 不触 (= synthetic profile 経由)
 *   - DB write 0 (= 結果は docs file のみ)
 *   - PLAN_FLAGS env 一時設定なし (= script 内で flag 強制、 副作用最小)
 *   - production / preview 影響 0
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Setup (= server-only marker stub)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// node 環境で server-only marker を no-op 化 (= "import 'server-only'" は side-effect なし)
// 既存 vi.mock("server-only") test pattern と同じ。 ここでは script 開始時に module cache hijack。
process.env.PLAN_ALTER_NOTE_LIVE = "true";
process.env.PLAN_PERSONAL_MODEL_INTEGRATION = "true";

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  PLAN_ALTER_NOTE_DATASET,
  EVAL_USER_PROFILES,
  type SyntheticAnchor,
  type EvalUserProfile,
} from "./planAlterNoteDataset";
import {
  buildEvalCases,
  computeAverageScoreBySource,
  type EvalCase,
  type EvalScoredEntry,
  type EvalOutputCandidate,
  type EvalScore,
  type EvalScoreAxis,
} from "./planAlterNoteJudgeHarness";
import { buildPersonalModelV2FromSynthetic } from "@/lib/plan/llm/personalModelExtractorV2";
import { evaluatePhaseGate } from "@/lib/plan/llm/hdmPhaseGate";
import { buildAlterNotePrompt, ALTER_NOTE_JSON_SCHEMA } from "@/lib/plan/llm/alterNotePromptBuilder";
import {
  buildAlterNotePromptV2,
  ALTER_NOTE_JSON_SCHEMA_V2,
} from "@/lib/plan/llm/alterNotePromptBuilderV2";
import {
  validateAlterNoteOutput,
} from "@/lib/plan/llm/alterNoteValidator";
import {
  validateAlterNoteOutputV2,
} from "@/lib/plan/llm/alterNoteValidatorV2";

// runAI は async dynamic import (= server-only marker 経由のため script 環境で deferred load)
async function loadRunAI() {
  const ai = await import("@/lib/ai");
  return ai.runAI;
}

// deterministic 文 取得 (= 比較ベース)
import { getNarrative, getMeaningText } from "@/lib/plan/list/categoryMeaning";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helper: anchor → AlterNoteContext + EventCategory 解決
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function anchorToCategory(
  anchor: SyntheticAnchor,
): "cafe" | "meal" | "work" | "home" | "other" {
  return anchor._meta.category;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helper: deterministic alterNote 取得 (= 既存 getNarrative / getMeaningText)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function buildDeterministicCandidate(
  anchor: SyntheticAnchor,
): EvalOutputCandidate {
  const category = anchorToCategory(anchor);
  const text =
    getNarrative(category, anchor.startTime, anchor.locationText, anchor.title) ??
    getMeaningText(category, anchor.startTime);
  return {
    source: "deterministic",
    text: text ?? undefined,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helper: Step 1 / Step 2 LLM 呼出
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function runStep1LLM(
  anchor: SyntheticAnchor,
  runAIFn: Awaited<ReturnType<typeof loadRunAI>>,
): Promise<EvalOutputCandidate> {
  const category = anchorToCategory(anchor);
  const ctx = {
    category,
    startTime: anchor.startTime,
    ...(anchor.endTime ? { endTime: anchor.endTime } : {}),
    ...(anchor.title ? { title: anchor.title } : {}),
    ...(anchor.locationText ? { location: anchor.locationText } : {}),
  };
  const { systemPrompt, userPrompt } = buildAlterNotePrompt(ctx);
  const started = Date.now();
  try {
    const result = await runAIFn({
      taskType: "plan_alter_note",
      prompt: userPrompt,
      systemPrompt,
      requireJson: true,
      jsonSchema: ALTER_NOTE_JSON_SCHEMA as Record<string, unknown>,
      temperature: 0.2,
      maxOutputTokens: 128,
      timeoutMs: 8000,
    });
    const latencyMs = Date.now() - started;
    if (!result.success || !result.structured) {
      return { source: "step1_llm", text: undefined, latencyMs };
    }
    const text =
      result.structured && typeof result.structured === "object" && "text" in result.structured
        ? String((result.structured as { text: unknown }).text ?? "")
        : "";
    const validation = validateAlterNoteOutput(text);
    return {
      source: "step1_llm",
      text: validation.ok ? validation.text : undefined,
      model: result.model,
      latencyMs,
    };
  } catch {
    return { source: "step1_llm", text: undefined, latencyMs: Date.now() - started };
  }
}

async function runStep2LLM(
  anchor: SyntheticAnchor,
  profile: EvalUserProfile,
  runAIFn: Awaited<ReturnType<typeof loadRunAI>>,
): Promise<EvalOutputCandidate> {
  const category = anchorToCategory(anchor);
  const pm = buildPersonalModelV2FromSynthetic({
    hdmPhase: profile.hdmPhase,
    trustLevel: profile.trustLevel,
    stable: profile.stable,
    recent: profile.recent,
  });
  const ctx = {
    category,
    startTime: anchor.startTime,
    ...(anchor.endTime ? { endTime: anchor.endTime } : {}),
    ...(anchor.title ? { title: anchor.title } : {}),
    ...(anchor.locationText ? { location: anchor.locationText } : {}),
    personalModelV2: pm,
  };
  const phaseGate = evaluatePhaseGate(pm.meta.hdmPhase);
  const { systemPrompt, userPrompt } = buildAlterNotePromptV2(ctx, phaseGate.framingHint);
  const started = Date.now();
  try {
    const result = await runAIFn({
      taskType: "plan_alter_note",
      prompt: userPrompt,
      systemPrompt,
      requireJson: true,
      jsonSchema: ALTER_NOTE_JSON_SCHEMA_V2 as Record<string, unknown>,
      temperature: 0.2,
      maxOutputTokens: 128,
      timeoutMs: 8000,
    });
    const latencyMs = Date.now() - started;
    if (!result.success || !result.structured) {
      return { source: "step2_llm", text: undefined, latencyMs };
    }
    const text =
      result.structured && typeof result.structured === "object" && "text" in result.structured
        ? String((result.structured as { text: unknown }).text ?? "")
        : "";
    const validation = validateAlterNoteOutputV2(text);
    return {
      source: "step2_llm",
      text: validation.ok ? validation.text : undefined,
      model: result.model,
      latencyMs,
    };
  } catch {
    return { source: "step2_llm", text: undefined, latencyMs: Date.now() - started };
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Judge LLM (= 3 軸採点 + 4 類型分類、 GPT 補正)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const JUDGE_SYSTEM_PROMPT_V2 = [
  "あなたは Aneurasync 予定解釈文の品質評価者です。",
  "ユーザーの予定に対する 「観測的な意味文」 を 3 軸 1-5 階で採点し、 worst 類型分類も行ってください。",
  "",
  "## 3 軸の定義",
  "",
  "1. **naturalness (自然さ)**: 日本語として違和感ない、 文として綺麗 (5=mock 級、 1=機械翻訳級)",
  "2. **personalness (あなたらしさ)**: ユーザー profile (= 集中型 / 朝強い 等) が反映されているか (5=第二の自己級、 1=万人共通 generic)",
  "3. **non_pushy (押しつけ感の弱さ)**: 観測寄り、 命令的/評価的でないか (5=完全 non-pushy、 1=強い推奨/命令/評価)",
  "",
  "## 4 類型分類 (= 該当する場合のみ)",
  "",
  "score の合計が低い (= worst 群) の場合、 主因を 1 つ選択 (= category):",
  "  - too_generic: 平均的すぎる、 個別性なし",
  "  - weak_personalization: ユーザー profile が反映されていない",
  "  - over_interpretation: 解釈が過剰、 押しつけ寄り",
  "  - too_polished: 文体が綺麗すぎて 個性が消える",
  '  - none: 該当なし (= 良作 or 中庸)',
  "",
  "## 出力",
  '{ "naturalness": <1-5>, "personalness": <1-5>, "non_pushy": <1-5>, "category": "<4 類型のいずれか>", "comment": "<短い理由 30 字以内>" }',
].join("\n");

type JudgeResponse = {
  readonly naturalness: number;
  readonly personalness: number;
  readonly non_pushy: number;
  readonly category: "too_generic" | "weak_personalization" | "over_interpretation" | "too_polished" | "none";
  readonly comment: string;
};

const JUDGE_JSON_SCHEMA = {
  type: "object",
  properties: {
    naturalness: { type: "number", minimum: 1, maximum: 5 },
    personalness: { type: "number", minimum: 1, maximum: 5 },
    non_pushy: { type: "number", minimum: 1, maximum: 5 },
    category: {
      type: "string",
      enum: ["too_generic", "weak_personalization", "over_interpretation", "too_polished", "none"],
    },
    comment: { type: "string", maxLength: 100 },
  },
  required: ["naturalness", "personalness", "non_pushy", "category", "comment"],
  additionalProperties: false,
};

function buildJudgeUserPrompt(
  evalCase: EvalCase,
  candidate: EvalOutputCandidate,
): string {
  const a = evalCase.anchor;
  const p = evalCase.userProfile;
  return [
    "## 評価対象",
    "",
    "### 予定",
    `- カテゴリ: ${a._meta.category}`,
    `- 時刻: ${a.startTime}${a.endTime ? `-${a.endTime}` : ""}`,
    a.title ? `- タイトル: ${a.title}` : "",
    a.locationText ? `- 場所: ${a.locationText}` : "",
    "",
    "### ユーザー profile",
    `- ${p.description}`,
    `- 判断モード: ${p.stable.judgmentMode}`,
    `- 時刻偏好: ${p.stable.timePreference}`,
    `- 回復: ${p.stable.energyRecovery}`,
    `- 直近リズム: ${p.recent.recentRhythm}`,
    `- 内的天気: ${p.recent.innerWeather}`,
    "",
    "### 評価対象文",
    `「${candidate.text ?? "(出力なし)"}」`,
    `source: ${candidate.source}`,
    "",
    "上記文を 3 軸 (= naturalness / personalness / non_pushy) で採点し、 主因 category を 4 類型 + none で分類して JSON で返してください。",
  ]
    .filter((s) => s.length > 0)
    .join("\n");
}

async function judgeCandidate(
  evalCase: EvalCase,
  candidate: EvalOutputCandidate,
  runAIFn: Awaited<ReturnType<typeof loadRunAI>>,
): Promise<EvalScoredEntry & { readonly category: string }> {
  // 出力なし / undefined → 自動 lowest score
  if (!candidate.text) {
    return {
      caseId: evalCase.caseId,
      candidate,
      judge: "llm_as_judge",
      score: { naturalness: 1, personalness: 1, non_pushy: 5 },
      category: "none",
      comment: "出力なし → 採点 skip",
    };
  }
  const userPrompt = buildJudgeUserPrompt(evalCase, candidate);
  try {
    const result = await runAIFn({
      taskType: "plan_alter_note_judge",
      prompt: userPrompt,
      systemPrompt: JUDGE_SYSTEM_PROMPT_V2,
      requireJson: true,
      jsonSchema: JUDGE_JSON_SCHEMA as Record<string, unknown>,
      temperature: 0.1,
      maxOutputTokens: 256,
      timeoutMs: 15000,
    });
    if (!result.success || !result.structured) {
      return {
        caseId: evalCase.caseId,
        candidate,
        judge: "llm_as_judge",
        score: { naturalness: 0, personalness: 0, non_pushy: 0 },
        category: "none",
        comment: `judge 失敗: ${result.errorMessage ?? "unknown"}`,
      };
    }
    const j = result.structured as unknown as JudgeResponse;
    return {
      caseId: evalCase.caseId,
      candidate,
      judge: "llm_as_judge",
      score: {
        naturalness: j.naturalness,
        personalness: j.personalness,
        non_pushy: j.non_pushy,
      },
      category: j.category,
      comment: j.comment,
    };
  } catch (error) {
    return {
      caseId: evalCase.caseId,
      candidate,
      judge: "llm_as_judge",
      score: { naturalness: 0, personalness: 0, non_pushy: 0 },
      category: "none",
      comment: `judge 例外: ${(error as Error).message ?? "unknown"}`,
    };
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main runner
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function main() {
  const args = process.argv.slice(2);
  const mode = args[0] === "full" ? "full" : "pilot";
  const pilotCount = Number.parseInt(args[1] ?? "10", 10);

  console.info(`[runJudgeHarnessLive] mode=${mode}, pilotCount=${pilotCount}`);

  const runAI = await loadRunAI();
  const allCases = buildEvalCases(PLAN_ALTER_NOTE_DATASET, EVAL_USER_PROFILES);
  const cases = mode === "full" ? allCases : allCases.slice(0, pilotCount);
  console.info(`[runJudgeHarnessLive] running ${cases.length} cases`);

  const entries: Array<EvalScoredEntry & { readonly category: string }> = [];
  let caseIdx = 0;
  for (const evalCase of cases) {
    caseIdx += 1;
    console.info(
      `[${caseIdx}/${cases.length}] caseId=${evalCase.caseId}`,
    );

    // 1. deterministic candidate
    const det = buildDeterministicCandidate(evalCase.anchor);
    const detJudge = await judgeCandidate(evalCase, det, runAI);
    entries.push(detJudge);

    // 2. step1 LLM candidate
    const step1 = await runStep1LLM(evalCase.anchor, runAI);
    const step1Judge = await judgeCandidate(evalCase, step1, runAI);
    entries.push(step1Judge);

    // 3. step2 LLM candidate
    const step2 = await runStep2LLM(evalCase.anchor, evalCase.userProfile, runAI);
    const step2Judge = await judgeCandidate(evalCase, step2, runAI);
    entries.push(step2Judge);
  }

  // 集計
  const averages = computeAverageScoreBySource(entries);

  // Step 2 worst 4 類型分類
  const step2Entries = entries.filter((e) => e.candidate.source === "step2_llm");
  const categoryCounts: Record<string, number> = {};
  for (const e of step2Entries) {
    categoryCounts[e.category] = (categoryCounts[e.category] ?? 0) + 1;
  }

  // best 10 / worst 10 (= Step 2)
  const sorted = [...step2Entries].sort((a, b) => {
    const aTotal = a.score.naturalness + a.score.personalness;
    const bTotal = b.score.naturalness + b.score.personalness;
    return bTotal - aTotal;
  });
  const best10 = sorted.slice(0, Math.min(10, sorted.length));
  const worst10 = sorted.slice(-Math.min(10, sorted.length)).reverse();

  // latency 集計
  const allLatencies: number[] = [];
  for (const e of entries) {
    if (e.candidate.latencyMs !== undefined) {
      allLatencies.push(e.candidate.latencyMs);
    }
  }
  const sortedLat = [...allLatencies].sort((a, b) => a - b);
  const p50Lat = sortedLat[Math.floor(sortedLat.length * 0.5)] ?? 0;
  const p95Lat = sortedLat[Math.floor(sortedLat.length * 0.95)] ?? 0;
  const avgLat =
    sortedLat.length > 0 ? sortedLat.reduce((a, b) => a + b, 0) / sortedLat.length : 0;

  const result = {
    mode,
    totalCases: cases.length,
    totalCandidatesScored: entries.length,
    averagesBySource: averages,
    step2CategoryCounts: categoryCounts,
    best10: best10.map((e) => ({
      caseId: e.caseId,
      text: e.candidate.text,
      score: e.score,
      category: e.category,
      comment: e.comment,
    })),
    worst10: worst10.map((e) => ({
      caseId: e.caseId,
      text: e.candidate.text,
      score: e.score,
      category: e.category,
      comment: e.comment,
    })),
    latency: {
      count: sortedLat.length,
      p50: p50Lat,
      p95: p95Lat,
      avg: avgLat,
    },
  };

  // 結果を JSON file に保存 (= 後で docs に統合)
  const resultFile = join(
    process.cwd(),
    "tmp",
    `judge-harness-${mode}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );
  try {
    mkdirSync(dirname(resultFile), { recursive: true });
    writeFileSync(resultFile, JSON.stringify(result, null, 2), "utf-8");
    console.info(`[runJudgeHarnessLive] saved: ${resultFile}`);
    // Raw entries も別 file に保存 (= judge 失敗除外などの再分析用)
    const entriesFile = resultFile.replace(".json", "-entries.json");
    const rawEntries = entries.map((e) => ({
      caseId: e.caseId,
      source: e.candidate.source,
      text: e.candidate.text,
      latencyMs: e.candidate.latencyMs,
      score: e.score,
      category: e.category,
      comment: e.comment,
    }));
    writeFileSync(entriesFile, JSON.stringify(rawEntries, null, 2), "utf-8");
    console.info(`[runJudgeHarnessLive] entries saved: ${entriesFile}`);
  } catch (e) {
    console.warn(`[runJudgeHarnessLive] save failed:`, e);
  }

  console.info("");
  console.info("=== Summary ===");
  console.info(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error("[runJudgeHarnessLive] fatal:", err);
  process.exit(1);
});
