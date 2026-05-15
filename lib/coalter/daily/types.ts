/**
 * CoAlter Daily Dispatch — Pure Domain Types (DD1 phase)
 *
 * 正本:
 *   - docs/coalter-daily-domain-dispatch-design.md (PR #125、design completion)
 *   - docs/coalter-master-design.md v1.2 §13.7 (Daily × Domain dispatch reflection)
 *
 * 役割:
 *   PR #125 (Daily × Domain cross-axis dispatch、Alt D Hybrid 推奨) の DD1 phase
 *   = **pure types only**。runtime function / planner / router / orchestrator
 *   connection は **含まない** (CEO 新スピードルール、Batch-C 制約)。
 *
 * 3-Axes Orthogonal Architecture (Master Design v1.2 §13.6、PR #122):
 *   - **Axis A: Action Mode** (decision / negotiate / clarify / reflect) — 別 type
 *   - **Axis B: Presence Mode** (normal / daily / travel) — 既存 `PresenceMode`
 *     (lib/coalter/presence/types.ts:56)
 *   - **Axis C: Domain (Theme)** (movie / food / travel / activity / 等) —
 *     既存 `ConversationTheme` (lib/coalter/types.ts:248)
 *
 * **重要 — 3 軸混同回避** (PR #122 §1.4 + PR #125 §2):
 *   本 type group は **Daily mode (Axis B) × Domain (Axis C) の cross-axis
 *   dispatch のみを扱う**。Action Mode (Axis A) や Presence Mode 切替 logic は
 *   本 type の責務外 (各 type comment で明示)。
 *
 * 本 PR の不可触 (Batch-C 制約):
 *   - runtime function / planner impl / router impl / detector / parser
 *   - constants array (`as const`)
 *   - orchestrator connection / route / API / env
 *   - 既存 `PresenceMode` / `ConversationTheme` / `CoAlterMode` 既存 type touch
 *   - ChatClient / UpperLayerMount / movieOrchestrator / foodOrchestrator
 */

// ─────────────────────────────────────────────
// DailyDomain: Daily mode 内で対象になる Domain (Axis C 部分集合)
// ─────────────────────────────────────────────

/**
 * Daily mode 内で対象になる Domain.
 *
 * **3 軸混同回避**:
 *   - 既存 `ConversationTheme` (lib/coalter/types.ts:248) は 7 値
 *     (movie / food / travel / schedule / gift / activity / general)
 *   - **本 `DailyDomain` は Daily mode 内で実用組合せ 4 値に限定**
 *     (PR #125 §3.1 matrix で最頻度 4 種を抽出)
 *   - schedule / gift / general は Daily 内で頻度低、本 DD1 phase scope 外
 *
 * MVP scope: food + activity (核心)、movie + travel (2 番手)。
 */
export type DailyDomain = "food" | "movie" | "travel" | "activity";

// ─────────────────────────────────────────────
// DailyTimeSlot: Daily mode の時間軸 (raw timestamp ではなく離散 enum)
// ─────────────────────────────────────────────

/**
 * Daily mode 内の時間 slot.
 *
 * 注: raw timestamp / Date object ではなく、**離散 6 値の string literal union**。
 * Daily mode の coarse-grained 時間表現として、Daily planner の domain affinity
 * 判定 base (Daily Dispatch Idea 2 Time-slot based domain selection、PR #125 §3.2)。
 *
 * Travel `TravelTimeSlot` (5 値、deepnight なし) と独立、Daily 固有 6 値:
 *   - morning: ~10 時
 *   - noon: 10-15 時
 *   - afternoon: 15-19 時 (Travel と境界曖昧、Daily 内で分離)
 *   - evening: 15-19 時 (overlap、daily 内で詳細分割)
 *   - night: 19-23 時
 *   - deepnight: 23 時~ (sleep zone、推奨は避ける)
 */
export type DailyTimeSlot =
  | "morning"
  | "noon"
  | "afternoon"
  | "evening"
  | "night"
  | "deepnight";

// ─────────────────────────────────────────────
// DailyTargetWindow: Daily の対象時間範囲
// ─────────────────────────────────────────────

/**
 * Daily mode で扱う時間範囲.
 *
 *   - today: 今日中 ("今日何しよう")
 *   - tonight: 今夜 ("今夜何食べる")
 *   - tomorrow: 明日 ("明日何しよう")
 *   - this_weekend: 今度の週末 ("週末ちょっと出かけよう"、軽量 travel mode 境界)
 */
export type DailyTargetWindow = "today" | "tonight" | "tomorrow" | "this_weekend";

