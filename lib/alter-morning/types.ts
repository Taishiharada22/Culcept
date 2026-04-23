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
import type { SlotSharpness } from "./comprehension/eventSchema";
import type { TransportSegment } from "./transport/types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// W3-PR-8 Strict Confirmation — 確定度の型
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 設計書: docs/alter-morning-strict-confirmation-design.md §3
//
// `plan.status` は plan 全体の確定度、`item.confirmationState` は item 単位の
// 確定度。UI は両方を別々に描画する。
//
// 旧セッション / test fixture 互換のため optional で追加。adapter 通過後の
// item には normalize により必ず値が入る（normalizedPlanItem.ts 参照）。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * PlanItem 全体の確定度（plan.status と独立）。
 *
 *   - confirmed:    全 slot sharpness="fixed"、pendingClarify 対象外
 *   - needs_answer: pendingClarify.event_id === this.id（この item を直接質問中）
 *   - provisional:  それ以外で何らかの slot が vague/missing
 */
export type ConfirmationState = "confirmed" | "provisional" | "needs_answer";

/**
 * whereSharpness="vague" の sub-kind。
 *
 *   - anchor:         「甲府駅周辺」「近場」「〇〇市」— 文言そのものが位置情報
 *   - category_chain: 「スタバ」「カフェ」「図書館」— カテゴリ/チェーン
 *   - undecided:      「決めてない」「まだ」「たぶん」— 場所の実体なし
 *
 * UI は sub-kind ごとに表示を変える（設計書 §5.2）:
 *   - anchor:         文言残す、チップなし
 *   - category_chain: 文言残す + 「店舗暫定」チップ
 *   - undecided:      文言を描画せず `[場所未確定]` ラベルのみ
 */
export type WhereVagueSubKind = "anchor" | "category_chain" | "undecided";

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
// RecommendationIntent — W2-3 (CEO方針 2026-04-19)
// 「おすすめある？」「どこかいい店ない？」を generic_place と別経路で扱うための型
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Recommendation の発生源。
 *
 * - `explicit_ask`: ユーザーが「おすすめ？」「どこかいい所ない？」と明示的に頼んだ
 * - `implicit_gap`: 計画上必要だがユーザーが場所を決めきっていない（例: place=null だが activity=「ランチ」）
 * - `alter_initiated`: Alter が提案軸で候補を出した（Phase 2 以降で使う）
 */
export type RecommendationSource = "explicit_ask" | "implicit_gap" | "alter_initiated";

/**
 * Recommendation の解決戦略レイヤ。
 *
 * W2-3 時点で実装するのは anchor_proximity と category_only（将来に向けた型定義も含む）。
 * Stargazer 軸 / HDM Phase による重み付けは W2-5 Deep Context Injection で追加される。
 */
export type RecommendationStrategy =
  | "anchor_proximity"     // 近傍 anchor + カテゴリ（現在の placeSearchHint 経路と共通インフラ）
  | "category_only"        // アンカーなし。エリア（baseline/currentLocation）+ カテゴリのみ
  | "stargazer_weighted"   // 将来: Stargazer 軸で候補を重み付け
  | "relational_weighted"; // 将来: relational context（companion）で候補を重み付け

/**
 * Recommendation Intent — generic_place と独立した「提案を求めている」意図。
 *
 * generic_place との違い:
 *   - generic_place: 「図書館」「カフェ」— カテゴリは明示されているが特定の1件が不明（resolver が候補を単純に候補提示する）
 *   - RecommendationIntent: 「おすすめ」「いいとこ」— ユーザーは *自分で決める意思がない*。Alter/planner 側が納得できる候補を選ぶ責務を負う
 *
 * 経路分離の理由:
 *   1. 曖昧性の性質が違う。generic_place は「どれか1つ」を確定したい、recommendation は
 *      「良い1つ」を提案してほしい
 *   2. 解決戦略が違う。recommendation は Stargazer 軸・HDM Phase・companion で重み付けが必要
 *   3. UI/narrative が違う。generic_place は clarify、recommendation は proposal を提示する
 *
 * CEO ケース1 (2026-04-18 実機): 「カフェどこかいいとこある？」を LLM が generic_place として
 *   place="カフェどこかいいとこ" に突っ込んでしまい、recommendation 経路が機能しなかった。
 */
