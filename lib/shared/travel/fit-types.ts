/**
 * T11-B — Travel Fit Model 契約型（**pure types + as-const のみ**・未配線）
 *
 * 設計正本: docs/t11-travel-fit-model-plan.md（§3-§5・8レンズレビュー反映）
 *           docs/t11-travel-object-ontology.md（T11-A2・統一 StateEntity / facet / connection 横断層）
 *
 * 役割: ユーザ/グループ状態と旅行対象の**多層状態**を決定論で fit/mismatch/risk + 説明に変換する
 *       pure 層の **型契約**。「あなたの状態だからこの対象が合う」を説明付きで出す。
 *
 * オントロジー原則（T11-A2）を型で担保:
 *   - **統一 StateEntity**: 旅行対象は category 別の別物でなく単一多層スキーマのインスタンス。
 *     user(FitUserState) と entity(TravelObjectState) は同一 `TraitVector` 空間を共有。
 *   - **温泉は category でない**: `OnsenState`(host-agnostic 共有ブロック)を lodging/place/area の
 *     `onsenFacet` として attach（所属でなく facet 集合の共有）。
 *   - **connection は category でない**: `ConnectionState`(+AccessLeg/TransferNode/OrderingConstraint)
 *     は object 間の関係層。`route`/`connection` という Layer0 category は作らない。
 *   - Layer0 category = **占有 object のみ**: lodging | place | food | transport | area | activity | support。
 *
 * 厳格な性質:
 *   - 型・as-const データ定数のみ（関数・I/O・runtime 副作用なし）。
 *   - import は ./core-types の型のみ（Visibility / ViewerScopedRationale / BudgetBand）。
 *   - ★ proposal-types `FitLabel`(fit/stretch/conflict)とは **別軸別名** → `EntityFitGrade`。re-export/alias 禁止。
 */

import type { BudgetBand, Visibility, ViewerScopedRationale } from "./core-types";

// ═════════════════════════════════════════════════════════════════════════════
// §0 共通ラッパ（欠損 / 低確度 / 可視性を型区別）
// ═════════════════════════════════════════════════════════════════════════════

export type FitProvenance =
  | "explicit_user"
  | "form_input"
  | "profile_prior"
  | "relation_context"
  | "after_action"
  | "editorial"
  | "aggregated"
  | "inferred"
  | "default_assumed";

/** 観測値。null 形は「未観測（欠損）」を型レベルで区別する（confidence=0）。 */
export type Observed<T> =
  | { value: T; confidence: number; provenance: FitProvenance; visibility?: Visibility }
  | { value: null; confidence: 0; reason: "unobserved" };

/** 3 値（GTFS wheelchair / step-free と整合・unknown を明示値に） */
export type TriState = "yes" | "no" | "unknown";

// ═════════════════════════════════════════════════════════════════════════════
// §1 共有 TraitVector（user / entity 対称・M1 24 軸の MVP サブセット）
// ═════════════════════════════════════════════════════════════════════════════

export const SHARED_TRAIT_AXES = [
  "quietLively",
  "natureUrban",
  "classicTrendy",
  "intimateSocial",
  "minimalRich",
  "calmStimulating",
  "localPolished",
  "noveltyFamiliar",
  "aestheticPlain",
  "onsenWaterQuality",
  "photogenicStyle",
  "learningDepth",
] as const;
export type SharedTraitAxis = (typeof SHARED_TRAIT_AXES)[number];

/** trait 1 軸の値。visibility は user 側で private 選好を表すのに使う（default shared）。 */
export interface TraitValue {
  /** -1..1 */
  value: number;
  /** 0..1 */
  confidence: number;
  visibility?: Visibility;
}

/**
 * user と entity が**同一空間**で持つ trait。Partial = 観測済み軸のみ。
 * user に在り entity に欠ける軸は distance 加算でなく confidence 減算（§3.4 非対称欠落）。
 */
export type TraitVector = Partial<Record<SharedTraitAxis, TraitValue>>;

// ═════════════════════════════════════════════════════════════════════════════
// §2 負荷耐性軸 / entity 負荷軸 / 対称写像
// ═════════════════════════════════════════════════════════════════════════════

export const USER_TOLERANCE_AXES = [
  "paceTolerance",
  "mobilityTolerance",
  "fatigueSensitivity",
  "crowdTolerance",
  "weatherTolerance",
  "stairSlopeTolerance",
] as const;
export type UserToleranceAxis = (typeof USER_TOLERANCE_AXES)[number];

