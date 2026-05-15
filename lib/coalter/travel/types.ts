/**
 * CoAlter Travel Domain — Pure Domain Types (T1 phase)
 *
 * 正本:
 *   - docs/coalter-travel-domain-greenfield-design.md (PR #124、design completion)
 *   - docs/coalter-master-design.md v1.2 §13.3 (Travel reflection)
 *
 * 役割:
 *   PR #124 (Travel domain greenfield design、1-2 泊国内 MVP) の T1 phase
 *   = **pure types only**。runtime function / detector / parser / generator
 *   / constants は **含まない** (CEO 新スピードルール、Batch-C 制約)。
 *
 * MVP scope (Master Design v1.2 §13.3、PR #124):
 *   - 1 泊 2 日 / 2 泊 3 日 国内旅行のみ
 *   - 海外旅行 / 任意期間 / API 予約連携 は **future scope** (型に含めない)
 *   - candidate 数 2-3 案、Pareto 最適集合
 *   - candidate = Itinerary Graph (場所 + 移動 + 時間 + 活動)
 *   - 比較軸: 予算帯 / 移動負荷 / 体験タイプ
 *
 * 構造的安全設計 (Gap 4 D2 contextDetector 継承):
 *   - rationale 等 string field は **caller 責任で PII filter**
 *     (本 type は format のみ規定、value 検証は caller / runtime layer)
 *   - MVP scope を **型レベル enforce**: `totalDays: 1 | 2` で 1-2 泊国内 限定
 *   - 海外旅行 / 任意期間 は型に含めない、future scope と JSDoc で分離
 *
 * 本 PR の不可触 (Batch-C 制約):
 *   - runtime function / detector / parser / scorer / generator / validator
 *   - constants array (`as const` 等の value)
 *   - orchestrator connection / route / API / env
 *   - ChatClient / UpperLayerMount / 既存 file touch
 */

// ─────────────────────────────────────────────
// TravelTimeSlot: 行程内の時間帯 (raw timestamp ではなく離散 enum)
// ─────────────────────────────────────────────

/**
 * Travel 行程内の時間帯。
 *
 * 注: raw timestamp / Date object ではなく、**離散 5 値の string literal union**。
 * 旅行行程の coarse-grained 時間表現として、calendar 操作 / UI 表示の base。
 */
export type TravelTimeSlot = "morning" | "noon" | "afternoon" | "evening" | "night";

// ─────────────────────────────────────────────
// TravelActivityType: 旅行 node の活動種別
// ─────────────────────────────────────────────

/**
 * Travel node の活動種別。
 *
 * MVP scope (1-2 泊国内):
 *   - sightseeing: 観光 (神社 / 美術館 / 自然 等)
 *   - meal: 食事 (朝食 / 昼食 / 夕食、food domain との handoff 検討)
 *   - lodging: 宿泊
 *   - transport: 移動 (transit、TravelMove と別)
 *   - experience: 体験 (温泉 / 工房 等)
 *   - rest: 休憩 / フリー時間
 *
 * future scope (本 MVP では除外):
 *   - shopping (海外 / 任意期間で導入検討)
 *   - business (出張、CoAlter scope 外)
 */
export type TravelActivityType =
  | "sightseeing"
  | "meal"
  | "lodging"
  | "transport"
  | "experience"
  | "rest";

// ─────────────────────────────────────────────
// TravelNodeType: Itinerary graph の node 役割
// ─────────────────────────────────────────────

/**
 * Travel Itinerary graph の node の役割。
 *
 * Itinerary は DAG (有向非循環 graph) として時間軸沿い、start から return へ。
 */
export type TravelNodeType =
  | "start"        // 出発地 / 出発時刻
  | "lodging"      // 宿泊 (1 泊目 / 2 泊目)
  | "destination"  // 主目的地
  | "activity"     // 活動 node
  | "meal"         // 食事 node (food domain handoff 検討)
  | "return";      // 帰着地 / 帰着時刻

// ─────────────────────────────────────────────
// TravelTransport: 移動手段 (MVP 国内限定)
// ─────────────────────────────────────────────

/**
 * 移動手段。
 *
 * MVP scope (国内限定):
 *   - train: 電車 (新幹線含む)
 *   - bus: 高速バス / 路線バス
 *   - car: 自家用車 / レンタカー
 *   - domestic_flight: 国内便
 *   - walk: 徒歩
 *
 * future scope (海外):
 *   - international_flight (国際線)
 *   - cruise / ferry / 等
 */
export type TravelTransport = "train" | "bus" | "car" | "domestic_flight" | "walk";

// ─────────────────────────────────────────────
// TravelBudgetBand: 予算帯 (point estimate ではなく band)
// ─────────────────────────────────────────────

