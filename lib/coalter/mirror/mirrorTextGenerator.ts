/**
 * CoAlter AOO Phase B B-5b — Mirror Text Generator (deterministic, LLM-free)
 *
 * 正本:
 *   - 設計: docs/coalter-aoo-phase-b-mirror-channel-design.md (PR #164) §5 / §6.5
 *   - 実装計画: docs/coalter-aoo-phase-b-implementation-plan.md (PR #165) §2.5
 *
 * 役割 (B-5b 段階):
 *   `MirrorTextGeneratorInput` (enum / bucket / mode のみ) を受け取り、
 *   pre-vetted const template から **deterministic mapping** で 1 つ選んで返す。
 *
 * 設計原則:
 *   - **LLM 一切使わない**: 動的 string concat / 補間なし、const literal のみ返す
 *   - **deterministic**: 同入力で常に同 templateId を返す (test で reproducibility 保証)
 *   - **raw text 受理なし**: input 型に PII field が存在しない (caller も型上書けない)
 *   - **pure / no side-effect**: I/O / storage / log / event なし
 *   - **fail-closed**: bucket すべて unknown / travel mode → `kind: "not_applicable"`
 *
 * Mapping rules (B-5b 初期 canary 用、後 Phase で精緻化):
 *   1. mode === "travel" → not_applicable (travel では speak しない設計、B-0 §9.4)
 *   2. alignment / uncertainty / silenceBudget のいずれかが unknown → not_applicable
 *   3. silenceBudget low + uncertainty low → state_mirror_pause
 *   4. alignment strongly_negative or negative + uncertainty mid → state_mirror_unsettled
 *   5. alignment neutral + uncertainty mid → state_mirror_preverbal
 *   6. silenceBudget mid + uncertainty mid → state_mirror_holding
 *   7. else → state_mirror_threshold (fallback for neutral patterns)
 *
 *   注: silenceBudget high は呼ばれない (Worth Gate で先に block されている)
 *       uncertainty high も呼ばれない (Safe Gate で先に block されている)
 *       本 generator は decision が MIRROR_CANDIDATE のときのみ caller から呼ばれる前提
 *
 * 不可侵境界:
 *   - 既存 presence layer / observer layer / chat layer touch なし
 *   - B-1〜B-5a zero diff (本 file は新規)
 *   - LLM API / external API / fetch / DB 一切なし
 *   - raw text 一切受理しない (型レベル)
 */

import {
  MIRROR_TEXT_TEMPLATES,
  MIRROR_TEXT_TEMPLATE_BY_ID,
} from "./mirrorTextTemplates";
import type {
  MirrorTextGeneratorInput,
  MirrorTextGeneratorResult,
  VisibleMirrorTemplateId,
} from "./visibleMirrorTypes";

/**
 * `not_applicable` の reason 一覧 (`MirrorTextGeneratorResult` の reason field と同じ集合)。
 */
type NotApplicableReason =
  | "travel_mode"
  | "alignment_unknown"
  | "uncertainty_unknown"
  | "silence_budget_unknown"
  | "no_matching_template";

/**
 * Deterministic mapping logic (pure function、test 用に separated)。
 *
 * @param input - {@link MirrorTextGeneratorInput} (enum/bucket/mode のみ)
 * @returns matching template id、または mapping fail 時の reason
 */