export const ENTITY_BURDEN_AXES = [
  "travelBurden",
  "morningBurden",
  "crowdNoise",
  "weatherFragility",
  "physicalLoad",
  "baggageBurden",
] as const;
export type EntityBurdenAxis = (typeof ENTITY_BURDEN_AXES)[number];

/** entity 負荷軸 → user 耐性軸（対称照合・非 opaque 公開写像） */
export const BURDEN_TOLERANCE_MAP: Record<EntityBurdenAxis, UserToleranceAxis> = {
  travelBurden: "mobilityTolerance",
  morningBurden: "fatigueSensitivity",
  crowdNoise: "crowdTolerance",
  weatherFragility: "weatherTolerance",
  physicalLoad: "stairSlopeTolerance",
  baggageBurden: "mobilityTolerance",
};

// ═════════════════════════════════════════════════════════════════════════════
// §3 Relationship / IntendedRole / hard constraint
// ═════════════════════════════════════════════════════════════════════════════

export const RELATIONSHIP_KINDS = ["romance", "family", "friends", "colleagues", "solo"] as const;
export type RelationshipKind = (typeof RELATIONSHIP_KINDS)[number];

export const TRAVEL_CATEGORIES = [
  "lodging",
  "place",
  "food",
  "transport",
  "area",
  "activity",
  "support",
] as const;
export type TravelCategory = (typeof TRAVEL_CATEGORIES)[number];

// --- category 別 role union（Layer2 roleAffinity のキー・網羅 lock） ---
export const LODGING_ROLES = ["base", "destination", "recovery", "work", "transit_hub", "luggage_base", "view", "food_destination", "romance"] as const;
export type LodgingRole = (typeof LODGING_ROLES)[number];
export const PLACE_ROLES = ["main_highlight", "filler", "photo", "culture_learning", "relaxation", "active", "social_hangout", "solitude"] as const;
export type PlaceRole = (typeof PLACE_ROLES)[number];
export const FOOD_ROLES = ["destination_meal", "refuel", "celebration", "local_discovery", "social_conversation", "quick_stop", "late_night_rescue", "breakfast_anchor"] as const;
export type FoodRole = (typeof FOOD_ROLES)[number];
export const TRANSPORT_ROLES = ["transfer", "scenic_experience", "work_mobile", "rest_recover", "flexible_autonomy", "micro_access"] as const;
export type TransportRole = (typeof TRANSPORT_ROLES)[number];
export const AREA_ROLES = ["container", "transit_hub", "ambience", "area_anchor", "luggage_base", "recovery_anchor"] as const;
export type AreaRole = (typeof AREA_ROLES)[number];
export const ACTIVITY_ROLES = ["experience_core", "seasonal_anchor", "recovery_experience", "thrill_experience", "learning_experience", "social_occasion", "spectacle_view", "filler_micro"] as const;
export type ActivityRole = (typeof ACTIVITY_ROLES)[number];
export const SUPPORT_ROLES = ["luggage_relief", "physiological_relief", "supply_relief", "cash_relief", "connectivity_relief", "rest_relief", "information_relief", "medical_relief", "reservation_gate", "ordering_anchor"] as const;
export type SupportRole = (typeof SUPPORT_ROLES)[number];

/** 全 entity role の和（roleAffinity / intendedRole の値域） */
export type AnyEntityRole =
  | LodgingRole | PlaceRole | FoodRole | TransportRole | AreaRole | ActivityRole | SupportRole;

/** 「この対象を何として扱いたいか」希望（category 整合・private 可） */
export interface IntendedRole {
  category: TravelCategory;
  role: AnyEntityRole;
  /** 0..1 重み */
  weight: number;
  /** 0..1 */
  confidence: number;
  visibility?: Visibility;
}

export const FIT_HARD_AXES = ["dietary", "allergy", "accessibility", "medical", "tattoo", "other"] as const;
export type FitHardAxis = (typeof FIT_HARD_AXES)[number];

/** 非交渉的制約（tolerance scalar から分離）。descriptor は正規化キー（"allergy:shellfish" 等）。 */
export interface FitHardConstraint {
  axis: FitHardAxis;
  descriptor: string;
  severity: "red_line" | "hard";
  visibility: Visibility;
  provenance: FitProvenance;
}

// ═════════════════════════════════════════════════════════════════════════════
// §4 FitUserState / FitSubject / FitContext
// ═════════════════════════════════════════════════════════════════════════════

