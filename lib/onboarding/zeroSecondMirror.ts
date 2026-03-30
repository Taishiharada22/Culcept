// lib/onboarding/zeroSecondMirror.ts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Zero-Second Mirror（0秒ミラー）v2
//
// 脳科学的根拠:
// 「予想外の正確さ」は最大の予測誤差 → 最大のドーパミン発火。
// 質問すらしていないのに「当たっている」感覚が、
// 「このアプリは本物だ」という確信を最初の3秒で作る。
//
// v2 ではブラウザから取得可能な全シグナルを組み合わせ、
// 「なんでわかるの？」レベルの具体性を実現する。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 1. Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Zero-Second Mirrorの出力 */
export interface ZeroMirrorResult {
  /** メインの鏡文（ユーザーへの第一声） */
  mirrorText: string;
  /** サブテキスト（一段深い心理的レイヤー） */
  subText: string | null;
  /** 使用されたシグナル一覧（デバッグ用） */
  signals: string[];
}

/** ブラウザから取得可能な全シグナル */
export interface MirrorContext {
  // --- Time signals ---
  hour: number;            // 0-23
  minute: number;          // 0-59
  dayOfWeek: number;       // 0=Sun, 6=Sat
  dayOfMonth: number;
  month: number;           // 0-11
  season: "spring" | "summer" | "autumn" | "winter";

  // --- Device signals ---
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  screenWidth: number;
  screenHeight: number;
  isSmallPhone: boolean;   // width <= 375
  isLargePhone: boolean;   // width > 375 && mobile
  userAgent: string;

  // --- Preference signals ---
  isDarkMode: boolean;
  prefersReducedMotion: boolean;
  language: string;        // e.g. "ja", "en", "ko"

  // --- Connection signals ---
  connectionType: string | null;  // "4g", "3g", "2g", "slow-2g", null
  isSlowConnection: boolean;

  // --- Battery signals ---
  batteryLevel: number | null;    // 0-1
  isCharging: boolean | null;

  // --- Navigation signals ---
  isReturnVisit: boolean;
  visitCount: number;
  referrer: string | null;
  isFromSearch: boolean;
  isFromSNS: boolean;
  isDirect: boolean;

  // --- Environment signals ---
  timezoneOffset: number;  // minutes from UTC
  hasTouchSupport: boolean;
}

type Season = MirrorContext["season"];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 2. Signal Collection
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const VISIT_KEY = "aneurasync_visit_v2";
const VISIT_COUNT_KEY = "aneurasync_visit_count_v2";

function getSeason(month: number): Season {
  if (month >= 2 && month <= 4) return "spring";
  if (month >= 5 && month <= 7) return "summer";
  if (month >= 8 && month <= 10) return "autumn";
  return "winter";
}

function detectReferrerType(ref: string | null): {
  isFromSearch: boolean;
  isFromSNS: boolean;
  isDirect: boolean;
} {
  if (!ref || ref === "") return { isFromSearch: false, isFromSNS: false, isDirect: true };
  const r = ref.toLowerCase();
  const isFromSearch = /google|yahoo|bing|duckduckgo|baidu|naver/.test(r);
  const isFromSNS = /twitter|x\.com|instagram|facebook|tiktok|line\.me|threads|reddit/.test(r);
  return { isFromSearch, isFromSNS, isDirect: !isFromSearch && !isFromSNS };
}

/**
 * ブラウザから取得可能な全シグナルを収集（クライアント専用）
 */
async function collectClientSignals(): Promise<MirrorContext> {
  const now = new Date();
  const month = now.getMonth();
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const isMobile = /iPhone|iPod|Android.*Mobile/i.test(ua);
  const isTablet = /iPad|Android(?!.*Mobile)/i.test(ua) || false;
  const isDesktop = !isMobile && !isTablet;

  let screenWidth = 0;
  let screenHeight = 0;
  let isDarkMode = false;
  let prefersReducedMotion = false;
  let language = "ja";
  let referrer: string | null = null;
  let hasTouchSupport = false;

  if (typeof window !== "undefined") {
    screenWidth = window.innerWidth || screen?.width || 0;
    screenHeight = window.innerHeight || screen?.height || 0;
    try { isDarkMode = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false; } catch { /* */ }
    try { prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false; } catch { /* */ }
    try { language = navigator.language?.split("-")[0] ?? "ja"; } catch { /* */ }
    try { referrer = document.referrer || null; } catch { /* */ }
    try { hasTouchSupport = "ontouchstart" in window || navigator.maxTouchPoints > 0; } catch { /* */ }
  }

  // Connection
  let connectionType: string | null = null;
  try {
    const conn = (navigator as any).connection;
    if (conn?.effectiveType) connectionType = conn.effectiveType;
  } catch { /* */ }

  // Battery
  let batteryLevel: number | null = null;
  let isCharging: boolean | null = null;
  try {
    const battery = await (navigator as any).getBattery?.();
    if (battery) {
      batteryLevel = battery.level;
      isCharging = battery.charging;
    }
  } catch { /* */ }

  // Visit tracking
  let isReturnVisit = false;
  let visitCount = 1;
  if (typeof localStorage !== "undefined") {
    try {
      const prev = localStorage.getItem(VISIT_KEY);
      isReturnVisit = prev !== null;
      const countRaw = localStorage.getItem(VISIT_COUNT_KEY);
      visitCount = countRaw ? parseInt(countRaw, 10) + 1 : 1;
      localStorage.setItem(VISIT_KEY, new Date().toISOString());
      localStorage.setItem(VISIT_COUNT_KEY, String(visitCount));
    } catch { /* */ }
  }

  const refType = detectReferrerType(referrer);

  return {
    hour: now.getHours(),
    minute: now.getMinutes(),
    dayOfWeek: now.getDay(),
    dayOfMonth: now.getDate(),
    month,
    season: getSeason(month),
    isMobile,
    isTablet,
    isDesktop,
    screenWidth,
    screenHeight,
    isSmallPhone: isMobile && screenWidth <= 375,
    isLargePhone: isMobile && screenWidth > 375,
    userAgent: ua,
    isDarkMode,
    prefersReducedMotion,
    language,
    connectionType,
    isSlowConnection: connectionType === "2g" || connectionType === "slow-2g" || connectionType === "3g",
    batteryLevel,
    isCharging,
    isReturnVisit,
    visitCount,
    referrer,
    isFromSearch: refType.isFromSearch,
    isFromSNS: refType.isFromSNS,
    isDirect: refType.isDirect,
    timezoneOffset: now.getTimezoneOffset(),
    hasTouchSupport,
  };
}

