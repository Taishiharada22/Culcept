// app/(culcept)/calendar/_lib/travel/types.ts
// 旅の1日詳細（Concierge Dashboard）データモデル — 正本6画像（travel/suggestion/booking/detail/budget/move）準拠。
// 「予定 → 思い出」へ変化していく1日編集ページの正本。UIロジックは持たず純データ型のみ。

export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * 写真スロット。
 * - source="auto"      … Aneurasync が撮影写真から自動挿入した下書き（ユーザー許可時・後続フェーズ）
 * - source="user"      … ユーザーが自分で設定／差し替えた確定写真
 * - source="placeholder" … 実写真未取得のデモ用 abstract タイル（捏造しない・honesty）
 * `url` が無い placeholder は地名ラベル付きの抽象タイルで描画。`photo` 自体が null の枠は「＋写真を追加」。
 */
export type TravelPhotoSource = "auto" | "user" | "placeholder";
export interface TravelPhoto {
  url?: string;
  source: TravelPhotoSource;
  label?: string; // placeholder 時に表示する地名（例：清水寺）
  tone?: PhotoTone; // placeholder グラデーション色
  capturedAt?: string; // ISO — auto 並べ替えキー
  caption?: string;
}
export type PhotoTone = "sunset" | "temple" | "garden" | "food" | "street" | "stay" | "neutral";

export type TransportMode = "walk" | "taxi" | "train" | "bus" | "bike" | "car";

/** スケジュール項目間の移動（detail.png のカード間コネクタ行）。 */
export interface TransportLeg {
  mode: TransportMode;
  durationMin: number;
  label: string; // 「徒歩 約12分」「ランチへ 徒歩 約10分」
  distanceText?: string; // 「850 m」「7.2 km」
  fareText?: string | null; // 「¥230」/ null（徒歩は —）
  detail?: string; // 展開シェブロンで開く補足
}

/** ① ダッシュボード SCHEDULE / ④ 詳細スケジュールの1項目。 */
export interface ScheduleItem {
  id: string;
  startTime: string; // "09:30"
  endTime?: string;
  name: string;
  subtitle?: string; // 新幹線のぞみ9号 等
  categories: string[]; // chip（到着/観光、拝観・散策/世界遺産 など）
  description?: string;
  durationMin?: number; // 滞在目安（円バッジ）
  photo: TravelPhoto | null;
  coords?: LatLng;
  address?: string;
  reservationId?: string;
  transportToNext?: TransportLeg;
}

export type ReservationCategory = "宿泊" | "食事" | "交通" | "体験";
export type ReservationStatus = "確定済み" | "変更可能" | "要対応" | "申請中";
export type ReservationActionKind =
  | "detail"
  | "map"
  | "menu"
  | "ticket"
  | "timetable"
  | "change";
export interface ReservationAction {
  kind: ReservationActionKind;
  label: string;
  emphasis?: "gold" | "outline"; // 変更・キャンセル = gold
}
export interface ReservationTag {
  label: string;
  tone?: "muted" | "info";
}

/** ③ 予約一覧の1件。category で section（宿泊/食事/交通）にグループ化。 */
export interface Reservation {
  id: string;
  category: ReservationCategory;
  name: string;
  status: ReservationStatus;
  confirmationCode?: string;
  timeLabel?: string; // 「チェックイン 6/24 (火) 17:30」
  address?: string;
  phone?: string;
  changeable: boolean; // 4-stat 集計（変更可能）
  needsAction?: boolean; // 4-stat 集計（要対応）
  tags: ReservationTag[]; // キャンセル無料 6/22まで / 朝食付き 2名 / 個室確約 / 払戻手数料あり
  // 交通用
  transitFrom?: string;
  transitTo?: string;
  transitDepart?: string; // 「6/24 (火) 09:03 発」
  transitArrive?: string; // 「11:16 着」
  seat?: string; // 普通車指定席 2名 / 2A・2B
  // 宿泊用
  checkIn?: string;
  checkOut?: string;
  partySize?: number;
  actions: ReservationAction[];
  photo: TravelPhoto | null;
  coords?: LatLng;
}

export interface ReservationStats {
  total: number;
  confirmed: number;
  changeable: number;
  needsAction: number;
}

export type PriceLevel = "¥" | "¥¥" | "¥¥¥" | "¥¥¥¥";