export interface FitUserState {
  /** 負荷耐性（0..1・高=強い）。BurdenAxis と対称照合。 */
  tolerances: Partial<Record<UserToleranceAxis, number>>;
  /** 時間 0..1 */
  morningness?: number;
  nightOwl?: number;
  /** 資源 0..1（高=価格に敏感） */
  budgetSensitivity?: number;
  budgetBand?: BudgetBand;
  /** 選好（entity と同一 trait 空間） */
  traits?: TraitVector;
  /** 回復動態 */
  recoveryStyle?: "rest_to_recover" | "stimulation_to_recover" | "mixed";
  /** 0..1（高=過刺激に弱い） */
  overstimulationThreshold?: number;
  /** 何として扱うか（private 可） */
  intendedRoles?: IntendedRole[];
  /** 非交渉的制約 */
  hardConstraints?: FitHardConstraint[];
  /** fairness 用（per-participant の優遇度・-1..+1・pure input） */
  fairnessSensitivity?: number;
}

export type FitSubject =
  | { kind: "solo"; user: FitUserState }
  | { kind: "group"; participants: { participantId: string; state: FitUserState }[]; relationship: RelationshipKind };

/**
 * ★ 状態依存 modulator（CEO「細かく・状態依存」の核）。
 * disposition を一時 shift させるのみで trait は不変。external lookup を一切起こさない。
 * weatherSeverity / todayFatigueSpike は T7 と**同一スケール**（二重定義しない）。
 */
export interface FitContext {
  tripMode: "daily" | "travel";
  tripIntent: "recovery" | "exploration" | "social" | "work" | "romance";
  season?: "spring" | "summer" | "autumn" | "winter" | "rainy";
  timeOfDayBand?: "early_morning" | "morning" | "midday" | "afternoon" | "evening" | "night";
  dayType?: "weekday" | "weekend" | "holiday";
  expectedCrowdLevel?: { value: number; confidence: number };
  /** 0..1・T7 rain_or_weather と同一意味 */
  weatherSeverity?: number;
  /** -1..1・base からの逸脱 */
  todayEnergy?: number;
  /** 0..1・T7 fatigue severity と同一意味 */
  todayFatigueSpike?: number;
  visitDurationBudgetMin?: number;
  /** user 供給のみ（entity 価格断定でない） */
  budgetRedLine?: { maxHi: number; visibility: Visibility; ownerParticipantId: string | null };
}

// ═════════════════════════════════════════════════════════════════════════════
// §5 温泉 — host-agnostic 共有状態ブロック（category でなく facet）
// ═════════════════════════════════════════════════════════════════════════════

/** 環境省 鉱泉分析法指針 療養泉 10 分類 */
export const ONSEN_SPRING_TYPES = ["simple", "chloride", "bicarbonate", "sulfate", "co2", "iron", "acidic", "iodine", "sulfur", "radioactive"] as const;
export type OnsenSpringType = (typeof ONSEN_SPRING_TYPES)[number];

/** 観光庁 2024 タトゥー 3 類型（+ unknown） */
export type OnsenTattooPolicy = "allowed" | "covered_ok" | "private_only" | "prohibited" | "unknown";

/**
 * 温泉の状態（host=lodging/place/area に provenance 付きで attach）。
 * 同一語彙を facet と standalone object で共有。category 昇格しない（T11-A2 §2）。
 */
export interface OnsenState {
  springType?: Observed<OnsenSpringType>;
  /** 泉温 4 区分 */
  springTempBand?: Observed<"cold" | "low" | "warm" | "hot">;
  /** 液性 pH 5 区分 */
  liquidity?: Observed<"acidic" | "weak_acidic" | "neutral" | "weak_alkaline" | "alkaline">;
  /** 浸透圧 3 区分 */
  osmolarity?: Observed<"hypotonic" | "isotonic" | "hypertonic">;
  /** 掛け流し（係争域ゆえ断定せず confidence 付） */
  kakenagashi?: Observed<boolean>;
  bathTypes?: Observed<("open_air" | "indoor" | "private_kashikiri" | "large_communal" | "mixed_konyoku")[]>;
  scenicView?: Observed<"sea" | "mountain" | "river" | "garden" | "none">;
  /** タトゥー対応（intendedRole 無関係の入場可否） */
  tattooPolicy?: Observed<OnsenTattooPolicy>;
}

// ═════════════════════════════════════════════════════════════════════════════
// §6 connection — object 間関係層（category でない・T11-A2 §3）
// ═════════════════════════════════════════════════════════════════════════════

