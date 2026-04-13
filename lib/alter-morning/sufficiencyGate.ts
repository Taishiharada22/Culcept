/**
 * Sufficiency Gate — 情報充足判定
 *
 * ユーザーの入力テキストから、プラン生成に必要な情報がどれだけ揃っているかを判定。
 * 不足項目を特定し、Alterが聞くべき質問を最小化する。
 */

import type {
  SufficiencyResult,
  SufficiencyLevel,
  MissingField,
  DayConditions,
  PlanItem,
  MorningPlan,
  MainLocation,
  ParsedDayIntent,
} from "./types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 検出パターン
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 交通手段の検出パターン（正規表現ベース）。
 *
 * 重要: 長い語を先にチェックする（「自転車」→「車」の順）。
 * 単純な includes ではなく境界マッチで「散歩」の「歩」等を誤検出しない。
 *
 * 誤検出リスクのある語:
 *   「歩」→ 散歩、歩道、歩行者、歩き回る、歩いて考える
 *   「車」→ 車両、車庫（ただしこれらは稀）
 *   「バス」→ バスケ、バスト（ただしこれらは稀）
 */
const TRANSPORT_RULES: Array<{ pattern: RegExp; value: string }> = [
  // ── 長い語（優先） ──
  { pattern: /自転車/, value: "bicycle" },
  { pattern: /飛行機/, value: "plane" },
  { pattern: /タクシー/, value: "taxi" },
  { pattern: /バイク/, value: "motorcycle" },
  { pattern: /チャリ/, value: "bicycle" },
  { pattern: /徒歩/, value: "walk" },
  { pattern: /電車/, value: "train" },
  // ── 「歩」の安全なマッチ ──
  // 「歩いて」「歩きで」は交通手段。「散歩」「歩道」「歩行者」「歩き回る」は違う。
  { pattern: /歩い[てた]/, value: "walk" },    // 「歩いて行く」「歩いた」
  { pattern: /歩きで/, value: "walk" },          // 「歩きで行く」
  { pattern: /(?<!散)歩く/, value: "walk" },     // 「歩く」（「散歩く」は存在しないが安全策）
  // ── 「車」は「自転車」を除外して判定 ──
  // 「自転車」は先にマッチ済みなので、ここまで来た「車」は自動車
  { pattern: /(?<!自転)車/, value: "car" },
  // ── 「バス」は「バスケ」「バスト」を除外 ──
  { pattern: /バス(?!ケ|ト|タ|ル)/, value: "bus" },
];

const VENUE_PATTERNS: Record<string, string> = {
  室内: "indoor",
  屋内: "indoor",
  オフィス: "indoor",
  家: "indoor",
  自宅: "indoor",
  外: "outdoor",
  屋外: "outdoor",
  公園: "outdoor",
  "室内.*外": "mixed",
  "外.*室内": "mixed",
};

const MOOD_PATTERNS: string[] = [
  "きれいめ",
  "カジュアル",
  "ラフ",
  "かっちり",
  "フォーマル",
  "楽",
  "おしゃれ",
  "リラックス",
  "スポーティ",
  "シンプル",
  "動きやすい",
  "大人っぽい",
];

const WITH_WHOM_PATTERNS: Record<string, string> = {
  友達: "friends",
  友人: "friends",
  彼女: "partner",
  彼氏: "partner",
  恋人: "partner",
  家族: "family",
  親: "family",
  上司: "work",
  同僚: "work",
  クライアント: "work",
  取引先: "work",
  一人: "solo",
  ひとり: "solo",
};

const NO_PLAN_PATTERNS = [
  /^(特にない|ない|なし|決まってない|わからない|まだ|何も|ノープラン)/,
  /^(作らない|いい|パス|今日は大丈夫)/,
];

