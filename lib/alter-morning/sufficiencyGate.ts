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
  AutoInferredMap,
  AutoInferredField,
  InferenceConfidence,
} from "./types";
import type { TransportMode, VenueType } from "@/app/(culcept)/calendar/_lib/vcTypes";

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
  /** 自動推定された条件（後方互換: venue の値のみ） */
  autoInferred: {
    venue?: "indoor" | "outdoor" | "mixed";
  };
  /**
   * Phase D: 推論で補完されたフィールド（confidence + reason 付き）。
   * transport / venue が未指定でも plan 骨格を壊さない場合はここに格納し、
   * clarify に回さず plan_presented へ直行させる。
   */
  autoInferredMap: AutoInferredMap;
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
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase D: Transport 推論チェーン
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 優先順位: 明示指定 → ユーザー既知傾向 → 距離/地理推論 → 最後の保険デフォルト
// CEO方針: transport 未指定でも plan を止めない。推論で埋める。

/** 首都圏・近畿・中京の都市圏（電車が主な移動手段） */
const TRAIN_PREFECTURES = new Set([
  "東京都", "神奈川県", "千葉県", "埼玉県",           // 首都圏
  "大阪府", "京都府", "兵庫県",                         // 近畿
  "愛知県",                                              // 中京
]);

/**
 * Transport 推論チェーン。
 *
 * CEO 方針 2026-04-17（Phase D rollback）:
 *   日本は電車/バス/車/自転車/徒歩が混在し、都道府県ベースの推論は誤りが大きい。
 *   ユーザー傾向ログが蓄積されるまでは、transport は clarify 対象に戻す。
 *
 * 1. 明示指定（intent / dayConditions） → null を返して Gate に委譲
 * 2. ユーザー既知傾向（将来: baseline / 過去プラン統計）— データ蓄積待ち
 * 3. 距離/地理推論 — 撤回（誤推論が体験を壊す）
 * 4. 最後の保険デフォルト — 撤回（勝手に「車」や「電車」と仮定しない）
 */
function inferTransport(
  _intent: ParsedDayIntent,
  _dayConditions: Partial<DayConditions>,
  _rawSufficiency: SufficiencyResult,
  _userPrefecture?: string,
): AutoInferredField<TransportMode> | null {
  // 明示があれば null（Gate 側で既に解決済み扱い）、なければ null で未解決にして
  // planMissing に transport を積む → clarify で聞く。
  return null;
}
// 参考: 旧コード（復活用に保存）
//   if (userPrefecture && TRAIN_PREFECTURES.has(userPrefecture)) { ... train medium }
//   return { value: "car", confidence: "low", reason: "指定なし → 車" };

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase D: Venue 確信度付き推論
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// CEO方針: 高確信はそのまま採用。中確信は plan は出すが autoInferred に残す。
//          低確信は必要なら確認（ただし plan は止めない）。

function inferVenueWithConfidence(
  intent: ParsedDayIntent,
  dayConditions: Partial<DayConditions>,
  goingOut: boolean,
): AutoInferredField<VenueType> | null {
  if (dayConditions.venue) return null; // ユーザーが明示済み

  // ── mainLocation のカテゴリから推定（高確信）──
  if (intent.mainLocation?.category) {
    const v = inferVenueFromCategory(intent.mainLocation.category);
    if (v) {
      return {
        value: v as VenueType,
        confidence: "high",
        reason: `${intent.mainLocation.label ?? intent.mainLocation.category} → ${v}`,
      };
    }
  }

  // ── locationSequence の main stop から推定（高確信）──
  const mainStop = intent.locationSequence?.find(ls => ls.kind === "main");
  if (mainStop?.category) {
    const v = inferVenueFromCategory(mainStop.category);
    if (v) {
      return {
        value: v as VenueType,
        confidence: "high",
        reason: `${mainStop.label} → ${v}`,
      };
    }
  }

  // ── goOut フラグから推定（中確信）──
  if (goingOut) {
    return {
      value: "mixed" as VenueType,
      confidence: "medium",
      reason: "外出予定 → 室内外混在で計算",
    };
  }
  if (intent.flowContext.goOut === false) {
    return {
      value: "indoor" as VenueType,
      confidence: "high",
      reason: "在宅予定 → 室内",
    };
  }

  // ── 推定不能（低確信のデフォルト）──
  return {
    value: "mixed" as VenueType,
    confidence: "low",
    reason: "場所情報なし → 室内外混在で計算",
  };
}