/** GTFS route_type 写像の MVP union */
export type AccessMode = "tram" | "subway" | "rail" | "bus" | "ferry" | "gondola" | "funicular" | "walk" | "car" | "air";
export type RouteLegKind = "firstMile" | "mainLeg" | "lastMile";

export interface AccessLeg {
  mode: AccessMode;
  legKind: RouteLegKind;
  timeMin: number;
  /** mainLeg の重み選択（firstMile/lastMile は legKind 重みを使う・default in_vehicle） */
  inVehicleKind?: "in_vehicle" | "wait" | "walk";
  // --- C5 拡張（additive・optional） ---
  walkingMin?: number;
  waitingMin?: number;
  boardingAlightingMin?: number;
  /** 0..1 着席確率・作業可・睡眠可・車窓価値・快適度（RouteComfortState へ集約） */
  seatProbability?: number;
  workability?: number;
  sleepability?: number;
  scenicValue?: number;
  comfort?: number;
}

/** GTFS transfers.txt transfer_type（0 推奨 / 1 timed / 2 min-time / 3 不可 / 4 in-seat / 5 in-station） */
export type GtfsTransferType = 0 | 1 | 2 | 3 | 4 | 5;
/** GTFS pathways pathway_mode（2=stairs が baggage 非線形の核） */
export type GtfsPathwayMode = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface TransferNode {
  transferType: GtfsTransferType;
  minTransferMin: number;
  pathwayMode?: GtfsPathwayMode;
  accessibilityBarrier?: boolean;
  // --- C5 拡張 ---
  /** 0..1 乗換複雑性・接続失敗リスク・案内分かりにくさ */
  transferComplexity?: number;
  missedConnectionRisk?: number;
  signageComplexity?: number;
}

export interface TerminalBurdenSpec {
  kind: "security" | "station_walk" | "check_in" | "fare_gate" | "immigration_placeholder" | "none";
  overheadMin: number;
  /** C5: 構内歩行 m / 行列ばらつき 0..1 */
  walkM?: number;
  queueVariance?: number;
}

/** C5: 荷物状態遷移（carried↔dropped・C4 superadditive と整合の交互作用 hook） */
export interface BaggageState {
  pieces?: number;
  spatialOccupancy?: number;
  weightBurden?: number;
  droppedState?: "carried" | "dropped";
  stairInteraction?: number;
  crowdInteraction?: number;
}

/** C5: 荷物 drop 可否（locker/hotel/delivery） */
export interface LuggageDropAffordance {
  locker?: boolean;
  hotel?: boolean;
  delivery?: boolean;
}

/** C5: 信頼性（PTI placeholder・実 API 無・全 field 推定値） */
export interface RouteReliabilityState {
  /** Planning Time Index（0..1 正規化推定・95%ile/free-flow 思想・実時刻断定でない） */
  planningTimeIndex?: number;
  bufferIndex?: number;
  delayRisk?: number;
  weatherVulnerability?: number;
  seasonalSuspensionRisk?: number;
  transferFragility?: number;
  lastDepartureFragility?: number;
  /** C6.1: 代替経路の余裕（strand risk を緩和・推定値） */
  fallbackAvailability?: number;
}

/** C5: 移動快適性（seat/work/sleep/scenic 集約） */
export interface RouteComfortState {
  seatProbability?: number;
  workability?: number;
  sleepability?: number;
  scenicValue?: number;
  comfort?: number;
}

/** C5: tripIntent×role で route 価値を変調（説明材料・推薦権限ではない） */
export interface RoutePurposeModifier {
  tripIntent?: "recovery" | "exploration" | "social" | "work" | "romance";
  emphasizeWorkability?: boolean;
  emphasizeSleepability?: boolean;
  emphasizeScenic?: boolean;
}

/** C5: 到着時残存エネルギー（arrivalFreshness 構築子へ供給） */
export interface ArrivalFreshnessState {
  residualEnergy?: number;
  cumulativeRouteFatigue?: number;
}

/** object と object の「間」に置く横断状態。fromRef/toRef は placeRefId。 */
export interface ConnectionState {
  fromRef: string;
  toRef: string;
  legs: AccessLeg[];
  transferNodes: TransferNode[];
  terminals?: TerminalBurdenSpec[];
  /** 荷物（空間占有で非線形・terminal×混雑の交互作用項） */
  baggage?: { pieces?: number; spatialOccupancy?: number };
  // --- C5 拡張 ---
  baggageState?: BaggageState;
  dropAffordance?: LuggageDropAffordance;
  reliability?: RouteReliabilityState;
  comfort?: RouteComfortState;
  airportToCityBurden?: { applicable: boolean; accessMin?: number };
  stationToHotelBurden?: { walkMin?: number; transferToHotel?: boolean };
}