/**
 * 予算帯。
 *
 * 設計原則 (Master Design v1.2 §13.3 + PR #124 Idea 7 Budget-risk Bands):
 *   - point estimate (single 数値) ではなく **band** (lo / hi / confidence)
 *   - confidence は 0-1、citation 強度や情報質を反映
 *
 * 単位: 円 (国内 MVP、海外通貨は future scope で別 type)。
 */
export interface TravelBudgetBand {
  /** 予算帯下限 (円、>= 0) */
  lo: number;
  /** 予算帯上限 (円、>= lo) */
  hi: number;
  /** confidence (0-1、citation / signal 強度) */
  confidence: number;
}

// ─────────────────────────────────────────────
// TravelFatigueLevel: 体力負荷 (1-5)
// ─────────────────────────────────────────────

/**
 * 体力負荷 level (Master Design v1.2 §13.3 + PR #124 Idea 6 Fatigue-aware Planning).
 *
 * Scale:
 *   - 1: very low (カフェ / 短時間休憩)
 *   - 2: low (散歩 / 美術館滞在 等)
 *   - 3: medium (短時間 hike / 観光地巡り)
 *   - 4: high (一日アクティブ)
 *   - 5: very high (登山 / 長時間 hike 等、MVP では基本回避)
 *
 * 数値 literal union で type レベル constraint。
 */
export type TravelFatigueLevel = 1 | 2 | 3 | 4 | 5;

// ─────────────────────────────────────────────
// TravelUncertaintyLabel: 不確実性 4 段階 (Master Design §3.4 Layer 5)
// ─────────────────────────────────────────────

/**
 * 不確実性 label (PR #124 Idea 8 Uncertainty Labeling).
 *
 * 各 candidate / field の信頼度を 4 値で表現:
 *   - high_confidence: citation 多 + retrieval 確実
 *   - mid_confidence: citation 中 + 部分的 retrieval
 *   - low_confidence: citation 少 + 推定中心
 *   - info_lacking: citation 0 + retrieval 失敗、追加調査推奨
 */
export type TravelUncertaintyLabel =
  | "high_confidence"
  | "mid_confidence"
  | "low_confidence"
  | "info_lacking";

// ─────────────────────────────────────────────
// TravelParetoAxis: Pareto 最適集合 axis (PR #124 Idea 3)
// ─────────────────────────────────────────────

/**
 * Pareto 最適 axis (PR #124 Idea 3 Pareto Optimal Trip Variants).
 *
 * 2-3 案を異なる軸で提示することで、二人の trade-off 議論を促す:
 *   - cheap_far: 安いが遠い
 *   - near_expensive: 近いが高い
 *   - balanced: 中間
 *   - slow_pace: ゆっくり (fatigue 低)
 *   - intense_pace: 詰め込み (fatigue 高)
 */
export type TravelParetoAxis =
  | "cheap_far"
  | "near_expensive"
  | "balanced"
  | "slow_pace"
  | "intense_pace";

// ─────────────────────────────────────────────
// TravelAnchorLevel: anchor vs wander (PR #124 Idea 15)
// ─────────────────────────────────────────────

/**
 * Anchor-and-Wander pattern (PR #124 Idea 15).
 *
 * 各 node に anchor (確定) / wander (柔軟) を tag:
 *   - anchor: 主目的地 (確定、変更困難)
 *   - wander: 仮確定 (現地で alternate options を提示可能)
 */
export type TravelAnchorLevel = "anchor" | "wander";

// ─────────────────────────────────────────────
// TravelConstraint: 制約 (red-line / hard / soft / preference)
// ─────────────────────────────────────────────

/**
 * Travel 制約 (PR #124 Idea 5 Veto / Red-line Constraints + Idea 13 Constraint Hierarchy).
 *
 * 制約を 4 層で表現:
 *   - red_line: 絶対不可 (例: 「金額上限」)
 *   - hard: 満たすべき (例: 「出発時刻」)
 *   - soft: 望ましい (例: 「温泉あり」)
 *   - preference: 考慮 (例: 「和食寄り」)
 */
export interface TravelConstraint {
  field: TravelConstraintField;
  severity: TravelConstraintSeverity;
  /**
   * 制約 description (人間可読、PII を含めない caller 責任).
   *
   * 例: "budget upper limit 50000 JPY" / "departure after 9:00am"
   *
   * 注: raw user message text を保存しない。caller が抽出した normalized description
   * のみ。
   */
  description: string;
}

export type TravelConstraintField =
  | "budget"
  | "time_window"
  | "distance"
  | "fatigue"
  | "weather"
  | "pair_preference"
  | "red_line_explicit";

export type TravelConstraintSeverity = "red_line" | "hard" | "soft" | "preference";

// ─────────────────────────────────────────────
// TravelMove: Itinerary graph の edge (移動)
// ─────────────────────────────────────────────

/**
 * Travel Itinerary graph の edge (node 間移動).
 */
