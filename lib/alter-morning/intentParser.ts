/**
 * Intent Parser — ユーザーの自由テキストから構造化された1日の意図を抽出
 *
 * 旧 parseUserInput（単純な文分割）を置き換える。
 *
 * 設計思想:
 * - 「外に行くよ。マックで1日中コード修正かな。」
 *   → primaryTasks: ["コード修正"], mainLocation: マクドナルド, goOut: true, durationHint: "all_day"
 * - 「外に行く」をtodoにしない（行動条件であってタスクではない）
 * - 「マック」を場所として取る（語彙テーブルで正規化）
 * - 「1日中」を時間感として取る
 * - 「多分」「たぶん」を確度として取る
 */

import type {
  ParsedDayIntent,
  ParsedTask,
  ParsedFixedEvent,
  FlowContext,
  MainLocation,
  LocationStop,
  PlanItem,
  DayConditions,
  EndpointAnchor,
  EndpointType,
} from "./types";
import type { EventType } from "@/app/(culcept)/calendar/_lib/vcTypes";
import { detectTransport } from "./sufficiencyGate";
import { todayJST } from "./dateUtils";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 遅延import（循環回避 — placeTable / activityVocabulary は大きなテーブル）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

let _resolvePlaceFromText: ((text: string) => { place: { id: string; canonicalLabel: string; category: string; traits?: Record<string, boolean> }; matchedAlias: string } | null) | null = null;
let _resolveActivity: ((text: string) => { canonical: string; category: string; defaultDurationMin: number; venue?: string } | null) | null = null;
let _getDefaultDuration: ((text: string) => number) | null = null;

async function ensureVocab() {
  if (!_resolvePlaceFromText) {
    const mod = await import("./placeTable");
    _resolvePlaceFromText = mod.resolvePlaceFromText as any;
  }
  if (!_resolveActivity) {
    const mod = await import("./activityVocabulary");
    _resolveActivity = mod.resolveActivity as any;
    _getDefaultDuration = mod.getDefaultDuration;
  }
}

/**
 * テスト用: 語彙テーブルを事前ロードする。
 * vitest 等のESM環境では require() が使えないため、
 * テストの beforeAll で呼び出して動的 import を完了させる。
 */
export async function preloadVocabulary(): Promise<void> {
  await ensureVocab();
}

// 同期版（初回import後に使える）
function resolvePlaceSync(text: string) {
  if (!_resolvePlaceFromText) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require("./placeTable");
      _resolvePlaceFromText = mod.resolvePlaceFromText;
    } catch { return null; }
  }
  return _resolvePlaceFromText!(text);
}

function resolveActivitySync(text: string) {
  if (!_resolveActivity) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require("./activityVocabulary");
      _resolveActivity = mod.resolveActivity;
      _getDefaultDuration = mod.getDefaultDuration;
    } catch { return null; }
  }
  return _resolveActivity!(text);
}

function getDefaultDurationSync(text: string): number {
  if (!_getDefaultDuration) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require("./activityVocabulary");
      _getDefaultDuration = mod.getDefaultDuration;
    } catch { return 45; }
  }
  return _getDefaultDuration!(text);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 時刻パターン
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const TIME_REGEX =
  /(?:(?:午前|午後|朝|昼|夕方|夜)\s*)?(\d{1,2})(?::(\d{2}))?(?:時|：)(半)?/;
const PERIOD_REGEX = /(午前|午後|朝|昼|夕方|夜)/;