export const ORDERING_KINDS = [
  "must_precede",
  "luggage_drop_enables",
  "reorderable",
  "derive_shortest_from_terminal",
  // --- C5 拡張: lock 群（carry のみ・solver が並べる・scheduling 権限なし） ---
  "timed_entry_lock",
  "last_departure_lock",
  "open_hours_window_lock",
  "checkin_window_lock",
  "checkout_window_lock",
  "meal_time_lock",
  "reservation_window_lock",
] as const;
export type OrderingKind = (typeof ORDERING_KINDS)[number];

/** object 間 dependency/ordering（itinerary 実装でなく状態 carrier・T11-A2 §7） */
export interface OrderingConstraint {
  kind: OrderingKind;
  subjectRef: string;
  objectRef: string;
  relaxable: boolean;
}

/** door-to-door 評価の容器（connection + ordering） */
export interface RouteChainState {
  connection: ConnectionState;
  ordering?: OrderingConstraint[];
  purpose?: RoutePurposeModifier;
}

/** C5: ConnectionState 由来の派生観測（★実観測でなく派生値・live route data でない） */
export const ROUTE_DERIVED_PROVENANCE = "derived_from_connection_state" as const;
export interface RouteDerivedObservation {
  value: number;
  confidence: number;
  /** ★ 派生値であることを明示（live observed と混同させない） */
  provenance: typeof ROUTE_DERIVED_PROVENANCE;
}

// ═════════════════════════════════════════════════════════════════════════════
// §7 entity hard profile（user の FitHardConstraint と照合する entity 側の事実状態）
// ═════════════════════════════════════════════════════════════════════════════

export interface EntityHardProfile {
  /** 食物アレルゲン対応（外食は表示義務外＝default unknown は満たさず扱う） */
  allergens?: {
    handling: "handled" | "not_handled" | "unknown";
    /** 安全提供できる allergen descriptor（"shellfish" 等） */
    safe?: string[];
    /** 含有 allergen */
    present?: string[];
  };
  accessibility?: { stepFree?: TriState; wheelchair?: TriState; noSteepSlope?: TriState };
  /** 温泉/施設のタトゥー方針（OnsenState と整合・施設単位の hard） */
  tattooPolicy?: OnsenTattooPolicy;
  dietary?: { supports?: string[]; handling?: "handled" | "not_handled" | "unknown" };
  medical?: { exertionSafe?: TriState };
}

// ═════════════════════════════════════════════════════════════════════════════
// §8 category 別 rich attributes（Layer0.5・whyFits の実体）
// ═════════════════════════════════════════════════════════════════════════════

export const LODGING_SUBTYPES = ["ryokan", "business_hotel", "resort", "luxury", "guesthouse", "onsen_inn", "boutique", "capsule", "minpaku"] as const;
export type LodgingSubtype = (typeof LODGING_SUBTYPES)[number];
export interface LodgingRich {
  subtype?: LodgingSubtype;
  amenities?: Observed<("onsen" | "open_air_bath" | "sauna" | "private_bath" | "gym")[]>;
  /** 温泉は facet として attach（category 化しない） */
  onsenFacet?: OnsenState;
  mealStyle?: Observed<"in_room" | "private_dining" | "communal" | "breakfast_only" | "none">;
  viewType?: Observed<"sea" | "mountain" | "garden" | "cityscape" | "none">;
  soundproofing?: Observed<number>;
  serviceStyle?: Observed<"attentive" | "standard" | "minimal">;
  accessStyle?: Observed<"walkable_from_station" | "shuttle" | "car_required">;
  /** ★ luggage_base carrier */
  dropAffordance?: { earlyCheckinPossible?: Observed<boolean>; luggageHoldBeforeCheckin?: Observed<boolean> };
}