export interface RecommendationIntent {
  /** 発生源 */
  source: RecommendationSource;
  /**
   * カテゴリヒント（「カフェ」「レストラン」「バー」等）。
   * 無い場合（「どこかいいとこない？」のみ）は undefined。
   * その場合 activity から推測する（activity="ランチ" → category="レストラン"）。
   */
  categoryHint?: string;
  /**
   * 近傍 anchor ラベル（「サドヤ」「渋谷」等）。
   * 無ければ anchor なし（baseline / currentLocation 起点で探索）。
   */
  anchorHint?: string;
  /**
   * 雰囲気ヒント（「落ち着いた」「静かな」「デートっぽい」等）。
   * LLM 抽出時に会話の文脈から拾う。resolver が quality filter に使う。
   */
  qualityHint?: string;
  /** 元の発話（ログ / デバッグ用） */
  originalQuery: string;
  /**
   * 解決戦略。デフォルトは anchorHint の有無で決まる:
   *   - anchorHint あり → "anchor_proximity"
   *   - anchorHint なし → "category_only"
   * W2-5 以降で "stargazer_weighted" / "relational_weighted" を足す。
   */
  strategy: RecommendationStrategy;
  /**
   * 半径オーバーライド（メートル）。
   * 候補 0 件時にユーザーが「広げて」と応えた場合のみ設定。
   * デフォルトは category ごとのデフォルト半径を使う。
   */
  radiusOverrideM?: number;
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
  /**
   * duration の由来（CEO方針 2026-04-18 Bug 5-B）:
   *   - "user": ユーザーが明示した duration（例「12時〜13時」）→ 衝突時も短縮しない
   *   - "inferred" (または undefined): activity vocabulary / default 由来 → 衝突時に短縮可
   * 現時点で LLM extract は end-time 範囲を拾わないので常に "inferred"。
   * 将来 "12〜13時" 抽出が入ったら "user" を立てる。
   */
  durationSource?: "user" | "inferred";
  /**
   * 次の fixed anchor / window.end 衝突を避けるため duration を短縮したことを示すフラグ。
   * CEO方針 2026-04-18 Bug 5-B。UI で「短縮」注記を出したいときに使う。
   */
  durationShrunkByPlacement?: boolean;
  /**
   * W2-1 anchor-first planner (2026-04-19):
   *   window_* 制約付きの item が hard anchor で埋められて window.end までに収まらなかった場合、
   *   ロジックが「嘘の時刻」を付けない証として本フラグが立つ。
   *   startTime は undefined のままで、Safety Gate が plan_presented を止める。
   */
  cannotFitWindow?: boolean;
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

  // ── Block 2-(b): gapFillEngine × Places Nearby（CEO方針 2026-04-17）──
  /**
   * Gap-fill 提案（proposal=true）に対して Places API が返した近傍候補。
   *
   * 発動条件 (gapFillPlaceEnricher):
   *   - item.proposal === true かつ activityCategory が life_rest / social_meal
   *   - 近傍の hard anchor（anchorScore>=4 かつ resolvedLat/lng 有り）が存在
   *   - Places API キー有り
   *
   * 原則:
   *   - 勝手に採用しない（medium 相当）→ resolvedPlaceName はセットしない
   *   - 距離/近傍/往復ペナルティは objective function を流用（adjustCandidateScore）
   *   - top 1-3 件、placeId → address → name で dedupe
   *   - ユーザーが確認 / 選択するまで単なる添え物
   *
   * UI 側は「近くにこんなカフェあるよ」等の追加表示に使う。
   */
  proposedPlaceCandidates?: Array<{
    name: string;
    address?: string;
    placeId?: string;
    lat?: number;
    lng?: number;
    matchScore: number;
    /**
     * なぜこの場所が候補か（UI 表示用の短い理由）。
     * 例: 「ランチの近く・徒歩200m」「動線が自然」。
     * anchor ラベル + 距離 + 往復の自然さから生成される（speculation なし）。
     */
    recommendReason?: string;
    /** この候補を紐づけた anchor のラベル（表示用、例: 「ランチ」「打ち合わせ」） */
    anchorLabel?: string;
    /** anchor からの直線距離（m）。丸め済み。UI の「徒歩約 Xm」に使う。 */
    distanceM?: number;
  }>;