/** ② Meal Suggestion の CONCIERGE'S PICK。 */
export interface MealPick {
  name: string;
  badge?: string; // 和食・会席
  rating: number;
  ratingCount: number;
  walkText: string; // 徒歩 約2分 (160m)
  recommendTime: string; // 12:30–13:30
  priceLevel: PriceLevel;
  availability: string; // 空席あり 予約OK
  tags: string[]; // 四季の京料理 / 老舗の安心感 ...
  whyFitsYou: string;
  conciergeName: string; // コンシェルジュ 木村より
  photo: TravelPhoto | null;
  coords?: LatLng;
}
export type MealAltCategory = "カフェ" | "スイーツ" | "ランチ" | "ディナー";
export interface MealAlternative {
  id: string;
  category: MealAltCategory;
  name: string;
  rating: number;
  ratingCount: number;
  walkText: string; // 徒歩5分
  hours: string; // 08:00–10:00
  priceLevel: PriceLevel;
  description: string;
  photo: TravelPhoto | null;
  coords?: LatLng;
}
export interface MealSuggestion {
  pick: MealPick;
  alternatives: MealAlternative[];
  areaLabel: string; // 祇園・東山エリア
}

/** ⑤ Budget Snapshot。 */
export interface BudgetDonutCategory {
  key: string;
  labelEn: string;
  labelJa: string;
  amount: number;
  pct: number;
}
export interface BudgetDayBar {
  label: string; // DAY 1 / TODAY
  amount: number;
  isToday?: boolean;
}
export interface BudgetForecast {
  predictedRemaining: number; // 予測残額 ¥6,800
  statusLabel: string; // 余裕あり
  tip: string; // コンシェルジュ予測本文
}
export interface DayBudget {
  todayBudget: number;
  todaySpend: number;
  todayRemaining: number;
  totalBudget: number;
  spentSoFar: number;
  remaining: number;
  spentPct: number; // 25.0
  remainingPct: number; // 75.0
  donut: BudgetDonutCategory[];
  dayComparison: BudgetDayBar[];
  dailyAverage: number; // 1日あたりの平均 ¥27,588
  progressPct: number; // 予算に対する進捗 25
  progressLabel: string; // 順調です
  forecast: BudgetForecast;
}

/** ⑥ 移動詳細の1区間。 */
export interface MoveLeg {
  id: string;
  time: string; // 09:10
  endpointKind: "depart" | "arrive"; // 出発/到着
  name: string;
  sub?: string; // 京都市下京区烏丸通 / バス停（五条坂）
  mode?: TransportMode; // 最終行（目的地）は undefined
  modeLabel?: string; // タクシー / 市バス 206
  durationText?: string; // 約20分
  distanceText?: string; // 7.2 km
  fareText?: string | null; // ¥2,650 / null（徒歩は —）
  isDestination?: boolean; // 🚩 目的地
}
export interface MoveSummaryMode {
  mode: TransportMode;
  label: string; // タクシー
  durationText: string; // 約38分
  distanceText: string; // 12.8 km
}
export interface MoveSummary {
  perMode: MoveSummaryMode[];
  totalDurationText: string; // 約76分
  totalDistanceText: string; // 18.6 km
  totalFareText: string; // 概算 ¥4,860
}
export interface DayMove {
  legs: MoveLeg[];
  summary: MoveSummary;
}

/** ROUTE MAP の停留点（番号ピン＋経路線上の交通アイコン）。 */
export interface RouteStop {
  order: number;
  name: string;
  coords?: LatLng;
  modeToNext?: TransportMode; // 次の停留点までの手段（経路線上アイコン）
}

export interface MemoriesNote {
  text: string;
  photo: TravelPhoto | null;
}

export interface DayWeather {
  icon: string; // sun / cloud / rain …（emoji 変換は UI 側）
  tempMax: number;
  tempMin: number;
  current?: number;
}

/** 旅の1日（全6画面の正本）。 */
export interface TripDay {
  date: string; // YYYY-MM-DD
  dayIndex: number; // 1
  weekdayLabel: string; // 火
  monthDayLabel: string; // 6/24
  theme: string; // 千年の都を感じる、はんなり京都さんぽ
  themeSubtitle?: string;
  weather: DayWeather;
  heroPhoto: TravelPhoto | null;
  schedule: ScheduleItem[];
  reservations: Reservation[];
  reservationStats: ReservationStats;
  meal: MealSuggestion;
  budget: DayBudget;
  walking: { steps: number; distanceKm: number };
  move: DayMove;
  memories: MemoriesNote;
  routeStops: RouteStop[];
}

export interface Trip {
  id: string;
  title: string; // 京都 2泊3日
  destinationLabel: string; // 京都
  startDate: string;
  endDate: string;
  dateRangeLabel: string; // 6/24 (火) ～ 6/26 (木)
  partySize: number;
  days: TripDay[];
}