export const PLACE_SUBTYPES = ["onsen_day_use", "shrine_temple", "museum_gallery", "history_district", "nature_park", "viewpoint", "shopping_commercial", "foodie_street", "theme_park", "nightlife", "contemplative"] as const;
export type PlaceSubtype = (typeof PLACE_SUBTYPES)[number];
export interface PlaceRich {
  subtype?: PlaceSubtype;
  /** 日帰り温泉は lodging と同語彙 OnsenState を共有 */
  onsenFacet?: OnsenState;
  experienceDensity?: Observed<number>;
  typicalDurationMin?: Observed<number>;
  seasonalPeak?: Observed<("spring" | "summer" | "autumn" | "winter")[]>;
  timeOfDayBest?: Observed<FitContext["timeOfDayBand"][]>;
  photogenicStyle?: Observed<("nature" | "architecture" | "nightscape" | "food")[]>;
  learningDepth?: Observed<number>;
  physicalLoad?: { stairs?: Observed<number>; slope?: Observed<number>; walkingKm?: Observed<number> };
}

export const FOOD_SUBTYPES = ["washoku_kappo", "sushi", "ramen_noodle", "yakiniku_grill", "izakaya", "western_dining", "italian_french", "asian_ethnic", "cafe_teahouse", "bakery_sweets", "bar_pub", "fastfood_chain", "buffet_viking", "local_specialty", "generic_food"] as const;
export type FoodSubtype = (typeof FOOD_SUBTYPES)[number];
export interface FoodRich {
  subtype?: FoodSubtype;
  cuisineSystem?: Observed<string>;
  format?: Observed<"course_fixed" | "a_la_carte" | "counter_omakase" | "casual">;
  priceTier?: Observed<"low" | "mid" | "high" | "luxury">;
  reservationDifficulty?: Observed<"walk_in" | "recommended" | "required" | "members_only">;
  stayDurationBand?: Observed<"under_30min" | "30_60" | "60_120" | "over_120">;
  /** 会話適性 */
  conversationSuitability?: Observed<number>;
  /** 量 */
  portionWeight?: Observed<"small" | "standard" | "heavy">;
  comfortFood?: Observed<boolean>;
}

export const TRANSPORT_SUBTYPES = ["rail", "air", "road_public", "private_vehicle", "water", "active_human"] as const;
export type TransportSubtype = (typeof TRANSPORT_SUBTYPES)[number];
export interface TransportRich {
  subtype?: TransportSubtype;
  mode?: AccessMode;
  scenicValue?: Observed<number>;
  seatComfort?: Observed<number>;
  workability?: Observed<boolean>;
  /** 運転負荷（car/rental 固有・他 mode に無い） */
  driverLoad?: Observed<number>;
}

export const AREA_SUBTYPES = ["base_area", "transit_area", "food_area", "quiet_area", "nightlife_area", "sightseeing_center", "onsen_town"] as const;
export type AreaSubtype = (typeof AREA_SUBTYPES)[number];
export interface AreaRich {
  subtype?: AreaSubtype;
  /** container = 含有 object 統計（平均でなく状態） */
  containerDensity?: { lodging?: Observed<number>; food?: Observed<number>; sightseeing?: Observed<number> };
  walkability?: Observed<number>;
  /** 温泉街の温泉 facet 委譲 */
  onsenFacet?: OnsenState;
  /** 昼夜分離の体感安全（犯罪統計断定でなく proxy） */
  safetyPerception?: { daytime?: Observed<number>; nighttime?: Observed<number> };
  stagingViability?: { coinLockerAvail?: Observed<number> };
}

export const ACTIVITY_SUBTYPES = ["outdoor_active", "creative_workshop", "guided_tour", "seasonal_nature", "festival_matsuri", "entertainment_facility", "limited_popup"] as const;
export type ActivitySubtype = (typeof ACTIVITY_SUBTYPES)[number];
export interface ActivityRich {
  subtype?: ActivitySubtype;
  experienceSystem?: Observed<"learning" | "thrill" | "healing">;
  occurrenceType?: Observed<"always_available" | "seasonal" | "festival_fixed">;
  /** 季節 hard-window（空なら常設） */
  seasonWindow?: Observed<("spring" | "summer" | "autumn" | "winter")[]>;
  ageMin?: Observed<number>;
  /** 催行最少人数 */
  minParticipants?: Observed<number>;
  /** 天候中止しきい値（0..1・weatherSeverity がこれを超えると hard 中止） */
  cancelOnWeatherAbove?: Observed<number>;
  physicalIntensity?: Observed<number>;
}

