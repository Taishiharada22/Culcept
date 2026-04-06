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
} as const;