function extractTime(text: string): string | null {
  const match = text.match(TIME_REGEX);
  if (!match) return null;
  let hour = parseInt(match[1], 10);
  const minute = match[2] ? parseInt(match[2], 10) : (match[3] === "半" ? 30 : 0);
  const periodMatch = text.match(PERIOD_REGEX);
  if (periodMatch) {
    const period = periodMatch[1];
    if ((period === "午後" || period === "夜" || period === "夕方") && hour < 12) hour += 12;
    if (period === "午前" && hour === 12) hour = 0;
  } else if (hour < 7) {
    hour += 12;
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FlowContext 抽出パターン
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 外出を示す表現 */
const GO_OUT_PATTERNS = [
  /外(に|へ)?(行|出|でる|でかけ)/,
  /出かけ/,
  /外出/,
  /出る/,
];

/** 在宅を示す表現 */
const STAY_HOME_PATTERNS = [
  /家(に|で)?(い[るた]|過ごす)/,
  /自宅/,
  /在宅/,
  /家から出ない/,
  /引きこもり/,
  /ずっと家/,
];

/** 時間感の抽出 */
const DURATION_HINT_PATTERNS: Array<{ pattern: RegExp; hint: FlowContext["durationHint"] }> = [
  { pattern: /1日中|一日中|終日|ずっと|朝から晩/, hint: "all_day" },
  { pattern: /半日|午前中|午後|午前/, hint: "half_day" },
  { pattern: /ちょっと|少し|1時間|2時間|サクッと/, hint: "short" },
];

/** 確度の抽出 */
const CERTAINTY_PATTERNS: Array<{ pattern: RegExp; level: FlowContext["certainty"] }> = [
  { pattern: /多分|たぶん|タブン|かもしれない|かも[。\s]?$|かな[ぁ]?[。\s]?$|かな[ぁ]?[。、\s]/, level: "low" },
  { pattern: /予定|決まってる|確定/, level: "high" },
];

/** 行動条件（タスクではない）を示すパターン */
const FLOW_CONDITION_PATTERNS = [
  /^外(に|へ)?(行|出|でる)/,        // 「外に行くよ」→ タスクではない
  /^(家|自宅)(に|で)?い[るた]/,      // 「家にいるよ」→ タスクではない
  /^出かけ(る|ます)/,                // 「出かけるよ」→ タスクではない
  /^外出(する|します)/,              // 「外出する」→ タスクではない
  /^(どこにも|家から).*出ない/,      // 「家から出ない」→ タスクではない
  /^(ずっと|1日中|終日)(家|自宅)/,   // 「ずっと家」→ タスクではない
  /^い[るた](よ|ね|んだ)?$/,         // 「いるよ」（分割後の残り）→ タスクではない
  /^(行く|行きます|行ってくる)$/,     // 「行くよ」→ タスクではない
  // 交通手段は行動条件であってタスクではない
  /^(電車|バス|車|チャリ|自転車|タクシー|徒歩|歩き)(で|に)(行|出|向か|移動)/,
  /^(電車|バス|車|チャリ|自転車|タクシー|徒歩|歩き)で$/,
];

/**
 * 「帰る」パターン — end-point trigger（タスクではない）。
 * 「帰る」は常に自宅とは限らない（ホテル、友人宅等もあり得る）。
 *
 * CEO方針:
 * - 「帰る」はタスクではなく終了トリガー。プランの最終移動の到着地を決定する
 * - home固定禁止: hotel / friend_home / partner_home / family_home / office / other を持てる
 * - 非自宅系は市区町村レベルで確認するルールを入れる
 * - 終点アンカーは次回プランの始点候補に継承する
 */
const RETURN_HOME_RE =
  /^(.+?)?(?:に|へ)?(?:帰る|帰宅する?|帰ろう|帰ります?|戻る|戻ろう)(よ|ね|さ|かな)?$/;
const RETURN_SIMPLE_RE =
  /^(?:そして|それで|最後に?)?\s*(?:帰る|帰宅する?|帰ろう|帰ります?|家に帰る)(よ|ね|さ|かな)?$/;

/**
 * テキストから終点タイプを推定する。
 * 「ホテルに帰る」→ hotel、「彼女の家に戻る」→ partner_home、etc.
 */
const ENDPOINT_TYPE_PATTERNS: Array<{ pattern: RegExp; type: EndpointType }> = [
  { pattern: /ホテル|旅館|宿/, type: "hotel" },
  { pattern: /友達の(家|うち|部屋)|友人宅/, type: "friend_home" },
  { pattern: /彼女の(家|うち|部屋)|彼氏の(家|うち|部屋)|彼の(家|うち|部屋)|恋人の(家|うち|部屋)|パートナーの/, type: "partner_home" },
  { pattern: /実家|親の(家|うち)|家族の/, type: "family_home" },
  { pattern: /会社|オフィス|職場/, type: "office" },
  { pattern: /家|自宅|うち/, type: "home" },
];

function detectEndpointType(text: string): EndpointType {
  for (const { pattern, type } of ENDPOINT_TYPE_PATTERNS) {
    if (pattern.test(text)) return type;
  }
  return "other";
}

/**
 * テキストからEndpointAnchorを生成する。
 * @param destination 帰り先テキスト（undefined = 自宅デフォルト）
 */
function buildEndpointAnchor(destination?: string): EndpointAnchor {
  if (!destination) {
    return { type: "home", label: "自宅", needsAreaConfirm: false };
  }

  const type = detectEndpointType(destination);
  const needsAreaConfirm = type !== "home"; // 非自宅系は市区町村レベルで確認が必要

  return {
    type,
    label: destination,
    needsAreaConfirm,
  };
}

/** 同伴者のパターン */
const COMPANION_PATTERNS: Record<string, string> = {
  友達: "friend",
  友人: "friend",
  彼女: "partner",
  彼氏: "partner",
  恋人: "partner",
  家族: "family",
  親: "family",
  母: "family",
  父: "family",
  妻: "family",
  夫: "family",
  子供: "family",
  同僚: "colleague",
  上司: "colleague",
  先輩: "colleague",
  後輩: "colleague",
  クライアント: "business",
  取引先: "business",
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// セグメント前分類 — ノイズ除去パイプライン
//
// セグメントをタスク抽出に渡す前に分類する。
// affirmation / time_marker / visit / meta_speech → タスクではないのでスキップ。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 肯定・応答パターン（セグメント全体がこれならスキップ） */
const AFFIRMATION_SINGLE = [
  /^(うん|はい|ええ|おう|ああ|うんうん|そう|ね[ぇー]?|だね|だよね|そうそう)$/,
  /^(わかった|了解|りょ|おっけ|OK|ok)$/i,
  /^(そうだ(ね|よ)?|だよ|そうね)$/,
  // availability markers（「予定ある？」→「あるよ」等の返答）
  /^(ある(よ|ね|わ|んだ|で)?|あるある|うんある(よ)?)$/,
];

/** 肯定の複合パターン（「うん決まってるよ」等） */
const AFFIRMATION_COMPOUND =
  /^(うん|はい|ええ|おう)[、\s]*(決まって(る|た)(よ|ね|さ)?|そう(だ(よ|ね))?|もう決めた|OK)/i;

/** 確定表明パターン（「決まってるよ」「もう決めた」— 肯定かつ情報ゼロ） */
const AFFIRMATION_CONFIRMATION = /^(決まって(る|た)(よ|ね|わ|さ)?|もう決めた|決めてある|決めたよ)$/;

/**
 * セグメントが純粋な肯定・応答か判定する。
 * 長いセグメント（15文字超）は「うん、今日はスタバで勉強する」等の可能性があるため除外。
 */
function isAffirmationSegment(text: string): boolean {
  const clean = text.replace(/[。、！!？?…]+$/g, "").trim();
  if (clean.length > 15) return false;
  if (AFFIRMATION_SINGLE.some(p => p.test(clean))) return true;
  if (AFFIRMATION_COMPOUND.test(clean)) return true;
  if (AFFIRMATION_CONFIRMATION.test(clean)) return true;
  return false;
}

/**
 * 時間参照パターン — タスクではなく時間情報として扱うセグメント。
 *
 * 「明日」「明日は」「今日は」「明後日」等がセグメント分割後に
 * 単独で残った場合、タスク候補に流さずにスキップする。
 *
 * P0-2 修正: 「明日」系が "マクドナルドで明日" にタスク化される問題の根治。
 */
const TEMPORAL_REFERENCE_RE =
  /^(明日|明日[はも]|今日[はも]?|明後日|明後日[はも]|あさって|あさって[はも]|昨日|昨日[はも]|一昨日|一昨日[はも]|おととい|おととい[はも]|来週|再来週|今週|今週[はも]|週末)$/;

/** 時間マーカー → startWindow 変換テーブル */
const TIME_MARKER_MAP: Array<{ pattern: RegExp; window: NonNullable<FlowContext["startWindow"]> }> = [
  { pattern: /^(これから|今から|もうすぐ|すぐ(に)?)$/, window: "now" },
  { pattern: /^(午前中|朝(から|いち|一(番)?))$/, window: "morning" },
  { pattern: /^午後(から)?$/, window: "afternoon" },
  { pattern: /^夕方(から)?$/, window: "evening" },
  { pattern: /^(あとで|後で|のちほど|そのうち)$/, window: "later" },
];

/**
 * セグメントが純粋な時間マーカーなら startWindow を返す。
 * 「これから仕事する」等の複合セグメントは null（タスク候補として処理）。
 */
function extractTimeMarkerFromSegment(text: string): FlowContext["startWindow"] | null {
  const clean = text.replace(/[。、！!？?…]+$/g, "").trim();
  if (clean.length > 10) return null; // 長い = 複合セグメント
  for (const { pattern, window } of TIME_MARKER_MAP) {
    if (pattern.test(clean)) return window;
  }
  return null;
}

/**
 * 訪問パターン B-type: 「Xに行って」「Xいって」（て形 + セグメント末尾）
 *
 * B-type は「Xに行って、Yで〜」のように場所を経由する文型。
 * セグメント分割後、「Xにいって」「Xいって」が単独で残った場合に検出する。
 *
 * に無しパターン（「BMWいって」）も検出する。
 * ただし「掃除していって」等の動詞+て形を誤検出しないよう、
 * 場所名がて/で/し等の動詞語尾で終わる場合は除外する。
 *
 * A-type（「Xに行って〜する」— 行き先で活動）は別途 detectVisitWithAction で処理。
 */
const VISIT_SEGMENT_WITH_NI_RE =
  /^(.+?)に(行って|いって|寄って|よって|立ち寄って|向かって)(から)?$/;
const VISIT_SEGMENT_NO_NI_RE =
  /^(.+?)(行って|いって)(から)?$/;

/** 明らかに場所名ではない語（代名詞・時間語等） */
const NON_PLACE_WORDS =
  /^(明日|今日|昨日|毎日|いつも|ここ|そこ|あそこ|どこ|何|誰|自分|みんな|全部|全員)$/;

/** 動詞活用語尾 — これで終わる語は場所名ではなく動詞句 */
const VERB_ENDING_RE = /[てでしるたいけげせめねれべ]$/;

function detectVisitSegment(text: string): { placeName: string } | null {
  const clean = text.replace(/[。！!？?…]+$/g, "").trim();

  // パターン1: 「Xに行って」（に有り — 強シグナル）
  const m1 = clean.match(VISIT_SEGMENT_WITH_NI_RE);
  if (m1) {
    const name = m1[1].trim();
    if (name.length >= 1 && name.length <= 20 && !NON_PLACE_WORDS.test(name)) {
      return { placeName: name };
    }
  }

  // パターン2: 「Xいって」「X行って」（に無し — カジュアルな助詞省略）
  // 「掃除していって」等の動詞+て形を除外するため、語尾チェックを行う
  const m2 = clean.match(VISIT_SEGMENT_NO_NI_RE);
  if (m2) {
    const name = m2[1].trim();
    if (
      name.length >= 1 && name.length <= 15 &&
      !NON_PLACE_WORDS.test(name) &&
      !VERB_ENDING_RE.test(name)  // 「掃除して」「持って」等を除外
    ) {
      return { placeName: name };
    }
  }

  return null;
}

/**
 * A-type 訪問パターン: 「スタバに行って勉強する」→ place=スタバ, action=勉強する
 *
 * て形の後にアクション（2文字以上）が続く場合。
 * 場所はそのまま mainLocation / locationSequence に、アクションはタスクに。
 * に無しパターンも対応。
 */
const VISIT_WITH_ACTION_WITH_NI_RE =
  /^(.+?)に(行って|いって|寄って|よって)(から)?\s*(.{2,})$/;
const VISIT_WITH_ACTION_NO_NI_RE =
  /^(.+?)(行って|いって)(から)?\s*(.{2,})$/;

function detectVisitWithAction(text: string): { placeName: string; action: string } | null {
  const clean = text.replace(/[。！!？?…]+$/g, "").trim();

  // に有りパターン
  let m = clean.match(VISIT_WITH_ACTION_WITH_NI_RE);
  if (m) {
    const name = m[1].trim();
    const action = m[4].trim();
    if (name.length >= 1 && name.length <= 20 && !NON_PLACE_WORDS.test(name) && action.length >= 2) {
      return { placeName: name, action };
    }
  }

  // に無しパターン（動詞語尾チェック付き）
  m = clean.match(VISIT_WITH_ACTION_NO_NI_RE);
  if (m) {
    const name = m[1].trim();
    const action = m[4].trim();
    if (
      name.length >= 1 && name.length <= 15 &&
      !NON_PLACE_WORDS.test(name) &&
      !VERB_ENDING_RE.test(name) &&
      action.length >= 2
    ) {
      return { placeName: name, action };
    }
  }

  return null;
}

/** メタ発話・接続語のみ（単独セグメント化した場合にスキップ） */
const META_SPEECH_PATTERNS = [
  /^(じゃあ|じゃ|では|えっと|えーと|あのー?|あー|うーん|そういえば)$/,
  /^(とりあえず|まず|まずは)$/,
  /^(ちなみに|ところで)$/,
];

/**
 * Discourse marker（談話標識）— 順序を示す接続表現。
 * セグメント先頭にあればタスク名から除去し、順序ヒントとして扱う。
 * cleanTaskText とは別に、セグメント前処理で早期に除去する。
 */
const DISCOURSE_MARKER_RE =
  /^(それが終わったら|終わったら|それ(が|を)?済んだら|それ(が|を)?片付いたら|その(あと|後)(に|で|は)?|そのあとで|そしたら|したら|それから|それで|その次(に|は)?|次(に|は)|あとは|あと|最後(に|は)|まず(は)?|とりあえず|ついでに|帰りに|行きがけに|じゃ(あ)?)\s*/;

function isMetaSpeech(text: string): boolean {
  const clean = text.replace(/[。、！!？?…]+$/g, "").trim();
  if (clean.length > 10) return false;
  return META_SPEECH_PATTERNS.some(p => p.test(clean));
}

/** 全体テキストから startWindow を抽出するパターン */
const START_WINDOW_PATTERNS: Array<{ pattern: RegExp; window: NonNullable<FlowContext["startWindow"]> }> = [
  { pattern: /これから|今から|もうすぐ|すぐに/, window: "now" },
  { pattern: /朝(から|いち|一)|午前中/, window: "morning" },
  { pattern: /午後(から)?|昼(から|過ぎ)/, window: "afternoon" },
  { pattern: /夕方(から)?/, window: "evening" },
  { pattern: /あとで|後で|のちほど/, window: "later" },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// EventType推定
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const EVENT_TYPE_KEYWORDS: Record<string, EventType> = {
  仕事: "work", オフィス: "work", 会議: "work", ミーティング: "work",
  面接: "interview",
  デート: "date",
  友達: "friends", 友人: "friends",
  飲み会: "party", パーティ: "party",
  ジム: "sports", ランニング: "sports", 運動: "sports",
  旅行: "travel",
  結婚式: "formal", 式典: "formal",
  公園: "outdoor", 散歩: "outdoor", ハイキング: "outdoor",
  買い物: "errand", 銀行: "errand", 役所: "errand", 歯医者: "errand", 病院: "errand", 美容院: "errand",
  家: "home", 自宅: "home",
};

function detectEventType(text: string): EventType | undefined {
  for (const [kw, et] of Object.entries(EVENT_TYPE_KEYWORDS)) {
    if (text.includes(kw)) return et;
  }
  return undefined;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 同伴者抽出
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function detectCompanion(text: string): string | undefined {
  for (const [kw, role] of Object.entries(COMPANION_PATTERNS)) {
    if (text.includes(kw)) return kw;
  }
  // 「〇〇と食事」「〇〇と会う」「〇〇とミーティング」パターン
  const companionMatch = text.match(
    /(.+?)と(食事|ご飯|ランチ|ディナー|飲み|会う|遊ぶ|ミーティング|会議|打ち合わせ|面談|面接|商談|相談)/
  );
  if (companionMatch && companionMatch[1].length <= 10) {
    return companionMatch[1].trim();
  }
  return undefined;
}

/**
 * 同伴者付き社会活動を全テキストから事前検出する。
 *
 * 「〇〇とミーティング」「田中さんと打ち合わせ」等のパターンは、
 * と分割（splitIntoSegments）の前に検出しないと分断される。
 *
 * 例: "田中さんと打ち合わせする" → と分割 → ["田中さん", "打ち合わせする"]
 *     → companion が取れない。
 *
 * この関数はセグメント分割前に呼ばれ、検出した部分を fixedEvents に追加する。
 */
/**
 * 同伴者付き社会活動の検出正規表現。
 *
 * P0-4 修正: `.{1,10}?` → `[^、。\n\s]{1,10}?`
 * 句読点・改行・空白を跨がないことで、
 * 「して、そのあとAさん」のような誤捕獲を防ぐ。
 */
const COMPANION_ACTIVITY_RE =
  /([^、。\n\s]{1,10}?)と(?:仕事の|お?)?(食事|ご飯|ランチ|ディナー|飲み|会う|遊ぶ|ミーティング|会議|打ち合わせ|面談|面接|商談|相談)(する|した|して|しよう|の予定)?/g;

function detectCompanionActivities(text: string): Array<{
  companion: string;
  activity: string;
  fullMatch: string;
  /** 元テキスト内でのマッチ開始位置（順序決定用） */
  matchIndex: number;
}> {
  const results: Array<{ companion: string; activity: string; fullMatch: string; matchIndex: number }> = [];
  let match;

  // COMPANION_PATTERNS のキーワード（友達、彼女等）は companionで、
  // それ以外の固有名詞（田中さん、Aさん等）も拾う
  const re = new RegExp(COMPANION_ACTIVITY_RE.source, "g");
  while ((match = re.exec(text)) !== null) {
    let companion = match[1].trim();
    const activity = match[2];

    // companion が空、または明らかに companion ではないパターンを除外
    if (!companion || companion.length < 1) continue;

    // 接続語・時間帯プレフィックスを除去（「そのあとAさん」→「Aさん」「午後からA君」→「A君」）
    companion = companion.replace(/^(そのあと|その後|あとは|それから|次は|次に|そして|あと|午前中?|午後|朝|夕方|夜|昼)(から|に|は)?/, "").trim();
    if (!companion || companion.length < 1) continue;

    // 「思う」「言う」等の動詞接続は除外
    if (/[てでしるたいけげせめねれべ]$/.test(companion)) continue;
    // 否定コンテキスト（「〜以外に〜」）のマッチは除外
    if (/以外/.test(match[0]) || /以外/.test(companion)) continue;
    // 代名詞・時間語は除外
    if (NON_PLACE_WORDS.test(companion)) continue;

    results.push({
      companion,
      activity,
      fullMatch: match[0],
      matchIndex: match.index,
    });
  }

  return results;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// メインパーサー
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * ユーザーのテキストから構造化された1日の意図を抽出する。
 *
 * パイプライン:
 *   1. 全体テキストから FlowContext を抽出（goOut / durationHint / certainty / startWindow）
 *   2. セグメント分割（句点・読点・「と」）
 *   3. セグメント前分類 — タスクではないものを除去:
 *      a. 肯定・応答（「うん」「決まってるよ」「うん決まってるよ」）
 *      b. 時間マーカー（「これから」→ startWindow）
 *      c. 行動条件（「外に行くよ」「家にいるよ」→ FlowContext）
 *      d. 訪問パターン B-type（「BMWにいって」→ LocationStop visit）
 *      e. ノイズ / メタ発話
 *   4. 残ったタスク候補から場所・タスク・固定予定を抽出
 *   5. フォールバック場所検出 + goOut推論
 */
export function parseIntent(text: string): ParsedDayIntent {
  const result: ParsedDayIntent = {
    primaryTasks: [],
    fixedEvents: [],
    flowContext: {},
    locationSequence: [],
  };

  // ── Step 0.5: targetDate 抽出（「明日」「明後日」等 → YYYY-MM-DD） ──
  result.targetDate = extractTargetDate(text);

  // ── Step 1: 全体テキストから FlowContext を抽出 ──
  result.flowContext = extractFlowContext(text);

  // ── Step 1.5: 同伴者付き活動の事前検出 ──
  // 「〇〇とミーティング」「田中さんと打ち合わせ」等は、
  // と分割の前に検出しないと「〇〇」と「ミーティング」に分断される。
  // ここで検出したら fixedEvents に追加し、元テキストからその部分を除去する。
  let textForSegments = text;
  const preDetectedCompanions = detectCompanionActivities(text);
  for (const ca of preDetectedCompanions) {
    result.fixedEvents.push({
      title: ca.activity,
      companion: ca.companion,
      eventType: detectEventType(ca.activity) ?? "friends",
      textPosition: ca.matchIndex,
    });
    // 元テキストから「〇〇と〇〇する」部分を除去（重複防止）
    textForSegments = textForSegments.replace(ca.fullMatch, "");
  }

  // ── Step 2: セグメント分割 ──
  const segments = splitIntoSegments(textForSegments);

  // ── Step 3: セグメント前分類 ──
  const taskCandidates: Array<{ text: string; textPosition: number }> = [];
  let locationOrder = 0;

  for (const seg of segments) {
    const trimmed = seg.trim();
    if (trimmed.length < 2) continue;

    // 元テキスト内での位置を追跡（sequenceOrder 決定用）
    const segTextPosition = text.indexOf(trimmed);

    // (a) 肯定・応答（「うん」「決まってるよ」「うん決まってるよ」）→ スキップ
    if (isAffirmationSegment(trimmed)) continue;

    // (a-2) 時間参照（「明日」「明日は」「今日は」→ タスクではない。スキップ）
    if (TEMPORAL_REFERENCE_RE.test(trimmed.replace(/[。、！!？?…]+$/g, "").trim())) continue;

    // (b) 時間マーカー（「これから」→ startWindow 抽出 & スキップ）
    const tw = extractTimeMarkerFromSegment(trimmed);
    if (tw) {
      result.flowContext.startWindow = tw;
      continue;
    }

    // (c) 行動条件（「外に行くよ」「家にいるよ」→ FlowContext で吸収済み）
    const normalizedForFlowCheck = trimmed.replace(/^今日[はも]?\s*/, "");
    if (FLOW_CONDITION_PATTERNS.some(p => p.test(trimmed) || p.test(normalizedForFlowCheck))) continue;

    // (d) 訪問パターン B-type（「BMWにいって」→ 経由地として記録）
    const visit = detectVisitSegment(trimmed);
    if (visit) {
      locationOrder++;
      const resolved = resolvePlaceSync(visit.placeName);
      result.locationSequence!.push({
        label: resolved?.place.canonicalLabel ?? visit.placeName,
        canonicalId: resolved?.place.id,
        kind: "visit",
        order: locationOrder,
        category: resolved?.place.category as any,
      });
      if (result.flowContext.goOut === undefined) result.flowContext.goOut = true;
      continue;
    }

    // (d-2) 「帰る」パターン — end-point trigger（タスクではない）
    if (RETURN_SIMPLE_RE.test(trimmed)) {
      // 帰り先指定なし → 自宅デフォルト
      if (!result.endpointAnchor) {
        result.endpointAnchor = buildEndpointAnchor(undefined);
        result.returnDestination = undefined;
      }
      continue;
    }
    const returnMatch = trimmed.match(RETURN_HOME_RE);
    if (returnMatch) {
      const dest = returnMatch[1]?.trim();
      // 動詞活用語尾（して、って、って等）で終わる場合は destination ではなくアクションの残り
      const isActionResidue = dest && /[てでしるたいけげせめねれべ]$/.test(dest);
      if (dest && dest.length >= 1 && !NON_PLACE_WORDS.test(dest) && !isActionResidue) {
        result.endpointAnchor = buildEndpointAnchor(dest);
        result.returnDestination = dest; // 後方互換
      } else if (!result.endpointAnchor) {
        result.endpointAnchor = buildEndpointAnchor(undefined);
        result.returnDestination = undefined;
      }
      continue;
    }

    // (e-pre) discourse marker を先に除去（ノイズ判定より前）
    //   「それが終わったらスタバでミーティング」→「スタバでミーティング」にしてからノイズ判定
    let stripped = trimmed.replace(DISCOURSE_MARKER_RE, "").trim();
    if (stripped.length < 2) continue;

    // (e) ノイズ / メタ発話（discourse marker 除去後のテキストで判定）
    if (isNoise(stripped)) continue;
    if (isMetaSpeech(stripped)) continue;

    // ── 残り → タスク候補 ──
    taskCandidates.push({ text: stripped, textPosition: segTextPosition });
  }

  // ── Step 4: タスク候補を処理 ──
  for (const { text: seg, textPosition: candTextPos } of taskCandidates) {
    // 時刻付き → fixedEvent（ただし帰宅パターンは endpoint に変換）
    const time = extractTime(seg);
    if (time) {
      // 帰宅・終了パターン — fixedEvent ではなく endpointAnchor にする
      if (/帰宅|帰[るり]|終了|終わ[るり]|撤収|上がり|上がる/.test(seg)) {
        if (!result.endpointAnchor) {
          result.endpointAnchor = buildEndpointAnchor(undefined);
        }
        result.endpointAnchor.fixedStart = time;
        result.flowContext.endTime = time;
        continue;
      }
      const cleanTitle = cleanFixedEventTitle(seg);
      if (cleanTitle.length >= 2) {
        result.fixedEvents.push({
          title: cleanTitle,
          startTime: time,
          companion: detectCompanion(seg),
          eventType: detectEventType(seg),
          textPosition: candTextPos,
        });
      }
      continue;
    }

    // A-type 訪問パターン: 「スタバに行って勉強する」→ place+task 分離
    const visitAction = detectVisitWithAction(seg);
    if (visitAction) {
      const resolved = resolvePlaceSync(visitAction.placeName);
      const isTransient = resolved && ["clinic", "hospital"].includes(resolved.place.category);
      if (!isTransient) {
        if (!result.mainLocation) {
          result.mainLocation = {
            canonicalId: resolved?.place.id ?? "",
            label: resolved?.place.canonicalLabel ?? visitAction.placeName,
            category: resolved?.place.category as any,
            source: "user_explicit",
            traits: resolved?.place.traits as any,
          };
        }
        const alreadyInSeq = result.locationSequence!.some(
          ls => ls.canonicalId && ls.canonicalId === resolved?.place.id
        );
        if (!alreadyInSeq) {
          locationOrder++;
          result.locationSequence!.push({
            label: resolved?.place.canonicalLabel ?? visitAction.placeName,
            canonicalId: resolved?.place.id,
            kind: "main",
            order: locationOrder,
            category: resolved?.place.category as any,
          });
        }
        if (result.flowContext.goOut === undefined) result.flowContext.goOut = true;
      }
      // アクション部分をタスクとして処理
      const actionClean = cleanTaskText(visitAction.action);
      if (actionClean.length >= 2) {
        const activity = resolveActivitySync(actionClean);
        const duration = activity?.defaultDurationMin ?? getDefaultDurationSync(actionClean);
        result.primaryTasks.push({
          text: activity?.canonical ?? actionClean,
          category: activity?.category as any,
          estimatedDurationMin: duration,
          textPosition: candTextPos,
        });
      }
      continue;
    }

    // タスクテキスト整形
    const cleanTask = cleanTaskText(seg);
    if (cleanTask.length < 2) continue;

    // 場所解決
    const segPlace = resolvePlaceSync(seg);

    // 場所のみのセグメント（「マックで」等）→ 場所として記録
    if (segPlace && cleanTask.replace(segPlace.matchedAlias, "").replace(/[でにへ]/g, "").trim().length < 2) {
      if (!result.mainLocation) {
        const isTransient = ["clinic", "hospital"].includes(segPlace.place.category);
        if (!isTransient) {
          result.mainLocation = {
            canonicalId: segPlace.place.id,
            label: segPlace.place.canonicalLabel,
            category: segPlace.place.category as any,
            source: "user_explicit",
            traits: segPlace.place.traits as any,
          };
          if (!result.locationSequence!.some(ls => ls.canonicalId === segPlace.place.id)) {
            locationOrder++;
            result.locationSequence!.push({
              label: segPlace.place.canonicalLabel,
              canonicalId: segPlace.place.id,
              kind: "main",
              order: locationOrder,
              category: segPlace.place.category as any,
            });
          }
        }
      }
      continue;
    }

    // 場所付きタスク（「マックで仕事する予定」→ 場所=マック, タスク=仕事）
    if (segPlace) {
      const isTransient = ["clinic", "hospital"].includes(segPlace.place.category);
      if (!isTransient) {
        if (!result.mainLocation) {
          result.mainLocation = {
            canonicalId: segPlace.place.id,
            label: segPlace.place.canonicalLabel,
            category: segPlace.place.category as any,
            source: "user_explicit",
            traits: segPlace.place.traits as any,
          };
        }
        if (!result.locationSequence!.some(ls => ls.canonicalId === segPlace.place.id)) {
          locationOrder++;
          result.locationSequence!.push({
            label: segPlace.place.canonicalLabel,
            canonicalId: segPlace.place.id,
            kind: result.mainLocation?.canonicalId === segPlace.place.id ? "main" : "stop",
            order: locationOrder,
            category: segPlace.place.category as any,
          });
        }
      }
    }

    // 場所名をタスクテキストから除去
    let finalText = cleanTask;
    if (segPlace) {
      finalText = finalText.replace(segPlace.matchedAlias, "").replace(/^[でにへ]\s*/, "").trim();
      if (finalText.length < 2) finalText = cleanTask;
    }

    // アクティビティ解決
    const activity = resolveActivitySync(finalText);
    const duration = activity?.defaultDurationMin ?? getDefaultDurationSync(finalText);

    // 同伴者チェック
    const companion = detectCompanion(seg);
    if (companion) {
      result.fixedEvents.push({
        title: finalText,
        companion,
        eventType: detectEventType(seg) ?? "friends",
        textPosition: candTextPos,
      });
    } else {
      result.primaryTasks.push({
        text: activity?.canonical ?? finalText,
        category: activity?.category as any,
        estimatedDurationMin: duration,
        textPosition: candTextPos,
      });
    }
  }

  // ── Step 5: フォールバック場所検出（セグメントで取れなかった場合） ──
  if (!result.mainLocation) {
    const placeResult = resolvePlaceSync(text);
    if (placeResult) {
      const isTransient = ["clinic", "hospital"].includes(placeResult.place.category);
      if (!isTransient) {
        result.mainLocation = {
          canonicalId: placeResult.place.id,
          label: placeResult.place.canonicalLabel,
          category: placeResult.place.category as any,
          source: "user_explicit",
          traits: placeResult.place.traits as any,
        };
      }
    }
  }

  // ── Step 6: goOut推論 + locationSequence後処理 ──
  if (result.flowContext.goOut === undefined) {
    if (result.mainLocation || (result.locationSequence && result.locationSequence.length > 0)) {
      result.flowContext.goOut = true;
    }
  }

  // mainLocation が locationSequence に未追加ならここで追加
  if (result.mainLocation && result.locationSequence) {
    const hasMain = result.locationSequence.some(
      ls => ls.kind === "main" || (ls.canonicalId && ls.canonicalId === result.mainLocation!.canonicalId)
    );
    if (!hasMain) {
      locationOrder++;
      result.locationSequence.push({
        label: result.mainLocation.label,
        canonicalId: result.mainLocation.canonicalId,
        kind: "main",
        order: locationOrder,
        category: result.mainLocation.category,
      });
    }
  }

  // 空の locationSequence は undefined に
  if (result.locationSequence && result.locationSequence.length === 0) {
    result.locationSequence = undefined;
  }

  return result;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// targetDate 抽出
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const TARGET_DATE_MAP: Array<{ pattern: RegExp; offset: number }> = [
  { pattern: /一昨日|おととい/, offset: -2 },
  { pattern: /昨日/, offset: -1 },
  { pattern: /今日/, offset: 0 },
  { pattern: /明日/, offset: 1 },
  { pattern: /明後日|あさって/, offset: 2 },
  { pattern: /明明後日|しあさって/, offset: 3 },
];

/**
 * テキストから対象日を抽出し YYYY-MM-DD で返す。
 * 「明日」→ today + 1、「明後日」→ today + 2、未指定 → undefined（= today 扱い）。
 */
function extractTargetDate(text: string): string | undefined {
  for (const { pattern, offset } of TARGET_DATE_MAP) {
    if (pattern.test(text)) {
      if (offset === 0) return undefined; // 「今日」は明示的に today → undefined で十分
      const d = new Date();
      // JST (UTC+9)
      d.setHours(d.getHours() + 9);
      d.setDate(d.getDate() + offset);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    }
  }
  return undefined;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FlowContext 抽出
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function extractFlowContext(text: string): FlowContext {
  const ctx: FlowContext = {};

  // 外出判定
  if (GO_OUT_PATTERNS.some(p => p.test(text))) {
    ctx.goOut = true;
  } else if (STAY_HOME_PATTERNS.some(p => p.test(text))) {
    ctx.goOut = false;
  }

  // 時間感
  for (const { pattern, hint } of DURATION_HINT_PATTERNS) {
    if (pattern.test(text)) {
      ctx.durationHint = hint;
      break;
    }
  }

  // 確度
  for (const { pattern, level } of CERTAINTY_PATTERNS) {
    if (pattern.test(text)) {
      ctx.certainty = level;
      break;
    }
  }
  if (!ctx.certainty) ctx.certainty = "medium";

  // 開始タイミング（「これから」「午後から」等）
  for (const { pattern, window } of START_WINDOW_PATTERNS) {
    if (pattern.test(text)) {
      ctx.startWindow = window;
      break;
    }
  }

  // 移動手段
  const transport = detectTransport(text);
  if (transport) {
    ctx.transport = transport as FlowContext["transport"];
    if (ctx.goOut === undefined) ctx.goOut = true;
  }

  return ctx;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// テキスト分割
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 保護パターン: 「〜と思う」等は「と」で分割しない */
const TO_PROTECT_SUFFIX = /と(思[うっ]|考え|感じ|言[うっ]|聞[いく]|言わ|思っ)/;
const TO_PROTECT_COMPANION = /(友達|友人|彼[女氏]|家族|同僚|先輩|後輩|上司|部下|子供|親|母|父|妻|夫|旦那|嫁|.{1,5}[君さちゃん様氏]|[A-Za-z][君さちゃん様氏]?)と/;
/** 「そのあと〜」は「と」で分割しない（ただし先頭の「あとは」は除外 — 列挙の前置詞） */
const TO_PROTECT_CONJUNCTION = /(そのあと|のあと|んあと)/;

function splitIntoSegments(text: string): string[] {
  // Step 1: 句点・改行で分割
  const rawLines = text.split(/[\n。]+/).map(s => s.trim()).filter(Boolean);

  // Step 2: 読点分割
  const splitByComma: string[] = [];
  for (const line of rawLines) {
    const parts = line.split(/、/).map(s => s.trim()).filter(Boolean);
    splitByComma.push(...parts);
  }

  // Step 3: 「と」分割（保護パターンを除外）
  const result: string[] = [];
  for (const line of splitByComma) {
    if (TO_PROTECT_SUFFIX.test(line) || TO_PROTECT_COMPANION.test(line) || TO_PROTECT_CONJUNCTION.test(line)) {
      result.push(line);
      continue;
    }
    const parts = line.split(/(?<=.{2,})と(?=.{2,})/);
    if (parts.length > 1 && parts.every(p => p.length >= 2 && p.length <= 20)) {
      result.push(...parts.map(p => p.trim()));
    } else {
      result.push(line);
    }
  }

  return result;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// テキストクリーニング
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const NOISE_PATTERNS = [
  /^(仕事|バイト)?(です|だ)(から|し|けど|よ|ね|もん)/,
  /^(これ|それ|あれ)[はがも]/,
  /^(まぁ|まあ|ちなみに|ただ|でも|けど)/,
  /^(と思[うっ]|って感じ|みたいな|的な)/,
  /^(そのあ|あとは|それから)$/,  // 接続語が分割で孤立した場合
  /^(明日|今日|明後日|あさって)?の?予定(だけど|なんだけど|は|が|を)/, // 前置き：「明日の予定だけど」
  /^(こんな|そんな|あんな|この|その)感じ(で|かな)?$/,
  /^(以上|こんなもん|そんな感じ|って感じ|ざっくり)$/,
];

/** 否定文パターン — 「〜以外に〜ない」「予定はない」等はタスクではない */
const NEGATION_RE = /(?:以外に|しか).{0,20}(?:ない|いない|ません)|予定[はが]?(?:特に)?ない|(?:会[わう]|行か)ない/;

function isNoise(text: string): boolean {
  if (text.length < 2) return true;
  if (NEGATION_RE.test(text)) return true;
  return NOISE_PATTERNS.some(p => p.test(text));
}

function cleanFixedEventTitle(text: string): string {
  return text
    .replace(TIME_REGEX, "")
    .replace(PERIOD_REGEX, "")
    .replace(/^\s*に?\s*/, "")
    .replace(/^(明日|明後日|あさって|今日|昨日|一昨日|おととい)[はも]?\s*/, "")
    // 末尾の「と」を除去（列挙の区切り残り）
    .replace(/と$/, "")
    .trim();
}

function cleanTaskText(text: string): string {
  return text
    .replace(TIME_REGEX, "")
    .replace(PERIOD_REGEX, "")
    .replace(/^\s*に?\s*/, "")
    .replace(/^(明日|明後日|あさって|今日|昨日|一昨日|おととい)[はも]?\s*/, "")
    // discourse marker（談話標識）プレフィックスを除去
    .replace(DISCOURSE_MARKER_RE, "")
    // 時間量表現を除去（タスク名ではない）
    .replace(/(1日中|一日中|終日|ずっと|半日)\s*/, "")
    // 予定・つもり表現を除去（確度情報は FlowContext に抽出済み）
    .replace(/(する|やる|行く)?(の)?(予定|つもり)(だ|です)?(よ|ね|さ)?$/, "")
    // 文末の意志表現を正規化
    .replace(/(よう|おう)と思[うっ]て(る|い[るた])?$/, "る")
    .replace(/(し|やり|行き|出)たいと思[うっ]て?$/, "$1たい")
    .replace(/の続きや$/, "の続き")
    // 「〜かな」等の文末を除去
    .replace(/かな[ぁ]?$/, "")
    .replace(/かもしれない$/, "")
    .replace(/だと思う$/, "")
    // 末尾の「と」を除去（列挙の区切り残り）
    .replace(/と$/, "")
    // 場所指示語の「で」を除去（「スタバで」→ 場所として処理される）
    .replace(/^(.+?)で$/, "$1")
    .trim();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Intent → PlanItems 変換（既存の buildDayPlan と接続するため）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function generateId(): string {
  return `mp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * what / who / where から表示用 text を自動生成する。
 * 例: what="仕事", who="田中さん", where="スタバ" → "田中さんと仕事(スタバ)"
 *     what="買い物", who=null, where="スーパー" → "買い物(スーパー)"
 *     what="作業", who=null, where=null → "作業"
 */
function buildDisplayText(what: string, who?: string, where?: string): string {
  let text = who ? `${who}と${what}` : what;
  if (where) text += `(${where})`;
  return text;
}

/**
 * ParsedDayIntent から PlanItem[] に変換する。
 * 既存の buildDayPlan/MorningPlanCard と互換性を保つ。
 *
 * 順序:
 *   1. Visit アイテム（locationSequence の visit を正規化テキストで追加）
 *   2. Fixed events（時間固定の予定）
 *   3. Primary tasks（メインタスク — mainLocation を location に添付）
 *
 * これにより visit → main task の実行順序がプランに反映される。
 */
export function intentToPlanItems(intent: ParsedDayIntent, sourceTurnIndex: number = 0): PlanItem[] {
  const items: PlanItem[] = [];
  let orderCounter = 0;

  // ── Visit アイテム（経由地 — locationSequence から生成） ──
  // 「BMWいって」→「BMWに寄る」に正規化して追加。
  // 生文言をそのまま予定名にしない。
  // sequenceOrder を付与して、スケジューラが duration ソートで壊さないようにする。
  if (intent.locationSequence) {
    for (const ls of intent.locationSequence) {
      if (ls.kind === "visit") {
        const what = `${ls.label}に寄る`;
        items.push({
          id: generateId(),
          kind: "todo",
          text: what,  // visit 項目は what 自体が場所を含むので where 不要
          what,
          durationMin: 30,             // visit のデフォルト所要時間
          fixedStart: false,
          orderHint: orderCounter++,
          sourceTurnIndex,
          eventType: "errand" as any,
          completed: false,
          sequenceOrder: ls.order,     // locationSequence の順序を維持
          location: ls.canonicalId ? {
            canonicalId: ls.canonicalId,
            label: ls.label,
            category: ls.category as any,
            source: "user_explicit" as const,
          } : undefined,
        });
      }
    }
  }

  // ── P1-1: fixedEvents + primaryTasks を textPosition でソートし統一 sequenceOrder を付与 ──
  // 「仕事して、そのあとAさんと会う」→ 仕事が先、Aさんと会うが後 の順序を保証。
  // textPosition は parseIntent で元テキスト内のマッチ位置として記録される。
  const maxVisitOrder = intent.locationSequence
    ? Math.max(0, ...intent.locationSequence.map(ls => ls.order))
    : 0;

  // fixedEvents と primaryTasks を統合し、textPosition 順にソート
  type MergedEntry =
    | { type: "fixed"; ev: (typeof intent.fixedEvents)[number]; textPos: number }
    | { type: "primary"; task: (typeof intent.primaryTasks)[number]; index: number; textPos: number };

  const mergedEntries: MergedEntry[] = [];

  for (const ev of intent.fixedEvents) {
    mergedEntries.push({ type: "fixed", ev, textPos: ev.textPosition ?? 9999 });
  }
  for (let i = 0; i < intent.primaryTasks.length; i++) {
    const task = intent.primaryTasks[i];
    mergedEntries.push({ type: "primary", task, index: i, textPos: task.textPosition ?? 9999 });
  }

  // textPosition 昇順ソート（元テキスト出現順 = ユーザーの意図した順序）
  mergedEntries.sort((a, b) => a.textPos - b.textPos);

  // 統一 sequenceOrder を visit の後から連番で付与
  for (let seqIdx = 0; seqIdx < mergedEntries.length; seqIdx++) {
    const entry = mergedEntries[seqIdx];
    const seqOrder = maxVisitOrder + 1 + seqIdx;

    if (entry.type === "fixed") {
      const ev = entry.ev;
      const what = ev.title;
      const hasExplicitTime = !!ev.startTime;
      items.push({
        id: generateId(),
        kind: hasExplicitTime ? "fixed" : "todo",
        text: buildDisplayText(what, ev.companion),
        what,
        startTime: ev.startTime,
        durationMin: getDefaultDurationSync(ev.title),
        fixedStart: hasExplicitTime,
        orderHint: orderCounter++,
        sourceTurnIndex,
        eventType: ev.eventType,
        withWhom: ev.companion,
        completed: false,
        sequenceOrder: seqOrder,
        location: undefined,
        activityCategory: resolveActivitySync(ev.title)?.category as any,
      });
    } else {
      const task = entry.task;
      const taskLoc = intent.taskLocations?.find(tl => tl.taskIndex === entry.index);
      const loc = taskLoc?.location ?? intent.mainLocation;
      const where = loc?.label;

      items.push({
        id: generateId(),
        kind: "todo",
        text: buildDisplayText(task.text, undefined, where),
        what: task.text,
        durationMin: task.estimatedDurationMin,
        fixedStart: false,
        orderHint: orderCounter++,
        sourceTurnIndex,
        eventType: detectEventType(task.text),
        completed: false,
        sequenceOrder: seqOrder,
        location: loc,
        activityCategory: task.category,
      });
    }
  }

  return items;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// プラン表示用メッセージ生成
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 構造化されたintentから、ユーザーに見せる短い確認メッセージを生成する。
 *
 * locationSequence がある場合は訪問順序を明示:
 *   「まずBMWに寄って、そのあとマクドナルドで仕事する想定で組むよ。」
 */
export function buildIntentConfirmMessage(intent: ParsedDayIntent): string {
  const parts: string[] = [];

  // ── 訪問順序がある場合は専用フォーマット ──
  const visits = intent.locationSequence?.filter(ls => ls.kind === "visit") ?? [];
  const mainStop = intent.locationSequence?.find(ls => ls.kind === "main");

  if (visits.length > 0) {
    // ── 訪問順序あり: 役割に応じた優先順位付きメッセージ ──
    //
    // CEOの期待:
    // 「了解。これからまずBMWに寄って、そのあとマクドナルドで仕事する流れだね。
    //  メインはマクドナルド作業で組むよ。」
    const startPrefix = intent.flowContext.startWindow === "now" ? "これから" : "";
    const visitLabels = visits.map(v => `${v.label}に寄って`).join("、");
    const mainTask = intent.primaryTasks[0]?.text;

    if (mainStop && mainTask) {
      // visit + mainLocation + mainTask がすべて揃っている（理想形）
      parts.push(
        `了解。${startPrefix}まず${visitLabels}、そのあと${mainStop.label}で${mainTask}する流れだね。`
      );
      parts.push(`メインは${mainStop.label}での${mainTask}で組むよ。`);
    } else if (mainStop) {
      parts.push(
        `${startPrefix}まず${visitLabels}、そのあと${mainStop.label}に行く流れだね。`
      );
    } else if (mainTask) {
      parts.push(
        `${startPrefix}まず${visitLabels}、そのあと${mainTask}する流れで組むよ。`
      );
    } else {
      parts.push(`${visitLabels}行く流れで組むよ。`);
    }
  } else {
    // ── 従来のフォーマット（訪問順序なし） ──
    // targetDate があれば「明日は」「明後日は」等を使う
    const dateLabel = intent.targetDate
      ? (intent.targetDate === todayJST() ? "今日" : "明日")
      : "今日";
    if (intent.flowContext.goOut === true) {
      if (intent.mainLocation) {
        parts.push(`${dateLabel}は${intent.mainLocation.label}で作業する想定で`);
      } else {
        parts.push(`${dateLabel}は外で作業する想定で`);
      }
    } else if (intent.flowContext.goOut === false) {
      parts.push(`${dateLabel}は家で過ごす想定で`);
    }

    // メインタスク
    if (intent.primaryTasks.length > 0) {
      const mainTask = intent.primaryTasks[0].text;
      if (intent.primaryTasks.length === 1) {
        parts.push(`メインは${mainTask}だね。`);
      } else {
        const taskNames = intent.primaryTasks.map(t => t.text).join("と");
        parts.push(`${taskNames}を組んでいくね。`);
      }
    }

    // 場所（まだ言及してない場合）
    if (intent.mainLocation && !intent.flowContext.goOut) {
      parts.push(`場所は${intent.mainLocation.label}想定で組んでみるよ。`);
    } else if (parts.length > 0 && !parts[0].includes(intent.mainLocation?.label ?? "___")) {
      if (intent.mainLocation) {
        parts.push(`場所は${intent.mainLocation.label}想定で組んでみるよ。`);
      }
    }

    // 開始タイミング（visitがない場合のみここで表示）
    if (intent.flowContext.startWindow === "now") {
      parts.push("これから出発する想定だね。");
    }
  }

  // 固定予定
  if (intent.fixedEvents.length > 0) {
    const eventList = intent.fixedEvents
      .map(e => {
        const title = e.companion ? `${e.companion}と${e.title}` : e.title;
        return e.startTime ? `${e.startTime} ${title}` : title;
      })
      .join("、");
    parts.push(`予定は${eventList}。`);
  }

  // 終了時刻
  if (intent.flowContext.endTime) {
    parts.push(`${intent.flowContext.endTime}頃に終了する想定だね。`);
  }

  // 移動手段
  if (intent.flowContext.transport) {
    const labels: Record<string, string> = {
      train: "電車", car: "車", bus: "バス", walk: "徒歩",
      bicycle: "自転車", taxi: "タクシー", motorcycle: "バイク", plane: "飛行機",
    };
    const label = labels[intent.flowContext.transport] ?? intent.flowContext.transport;
    parts.push(`移動は${label}だね。`);
  }

  // 時間感
  if (intent.flowContext.durationHint === "all_day") {
    parts.push("1日使う想定で組むよ。");
  }

  if (parts.length === 0) {
    return "こんな感じで組んでみたよ。";
  }

  return parts.join("\n");
}