export const SUPPORT_SUBTYPES = ["luggage_storage", "toilet_facility", "convenience_supply", "cash_access", "connectivity_point", "rest_spot", "info_point", "medical_point", "reservation_eligibility"] as const;
export type SupportSubtype = (typeof SUPPORT_SUBTYPES)[number];
export const RELIEF_AXES = ["luggage", "physiological", "supply", "cash", "connectivity", "rest", "information", "medical"] as const;
export type ReliefAxis = (typeof RELIEF_AXES)[number];
export interface SupportRich {
  subtype?: SupportSubtype;
  reliefAxis?: ReliefAxis;
  /** 対応 relief をどれだけ満たすか（burden の鏡像＝負号） */
  reliefValue?: Observed<number>;
  /** 一点で複数 relief を兼ねる束 */
  multiReliefBundle?: ReliefAxis[];
  /** 予約適格性 3 軸状態（booking 実装でない） */
  reservationDifficulty?: Observed<"open" | "recommended" | "required" | "members_only">;
  cancelFlexibility?: Observed<"free_cancel" | "partial_fee" | "no_refund">;
  /** この support の必要度（required/trip_critical で欠落→hard fail-closed） */
  necessity?: "optional" | "recommended" | "required" | "trip_critical";
  /** 順序制約 carrier */
  orderingAnchor?: boolean;
}

export type CategoryRich =
  | { category: "lodging"; rich?: LodgingRich }
  | { category: "place"; rich?: PlaceRich }
  | { category: "food"; rich?: FoodRich }
  | { category: "transport"; rich?: TransportRich }
  | { category: "area"; rich?: AreaRich }
  | { category: "activity"; rich?: ActivityRich }
  | { category: "support"; rich?: SupportRich };

// ═════════════════════════════════════════════════════════════════════════════
// §9 provenance（Layer6・source は confidence にのみ影響・質に直結しない）
// ═════════════════════════════════════════════════════════════════════════════

export interface ProvenanceSource {
  kind: "explicit_user" | "editorial" | "aggregated" | "inferred";
  /** 0..1 */
  reliability: number;
  independent: boolean;
}
export interface ProvenanceEnvelope {
  sources: ProvenanceSource[];
}

// ═════════════════════════════════════════════════════════════════════════════
// §10 TravelObjectState（統一多層・category discriminated union + 共有 core）
// ═════════════════════════════════════════════════════════════════════════════

export interface TravelObjectCore {
  placeRefId: string;
  /** Layer1 共有 trait（user と同一空間） */
  traits?: TraitVector;
  /** Layer2 role affinity（「何として扱えるか」） */
  roleAffinity?: Partial<Record<AnyEntityRole, Observed<number>>>;
  /** Layer3 burden（対称写像） */
  burden?: Partial<Record<EntityBurdenAxis, Observed<number>>>;
  /** Layer4 recovery */
  recovery?: { restValue?: Observed<number>; energyRequired?: Observed<number> };
  /** Layer5 relational suitability */
  relational?: Partial<Record<RelationshipKind, Observed<number>>>;
  /** budgetFit 用の正規化価格 0..1（断定でなく Observed） */
  priceLevel?: Observed<number>;
  /** budget hard ceiling 照合用（user 供給 redLine と比較・price 断定でない） */
  priceBand?: Observed<BudgetBand>;
  /** hard constraint 照合用の事実状態 */
  hardProfile?: EntityHardProfile;
  /** Layer6 provenance */
  provenance?: ProvenanceEnvelope;
}

/** 統一 StateEntity の travel-object 実体。category は Identity の 1 フィールド。 */
export type TravelObjectState = TravelObjectCore & CategoryRich;

/** solver(HOLD) 引渡し契約（T11 は rank/place しない） */
export interface EntityCandidate {
  placeRefId: string;
  entity: TravelObjectState;
}

// ═════════════════════════════════════════════════════════════════════════════
// §11 fit 出力型（非 opaque・gate-first）
// ═════════════════════════════════════════════════════════════════════════════

export const ENTITY_FIT_GRADES = ["excellent", "good", "stretch", "poor", "blocked"] as const;
/** ★ proposal-types `FitLabel`(fit/stretch/conflict) と別軸別名 */
export type EntityFitGrade = (typeof ENTITY_FIT_GRADES)[number];

export const FIT_COMPONENT_KEYS = ["roleFit", "traitFit", "burdenFit", "recoveryFit", "relationalFit", "budgetFit"] as const;
export type FitComponentKey = (typeof FIT_COMPONENT_KEYS)[number];

export interface FitComponent {
  key: FitComponentKey;
  /** 二層（private 由来は shared 射影で valueShared に差替・valueFull は構造除去される） */
  valueShared: number;
  valueFull: number;
  weight: number;
  contribution: number;
  compensability: "compensatory" | "partial" | "veto";
  available: boolean;
  /** ★ shared 射影での可用性（private-only 信号が shared の available を立てて漏れるのを防ぐ） */
  availableShared: boolean;
  signalBasis: "observed" | "inferred_from_trait" | "default";
}