const CHAT_PATTERNS = [
  /^(話す|話したい|聞いて|相談|ちょっと)/,
  /^(おはよう|こんにちは|ひま|暇)/,
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// メイン判定
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * ユーザーの入力テキストから情報充足度を判定する。
 */
export function checkSufficiency(
  userInput: string,
  existingItems: PlanItem[]
): SufficiencyResult {
  const text = userInput.trim();

  // planning不要パターン
  if (NO_PLAN_PATTERNS.some((p) => p.test(text))) {
    return {
      level: "no_plan",
      resolved: { hasItems: false, transport: false, venue: false, mood: false, withWhom: false },
      missingFields: [],
    };
  }

  // 雑談パターン → no_plan（Alter質問フローへ）
  if (CHAT_PATTERNS.some((p) => p.test(text)) && text.length < 15) {
    return {
      level: "no_plan",
      resolved: { hasItems: false, transport: false, venue: false, mood: false, withWhom: false },
      missingFields: [],
    };
  }

  const hasItems = existingItems.length > 0 || text.length > 5;
  const transport = detectTransport(text) !== null;
  const venue = detectVenue(text) !== null;
  const mood = detectMood(text) !== null;
  const withWhom = detectWithWhom(text) !== null;

  const resolved = { hasItems, transport, venue, mood, withWhom };

  const missingFields: MissingField[] = [];
  if (!transport) missingFields.push("transport");
  if (!venue) missingFields.push("venue");
  if (!mood) missingFields.push("mood");
  // withWhom は予定文面から推定できることが多いので、最後に聞く
  if (!withWhom) missingFields.push("withWhom");

  let level: SufficiencyLevel;
  if (!hasItems) {
    level = "insufficient";
  } else if (missingFields.length === 0) {
    level = "sufficient";
  } else if (missingFields.length <= 2) {
    level = "partial";
  } else {
    level = "insufficient";
  }

  return { level, resolved, missingFields };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 個別検出
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function detectTransport(text: string): string | null {
  for (const { pattern, value } of TRANSPORT_RULES) {
    if (pattern.test(text)) return value;
  }
  return null;
}

export function detectVenue(text: string): string | null {
  for (const [pattern, value] of Object.entries(VENUE_PATTERNS)) {
    if (new RegExp(pattern).test(text)) return value;
  }
  // イベントから推定
  if (/ジム|公園|ランニング|散歩|ピクニック|BBQ/.test(text)) return "outdoor";
  if (/オフィス|自宅|家|カフェ|図書館/.test(text)) return "indoor";
  return null;
}

export function detectMood(text: string): string | null {
  for (const pattern of MOOD_PATTERNS) {
    if (text.includes(pattern)) return pattern;
  }
  return null;
}

export function detectWithWhom(text: string): string | null {
  for (const [pattern, value] of Object.entries(WITH_WHOM_PATTERNS)) {
    if (text.includes(pattern)) return value;
  }
  return null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 条件抽出
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * ユーザー入力からDayConditionsを抽出する。
 * 推定できないフィールドはundefinedのまま。
 */
export function extractDayConditions(text: string): Partial<DayConditions> {
  const conditions: Partial<DayConditions> = {};

  const transport = detectTransport(text);
  if (transport) {
    conditions.mainTransport = transport as DayConditions["mainTransport"];
    // 移動手段から歩き量を推定
    if (transport === "walk") conditions.estimatedWalkLevel = "high";
    else if (transport === "bicycle") conditions.estimatedWalkLevel = "medium";
    else conditions.estimatedWalkLevel = "low";
  }

  const venue = detectVenue(text);
  if (venue) conditions.venue = venue as DayConditions["venue"];

  const mood = detectMood(text);
  if (mood) conditions.moodText = mood;

  const whom = detectWithWhom(text);
  if (whom) conditions.withWhom = whom;

  return conditions;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 質問生成（Alter向け）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 不足情報をまとめた質問文を生成する。
 * 複数の不足項目を1問にまとめて、ラリー数を最小化する。
 *
 * @deprecated — プラン段階では buildPlanClarifyQuestion を使う。
 * この関数は後方互換のために残す。
 */
export function buildClarifyQuestion(missing: MissingField[]): string {
  // Plan Intake 用の質問文を返す
  return buildPlanClarifyQuestion(missing);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Plan Intake Gate — プラン成立に必要な 5W1H の充足判定
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 3段構成:
//   1. Plan Intake Gate（ここ） — 5W1H の充足判定。プラン成立の必須条件。
//   2. Tour Builder（buildDayPlan + insertTravelItems） — ツアー構造へ展開
//   3. Outfit Gate（checkOutfitSufficiency） — コーデ提案用の不足判定
//
// Plan Intake Gate が「sufficient」にならない限り、Tour Builder は走らない。
// mood はプラン成立の必須ではないため Outfit Gate で扱う。
//
// 判定対象:
//   What → items が存在するか
//   When → startTime / startWindow があるか（パーサーが抽出済み）
//   Where → mainLocation / locationSequence があるか（パーサーが抽出済み）
//   Who → withWhom が判明しているか（社会的活動時は必須）
//   How → transport が判明しているか（外出時は必須）
//   Why → flowContext から暗黙的に取得（明示的には不要）
//   venue → placeTable から自動推定（質問しない）

export interface PlanIntakeResult {
  /** プラン成立に十分な情報があるか */
  level: SufficiencyLevel;
  /** プランに不足している項目（mood を除く） */
  missingFields: MissingField[];
  /** 外出するか */
  goingOut: boolean;
  /** 社会的活動が含まれるか（ミーティング・食事・デート等） */
  hasSocialActivity: boolean;
  /** 自動推定された条件 */
  autoInferred: {
    venue?: "indoor" | "outdoor" | "mixed";
  };
}

/** 社会的活動を示すキーワード（withWhom が plan-critical になる条件） */
const SOCIAL_ACTIVITY_PATTERNS = [
  /ミーティング|会議|打ち合わせ|面談|面接|商談/,
  /食事|ランチ|ディナー|飲み会|飲み/,
  /デート|合コン|パーティ/,
  /会う|遊ぶ/,
];

/** PlanItem のテキストや eventType から社会的活動を検出 */
function detectSocialActivity(items: PlanItem[], intent?: ParsedDayIntent): boolean {
  // アイテムのテキストから検出
  for (const item of items) {
    if (SOCIAL_ACTIVITY_PATTERNS.some(p => p.test(item.text))) return true;
    if (item.eventType && ["friends", "date", "party", "interview"].includes(item.eventType)) return true;
    if (item.withWhom) return true; // 既に companion が検出されている
  }

  // fixedEvents から検出
  if (intent?.fixedEvents) {
    for (const ev of intent.fixedEvents) {
      if (ev.companion) return true;
      if (SOCIAL_ACTIVITY_PATTERNS.some(p => p.test(ev.title))) return true;
      if (ev.eventType && ["friends", "date", "party", "interview"].includes(ev.eventType)) return true;
    }
  }

  // primaryTasks から検出
  if (intent?.primaryTasks) {
    for (const task of intent.primaryTasks) {
      if (SOCIAL_ACTIVITY_PATTERNS.some(p => p.test(task.text))) return true;
    }
  }

  return false;
}

/**
 * Plan Intake Gate — プラン成立に必要な 5W1H の充足度を判定する。
 *
 * morningProtocol.ts の handleCollectingPhase から呼ばれる。
 * 散らばっていたプラン段階の判定ロジックをここに集約。
 *
 * @param rawSufficiency - checkSufficiency() の結果（テキストベースの充足判定）
 * @param intent - parseIntent() の結果（構造化された意図）
 * @param items - intentToPlanItems() の結果（プランアイテム）
 * @param dayConditions - extractDayConditions() の結果（条件）
 * @param allRawInputs - 全ユーザー入力テキスト
 */
export function checkPlanIntakeSufficiency(
  rawSufficiency: SufficiencyResult,
  intent: ParsedDayIntent,
  items: PlanItem[],
  dayConditions: Partial<DayConditions>,
  allRawInputs: string
): PlanIntakeResult {
  // ── goOut 判定 ──
  // mainLocation が "home" カテゴリの場合は外出ではない
  const hasNonHomeLocation =
    intent.mainLocation != null && intent.mainLocation.category !== "home";
  const hasNonHomeInSequence =
    (intent.locationSequence ?? []).some(ls => ls.category !== "home");
  const goingOut =
    intent.flowContext.goOut === true ||
    hasNonHomeInSequence ||
    hasNonHomeLocation;

  // ── venue 自動推定 ──
  let inferredVenue: "indoor" | "outdoor" | "mixed" | undefined;
  if (!dayConditions.venue) {
    if (intent.mainLocation?.category) {
      const v = inferVenueFromCategory(intent.mainLocation.category);
      if (v) inferredVenue = v;
    }
    // locationSequence の main stop からも試す
    if (!inferredVenue) {
      const mainStop = intent.locationSequence?.find(ls => ls.kind === "main");
      if (mainStop?.category) {
        const v = inferVenueFromCategory(mainStop.category);
        if (v) inferredVenue = v;
      }
    }
    // goOut フラグから推定
    if (!inferredVenue) {
      if (goingOut) inferredVenue = "mixed";
      else if (intent.flowContext.goOut === false) inferredVenue = "indoor";
    }
  }
  const venueResolved = dayConditions.venue != null || inferredVenue != null;

  // ── 社会的活動の検出 ──
  const hasSocialActivity = detectSocialActivity(items, intent);

  // ── withWhom の解決判定 ──
  // テキストからの検出 OR fixedEvents に companion がある OR items に withWhom がある
  const withWhomFromText = detectWithWhom(allRawInputs) !== null;
  const withWhomFromItems = items.some(i => i.withWhom != null);
  const withWhomFromEvents = intent.fixedEvents.some(e => e.companion != null);
  const withWhomResolved = withWhomFromText || withWhomFromItems || withWhomFromEvents || dayConditions.withWhom != null;

  // ── プランに不足している項目を判定 ──
  // mood を除外（プラン成立には不要 → Outfit Gate で扱う）
  const planMissing: MissingField[] = [];

  // transport: 外出時に必須（移動時間の計算に必要）
  const transportResolved = rawSufficiency.resolved.transport || dayConditions.mainTransport != null;
  if (!transportResolved && goingOut) {
    planMissing.push("transport");
  }

  // venue: 自動推定できなかった場合のみ不足
  if (!venueResolved) {
    planMissing.push("venue");
  }

  // withWhom: 社会的活動がある場合は必須
  if (!withWhomResolved && hasSocialActivity) {
    planMissing.push("withWhom");
  }

  // ── sufficiency level を判定 ──
  const hasTasks =
    intent.primaryTasks.length > 0 ||
    intent.fixedEvents.length > 0 ||
    items.length > 0;

  let level: SufficiencyLevel;
  if (!hasTasks) {
    level = rawSufficiency.level === "no_plan" ? "no_plan" : "insufficient";
  } else if (planMissing.length === 0) {
    level = "sufficient";
  } else if (planMissing.includes("transport")) {
    // transport が不明 → 移動時間を計算できない → 必ず聞く
    level = "insufficient";
  } else if (planMissing.includes("withWhom") && hasSocialActivity) {
    // 社会的活動あり + 相手不明 → プランの文脈が不完全 → 聞く
    level = "insufficient";
  } else if (planMissing.length <= 1) {
    level = "partial";
  } else {
    level = "insufficient";
  }

  return {
    level,
    missingFields: planMissing,
    goingOut,
    hasSocialActivity,
    autoInferred: {
      venue: inferredVenue,
    },
  };
}

/**
 * プラン成立に必要な不足情報を 1 問に束ねた質問文を生成する。
 *
 * 重要: これは「コーデのため」ではなく「プランを組むため」の質問。
 * 文面を明確にプラン中心にする。
 *
 * 例（transport + withWhom が不足）:
 *   「プラン組むからあと少し教えて。
 *    何で移動する？（車・電車・自転車・徒歩）
 *    誰かと合流する予定ある？」
 */
export function buildPlanClarifyQuestion(missing: MissingField[]): string {
  if (missing.length === 0) return "";

  const questions: string[] = [];

  if (missing.includes("transport")) {
    questions.push("何で移動する？（車・電車・自転車・徒歩）");
  }
  if (missing.includes("venue")) {
    questions.push("室内が多い？それとも外にも出る？");
  }
  if (missing.includes("withWhom")) {
    questions.push("誰かと合流する予定ある？");
  }

  return `プラン組むからあと少し教えて。\n${questions.join("\n")}`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Outfit Sufficiency Gate（コーデ提案用の独立ゲート）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Plan Gate とは独立。プランは即提示しても、コーデ前に不足情報を聞く。
// venue は placeTable の traits.indoor から自動推定するため、質問しない。
// transport / mood は不足なら聞く。withWhom は会う相手がいそうなら聞く。

/** 場所カテゴリ → venue 自動推定 */
const CATEGORY_VENUE_MAP: Record<string, "indoor" | "outdoor" | "mixed"> = {
  cafe: "indoor",
  fast_food: "indoor",
  restaurant: "indoor",
  convenience_store: "indoor",
  library: "indoor",
  school: "indoor",
  office: "indoor",
  home: "indoor",
  hospital: "indoor",
  clinic: "indoor",
  shopping: "indoor",
  station: "indoor",
  coworking: "indoor",
  hotel: "indoor",
  park: "outdoor",
  gym: "indoor",        // golf は例外だが gym カテゴリのデフォルトは indoor
  entertainment: "mixed",
  other: "mixed",
};

/**
 * 場所カテゴリから venue を推定する（単体関数）。
 * morningProtocol のプラン段階で使用。
 */
export function inferVenueFromCategory(category: string): "indoor" | "outdoor" | "mixed" | null {
  return CATEGORY_VENUE_MAP[category] ?? null;
}

/**
 * mainLocation や locationSequence から venue を自動推定する。
 *
 * 優先順位:
 * 1. mainLocation の category から推定
 * 2. locationSequence の main stop の category から推定
 * 3. goOut フラグから推定（true → mixed, false → indoor）
 */
export function inferVenueFromPlan(plan: MorningPlan): "indoor" | "outdoor" | "mixed" | null {
  // mainLocation から推定
  if (plan.mainLocation?.category) {
    const venue = CATEGORY_VENUE_MAP[plan.mainLocation.category];
    if (venue) return venue;
  }

  // locationSequence の main stop から推定
  const mainStop = plan.parsedIntent?.locationSequence?.find(ls => ls.kind === "main");
  if (mainStop?.category) {
    const venue = CATEGORY_VENUE_MAP[mainStop.category];
    if (venue) return venue;
  }

  // goOut フラグから推定
  if (plan.flowContext?.goOut === true) return "mixed";
  if (plan.flowContext?.goOut === false) return "indoor";

  return null;
}

export type OutfitMissingField = "transport" | "mood" | "withWhom";

export interface OutfitSufficiencyResult {
  /** コーデ提案に十分な情報があるか */
  sufficient: boolean;
  /** 自動推定された venue */
  inferredVenue: "indoor" | "outdoor" | "mixed" | null;
  /** 不足しているフィールド（質問が必要） */
  missingFields: OutfitMissingField[];
  /** 既に解決済みのフィールド */
  resolved: {
    venue: boolean;
    transport: boolean;
    mood: boolean;
    withWhom: boolean;
  };
}

/**
 * コーデ提案に必要な情報の充足度を判定する。
 *
 * Plan Sufficiency Gate とは独立。
 * venue は placeTable から自動推定するため質問しない。
 * transport / mood / withWhom のうち不足分だけ聞く。
 */
export function checkOutfitSufficiency(
  plan: MorningPlan,
  allUserInputs: string[]
): OutfitSufficiencyResult {
  const fullText = allUserInputs.join(" ");

  // venue は自動推定（質問しない）
  const inferredVenue = plan.dayConditions.venue
    ? null // 既にユーザーが明示
    : inferVenueFromPlan(plan);
  const venueResolved = plan.dayConditions.venue != null || inferredVenue != null;

  // transport / mood / withWhom はテキストから検出
  const transportResolved = detectTransport(fullText) !== null || plan.dayConditions.mainTransport != null;
  const moodResolved = detectMood(fullText) !== null || plan.dayConditions.moodText != null;
  const withWhomResolved = detectWithWhom(fullText) !== null || plan.dayConditions.withWhom != null;

  const missingFields: OutfitMissingField[] = [];
  if (!transportResolved) missingFields.push("transport");
  if (!moodResolved) missingFields.push("mood");
  // withWhom は対人予定がありそうな場合のみ聞く
  if (!withWhomResolved && looksLikeSocialEvent(plan)) {
    missingFields.push("withWhom");
  }

  return {
    sufficient: missingFields.length === 0,
    inferredVenue,
    missingFields,
    resolved: {
      venue: venueResolved,
      transport: transportResolved,
      mood: moodResolved,
      withWhom: withWhomResolved,
    },
  };
}

/** 対人予定がありそうかを簡易判定 */
function looksLikeSocialEvent(plan: MorningPlan): boolean {
  if (!plan.items) return false;
  const socialTypes = ["date", "friends", "party", "interview"];
  return plan.items.some(item =>
    socialTypes.includes(item.eventType ?? "") ||
    /会議|ミーティング|飲み|デート|面接/.test(item.text)
  );
}

/**
 * コーデ用の不足情報を 1 問に束ねた質問文を生成する。
 *
 * 例:
 * 「コーデ提案するために教えて。移動は車・電車・徒歩どれが多い？
 *  服はラフ寄り / きれいめ寄りどっち？」
 */
export function buildOutfitClarifyQuestion(missing: OutfitMissingField[]): string {
  if (missing.length === 0) return "";

  const questions: string[] = [];

  if (missing.includes("transport")) {
    questions.push("移動は車・電車・徒歩どれが多い？");
  }
  if (missing.includes("mood")) {
    questions.push("服はラフ寄り / きれいめ寄りどっち？");
  }
  if (missing.includes("withWhom")) {
    questions.push("誰かと会う予定ある？");
  }

  return `コーデ提案するために教えて。\n${questions.join("\n")}`;
}

/**
 * コーデ clarify への回答から DayConditions を更新する。
 */
export function applyOutfitClarifyResponse(
  text: string,
  existing: DayConditions
): DayConditions {
  const updated = { ...existing };

  const transport = detectTransport(text);
  if (transport && !updated.mainTransport) {
    updated.mainTransport = transport as DayConditions["mainTransport"];
    if (transport === "walk") updated.estimatedWalkLevel = "high";
    else if (transport === "bicycle") updated.estimatedWalkLevel = "medium";
    else updated.estimatedWalkLevel = "low";
  }

  const mood = detectMood(text);
  if (mood && !updated.moodText) {
    updated.moodText = mood;
  }

  const whom = detectWithWhom(text);
  if (whom && !updated.withWhom) {
    updated.withWhom = whom;
  }

  return updated;
}
