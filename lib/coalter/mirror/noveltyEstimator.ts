/**
 * CoAlter AOO Phase B B-5a — Novelty Estimator (const placeholder)
 *
 * 正本:
 *   - 設計: docs/coalter-aoo-phase-b-mirror-channel-design.md (PR #164) §5
 *   - 実装計画: docs/coalter-aoo-phase-b-implementation-plan.md (PR #165) §5
 *
 * 役割 (B-5a 段階):
 *   `observationNovelty` (0..1) を返す **const placeholder**。
 *
 *   B-5a は **shadow mode foundation**: 厳密な novelty 計算は実装しない。
 *     - **0.5 (mid value)** を返す → Worth Gate (`>= WORTH_NOVELTY_MIN = 0.5`) を**ぎりぎり通過**
 *     - 実際の novelty は B-5b 以降で chat message bridge 経由で raw text 観察し計算 (将来)
 *
 *   **raw text 保存禁止** (CEO B-5a 仕様):
 *     - 本 file は raw text を受け取らない (引数なし)
 *     - 将来 B-5b で実装する場合も "計算後すぐ破棄" pattern 厳守
 *     - PII 一切非保持
 *
 * 設計判断: なぜ const 0.5 か:
 *   - B-5a の目的は engine wiring 確認 (shadow mode)
 *   - novelty を実計算すると raw text 観察 → PII 設計の rabbit hole
 *   - 0.5 は WORTH_NOVELTY_MIN (0.5) と一致、Worth Gate を「ぎりぎり通過」する境界値
 *   - これにより shadow mode で他の axes が unknown だと Observe Gate fail で STAY_SILENT、
 *     仮に他 axes が known になっても novelty 0.5 では ERV が SPEAK_THRESHOLD_BASE (0.75) 未達
 *   - 結果: shadow mode で MIRROR_CANDIDATE がほぼ生成されない (Phase B 北極星「黙る」と整合)
 *
 * No-Effect Contract:
 *   - pure / deterministic / side-effect-free
 *   - 引数なし、戻り値は const literal
 *   - 副作用ゼロ
 *   - raw text 受け取らない / 保存しない
 *   - PII 一切非保持
 */

/**
 * B-5a の novelty placeholder 値。
 *
 * `WORTH_NOVELTY_MIN` (0.5) と一致 → Worth Gate を「ぎりぎり通過」する境界値。
 * shadow mode で ERV が SPEAK_THRESHOLD_BASE 未達となるよう defensive 設計。
 */
const B5A_NOVELTY_PLACEHOLDER = 0.5 as const;

/**
 * observationNovelty を推定する pure function。
 *
 * **B-5a は const 0.5 placeholder のみ**:
 *   - 引数なし
 *   - 戻り値は固定 0.5
 *   - 将来 B-5b 以降で実差分計算に拡張予定 (raw text の use-then-discard pattern)
 *
 * @returns 0.5 (B-5a 固定値、`WORTH_NOVELTY_MIN` と一致)
 *
 * @example
 *   estimateNovelty()
 *     // → 0.5
 */
export function estimateNovelty(): number {
  return B5A_NOVELTY_PLACEHOLDER;
}

/**
 * **Test only**: placeholder 値を取得 (test verification 用)。
 *
 * @internal
 */
export function __getPlaceholderForTest(): number {
  return B5A_NOVELTY_PLACEHOLDER;
}
