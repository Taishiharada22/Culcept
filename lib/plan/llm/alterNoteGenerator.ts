/**
 * Phase 3-N Plan P2 Step 1 — alterNote LLM 生成 (= runAI 呼出 + fail-open + cost cap)
 *
 * 設計書: docs/alter-plan-p2-llm-readiness.md v2
 *
 * 設計原則 (= CEO + GPT 合議 2026-05-25):
 *   - **fail-open** (= LLM 失敗 / safety 違反でも UI は壊れない、 result は "unavailable"、 呼出側 deterministic fallback)
 *   - **cost cap 4 項目**:
 *     - 1 view 最大 LLM call: 20 (= 21+ は silent degrade)
 *     - 同時実行数 (= Promise 並列): 5
 *     - timeout per call: 4000ms
 *     - 失敗時挙動: "unavailable" return (= 呼出側 deterministic)
 *   - **server-only** (= runAI が "server-only" import を要求)
 *   - **flag OFF default** (= PLAN_FLAGS.alterNoteLive=false で skip)
 *
 * Step 2 拡張余地:
 *   - PersonalModelSummary を ctx.personalModel に注入 (= prompt builder で system 拡張)
 *
 * 設計書 references:
 *   - lib/ai/index.ts (= runAI 統一 entry、 検証済)
 *   - lib/plan/featureFlags.ts (= PLAN_FLAGS.alterNoteLive)
 *   - lib/plan/llm/types.ts (= AlterNoteContext, AlterNoteResult)
 *   - lib/plan/llm/alterNotePromptBuilder.ts (= prompt 生成)
 *   - lib/plan/llm/alterNoteValidator.ts (= 出力検証)
 */

import "server-only";

import { runAI } from "@/lib/ai";
import { PLAN_FLAGS } from "@/lib/plan/featureFlags";

import {
  ALTER_NOTE_JSON_SCHEMA,
  buildAlterNotePrompt,
} from "./alterNotePromptBuilder";
import {
  buildAlterNotePromptV2,
  ALTER_NOTE_JSON_SCHEMA_V2,
} from "./alterNotePromptBuilderV2";
import {
  validateAlterNoteOutput,
} from "./alterNoteValidator";
import {
  validateAlterNoteOutputV2,
} from "./alterNoteValidatorV2";
import {
  evaluatePhaseGate,
  type PhaseFramingHint,
} from "./hdmPhaseGate";
import type {
  AlterNoteContext,
  AlterNoteResult,
} from "./types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Cost cap 定数 (= readiness v2 §6.2 確定値)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 1 view あたり最大 LLM call 数 (= 21+ は silent degrade = "unavailable" return) */
export const ALTER_NOTE_MAX_CALLS_PER_VIEW = 20;

/** 同時実行数 (= Promise.all 並列度) */
export const ALTER_NOTE_CONCURRENCY = 5;

/** Timeout per call (= runAI timeoutMs) */
export const ALTER_NOTE_TIMEOUT_MS = 4000;

/** LLM 出力 token 上限 (= alterNote 短文前提) */
const ALTER_NOTE_MAX_OUTPUT_TOKENS = 128;

/** Temperature (= 再現性高、 cache hit 率高) */
const ALTER_NOTE_TEMPERATURE = 0.2;

/** taskType (= router failover 対象、 analytics 集約用) */
const ALTER_NOTE_TASK_TYPE = "plan_alter_note";

/**
 * Debug-only cache bypass (= CEO + GPT 2026-05-25、 diagnostic 用):
 *
 * 役割:
 *   - smoke 時、 same-anchor 比較で **同 prompt → 同 cache hit → 同 文** という
 *     設計上の挙動が 「prompt の本当の効果」 を覆い隠す問題への 切り分け手段。
 *   - env `PLAN_ALTER_NOTE_CACHE_BYPASS=true` で skipCache: true を runAI に渡す。
 *   - lib/ai/cache.ts:136-138 の既存 metadata.skipCache 機構を流用 (= 既存 frozen contract 活用)。
 *
 * 用途:
 *   - dev / smoke 限定 (= production では false 維持必須、 cost 跳ね上がる)
 *   - 「v3.4.1 prompt 強化が同 anchor で variation 生む能力があるか」 の純粋検証
 *   - 検証後は OFF に戻す
 *
 * 安全策:
 *   - default OFF (= 既存挙動完全保持)
 *   - prompt / temperature は不変 (= 1 軸変更で原因切り分け clean)
 */