export interface FitHardBlock {
  reason: "red_line_violation" | "intended_role_unsupported" | "budget_over_hard_ceiling" | "hard_constraint_violation" | "support_unavailable" | "season_or_weather_unavailable" | "safety_escalation";
  visibility: Visibility;
  ownerParticipantId: string | null;
}

export interface MismatchReason {
  code: string;
  visibility: Visibility;
  derivedFrom: "shared" | "private";
  owner: string | null;
}

export interface RiskFlag {
  code: string;
  visibility: Visibility;
  derivedFrom: "shared" | "private";
}

export interface MissingDataQuestion {
  field: string;
  /** なぜ聞くか（label_unstable / safety_unknown / low_confidence） */
  reason: "label_unstable" | "safety_unknown" | "low_confidence";
}

export interface GroupConflict {
  axisOrRole: string;
  favoredParticipantId: string;
  sacrificedParticipantId: string;
  severity: number;
  visibility: Visibility;
}

export const GROUP_AGGREGATION_STRATEGIES = ["least_misery", "fairness_sequential", "average"] as const;
export type GroupAggregationStrategy = (typeof GROUP_AGGREGATION_STRATEGIES)[number];

export interface GroupAggregateFit {
  overallScore: number;
  worstParticipantId: string | null;
  worstScore: number;
  floorBreached: boolean;
  strategy: GroupAggregationStrategy;
  usedStrategy: GroupAggregationStrategy;
  /** private 由来の least-misery 引下げ前後の二系統 */
  aggregateShared: number;
  aggregateFull: number;
  loweredByPrivate: boolean;
}

export interface PerParticipantFit {
  participantId: string;
  fitLabel: EntityFitGrade;
  overall: number;
  /** ★ shared 射影用の二層値（private を除いた当人スコア・shared view が逆算不能なよう precompute） */
  fitLabelShared: EntityFitGrade;
  overallShared: number;
}

export interface FitResult {
  /** ★ 構造的に false 固定（実行権限の正本でない） */
  authoritative: false;
  fitLabel: EntityFitGrade;
  components: FitComponent[];
  hardBlocks: FitHardBlock[];
  mismatchReasons: MismatchReason[];
  whyFits: MismatchReason[];
  whyMayFail: MismatchReason[];
  riskFlags: RiskFlag[];
  rationale: ViewerScopedRationale;
  perParticipantFit: PerParticipantFit[];
  groupAggregateFit: GroupAggregateFit | null;
  conflicts: GroupConflict[];
  /** 0..1 */
  confidence: number;
  labelStability: "stable" | "fragile";
  /** ★ C4 interaction（安全 unknown/caution 等）が課す label 上限（shared-safe・null=上限なし） */
  labelCap: EntityFitGrade | null;
  missingDataQuestions: MissingDataQuestion[];
  placeRefId: string;
  subjectKind: "solo" | "group";
}

// ═════════════════════════════════════════════════════════════════════════════
// §12 非 opaque 定数（weight / threshold / floor / 写像表 — 正本可視）
// ═════════════════════════════════════════════════════════════════════════════

export const FIT_WEIGHTS = { roleFit: 0.4, traitFit: 0.3, relationalFit: 0.2, budgetFit: 0.1 } as const;
export const FIT_LABEL_THRESHOLDS = { excellent: 0.8, good: 0.6, stretch: 0.4 } as const;
export const ROLE_FLOOR = 0.25;
/** Stage1 non-compensatory veto floor（WSM masking 防止） */
export const VETO_FLOORS = { burdenFit: 0.2, relationalFit: 0.15, roleFit: 0.25 } as const;
export const MISERY_FLOOR = 0.3;

/** door-to-door 不効用重み（研究実証・非 opaque 公開写像・T11-A2 §4） */
export const ROUTE_CHAIN_WEIGHTS = {
  inVehicle: 1.0,
  wait: 1.7,
  walk: 1.65,
  firstMile: 1.0,
  /** ★ egress = access の約 3 倍（非対称） */
  lastMile: 3.0,
  /** 乗換 ≒ 18 分相当 */
  transferPenaltyMin: 18,
  /** 階段 pathway×荷物の非線形係数 */
  stairBaggageFactor: 1.5,
} as const;
