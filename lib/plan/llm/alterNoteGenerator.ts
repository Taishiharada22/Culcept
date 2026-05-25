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
  if (useV2Path) {
    // V2 path: 層を分けたまま PM 注入 + Phase framing
    const phaseGate = evaluatePhaseGate(ctx.personalModelV2!.meta.hdmPhase);
    const framingHint: PhaseFramingHint = phaseGate.framingHint;
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
    return { source: "unavailable", reason: "validation_failed" };
  }

  // 7. 通過 → llm result
  const latencyMs = Date.now() - startedAt;
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