/** ④/⑥/① の bottom nav タブ。locationNotes = Location Notes（旧 マイページ枠）。 */
export type TravelScreen =
  | "dashboard"
  | "schedule"
  | "reservations"
  | "meal"
  | "budget"
  | "move"
  | "locationNotes";

// ===========================================================================
// Location Notes（ロケーションノート）— Concept 8/12〜18 準拠
// 「旅行 / スポット」を 王道 / 穴場、地元民 / 旅行者 の観点で発見・追加するノート。
// 正本画像: match(12)/traveler(13)/spot(14)/mainstream(15)/hidden(16)/thema(17)/plus(18)。
// UIロジックは持たず純データ型のみ。写真は placeholder（捏造しない・honesty）。
// ===========================================================================

/** ノート項目の種別。trip=旅行プラン（複数スポットの行程）/ spot=単体スポット。 */
export type LocationItemKind = "trip" | "spot";

/** 王道 / 穴場 / その他（標準）。王道・穴場タブの振り分けキー。 */
export type LocationClassification = "classic" | "hidden" | "standard";

/** 情報の出どころ視点。各タブ内で「地元民から / 旅行者から」に分割表示する。 */
export type LocationSource = "local" | "traveler";

/** 投稿者（地元民 M さん / 旅行者 〜 さん）。 */
export interface LocationAuthor {
  name: string; // 「Kyoto Local M」「Traveler 由香」
  source: LocationSource;
  roleLabel?: string; // 「京都在住8年」「2回目の京都」
}

/** 王道/穴場で参照される情報ソース（検索・SNS・地元民・旅行者…）。 */
export interface InfoSource {
  label: string; // 「検索 / Google」
  channel: string; // 「Google」「Instagram」
  note?: string; // 「定番の下調べ」
}

/** エリア絞り込みチップ（スポットタブ「エリアから探す」）。 */
export interface AreaChip {
  label: string; // 祇園
  reading?: string; // ぎおん
  count?: number; // 件数
}

/**
 * Location Notes の1項目（旅行プラン or スポット）。
 * trip 固有: durationLabel / spotCount / stops。spot 固有: hours / address。
 * hidden 固有: whySpecial / whyHidden。match 表示: matchPct / matchReasons。
 */
export interface LocationItem {
  id: string;
  kind: LocationItemKind;
  prefecture: string; // 「京都府」— 都道府県セレクタで絞り込む
  title: string;
  areaLabel: string; // 「京都市・祇園〜東山エリア」
  classification: LocationClassification;
  source: LocationSource;
  author: LocationAuthor;
  genre: string; // 「寺社・文化」「カフェ」「自然・散策」
  themeKeys: string[]; // TravelTheme.key の配列
  tags: string[]; // 「静かさ」「写真映え」「老舗」
  rating: number; // 4.7
  ratingCount: number; // 1240
  description: string;
  photo: TravelPhoto | null;
  // trip 固有
  durationLabel?: string; // 「1泊2日」「日帰り」
  spotCount?: number; // 4
  stops?: string[]; // 行程の主な立寄り先名
  // spot 固有
  hours?: string; // 「6:00–9:00」
  address?: string;
  priceLevel?: PriceLevel;
  // 穴場固有
  whySpecial?: string; // なぜ特別なのか
  whyHidden?: string; // なぜ知られていないのか
  // Match 表示用
  matchPct?: number; // 92
  matchReasons?: string[]; // 「静かさ重視のあなたに」
}

/** テーマ（Concept 17）。気分・目的で旅を探す軸。 */
export interface TravelTheme {
  key: string; // "quiet-morning"
  label: string; // 静かな朝
  description: string; // 「人の少ない朝の時間に…」
  photo: TravelPhoto | null;
}

/** あなたの好み chip（Match のパーソナライズ表示）。 */
export interface PreferenceChip {
  label: string; // 学び / 静かさ重視 / 関西圏
  active?: boolean;
}

/** Location Notes 全体のデータ束（都道府県別）。 */
export interface LocationNotesData {
  prefectures: string[]; // セレクタ候補（京都府, 大阪府, …）
  defaultPrefecture: string;
  preferenceChips: PreferenceChip[];
  matchReasons: string[]; // 「さらにあなたの好みに合う理由」本文
  infoSources: InfoSource[]; // 王道「人気の情報ソース」
  areaChips: AreaChip[]; // スポット「エリアから探す」
  hiddenHints: string[]; // 穴場「隠れたヒント」chip
  themes: TravelTheme[];
  items: LocationItem[]; // trips + spots（prefecture で絞り込み）
}