  // ── W3-PR-8 Strict Confirmation (2026-04-22) ──
  //
  // 設計書: docs/alter-morning-strict-confirmation-design.md §3.1
  //
  // optional: 旧セッション / test fixture の後方互換のため。
  // adapter 通過後は **必ず値が入る**（normalizePlanItem で保証）。
  // UI 側では `NormalizedPlanItem` 経由で strict に扱い、`??` fallback 禁止。

  /** item 全体の確定度（plan.status と独立） */
  confirmationState?: ConfirmationState;
  /** when slot の sharpness（eventSchema.computeWhenSharpness の結果） */
  whenSharpness?: SlotSharpness;
  /** where slot の sharpness（eventSchema.computeWhereSharpness の結果） */
  whereSharpness?: SlotSharpness;
  /** what slot の sharpness（eventSchema.computeWhatSharpness の結果） */
  whatSharpness?: SlotSharpness;
  /** whereSharpness="vague" 時のみ付与。anchor / category_chain / undecided */
  whereVagueSubKind?: WhereVagueSubKind;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MorningPlan — 1日のプラン全体
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * W3-PR-7 Commit 4: plan の確定度。
 *
 *   confirmed:   全 slot fixed、ASK なし。「これで行ける」plan
 *   needs_answer: pendingClarify あり、ユーザー回答待ちの仮の流れ
 *   provisional: ASK は無いが sharpness=vague 残存 / comprehension_failed 時の
 *                前ターン継承など、未確定要素を含む「仮の流れ」
 *
 * UI は status に応じて表示スタイル（点線・薄色・確定スタンプ等）を出し分ける。
 * 旧コードへの後方互換のため optional。未指定時は legacyAdapter が推定する。
 */
export type MorningPlanStatus = "confirmed" | "needs_answer" | "provisional";

export interface MorningPlan {
  date: string; // YYYY-MM-DD
  items: PlanItem[];
  /** 1日を通しての条件（コーデ提案用） */
  dayConditions: DayConditions;
  /** プラン作成時刻 */
  createdAt: string;
  /** ユーザーが確定したか */
  confirmed: boolean;
  /**
   * W3-PR-7 Commit 4: plan 確定度（3 値）。
   * 未指定の旧 session 互換のため optional。
   */
  status?: MorningPlanStatus;
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
  /**
   * W3-PR-10 Transport Staircase — canonical edge model（flag: ALTER_MORNING_TRANSPORT_V2）。
   * 隣接 event pair の両端 where.coordinates が揃った場合のみ生成される。
   * 揃わない pair は segment 不生成（heuristic placeholder 禁止、不完全情報で捏造しない）。
   * domain consumer（PR-13/14）はこの field を canonical source として読む。
   * persisted travel PlanItem は display cache 扱いであり canonical ではない。
   * flag OFF 時は field 自体を plan に含めない（conditional spread、byte-diff ゼロ保証）。
   */
  transportSegments?: TransportSegment[];
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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PendingClarify — W3-PR-7 Commit 2
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 設計書: docs/alter-morning-comprehension-first-wave3-pr7-design.md §3.4
//
// ターンをまたいで「直前に何を聞いたか」を保持するダイアログ状態。
// 次ターンの answerBinder はこの情報を使って、ユーザー返答を正しい event/slot に
// 書き込む（LLM 再 comprehension に頼らない bind）。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** PendingClarify が指し示す slot（書き込み対象） */
export type PendingSlot =
  | "when"
  | "where"
  | "what"
  | "transport"
  | "endpoint";

/**
 * 質問時の event スコープ情報。再表示・再質問時に「朝の仕事」等と
 * event を特定して聞き直せるようにする。
 */
export interface PendingClarifyScope {
  /** "朝" | "12:00" | "夜" | null（表示用ラベル） */
  timeLabel: string | null;
  /** "仕事" | "ランチ" | null */
  activityLabel: string | null;
  /** plan 内で何番目の event か（1 始まり、同時間帯複数時の曖昧解消用） */
  eventOrdinal: number;
}

export interface PendingClarify {
  /** 対象 event（resolveGaps が決めた primary_clarify.event_id） */
  event_id: string;
  /** 書き込み対象 slot */
  slot: PendingSlot;
  /**
   * 質問種別（answerBinder の解釈に使う）。
   * ClarifyKind と等価の string literal。cyclic import を避けるため string 型で持つ。
   */
  kind: string;
  /** 質問時の event スコープ情報（再表示・再質問用） */
  scope: PendingClarifyScope;
  /** 質問文（次ターンで再表示する場合用） */
  question: string;
  /** 質問したターンの ISO timestamp（staleness 判定用、将来拡張） */
  askedAt: string;
  /**
   * 意味不明応答の連続カウント。CEO 方針 2026-04-22:
   *   semantic_miss が 2 連続したら pending を破棄し fresh comprehension に戻す。
   *   system_miss は連続カウントしない（pending 維持）。
   */
  semanticMissCount?: number;
}

export interface MorningSession {
  /** セッションID */
  sessionId: string;
  /**
   * Pipeline バージョン識別子（W3-PR-5）。
   *   - undefined: 旧 processMorningMessage 経路（レガシー既存セッション）
   *   - "v2":      新 runMorningPipeline 経路（Comprehension-First v1.3+）
   * 将来 "v3" 以降に拡張することを前提に string literal union で開ける。
   * 明示フィールドにしているのは sessionId prefix 判定より brittle でないため。
   */
  pipelineVersion?: "v2";
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
    /**
     * GPT追加ルール 2026-04-17:
     *   Block 2-(c) find_near_anchor の候補 0 件時に UI が
     *   「範囲を広げる／別カテゴリで探す」の dedicated clarify を出せるよう、
     *   near-anchor 検索のコンテキストを乗せる（near_anchor 経路 かつ 0 件時のみ設定）。
     */
    nearAnchorContext?: {
      anchorLabel: string;
      searchCategory: string;
      radiusM: number;
    };
  }>;
  /** ユーザーID（場所キャッシュ用） */
  userId?: string;
  /** ユーザーのエリア情報（場所解決用） */
  userArea?: string;
  /** ユーザーの都道府県（baseline 由来、location resolver 用） */
  userPrefecture?: string;
  /** ユーザーの市区町村（baseline 由来、location resolver 用） */
  userCity?: string;
  /**
   * ユーザー自身が付けた base ラベル（「自宅」「実家」等）。
   * 2026-04-19 baseline 編集対応: profiles.baseline_home_label 由来。
   * Alter Narration が「{label} から」等と使うため sourceLabel に反映される。
   */
  userHomeLabel?: string | null;
  /**
   * baseline_home_lat/lng キャッシュ（2026-04-19 baseline 編集対応）。
   * profiles.baseline_home_lat/lng 由来。present なら resolveLayer1 が即返す。
   * NULL の場合は prefecture/city から runtime 解決。
   */
  userHomeLat?: number | null;
  userHomeLng?: number | null;
  /**
   * W3-PR-7 Commit 2: ダイアログ状態。
   * 直前ターンで発した clarify 質問の情報。次ターンの answerBinder が
   * ユーザー応答を正しい event.slot に bind するのに使う。
   */
  pendingClarify?: PendingClarify | null;
  /**
   * W3-PR-7 Commit 2: v2 pipeline が出した最後の events。
   * 次ターンで LLM 再 comprehension を飛ばす state 起点。
   * 「文字列連結で過去発話を再抽出」するレガシー方式を将来置換する土台。
   *
   * 型: ComprehensionEvent[]（cyclic import 回避のため unknown で持ち、
   * 実アクセス側で型ガード。serialization は JSON 互換のため lossless）。
   */
  persistedEvents?: import("./comprehension/eventSchema").Event[];
  /**
   * W3-PR-8 rev 3 Commit 13: DialogState v2（単一会話所有層）。
   *
   * 位置づけ:
   *   `ALTER_MORNING_DIALOG_STATE_V2=true` のときのみ reducer 経路が
   *   読み書きする optional field。flag OFF の間は undefined のまま放置される
   *   （既存 pendingClarify / persistedEvents 経路が全量処理）。
   *
   * 設計:
   *   - docs/alter-morning-strict-confirmation-design.md §3.7
   *   - docs/alter-morning-pr8-rev3-implementation-detail.md §1
   *
   * commit 13 段階では本 field を **読み書きするコードは存在しない**。
   * type landing のみ（後続 commit 14+ で reducer / route.ts が使う）。
   */
  dialogState?: import("./dialog/types").DialogState | null;
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
