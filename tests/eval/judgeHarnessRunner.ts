/**
 * Phase 3-N Plan P2 Step 2 G3-B — judge harness 実 LLM runner 構造
 *
 * 設計書: docs/alter-plan-p2-llm-step2-readiness-v3.md §3.2 + G3 必須項目 1+2+5
 *
 * 役割 (= GPT G3 必須 1+2+5):
 *   - 50 件 dataset × 5 user profile = 250 評価ケース で Step 1 vs Step 2 LLM 出力を取得
 *   - judge LLM (= 既存 lib/ai/judge.ts pattern) で 3 軸採点
 *   - best 10 / worst 10 を集計、 latency / cost を実測
 *   - 結果 docs/alter-plan-p2-step2-judge-results.md に保存
 *
 * 実行モード:
 *   - npm test では skip (= 実 LLM 呼出は high cost、 CEO 承認後)
 *   - 別 script (= `npx tsx tests/eval/judgeHarnessRunner.ts` 等) で実行
 *   - env JUDGE_HARNESS_RUN=true で gating
 *
 * cost 見積もり:
 *   - Step 1 LLM: 50 anchor × 5 user × 1 call = 250 call (= Step 1 path)
 *   - Step 2 LLM: 50 anchor × 5 user × 1 call = 250 call (= Step 2 path)
 *   - judge LLM: 250 case × 3 candidates × 1 call = 750 call (= 3 軸採点)
 *   - 合計 ~1250 LLM call、 Gemini Flash 想定で ~$1-3
 *
 * 不変原則:
 *   - structure のみ (= 実 LLM 呼出は env gate で制御)
 *   - 50 件 dataset / 5 user profile は固定 (= 再現性確保)
 *   - judge LLM の prompt も pure builder で固定
 */

// 注: 本 file は実 LLM 呼出 entry。 server-only ではなく、 node script として実行される想定。
//     実装は次 phase (= CEO 承認 + 実行 timing 決定後)。
//     本 commit では structure + helper のみ、 実 LLM 呼出 logic は stub。

import type {
  EvalCase,
  EvalOutputCandidate,
  EvalScoredEntry,
  EvalScore,
} from "./planAlterNoteJudgeHarness";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Judge LLM prompt builder (= pure)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Judge LLM system prompt (= 3 軸採点用、 pure)
 *
 * 既存 lib/ai/judge.ts pattern と整合:
 *   - judge LLM (= Gemini Pro or 別 evaluator) に 3 軸採点を JSON で返させる
 *   - 採点軸: 自然さ / あなたらしさ / 押しつけ感の弱さ (= 1-5 階)
 */
export const JUDGE_SYSTEM_PROMPT = [
  "あなたは Aneurasync 予定解釈文の品質評価者です。",
  "ユーザーの 1 件の予定に対する 「観測的な意味文」 を、 以下 3 軸で 1-5 階採点してください。",
  "",
  "## 3 軸の定義",
  "",
  "1. **naturalness (自然さ)** — 日本語として違和感がないか",
  "   - 5: mock 級 (= プロが書いた自然文)",
  "   - 3: 普通 (= 違和感ないが特筆点もない)",
  "   - 1: 機械翻訳級 (= 不自然)",
  "",
  "2. **personalness (あなたらしさ)** — ユーザー個別性が反映されているか",
  "   - ユーザー profile (= 集中型 / 朝強い / 関係エネルギー型 等) と整合する内容か",
  "   - 5: 「第二の自己」 級 (= このユーザーにしか書けない文)",
  "   - 3: ユーザー軸の片鱗あり",
  "   - 1: 万人共通の generic 文 (= profile と無関係)",
  "",
  "3. **non_pushy (押しつけ感の弱さ)** — 命令的 / 評価的でない、 観測寄りか",
  "   - 5: 静かな観測者の視点 (= 完全 non-pushy)",
  "   - 3: やや誘導気味だが許容",
  "   - 1: 強い推奨 / 命令 / 評価",
  "",
  "## 出力",
  "",
  "JSON: { \"naturalness\": <1-5>, \"personalness\": <1-5>, \"non_pushy\": <1-5>, \"comment\": \"<短い理由>\" }",
].join("\n");

/**
 * Judge user prompt 構築 (= 評価対象 anchor + user profile + candidate 文)
 */
