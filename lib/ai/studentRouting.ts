import "server-only";

import { STARGAZER_FLAGS } from "@/lib/stargazer/featureFlags";
import { hashSeedToPercent } from "./modelSelection";
import { isStudentProviderAvailable } from "./providers/student";
import type { RunAIParams } from "./types";

/**
 * Student Provider Routing
 *
 * v2 LoRA を Generation-only で分離運用するためのルーティング層。
 * Aneurasync の判断 OS（mode/shape/safety/personality）は上流で完了済み。
 * student provider は「確定済みの判断を自然文にレンダリングする」だけ。
 *
 * Phase 1 scope: stargazer_alter_response のみ
 *
 * 判定ステート (3値):
 *   eligible   — student に送る (canary 選出された)
 *   skipped    — eligible だが canary 除外 / prompt too long 等で送らない
 *                (telemetry に studentSkipped=true で記録)
 *   disabled   — そもそも対象外 (flag off / task_not_eligible / json_required / provider_unavailable)
 *                (telemetry に student 関連フィールドは残さない)
 *
 * skip と fallback は概念が違う:
 *   skip     — 事前判断で student を呼ばなかった
 *   fallback — student を呼んだが失敗したので stable に切り替えた
 */

/**
 * Phase 1: student provider に送る task_type の確定リスト
 *
 * Phase 2 候補 (将来):
 * - stargazer_alter_home
 * - stargazer_alter_letter
 * - stargazer_alter_letter_insight
 * - stargazer_aha_insight
 * - stargazer_pattern_narrative
 */
const STUDENT_ELIGIBLE_TASKS = new Set<string>([
  "stargazer_alter_response",
]);

/** v2 LoRA 訓練時の max_seq_length=2048。プロンプト余裕を見て chars ベースで判定 */
function getMaxPromptChars(): number {
  const raw = (process.env.STUDENT_PROVIDER_MAX_PROMPT_CHARS ?? "").trim();
  if (!raw) return 3000; // 日本語 ~1 char = 1.5 tokens 想定で safe
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return 3000;
  return value;
}

/** canary rollout 比率 (0-100)。デフォルト 10% */
function getRolloutPercent(): number {
  const raw = (process.env.STUDENT_PROVIDER_ROLLOUT_PERCENT ?? "").trim();
  if (!raw) return 10;
  const value = Number(raw);
  if (!Number.isFinite(value)) return 10;
  return Math.max(0, Math.min(100, Math.floor(value)));
}

export type StudentRoutingDecision =
  | {
      state: "eligible";
      reason: "canary_selected";
      rolloutPercent: number;
      assignmentBucket: number;
      seedSource: "user" | "session";
    }
  | {
      state: "skipped";
      reason:
        | "prompt_too_long"
        | "canary_excluded"
        | "no_stable_seed";
      // diagnostics
      rolloutPercent?: number;
      assignmentBucket?: number;
      promptChars?: number;
      maxPromptChars?: number;
    }
  | {
      state: "disabled";
      reason:
        | "flag_disabled"
        | "task_not_eligible"
        | "json_required"
        | "provider_unavailable";
    };

/**
 * student provider をどう扱うかを判定する
 *
 * 呼び出し元の runAI() で使用:
 *   - state="eligible" → student 先行試行（失敗時 fallback）
 *   - state="skipped"  → stable 直行、telemetry に studentSkipped 記録
 *   - state="disabled" → stable 直行、student 関連記録なし
 */
export function resolveStudentRouting(
  params: RunAIParams,
): StudentRoutingDecision {
  // Gate 1: feature flag
  if (!STARGAZER_FLAGS.useStudentProvider) {
    return { state: "disabled", reason: "flag_disabled" };
  }

  // Gate 2: task_type
  if (!STUDENT_ELIGIBLE_TASKS.has(params.taskType)) {
    return { state: "disabled", reason: "task_not_eligible" };
  }

  // Gate 3: requireJson (student は JSON 出力不可)
  if (params.requireJson) {
    return { state: "disabled", reason: "json_required" };
  }

  // Gate 4: provider availability
  if (!isStudentProviderAvailable()) {
    return { state: "disabled", reason: "provider_unavailable" };
  }

  // ここから先は「対象 task で provider も使える」状態。
  // skip 判定は disabled より後にやる（telemetry 意図の区別）。

  // Gate 5: prompt length (v2 LoRA max_seq_length=2048)
  const maxPromptChars = getMaxPromptChars();
  const promptChars = (params.prompt?.length ?? 0) + (params.systemPrompt?.length ?? 0);
  if (promptChars > maxPromptChars) {
    return {
      state: "skipped",
      reason: "prompt_too_long",
      promptChars,
      maxPromptChars,
    };
  }

  // Gate 6: canary rollout (stable assignment per user)
  // seed は userId 優先、無ければ sessionId。両方無ければ student に流さない
  // (リクエスト毎の random assignment は会話中に provider が揺れて体験崩壊するため)
  const rolloutPercent = getRolloutPercent();
  let seedSource: "user" | "session";
  let seed: string;
  if (params.userId && params.userId.trim()) {
    seedSource = "user";
    seed = `student:${params.userId.trim()}`;
  } else if (params.sessionId && params.sessionId.trim()) {
    seedSource = "session";
    seed = `student:session:${params.sessionId.trim()}`;
  } else {
    return { state: "skipped", reason: "no_stable_seed" };
  }

  const assignmentBucket = hashSeedToPercent(seed);
  if (assignmentBucket >= rolloutPercent) {
    return {
      state: "skipped",
      reason: "canary_excluded",
      rolloutPercent,
      assignmentBucket,
    };
  }

  return {
    state: "eligible",
    reason: "canary_selected",
    rolloutPercent,
    assignmentBucket,
    seedSource,
  };
}