// ─────────────────────────────────────────────
// DailyPairAvailability: pair の availability
// ─────────────────────────────────────────────

/**
 * Pair の availability status.
 *
 * Daily planner が domain affinity / candidate filter で考慮:
 *   - both: 二人 available (full candidate space)
 *   - one_only: 片方のみ available (single-friendly candidate 優先)
 *   - unknown: 不明 (fail-closed default で full space、ただし confidence 低)
 */
export type DailyPairAvailability = "both" | "one_only" | "unknown";

// ─────────────────────────────────────────────
// DailyContext: Daily mode の時間文脈
// ─────────────────────────────────────────────

/**
 * Daily mode の時間 / pair context.
 *
 * Daily planner が DailyDomainRequest を生成する際の environment input。
 */
export interface DailyContext {
  timeSlot: DailyTimeSlot;
  targetWindow: DailyTargetWindow;
  isWeekend: boolean;
  pairAvailability: DailyPairAvailability;
}

// ─────────────────────────────────────────────
// DailyConstraintCarryOver: Daily 全体の制約 (各 domain に carry-over)
// ─────────────────────────────────────────────

/**
 * Daily 全体の制約 (PR #125 Idea 3 Constraint Carry-Over).
 *
 * Daily session 全体で保持、各 domain dispatch 時に request に carry-over。
 * 例: 「今夜 21 時帰宅」→ food curfew 19 時 + movie 21 時前終了。
 *
 * **PII / raw text 保存禁止 (caller 責任)**:
 *   - timeWindow は ISO 8601 timestamp (caller 抽出済 normalized form)
 *   - redLines は caller 抽出済の normalized constraint description (PII filter 必須)
 */
export interface DailyConstraintCarryOver {
  /** 予算上限 (lo / hi / confidence、円単位、>= 0) */
  budgetCeiling?: { lo: number; hi: number; confidence: number };
  /**
   * 時間範囲制約 (ISO 8601 形式、raw user text ではない).
   *
   * 例: { startISO: "2026-05-15T17:00:00+09:00", endISO: "2026-05-15T21:00:00+09:00" }
   */
  timeWindow?: { startISO: string; endISO: string };
  /**
   * Energy budget (pace 概念、PR #125 Idea 5 + Travel Idea 16 Pace Setting).
   *
   * 1 (very low、ゆっくり) - 5 (very high、詰め込み)。
   */
  energyBudget?: 1 | 2 | 3 | 4 | 5;
  /**
   * Red-line 絶対不可制約 (caller 抽出済 normalized description、PII 不含).
   *
   * 例: ["no alcohol", "avoid long walk"]
   *
   * 注: raw user message text ではない。caller / runtime layer で抽出 + normalize.
   */
  redLines?: string[];
}

// ─────────────────────────────────────────────
// DailyFairnessHint: cross-domain fairness 反映 (PR #125 Idea 4)
// ─────────────────────────────────────────────

/**
 * Daily 内連続選択 fairness 反映 (PR #125 Idea 4 Cross-domain fairness + Idea 16 Domain saturation).
 *
 * `coalter_fairness_ledger` から集約した bias_score + 直近 saturation 防止用 cooldown.
 */
export interface DailyFairnessHint {
  /**
   * 直近の bias_score (-1.0 to +1.0).
   *
   *   - +1.0: 完全 A 寄り (連続 A 選好)
   *   - -1.0: 完全 B 寄り
   *   - 0: balanced
   *
   * 単位: bias_score、`coalter_fairness_ledger` 同 scale。
   */
  recentBias: number;
  /**
   * 連続選択 saturation 回避用 cooldown domain list.
   *
   * 直近で連発した domain (例: 3 日連続 food) を cooldown、本 dispatch では低優先度に。
   */
  cooldownDomains: DailyDomain[];
}

// ─────────────────────────────────────────────
// DailyChainPosition: multi-domain chain 内位置 (PR #125 Idea 9 + Idea 12)
// ─────────────────────────────────────────────

/**
 * Multi-domain chain 内の位置 (PR #125 Idea 9 Plan as graph + Idea 12 Multi-domain dispatch).
 *
 * 1 Daily session で複数 domain を chain する場合 (例: 夕食 + 映画 → food → movie)
 * の各 request の chain 内位置を表現。
 *
 *   - index: 0-based position
 *   - total: chain 全長
 *   - prevDomain: 前 chain の domain (transition cost / context propagation 用)
 */
export interface DailyChainPosition {
  index: number;
  total: number;
  prevDomain?: DailyDomain;
}

