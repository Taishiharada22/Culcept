/**
 * L3 Expression Pipeline — Comprehension-First v1.3+ Wave 2
 *
 * 設計書: docs/alter-morning-comprehension-first-wave2-design.md §6
 *
 * 責務:
 *   L3.1 Narration → L3.2 Faithfulness Checker を連結し、
 *   違反検出時の retry (1回) → fallback (deterministic) の戦略を実装する。
 *
 * Wave 2 挙動:
 *   1. provider.narrate(input) → NarrationOutput
 *   2. checkFaithfulness(...) → violations[]
 *   3. violations.length == 0: そのまま返す
 *   4. violations.length > 0 かつ retry=0: feedback を添えて再度 narrate（retry=1）
 *   5. retry 後も違反残る: serializePlanDeterministic で最終 fallback
 */

import {
  type NarrationInput,
  type NarrationOutput,
  type NarrationProvider,
  stubNarrationProvider,
  serializePlanDeterministic,
} from "./narration";
import {
  checkFaithfulness,
  type FaithfulnessViolation,
} from "./faithfulnessChecker";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface L3PipelineResult {
  narration: NarrationOutput;
  violations: FaithfulnessViolation[];
  /** 何回目の試行で採用されたか（0=初回, 1=retry, 2=deterministic fallback） */
  attempt: 0 | 1 | 2;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Runner
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * L3 pipeline。違反検出時の retry+fallback 戦略を内部化する。
 *
 * @param input    Narration 入力
 * @param provider LLM provider（default: stub）
 */
export async function runL3Pipeline(
  input: NarrationInput,
  provider: NarrationProvider = stubNarrationProvider,
): Promise<L3PipelineResult> {
  // Attempt 0
  const narration0 = await provider.narrate(input);
  const v0 = checkFaithfulness({
    narration_text: narration0.text,
    covered_event_ids: narration0.covered_event_ids,
    comprehension: input.comprehension,
    timeline: input.timeline,
    grounded: input.grounded,
  });
  if (v0.length === 0) {
    return { narration: narration0, violations: [], attempt: 0 };
  }

  // Attempt 1 (retry with feedback)
  const narration1 = await provider.narrate({ ...input, feedback: v0 });
  const v1 = checkFaithfulness({
    narration_text: narration1.text,
    covered_event_ids: narration1.covered_event_ids,
    comprehension: input.comprehension,
    timeline: input.timeline,
    grounded: input.grounded,
  });
  if (v1.length === 0) {
    return { narration: narration1, violations: [], attempt: 1 };
  }

  // Attempt 2 (deterministic fallback)
  const fallback = serializePlanDeterministic(input);
  return { narration: fallback, violations: v1, attempt: 2 };
}