function selectTemplateId(
  input: MirrorTextGeneratorInput,
):
  | { readonly kind: "matched"; readonly id: VisibleMirrorTemplateId }
  | { readonly kind: "not_applicable"; readonly reason: NotApplicableReason } {
  // (1) travel mode は B-0 §9.4 で speak しない
  if (input.mode === "travel") {
    return { kind: "not_applicable", reason: "travel_mode" };
  }

  // (2) 必須 bucket の unknown 早期 fail (fail-closed)
  if (input.alignmentBucket === "unknown") {
    return { kind: "not_applicable", reason: "alignment_unknown" };
  }
  if (input.uncertaintyBucket === "unknown") {
    return { kind: "not_applicable", reason: "uncertainty_unknown" };
  }
  if (input.silenceBudgetBucket === "unknown") {
    return { kind: "not_applicable", reason: "silence_budget_unknown" };
  }

  // (3) Deterministic mapping (priority-ordered if 連鎖)
  // - silenceBudget low + uncertainty low → pause
  if (
    input.silenceBudgetBucket === "low_0_to_30" &&
    input.uncertaintyBucket === "low_0_to_30"
  ) {
    return { kind: "matched", id: "state_mirror_pause" };
  }

  // - alignment strongly_negative/negative + uncertainty mid → unsettled
  if (
    (input.alignmentBucket === "strongly_negative" ||
      input.alignmentBucket === "negative") &&
    input.uncertaintyBucket === "mid_30_to_70"
  ) {
    return { kind: "matched", id: "state_mirror_unsettled" };
  }

  // - alignment neutral + uncertainty mid → preverbal
  if (
    input.alignmentBucket === "neutral" &&
    input.uncertaintyBucket === "mid_30_to_70"
  ) {
    return { kind: "matched", id: "state_mirror_preverbal" };
  }

  // - silenceBudget mid + uncertainty mid → holding
  if (
    input.silenceBudgetBucket === "mid_30_to_70" &&
    input.uncertaintyBucket === "mid_30_to_70"
  ) {
    return { kind: "matched", id: "state_mirror_holding" };
  }

  // - fallback: threshold (中立 / どちらにも当てはまらない pattern)
  return { kind: "matched", id: "state_mirror_threshold" };
}

/**
 * Mirror text を deterministic に生成する pure function。
 *
 * **生成経路**:
 *   1. {@link selectTemplateId} で input → templateId を決定
 *   2. matched なら template table から text を取得
 *   3. not_applicable なら kind: "not_applicable" を返す
 *
 * **絶対不変**:
 *   - LLM 呼出なし
 *   - external API / fetch なし
 *   - 動的 string concat / 補間なし (const template の text をそのまま返す)
 *   - I/O / storage / log なし
 *   - input mutation なし
 *
 * @param input - {@link MirrorTextGeneratorInput} (enum/bucket/mode のみ、PII なし)
 * @returns {@link MirrorTextGeneratorResult} (generated | not_applicable)
 *
 * @example
 *   generateMirrorText({
 *     mode: "normal",
 *     alignmentBucket: "neutral",
 *     uncertaintyBucket: "mid_30_to_70",
 *     silenceBudgetBucket: "low_0_to_30",
 *   })
 *   // → { kind: "generated", templateId: "state_mirror_preverbal", text: "..." }
 *
 *   generateMirrorText({
 *     mode: "travel",
 *     alignmentBucket: "neutral",
 *     uncertaintyBucket: "low_0_to_30",
 *     silenceBudgetBucket: "low_0_to_30",
 *   })
 *   // → { kind: "not_applicable", reason: "travel_mode" }
 */
export function generateMirrorText(
  input: MirrorTextGeneratorInput,
): MirrorTextGeneratorResult {
  const selection = selectTemplateId(input);

  if (selection.kind === "not_applicable") {
    return { kind: "not_applicable", reason: selection.reason };
  }

  const template = MIRROR_TEXT_TEMPLATE_BY_ID.get(selection.id);
  if (!template) {
    // 構造的に到達不能 (literal union + map populated from same const)
    // defensive fail-closed
    return { kind: "not_applicable", reason: "no_matching_template" };
  }

  return {
    kind: "generated",
    templateId: template.id,
    text: template.text,
  };
}

/**
 * **Test only**: 全 template が design-time grammar invariant を満たすかチェック。
 *
 * - 疑問符 (?, ？) を含まない
 * - 命令形末尾を含まない
 * - 共感演技句を含まない
 * - 提案形を含まない
 * - text.length ≤ 40
 *
 * 本 function を実装側でなく test 側から呼ぶことで、design-time invariant の
 * regression を検出する。
 */
export function __getAllTemplatesForTest(): ReadonlyArray<{
  readonly id: VisibleMirrorTemplateId;
  readonly text: string;
}> {
  return MIRROR_TEXT_TEMPLATES.map((t) => ({ id: t.id, text: t.text }));
}
