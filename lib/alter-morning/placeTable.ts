/**
 * Alter Morning Protocol — 場所正規化テーブル
 *
 * ユーザーの自然言語入力（「マックで作業」「スタバで勉強」等）から
 * 場所を正規化し、コーデ提案やプランニングに活用する。
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PlaceCategory — 場所カテゴリ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 場所の大分類 */
export type PlaceCategory =
  | "cafe"
  | "fast_food"
  | "restaurant"
  | "library"
  | "school"
  | "office"
  | "home"
  | "hospital"
  | "clinic"
  | "shopping"
  | "convenience_store"
  | "gym"
  | "park"
  | "station"
  | "coworking"
  | "hotel"
  | "entertainment"
  | "other";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PlaceEntry — 場所エントリ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 場所の特性（コーデ提案・プランニング用） */
export interface PlaceTraits {
  /** 屋内か */
  indoor?: boolean;
  /** 作業に適しているか */
  workFriendly?: boolean;
  /** 勉強に適しているか */
  studyFriendly?: boolean;
  /** 騒がしいか */
  noisy?: boolean;
  /** 長時間滞在に向いているか */
  longStayOk?: boolean;
}

/** 場所の正規化エントリ */
export interface PlaceEntry {
  /** 一意識別子 */
  id: string;
  /** 正式名称（表示用） */
  canonicalLabel: string;
  /** 別名・略称（マッチング用） */
  aliases: string[];
  /** 場所カテゴリ */
  category: PlaceCategory;
  /** 場所の特性 */
  traits?: PlaceTraits;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PLACE_TABLE — 場所マスタ（100+エントリ）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const PLACE_TABLE: PlaceEntry[] = [

  // ─── カフェ ───────────────────────────────────────────────────────────────────

  {
    id: "starbucks",
    canonicalLabel: "スターバックス",
    aliases: ["スターバックス", "スタバ"],
    category: "cafe",
    traits: { indoor: true, workFriendly: true, studyFriendly: true, noisy: false, longStayOk: true },
  },
  {
    id: "tullys",
    canonicalLabel: "タリーズ",
    aliases: ["タリーズコーヒー", "タリーズ"],
    category: "cafe",
    traits: { indoor: true, workFriendly: true, studyFriendly: true, noisy: false, longStayOk: true },
  },
  {
    id: "doutor",
    canonicalLabel: "ドトール",
    aliases: ["ドトールコーヒー", "ドトール"],
    category: "cafe",
    traits: { indoor: true, workFriendly: true, studyFriendly: true, noisy: false, longStayOk: true },
  },
  {
    id: "komeda",
    canonicalLabel: "コメダ珈琲",
    aliases: ["コメダ珈琲店", "コメダ珈琲", "コメダ"],
    category: "cafe",
    traits: { indoor: true, workFriendly: true, studyFriendly: true, noisy: false, longStayOk: true },
  },
  {
    id: "sanmaruku",
    canonicalLabel: "サンマルクカフェ",
    aliases: ["サンマルクカフェ", "サンマルク"],
    category: "cafe",
    traits: { indoor: true, workFriendly: true, studyFriendly: true, noisy: false, longStayOk: true },
  },
  {
    id: "pronto",
    canonicalLabel: "プロント",
    aliases: ["プロント", "PRONTO"],
    category: "cafe",
    traits: { indoor: true, workFriendly: true, studyFriendly: false, noisy: true, longStayOk: false },
  },
  {
    id: "excelsior",
    canonicalLabel: "エクセルシオール",
    aliases: ["エクセルシオールカフェ", "エクセルシオール"],
    category: "cafe",
    traits: { indoor: true, workFriendly: true, studyFriendly: true, noisy: false, longStayOk: true },
  },
  {
    id: "ueshima",
    canonicalLabel: "上島珈琲",
    aliases: ["上島珈琲店", "上島珈琲"],
    category: "cafe",
    traits: { indoor: true, workFriendly: true, studyFriendly: true, noisy: false, longStayOk: true },
  },
  {
    id: "hoshino",
    canonicalLabel: "星乃珈琲",
    aliases: ["星乃珈琲店", "星乃珈琲"],
    category: "cafe",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: false, longStayOk: true },
  },
  {
    id: "veloce",
    canonicalLabel: "ベローチェ",
    aliases: ["ベローチェ", "カフェベローチェ"],
    category: "cafe",
    traits: { indoor: true, workFriendly: true, studyFriendly: true, noisy: false, longStayOk: true },
  },
  {
    id: "cafe_de_crie",
    canonicalLabel: "カフェドクリエ",
    aliases: ["カフェドクリエ", "カフェ・ド・クリエ"],
    category: "cafe",
    traits: { indoor: true, workFriendly: true, studyFriendly: true, noisy: false, longStayOk: true },
  },
  {
    id: "renoir",
    canonicalLabel: "ルノアール",
    aliases: ["ルノアール", "銀座ルノアール"],
    category: "cafe",
    traits: { indoor: true, workFriendly: true, studyFriendly: true, noisy: false, longStayOk: true },
  },
  {
    id: "sarutahiko",
    canonicalLabel: "猿田彦珈琲",
    aliases: ["猿田彦珈琲", "猿田彦"],
    category: "cafe",
    traits: { indoor: true, workFriendly: true, studyFriendly: false, noisy: false, longStayOk: false },
  },
  {
    id: "bluebottle",
    canonicalLabel: "ブルーボトル",
    aliases: ["ブルーボトルコーヒー", "ブルーボトル"],
    category: "cafe",
    traits: { indoor: true, workFriendly: true, studyFriendly: false, noisy: false, longStayOk: false },
  },
  {
    id: "mos_cafe",
    canonicalLabel: "モスカフェ",
    aliases: ["モスカフェ"],
    category: "cafe",
    traits: { indoor: true, workFriendly: true, studyFriendly: false, noisy: false, longStayOk: false },
  },
  {
    id: "cafe_generic",
    canonicalLabel: "カフェ",
    aliases: ["カフェ", "cafe"],
    category: "cafe",
    traits: { indoor: true, workFriendly: true, studyFriendly: true, noisy: false, longStayOk: true },
  },
  {
    id: "kissaten",
    canonicalLabel: "喫茶店",
    aliases: ["喫茶店", "喫茶"],
    category: "cafe",
    traits: { indoor: true, workFriendly: true, studyFriendly: true, noisy: false, longStayOk: true },
  },

