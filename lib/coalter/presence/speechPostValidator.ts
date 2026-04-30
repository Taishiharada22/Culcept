/**
 * CoAlter Stage 4 L4-i — Speech Post Validator
 *
 * 正本: layout plan v0.3 §7.9 / speech template §2 / §1.2.1
 *
 * LLM 出力に対する事後 validator。違反検出時は再生成 or fallback。
 *
 * Stage 2 L2-m で実装済の speechValidator を使用、再生成 logic を追加。
 *
 * 不可侵: §2 / §1.2.1 違反は ZERO 出力ポリシー。違反検出時:
 *   1. 再生成 (LLM に再 query、最大 2 回)
 *   2. fallback (静的 mock 文面で代替、§6.8 非判定性継承)
 */

import {
  validateSpeech,
  type SpeechViolation,
  type ValidateResult,
} from "./speechValidator";
import type { LengthOverride } from "./speechTypes";

export interface PostValidationResult {
  /** 最終的に採用された text (validation 通過後) */
  finalText: string;
  /** 何回 retry したか (0 = 1 発で通過、>=1 で再生成、-1 = fallback 採用) */
  retries: number;
  /** 各試行の violation 履歴 (debug 用) */
  attemptViolations: ReadonlyArray<ReadonlyArray<SpeechViolation>>;
  /** fallback に降りたか */
  fallbackUsed: boolean;
}

export interface PostValidateOptions {
  /** LLM 再生成関数 (test では mock) */
  regenerate: (attempt: number) => Promise<string>;
  /** fallback 文面 (regenerate が全失敗時に使う) */
  fallbackText: string;
  override: LengthOverride;
  /** 最大 retry 数 (default 2) */
  maxRetries?: number;
}

/**
 * LLM 1 次出力を validate、違反時は最大 maxRetries 回 regenerate。
 * すべて失敗した場合は fallbackText を採用 (fail-open)。
 */
export async function postValidateSpeech(
  initialText: string,
  options: PostValidateOptions,
): Promise<PostValidationResult> {
  const { regenerate, fallbackText, override, maxRetries = 2 } = options;
  const attemptViolations: SpeechViolation[][] = [];

  let currentText = initialText;
  let attempt = 0;

  // 初回 + 最大 maxRetries 回
  while (attempt <= maxRetries) {
    const result: ValidateResult = validateSpeech(currentText, override);
    attemptViolations.push([...result.violations]);
    if (result.ok) {
      return {
        finalText: currentText,
        retries: attempt,
        attemptViolations,
        fallbackUsed: false,
      };
    }
    if (attempt >= maxRetries) break;
    attempt++;
    try {
      currentText = await regenerate(attempt);
    } catch {
      // regenerate 失敗 → fallback
      break;
    }
  }

  // 全 retry 失敗 → fallback
  return {
    finalText: fallbackText,
    retries: -1,
    attemptViolations,
    fallbackUsed: true,
  };
}
