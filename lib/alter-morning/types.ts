/**
 * Alter Morning Protocol — 型定義
 *
 * Alter画面でTodo/予定/コーデを統合管理するための型群。
 * 既存の OrbitTask (Origin) / EventContext (Calendar) と接続する。
 */

import type { EventType, VenueType, TransportMode, EventContext } from "@/app/(culcept)/calendar/_lib/vcTypes";
import type { ActivityCategory } from "./activityVocabulary";
import type { PlaceCategory } from "./placeTable";
import type { TimeConstraintType } from "./planState";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MainLocation — 場所はプラン生成の中核フィールド
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface MainLocation {
  /** 正規化ID（placeTable の id） */
  canonicalId: string;
  /** 表示ラベル（「マクドナルド」「図書館」等） */
  label: string;
  /** 場所カテゴリ */
  category?: PlaceCategory;
  /** 場所の取得元 */
  source: "user_explicit" | "user_inferred" | "alter_suggested";
  /** 場所の特性（placeTable から取得） */
  traits?: {
    indoor?: boolean;
    workFriendly?: boolean;
    studyFriendly?: boolean;
    noisy?: boolean;
    longStayOk?: boolean;
  };
  // ── Place detail (placeResolver / Places API 由来) ──
  /** 解決済みの正式名称（Places API / web search） */
  resolvedName?: string;
  /** 住所（表示用・bottom sheet で使用） */
  address?: string;
  /** Google Place ID */
  placeId?: string;
  /** 緯度（地図表示 / 移動時間計算） */
  lat?: number;
  /** 経度（地図表示 / 移動時間計算） */
  lng?: number;
  /**
   * 性質情報（bottom sheet 用）。
   *
   * CEO方針 2026-04-17:
   *   activity × place category で derive される。リコメンドの有無に限らず
   *   必要（仕事→コンセント、ミーティング→静かさ、ランチ→雰囲気）。
   *
   * 値は 3値: "yes" | "no" | "unknown"
   *   - "yes" : placeTable の traits から確度高く判定
   *   - "no"  : 明確に該当しない
   *   - "unknown" : 情報なし（UI で「情報なし」表示 or 非表示）
   */
  propertyHints?: PlacePropertyHints;
}

/**
 * 性質情報（activity 別に必要なスロット）。
 *
 * すべて optional。activity × placeCategory に応じて埋められる。
 * UI 側は activityCategory に応じて表示順を決める。
 */
export interface PlacePropertyHints {
  /** コンセント有無（仕事・勉強・カフェ） */
  outlets?: HintValue;
  /** Wi-Fi 有無（仕事・勉強・ミーティング） */
  wifi?: HintValue;
  /** 静かさ（ミーティング・勉強・読書） */
  quietness?: HintValue;
  /** 個室・プライベート感（ミーティング・デート） */
  private?: HintValue;
  /** 長時間滞在可否（仕事・勉強） */
  longStayOk?: HintValue;
  /** 屋内か屋外か（雨天判断・コーデ） */
  indoor?: HintValue;
  /** 雰囲気タグ（ランチ・ディナー・カフェ・デート） */
  atmosphere?: string;
  /** 予算レンジ（ランチ・ディナー） */
  budget?: string;
  /** 駐車場有無（買い物・外食） */
  parking?: HintValue;
  /** 予約推奨（ディナー・人気店） */
  reservationRecommended?: HintValue;
}

