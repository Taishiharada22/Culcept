/**
 * T1A — Travel domain-neutral core types（**pure types only**・runtime 依存なし・未配線）
 *
 * 設計: docs/travel-mode-plan-os-extension-design.md §4.1/§4.2/§6 +
 *       docs/coalter-travel-domain-greenfield-design.md（18 アイデア）+
 *       CEO アーキテクチャ注記 2026-06-12（participant = 3 つの external/session source カテゴリ + self）
 *
 * このファイルの厳格な性質:
 *   - **型と as-const データ定数のみ**（関数・ロジック・I/O・runtime 副作用は一切なし）。
 *   - **domain-neutral**: CoAlter / 旧 talk / Culcept のいずれにも依存しない。
 *     travel core は「誰の希望か」を participantId で扱い、その participant が
 *     どのソース由来か（pair / relation / plan session）を**解釈しない**。
 *   - 配置: lib/shared/travel/（personalization と同じ shared 正本原則・UI ロジック禁止）。
 *   - solo（participants 1 名）と pair（2 名）の両方を表現できる。
 *
 * ★ CEO アーキテクチャ注記（最重要・型で担保）:
 *   将来の /plan CoAlter のパートナーが旧 /talk `coalter_pair_states` から来ると
 *   仮定しない。participant の出自は `ParticipantSourceRef` の discriminated union で
 *   **3 つの external/session source カテゴリ + first-party の self** に分離し、travel
 *   core はその中身を読まない（preference 供給は外部 port）。self は外部パートナー
 *   ソースではなく、当事者本人（単独 / セッション主体）のケースである点に注意。
 *
 * 18 アイデアのうち本 T1A で型化するもの: Itinerary Graph(1) / CSP severity(5,13) /
 *   Pareto tradeoff(3) / Fatigue load(6) / Budget band(7) / Uncertainty(8) /
 *   Anchor-and-Wander(15) / Reversal cost(18) / 説明 privacy 二層(M5・viewer-scoped)。
 *   比較 diff(14) / fairness(4,12) / temporal map は T4 で型追加（本 T1A では未定義）。
 */

// ─────────────────────────────────────────────────────────────────────────────
// §1 値ドメイン（as-const = リテラル union の正本。網羅性テストで lock）
// ─────────────────────────────────────────────────────────────────────────────

/** 行程ペース（Idea 16） */
export const PACE_VALUES = ["slow", "normal", "intense"] as const;
export type Pace = (typeof PACE_VALUES)[number];

/** 制約の強さ（Idea 5 Veto/Red-line・Idea 13 解決順序の入力） */
export const CONSTRAINT_SEVERITIES = ["red_line", "hard", "soft", "preference"] as const;
export type ConstraintSeverity = (typeof CONSTRAINT_SEVERITIES)[number];

/** 制約軸（greenfield §2.3 制約空間） */
export const CONSTRAINT_AXES = [
  "time",
  "budget",
  "distance",
  "fatigue",
  "weather",
  "preference",
  "crowd",
] as const;
export type ConstraintAxis = (typeof CONSTRAINT_AXES)[number];

/** ノードの確度（Idea 15 Anchor-and-Wander） */
export const NODE_CONFIDENCES = ["anchor", "wander"] as const;
export type NodeConfidence = (typeof NODE_CONFIDENCES)[number];

/** 移動手段（MVP 国内） */
export const TRANSPORT_MODES = ["walk", "train", "bus", "car", "domestic_flight", "other"] as const;
export type TransportMode = (typeof TRANSPORT_MODES)[number];

/** 活動種別 */
export const ACTIVITY_KINDS = [
  "depart",
  "arrive",
  "meal",
  "sightseeing",
  "lodging_checkin",
  "lodging_checkout",
  "onsen",
  "rest",
  "activity",
  "other",
] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

/** 不確実性ラベル（Idea 8 Uncertainty Labeling） */
export const UNCERTAINTY_LEVELS = ["high", "medium", "low"] as const;
export type UncertaintyLevel = (typeof UNCERTAINTY_LEVELS)[number];

/** 体力負荷（Idea 6 Fatigue-aware）。1=軽い〜5=重い */
export type FatigueLoad = 1 | 2 | 3 | 4 | 5;

/** 情報の可視性（M5 説明 privacy）。shared=両者可視 / private=本人のみ */
export type Visibility = "shared" | "private";

// ─────────────────────────────────────────────────────────────────────────────
// §2 値型
// ─────────────────────────────────────────────────────────────────────────────

/** 予算帯（Idea 7 Budget-risk Bands）。point estimate を持たない。MVP は円固定。 */
export interface BudgetBand {
  /** 下限（円） */
  lo: number;
  /** 上限（円） */
  hi: number;
  /** 0..1 */
  confidence: number;
  currency: "JPY";
}

/**
 * 場所参照。解決（座標・営業時間・写真）は外部（Google Places place_id 等）。
 * **生コンテンツは保持しない**（規約準拠: place_id / 緯度経度のみ可）。
 */
