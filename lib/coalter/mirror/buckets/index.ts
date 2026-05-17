/**
 * CoAlter AOO Phase B — Mirror buckets barrel (B-3)
 *
 * 正本: docs/coalter-aoo-phase-b-implementation-plan.md (PR #165) §2.3
 *
 * 4 bucket pure function を一括 export する。
 *
 * 設計境界:
 *   - すべて pure / deterministic / side-effect-free
 *   - 入力は numeric / boolean / enum のみ (PII 非受理)
 *   - 副作用なし / I/O / network / storage / DOM / timer / log 一切なし
 *   - 既存 presence layer / observer / chat layer 一切 import しない
 *
 * B-4 ERV / Three-Gate engine は本 barrel から bucket function を import して使う想定
 * (B-3 では engine 未実装、本 barrel は宣言的 export のみ)。
 */

export { classifyAlignmentBucket } from "./alignmentBucket";
export { classifyUncertaintyBucket } from "./uncertaintyBucket";
export { classifySilenceBudgetBucket } from "./silenceBudgetBucket";
export { classifyPatternCategoryBucket } from "./patternCategoryBucket";