const ALTER_NOTE_CACHE_BYPASS =
  process.env.PLAN_ALTER_NOTE_CACHE_BYPASS === "true";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Single anchor → AlterNoteResult
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 1 anchor の alterNote を LLM で生成 (= fail-open、 unavailable は呼出側 fallback)
 *
 * 流れ:
 *   1. flag OFF → "unavailable" (reason: flag_off) (= 通常はここに来ない、 呼出側で先に skip)
 *   2. category 'other' → "unavailable" (reason: category_other) (= 判断不能、 既存契約踏襲)
 *   3. prompt 生成 (= deterministic、 pure)
 *   4. runAI 呼出 (= timeout 4000ms、 fallback failover あり)
 *   5. success=false / empty text → "unavailable" (reason: llm_failure / timeout)
 *   6. validator post-check → 違反なら "unavailable" (reason: validation_failed)
 *   7. 通過 → "llm" result return
 *
 * 注: 本関数は **sensitive 判定しない** (= 呼出側 adapter の責務、 sensitive anchor は LLM context に入れない)
 *     呼出側で AlterNoteContext を作る前に anchor.sensitiveCategory check して別 ctx 経路へ。
 */
export async function generateAlterNote(
  ctx: AlterNoteContext,
  options?: {
    readonly userId?: string;
    readonly sessionId?: string;
  },
): Promise<AlterNoteResult> {
  // 1. flag check (= 通常呼出側で先に skip、 防御的に再 check)
  if (!PLAN_FLAGS.alterNoteLive) {
    return { source: "unavailable", reason: "flag_off" };
  }

  // 2. category 'other' → LLM 送らない (= 既存 deterministic も undefined、 判断保留契約)
  if (ctx.category === "other") {
    return { source: "unavailable", reason: "category_other" };
  }

  // 3. prompt 生成 (= Step 2 v3.1: PM integration flag ON で V2 builder、 OFF で V1)
  const useV2Path =
    PLAN_FLAGS.personalModelIntegration && ctx.personalModelV2 !== undefined;

  let systemPrompt: string;
  let userPrompt: string;
  let jsonSchema: Record<string, unknown>;
  // dev log で 「Plan 補正後 framing」 まで観測するため、 framingHint を分岐外で宣言
  let effectiveFramingHint: PhaseFramingHint | null = null;
  if (useV2Path) {
    // V2 path: 層を分けたまま PM 注入 + Phase framing
    const phaseGate = evaluatePhaseGate(ctx.personalModelV2!.meta.hdmPhase);
    let framingHint: PhaseFramingHint = phaseGate.framingHint;

    // Plan 専用補正 (= CEO + GPT Option A' 2026-05-25):
    //   adapter 側で stable layer が Plan-gate 経由で構築されている場合、
    //   raw HDM phase < 2 由来の "no_personal_framing" だと
    //   system prompt が 「Personal Model は無視してください」 と LLM に指示する
    //   → stable 注入 自体が無効化される
    //   そのため、 **stable 存在時は Phase 2 同等の soft_personal_with_hedge に格上げ**。
    //   recent/contextual gate は不変 (= meta.hdmPhase 基準のまま、 framing も moderate/deep に上げない)
    if (
      ctx.personalModelV2!.stable !== undefined &&
      framingHint === "no_personal_framing"
    ) {
      framingHint = "soft_personal_with_hedge";
    }
    effectiveFramingHint = framingHint;

    const prompts = buildAlterNotePromptV2(ctx, framingHint);
    systemPrompt = prompts.systemPrompt;
    userPrompt = prompts.userPrompt;
    jsonSchema = ALTER_NOTE_JSON_SCHEMA_V2 as Record<string, unknown>;
  } else {
    // V1 path (= Step 1 同等、 flag OFF or PM 未注入 で safe degrade)
    const prompts = buildAlterNotePrompt(ctx);
    systemPrompt = prompts.systemPrompt;
    userPrompt = prompts.userPrompt;
    jsonSchema = ALTER_NOTE_JSON_SCHEMA as Record<string, unknown>;
  }

  // Phase 6 smoke 観測用 dev-only log (= V2 path 発火 + Plan 補正後 framing 確認、 本番 emit しない)
  if (process.env.NODE_ENV !== "production") {
    const pm = ctx.personalModelV2;
    console.info("[plan/alterNote] path", {
      path: useV2Path ? "v2" : "v1",
      rawHdmPhase: pm?.meta.hdmPhase ?? null,
      effectiveFramingHint, // = Plan 補正後の framing (= soft_personal_with_hedge 等)
      hasStable: !!pm?.stable,
      hasRecent: !!pm?.recent,
      hasContextual: !!pm?.contextual,
      stableFields: pm?.stable
        ? {
            judgmentMode: pm.stable.judgmentMode ?? null,
            timePreference: pm.stable.timePreference ?? null,
            traitTone: pm.stable.traitTone ?? null,
          }
        : null,
      category: ctx.category,
    });
  }

  // 4. runAI 呼出
  const startedAt = Date.now();
  let runResult: Awaited<ReturnType<typeof runAI>>;
  try {
    runResult = await runAI({
      taskType: ALTER_NOTE_TASK_TYPE,
      prompt: userPrompt,
      systemPrompt,
      requireJson: true,
      jsonSchema,
      temperature: ALTER_NOTE_TEMPERATURE,
      maxOutputTokens: ALTER_NOTE_MAX_OUTPUT_TOKENS,
      timeoutMs: ALTER_NOTE_TIMEOUT_MS,
      ...(options?.userId !== undefined ? { userId: options.userId } : {}),
      ...(options?.sessionId !== undefined ? { sessionId: options.sessionId } : {}),
      // Debug-only cache bypass (= ALTER_NOTE_CACHE_BYPASS env、 dev/smoke 限定)
      ...(ALTER_NOTE_CACHE_BYPASS ? { metadata: { skipCache: true } } : {}),
    });
  } catch {
    // 例外は runAI 内で握り潰されているはずだが、 防御的に
    return { source: "unavailable", reason: "llm_failure" };
  }

  // 5. success / structured check
  if (!runResult.success) {
    // timeout / 503 等は errorMessage に "timeout" を含む可能性 (= 簡易判定)
    const errMsg = runResult.errorMessage ?? "";
    if (errMsg.toLowerCase().includes("timeout")) {
      return { source: "unavailable", reason: "timeout" };
    }
    return { source: "unavailable", reason: "llm_failure" };
  }

  // structured (= JSON parse 済) を期待
  const structured = runResult.structured;
  let rawText = "";
  if (
    structured !== null &&
    typeof structured === "object" &&
    !Array.isArray(structured) &&
    typeof (structured as Record<string, unknown>).text === "string"
  ) {
    rawText = (structured as Record<string, unknown>).text as string;
  } else if (runResult.text.trim().length > 0) {
    // 防御的 fallback: structured 取れないが plain text あり (= 稀 case)
    // JSON 形式ではないので validator で reject される可能性高
    rawText = runResult.text;
  }

  if (rawText.length === 0) {
    return { source: "unavailable", reason: "llm_failure" };
  }

  // 6. validator post-check (= V2 path で 8 段、 V1 path で 5 段)
  const validation = useV2Path
    ? validateAlterNoteOutputV2(rawText)
    : validateAlterNoteOutput(rawText);
  if (!validation.ok) {
    // LLM closeout 帯 Track 2 (= CEO 2026-05-26): 観測用 dev log
    //   - validator reject 率の計算用 (= reject ratio)
    //   - 反復文 検出 (= 同 anchor で 同じ text を返すケース)
    if (process.env.NODE_ENV !== "production") {
      console.info("[plan/alterNote] result", {
        outcome: "validation_failed",
        path: useV2Path ? "v2" : "v1",
        rawTextSample: rawText.slice(0, 40), // 観測用 (= sample のみ、 full text 不要)
        category: ctx.category,
      });
    }
    return { source: "unavailable", reason: "validation_failed" };
  }

  // 7. 通過 → llm result
  const latencyMs = Date.now() - startedAt;

  // LLM closeout 帯 Track 2: 成功時 観測 dev log (= 50+ 実データ蓄積用)
  //   - 「同 anchor 同文率」 計算 (= text 比較)
  //   - 「『思考』 反復率」 計算 (= text に 「思考」 含まれるか)
  //   - 「〜の時間 残存率」 計算 (= 末尾文体 check)
  //   - latency 分布 (= P50 / P95)
  //   注: PII 出さない (= userId は別 log で prefix 8 文字、 ここでは含めない)
  if (process.env.NODE_ENV !== "production") {
    console.info("[plan/alterNote] result", {
      outcome: "success",
      path: useV2Path ? "v2" : "v1",
      text: validation.text, // 観測指標計算用 (= full text)
      category: ctx.category,
      startTime: ctx.startTime,
      latencyMs,
      cacheHit: runResult.cacheHit,
    });
  }

  return {
    source: "llm",
    text: validation.text,
    model: runResult.model,
    latencyMs,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Batch (= 1 day events のまとめ生成、 popcorn 防止 + cost cap)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Batch alterNote 生成 (= 1 day events の N 件を 並列度 5 で解決、 全揃ってから return)
 *
 * GPT 補正 (= popcorn 防止):
 *   - カード ごとに後から差し替わると UX が安っぽい
 *   - 1 day 分まとめて Promise.all 解決 → 呼出側 (= adapter) は一括 commit
 *
 * Cost cap:
 *   - contexts.length > ALTER_NOTE_MAX_CALLS_PER_VIEW (= 20) → 最初 20 件のみ LLM、 残りは "unavailable" (reason: cost_cap)
 *   - 同時実行 ALTER_NOTE_CONCURRENCY (= 5) で chunk 並列
 *
 * 戻り値:
 *   - contexts と同 index の結果配列 (= 1:1 対応)
 *   - 各 result は AlterNoteResult (= llm / unavailable のいずれか)
 *
 * Pure 性: contexts 入力 mutate なし、 各 ctx に対し generateAlterNote を呼ぶ
 */
export async function generateAlterNoteBatch(
  contexts: ReadonlyArray<AlterNoteContext>,
  options?: {
    readonly userId?: string;
    readonly sessionId?: string;
  },
): Promise<ReadonlyArray<AlterNoteResult>> {
  // flag OFF なら全 "unavailable" (= 即時 return、 LLM 呼ばない)
  if (!PLAN_FLAGS.alterNoteLive) {
    return contexts.map(() => ({ source: "unavailable" as const, reason: "flag_off" as const }));
  }

  if (contexts.length === 0) {
    return [];
  }

  // cost cap: 21+ 番目は cost_cap で skip
  const results: AlterNoteResult[] = new Array(contexts.length);
  const llmCandidateIndices: number[] = [];
  for (let i = 0; i < contexts.length; i += 1) {
    if (i >= ALTER_NOTE_MAX_CALLS_PER_VIEW) {
      results[i] = { source: "unavailable", reason: "cost_cap" };
      continue;
    }
    // 'other' は LLM 送らないが、 generator 内で category_other return される
    llmCandidateIndices.push(i);
  }

  // 並列度 5 で chunk 処理
  for (let chunkStart = 0; chunkStart < llmCandidateIndices.length; chunkStart += ALTER_NOTE_CONCURRENCY) {
    const chunkIndices = llmCandidateIndices.slice(chunkStart, chunkStart + ALTER_NOTE_CONCURRENCY);
    const chunkPromises = chunkIndices.map((i) => generateAlterNote(contexts[i]!, options));
    const chunkResults = await Promise.all(chunkPromises);
    chunkResults.forEach((r, idx) => {
      results[chunkIndices[idx]!] = r;
    });
  }

  return results;
}
