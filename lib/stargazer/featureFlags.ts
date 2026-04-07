/**
 * Stargazer Feature Flags
 *
 * Phase 1: 全フラグ false（opt-in）
 * Phase 3完了時: フラグ自体を削除し新ロジックに固定
 *
 * @see docs/design/stargazer-alter-axis-architecture.md §11-B
 */

export const STARGAZER_FLAGS = {
  /** 派生事実生成器を使うか（false = 旧top8） */
  useDerivedFacts: process.env.STARGAZER_USE_DERIVED_FACTS === "true",

  /** derived_factsをanalyticsに記録するか */
  logDerivedFacts: process.env.STARGAZER_LOG_DERIVED_FACTS === "true",

  /** axisRegistryからfallbackInsightを読むか */
  useRegistryFallbacks: process.env.STARGAZER_USE_REGISTRY_FALLBACKS === "true",

  /**
   * P4-6: Counterfactual Live Integration kill switch.
   * true = live 統合有効（adopted 候補を main prompt に注入）
   * false = 全ユーザーで無効化（gate PASS でも統合しない）
   * env: STARGAZER_COUNTERFACTUAL_LIVE=true で有効化
   */
  counterfactualLive: process.env.STARGAZER_COUNTERFACTUAL_LIVE === "true",
} as const;