  // ─── ファストフード ─────────────────────────────────────────────────────────

  {
    id: "mcdonalds",
    canonicalLabel: "マクドナルド",
    aliases: ["マクドナルド", "マック", "マクド"],
    category: "fast_food",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: true, longStayOk: false },
  },
  {
    id: "mos_burger",
    canonicalLabel: "モスバーガー",
    aliases: ["モスバーガー", "モス"],
    category: "fast_food",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: true, longStayOk: false },
  },
  {
    id: "kfc",
    canonicalLabel: "ケンタッキー",
    aliases: ["ケンタッキー", "ケンタッキーフライドチキン", "ケンチキ", "KFC"],
    category: "fast_food",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: true, longStayOk: false },
  },
  {
    id: "sukiya",
    canonicalLabel: "すき家",
    aliases: ["すき家", "すきや"],
    category: "fast_food",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: true, longStayOk: false },
  },
  {
    id: "matsuya",
    canonicalLabel: "松屋",
    aliases: ["松屋"],
    category: "fast_food",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: true, longStayOk: false },
  },
  {
    id: "yoshinoya",
    canonicalLabel: "吉野家",
    aliases: ["吉野家"],
    category: "fast_food",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: true, longStayOk: false },
  },
  {
    id: "cocoichi",
    canonicalLabel: "CoCo壱番屋",
    aliases: ["CoCo壱番屋", "CoCo壱", "ココイチ", "coco壱"],
    category: "fast_food",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: true, longStayOk: false },
  },
  {
    id: "gusto",
    canonicalLabel: "ガスト",
    aliases: ["ガスト"],
    category: "fast_food",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: true, longStayOk: false },
  },
  {
    id: "saizeriya",
    canonicalLabel: "サイゼリヤ",
    aliases: ["サイゼリヤ", "サイゼ"],
    category: "fast_food",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: true, longStayOk: false },
  },
  {
    id: "burgerking",
    canonicalLabel: "バーガーキング",
    aliases: ["バーガーキング"],
    category: "fast_food",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: true, longStayOk: false },
  },
  {
    id: "lotteria",
    canonicalLabel: "ロッテリア",
    aliases: ["ロッテリア"],
    category: "fast_food",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: true, longStayOk: false },
  },
  {
    id: "freshness",
    canonicalLabel: "フレッシュネス",
    aliases: ["フレッシュネスバーガー", "フレッシュネス"],
    category: "fast_food",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: false, longStayOk: false },
  },

  // ─── コンビニ ─────────────────────────────────────────────────────────────

  {
    id: "seven_eleven",
    canonicalLabel: "セブンイレブン",
    aliases: ["セブンイレブン", "セブン-イレブン", "セブン"],
    category: "convenience_store",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: false, longStayOk: false },
  },
  {
    id: "lawson",
    canonicalLabel: "ローソン",
    aliases: ["ローソン"],
    category: "convenience_store",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: false, longStayOk: false },
  },
  {
    id: "familymart",
    canonicalLabel: "ファミリーマート",
    aliases: ["ファミリーマート", "ファミマ"],
    category: "convenience_store",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: false, longStayOk: false },
  },
  {
    id: "ministop",
    canonicalLabel: "ミニストップ",
    aliases: ["ミニストップ"],
    category: "convenience_store",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: false, longStayOk: false },
  },
  {
    id: "daily_yamazaki",
    canonicalLabel: "デイリーヤマザキ",
    aliases: ["デイリーヤマザキ", "デイリー"],
    category: "convenience_store",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: false, longStayOk: false },
  },

  // ─── 図書館・学習施設 ─────────────────────────────────────────────────────

  {
    id: "library",
    canonicalLabel: "図書館",
    aliases: ["図書館"],
    category: "library",
    traits: { indoor: true, workFriendly: true, studyFriendly: true, noisy: false, longStayOk: true },
  },
  {
    id: "study_room",
    canonicalLabel: "自習室",
    aliases: ["自習室"],
    category: "library",
    traits: { indoor: true, workFriendly: true, studyFriendly: true, noisy: false, longStayOk: true },
  },
  {
    id: "yobiko",
    canonicalLabel: "予備校",
    aliases: ["予備校"],
    category: "library",
    traits: { indoor: true, workFriendly: false, studyFriendly: true, noisy: false, longStayOk: true },
  },
  {
    id: "juku",
    canonicalLabel: "塾",
    aliases: ["塾"],
    category: "library",
    traits: { indoor: true, workFriendly: false, studyFriendly: true, noisy: false, longStayOk: true },
  },
  {
    id: "ndl",
    canonicalLabel: "国立国会図書館",
    aliases: ["国立国会図書館", "国会図書館", "NDL"],
    category: "library",
    traits: { indoor: true, workFriendly: true, studyFriendly: true, noisy: false, longStayOk: true },
  },
  {
    id: "toritsu_chuo_lib",
    canonicalLabel: "都立中央図書館",
    aliases: ["都立中央図書館", "都立中央", "東京都立中央図書館"],
    category: "library",
    traits: { indoor: true, workFriendly: true, studyFriendly: true, noisy: false, longStayOk: true },
  },
  {
    id: "hibiya_lib",
    canonicalLabel: "日比谷図書文化館",
    aliases: ["日比谷図書文化館", "日比谷図書館"],
    category: "library",
    traits: { indoor: true, workFriendly: true, studyFriendly: true, noisy: false, longStayOk: true },
  },
  {
    id: "chiyoda_lib",
    canonicalLabel: "千代田図書館",
    aliases: ["千代田図書館"],
    category: "library",
    traits: { indoor: true, workFriendly: true, studyFriendly: true, noisy: false, longStayOk: true },
  },
  {
    id: "ward_lib",
    canonicalLabel: "区立図書館",
    aliases: ["区立図書館", "市立図書館", "公立図書館"],
    category: "library",
    traits: { indoor: true, workFriendly: true, studyFriendly: true, noisy: false, longStayOk: true },
  },

  // ─── 学校 ─────────────────────────────────────────────────────────────────

  {
    id: "school",
    canonicalLabel: "学校",
    aliases: ["学校"],
    category: "school",
    traits: { indoor: true, workFriendly: false, studyFriendly: true, noisy: false, longStayOk: true },
  },
  {
    id: "university",
    canonicalLabel: "大学",
    aliases: ["大学"],
    category: "school",
    traits: { indoor: true, workFriendly: false, studyFriendly: true, noisy: false, longStayOk: true },
  },
  {
    id: "high_school",
    canonicalLabel: "高校",
    aliases: ["高校", "高等学校"],
    category: "school",
    traits: { indoor: true, workFriendly: false, studyFriendly: true, noisy: false, longStayOk: true },
  },
  {
    id: "junior_high",
    canonicalLabel: "中学校",
    aliases: ["中学校", "中学"],
    category: "school",
    traits: { indoor: true, workFriendly: false, studyFriendly: true, noisy: false, longStayOk: true },
  },
  {
    id: "elementary",
    canonicalLabel: "小学校",
    aliases: ["小学校"],
    category: "school",
    traits: { indoor: true, workFriendly: false, studyFriendly: true, noisy: false, longStayOk: true },
  },
  {
    id: "graduate_school",
    canonicalLabel: "大学院",
    aliases: ["大学院"],
    category: "school",
    traits: { indoor: true, workFriendly: true, studyFriendly: true, noisy: false, longStayOk: true },
  },
  {
    id: "vocational",
    canonicalLabel: "専門学校",
    aliases: ["専門学校"],
    category: "school",
    traits: { indoor: true, workFriendly: false, studyFriendly: true, noisy: false, longStayOk: true },
  },

  // ─── オフィス・職場 ───────────────────────────────────────────────────────

  {
    id: "company",
    canonicalLabel: "会社",
    aliases: ["会社", "職場"],
    category: "office",
    traits: { indoor: true, workFriendly: true, studyFriendly: false, noisy: false, longStayOk: true },
  },
  {
    id: "office",
    canonicalLabel: "オフィス",
    aliases: ["オフィス"],
    category: "office",
    traits: { indoor: true, workFriendly: true, studyFriendly: false, noisy: false, longStayOk: true },
  },
  {
    id: "head_office",
    canonicalLabel: "本社",
    aliases: ["本社"],
    category: "office",
    traits: { indoor: true, workFriendly: true, studyFriendly: false, noisy: false, longStayOk: true },
  },
  {
    id: "branch_office",
    canonicalLabel: "支社",
    aliases: ["支社", "支店"],
    category: "office",
    traits: { indoor: true, workFriendly: true, studyFriendly: false, noisy: false, longStayOk: true },
  },
  {
    id: "jimusho",
    canonicalLabel: "事務所",
    aliases: ["事務所"],
    category: "office",
    traits: { indoor: true, workFriendly: true, studyFriendly: false, noisy: false, longStayOk: true },
  },

  // ─── 自宅 ─────────────────────────────────────────────────────────────────

  {
    id: "home",
    canonicalLabel: "自宅",
    aliases: ["自宅", "家", "うち", "部屋", "アパート", "マンション"],
    category: "home",
    traits: { indoor: true, workFriendly: true, studyFriendly: true, noisy: false, longStayOk: true },
  },

  // ─── 医療施設 ─────────────────────────────────────────────────────────────

  {
    id: "hospital",
    canonicalLabel: "病院",
    aliases: ["病院"],
    category: "hospital",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: false, longStayOk: false },
  },
  {
    id: "dentist",
    canonicalLabel: "歯医者",
    aliases: ["歯医者", "歯科", "歯科医院"],
    category: "clinic",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: false, longStayOk: false },
  },
  {
    id: "clinic",
    canonicalLabel: "クリニック",
    aliases: ["クリニック", "診療所"],
    category: "clinic",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: false, longStayOk: false },
  },
  {
    id: "pharmacy",
    canonicalLabel: "薬局",
    aliases: ["薬局", "ドラッグストア"],
    category: "clinic",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: false, longStayOk: false },
  },
  {
    id: "seitai",
    canonicalLabel: "整体",
    aliases: ["整体院", "整体", "整骨院"],
    category: "clinic",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: false, longStayOk: false },
  },
  {
    id: "eye_clinic",
    canonicalLabel: "眼科",
    aliases: ["眼科"],
    category: "clinic",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: false, longStayOk: false },
  },
  {
    id: "dermatology",
    canonicalLabel: "皮膚科",
    aliases: ["皮膚科"],
    category: "clinic",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: false, longStayOk: false },
  },
  {
    id: "internal",
    canonicalLabel: "内科",
    aliases: ["内科"],
    category: "clinic",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: false, longStayOk: false },
  },
  {
    id: "ent",
    canonicalLabel: "耳鼻科",
    aliases: ["耳鼻科", "耳鼻咽喉科"],
    category: "clinic",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: false, longStayOk: false },
  },
  {
    id: "beauty_salon",
    canonicalLabel: "美容院",
    aliases: ["美容院", "美容室", "サロン", "床屋", "理容室", "理髪店"],
    category: "clinic",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: false, longStayOk: false },
  },

  // ─── ショッピング ─────────────────────────────────────────────────────────

  {
    id: "supermarket",
    canonicalLabel: "スーパー",
    aliases: ["スーパーマーケット", "スーパー"],
    category: "shopping",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: true, longStayOk: false },
  },
  {
    id: "aeon",
    canonicalLabel: "イオン",
    aliases: ["イオンモール", "イオン"],
    category: "shopping",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: true, longStayOk: true },
  },
  {
    id: "department",
    canonicalLabel: "百貨店",
    aliases: ["百貨店", "デパート"],
    category: "shopping",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: false, longStayOk: true },
  },
  {
    id: "donki",
    canonicalLabel: "ドンキホーテ",
    aliases: ["ドン・キホーテ", "ドンキホーテ", "ドンキ"],
    category: "shopping",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: true, longStayOk: false },
  },
  {
    id: "uniqlo",
    canonicalLabel: "ユニクロ",
    aliases: ["ユニクロ", "UNIQLO"],
    category: "shopping",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: false, longStayOk: false },
  },
  {
    id: "gu",
    canonicalLabel: "GU",
    aliases: ["ジーユー", "GU"],
    category: "shopping",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: false, longStayOk: false },
  },
  {
    id: "muji",
    canonicalLabel: "無印良品",
    aliases: ["無印良品", "無印"],
    category: "shopping",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: false, longStayOk: false },
  },
  {
    id: "nitori",
    canonicalLabel: "ニトリ",
    aliases: ["ニトリ"],
    category: "shopping",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: false, longStayOk: false },
  },
  {
    id: "daiso",
    canonicalLabel: "ダイソー",
    aliases: ["ダイソー", "百均", "100均", "百円ショップ"],
    category: "shopping",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: false, longStayOk: false },
  },
  {
    id: "bookstore",
    canonicalLabel: "本屋",
    aliases: ["本屋", "書店", "ブックオフ"],
    category: "shopping",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: false, longStayOk: true },
  },
  {
    id: "shotengai",
    canonicalLabel: "商店街",
    aliases: ["商店街"],
    category: "shopping",
    traits: { indoor: false, workFriendly: false, studyFriendly: false, noisy: true, longStayOk: false },
  },
  {
    id: "outlet",
    canonicalLabel: "アウトレット",
    aliases: ["アウトレットモール", "アウトレット"],
    category: "shopping",
    traits: { indoor: false, workFriendly: false, studyFriendly: false, noisy: true, longStayOk: true },
  },
  {
    id: "shopping_mall",
    canonicalLabel: "ショッピングモール",
    aliases: ["ショッピングモール", "ショッピングセンター"],
    category: "shopping",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: true, longStayOk: true },
  },

  // ─── ジム・スポーツ ───────────────────────────────────────────────────────

  {
    id: "gym",
    canonicalLabel: "ジム",
    aliases: ["ジム", "フィットネス", "フィットネスクラブ", "スポーツジム"],
    category: "gym",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: true, longStayOk: false },
  },
  {
    id: "yoga",
    canonicalLabel: "ヨガスタジオ",
    aliases: ["ヨガスタジオ", "ヨガ"],
    category: "gym",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: false, longStayOk: false },
  },
  {
    id: "pool",
    canonicalLabel: "プール",
    aliases: ["プール"],
    category: "gym",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: true, longStayOk: false },
  },
  {
    id: "gymnasium",
    canonicalLabel: "体育館",
    aliases: ["体育館"],
    category: "gym",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: true, longStayOk: false },
  },
  {
    id: "golf",
    canonicalLabel: "ゴルフ",
    aliases: ["ゴルフ場", "ゴルフ", "練習場", "打ちっ放し", "打ちっぱなし"],
    category: "gym",
    traits: { indoor: false, workFriendly: false, studyFriendly: false, noisy: false, longStayOk: true },
  },

  // ─── 公園・アウトドア ─────────────────────────────────────────────────────

  {
    id: "park",
    canonicalLabel: "公園",
    aliases: ["公園"],
    category: "park",
    traits: { indoor: false, workFriendly: false, studyFriendly: false, noisy: false, longStayOk: true },
  },
  {
    id: "riverside",
    canonicalLabel: "河川敷",
    aliases: ["河川敷"],
    category: "park",
    traits: { indoor: false, workFriendly: false, studyFriendly: false, noisy: false, longStayOk: true },
  },
  {
    id: "beach",
    canonicalLabel: "ビーチ",
    aliases: ["ビーチ", "海", "浜", "海岸"],
    category: "park",
    traits: { indoor: false, workFriendly: false, studyFriendly: false, noisy: false, longStayOk: true },
  },
  {
    id: "mountain",
    canonicalLabel: "山",
    aliases: ["山", "登山"],
    category: "park",
    traits: { indoor: false, workFriendly: false, studyFriendly: false, noisy: false, longStayOk: true },
  },
  {
    id: "campsite",
    canonicalLabel: "キャンプ場",
    aliases: ["キャンプ場", "キャンプ"],
    category: "park",
    traits: { indoor: false, workFriendly: false, studyFriendly: false, noisy: false, longStayOk: true },
  },

  // ─── 駅・交通拠点 ─────────────────────────────────────────────────────────

  {
    id: "station",
    canonicalLabel: "駅",
    aliases: ["駅"],
    category: "station",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: true, longStayOk: false },
  },
  {
    id: "airport",
    canonicalLabel: "空港",
    aliases: ["空港"],
    category: "station",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: true, longStayOk: false },
  },
  {
    id: "bus_terminal",
    canonicalLabel: "バスターミナル",
    aliases: ["バスターミナル", "バス停"],
    category: "station",
    traits: { indoor: false, workFriendly: false, studyFriendly: false, noisy: true, longStayOk: false },
  },
  {
    id: "tokyo_station",
    canonicalLabel: "東京駅",
    aliases: ["東京駅"],
    category: "station",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: true, longStayOk: false },
  },
  {
    id: "shinjuku_station",
    canonicalLabel: "新宿駅",
    aliases: ["新宿駅"],
    category: "station",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: true, longStayOk: false },
  },
  {
    id: "shibuya_station",
    canonicalLabel: "渋谷駅",
    aliases: ["渋谷駅"],
    category: "station",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: true, longStayOk: false },
  },
  {
    id: "ikebukuro_station",
    canonicalLabel: "池袋駅",
    aliases: ["池袋駅"],
    category: "station",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: true, longStayOk: false },
  },
  {
    id: "shinagawa_station",
    canonicalLabel: "品川駅",
    aliases: ["品川駅"],
    category: "station",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: true, longStayOk: false },
  },
  {
    id: "ueno_station",
    canonicalLabel: "上野駅",
    aliases: ["上野駅"],
    category: "station",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: true, longStayOk: false },
  },
  {
    id: "akihabara_station",
    canonicalLabel: "秋葉原駅",
    aliases: ["秋葉原駅", "アキバ駅"],
    category: "station",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: true, longStayOk: false },
  },
  {
    id: "otemachi_station",
    canonicalLabel: "大手町駅",
    aliases: ["大手町駅"],
    category: "station",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: true, longStayOk: false },
  },
  {
    id: "ginza_station",
    canonicalLabel: "銀座駅",
    aliases: ["銀座駅"],
    category: "station",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: true, longStayOk: false },
  },
  {
    id: "roppongi_station",
    canonicalLabel: "六本木駅",
    aliases: ["六本木駅"],
    category: "station",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: true, longStayOk: false },
  },

  // ─── エンタメ ─────────────────────────────────────────────────────────────

  {
    id: "cinema",
    canonicalLabel: "映画館",
    aliases: ["映画館", "シネマ", "シネコン"],
    category: "entertainment",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: false, longStayOk: false },
  },
  {
    id: "karaoke",
    canonicalLabel: "カラオケ",
    aliases: ["カラオケ"],
    category: "entertainment",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: true, longStayOk: true },
  },
  {
    id: "game_center",
    canonicalLabel: "ゲームセンター",
    aliases: ["ゲームセンター", "ゲーセン"],
    category: "entertainment",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: true, longStayOk: true },
  },
  {
    id: "bowling",
    canonicalLabel: "ボウリング場",
    aliases: ["ボウリング場", "ボウリング", "ボーリング"],
    category: "entertainment",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: true, longStayOk: false },
  },
  {
    id: "museum_art",
    canonicalLabel: "美術館",
    aliases: ["美術館", "ギャラリー"],
    category: "entertainment",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: false, longStayOk: true },
  },
  {
    id: "museum",
    canonicalLabel: "博物館",
    aliases: ["博物館"],
    category: "entertainment",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: false, longStayOk: true },
  },
  {
    id: "zoo",
    canonicalLabel: "動物園",
    aliases: ["動物園"],
    category: "entertainment",
    traits: { indoor: false, workFriendly: false, studyFriendly: false, noisy: true, longStayOk: true },
  },
  {
    id: "aquarium",
    canonicalLabel: "水族館",
    aliases: ["水族館"],
    category: "entertainment",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: false, longStayOk: true },
  },
  {
    id: "theme_park",
    canonicalLabel: "遊園地",
    aliases: ["遊園地", "テーマパーク"],
    category: "entertainment",
    traits: { indoor: false, workFriendly: false, studyFriendly: false, noisy: true, longStayOk: true },
  },
  {
    id: "livehouse",
    canonicalLabel: "ライブハウス",
    aliases: ["ライブハウス", "ライブ"],
    category: "entertainment",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: true, longStayOk: false },
  },

  // ─── コワーキング ─────────────────────────────────────────────────────────

  {
    id: "coworking",
    canonicalLabel: "コワーキングスペース",
    aliases: ["コワーキングスペース", "コワーキング"],
    category: "coworking",
    traits: { indoor: true, workFriendly: true, studyFriendly: true, noisy: false, longStayOk: true },
  },
  {
    id: "wework",
    canonicalLabel: "WeWork",
    aliases: ["WeWork", "wework", "ウィーワーク"],
    category: "coworking",
    traits: { indoor: true, workFriendly: true, studyFriendly: true, noisy: false, longStayOk: true },
  },
  {
    id: "regus",
    canonicalLabel: "リージャス",
    aliases: ["リージャス", "Regus", "regus"],
    category: "coworking",
    traits: { indoor: true, workFriendly: true, studyFriendly: true, noisy: false, longStayOk: true },
  },
  {
    id: "ii_office",
    canonicalLabel: "いいオフィス",
    aliases: ["いいオフィス"],
    category: "coworking",
    traits: { indoor: true, workFriendly: true, studyFriendly: true, noisy: false, longStayOk: true },
  },
  {
    id: "basis_point",
    canonicalLabel: "BasisPoint",
    aliases: ["BasisPoint", "ベーシスポイント", "basispoint"],
    category: "coworking",
    traits: { indoor: true, workFriendly: true, studyFriendly: true, noisy: false, longStayOk: true },
  },
  {
    id: "biz_circle",
    canonicalLabel: "ビズサークル",
    aliases: ["ビズサークル", "BIZcircle"],
    category: "coworking",
    traits: { indoor: true, workFriendly: true, studyFriendly: true, noisy: false, longStayOk: true },
  },
  {
    id: "the_hive",
    canonicalLabel: "The Hive",
    aliases: ["The Hive", "the hive", "ザ・ハイブ"],
    category: "coworking",
    traits: { indoor: true, workFriendly: true, studyFriendly: true, noisy: false, longStayOk: true },
  },

  // ─── ホテル・宿泊 ─────────────────────────────────────────────────────────

  {
    id: "hotel",
    canonicalLabel: "ホテル",
    aliases: ["ホテル"],
    category: "hotel",
    traits: { indoor: true, workFriendly: true, studyFriendly: false, noisy: false, longStayOk: true },
  },
  {
    id: "ryokan",
    canonicalLabel: "旅館",
    aliases: ["旅館"],
    category: "hotel",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: false, longStayOk: true },
  },
  {
    id: "onsen",
    canonicalLabel: "温泉",
    aliases: ["温泉", "銭湯", "スパ", "スーパー銭湯"],
    category: "hotel",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: false, longStayOk: true },
  },
  {
    id: "metropolitan_hotel",
    canonicalLabel: "ホテルメトロポリタン",
    aliases: ["ホテルメトロポリタン", "メトロポリタン"],
    category: "hotel",
    traits: { indoor: true, workFriendly: true, studyFriendly: false, noisy: false, longStayOk: true },
  },
  {
    id: "dormy_inn",
    canonicalLabel: "ドーミーイン",
    aliases: ["ドーミーイン", "Dormy Inn"],
    category: "hotel",
    traits: { indoor: true, workFriendly: true, studyFriendly: false, noisy: false, longStayOk: true },
  },
  {
    id: "apa_hotel",
    canonicalLabel: "アパホテル",
    aliases: ["アパホテル", "アパ", "APA"],
    category: "hotel",
    traits: { indoor: true, workFriendly: true, studyFriendly: false, noisy: false, longStayOk: true },
  },
  {
    id: "toyoko_inn",
    canonicalLabel: "東横イン",
    aliases: ["東横イン", "Toyoko Inn"],
    category: "hotel",
    traits: { indoor: true, workFriendly: true, studyFriendly: false, noisy: false, longStayOk: true },
  },
  {
    id: "richmond_hotel",
    canonicalLabel: "リッチモンドホテル",
    aliases: ["リッチモンドホテル", "リッチモンド"],
    category: "hotel",
    traits: { indoor: true, workFriendly: true, studyFriendly: false, noisy: false, longStayOk: true },
  },
  {
    id: "rihga_royal",
    canonicalLabel: "リーガロイヤルホテル",
    aliases: ["リーガロイヤルホテル", "リーガロイヤル"],
    category: "hotel",
    traits: { indoor: true, workFriendly: true, studyFriendly: false, noisy: false, longStayOk: true },
  },
  {
    id: "super_hotel",
    canonicalLabel: "スーパーホテル",
    aliases: ["スーパーホテル"],
    category: "hotel",
    traits: { indoor: true, workFriendly: true, studyFriendly: false, noisy: false, longStayOk: true },
  },

  // ─── レストラン ───────────────────────────────────────────────────────────

  {
    id: "restaurant",
    canonicalLabel: "レストラン",
    aliases: ["レストラン"],
    category: "restaurant",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: true, longStayOk: false },
  },
  {
    id: "izakaya",
    canonicalLabel: "居酒屋",
    aliases: ["居酒屋"],
    category: "restaurant",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: true, longStayOk: true },
  },
  {
    id: "ramen",
    canonicalLabel: "ラーメン屋",
    aliases: ["ラーメン屋", "ラーメン"],
    category: "restaurant",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: true, longStayOk: false },
  },
  {
    id: "sushi",
    canonicalLabel: "寿司屋",
    aliases: ["寿司屋", "寿司", "お寿司"],
    category: "restaurant",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: false, longStayOk: false },
  },
  {
    id: "yakiniku",
    canonicalLabel: "焼肉屋",
    aliases: ["焼肉屋", "焼肉", "焼き肉"],
    category: "restaurant",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: true, longStayOk: true },
  },
  {
    id: "curry",
    canonicalLabel: "カレー屋",
    aliases: ["カレー屋", "カレー"],
    category: "restaurant",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: false, longStayOk: false },
  },
  {
    id: "teishoku",
    canonicalLabel: "定食屋",
    aliases: ["定食屋", "定食"],
    category: "restaurant",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: true, longStayOk: false },
  },
  {
    id: "family_restaurant",
    canonicalLabel: "ファミレス",
    aliases: ["ファミリーレストラン", "ファミレス"],
    category: "restaurant",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: true, longStayOk: true },
  },
  {
    id: "bar",
    canonicalLabel: "バー",
    aliases: ["バー", "BAR", "bar"],
    category: "restaurant",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: false, longStayOk: true },
  },
  {
    id: "italian",
    canonicalLabel: "イタリアン",
    aliases: ["イタリアン", "イタリア料理", "パスタ屋"],
    category: "restaurant",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: false, longStayOk: false },
  },
  {
    id: "chinese",
    canonicalLabel: "中華料理",
    aliases: ["中華料理", "中華", "中華屋"],
    category: "restaurant",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: true, longStayOk: false },
  },
  {
    id: "washoku",
    canonicalLabel: "和食",
    aliases: ["和食", "和食屋", "日本料理"],
    category: "restaurant",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: false, longStayOk: false },
  },

  // ─── その他 ───────────────────────────────────────────────────────────────

  {
    id: "church",
    canonicalLabel: "教会",
    aliases: ["教会"],
    category: "other",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: false, longStayOk: false },
  },
  {
    id: "shrine",
    canonicalLabel: "神社",
    aliases: ["神社"],
    category: "other",
    traits: { indoor: false, workFriendly: false, studyFriendly: false, noisy: false, longStayOk: false },
  },
  {
    id: "temple",
    canonicalLabel: "お寺",
    aliases: ["お寺", "寺", "寺院"],
    category: "other",
    traits: { indoor: false, workFriendly: false, studyFriendly: false, noisy: false, longStayOk: false },
  },
  {
    id: "city_hall",
    canonicalLabel: "役所",
    aliases: ["役所", "市役所", "区役所", "町役場"],
    category: "other",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: false, longStayOk: false },
  },
  {
    id: "bank",
    canonicalLabel: "銀行",
    aliases: ["銀行", "ATM"],
    category: "other",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: false, longStayOk: false },
  },
  {
    id: "post_office",
    canonicalLabel: "郵便局",
    aliases: ["郵便局"],
    category: "other",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: false, longStayOk: false },
  },
  {
    id: "court",
    canonicalLabel: "裁判所",
    aliases: ["裁判所"],
    category: "other",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: false, longStayOk: false },
  },
  {
    id: "police",
    canonicalLabel: "警察署",
    aliases: ["警察署", "交番"],
    category: "other",
    traits: { indoor: true, workFriendly: false, studyFriendly: false, noisy: false, longStayOk: false },
  },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// マッチング用インデックス（長い別名から順にソート済み）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface AliasIndex {
  alias: string;
  entry: PlaceEntry;
}