export function buildJudgeUserPrompt(
  evalCase: EvalCase,
  candidate: EvalOutputCandidate,
): string {
  const lines: string[] = [];
  lines.push("## 評価対象");
  lines.push("");
  lines.push("### 予定");
  lines.push(`- カテゴリ: ${evalCase.anchor._meta.category}`);
  lines.push(`- 時刻: ${evalCase.anchor.startTime}${evalCase.anchor.endTime ? `-${evalCase.anchor.endTime}` : ""}`);
  if (evalCase.anchor.title) {
    lines.push(`- タイトル: ${evalCase.anchor.title}`);
  }
  if (evalCase.anchor.locationText) {
    lines.push(`- 場所: ${evalCase.anchor.locationText}`);
  }
  lines.push("");
  lines.push("### ユーザー profile");
  lines.push(`- ${evalCase.userProfile.description}`);
  lines.push(`- 判断モード: ${evalCase.userProfile.stable.judgmentMode}`);
  lines.push(`- 時刻偏好: ${evalCase.userProfile.stable.timePreference}`);
  lines.push(`- 直近リズム: ${evalCase.userProfile.recent.recentRhythm}`);
  lines.push("");
  lines.push("### 評価対象文");
  lines.push(`「${candidate.text ?? "(出力なし)"}」`);
  lines.push("");
  lines.push(`source: ${candidate.source}`);
  lines.push("");
  lines.push("上記文を 3 軸で採点し、 JSON で返してください。");
  return lines.join("\n");
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Judge LLM 呼出 (= stub、 実装は CEO 承認後)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 判定 1 case × 1 candidate を judge LLM に投げて採点 result を取得
 *
 * 実装は CEO 承認後の別 phase で:
 *   1. server module として実装 (= "use server" or "server-only")
 *   2. runAI 呼出 (= taskType "plan_alter_note_judge")
 *   3. JSON parse + EvalScore に変換
 *   4. score 整合性 check (= 1-5 範囲)
 *   5. EvalScoredEntry return
 *
 * 本 commit では stub。
 */
export async function judgeCandidateStub(
  evalCase: EvalCase,
  candidate: EvalOutputCandidate,
): Promise<EvalScoredEntry> {
  // STUB: 実 LLM 呼出は別 phase。 本 stub は test 用 deterministic score を返す。
  const _systemPrompt = JUDGE_SYSTEM_PROMPT;
  const _userPrompt = buildJudgeUserPrompt(evalCase, candidate);

  // deterministic score (= stub、 source に応じて固定)
  let score: EvalScore;
  if (candidate.source === "deterministic") {
    score = { naturalness: 3.5, personalness: 1.5, non_pushy: 4.0 };
  } else if (candidate.source === "step1_llm") {
    score = { naturalness: 4.0, personalness: 2.2, non_pushy: 3.8 };
  } else {
    // step2_llm
    score = { naturalness: 4.2, personalness: 3.5, non_pushy: 4.0 };
  }

  return {
    caseId: evalCase.caseId,
    candidate,
    judge: "llm_as_judge",
    score,
    comment: `[STUB] ${candidate.source} 採点 (= 実 LLM 呼出は別 phase)`,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Best / Worst 集計 (= pure helper)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 評価 entry 配列から best N / worst N を抽出 (= GPT G3 必須項目 2)
 *
 * 「あなたらしさ」 軸で sort (= Step 2 の核心評価)
 *
 * pure (= 入力 mutate なし、 deterministic)
 */
export function extractBestAndWorst(
  entries: ReadonlyArray<EvalScoredEntry>,
  n: number = 10,
): {
  readonly best: ReadonlyArray<EvalScoredEntry>;
  readonly worst: ReadonlyArray<EvalScoredEntry>;
} {
  // Step 2 LLM entries only (= deterministic / step1 は比較ベース、 best/worst は Step 2 評価)
  const step2Entries = entries.filter((e) => e.candidate.source === "step2_llm");
  // あなたらしさ + 自然さ で総合 sort
  const sorted = [...step2Entries].sort((a, b) => {
    const aTotal = a.score.personalness + a.score.naturalness;
    const bTotal = b.score.personalness + b.score.naturalness;
    return bTotal - aTotal; // 降順
  });
  return {
    best: sorted.slice(0, n),
    worst: sorted.slice(-n).reverse(),
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Latency / cost 集計 (= pure helper)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Latency 統計 (= cold / warm / cache hit 分類、 GPT G3 必須項目 5)
 *
 * 実 runAI から latencyMs / cacheHit を観測、 集計。
 */
export type LatencyStats = {
  readonly count: number;
  readonly p50: number;
  readonly p95: number;
  readonly avg: number;
  readonly max: number;
};

export function computeLatencyStats(latencies: ReadonlyArray<number>): LatencyStats {
  if (latencies.length === 0) {
    return { count: 0, p50: 0, p95: 0, avg: 0, max: 0 };
  }
  const sorted = [...latencies].sort((a, b) => a - b);
  const p50Idx = Math.floor(sorted.length * 0.5);
  const p95Idx = Math.floor(sorted.length * 0.95);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  return {
    count: sorted.length,
    p50: sorted[p50Idx] ?? 0,
    p95: sorted[p95Idx] ?? 0,
    avg: sum / sorted.length,
    max: sorted[sorted.length - 1] ?? 0,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 実行 entry (= CEO 承認後の別 phase で完成)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 全 250 case を Step 1 + Step 2 で実 LLM 実行 → judge LLM 採点 → 集計
 *
 * 実装は CEO 承認後の別 phase で:
 *   1. PLAN_ALTER_NOTE_LIVE + PLAN_PERSONAL_MODEL_INTEGRATION を一時 true (= local-only)
 *   2. enhanceAlterNotesAction 経由で Step 1 / Step 2 LLM 出力取得
 *   3. judge LLM で 3 軸採点
 *   4. extractBestAndWorst + computeLatencyStats で集計
 *   5. docs/alter-plan-p2-step2-judge-results.md 出力
 *
 * 本 commit では entry signature のみ、 stub return。
 */
export async function runJudgeHarnessFullStub(): Promise<{
  readonly totalCases: number;
  readonly note: string;
}> {
  return {
    totalCases: 250,
    note: "[STUB] 実 LLM 呼出は CEO 承認後の別 phase で実装。 本 commit では structure のみ。",
  };
}
