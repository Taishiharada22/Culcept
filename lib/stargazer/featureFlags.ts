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

  /**
   * Perspective Engine: Web検索統合 kill switch（旧・後方互換用）.
   * 新設計では explicitSearchLive + implicitSearchLive に分割。
   * この値が true の場合、両方とも有効として扱う。
   * @deprecated explicitSearchLive / implicitSearchLive を使用
   */
  perspectiveEngineLive: process.env.STARGAZER_PERSPECTIVE_ENGINE_LIVE === "true",

  /**
   * Perspective Engine: Explicit Search（明示的検索要求）.
   * 「調べて」「検索して」「WEBで」等の明示要求を Phase/Trust に関係なく通す。
   * Quality Gate は常にセットで動作する（分離不可）。
   * env: STARGAZER_EXPLICIT_SEARCH_LIVE=true で有効化
   * @see docs/alter-perspective-engine-design.md
   */
  explicitSearchLive: process.env.STARGAZER_EXPLICIT_SEARCH_LIVE === "true"
    || process.env.STARGAZER_PERSPECTIVE_ENGINE_LIVE === "true",

  /**
   * Perspective Engine: Implicit Search（暗黙的検索判定）.
   * 外部知識依存・最新性依存・高リスクドメイン等の暗黙条件で検索を発火する。
   * Phase >= 1 かつ Trust >= 2 のゲートを通過した場合のみ動作。
   * Quality Gate は常にセットで動作する（分離不可）。
   * env: STARGAZER_IMPLICIT_SEARCH_LIVE=true で有効化
   * @see docs/alter-perspective-engine-design.md
   */
  implicitSearchLive: process.env.STARGAZER_IMPLICIT_SEARCH_LIVE === "true"
    || process.env.STARGAZER_PERSPECTIVE_ENGINE_LIVE === "true",

  /**
   * Chained Exploration: L1 Deep Dive 有効化.
   * L0 の Quality Gate が supplement を返した場合に、
   * 情報ギャップ分析 → 追加クエリ生成 → 追加検索 → マージを実行する。
   * env: PE_L1_ENABLED=true で有効化（デフォルト false）
   * @see docs/chained-exploration-design.md
   */
  peL1Enabled: process.env.PE_L1_ENABLED === "true",
} as const;
