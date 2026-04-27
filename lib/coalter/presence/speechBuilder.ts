/**
 * CoAlter Stage 2 — speechBuilder interface (L2-m)
 *
 * 正本: layout plan v0.3 §5.13 (interface のみ、実装は Stage 4)
 *
 * 本 phase の責務: Stage 4 LLM 合成導線で消費される **interface 層** の固定。
 * 実装は Stage 4 で `runStageBuildPresenceSpeech` 等の LLM 統合経路を追加する。
 *
 * 本 phase 不可侵:
 *   - LLM 呼び出しの実装は Stage 4 に委譲 (本 phase で touch しない)
 *   - 型定義 + stub のみ
 */

import { LENGTH_OVERRIDE_BY_VARIANT } from "./speechTypes";
import type {
  BuildPresenceSpeechInput,
  SpeechOutput,
} from "./speechTypes";

/**
 * Stage 4 で実装される speech 合成関数の interface。
 *
 * 本 phase の stub は Stage 4 まで `not-implemented` を投げる。
 * 呼び出し側 (Stage 3 試作 / Stage 4 統合) は本 interface を import して使う。
 *
 * Stage 4 実装時は以下を行う (本書では指示のみ):
 *   1. LLM 呼び出し (Anthropic / OpenAI 経由)
 *   2. speech template §3-§9 各 Pattern の prompt 適用
 *   3. validateSpeech (speechValidator) で禁止表現を除去
 *   4. LengthOverride 適用 (variant 別文長制約)
 *   5. tone カテゴリ付与 (UI spec §0.5)
 */
export async function buildPresenceSpeech(
  input: BuildPresenceSpeechInput,
): Promise<SpeechOutput> {
  // Stage 4 まで stub。呼び出し側は本関数を直接 await しない (Stage 3 試作は
  // mock で代替、Stage 4 で本実装)。
  void input;
  throw new Error(
    "buildPresenceSpeech is not implemented in Stage 2. Implementation " +
      "is deferred to Stage 4 (LLM 合成導線、layout plan v0.3 §5.13)",
  );
}

/**
 * Pattern 別の LengthOverride を返す helper (validator が消費)。
 */
export function getLengthOverride(
  variant: BuildPresenceSpeechInput["variant"],
) {
  return LENGTH_OVERRIDE_BY_VARIANT[variant];
}