export interface TravelMove {
  moveId: string;
  fromNodeId: string;
  toNodeId: string;
  transport: TravelTransport;
  /** 推定移動時間 (分、>= 0) */
  durationMinutes: number;
  costEstimate: TravelBudgetBand;
}

// ─────────────────────────────────────────────
// TravelNode: Itinerary graph の node
// ─────────────────────────────────────────────

/**
 * Travel Itinerary graph の node.
 *
 * 各 node = (時刻, 場所, 活動種別, 体力負荷, anchor/wander).
 */
export interface TravelNode {
  nodeId: string;
  type: TravelNodeType;
  /**
   * 場所 identifier (place_id 等).
   *
   * 注: raw address ではなく **place identifier** (caller 側で resolve)。
   * MVP では caller が place 文字列を渡す想定だが、型レベルでは opaque string。
   */
  placeId: string;
  startTime: TravelTimeSlot;
  endTime: TravelTimeSlot;
  activityType: TravelActivityType;
  fatigueLoad: TravelFatigueLevel;
  /** PR #124 Idea 15 (anchor / wander) */
  anchorLevel: TravelAnchorLevel;
}

// ─────────────────────────────────────────────
// TravelItinerary: Itinerary graph 全体 (DAG)
// ─────────────────────────────────────────────

/**
 * Travel Itinerary graph 全体 (PR #124 Idea 1 Itinerary Graph).
 *
 * **MVP scope 型レベル enforcement** (Master Design v1.2 §13.3):
 *   - `totalDays: 1 | 2` で 1-2 泊国内旅行 MVP のみ
 *   - `totalNights: 0 | 1 | 2`、日帰り 0 / 1 泊 1 / 2 泊 2
 *
 * 海外旅行 / 任意期間 (3 泊以上) は型に含まれない (future scope)。
 */
export interface TravelItinerary {
  itineraryId: string;
  nodes: TravelNode[];
  moves: TravelMove[];
  /** 1 泊 2 日 (1) / 2 泊 3 日 (2)、MVP scope (型レベル enforcement) */
  totalDays: 1 | 2;
  /** 0 (日帰り、本 MVP では基本外) / 1 (1 泊) / 2 (2 泊) */
  totalNights: 0 | 1 | 2;
  budgetBand: TravelBudgetBand;
  /** 行程全体の体力負荷 (各 node の max or 平均、caller 側で算出) */
  fatigueLevel: TravelFatigueLevel;
  uncertaintyLabel: TravelUncertaintyLabel;
}

// ─────────────────────────────────────────────
// TravelCandidateRationale: 候補の rationale (PR #124 Idea 10 Conflict Explanation)
// ─────────────────────────────────────────────

/**
 * Travel candidate の rationale (PR #124 Idea 10 + Idea 11 説明可能性).
 *
 * **PII 不含 caller 責任**: 本 type は format のみ規定。raw user preference
 * text を保存しないこと (caller / runtime layer 責任、本 type の comment で明示)。
 */
export interface TravelCandidateRationale {
  /**
   * user A 視点での選択理由 (caller 抽出済の normalized 説明、PII 不含).
   *
   * 例: "outdoor enthusiast preference, hot spring affinity"
   *
   * 注: 本 type は string 受領、raw user text を含めない caller 責任。
   */
  perUserA: string;
  /** user B 視点 (同上 PII 不含 caller 責任) */
  perUserB: string;
  /** 統合理由 (二人合意点の説明) */
  synthesis: string;
}

// ─────────────────────────────────────────────
// TravelCandidate: 候補 (itinerary + rationale + Pareto axis)
// ─────────────────────────────────────────────

/**
 * Travel candidate (PR #124 Idea 3 Pareto Optimal).
 *
 * Curate stage で 2-3 案を Pareto 最適集合として生成、各 candidate は異なる
 * Pareto axis で feature する。
 */
export interface TravelCandidate {
  candidateId: string;
  itinerary: TravelItinerary;
  rationale: TravelCandidateRationale;
  paretoAxis: TravelParetoAxis;
  /** 候補に適用された制約 list */
  appliedConstraints: TravelConstraint[];
}

// ─────────────────────────────────────────────
// Future scope (型に含めない、reader への明示):
// ─────────────────────────────────────────────
//
// - 海外旅行: TravelInternationalCandidate (別 type、海外通貨 + visa + passport 等)
// - 任意期間旅行: TravelExtendedItinerary (totalDays > 2)
// - API 予約連携: TravelBookingHandoff (楽天 / じゃらん / TripAdvisor 接続)
// - shopping / business: TravelActivityType に新値追加
// - Memory continuity (PR #124 Idea 18 一部): TravelTripHistory (Fairness Ledger 統合)
//
// → これらは本 MVP では含めない、future PR で追加 (各 phase T2-T7 + future)。