export function checkPlanIntakeSufficiency(
  rawSufficiency: SufficiencyResult,
  intent: ParsedDayIntent,
  items: PlanItem[],
  dayConditions: Partial<DayConditions>,
  allRawInputs: string,
  userPrefecture?: string,
): PlanIntakeResult {
  // ── goOut 判定 ──
  const hasNonHomeLocation =
    intent.mainLocation != null && intent.mainLocation.category !== "home";
  const hasNonHomeInSequence =
    (intent.locationSequence ?? []).some(ls => ls.category !== "home");
  const goingOut =
    intent.flowContext.goOut === true ||
    hasNonHomeInSequence ||
    hasNonHomeLocation;

  // ── Phase D: Transport 推論チェーン ──
  const autoInferredMap: AutoInferredMap = {};
  const transportInferred = inferTransport(intent, dayConditions, rawSufficiency, userPrefecture);
  if (transportInferred) {
    autoInferredMap.transport = transportInferred;
  }

  // ── Phase D: Venue 確信度付き推論 ──
  const venueInferred = inferVenueWithConfidence(intent, dayConditions, goingOut);
  if (venueInferred) {
    autoInferredMap.venue = venueInferred;
  }

  // ── 社会的活動の検出 ──
  const hasSocialActivity = detectSocialActivity(items, intent);

  // ── withWhom の解決判定 ──
  const withWhomFromText = detectWithWhom(allRawInputs) !== null;
  const withWhomFromItems = items.some(i => i.withWhom != null);
  const withWhomFromEvents = intent.fixedEvents.some(e => e.companion != null);
  const withWhomResolved = withWhomFromText || withWhomFromItems || withWhomFromEvents || dayConditions.withWhom != null;

  // ── Phase D: hard blocker のみ missingFields に入れる ──
  // CEO方針: transport / venue / mood / withWhom は plan を止めない
  // hard blocker = place unresolved / hard anchor 衝突 のみ（上位で処理）
  const planMissing: MissingField[] = [];

  // transport: 推論で埋まった場合は missing にしない
  const transportResolved =
    rawSufficiency.resolved.transport ||
    dayConditions.mainTransport != null ||
    intent.flowContext.transport != null ||
    transportInferred != null;
  // CEO 方針 2026-04-17 (Phase D rollback):
  //   外出予定 (goingOut=true) で transport が未解決なら clarify で聞く。
  //   以前は「推論 or default car で進む」だったが、誤推論がプラン全体を崩すため撤回。
  //   在宅 (goingOut=false) は transport を聞かない（移動がないので不要）。
  if (goingOut && !transportResolved) {
    planMissing.push("transport");
  }

  // venue: 推論で埋まった場合は missing にしない
  // Phase D: venue 未解決でも plan は止めない
  // → planMissing に venue を追加しない

  // withWhom: 社会的活動があっても plan を止めない
  // CEO方針: 勝手に埋めない（unknown のまま）、ただし plan は止めない
  // → planMissing に withWhom を追加しない

  // mood: 元々 plan 成立に不要（Outfit Gate で扱う）
  // → planMissing に mood を追加しない

  // ── sufficiency level を判定 ──
  const hasTasks =
    intent.primaryTasks.length > 0 ||
    intent.fixedEvents.length > 0 ||
    items.length > 0;

  let level: SufficiencyLevel;
  if (!hasTasks) {
    level = rawSufficiency.level === "no_plan" ? "no_plan" : "insufficient";
  } else if (planMissing.length > 0) {
    // CEO 方針 2026-04-17: transport 等 clarify 必須項目が残っていれば partial。
    // 上位で buildPlanClarifyQuestion が呼ばれる経路に入り、聞いてから plan を組む。
    level = "partial";
  } else {
    // タスク + 必須項目が揃っている → sufficient
    level = "sufficient";
  }

  return {
    level,
    missingFields: planMissing,
    goingOut,
    hasSocialActivity,
    autoInferred: {
      venue: venueInferred?.value as "indoor" | "outdoor" | "mixed" | undefined,
    },
    autoInferredMap,
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
  // withWhom は対人予定がありそうで、かつプラン中に誰の言及もない場合のみ聞く
  // CEO指摘 2026-04-16: プランニング中に人の話が出てたら聞かなくていい
  const hasCompanionsInPlan = plan.items?.some(item =>
    item.companions && item.companions.length > 0
  ) ?? false;
  if (!withWhomResolved && !hasCompanionsInPlan && looksLikeSocialEvent(plan)) {
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
 * コーデ用の不足情報を 1 問で聞ける文言に生成する。
 *
 * CEO指摘 2026-04-16: 「コーデ見る？」だと手間がかかる。
 * 「今日コーディネート必要だったら、ラフかキレイか、どっちがいいか教えて？」
 * のように一回で聞けるようにする。
 */
export function buildOutfitClarifyQuestion(missing: OutfitMissingField[]): string {
  if (missing.length === 0) return "";

  // mood だけが不足（最も多いパターン）→ 1発で聞く
  if (missing.length === 1 && missing[0] === "mood") {
    return "今日コーディネート必要だったら、ラフかキレイめか教えて。";
  }

  // 複数不足 → 1文にまとめる
  const parts: string[] = [];

  if (missing.includes("mood")) {
    parts.push("ラフかキレイめか");
  }
  if (missing.includes("transport")) {
    parts.push("移動は車・電車・徒歩のどれが多いか");
  }
  if (missing.includes("withWhom")) {
    parts.push("誰かと会うか");
  }

  return `今日コーディネート必要だったら、${parts.join("と、")}教えて。`;
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