// ─────────────────────────────────────────────
// DailyDomainRoutingReason: domain dispatch の理由 (PR #125 Idea 8 Explanation)
// ─────────────────────────────────────────────

/**
 * Daily planner が特定 domain に dispatch した理由 (PR #125 Idea 8 Explanation).
 *
 *   - explicit_keyword: user 明示 keyword 検出 (e.g., "食べたい" → food)
 *   - implicit_pattern: 暗黙 pattern (e.g., 時間帯 affinity)
 *   - fallback_default: 他 domain 該当なし、activity default
 *   - multi_domain_chain: chain 構成の一部 (e.g., 夕食 + 映画)
 *   - cross_domain_handoff: 他 domain への handoff event (PR #126 §4.4)
 */
export type DailyDomainRoutingReason =
  | "explicit_keyword"
  | "implicit_pattern"
  | "fallback_default"
  | "multi_domain_chain"
  | "cross_domain_handoff";

// ─────────────────────────────────────────────
// DailyDomainInferRationale: domain 推定 rationale (PR #125 §5.2)
// ─────────────────────────────────────────────

/**
 * Daily planner が domain 推定で使った signal の rationale.
 *
 * `confidence` は 0-1、`signals` は signal source code list、`alternates` は
 * 二位以下の domain 候補 (二人合意で別 domain にする場合の選択肢)。
 *
 * **PII 不含 caller 責任**: signal は code 文字列のみ、raw user text 不含。
 */
export interface DailyDomainInferRationale {
  /** 推定 confidence (0-1) */
  confidence: number;
  /**
   * Signal source code list (raw user text 不含、code のみ).
   *
   * 例: ["keyword_food_lexeme", "timeslot_evening", "history_food_recent"]
   */
  signals: string[];
  /**
   * 二位以下の domain 候補 (二人合意で別 domain にする場合の選択肢).
   */
  alternates: DailyDomain[];
}

// ─────────────────────────────────────────────
// DailyDomainRequest: Daily → Domain への dispatch request
// ─────────────────────────────────────────────

/**
 * Daily mode 内 Domain orchestrator への dispatch request (PR #125 §5.2 Alt D Hybrid).
 *
 * **3 軸混同回避**:
 *   - 本 type は **Axis B (Daily Presence Mode) × Axis C (Domain) cross-axis** のみ扱う
 *   - Action Mode (Axis A) は 各 Domain orchestrator 内で別途決定 (本 type 責務外)
 *   - Presence Mode 切替 logic (normal → daily 等) も本 type 責務外 (`modeReducer` 担当)
 *
 * Daily planner が user signal から本 request を生成、DomainRouter が dispatch、
 * Domain orchestrator が context-aware に candidate 生成する設計 (PR #125 §5.1)。
 */
export interface DailyDomainRequest {
  /** 主要 routing key (Axis C の 4 値部分集合) */
  domain: DailyDomain;
  /** Daily-specific 時間 / pair context */
  context: DailyContext;
  /** Daily 全体から carry-over される制約 */
  constraints: DailyConstraintCarryOver;
  /** cross-domain fairness 反映 */
  fairnessHints: DailyFairnessHint;
  /** multi-domain chain 内位置 (optional、単一 domain dispatch では undefined) */
  chainPosition?: DailyChainPosition;
  /** Routing 理由 (observability + Explanation 用) */
  routingReason: DailyDomainRoutingReason;
  /** Domain infer の rationale (signal source + alternate 候補) */
  inferRationale: DailyDomainInferRationale;
}

// ─────────────────────────────────────────────
// Future scope (型に含めない、reader への明示):
// ─────────────────────────────────────────────
//
// - DailyDomainResponse: 各 Domain orchestrator からの response (DD2/DD4 phase で別 type)
// - DomainOrchestrator function signature: pure function 型 (DD2 phase で別 file)
// - DomainRouterDeps: DI 経由 orchestrator 集約 type (DD2 phase で別 file)
// - Daily plan composition library: 共通 pattern (DD3 phase impl、PR #125 Idea 17)
// - Active vs Passive domain (PR #125 Idea 15): boolean field 追加検討
// - Domain affinity score (PR #125 Idea 11): per-domain score map
// - Domain transition cost (PR #125 Idea 13): cost matrix
//
// → これらは本 DD1 では含めない、future PR で追加 (各 phase DD2-DD6 + future)。
//
// 3 軸混同回避 reminder:
//   - Action Mode (Axis A) と本 type を結合しない
//   - Presence Mode (Axis B) 切替 logic は modeReducer に任せる
//   - 各 Domain runtime impl は 別 phase で個別実装、本 type は contract のみ