/** 全別名を長い順にソートしたインデックス（初回アクセス時に構築） */
let _aliasIndex: AliasIndex[] | null = null;

function getAliasIndex(): AliasIndex[] {
  if (_aliasIndex) return _aliasIndex;

  const index: AliasIndex[] = [];
  for (const entry of PLACE_TABLE) {
    // canonicalLabel も検索対象に含める（重複排除）
    const allNames = Array.from(new Set([entry.canonicalLabel, ...entry.aliases]));
    for (const alias of allNames) {
      index.push({ alias, entry });
    }
  }
  // 長い文字列から先にマッチさせることで「モスバーガー」が「モス」より優先される
  index.sort((a, b) => b.alias.length - a.alias.length);

  _aliasIndex = index;
  return index;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// resolvePlace — テキストから場所を解決する
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * テキストに含まれる場所名を検出し、対応する PlaceEntry を返す。
 * 複数の候補がある場合は最も長い別名にマッチしたものを優先する。
 *
 * @param text - ユーザーの入力テキスト（例: 「スタバで作業する」）
 * @returns マッチした PlaceEntry、見つからなければ null
 */
export function resolvePlace(text: string): PlaceEntry | null {
  const result = resolvePlaceFromText(text);
  return result ? result.place : null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// resolvePlaceFromText — テキストから場所とマッチした別名を返す
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * テキストに含まれる場所名を検出し、PlaceEntry とマッチした別名の両方を返す。
 * 複数の候補がある場合は最も長い別名にマッチしたものを優先する。
 *
 * @param text - ユーザーの入力テキスト（例: 「マクドで昼ごはん」）
 * @returns place と matchedAlias のペア、見つからなければ null
 */
export function resolvePlaceFromText(
  text: string,
): { place: PlaceEntry; matchedAlias: string } | null {
  const index = getAliasIndex();
  const lower = text.toLowerCase();

  // テキスト内で最も早い位置にマッチした場所を返す（同じ位置なら長い別名優先）
  let bestMatch: { place: PlaceEntry; matchedAlias: string; pos: number } | null = null;

  for (const { alias, entry } of index) {
    const aliasLower = alias.toLowerCase();
    const pos = lower.indexOf(aliasLower);
    if (pos === -1) continue;
    if (!bestMatch || pos < bestMatch.pos || (pos === bestMatch.pos && alias.length > bestMatch.matchedAlias.length)) {
      bestMatch = { place: entry, matchedAlias: alias, pos };
    }
  }

  return bestMatch ? { place: bestMatch.place, matchedAlias: bestMatch.matchedAlias } : null;
}