export interface PlaceRef {
  /** 内部正規化 ID */
  placeRefId: string;
  /** 外部 ID（place_id 等・保持可能なものだけ） */
  externalId?: string;
  /** 表示用ラベル（任意） */
  label?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// §3 Participant（domain-neutral・★ 3 つの external/session source カテゴリ + self）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * participant の出自。travel core は **kind を読まない**（discriminated union として
 * 受け取り、外部の preference port がこの ref を解決する）。
 * **3 つの external/session source カテゴリ + first-party の self** を分離:
 *   - self            … first-party（単独利用 / セッション主体）。external partner source ではない
 *   - talk_pair_member … [external/session ①] 旧 /talk CoAlter pair（coalter_pair_states）由来
 *   - culcept_relation … [external/session ②] Culcept 側の partner / relationship データ由来
 *   - plan_session     … [external/session ③] 新 CoAlterPlanSession.participants 由来
 */
export type ParticipantSourceRef =
  | { kind: "self"; userId: string }
  | { kind: "talk_pair_member"; pairStateId: string; userId: string }
  | { kind: "culcept_relation"; relationId: string; userId: string }
  | { kind: "plan_session"; planSessionId: string; userId: string };

/** participant の出自 kind の列挙（網羅性テスト用） */
export const PARTICIPANT_SOURCE_KINDS = [
  "self",
  "talk_pair_member",
  "culcept_relation",
  "plan_session",
] as const;
export type ParticipantSourceKind = (typeof PARTICIPANT_SOURCE_KINDS)[number];

export interface TravelParticipant {
  /** セッション内ローカル ID（source 非依存）。candidate / constraint はこれで参照する。 */
  participantId: string;
  source: ParticipantSourceRef;
  /** UI 表示用（任意・PII を持ち込まない方針） */
  displayLabel?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// §4 Itinerary Graph（Idea 1・time 軸に沿った DAG）
// ─────────────────────────────────────────────────────────────────────────────

export interface TravelNode {
  nodeId: string;
  /** その日の 00:00 からの分（0–1439・決定論。絶対時刻 / Date は持たない） */
  startMin: number;
  endMin: number;
  place: PlaceRef;
  activityKind: ActivityKind;
  budgetBand: BudgetBand;
  /** Idea 6 */
  fatigueLoad: FatigueLoad;
  /** Idea 15: anchor=確定 / wander=現地で alternate 提示余地 */
  nodeConfidence: NodeConfidence;
}

export interface TravelEdge {
  fromNodeId: string;
  toNodeId: string;
  transport: TransportMode;
  durationMin: number;
  cost: BudgetBand;
}

export interface TravelDay {
  /** 0-based */
  dayIndex: number;
  /** ISO date（caller 注入・決定論） */
  date: string;
  nodes: TravelNode[];
  edges: TravelEdge[];
}

export interface TravelItinerary {
  /** MVP は 1–2 泊 = 2–3 日 */
  days: TravelDay[];
}

// ─────────────────────────────────────────────────────────────────────────────
// §5 Constraint（Idea 5 severity・M5 visibility・owner は domain-neutral）
// ─────────────────────────────────────────────────────────────────────────────

/** 制約の持ち主。shared=両者合意 / participant=個人（participantId で参照） */
export type ConstraintOwner =
  | { kind: "shared" }
  | { kind: "participant"; participantId: string };

export interface TravelConstraint {
  constraintId: string;
  axis: ConstraintAxis;
  severity: ConstraintSeverity;
  owner: ConstraintOwner;
  /** M5: private 制約はプランの形に影響してよいが相手向け説明の根拠にしてはならない */
  visibility: Visibility;
  /**
   * 正規化済みの人間可読キー（例 "return_by:20:00" / "budget_max:30000" / "avoid:crowd"）。
   * 自由文・PII は持ち込まない。詳細パースは consumer（T2/T3）責務。
   */
  descriptor: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// §6 Candidate（Idea 3 Pareto / Idea 8 Uncertainty / Idea 18 Reversal / M5 rationale）
// ─────────────────────────────────────────────────────────────────────────────

/** Pareto トレードオフ軸（Idea 3）。各 0..1 正規化。 */
export interface TradeoffProfile {
  cost: number;
  distance: number;
  fatigue: number;
  experienceVariety: number;
}

/** 取消コスト（Idea 18） */
export interface ReversalCost {
  cancellable: boolean;
  /** ISO（任意） */
  deadline?: string;
  fee?: BudgetBand;
}

/**
 * 説明の二層（M5・M2-B-1 ViewerScopedText と整合）。
 * shared = 両者/相手向け（一般化・非帰属）。forParticipant = 本人向け（private 根拠を含み得る）。
 */
export interface ViewerScopedRationale {
  shared: string;
  /** participantId → 本人向け説明 */
  forParticipant: Record<string, string>;
}

export interface TravelCandidate {
  candidateId: string;
  /** 例「水辺とアートを楽しむ一日」 */
  title: string;
  tags: string[];
  itinerary: TravelItinerary;
  tradeoff: TradeoffProfile;
  /** この候補が満たす/参照する制約のスナップ */
  constraints: TravelConstraint[];
  rationale: ViewerScopedRationale;
  /** Idea 8 */
  uncertainty: UncertaintyLevel;
  reversal?: ReversalCost;
}

// ─────────────────────────────────────────────────────────────────────────────
// §7 Session-level core（domain-neutral・participants 1–2・solo 対応）
// ─────────────────────────────────────────────────────────────────────────────

/** モード（extension §4.2）。daily/travel は計画窓の差で、エンジン分岐ではない。 */
export const TRAVEL_MODES = ["daily", "travel"] as const;
export type TravelMode = (typeof TRAVEL_MODES)[number];

export type TravelPlanWindow =
  | { kind: "single_day"; date: string }
  | { kind: "range"; startDate: string; endDate: string; nights: 1 | 2 };

export interface TravelPlanScope {
  mode: TravelMode;
  window: TravelPlanWindow;
}

/**
 * travel core の最上位状態（domain-neutral）。CoAlter / plan / solo の各 surface は
 * これを consume する。participants は 1（solo）〜2。candidate は提示前は空も可。
 */
export interface TravelCorePlan {
  participants: TravelParticipant[];
  scope: TravelPlanScope;
  candidates: TravelCandidate[];
  /** 2 人合意 or solo 設定の pace（任意・未設定可） */
  pace?: Pace;
}