export type HintValue = "yes" | "no" | "unknown";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FlowContext — 1日の流れの文脈（「外で作業」「1日中」等）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface FlowContext {
  /** 外出するか */
  goOut?: boolean;
  /** 時間的な規模感 */
  durationHint?: "short" | "half_day" | "all_day";
  /** 確度（「多分」「たぶん」→ low） */
  certainty?: "high" | "medium" | "low";
  /** 開始タイミング（「これから」「午後から」等） */
  startWindow?: "now" | "morning" | "afternoon" | "evening" | "later";
  /** 主な移動手段（intent 段階で検出） */
  transport?: TransportMode;
  /** 終了・帰宅時刻（「18時に帰宅」→ "18:00"） */
  endTime?: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LocationStop — 場所列（経由地・訪問先・メイン場所）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface LocationStop {
  /** 場所ラベル（正規化済みまたはユーザー入力そのまま） */
  label: string;
  /** placeTableのID（解決できた場合） */
  canonicalId?: string;
  /** 場所の役割 */
  kind: "visit" | "stop" | "main";
  /** 順序 */
  order: number;
  /** placeTable のカテゴリ */
  category?: PlaceCategory;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// EndpointAnchor — 終点アンカー（「帰る」先の構造化）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * プランの終点を表す構造化アンカー。
 *
 * CEO方針:
 * - home固定禁止。ホテル、友人宅、パートナー宅等もあり得る
 * - 非自宅系は市区町村レベルで確認するルールを入れる
 * - 終点アンカーは次回プランの始点候補に継承する
 */
export type EndpointType =
  | "home"
  | "hotel"
  | "friend_home"
  | "partner_home"
  | "family_home"
  | "office"
  | "other";

export interface EndpointAnchor {
  /** 終点タイプ */
  type: EndpointType;
  /** 場所ラベル（「ホテルオークラ」「田中さんの家」等） */
  label: string;
  /** 市区町村レベルのエリア（非自宅系で移動時間計算に使う。「渋谷区」「新宿」等） */
  area?: string;
  /** placeTable のID（解決できた場合） */
  canonicalId?: string;
  /** 非自宅系で市区町村が未確認のとき true（clarify が必要） */
  needsAreaConfirm: boolean;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ParsedDayIntent — 構造化された1日の意図
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface ParsedTask {
  /** 正規化されたタスク名 */
  text: string;
  /** アクティビティカテゴリ */
  category?: ActivityCategory;
  /** 推定所要時間（分） */
  estimatedDurationMin: number;
  /** 元テキスト内でのマッチ位置（sequenceOrder 決定用） */
  textPosition?: number;
}

export interface ParsedFixedEvent {
  /** タイトル */
  title: string;
  /** 開始時刻（HH:mm） */
  startTime?: string;
  /** 一緒にいる人 */
  companion?: string;
  /** 予定の種別（コーデ提案用） */
  eventType?: EventType;
  /** 元テキスト内でのマッチ位置（sequenceOrder 決定用） */
  textPosition?: number;
}

export interface ParsedDayIntent {
  /** 主タスク（やること） */
  primaryTasks: ParsedTask[];
  /** 時間固定の予定 */
  fixedEvents: ParsedFixedEvent[];
  /** 1日の流れの文脈 */
  flowContext: FlowContext;
  /** メインの場所 */
  mainLocation?: MainLocation;
  /** 場所が各タスクに紐づく場合 */
  taskLocations?: Array<{ taskIndex: number; location: MainLocation }>;
  /** 場所の訪問順序（visit=経由 → main=滞在場所） */
  locationSequence?: LocationStop[];
  /** 対象日（「明日」→ +1、「明後日」→ +2 等。未指定なら today） */
  targetDate?: string;
  /** 終点アンカー（「帰る」が検出された場合）。プランの最終移動の到着地を構造化 */
  endpointAnchor?: EndpointAnchor;
  /** @deprecated returnDestination は EndpointAnchor に移行。後方互換用 */
  returnDestination?: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PlanItem — プランの1項目（予定 or Todo）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type PlanItemKind = "fixed" | "todo" | "travel";

export interface PlanItem {
  id: string;
  /** "fixed" = 時間が決まっている予定、"todo" = 柔軟に配置できるタスク、"travel" = 移動 */
  kind: PlanItemKind;
  /** 表示テキスト — what/who/where から自動生成。raw text を直接保存しない */
  text: string;
  /** 純粋なアクション名（「仕事」「買い物」「ミーティング」等） */
  what: string | null;
  /** 開始時刻（HH:mm）。fixedは必須、todoはプランニング後に付与 */
  startTime?: string;
  /** 所要時間（分）。Alterが仮置き or ユーザー修正後の値 */
  durationMin: number;
  /** 明示的な時間指定があるか（true = アンカー、スケジュール再計算で動かさない） */
  fixedStart: boolean;
  /** 入力順序（discourse marker 由来。0始まり連番） */
  orderHint: number;
  /** どのユーザー入力ターンで生成されたか（差分追加の判定用。0始まり） */
  sourceTurnIndex: number;
  /** 予定の種別（コーデ提案用）。fixed予定から推定 */
  eventType?: EventType;
  /** 誰と（予定テキストから自動推定 or ユーザー回答） */
  withWhom?: string;
  /** Origin OrbitTask と同期する場合のID */
  orbitTaskId?: string;
  /** 完了状態 */
  completed: boolean;
  /** 場所（タスクごとに紐づく場合） */
  location?: MainLocation;
  /** アクティビティカテゴリ（語彙テーブルからの正規化結果） */
  activityCategory?: ActivityCategory;
  /**
   * 時間制約タイプ（PlanSegment.timeConstraint.type 由来）。
   * buildDayPlan がウィンドウ制約や出発アンカーを尊重するために使う。
   */
  timeConstraintType?: TimeConstraintType;
  /**
   * 順序制約（locationSequence 由来）。
   * 0 始まりの整数。visit=0,1,... → main task=最後。
   * buildDayPlan は duration ソートの前にこの値でソートする。
   */
  sequenceOrder?: number;
  // ── travel 用フィールド ──
  /** 移動の出発地ラベル（kind: "travel" のみ） */
  travelFrom?: string;
  /** 移動の到着地ラベル（kind: "travel" のみ） */
  travelTo?: string;
  /** 移動手段（kind: "travel" のみ） */
  travelTransport?: TransportMode;

  // ── Alter 提案フィールド（Gap Fill Engine 由来） ──
  /** true = Alter が提案した soft proposal（ユーザー予定ではない） */
  proposal?: boolean;
  /** 提案理由（UI の「提案」タグに表示） */
  proposalReason?: string;
  /** 提案の taxonomy カテゴリ（ログ基盤: impression→accept/dismiss 結合用） */
  proposalTaxonomy?: string;

  // ── Place 詳細表示用（CEO方針 2026-04-17 plan display redesign） ──
  /**
   * Alter が場所をリコメンドした理由（proposal=true or alter_suggested 時）。
   * 例: 「仕事用ならスタバ渋谷が静かで作業しやすい」
   * bottom sheet で表示される。リコメンドではない場合は undefined。
   */
  recommendReason?: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MorningPlan — 1日のプラン全体
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface MorningPlan {
  date: string; // YYYY-MM-DD
  items: PlanItem[];
  /** 1日を通しての条件（コーデ提案用） */
  dayConditions: DayConditions;
  /** プラン作成時刻 */
  createdAt: string;
  /** ユーザーが確定したか */
  confirmed: boolean;
  /** メインの場所（プラン生成の中核フィールド） */
  mainLocation?: MainLocation;
  /** 1日の流れの文脈 */
  flowContext?: FlowContext;
  /** 構造化された元の意図（パース結果の保持用） */
  parsedIntent?: ParsedDayIntent;
  /** 終点アンカー（次回プランの始点候補に継承される） */
  endpointAnchor?: EndpointAnchor;
  /**
   * 出発アンカー（HH:mm）— 「8時に家を出る」等。
   * UI 側の recalculateSchedule が departure anchor を尊重するために必要。
   * buildDayPlan → MorningPlan → MorningPlanCard と伝播する。
   */
  departureTime?: string;
  /**
   * 到着アンカー（HH:mm）— 「18時に帰宅」等。
   * UI 側の recalculateSchedule が arrival anchor を尊重するために必要。
   */
  arrivalTime?: string;
  /**
   * Phase D: 推論で補完された項目の追跡。
   * transport / venue が未指定でも plan を組み、推論根拠を記録する。
   */
  autoInferred?: AutoInferredMap;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DayConditions — 1日を通しての条件（EventContextへの変換元）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface DayConditions {
  /** 主な移動手段 */
  mainTransport?: TransportMode;
  /** 場所の傾向 */
  venue?: VenueType;
  /** 雰囲気の希望（自由テキスト → formality / attention 等に変換） */
  moodText?: string;
  /** 誰と会うか（全体的に） */
  withWhom?: string;
  /** 複数イベントの比重（"work" | "date" | "balanced" 等） */
  eventWeight?: EventType | "balanced";
  /** 歩き量の推定 */
  estimatedWalkLevel?: "low" | "medium" | "high";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Sufficiency Gate — 情報充足判定
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type SufficiencyLevel = "sufficient" | "partial" | "insufficient" | "no_plan";

export interface SufficiencyResult {
  level: SufficiencyLevel;
  /** 推定できた項目 */
  resolved: {
    hasItems: boolean;
    transport: boolean;
    venue: boolean;
    mood: boolean;
    withWhom: boolean;
  };
  /** 不足している項目のリスト（Alterが聞くべきもの） */
  missingFields: MissingField[];
}

export type MissingField =
  | "transport"
  | "venue"
  | "mood"
  | "withWhom"
  | "location_area"; // 場所の市区町村レベルの確認が必要

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase D: AutoInferred — 推論で埋めた項目の追跡
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type InferenceConfidence = "high" | "medium" | "low";

/** 推論で埋めた単一フィールド */
export interface AutoInferredField<T = string> {
  /** 推論された値 */
  value: T;
  /** 推論の確信度 */
  confidence: InferenceConfidence;
  /** 推論の根拠（UIで「車で計算したよ」等に使用） */
  reason: string;
}

/** プラン生成時に推論で補完された項目のマップ */
export interface AutoInferredMap {
  transport?: AutoInferredField<TransportMode>;
  venue?: AutoInferredField<VenueType>;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LocationClarify — 場所未指定時の暗黙補完 / 質問ルール
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 場所未指定アイテムに対する clarify 判定結果。
 *
 * CEO方針:
 * - 前後が同エリアなら暗黙補完可
 * - 前後が別エリアなら質問
 * - 共同プラン化を見据えて participants / shared constraints に拡張しやすい構造
 */
export type LocationClarifyAction = "implicit_fill" | "ask" | "skip";

export interface LocationClarifyResult {
  /** 判定対象のアイテムID */
  itemId: string;
  /** アクション */
  action: LocationClarifyAction;
  /** 暗黙補完する場合のエリア名 */
  implicitArea?: string;
  /** 暗黙補完する場合の場所情報 */
  implicitLocation?: MainLocation;
  /** 質問する場合のテキスト */
  askQuestion?: string;
  /** 将来拡張: 共同プランの参加者制約 */
  participantConstraints?: Array<{
    participantId: string;
    constraintType: "must_be_at" | "prefer" | "avoid";
    location?: string;
  }>;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TaskDurationMemory — タスク所要時間の学習
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface DurationPattern {
  /** 最後に設定された時間（分） */
  lastDuration: number;
  /** 設定回数 */
  count: number;
  /** 平均時間（分） */
  avgDuration: number;
}

export interface TaskDurationStore {
  patterns: Record<string, DurationPattern>;
  /** ストアバージョン */
  version: number;
  updatedAt: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Follow-up / Journal — 頻度制御
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface FollowUpThrottle {
  /** 今日のフォロー回数 */
  dailyFollowUpCount: number;
  /** 最後にフォローした時刻（ISO） */
  lastFollowUpAt: string | null;
  /** 連続スキップ数 */
  consecutiveSkips: number;
  /** 今日の日付（リセット判定用） */
  date: string;
}

export interface JournalPromptState {
  /** 曜日別の記録頻度（0=日〜6=土、値は0-1の頻度） */
  journalDayPattern: number[];
  /** 連続辞退数 */
  consecutiveDeclines: number;
  /** 最後に誘導した日（YYYY-MM-DD） */
  lastPromptDate: string | null;
  /** 今日プランを作ったか */
  planCreatedToday: boolean;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Weekday Patterns — 曜日別パターン学習（Phase 4）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface WeekdayRecord {
  /** この曜日にプランを作った回数 */
  planCount: number;
  /** この曜日のタスク総数 */
  taskTotal: number;
  /** 完了タスク数 */
  taskCompleted: number;
  /** 途中タスク数 */
  taskPartial: number;
  /** 中止タスク数 */
  taskSkipped: number;
}

export interface WeekdayPatternStore {
  /** 曜日別レコード（index 0=日, 1=月, ..., 6=土） */
  weekdays: [WeekdayRecord, WeekdayRecord, WeekdayRecord, WeekdayRecord, WeekdayRecord, WeekdayRecord, WeekdayRecord];
  /** プラン作成総数（最小データ閾値の判定用） */
  totalPlans: number;
  /** 連続プラン作成日数（ストリーク） */
  currentStreak: number;
  /** 最後にプランを作った日（YYYY-MM-DD） */
  lastPlanDate: string | null;
  version: number;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Proactive Insights — プロアクティブ・インサイト（Phase 4）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type InsightType =
  | "weekday_strength"     // 調子がいい曜日の検出
  | "weekday_caution"      // 完了率が低い曜日の注意喚起
  | "streak"               // 連続プラン作成の称賛
  | "gentle_suggestion";   // タスク過多の検出

export interface ProactiveInsight {
  type: InsightType;
  message: string;
}

export interface InsightThrottleStore {
  /** インサイトタイプ別の最終表示日（YYYY-MM-DD） */
  lastShown: Partial<Record<InsightType, string>>;
  /** 今日インサイトを出したか */
  shownToday: string | null; // YYYY-MM-DD
  version: number;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Morning Protocol — オーケストレーション用
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type MorningPhase =
  | "greeting"           // 朝の挨拶
  | "collecting"         // やること・予定を収集中
  | "clarifying"         // 不足情報を聞いている
  | "plan_presented"     // プラン提示済み（確認待ち）
  | "plan_confirmed"     // プラン確定
  | "outfit_offered"     // コーデ提案オファー
  | "outfit_clarifying"  // コーデ用の不足情報を聞いている
  | "outfit_presented"   // コーデ表示済み
  | "completed"          // 朝のフロー完了
  | "skipped";           // planning不要（通常Alterフロー）

/**
 * ユーザーの性格軸スコア（プロアクティブ提案に使用）
 * alter route で解決済みの axisScores から、プラン提案に関連する軸だけ抽出して渡す。
 * 値域: -1.0（左極）〜 +1.0（右極）。0 = 未観測 or 中間。
 */
export interface PersonalityContext {
  /** 内向的(-1) ↔ 外向的(+1) */
  introvert_vs_extrovert?: number;
  /** 計画的(-1) ↔ 即興的(+1) */
  plan_vs_spontaneous?: number;
  /** 完成度重視(-1) ↔ 実用・前進重視(+1) */
  perfectionist_vs_pragmatic?: number;
  /** 一人で整理(-1) ↔ 人と回復(+1) */
  stress_isolation_vs_social?: number;
  /** 機能・合理(-1) ↔ 表現・情緒(+1) */
  function_vs_expression?: number;
  /** 慎重(-1) ↔ 大胆(+1) */
  cautious_vs_bold?: number;
  /** エネルギーリズム: 朝型(-1) ↔ 夜型(+1) — expansion 軸 */
  energy_rhythm?: number;
  /** 決断テンポ: 即断(-1) ↔ 熟慮(+1) — cognitive 軸 */
  decision_tempo?: number;
}

export interface MorningSession {
  /** セッションID */
  sessionId: string;
  /** 現在のフェーズ */
  phase: MorningPhase;
  /** 収集したユーザー入力（生テキスト） */
  rawInputs: string[];
  /** 構造化されたプラン */
  plan?: MorningPlan;
  /** 構造化された意図（パース結果） */
  parsedIntent?: ParsedDayIntent;
  /** v2 PlanState（LLMベースの構造化状態） */
  planStateV2?: import("./planState").PlanState;
  /** 充足判定結果 */
  sufficiency?: SufficiencyResult;
  /** パーソナライズメッセージ（「前回は90分で組んでたよ」等） */
  personalizeHints: string[];
  /** セッション開始時刻 */
  startedAt: string;
  /** ユーザーの性格コンテキスト（alter route から注入） */
  personalityContext?: PersonalityContext;
  /** 場所解決で確認が必要なセグメント（medium/low confidence） */
  pendingPlaceConfirmations?: Array<{
    segmentId: string;
    originalText: string;
    resolvedName?: string;
    confidence: "medium" | "low";
    candidates?: Array<{ name: string; address?: string }>;
  }>;
  /** ユーザーID（場所キャッシュ用） */
  userId?: string;
  /** ユーザーのエリア情報（場所解決用） */
  userArea?: string;
  /** ユーザーの都道府県（baseline 由来、location resolver 用） */
  userPrefecture?: string;
  /** ユーザーの市区町村（baseline 由来、location resolver 用） */
  userCity?: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Outfit Bridge — コーデ接続用
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface OutfitBridgeInput {
  plan: MorningPlan;
  /** 天気情報（APIから取得済み） */
  weather?: {
    tempMax: number | null;
    tempMin: number | null;
    condition: "sunny" | "cloudy" | "rain" | "snow";
    pop: number | null; // 降水確率
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// API Response — Alter APIからフロントへ返すデータ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface MorningProtocolResponse {
  /** 現在のフェーズ */
  phase: MorningPhase;
  /** Alterのテキスト返答 */
  message: string;
  /** プランデータ（plan_presented以降で付与） */
  plan?: MorningPlan;
  /** 追加質問（clarifyingフェーズ用） */
  clarifyQuestion?: string;
  /** パーソナライズヒント */
  personalizeHints?: string[];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// カテゴリ別デフォルト所要時間（分）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const DEFAULT_DURATION_MAP: Record<string, number> = {
  // 仕事・学習系
  仕事: 120,
  作業: 60,
  資料: 60,
  ミーティング: 60,
  会議: 60,
  勉強: 60,
  英語: 45,
  読書: 45,
  レポート: 90,
  // 生活系
  買い物: 30,
  掃除: 30,
  洗濯: 20,
  料理: 45,
  片付け: 30,
  // 通院・外出系
  歯医者: 60,
  病院: 90,
  美容院: 90,
  銀行: 30,
  役所: 60,
  // 運動・リフレッシュ
  ジム: 90,
  ランニング: 40,
  散歩: 30,
  ヨガ: 60,
  // 娯楽
  映画: 150,
  カフェ: 60,
  // 食事
  ランチ: 60,
  ディナー: 90,
  飲み会: 120,
  食事: 60,
  // デフォルト
  _default: 45,
};