/**
 * サーバーサイド用の最小シグナル構築
 */
function buildServerContext(): MirrorContext {
  const now = new Date();
  const month = now.getMonth();
  return {
    hour: now.getHours(),
    minute: now.getMinutes(),
    dayOfWeek: now.getDay(),
    dayOfMonth: now.getDate(),
    month,
    season: getSeason(month),
    isMobile: false,
    isTablet: false,
    isDesktop: true,
    screenWidth: 0,
    screenHeight: 0,
    isSmallPhone: false,
    isLargePhone: false,
    userAgent: "",
    isDarkMode: false,
    prefersReducedMotion: false,
    language: "ja",
    connectionType: null,
    isSlowConnection: false,
    batteryLevel: null,
    isCharging: null,
    isReturnVisit: false,
    visitCount: 1,
    referrer: null,
    isFromSearch: false,
    isFromSNS: false,
    isDirect: true,
    timezoneOffset: -540, // JST
    hasTouchSupport: false,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 3. Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const isWeekday = (ctx: MirrorContext) => ctx.dayOfWeek >= 1 && ctx.dayOfWeek <= 5;
const isWeekend = (ctx: MirrorContext) => ctx.dayOfWeek === 0 || ctx.dayOfWeek === 6;
const isDeepNight = (ctx: MirrorContext) => ctx.hour >= 1 && ctx.hour < 5;
const isLateNight = (ctx: MirrorContext) => ctx.hour >= 23 || ctx.hour === 0;
const isMorning = (ctx: MirrorContext) => ctx.hour >= 6 && ctx.hour < 10;
const isLunchTime = (ctx: MirrorContext) => ctx.hour >= 12 && ctx.hour < 14;
const isAfternoon = (ctx: MirrorContext) => ctx.hour >= 14 && ctx.hour < 17;
const isEvening = (ctx: MirrorContext) => ctx.hour >= 17 && ctx.hour < 21;
const isNight = (ctx: MirrorContext) => ctx.hour >= 21 && ctx.hour < 24;
const isLowBattery = (ctx: MirrorContext) => ctx.batteryLevel !== null && ctx.batteryLevel < 0.2;
const isCriticalBattery = (ctx: MirrorContext) => ctx.batteryLevel !== null && ctx.batteryLevel < 0.1;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 4. Mirror Rules — 30+ combination patterns
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface MirrorRule {
  id: string;
  condition: (ctx: MirrorContext) => boolean;
  priority: number;
  generate: (ctx: MirrorContext) => ZeroMirrorResult;
}

const RULES: MirrorRule[] = [

  // ════════════════════════════════════════════════════════════════
  // TIER 1: Ultra-specific multi-signal combos (priority 200+)
  // ════════════════════════════════════════════════════════════════

  // #1 — 深夜 + スマホ + ダークモード + リピーター
  {
    id: "night_mobile_dark_return",
    priority: 250,
    condition: (ctx) =>
      isDeepNight(ctx) && ctx.isMobile && ctx.isDarkMode && ctx.isReturnVisit,
    generate: () => ({
      mirrorText:
        "真夜中にダークモードでここに戻ってきた。\nこんな時間に「自分」を覗きに来る人って、\n昼間は周りに合わせすぎて、自分を後回しにしてるタイプだったりしない？",
      subText:
        "しかも初めてじゃない。前回モヤっとしたまま閉じて、結局また来てる。その引っかかりは正しい。",
      signals: ["deepNight", "mobile", "darkMode", "returnVisit"],
    }),
  },

  // #2 — 平日朝 + デスクトップ + 初回 + 検索から
  {
    id: "weekday_morning_desktop_search_first",
    priority: 248,
    condition: (ctx) =>
      isWeekday(ctx) && isMorning(ctx) && ctx.isDesktop && !ctx.isReturnVisit && ctx.isFromSearch,
    generate: () => ({
      mirrorText:
        "仕事中にこっそり開いてるでしょう。\n本当はやるべきことがあるのに、自分のことが気になって検索した。\nその好奇心、合ってるよ。",
      subText:
        "「自分を知りたい」って検索する人は、今の自分に収まりきれてない人。その直感は当たってる。",
      signals: ["weekdayMorning", "desktop", "firstVisit", "fromSearch"],
    }),
  },

  // #3 — 深夜 + バッテリー低い + スマホ
  {
    id: "night_low_battery_mobile",
    priority: 246,
    condition: (ctx) =>
      (isLateNight(ctx) || isDeepNight(ctx)) && isLowBattery(ctx) && ctx.isMobile,
    generate: (ctx) => ({
      mirrorText: `バッテリー${Math.round((ctx.batteryLevel ?? 0) * 100)}%なのに充電より先にこれを開いた。\n「後でいいこと」を後にできない性格でしょう？\nでも自分のケアだけは、いつも「後で」にしてない？`,
      subText:
        "電池残量が少ないときの選択は、無意識の優先順位がモロに出る。今あなたは「自分」を選んだ。",
      signals: ["lateNight", "lowBattery", "mobile"],
    }),
  },

  // #4 — 日曜夜 + スマホ + ダークモード
  {
    id: "sunday_night_mobile_dark",
    priority: 244,
    condition: (ctx) =>
      ctx.dayOfWeek === 0 && isNight(ctx) && ctx.isMobile && ctx.isDarkMode,
    generate: () => ({
      mirrorText:
        "日曜の夜、暗い部屋でスマホを握ってる。\n明日からまた「別の自分」を演じなきゃいけない。\nその切り替えのコストが、年々重くなってない？",
      subText:
        "月曜が怖いんじゃない。「本当の自分」と「演じてる自分」のギャップが大きくなってるだけ。",
      signals: ["sundayNight", "mobile", "darkMode"],
    }),
  },

  // #5 — 金曜夜 + スマホ + SNSから
  {
    id: "friday_night_mobile_sns",
    priority: 242,
    condition: (ctx) =>
      ctx.dayOfWeek === 5 && isEvening(ctx) && ctx.isMobile && ctx.isFromSNS,
    generate: () => ({
      mirrorText:
        "金曜の夜、SNS経由でここに来た。\n他人のキラキラより、自分のことが気になった。\nそれ、比較疲れのサインかもしれない。",
      subText:
        "他人を覗いた後に自分を覗きに来る——その順番に本音が見える。",
      signals: ["fridayEvening", "mobile", "fromSNS"],
    }),
  },

  // #6 — 平日昼 + デスクトップ + リピーター
  {
    id: "weekday_lunch_desktop_return",
    priority: 240,
    condition: (ctx) =>
      isWeekday(ctx) && isLunchTime(ctx) && ctx.isDesktop && ctx.isReturnVisit,
    generate: () => ({
      mirrorText:
        "昼休みにまた開いてる。\n前回見た結果が気になってた？ それとも、午前中に何かモヤっとすることがあった？",
      subText:
        "仕事の合間に自分のことを考える人は、「このままでいいのかな」って感覚を無視できない人。",
      signals: ["weekdayLunch", "desktop", "returnVisit"],
    }),
  },

  // #7 — 早朝 + スマホ + 充電中
  {
    id: "early_morning_mobile_charging",
    priority: 238,
    condition: (ctx) =>
      ctx.hour >= 5 && ctx.hour < 7 && ctx.isMobile && ctx.isCharging === true,
    generate: () => ({
      mirrorText:
        "目が覚めて、まだ布団の中で充電しながらこれを見てる。\n一日が始まる前の、誰にも邪魔されない数分間。\nこの時間の使い方が、あなたの優先順位を全部語ってる。",
      subText:
        "SNSでもニュースでもなく、自分のことを開いた。それだけで、あなたが何を大事にしてるかわかる。",
      signals: ["earlyMorning", "mobile", "charging"],
    }),
  },

  // #8 — 土曜午後 + タブレット/デスクトップ + 初回
  {
    id: "saturday_afternoon_big_screen_first",
    priority: 236,
    condition: (ctx) =>
      ctx.dayOfWeek === 6 && isAfternoon(ctx) && (ctx.isTablet || ctx.isDesktop) && !ctx.isReturnVisit,
    generate: () => ({
      mirrorText:
        "土曜の午後に、大きな画面でゆっくり見に来た。\n「なんとなく」じゃない。ちゃんと時間を取って、自分と向き合おうとしてる。",
      subText:
        "その丁寧さが、たぶんあなたの強みでもあり、弱点でもある。準備しすぎて動けなくなること、ない？",
      signals: ["saturdayAfternoon", "bigScreen", "firstVisit"],
    }),
  },

  // #9 — 深夜 + 遅い回線 + スマホ
  {
    id: "night_slow_connection_mobile",
    priority: 234,
    condition: (ctx) =>
      isDeepNight(ctx) && ctx.isSlowConnection && ctx.isMobile,
    generate: () => ({
      mirrorText:
        "回線が遅い深夜に、読み込みを待ってまでここにいる。\nせっかちなのに諦めが悪い——矛盾してるようで、\nそれが「本気で知りたいことがあるときの自分」なんじゃない？",
      subText:
        "昼間は3秒で離脱するのに、深夜は待てる。その差分が「建前の自分」と「本音の自分」の距離。",
      signals: ["deepNight", "slowConnection", "mobile"],
    }),
  },

  // #10 — 平日夕方 + スマホ + ダークモード + 検索から
  {
    id: "weekday_evening_mobile_dark_search",
    priority: 232,
    condition: (ctx) =>
      isWeekday(ctx) && isEvening(ctx) && ctx.isMobile && ctx.isDarkMode && ctx.isFromSearch,
    generate: () => ({
      mirrorText:
        "仕事終わりの電車の中、暗い画面で検索してここに来た。\n帰り道って、一日の中で一番「素」に戻る時間。\n今のあなたが一番正直なあなた。",
      subText:
        "通勤電車で自分のことを調べる人は、日中の自分にどこか嘘をついてる。その嘘が何か、わかる？",
      signals: ["weekdayEvening", "mobile", "darkMode", "fromSearch"],
    }),
  },

  // ════════════════════════════════════════════════════════════════
  // TIER 2: Strong 2-3 signal combos (priority 150-199)
  // ════════════════════════════════════════════════════════════════

  // #11 — リピーター + 3回目以上
  {
    id: "frequent_returner",
    priority: 195,
    condition: (ctx) => ctx.visitCount >= 3,
    generate: (ctx) => ({
      mirrorText: `${ctx.visitCount}回目。気になって戻ってきてしまう自分に気づいてる？\n「もういいや」って思えないのは、まだ腑に落ちてない何かがあるから。\nその引っかかりを無視できないのが、あなたの性質。`,
      subText:
        "何度も来る人は完璧主義か、自分への問いが深い人。どっちにしても、中途半端が許せないタイプ。",
      signals: ["frequentReturn", `visitCount:${ctx.visitCount}`],
    }),
  },

  // #12 — バッテリー残り僅か + どの時間でも
  {
    id: "critical_battery",
    priority: 192,
    condition: (ctx) => isCriticalBattery(ctx),
    generate: (ctx) => ({
      mirrorText: `バッテリー${Math.round((ctx.batteryLevel ?? 0) * 100)}%。\n電池が切れる前に開いたのがこのページ。\nその瞬間の選択に、あなたの無意識が出てる。`,
      subText:
        "限られた時間で何を選ぶか——それが「本当に大事にしてること」のリトマス試験紙。",
      signals: ["criticalBattery"],
    }),
  },

  // #13 — 深夜 + ダークモード + 初回
  {
    id: "night_dark_first_visit",
    priority: 190,
    condition: (ctx) =>
      isDeepNight(ctx) && ctx.isDarkMode && !ctx.isReturnVisit,
    generate: () => ({
      mirrorText:
        "夜中に初めてここに来た。\n眠れない夜に「自分」を検索するのは、\n昼間の自分では答えが出ないことがあるから。",
      subText:
        "夜の脳は論理より直感が優位。今のあなたの直感を、信じていい。",
      signals: ["deepNight", "darkMode", "firstVisit"],
    }),
  },

  // #14 — 週末朝 + スマホ + ベッドサイズ（小さい画面）
  {
    id: "weekend_morning_small_phone",
    priority: 188,
    condition: (ctx) =>
      isWeekend(ctx) && isMorning(ctx) && ctx.isSmallPhone,
    generate: () => ({
      mirrorText:
        "週末の朝、枕元のスマホでこれを見てる。\n予定がない朝ほど、自分のことを考える余裕が生まれる。\nその余裕が、実は一番贅沢な時間。",
      subText:
        "忙しさで埋めてた空白が空いたとき、最初に浮かぶことが「あなたの本音」。",
      signals: ["weekendMorning", "smallPhone"],
    }),
  },

  // #15 — 月曜朝 + スマホ + SNSから
  {
    id: "monday_morning_mobile_sns",
    priority: 186,
    condition: (ctx) =>
      ctx.dayOfWeek === 1 && isMorning(ctx) && ctx.isMobile && ctx.isFromSNS,
    generate: () => ({
      mirrorText:
        "月曜の朝、SNSを見てたらここに辿り着いた。\n週明けの憂鬱から逃げたかった？\nそれとも、今週こそ何か変えたかった？",
      subText:
        "どっちでもいい。「今のままじゃない自分」を求めてる時点で、もう変わり始めてる。",
      signals: ["mondayMorning", "mobile", "fromSNS"],
    }),
  },

  // #16 — 午後 + デスクトップ + ライトモード + 初回
  {
    id: "afternoon_desktop_light_first",
    priority: 184,
    condition: (ctx) =>
      isAfternoon(ctx) && ctx.isDesktop && !ctx.isDarkMode && !ctx.isReturnVisit,
    generate: () => ({
      mirrorText:
        "午後の明るい画面で、初めてここを開いた。\n「ちゃんと見てから判断しよう」という人。\n慎重なのはいいけど、直感も同じくらい賢いよ。",
      subText:
        "考えすぎて動けないより、感じたまま進む方が合ってる場面もある。今がそれかも。",
      signals: ["afternoon", "desktop", "lightMode", "firstVisit"],
    }),
  },

  // #17 — 夜 + スマホ + ダークモード + 直接アクセス
  {
    id: "night_mobile_dark_direct",
    priority: 182,
    condition: (ctx) =>
      isNight(ctx) && ctx.isMobile && ctx.isDarkMode && ctx.isDirect,
    generate: () => ({
      mirrorText:
        "URLを直接入力して、夜に戻ってきた。\nブックマークか、頭の中にここがあった。\nあなたにとって、ここは「気になる場所」になり始めてる。",
      subText:
        "何かが引っかかると手放せないタイプでしょう。その粘り強さは才能。",
      signals: ["night", "mobile", "darkMode", "directAccess"],
    }),
  },

  // #18 — 深夜 + スマホ + バッテリー満タン + 充電中
  {
    id: "night_mobile_full_battery_charging",
    priority: 180,
    condition: (ctx) =>
      isDeepNight(ctx) && ctx.isMobile && ctx.isCharging === true && (ctx.batteryLevel ?? 0) > 0.8,
    generate: () => ({
      mirrorText:
        "充電しながら夜更かし。バッテリーは満タンに近いのに、まだ手放せない。\n寝ればいいのに寝ない。その「まだ足りない」感じ、いつもある？",
      subText:
        "充分なはずなのに満たされない——その感覚の正体を知ると、昼間の行動が変わる。",
      signals: ["deepNight", "mobile", "charging", "highBattery"],
    }),
  },

  // #19 — 水曜夜（週の真ん中）
  {
    id: "wednesday_night",
    priority: 175,
    condition: (ctx) =>
      ctx.dayOfWeek === 3 && isNight(ctx),
    generate: () => ({
      mirrorText:
        "水曜の夜——週の折り返し地点で自分を覗きに来た。\n「このまま今週を終えていいのか」って、\n体が勝手に問いかけてこなかった？ その焦りは成長欲の裏返し。",
      subText:
        "週の真ん中に立ち止まれる人は、惰性で生きることに耐えられない人。その不器用さが武器になる。",
      signals: ["wednesdayNight"],
    }),
  },

  // #20 — 英語設定 + 日本のタイムゾーン
  {
    id: "english_in_japan",
    priority: 172,
    condition: (ctx) =>
      ctx.language === "en" && ctx.timezoneOffset === -540,
    generate: () => ({
      mirrorText:
        "端末は英語設定。でも日本時間で生活してる。\n二つの言語の間にいる人は、二つの自分を持ってる。\nどっちが「本当の自分」か、決めなくていい。",
      subText:
        "言語が変わると性格も変わる。その「変わる幅」が、あなたの可能性の広さそのもの。",
      signals: ["englishLanguage", "japanTimezone"],
    }),
  },

  // #21 — 日本語以外 + 初回訪問
  {
    id: "non_japanese_first_visit",
    priority: 170,
    condition: (ctx) =>
      ctx.language !== "ja" && !ctx.isReturnVisit,
    generate: (ctx) => ({
      mirrorText:
        `${ctx.language === "ko" ? "韓国語" : ctx.language === "zh" ? "中国語" : ctx.language === "en" ? "英語" : ctx.language}の設定で初めて来た。\n母国語じゃないサービスを試す好奇心がある。\nその「境界を越える」癖が、あなたの武器。`,
      subText:
        "コンフォートゾーンの外に出られる人は、自分の内面も深く探れる。",
      signals: ["nonJapanese", "firstVisit", `lang:${ctx.language}`],
    }),
  },

  // #22 — 減らされたモーション設定
  {
    id: "reduced_motion_user",
    priority: 168,
    condition: (ctx) => ctx.prefersReducedMotion,
    generate: () => ({
      mirrorText:
        "アニメーションを減らす設定にしてる。\n余計な刺激を排除できる人は、本質を見抜く力がある。\nノイズに流されない、静かな強さ。",
      subText:
        "「足す」より「引く」ことで本質に辿り着くタイプ。その感覚を信じていい。",
      signals: ["reducedMotion"],
    }),
  },

  // #23 — 大きい画面のスマホ + 夜
  {
    id: "large_phone_night",
    priority: 165,
    condition: (ctx) =>
      ctx.isLargePhone && isNight(ctx),
    generate: () => ({
      mirrorText:
        "大きいスマホで夜に見てる。\n動画もゲームも買い物もできるのに、「自分を知る」を選んだ。\nその選択が、もう答えの一部。",
      subText:
        "娯楽より自己理解を選ぶ夜は、転機の前触れであることが多い。",
      signals: ["largePhone", "night"],
    }),
  },

  // ════════════════════════════════════════════════════════════════
  // TIER 3: Solid single/double signal patterns (priority 100-149)
  // ════════════════════════════════════════════════════════════════

  // #24a — 日曜午後 + スマホ（退屈/先延ばし）
  {
    id: "sunday_afternoon_mobile",
    priority: 145,
    condition: (ctx) =>
      ctx.dayOfWeek === 0 && isAfternoon(ctx) && ctx.isMobile,
    generate: () => ({
      mirrorText:
        "日曜の午後にスマホでここにいる。\nやることはあるのに手がつかない——\nそれ、退屈じゃなくて「本当にやりたいことが別にある」って体が言ってる。",
      subText:
        "先延ばしは怠けじゃない。「今やってることは本質じゃない」という直感の表れ。その直感、合ってる。",
      signals: ["sundayAfternoon", "mobile"],
    }),
  },

  // #24b — 土曜夜 + スマホ（FOMO / 社交疲れ）
  {
    id: "saturday_night_mobile",
    priority: 143,
    condition: (ctx) =>
      ctx.dayOfWeek === 6 && isNight(ctx) && ctx.isMobile,
    generate: () => ({
      mirrorText:
        "土曜の夜にスマホで自分を覗きに来た。\n遊びにも行けたはずなのに、こっちを選んだ。\n「人といるより一人がラク」って感じ始めてない？",
      subText:
        "社交的に見えて、実はひとりの時間で充電するタイプかもしれない。",
      signals: ["saturdayNight", "mobile"],
    }),
  },

  // #24c — 平日午後 + スマホ + リピーター（仕事エスケープ）
  {
    id: "weekday_afternoon_mobile_return",
    priority: 141,
    condition: (ctx) =>
      isWeekday(ctx) && isAfternoon(ctx) && ctx.isMobile && ctx.isReturnVisit,
    generate: () => ({
      mirrorText:
        "平日の午後にまた来てる。\n午後は「本音の自分」が顔を出す時間。\n今の仕事、心の底から楽しめてる？　答えに詰まったなら、それが答え。",
      subText:
        "「もう一回見ておこう」の裏に「今の環境への違和感」が隠れてたりしない？",
      signals: ["weekdayAfternoon", "mobile", "returnVisit"],
    }),
  },

  // #24 — 日曜夜
  {
    id: "sunday_night",
    priority: 140,
    condition: (ctx) => ctx.dayOfWeek === 0 && isNight(ctx),
    generate: () => ({
      mirrorText:
        "日曜の夜にここにいる。\n明日への漠然とした不安、あるでしょう。\nでもそれ「退屈」で片付けてない？　本当はもっと具体的な不満がある。",
      subText:
        "月曜が嫌なんじゃなくて、月曜の自分が嫌なんでしょう？",
      signals: ["sundayNight"],
    }),
  },

  // #25 — 金曜夜
  {
    id: "friday_night",
    priority: 138,
    condition: (ctx) => ctx.dayOfWeek === 5 && isEvening(ctx),
    generate: () => ({
      mirrorText:
        "金曜の夜。\n解放感の中にいるはずなのに、ここを開いた。\n自由な時間に何をするかで、その人の本質が見える。",
      subText:
        "「やりたいこと」じゃなくて「気になること」を選んだ。その差が大事。",
      signals: ["fridayEvening"],
    }),
  },

  // #26 — 深夜 + スマホ
  {
    id: "deep_night_mobile",
    priority: 135,
    condition: (ctx) => isDeepNight(ctx) && ctx.isMobile,
    generate: () => ({
      mirrorText:
        "深夜にスマホで自分を探してる。\n眠れないの？ それとも、まだ寝たくないの？\nどちらにしても、「今の自分」から離れたい気持ちがある。",
      subText:
        "深夜の衝動に従える人は、昼間に我慢しすぎてる人。その我慢が何か、見えてくる。",
      signals: ["deepNight", "mobile"],
    }),
  },

  // #27 — SNSから来た
  {
    id: "from_sns",
    priority: 130,
    condition: (ctx) => ctx.isFromSNS,
    generate: () => ({
      mirrorText:
        "SNS経由でここに来た。\n他の投稿は流せたのに、これだけ流せなかった。\n自分のことになると急にスルーできなくなるタイプでしょう？",
      subText:
        "フィードの中で手が止まるものに、あなたの価値観が全部出てる。",
      signals: ["fromSNS"],
    }),
  },

  // #28 — 検索から来た + 初回
  {
    id: "from_search_first",
    priority: 128,
    condition: (ctx) => ctx.isFromSearch && !ctx.isReturnVisit,
    generate: () => ({
      mirrorText:
        "わざわざ検索してここに来た。\nタイムラインを眺めるんじゃなくて、自分から探しに行った。\nその「答えを取りに行く癖」、普段から強いでしょう？",
      subText:
        "人に聞くより先に調べる人。でも自分のことだけは後回しにしてたりしない？",
      signals: ["fromSearch", "firstVisit"],
    }),
  },

  // #29 — 平日昼 + スマホ
  {
    id: "weekday_daytime_mobile",
    priority: 125,
    condition: (ctx) =>
      isWeekday(ctx) && ctx.hour >= 10 && ctx.hour < 17 && ctx.isMobile,
    generate: () => ({
      mirrorText:
        "平日の昼間にスマホでこっそり開いてる。\nやるべきことがあるのに、自分のことが頭をよぎった。\nそれ、「今の環境に本気で没頭できてない」サインかもしれない。",
      subText:
        "義務の隙間に無意識で選ぶものが「本当の関心」。仕事じゃなくて、自分を選んでる。",
      signals: ["weekdayDaytime", "mobile"],
    }),
  },

  // #30 — 週末昼 + デスクトップ
  {
    id: "weekend_desktop_daytime",
    priority: 122,
    condition: (ctx) =>
      isWeekend(ctx) && ctx.hour >= 10 && ctx.hour < 18 && ctx.isDesktop,
    generate: () => ({
      mirrorText:
        "週末に腰を据えてPCで見に来た。\nちゃんと向き合おうとしてる。\nその覚悟があるなら、ここはかなり深いところまで連れていける。",
      subText:
        "「ちょっと見てみよう」じゃなくて「ちゃんと知りたい」。その温度差が結果を変える。",
      signals: ["weekendDaytime", "desktop"],
    }),
  },

  // #31 — リピーター + ダークモード
  {
    id: "return_dark_mode",
    priority: 120,
    condition: (ctx) => ctx.isReturnVisit && ctx.isDarkMode,
    generate: () => ({
      mirrorText:
        "また来た。しかもダークモードで。\n光を絞って、集中して見ようとしてる。\nその没入の仕方が、あなたの性格を物語ってる。",
      subText:
        "表面だけ見て帰る人は戻ってこない。戻ってくる人は、もっと深い層を感じ取ってる。",
      signals: ["returnVisit", "darkMode"],
    }),
  },

  // #32 — タブレット（どの時間でも）
  {
    id: "tablet_user",
    priority: 115,
    condition: (ctx) => ctx.isTablet,
    generate: () => ({
      mirrorText:
        "タブレットで見てる。\nスマホほど衝動的じゃなく、PCほど仕事モードでもない。\nちょうどいい距離感で自分を見つめようとしてる。",
      subText:
        "道具の選び方に性格が出る。距離を保ちつつ近づく——あなたの人間関係もそう？",
      signals: ["tablet"],
    }),
  },

  // #33 — 遅い回線
  {
    id: "slow_connection",
    priority: 112,
    condition: (ctx) => ctx.isSlowConnection,
    generate: () => ({
      mirrorText:
        "通信が遅いのに離脱しなかった。\n普段は読み込み遅いだけでイラッとするでしょう？\nそれでも待ったのは、今「本気で気になってること」があるから。",
      subText:
        "忍耐力があるんじゃなくて、優先度が高いだけ。今、自分のことが最優先になってる。",
      signals: ["slowConnection"],
    }),
  },

  // #34 — 充電中 + ダークモード
  {
    id: "charging_dark",
    priority: 110,
    condition: (ctx) => ctx.isCharging === true && ctx.isDarkMode,
    generate: () => ({
      mirrorText:
        "充電しながらダークモードで読んでる。\nスマホを休ませながら、自分は休まない。\n「自分のケアより先にデバイスのケア」になってない？",
      subText:
        "スマホには充電するのに、自分には充電しない人が多い。今ここにいるのは、無意識のセルフケアかもしれない。",
      signals: ["charging", "darkMode"],
    }),
  },

  // ════════════════════════════════════════════════════════════════
  // TIER 4: Time-based with psychological depth (priority 50-99)
  // ════════════════════════════════════════════════════════════════

  // #35 — 月曜朝
  {
    id: "monday_morning",
    priority: 90,
    condition: (ctx) => ctx.dayOfWeek === 1 && isMorning(ctx),
    generate: () => ({
      mirrorText:
        "月曜の朝に自分を見つめようとしてる。\n「リセット」を求めてる。\n区切りを大切にする人ほど、その区切りに自分を賭けてる。",
      subText:
        "毎週リセットしなきゃいけないのは、平日の自分が本当の自分じゃないから。",
      signals: ["mondayMorning"],
    }),
  },

  // #36 — 深夜
  {
    id: "deep_night",
    priority: 85,
    condition: (ctx) => isDeepNight(ctx),
    generate: () => ({
      mirrorText:
        "深夜に自分と向き合おうとしてる。\n昼間は他者のために感情を使いすぎてる。\n夜だけが、自分のための時間になってない？",
      subText:
        "昼のあなたと夜のあなたの差分が、一番重要なデータになる。",
      signals: ["deepNight"],
    }),
  },

  // #37 — 早朝
  {
    id: "early_morning",
    priority: 80,
    condition: (ctx) => ctx.hour >= 5 && ctx.hour < 7,
    generate: () => ({
      mirrorText:
        "早朝に動き出す人は、「一日の設計図」を無意識に描いてる。\n計画性が高い反面、予想外に弱い。\nでもその弱さを知ってるだけで、だいぶ楽になる。",
      subText:
        "朝の明晰さの中で自分を見つめる——最高のタイミングを選んでる。",
      signals: ["earlyMorning"],
    }),
  },

  // #38 — 夜
  {
    id: "late_night",
    priority: 75,
    condition: (ctx) => isLateNight(ctx),
    generate: () => ({
      mirrorText:
        "寝る前に自分を振り返ろうとしてる。\n感情を未処理のまま翌日に持ち越すのが嫌なタイプでしょう？\nそれは感情の整理能力が高い証拠。",
      subText:
        "今日の感情を記録できると、明日の自分がクリアになる。",
      signals: ["lateNight"],
    }),
  },

  // #39 — 昼休み（平日）
  {
    id: "weekday_lunch",
    priority: 70,
    condition: (ctx) => isWeekday(ctx) && isLunchTime(ctx),
    generate: () => ({
      mirrorText:
        "昼休みに自分を覗きに来た。\n午前中に何かモヤっとした？\nそれとも、ただ退屈だった？ どっちも手がかりになる。",
      subText:
        "限られた休憩時間にこれを選んだ。その優先順位づけの癖が、あなたを表してる。",
      signals: ["weekdayLunch"],
    }),
  },

  // #40 — 春
  {
    id: "spring_season",
    priority: 55,
    condition: (ctx) => ctx.season === "spring",
    generate: () => ({
      mirrorText:
        "春に自分を見つめ始めた。\n新年度の区切りがないと動けないタイプ？\nでも本当は、もっと前から気になってたんじゃない？",
      subText:
        "「ちょうどいいタイミング」を待つ人は、実は始めなかった言い訳を探してただけかもしれない。",
      signals: ["spring"],
    }),
  },

  // #40b — 夏
  {
    id: "summer_season",
    priority: 53,
    condition: (ctx) => ctx.season === "summer",
    generate: () => ({
      mirrorText:
        "夏に自分を見つめようとしてる。\n周りが楽しそうにしてると、余計に「自分はこれでいいのか」ってなるでしょう？\nその焦りは、ちゃんと自分の人生を生きたい証拠。",
      subText:
        "夏の開放感は、普段フタをしてる感情も一緒に開けてしまう。今出てきた感情を逃さないで。",
      signals: ["summer"],
    }),
  },

  // #40c — 秋
  {
    id: "autumn_season",
    priority: 51,
    condition: (ctx) => ctx.season === "autumn",
    generate: () => ({
      mirrorText:
        "秋に内省的になるのは自然なこと。\nでもあなたの場合、「なんとなく物思いにふける」じゃなくて\n「ちゃんと自分を整理したい」でしょう？ その真面目さ、周りは気づいてないかも。",
      subText:
        "一年で最も思考がクリアになる季節。頭の中のモヤモヤを言語化するなら、今がベスト。",
      signals: ["autumn"],
    }),
  },

  // #41 — 冬
  {
    id: "winter_season",
    priority: 52,
    condition: (ctx) => ctx.season === "winter",
    generate: () => ({
      mirrorText:
        "冬に自分と向き合おうとしてる。\n寒い時期に内側に潜る人は、普段から感情を溜め込みやすいタイプ。\n「大丈夫」って言いすぎてない？",
      subText:
        "冬は人が一番正直になる季節。外に出るエネルギーが減る分、内面に向かう力が強くなる。",
      signals: ["winter"],
    }),
  },

  // ════════════════════════════════════════════════════════════════
  // TIER 5: Basic time-of-day fallbacks (priority 20-49)
  // ════════════════════════════════════════════════════════════════

  // #42 — 朝デフォルト
  {
    id: "morning_default",
    priority: 30,
    condition: (ctx) => isMorning(ctx),
    generate: () => ({
      mirrorText:
        "朝一番に自分のことを考える人は、\n昨日の自分に少し不満がある人。\n「今日は違う自分になれるかも」って、毎朝どこかで思ってない？",
      subText: "まだ社会のフィルターがかかる前の、素の判断力。今のあなたが一番信頼できる。",
      signals: ["morning"],
    }),
  },

  // #43 — 午後デフォルト
  {
    id: "afternoon_default",
    priority: 28,
    condition: (ctx) => isAfternoon(ctx),
    generate: () => ({
      mirrorText:
        "午後に開いたってことは、午前中に何か引っかかることがあった？\nモヤモヤを放置できない人は、自分に嘘をつくのが下手な人。\nそれ、長所だよ。",
      subText: "午後の脳は分析より直感が冴える。今感じてることを、そのまま信じていい。",
      signals: ["afternoon"],
    }),
  },

  // #44 — 夕方デフォルト
  {
    id: "evening_default",
    priority: 26,
    condition: (ctx) => isEvening(ctx),
    generate: () => ({
      mirrorText:
        "夕方にここを開いた。\n一日の感情を持ち帰らないように整理する癖、ない？\n「しっかりしてる」って言われるけど、本人はそう思ってないでしょう？",
      subText: "「しっかりしてる人」ほど、本当は誰かに理解されたがってる。",
      signals: ["evening"],
    }),
  },

  // #45 — 夜デフォルト
  {
    id: "night_default",
    priority: 24,
    condition: (ctx) => isNight(ctx),
    generate: () => ({
      mirrorText:
        "夜に自分のことが気になり出す人は、\n昼間ずっと「誰かのため」に頭を使ってた人。\n一人になった途端に、自分のことが溢れてきたでしょう？",
      subText:
        "一日の終わりに自分に戻ってくる感覚——それは、昼間の自分が少しだけ「借り物」だってこと。",
      signals: ["night"],
    }),
  },

  // ════════════════════════════════════════════════════════════════
  // TIER 6: Universal fallback (priority 0)
  // ════════════════════════════════════════════════════════════════

  // ════════════════════════════════════════════════════════════════
  // TIER 2.5: Contextual lifestyle patterns (priority 170-195)
  // ════════════════════════════════════════════════════════════════

  // #NEW1 — 昼休み + モバイル（職場で密かにアクセス）
  {
    id: "lunch_mobile_break",
    priority: 180,
    condition: (ctx) => isLunchTime(ctx) && ctx.isMobile && isWeekday(ctx),
    generate: () => ({
      mirrorText: "お昼休みにここを開いた。\n仕事の合間に「自分のこと」を考えたくなった？\nそういう衝動って、何かが変わり始めてるサインだったりする。",
      subText: "ランチの時間を自分に使うの、けっこう珍しい行動だよ",
      signals: ["lunchtime", "mobile", "weekday"],
    }),
  },

  // #NEW2 — 夕方 + 退勤後の時間帯
  {
    id: "evening_wind_down",
    priority: 170,
    condition: (ctx) => isEvening(ctx) && !isWeekend(ctx),
    generate: (ctx) => ({
      mirrorText: ctx.isMobile
        ? "帰り道？　それとも、帰ってきてからの一息？\nどちらにしても、今日一日の「自分」を振り返りたくなったんだね。"
        : "仕事終わりにPCで自分のことを調べてる。\n今日、何かあった？　それとも、ずっと考えてたこと？",
      subText: "夕方に自分と向き合う人は、実は一番変化が早い",
      signals: ["evening", "weekday", ctx.isMobile ? "mobile" : "desktop"],
    }),
  },

  // #NEW3 — 週末の午前（自分時間を使ってる）
  {
    id: "weekend_morning_selfcare",
    priority: 175,
    condition: (ctx) => isWeekend(ctx) && isMorning(ctx),
    generate: () => ({
      mirrorText: "休みの朝に、ここにいる。\n誰かとの予定より、自分のことを先に選んだ。\nその優先順位、意外と本音が出てるかも。",
      subText: "休日の朝の選択は、義務感がないぶん素直",
      signals: ["weekend", "morning"],
    }),
  },

  // #NEW4 — SNSから来た（誰かのシェアで知った）
  {
    id: "from_sns_curious",
    priority: 190,
    condition: (ctx) => ctx.isFromSNS && !ctx.isReturnVisit,
    generate: () => ({
      mirrorText: "SNSで見かけて来てくれたんだね。\n誰かの「自分を知った体験」が気になった。\n「自分もやってみたい」と思った？　それとも「本当に当たるの？」って疑ってる？",
      subText: "疑いながら来る人ほど、当たったときの衝撃が大きい",
      signals: ["sns_referrer", "firstVisit"],
    }),
  },

  // #NEW5 — バッテリー低い（充電せずにここを見てる）
  {
    id: "low_battery_priorities",
    priority: 195,
    condition: (ctx) => isLowBattery(ctx) && ctx.isCharging === false,
    generate: (ctx) => ({
      mirrorText: `バッテリー${Math.round((ctx.batteryLevel ?? 0.15) * 100)}%で、ここを開いた。\n充電より先に「自分を知ること」を選んだ。\nその優先順位、けっこう本気だね。`,
      subText: "残りわずかな電池で何をするかに、その人の本音が出る",
      signals: ["low_battery", "not_charging"],
    }),
  },

  // #46
  {
    id: "universal_fallback",
    priority: 0,
    condition: () => true,
    generate: () => ({
      mirrorText:
        "「自分って何だろう」と思った瞬間にここに来た。\nその問いを持てる人は、今の自分に100%納得してない人。\nでもそれは不満じゃなくて、伸びしろを感じてるってこと。",
      subText:
        "自分を知ろうとする衝動は、変わりたい気持ちの一歩手前。あと一歩、踏み込んでみない？",
      signals: ["fallback"],
    }),
  },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 5. Core Engine
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function selectBestRule(ctx: MirrorContext): ZeroMirrorResult {
  const matched = RULES
    .filter((r) => r.condition(ctx))
    .sort((a, b) => b.priority - a.priority);

  const best = matched[0] ?? RULES[RULES.length - 1];
  return best.generate(ctx);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 6. Public API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * クライアントサイド用 — 全シグナルを収集して最適なミラーを生成
 * Battery API が async なので async 関数
 */
export async function generateZeroSecondMirror(): Promise<ZeroMirrorResult> {
  const ctx = await collectClientSignals();
  return selectBestRule(ctx);
}

/**
 * サーバーサイド用 — 時間/日付のみでフォールバックミラーを生成
 */
export function generateServerMirror(): ZeroMirrorResult {
  const ctx = buildServerContext();
  return selectBestRule(ctx);
}

/**
 * テスト/デバッグ用 — 任意のコンテキストでミラーを生成
 */
export function generateMirrorWithContext(ctx: MirrorContext): ZeroMirrorResult {
  return selectBestRule(ctx);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 7. Mirror Response Tracking (preserved from v1)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** ユーザーのMirrorへの反応を記録（後のパーソナライズ用） */
export interface MirrorReaction {
  ruleId: string;
  dwellTimeMs: number;
  wasEngaged: boolean;
  timestamp: string;
}

const REACTION_KEY = "aneurasync_mirror_reactions_v2";

export function recordMirrorReaction(reaction: MirrorReaction): void {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(REACTION_KEY);
    const reactions: MirrorReaction[] = raw ? JSON.parse(raw) : [];
    reactions.push(reaction);
    const trimmed = reactions.slice(-20);
    localStorage.setItem(REACTION_KEY, JSON.stringify(trimmed));
  } catch { /* ignore */ }
}

export function analyzeMirrorPreference(): {
  avgDwellTimeMs: number;
  engagementRate: number;
  totalVisits: number;
} {
  if (typeof window === "undefined") {
    return { avgDwellTimeMs: 0, engagementRate: 0, totalVisits: 0 };
  }
  try {
    const raw = localStorage.getItem(REACTION_KEY);
    if (!raw) return { avgDwellTimeMs: 0, engagementRate: 0, totalVisits: 0 };
    const reactions: MirrorReaction[] = JSON.parse(raw);
    if (reactions.length === 0) return { avgDwellTimeMs: 0, engagementRate: 0, totalVisits: 0 };
    const avgDwell = reactions.reduce((s, r) => s + r.dwellTimeMs, 0) / reactions.length;
    const engaged = reactions.filter((r) => r.wasEngaged).length;
    return {
      avgDwellTimeMs: avgDwell,
      engagementRate: engaged / reactions.length,
      totalVisits: reactions.length,
    };
  } catch {
    return { avgDwellTimeMs: 0, engagementRate: 0, totalVisits: 0 };
  }
}
