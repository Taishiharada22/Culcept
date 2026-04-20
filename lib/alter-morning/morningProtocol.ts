/**
 * Morning Protocol — オーケストレーター
 *
 * Alter APIから呼ばれ、Morning Protocolのフェーズを管理する。
 * 各フェーズで適切なエンジンを呼び出し、レスポンスを構築する。
 */

import type {
  MorningSession,
  MorningPhase,
  MorningProtocolResponse,
  MorningPlan,
  DayConditions,
  PlanItem,
  ParsedDayIntent,
} from "./types";
import { todayJST } from "./dateUtils";
import {
  checkSufficiency,
  extractDayConditions,
  buildClarifyQuestion,
  buildPlanClarifyQuestion,
  checkPlanIntakeSufficiency,
  checkOutfitSufficiency,
  buildOutfitClarifyQuestion,
  applyOutfitClarifyResponse,
  inferVenueFromPlan,
  inferVenueFromCategory,
  detectMood,
} from "./sufficiencyGate";
import type { MissingField } from "./types";
import { parseUserInput, buildDayPlan, buildDayPlanAsync, type AsyncPlanOptions } from "./planningEngine";
import { parseIntent, intentToPlanItems, buildIntentConfirmMessage } from "./intentParser";
import { resolveOrigin, resolveEndpoint, getSegmentCoords, type SavedBase } from "./locationResolver";
import type { LatLng } from "./routesApiClient";
import { applyPlanEdit, addDifferentialItems } from "./planEditor";
import { applyImplicitLocationFill, buildLocationClarifyQuestion } from "./locationClarify";
import { generateProactiveSuggestion } from "./proactiveSuggestions";
import type { PlanState } from "./planState";
import { evaluatePlanReadiness, applyPlacementStatusFromPlan } from "./planReadinessGate";
import type { TransportMode } from "@/app/(culcept)/calendar/_lib/vcTypes";

// ── Phase D rollback (CEO 2026-04-17): 都市圏判定は撤回 ──
// transport 自動推論を廃止したため本 Set は未使用。
// 将来 user-pattern 推論を再導入する際の参考として保存のみ。
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _TRAIN_PREFECTURES_V2_ARCHIVED = new Set([
  "東京都", "神奈川県", "千葉県", "埼玉県",
  "大阪府", "京都府", "兵庫県",
  "愛知県",
]);

// ── v2 LLM モジュールの遅延ロード（server-only の循環回避 + テスト互換） ──
let _extractPlanFromText: typeof import("./llmPlanExtractor").extractPlanFromText | null = null;
let _buildPlanConfirmMessage: typeof import("./llmPlanExtractor").buildPlanConfirmMessage | null = null;
let _buildDeltaConfirmMessage: typeof import("./llmPlanExtractor").buildDeltaConfirmMessage | null = null;
let _planStateToPlanItems: typeof import("./llmPlanExtractor").planStateToPlanItems | null = null;
let _removeMissingField: typeof import("./llmPlanExtractor").removeMissingField | null = null;
let _detectDelta: typeof import("./llmDeltaParser").detectDelta | null = null;
let _applyDelta: typeof import("./llmDeltaParser").applyDelta | null = null;
let _resolveAnchors: typeof import("./placeResolver").resolveAnchors | null = null;
let _resolveNearAnchorPlaces: typeof import("./placeResolver").resolveNearAnchorPlaces | null = null;
let _resolveRecommendationIntent:
  | typeof import("./placeResolver").resolveRecommendationIntent
  | null = null;
let _attachNearbyPlacesToProposals:
  | typeof import("./gapFillPlaceEnricher").attachNearbyPlacesToProposals
  | null = null;
let _extractHardAnchors: typeof import("./objectiveFunction").extractHardAnchors | null = null;

/** test export: v2 モジュール強制ロード */
export async function ensureV2Modules(): Promise<boolean> {
  if (_extractPlanFromText && _detectDelta) return true;
  try {
    if (!_extractPlanFromText) {
      const ext = await import("./llmPlanExtractor");
      _extractPlanFromText = ext.extractPlanFromText;
      _buildPlanConfirmMessage = ext.buildPlanConfirmMessage;
      _buildDeltaConfirmMessage = ext.buildDeltaConfirmMessage;
      _planStateToPlanItems = ext.planStateToPlanItems;
      _removeMissingField = ext.removeMissingField;
    }
    if (!_detectDelta) {
      const delta = await import("./llmDeltaParser");
      _detectDelta = delta.detectDelta;
      _applyDelta = delta.applyDelta;
    }
    if (!_resolveAnchors || !_resolveNearAnchorPlaces || !_resolveRecommendationIntent) {
      const pr = await import("./placeResolver");
      _resolveAnchors = pr.resolveAnchors;
      _resolveNearAnchorPlaces = pr.resolveNearAnchorPlaces;
      _resolveRecommendationIntent = pr.resolveRecommendationIntent;
    }
    if (!_attachNearbyPlacesToProposals) {
      const en = await import("./gapFillPlaceEnricher");
      _attachNearbyPlacesToProposals = en.attachNearbyPlacesToProposals;
    }
    if (!_extractHardAnchors) {
      const obj = await import("./objectiveFunction");
      _extractHardAnchors = obj.extractHardAnchors;
    }
    return true;
  } catch {
    // テスト環境等で server-only モジュールが利用できない場合は v1 フォールバック
    return false;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Input complexity gate（CEO 根治 P1 — 2026-04-17）
//
// 両 LLM (Gemini + OpenAI) が失敗 or 空デルタを返したとき、
// 「シンプル入力」なら V1 regex を最終防衛線として使うが、
// 「複雑入力」（人名・複数タスク・日付指示・メタ発話など）は V1 regex に落とすと
//   「明日の話。場所は未定。おすすめある？」が 4 タスクに化けるなど state を破壊する。
// その場合は fail-closed で safe clarify を返し、session state を壊さない。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// 複数節を含む可能性のある区切り
const COMPLEXITY_SEGMENT_SPLIT_RE = /[、,]|\s+そして\s+|\s+それから\s+/;
// 敬称つき人名（A さん、B ちゃん等）
const COMPLEXITY_PERSON_RE = /[A-Za-zぁ-んァ-ヶ一-龠々]{1,6}(?:さん|くん|君|ちゃん|先生|社長|部長|課長)/;
// 日付・時刻マーカー
const COMPLEXITY_DATE_RE = /(今日|明日|明後日|あした|あさって|来週|今週|[0-9０-９]{1,2}月[0-9０-９]{1,2}日)/;
const COMPLEXITY_TIME_RE = /(\d{1,2}[時:]\d{0,2}|朝|昼|夕方|夜|午前|午後|正午)/g;
// メタ発話（計画の話題そのものを問い直す／提案依頼）
const COMPLEXITY_META_RE = /(じゃなくて|ではなく|じゃない|違う|未定|決まってない|わからない|おすすめ|提案|どうしたら|どうすれば|何したら|何すれば)/;

/**
 * ユーザー入力の複雑度を判定する。
 *
 * "complex" が返る条件:
 *  - 長さ ≥ 30 文字
 *  - 句点/カンマ等の区切りが 2 箇所以上
 *  - 敬称つき人名を含む
 *  - 日付マーカーを含む（targetDate 分岐が絡む）
 *  - 時刻マーカーが 2 箇所以上
 *  - メタ発話（訂正・未定・提案依頼）を含む
 *
 * これらのどれか 2 条件以上 or 明確なメタ発話 1 条件で complex 扱い。
 * 1 条件のみかつ短ければ simple（V1 regex に任せてよい）。
 */
export function detectInputComplexity(message: string): "simple" | "complex" {
  const msg = message.trim();
  if (!msg) return "simple";

  let signals = 0;
  if (msg.length >= 30) signals++;
  const splitCount = (msg.match(new RegExp(COMPLEXITY_SEGMENT_SPLIT_RE.source, "g")) ?? []).length;
  if (splitCount >= 2) signals++;
  if (COMPLEXITY_PERSON_RE.test(msg)) signals++;
  if (COMPLEXITY_DATE_RE.test(msg)) signals++;
  const timeMatches = msg.match(COMPLEXITY_TIME_RE) ?? [];
  if (timeMatches.length >= 2) signals++;

  // メタ発話は単独でも complex に昇格（V1 は訂正を新タスクとして誤解釈する）
  if (COMPLEXITY_META_RE.test(msg)) return "complex";

  return signals >= 2 ? "complex" : "simple";
}

const SAFE_CLARIFY_COLLECTING_MESSAGE =
  "ごめん、うまく整理できなかった。もう一度ゆっくり教えてくれる？\n・いつ（今日／明日）\n・誰と\n・どこで\n・何を\nこの辺りがわかると組み立てやすい。";

const SAFE_CLARIFY_PLAN_EDIT_MESSAGE =
  "ごめん、いまの変更内容をうまく読み取れなかった。もう一度、どこをどう変えたいか教えてくれる？\n（例: 14時の商談を15時に、Aさんとのランチは取り消し、など）";

/**
 * plan の対象日ラベルを返す。P4 date audit (CEO 2026-04-17):
 * 今日/明日/明後日/その他 を targetDate ベースで判定し、UI 文字列に使う。
 * plan 未定義 or 日付不明なら "今日" を返す（既存挙動維持）。
 *
 * 実装注意: todayJST() と同じ「UTC時刻に +9h オフセットを加えてからISO slice」方式で +1/+2 を計算する。
 * `new Date("YYYY-MM-DDT00:00:00+09:00").toISOString()` は UTC 日付文字列を返すため、
 * 2026-04-17 00:00 JST を 24h 進めても同じ UTC日 (2026-04-17T15:00Z → slice=2026-04-17) になり「明日」が「今日」扱いに落ちる。
 */
const JST_OFFSET_MS_ = 9 * 60 * 60 * 1000;
function planDateLabel(plan: { date?: string } | undefined | null): string {
  if (!plan?.date) return "今日";
  const today = todayJST();
  if (plan.date === today) return "今日";
  // JST ベースで +1 / +2 を計算（todayJST と同じ方式で）
  const nowJstMs = Date.now() + JST_OFFSET_MS_;
  const plus1 = new Date(nowJstMs + 24 * 3600 * 1000).toISOString().slice(0, 10);
  const plus2 = new Date(nowJstMs + 48 * 3600 * 1000).toISOString().slice(0, 10);
  if (plan.date === plus1) return "明日";
  if (plan.date === plus2) return "明後日";
  return plan.date; // それより先は日付そのものを出す（稀）
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 決定論的 clarify-response ハンドラー
// (LLM を呼ばずに missingFields への回答を直接適用)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const TRANSPORT_PATTERNS: [RegExp, TransportMode][] = [
  [/車/, "car"],
  [/電車/, "train"],
  [/バス/, "bus"],
  [/徒歩|歩[いき]/, "walk"],
  [/自転車|チャリ/, "bicycle"],
  [/タクシー/, "taxi"],
  [/バイク|オートバイ/, "motorcycle"],
];

/**
 * missingFields への直接回答を決定論的に検出・適用する。
 * LLM を呼ばずに PlanState を更新できる場合は更新済み state を返す。
 * 適用できない場合は null を返す（LLM delta にフォールバック）。
 */
function tryDirectClarifyResponse(
  message: string,
  state: PlanState,
): { updatedState: PlanState; descriptions: string[] } | null {
  if (state.missingFields.length === 0) return null;

  let updated: PlanState = {
    ...state,
    segments: state.segments.map(s => ({ ...s, companions: [...s.companions] })),
    missingFields: [...state.missingFields],
  };
  const descriptions: string[] = [];

  // ── Departure Time: 「9時」「朝9時から」「10:00」等 ──
  // 「何時頃から動き出す予定？」への回答 → departureTime（出発時刻）として設定
  // ※ segments[0].startTime に入れると「タスク開始」扱いになり、移動がその前に配置されてしまう
  //    departureTime は planningEngine が「最初の travel を exactly この時刻に開始」として使う
  if (updated.missingFields.includes("departureTime")) {
    // "9時" "09:00" "朝9時" "10時半" "9時30分" 等のパターン
    const timeRe = /(?:朝|午前)?(\d{1,2})[時:](\d{0,2})?(?:分|半)?/;
    const match = message.match(timeRe);
    if (match) {
      const h = parseInt(match[1], 10);
      const rawM = match[2];
      const m = /半/.test(message) ? 30 : (rawM ? parseInt(rawM, 10) : 0);
      const timeStr = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      // 出発アンカーとして設定（移動がこの時刻に開始される）
      updated.departureTime = timeStr;
      updated.departureTimeConstraint = { type: "fixed_departure", fixedTime: timeStr };
      updated.missingFields = updated.missingFields.filter(f => f !== "departureTime");
      descriptions.push(`${timeStr}に出発`);
    }
  }

  // ── Transport ──
  if (updated.missingFields.includes("transport")) {
    for (const [re, mode] of TRANSPORT_PATTERNS) {
      if (re.test(message)) {
        updated.transport = mode;
        updated.missingFields = updated.missingFields.filter(f => f !== "transport");
        const labels: Record<string, string> = {
          car: "車", train: "電車", bus: "バス", walk: "徒歩",
          bicycle: "自転車", taxi: "タクシー", motorcycle: "バイク",
        };
        descriptions.push(`移動は${labels[mode] ?? mode}`);
        break;
      }
    }
  }

  // ── Segment time: "商談は14時から" "ミーティングは3時" 等 ──
  const timeFields = updated.missingFields.filter(f => f.startsWith("segmentTime:"));
  if (timeFields.length > 0) {
    const timeRe = /(?:朝|午前|午後)?(\d{1,2})[時:](\d{0,2})?(?:分|半)?/;
    const match = message.match(timeRe);
    if (match) {
      let h = parseInt(match[1], 10);
      const rawM = match[2];
      const m = /半/.test(message) ? 30 : (rawM ? parseInt(rawM, 10) : 0);
      // 午後表記: 「午後3時」→15:00
      if (/午後/.test(message) && h < 12) h += 12;
      const timeStr = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      // 最初の未設定 segmentTime を解決
      const field = timeFields[0];
      const parts = field.split(":");
      const segId = parts[1];
      const actLabel = parts.slice(2).join(":");
      const seg = updated.segments.find(s => s.id === segId);
      if (seg) {
        seg.startTime = timeStr;
        updated.missingFields = updated.missingFields.filter(f => f !== field);
        descriptions.push(`${actLabel}は${timeStr}から`);
      }
    } else if (/未定|まだ|決まってない|わからない/.test(message)) {
      // 未定の場合: missingField を消してスキップ
      for (const field of timeFields) {
        updated.missingFields = updated.missingFields.filter(f => f !== field);
      }
      descriptions.push("時間は追って確認");
    }
  }

  // ── Segment place: "打ち合わせはA社で" 等 ──
  const placeFields = updated.missingFields.filter(f => f.startsWith("segmentPlace:"));
  if (placeFields.length > 0) {
    for (const field of placeFields) {
      const parts = field.split(":");
      const segId = parts[1];
      const actLabel = parts.slice(2).join(":");
      // 表記揺れ対応: "打ち合わせ"→"打ち?合わ?せ" / "ミーティング"→そのまま
      const fuzzyLabel = actLabel
        .replace(/打ち合わせ/, "打ち?合わ?せ")
        .replace(/会議/, "会議")
        .replace(/面談/, "面談");
      // "打ち合わせは〜で" / "打合せは〜で" パターン
      // で(?:[やす]|$) で「カフェで」末尾の「で」をターミネーターとして消費（キャプチャに含めない）
      const placeRe = new RegExp(`${fuzzyLabel}[はの](.+?)(?:で(?:[やす]|$)|にて|$)`);
      const match = message.match(placeRe);
      if (match) {
        const place = match[1].trim().replace(/で$/, ""); // 安全策: 残留「で」も除去
        const seg = updated.segments.find(s => s.id === segId);
        if (seg) {
          seg.place = place;
          seg.placeCanonical = place;
          updated.missingFields = updated.missingFields.filter(f => f !== field);
          descriptions.push(`${actLabel}は${place}で`);
        }
      }
    }
  }

  if (descriptions.length === 0) return null;

  return { updatedState: updated, descriptions };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Morning Protocol 検出
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ── 強い確信: 直接 Morning Protocol に入る ──
//
// P0-3: 「明日」パターンと日常活動（散歩・買い物等）を追加。
// 「明日は、車で公園に行って散歩する」等が Morning Protocol に入らない問題を修正。
const STRONG_TRIGGERS = [
  /今日.*(やる|する|予定|やりたい|したい|計画|プラン)/,
  /明日.*(やる|する|予定|やりたい|したい|計画|プラン)/,
  /やること.*(決|作|考)/,
  /予定.*(決|作|立|組)/,
  /1日.*(計画|プラン|流れ|過ご)/,
  /タスク|to\s*do/i,
  /朝.*(始|スタート)/,
  /今日は.*[、。]/,       // 「今日は〇〇と△△。」のような列挙
  /明日は.*[、。]/,       // 「明日は〇〇と△△。」のような列挙
  /今日.*\d{1,2}時/,     // 「今日14時に歯医者」— 時刻を含むプラン
  /明日.*\d{1,2}時/,     // 「明日14時に歯医者」— 時刻を含むプラン
  /今日は.{2,}と.{2,}/,  // 「今日は資料作りと歯医者」— と区切りの列挙
  /明日は.{2,}と.{2,}/,  // 「明日は資料作りと歯医者」
  /今日は.{6,}/,          // 「今日は資料作りに行く」— 今日は+具体的な内容
  /明日は?.{2,}(で|にて|に).{2,}/, // 「明日マックで仕事する」— 明日+場所+活動
  // ── 行動宣言パターン（「今日は」なしでも活動内容が明確）──
  /外(に|へ)?(行|出|でかけ).{4,}/, // 「外に行くよ。マックでコード修正」— 外出+活動
  /家(に|で)?い[るた].{4,}/,       // 「家にいるよ。掃除と洗濯」— 在宅+活動
  /.+(で|にて).*(修正|勉強|作業|仕事|コード|開発|読書|執筆|作り|散歩|買い物|ランニング|運動|掃除|洗濯|料理)/, // 場所+具体的活動（散歩等の日常活動を追加）
  /\d{1,2}時に.{2,}/,             // 「14時に歯医者」— 今日なしでも時刻+予定
  /.{2,}[とや、].{2,}[とや、].{2,}/, // 「掃除と洗濯、あとはNetflix」— 3つ以上の列挙
  // ── 移動手段 + 場所パターン（「車で公園に行って散歩する」）──
  /(車|電車|バス|自転車|チャリ|タクシー|徒歩)で.{2,}(行|出|向か)/, // 移動手段+行動
  /.+(に|へ)(行って|いって|寄って).{2,}(する|やる)/, // 「公園に行って散歩する」— 訪問+活動
];

// ── Soft Bridge 確認への肯定応答（「今日のプラン立てる？」→「うん」等） ──
const SOFT_BRIDGE_CONFIRM = [
  /^(うん|はい|お願い|やる|やって|いいよ|いいね|そうする|そうしよう|立てて|組んで|yes|ok)/i,
  /^(プラン|予定).*(立て|作|決|組)/,
];

// ── 弱い確信: 確認を挟んでから Morning Protocol ──
/** ファッション/コーデ系キーワード（Morning Protocol 誤発火防止用） */
const FASHION_KEYWORDS = /アウタ|コーデ|服|着る|ファッション|スタイル|コーディネート|トップス|ボトムス|靴|アクセサリ/;
/** P1.8-fix: Web検索・比較判断の明示的要求（PE が処理すべき — Morning Protocol 除外） */
const SEARCH_INTENT_KEYWORDS = /調べ(て|てみて|てきて)|ネットで|WEBで|webで|検索して|探して(きて|みて)|どっち.*(合う|いい|向い)|比較して/;

const SOFT_TRIGGERS = [
  /今日.*(どうし|何す|何や|何し)/,     // 「今日どうしよう」「今日何する」— プラン系のみ
  /明日.*(どうし|何す|何や|何し)/,     // 「明日どうしよう」「明日何する」
  /このあと/,                         // 「このあと」— 行動文脈だが不確定
  /〜しようかな|しようかな/,           // 意図の萌芽
  /買い物|用事|出かけ/,               // 行動ワードだが判断の相談かもしれない
  /外(に|へ)?(行|出)/,               // 「外に行く」だけ（活動なし）→ 確認
  /家(に|で)?い[るた]よ?$/,           // 「家にいるよ」だけ → 確認
  /明日は?[、。]?\s*$/,              // 「明日は」だけ → 確認
];

export type MorningQueryConfidence = "strong" | "soft" | "none";

/**
 * ユーザーのメッセージが Morning Protocol 対象かを3段階で判定する。
 *
 * - "strong": 直接 Morning Protocol に入る
 * - "soft": 「今日のプラン立てる？」と確認を挟む
 * - "none": Morning Protocol 対象外
 *
 * 既にセッションが進行中の場合は常に "strong"。
 */
export function detectMorningIntent(
  message: string,
  existingSession?: MorningSession
): MorningQueryConfidence {
  // セッション進行中なら常にstrong
  if (existingSession && !["completed", "skipped"].includes(existingSession.phase)) {
    return "strong";
  }

  // ファッション/コーデ系の質問は Morning Protocol 対象外
  if (FASHION_KEYWORDS.test(message)) return "none";

  // P1.8-fix: Web検索の明示的要求・比較判断要求は Morning Protocol 対象外
  // 「調べて」「ネットで」「WEBで」「どっちが合う」等は PE が処理すべき
  if (SEARCH_INTENT_KEYWORDS.test(message)) return "none";

  if (STRONG_TRIGGERS.some((pattern) => pattern.test(message))) return "strong";
  if (SOFT_TRIGGERS.some((pattern) => pattern.test(message))) return "soft";
  return "none";
}

/**
 * 後方互換: boolean を返す旧API（strong or soft のいずれかでtrue）
 */
export function isMorningProtocolQuery(
  message: string,
  existingSession?: MorningSession
): boolean {
  return detectMorningIntent(message, existingSession) !== "none";
}

/**
 * Soft Bridge 確認メッセージを返す。
 */
export function buildSoftBridgeMessage(): string {
  const variants = [
    "今日のプラン、一緒に立てる？",
    "このまま今日の流れも組んでみる？",
    "予定の整理までやる？",
  ];
  return variants[Math.floor(Math.random() * variants.length)];
}

/**
 * Soft Bridge 確認への肯定応答を検出する。
 */
export function isSoftBridgeConfirm(message: string): boolean {
  return SOFT_BRIDGE_CONFIRM.some((p) => p.test(message.trim()));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// セッション管理
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function createSession(): MorningSession {
  return {
    sessionId: `ms_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    phase: "greeting",
    rawInputs: [],
    personalizeHints: [],
    startedAt: new Date().toISOString(),
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// メイン処理
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Morning Protocolのメインエントリーポイント。
 * セッションの現在フェーズに応じて処理を分岐する。
 */
export async function processMorningMessage(
  message: string,
  session: MorningSession
): Promise<{ session: MorningSession; response: MorningProtocolResponse }> {
  session.rawInputs.push(message);

  let result: { session: MorningSession; response: MorningProtocolResponse };

  switch (session.phase) {
    case "greeting":
      result = await handleGreetingPhase(message, session);
      break;

    case "collecting":
      result = await handleCollectingPhase(message, session);
      break;

    case "clarifying":
      result = await handleClarifyingPhase(message, session);
      break;

    case "plan_presented":
      result = await handlePlanPresentedPhase(message, session);
      break;

    case "plan_confirmed":
      result = handlePlanConfirmedPhase(message, session);
      break;

    case "outfit_offered":
      result = handleOutfitOfferedPhase(message, session);
      break;

    case "outfit_clarifying":
      result = handleOutfitClarifyingPhase(message, session);
      break;

    default:
      // 完了済みのセッション → 通常フローへ
      result = {
        session: { ...session, phase: "completed" },
        response: {
          phase: "completed",
          message: "",
        },
      };
  }

  // ── プロアクティブ提案: plan_presented 初回のみ注入 ──
  if (
    result.response.phase === "plan_presented" &&
    result.response.plan &&
    session.personalityContext
  ) {
    const suggestion = generateProactiveSuggestion(
      result.response.plan,
      session.personalityContext,
    );
    if (suggestion) {
      result.session.personalizeHints.push(suggestion);
      if (!result.response.personalizeHints) {
        result.response.personalizeHints = [];
      }
      result.response.personalizeHints.push(suggestion);
    }
  }

  return result;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// フェーズ別ハンドラー
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function handleGreetingPhase(
  message: string,
  session: MorningSession
): Promise<{ session: MorningSession; response: MorningProtocolResponse }> {
  // ユーザーの最初の入力を処理
  // メッセージ自体にタスク情報が含まれている場合はそのまま処理
  const hasContent = message.length > 10 || /[、。\n]/.test(message);

  if (hasContent) {
    // 直接collecting → intent parse & sufficiency checkへ
    return handleCollectingPhase(message, session);
  }

  // 短い挨拶の場合は collecting フェーズへ
  return {
    session: { ...session, phase: "collecting" },
    response: {
      phase: "collecting",
      message: "おはよう。今日はどんな1日にする？\nやりたいこと、決まってる予定、なんでも教えて",
    },
  };
}

async function handleCollectingPhase(
  message: string,
  session: MorningSession
): Promise<{ session: MorningSession; response: MorningProtocolResponse }> {
  // ── v2: LLM ベースの構造化抽出を試行 ──
  const v2Ready = await ensureV2Modules();
  const planState = v2Ready ? await _extractPlanFromText!(message).catch(() => null) : null;

  if (planState && planState.segments.length > 0) {
    return handleCollectingPhaseV2(planState, message, session);
  }

  // P1 fail-closed (CEO 2026-04-17):
  // 両 LLM が空/失敗 + 入力が複雑 → V1 regex に落とすと state を壊す
  // （メタ訂正・人名・日付混在を新タスクに化けさせる）。safe clarify で止める。
  if (!planState && detectInputComplexity(message) === "complex") {
    return {
      session, // state 不変
      response: {
        phase: "collecting",
        message: SAFE_CLARIFY_COLLECTING_MESSAGE,
      },
    };
  }

  // ── v1 フォールバック: regex パーサー（シンプル入力のみ最終防衛線） ──
  const intent = parseIntent(message);

  // 既存のインテントとマージ
  const mergedIntent = mergeIntents(session.parsedIntent, intent);

  // 旧パーサーも補助的に実行（語彙テーブルに未登録のものを拾う）
  const { items: legacyItems, personalizeHints } = parseUserInput(message);
  session.personalizeHints.push(...personalizeHints);

  // Intent → PlanItems 変換
  const intentItems = intentToPlanItems(mergedIntent);

  // 新パーサーが有効な結果を出した場合は旧パーサーの結果を混ぜない
  // （旧パーサーは生テキスト分割のため「外に行くよ」等がタスク化してしまう）
  let allItems: PlanItem[];
  if (intentItems.length > 0) {
    allItems = intentItems;
  } else {
    allItems = legacyItems;
  }

  // テキストベースの基礎充足判定
  const rawSufficiency = checkSufficiency(message, allItems);

  if (rawSufficiency.level === "no_plan" && mergedIntent.primaryTasks.length === 0 && mergedIntent.fixedEvents.length === 0) {
    return {
      session: { ...session, phase: "skipped" },
      response: { phase: "skipped", message: "" },
    };
  }

  // 条件を抽出
  const dayConditions = extractDayConditions(session.rawInputs.join(" "));

  // ── Plan Intake Gate ──
  //
  // 3段構成:
  //   1. Plan Intake Gate（ここ） — 5W1H 充足判定
  //      What → primaryTasks（パーサーが抽出済み）
  //      When → fixedEvents.startTime / startWindow（パーサーが抽出済み）
  //      Where → mainLocation / locationSequence（パーサーが抽出済み）
  //      How → transport（移動手段 — 外出時は移動時間計算に必須）
  //      Who → withWhom（社会的活動時は必須 — 「Aさんとミーティング」等）
  //      Why → flowContext から暗黙的に取得
  //      venue → placeTable から自動推定（質問しない）
  //      mood → プラン成立の必須ではない → Outfit Gate で扱う
  //
  //   2. Tour Builder（buildDayPlan + insertTravelItems）
  //      Intake 完了後にツアー構造へ展開
  //
  //   3. Outfit Gate（checkOutfitSufficiency）
  //      プラン確定後、コーデ提案前に mood 等を聞く

  const intake = checkPlanIntakeSufficiency(
    rawSufficiency,
    mergedIntent,
    allItems,
    dayConditions,
    session.rawInputs.join(" "),
    session.userPrefecture,
  );

  // venue 自動推定結果を DayConditions に反映
  if (intake.autoInferred.venue && !dayConditions.venue) {
    dayConditions.venue = intake.autoInferred.venue as DayConditions["venue"];
  }
  // intent の transport → DayConditions に引き継ぎ（未設定の場合）
  if (mergedIntent.flowContext.transport && !dayConditions.mainTransport) {
    dayConditions.mainTransport = mergedIntent.flowContext.transport;
  }
  // Phase D rollback (CEO 2026-04-17):
  // 都市圏=電車などの transport 自動推論は日本の実態（電車/バス/車/自転車混在）に合わず、
  // 誤ったプランを量産するため撤回。transport は clarify 対象に戻し、
  // ユーザーに素直に聞く。将来、移動傾向ログが蓄積されたら user-pattern に基づく
  // 推論を再導入する。（TODO: re-enable via user movement history）
  //
  // 以前の実装:
  //   if (intake.autoInferredMap.transport && !dayConditions.mainTransport) {
  //     dayConditions.mainTransport = intake.autoInferredMap.transport.value;
  //   }

  // ── Step 2: Plan Intake Gate の結果で分岐 ──

  // CEO 方針 2026-04-17: partial + clarify 必須項目あり → insufficient 扱いで聞く
  // （Phase D rollback に伴う処理。transport 等が planMissing に入った場合に反応する）
  if (intake.level === "partial" && intake.missingFields.length > 0) {
    const plan: MorningPlan = {
      date: mergedIntent.targetDate ?? todayJST(),
      items: allItems,
      dayConditions: dayConditions as DayConditions,
      createdAt: new Date().toISOString(),
      confirmed: false,
      mainLocation: mergedIntent.mainLocation,
      flowContext: mergedIntent.flowContext,
      parsedIntent: mergedIntent,
    };
    const clarifyQuestion = buildPlanClarifyQuestion(intake.missingFields);
    const confirmMsg = buildIntentConfirmMessage(mergedIntent);
    return {
      session: {
        ...session,
        phase: "clarifying",
        plan,
        parsedIntent: mergedIntent,
        sufficiency: { ...rawSufficiency, level: "insufficient", missingFields: intake.missingFields },
      },
      response: {
        phase: "clarifying",
        message: `${confirmMsg}\n\n${clarifyQuestion}`,
        clarifyQuestion,
        plan,
      },
    };
  }

  if (intake.level === "sufficient" || intake.level === "partial") {
    // ── 場所 clarify: 暗黙補完 + 質問候補の抽出 ──
    const { updatedItems: locFilledItems, pendingClarify } = applyImplicitLocationFill(allItems);

    // 5W1H の必須項目が揃っている → Tour Builder → プラン提示
    const plan = buildDayPlan(locFilledItems, dayConditions as DayConditions, undefined, {
      goOut: intake.goingOut,
      endpointAnchor: mergedIntent.endpointAnchor,
      returnDestination: mergedIntent.returnDestination,
      targetDate: mergedIntent.targetDate,
    });
    plan.mainLocation = mergedIntent.mainLocation;
    plan.flowContext = mergedIntent.flowContext;
    plan.parsedIntent = mergedIntent;
    // Phase D: 推論で補完された項目を記録
    if (Object.keys(intake.autoInferredMap).length > 0) {
      plan.autoInferred = intake.autoInferredMap;
    }

    // 場所の clarify が必要なアイテムがある → clarify フェーズに回す
    if (pendingClarify.length > 0) {
      const locQuestion = buildLocationClarifyQuestion(pendingClarify);
      const confirmMsg = buildIntentConfirmMessage(mergedIntent);
      return {
        session: {
          ...session,
          phase: "clarifying",
          plan,
          parsedIntent: mergedIntent,
          sufficiency: { ...rawSufficiency, level: "insufficient", missingFields: [...intake.missingFields, "location_area"] },
        },
        response: {
          phase: "clarifying",
          message: `${confirmMsg}\n\n${locQuestion}`,
          clarifyQuestion: locQuestion ?? undefined,
          plan,
        },
      };
    }

    const confirmMsg = buildIntentConfirmMessage(mergedIntent);

    return {
      session: {
        ...session,
        phase: "plan_presented",
        plan,
        parsedIntent: mergedIntent,
        sufficiency: { ...rawSufficiency, level: intake.level, missingFields: intake.missingFields },
      },
      response: {
        phase: "plan_presented",
        message: confirmMsg,
        plan,
        personalizeHints: session.personalizeHints,
      },
    };
  }

  if (intake.level === "insufficient" && intake.missingFields.length > 0) {
    // プラン成立に必要な情報が不足 → 不足分を 1 問に束ねて聞く
    const plan: MorningPlan = {
      date: mergedIntent.targetDate ?? todayJST(),
      items: allItems,
      dayConditions: dayConditions as DayConditions,
      createdAt: new Date().toISOString(),
      confirmed: false,
      mainLocation: mergedIntent.mainLocation,
      flowContext: mergedIntent.flowContext,
      parsedIntent: mergedIntent,
    };

    const clarifyQuestion = buildPlanClarifyQuestion(intake.missingFields);
    const confirmMsg = buildIntentConfirmMessage(mergedIntent);

    return {
      session: {
        ...session,
        phase: "clarifying",
        plan,
        parsedIntent: mergedIntent,
        sufficiency: { ...rawSufficiency, level: intake.level, missingFields: intake.missingFields },
      },
      response: {
        phase: "clarifying",
        message: `${confirmMsg}\n\n${clarifyQuestion}`,
        clarifyQuestion,
        plan,
      },
    };
  }

  // アイテムなし → 収集を続ける
  return {
    session: { ...session, phase: "collecting", parsedIntent: mergedIntent },
    response: {
      phase: "collecting",
      message: "今日はどんなことする予定？\nやりたいこと、決まってる予定、なんでも教えて",
    },
  };
}

/** v2 パイプライン: LLM抽出成功時の collecting 処理 */
async function handleCollectingPhaseV2(
  planState: PlanState,
  message: string,
  session: MorningSession,
): Promise<{ session: MorningSession; response: MorningProtocolResponse }> {
  const dayConditions = extractDayConditions(session.rawInputs.join(" "));

  if (planState.transport && !dayConditions.mainTransport) {
    dayConditions.mainTransport = planState.transport;
  }

  // ── 場所解決: anchorScore 順にWeb検索 → confidence判定 ──
  // exact_proper_noun のセグメントについて場所解決を試行。
  // fail-open: 解決失敗時はプラン生成を止めない
  let updatedPlanState = planState;
  let pendingPlaceConfirmations: NonNullable<MorningSession["pendingPlaceConfirmations"]> = [];

  const RESOLVABLE_TYPES = new Set(["exact_proper_noun", "chain_brand", "generic_place"]);
  const hasResolvablePlace = planState.segments.some(
    s => s.placeType && RESOLVABLE_TYPES.has(s.placeType) && s.place && !s.resolvedPlaceName,
  );

  if (hasResolvablePlace && _resolveAnchors) {
    try {
      const { resolved, needsConfirmation } = await _resolveAnchors(
        planState.segments,
        session.userArea,
        session.userId,
      );
      updatedPlanState = { ...planState, segments: resolved };

      // confidence に応じた確認リスト構築
      for (const { segmentId, resolution } of needsConfirmation) {
        // CEO方針 2026-04-17 P1-A: 同一施設の重複候補を除去
        // （Places API が同じ店舗を異なる placeId で返すケース対策）
        // 優先順位: placeId → 正規化 address → 正規化 name
        const seen = new Set<string>();
        const dedupedCandidates: Array<{ name: string; address?: string }> = [];
        for (const c of resolution.candidates) {
          const key =
            c.placeId ??
            (c.address ? c.address.replace(/\s+/g, "") : null) ??
            c.name.replace(/\s+/g, "");
          if (seen.has(key)) continue;
          seen.add(key);
          dedupedCandidates.push({ name: c.name, address: c.address });
          if (dedupedCandidates.length >= 3) break;
        }

        pendingPlaceConfirmations.push({
          segmentId,
          originalText: resolution.originalText,
          resolvedName: resolution.bestCandidate?.name,
          confidence: resolution.confidence as "medium" | "low",
          candidates: dedupedCandidates,
        });
      }
    } catch (e) {
      // fail-open: 場所解決が失敗してもプラン生成は続行
      console.warn("[morning-protocol] resolveAnchors failed (fail-open):", e);
    }
  }

  // ── Block 2-(c) find_near_anchor intent（CEO方針 2026-04-17）──
  // 「サドヤ近くのカフェないかな？」のような疑問形で placeSearchHint が設定されたセグメントを
  // anchor 座標周辺で Places API 検索し、候補を pendingPlaceConfirmations に積む。
  // 同じ UI フロー（「〜でどう？」）に合流するので既存ロジックは無改修。
  //
  // GPT追加ルール 2026-04-17:
  //   - anchor 自体が曖昧（high 未満）なら near search を走らせない → placeResolver 側で実装
  //   - 候補 dedupe（placeId → address → name）→ placeResolver 側で実装
  //   - radius はカテゴリ別定数 → placeResolver 側で実装
  //   - 候補 0 件時は nearAnchorContext を pendingPlaceConfirmations に載せ、
  //     UI 側で「範囲を広げる／別カテゴリ」の dedicated clarify を出せるようにする
  //
  // fail-open: 失敗時はスキップしてプラン生成を続行
  const hasSearchHint = updatedPlanState.segments.some(
    s => s.placeSearchHint && s.placeSearchHint.searchCategory && !s.resolvedPlaceName,
  );
  if (hasSearchHint && _resolveNearAnchorPlaces) {
    try {
      const { resolved: nearResolved, needsConfirmation: nearNeeds } =
        await _resolveNearAnchorPlaces(
          updatedPlanState.segments,
          session.userArea,
          session.userId,
        );
      updatedPlanState = { ...updatedPlanState, segments: nearResolved };

      for (const { segmentId, resolution } of nearNeeds) {
        // 重複除去は placeResolver 側で実施済みだが、pendingPlaceConfirmations の
        // schema が { name, address } 限定なので最終的な整形のみ行う（top 3）。
        const trimmedCandidates: Array<{ name: string; address?: string }> = [];
        for (const c of resolution.candidates) {
          trimmedCandidates.push({ name: c.name, address: c.address });
          if (trimmedCandidates.length >= 3) break;
        }

        // GPT rule 4: 候補 0 件時は nearAnchorContext を乗せる
        // reason が "near_anchor_zero:<category>@<anchor>:radius=<m>" の場合に復元
        let nearAnchorContext:
          | { anchorLabel: string; searchCategory: string; radiusM: number }
          | undefined;
        if (resolution.candidates.length === 0 && resolution.reason?.startsWith("near_anchor_zero:")) {
          // 形式: near_anchor_zero:<category>@<anchor>:radius=<meters>
          const body = resolution.reason.slice("near_anchor_zero:".length);
          const radiusMatch = body.match(/:radius=(\d+)$/);
          const radiusM = radiusMatch ? Number(radiusMatch[1]) : 1500;
          const stripped = radiusMatch ? body.slice(0, -radiusMatch[0].length) : body;
          const atIdx = stripped.lastIndexOf("@");
          if (atIdx > 0) {
            nearAnchorContext = {
              searchCategory: stripped.slice(0, atIdx),
              anchorLabel: stripped.slice(atIdx + 1),
              radiusM,
            };
          }
        }

        pendingPlaceConfirmations.push({
          segmentId,
          originalText: resolution.originalText,
          resolvedName: resolution.bestCandidate?.name,
          confidence: resolution.confidence as "medium" | "low",
          candidates: trimmedCandidates,
          ...(nearAnchorContext ? { nearAnchorContext } : {}),
        });
      }
    } catch (e) {
      console.warn("[morning-protocol] resolveNearAnchorPlaces failed (fail-open):", e);
    }
  }

  // ── W2-3 (2026-04-19): Recommendation Intent 解決経路 ──
  //   generic_place と独立。ユーザーが「おすすめある？」「どこかいい店ない？」のように
  //   *自分で決める意思がない* 場合、ここで anchor近傍 + category (+ 将来 Stargazer 軸)
  //   で候補を探し、pendingPlaceConfirmations に proposal として積む。
  //
  //   placeSearchHint 経路との違い:
  //     - placeSearchHint: anchor + category が明示 → clarify 系（「〇〇でどう？」）
  //     - recommendationIntent: anchor/category 弱 → proposal 系（候補提示前提）
  //
  //   W2-3 時点では detection（LLM 抽出 or pre-classifier）は未実装なので、
  //   recommendationIntent が立つのは将来 W2-4 で導入されたときのみ。
  //   ここは W2-4 完了後に自動で起動する受け皿を先行で置く。
  const hasRecommendationIntent = updatedPlanState.segments.some(
    s => s.recommendationIntent && !s.resolvedPlaceName,
  );
  if (hasRecommendationIntent && _resolveRecommendationIntent) {
    for (let i = 0; i < updatedPlanState.segments.length; i++) {
      const seg = updatedPlanState.segments[i];
      if (!seg.recommendationIntent || seg.resolvedPlaceName) continue;
      try {
        const resolution = await _resolveRecommendationIntent(
          seg.recommendationIntent,
          updatedPlanState.segments,
          {
            // W2-5 Deep Context Injection で currentLocation / areaCoords を受け取るように
            // 拡張する。W2-3 時点では undefined 許容（category_only にフォールバック）。
            areaCoords: null,
            areaLabel: session.userArea,
            currentLocation: null,
          },
          seg.activity,
        );
        if (resolution.bestCandidate) {
          updatedPlanState.segments[i] = {
            ...seg,
            resolutionConfidence: resolution.confidence,
            resolvedPlaceName: resolution.bestCandidate.name,
            resolvedAddress: resolution.bestCandidate.address,
            resolvedPlaceId: resolution.bestCandidate.placeId,
            resolvedLat: resolution.bestCandidate.lat,
            resolvedLng: resolution.bestCandidate.lng,
          };
        }
        const trimmedCandidates: Array<{ name: string; address?: string }> = [];
        for (const c of resolution.candidates) {
          trimmedCandidates.push({ name: c.name, address: c.address });
          if (trimmedCandidates.length >= 3) break;
        }
        pendingPlaceConfirmations.push({
          segmentId: seg.id,
          originalText: seg.recommendationIntent.originalQuery,
          resolvedName: resolution.bestCandidate?.name,
          confidence: resolution.confidence as "medium" | "low",
          candidates: trimmedCandidates,
        });
      } catch (e) {
        console.warn("[morning-protocol] resolveRecommendationIntent failed (fail-open):", e);
      }
    }
  }

  const allItems = _planStateToPlanItems!(updatedPlanState);

  if (allItems.length === 0) {
    return {
      session: { ...session, phase: "collecting", planStateV2: updatedPlanState },
      response: {
        phase: "collecting",
        message: "今日はどんなことする予定？\nやりたいこと、決まってる予定、なんでも教えて",
      },
    };
  }

  // ── Phase D rollback (CEO 2026-04-17): transport 推論（v2 パス）──
  // 都市圏=電車 / それ以外=車 の推論は日本の実態に合わず、誤プランを量産する。
  // transport は以下のロジックで clarify 対象に戻す:
  //   - 外出セグメントあり + transport 未指定 → missingFields に "transport" を積む
  //   - 下流の NON_BLOCKING_FIELDS から "transport" を外し、hard blocker 扱い
  const v2AutoInferred: import("./types").AutoInferredMap = {};
  if (!updatedPlanState.transport && !dayConditions.mainTransport) {
    const hasOutdoorSegment = updatedPlanState.segments.some(s => s.place);
    if (hasOutdoorSegment && !updatedPlanState.missingFields.includes("transport")) {
      updatedPlanState = {
        ...updatedPlanState,
        missingFields: [...updatedPlanState.missingFields, "transport"],
      };
    }
  }
  // 参考（復活時に使う旧推論コード）:
  //   都市圏: train (medium) / それ以外: car (low)

  // ── Phase D: venue 推論（v2 パス）──
  if (!dayConditions.venue) {
    // セグメントのカテゴリから推定
    let venueInferred = false;
    for (const seg of updatedPlanState.segments) {
      if (seg.placeCategory) {
        const v = inferVenueFromCategory(seg.placeCategory);
        if (v) {
          dayConditions.venue = v as DayConditions["venue"];
          v2AutoInferred.venue = {
            value: v as import("@/app/(culcept)/calendar/_lib/vcTypes").VenueType,
            confidence: "high",
            reason: `${seg.place ?? seg.placeCategory} → ${v}`,
          };
          venueInferred = true;
          break;
        }
      }
    }
    if (!venueInferred) {
      const goOut = updatedPlanState.goOut ?? updatedPlanState.segments.some(s => s.place);
      dayConditions.venue = (goOut ? "mixed" : "indoor") as DayConditions["venue"];
      v2AutoInferred.venue = {
        value: dayConditions.venue as import("@/app/(culcept)/calendar/_lib/vcTypes").VenueType,
        confidence: goOut ? "medium" : "high",
        reason: goOut ? "外出予定 → 室内外混在で計算" : "在宅予定 → 室内",
      };
    }
  }

  // ── 場所確認が必要な場合は missingFields に追加 ──
  if (pendingPlaceConfirmations.length > 0) {
    // medium → "placeConfirm:seg_1:サドヤ" 形式で missingField に追加
    // low → "placeAsk:seg_1:サドヤ" 形式で missingField に追加
    for (const pc of pendingPlaceConfirmations) {
      const prefix = pc.confidence === "medium" ? "placeConfirm" : "placeAsk";
      updatedPlanState = {
        ...updatedPlanState,
        missingFields: [
          ...updatedPlanState.missingFields,
          `${prefix}:${pc.segmentId}:${pc.originalText}`,
        ],
      };
    }
  }

  // ── Phase D rollback (CEO 2026-04-17): missingFields の hard blocker 判定 ──
  // transport は clarify 対象に戻したため NON_BLOCKING から外す（hard blocker 化）。
  // venue / mood / withWhom は引き続き non-blocking（venue は依然 auto-infer される）。
  const NON_BLOCKING_FIELDS = new Set(["venue", "mood", "withWhom"]);
  const hardBlockerFields = updatedPlanState.missingFields.filter(
    f => !NON_BLOCKING_FIELDS.has(f),
  );

  // hard blocker がある場合のみ clarify
  if (hardBlockerFields.length > 0) {
    const confirmMsg = _buildPlanConfirmMessage!(updatedPlanState);
    // CEO方針 2026-04-17 Block 1: 時間系 clarify が残っているなら placeQuestions は
    // 後回し（1 ターン 1 質問）。時間質問が無いときだけ placeConfirm を聞く。
    const hasHigherPriorityClarify = hardBlockerFields.some(f =>
      f === "departureTime" ||
      f === "transport" ||
      f.startsWith("segmentTime:") ||
      f.startsWith("segmentPlace:"),
    );
    const placeQuestions = hasHigherPriorityClarify
      ? ""
      : buildPlaceConfirmQuestions(pendingPlaceConfirmations);
    const plan: MorningPlan = {
      date: updatedPlanState.targetDate,
      items: allItems,
      dayConditions: dayConditions as DayConditions,
      createdAt: new Date().toISOString(),
      confirmed: false,
      autoInferred: Object.keys(v2AutoInferred).length > 0 ? v2AutoInferred : undefined,
    };

    return {
      session: {
        ...session,
        phase: "clarifying",
        plan,
        planStateV2: updatedPlanState,
        pendingPlaceConfirmations: pendingPlaceConfirmations.length > 0
          ? pendingPlaceConfirmations
          : undefined,
      },
      response: {
        phase: "clarifying",
        message: placeQuestions
          ? `${confirmMsg}\n${placeQuestions}`
          : confirmMsg,
        plan,
      },
    };
  }

  // 場所 clarify
  const { updatedItems: locFilledItems, pendingClarify } = applyImplicitLocationFill(allItems);

  const plan = await buildV2DayPlanAsync(locFilledItems, dayConditions as DayConditions, updatedPlanState, session);
  // Phase D: 推論で補完された項目を記録
  if (Object.keys(v2AutoInferred).length > 0) {
    plan.autoInferred = v2AutoInferred;
  }

  if (pendingClarify.length > 0) {
    const locQuestion = buildLocationClarifyQuestion(pendingClarify);
    const confirmMsg = _buildPlanConfirmMessage!(updatedPlanState);
    return {
      session: {
        ...session,
        phase: "clarifying",
        plan,
        planStateV2: updatedPlanState,
      },
      response: {
        phase: "clarifying",
        message: `${confirmMsg}\n\n${locQuestion}`,
        clarifyQuestion: locQuestion ?? undefined,
        plan,
      },
    };
  }

  const confirmMsg = _buildPlanConfirmMessage!(updatedPlanState);

  return {
    session: {
      ...session,
      phase: "plan_presented",
      plan,
      planStateV2: updatedPlanState,
    },
    response: {
      phase: "plan_presented",
      message: confirmMsg,
      plan,
      personalizeHints: session.personalizeHints,
    },
  };
}

async function handleClarifyingPhase(
  message: string,
  session: MorningSession
): Promise<{ session: MorningSession; response: MorningProtocolResponse }> {
  // ── v2: PlanState がある場合 ──
  if (session.planStateV2 && await ensureV2Modules()) {
    // Step 0: 場所確認への回答を処理（LLM 不要、決定論的）
    if (session.pendingPlaceConfirmations && session.pendingPlaceConfirmations.length > 0) {
      const placeResult = tryDirectPlaceConfirmResponse(
        message,
        session.planStateV2,
        session.pendingPlaceConfirmations,
      );
      if (placeResult) {
        // 解決済みの確認を除去
        const remainingConfirmations = session.pendingPlaceConfirmations.filter(
          pc => !placeResult.resolvedConfirmations.includes(pc.segmentId),
        );
        const updatedSession = {
          ...session,
          pendingPlaceConfirmations: remainingConfirmations.length > 0
            ? remainingConfirmations
            : undefined,
        };
        return await buildClarifyV2Response(
          placeResult.updatedState,
          placeResult.descriptions,
          updatedSession,
          message,
        );
      }
    }

    // Step 1: 決定論的に clarify 回答を適用（LLM 不要）
    const directResult = tryDirectClarifyResponse(message, session.planStateV2);
    if (directResult) {
      return await buildClarifyV2Response(directResult.updatedState, directResult.descriptions, session, message);
    }

    // Step 2: LLM delta 検出（P2 fail-safe: LLM 障害時は state 不変で返す）
    let delta: Awaited<ReturnType<NonNullable<typeof _detectDelta>>> | null = null;
    let llmFailed = false;
    try {
      delta = await _detectDelta!(message, session.planStateV2);
    } catch (e) {
      console.error("[morning-protocol] clarify delta detection failed:", e);
      llmFailed = true;
    }

    if (llmFailed) {
      return {
        session,
        response: {
          phase: "clarifying",
          message: "ごめんね、今ちょっと処理がうまくいかなかった。もう一度言ってもらえる？",
          plan: session.plan,
        },
      };
    }

    if (delta && delta.changes.length > 0) {
      try {
        const updatedState = _applyDelta!(session.planStateV2, delta);
        delta.confirmSummary = _buildDeltaConfirmMessage!(updatedState, delta).replace(/^了解。/, "");
        const confirmMsg = _buildDeltaConfirmMessage!(updatedState, delta);

        // GPT指摘: delta 後に stale な pendingPlaceConfirmations をクリーンアップ
        const cleanedSession = {
          ...session,
          pendingPlaceConfirmations: cleanupPendingPlaceConfirmations(session, updatedState, delta),
        };

        return await buildClarifyV2Response(updatedState, null, cleanedSession, message, confirmMsg);
      } catch (e) {
        console.error("[morning-protocol] clarify delta apply failed:", e);
        return {
          session,
          response: {
            phase: "clarifying",
            message: "プランの更新中にエラーが出たよ。もう一度言ってくれる？",
            plan: session.plan,
          },
        };
      }
    }

    // Step 3: LLM も失敗 → v2 state をそのまま使い「わかった」で返す（v1 フォールバック禁止）
    const allItems = _planStateToPlanItems!(session.planStateV2);
    const dayConditions = buildV2DayConditions(session, message);
    const plan = await buildV2DayPlanAsync(allItems, dayConditions, session.planStateV2, session);

    // W2-1 2026-04-19: anchor-first 配置の結果 cannotFitWindow が立ったセグメントに
    //   placementStatus="window_overflow" を伝播してから Safety Gate を評価する。
    const planStateAfterPlacement = applyPlacementStatusFromPlan(session.planStateV2, plan);

    // CEO方針 2026-04-18 Week 1 Step 6a: Plan Readiness Gate
    //   missingFields が空でも、未解決 place / low confidence が残っていたら
    //   plan_presented に進ませず、率直な sharp clarify に戻す。
    const hasMissing = planStateAfterPlacement.missingFields.length > 0;
    const gate = evaluatePlanReadiness(planStateAfterPlacement);
    const nextPhase: MorningPhase = (!hasMissing && gate.ready) ? "plan_presented" : "clarifying";
    let nextMessage: string;
    if (hasMissing) {
      // 既存 missingFields 由来 clarify
      nextMessage = _buildPlanConfirmMessage!(planStateAfterPlacement);
    } else if (gate.ready) {
      nextMessage = _buildPlanConfirmMessage!(planStateAfterPlacement);
    } else {
      console.log("[plan-readiness-gate] blocked:", gate.diagnostic);
      nextMessage = gate.clarifyMessage;
    }

    return {
      session: {
        ...session,
        phase: nextPhase,
        plan,
        planStateV2: planStateAfterPlacement,
      },
      response: {
        phase: nextPhase,
        message: nextMessage,
        plan,
        personalizeHints: session.personalizeHints,
      },
    };
  }

  // ── v1 フォールバック（planStateV2 が無いセッション向け） ──
  const newConditions = extractDayConditions(message);
  const existingConditions = session.plan?.dayConditions ?? {};
  const mergedConditions: DayConditions = {
    ...existingConditions,
    ...newConditions,
  };

  const newIntent = parseIntent(message);
  const mergedIntent = mergeIntents(session.parsedIntent, newIntent);

  const { items: additionalItems, personalizeHints } = parseUserInput(message);
  const intentItems = intentToPlanItems(mergedIntent);
  session.personalizeHints.push(...personalizeHints);

  let finalItems: PlanItem[];
  if (intentItems.length > 0) {
    finalItems = intentItems;
  } else if (additionalItems.length > 0) {
    const existingTexts = new Set((session.plan?.items ?? []).map(i => i.text));
    const extraItems = additionalItems.filter(i => !existingTexts.has(i.text));
    finalItems = [...(session.plan?.items ?? []), ...extraItems];
  } else {
    finalItems = session.plan?.items ?? [];
  }

  const goingOutClarify =
    mergedIntent.flowContext.goOut === true ||
    (mergedIntent.locationSequence ?? []).some(ls => ls.category !== "home") ||
    (mergedIntent.mainLocation != null && mergedIntent.mainLocation.category !== "home");
  const plan = buildDayPlan(finalItems, mergedConditions, undefined, {
    goOut: goingOutClarify,
    endpointAnchor: mergedIntent.endpointAnchor,
    returnDestination: mergedIntent.returnDestination,
    targetDate: mergedIntent.targetDate,
  });
  plan.mainLocation = mergedIntent.mainLocation ?? session.plan?.mainLocation;
  plan.flowContext = mergedIntent.flowContext;
  plan.parsedIntent = mergedIntent;

  const confirmMsg = buildIntentConfirmMessage(mergedIntent);

  return {
    session: {
      ...session,
      phase: "plan_presented",
      plan,
      parsedIntent: mergedIntent,
    },
    response: {
      phase: "plan_presented",
      message: confirmMsg || "こんな感じで組んでみたよ。長さ変えたいものある？",
      plan,
      personalizeHints: session.personalizeHints,
    },
  };
}

/** v2 clarify 回答後の共通レスポンス生成（test export） */
export async function buildClarifyV2Response(
  updatedState: PlanState,
  descriptions: string[] | null,
  session: MorningSession,
  message: string,
  overrideMessage?: string,
): Promise<{ session: MorningSession; response: MorningProtocolResponse }> {
  const allItems = _planStateToPlanItems!(updatedState);
  const dayConditions = buildV2DayConditions(session, message);

  if (updatedState.transport && !dayConditions.mainTransport) {
    dayConditions.mainTransport = updatedState.transport;
  }

  const plan = await buildV2DayPlanAsync(allItems, dayConditions, updatedState, session);

  const confirmMsg = overrideMessage ??
    (descriptions
      ? `了解。${descriptions.join("、")}${descriptions[descriptions.length - 1].endsWith("で") ? "" : "で"}更新したよ。`
      : _buildPlanConfirmMessage!(updatedState));

  if (updatedState.missingFields.length > 0) {
    // sortable missings (time/transport/place) と placeConfirm を分離。
    // - sortable あり → 時間/移動/場所の 1 問を優先（既存ロジック）
    // - sortable 0 かつ placeConfirm あり → 候補確認（例「サドヤでどう？」）
    // - sortable 0 かつ placeConfirm も無い → plan_presented へ遷移
    //
    // CEO方針 2026-04-17 Block 1 fix: 以前は sortable が全て placeConfirm に
    // フィルタされる状態だと buildClarifyFromMissing が "" を返し、strippedRemain
    // が空になって messageBody がブランクで返答される事故が起きていた（実機: 「車」
    // 回答後にアルターがブランクを返し「明日、やったか聞くね」で終了する）。
    const sortableCount = updatedState.missingFields.filter(f =>
      !f.startsWith("placeConfirm:") && !f.startsWith("placeAsk:"),
    ).length;

    if (sortableCount === 0) {
      const pendingConfirms = session.pendingPlaceConfirmations ?? [];
      if (pendingConfirms.length > 0) {
        // placeConfirm のみ残存 → 候補確認を出す（clarifying 継続）
        const placeQ = buildPlaceConfirmQuestions(pendingConfirms);
        const messageBody = overrideMessage
          ? `${confirmMsg}${placeQ ? `\n${placeQ}` : ""}`.trim()
          : (placeQ || "こんな感じでどう？");
        return {
          session: {
            ...session,
            phase: "clarifying",
            plan,
            planStateV2: updatedState,
          },
          response: {
            phase: "clarifying",
            message: messageBody,
            plan,
          },
        };
      }
      // sortable 0 + placeConfirm 無し → plan_presented に fall-through
    } else {
      // CEO方針 2026-04-17 P1-B: 条件が揃うまで "了解。...更新したよ。" preamble は出さない。
      // ユーザーから見ると「はい/いいえ」しか返せない不要1ラリーになるため、
      // overrideMessage が明示指定されたときのみ preamble を出す（旧動作温存）。
      const remainClarify = _buildPlanConfirmMessage!(updatedState);
      const strippedRemain = remainClarify.replace(/^了解。.+?だね。\n?/, "").trim();
      const messageBody = overrideMessage
        ? `${confirmMsg}\n${strippedRemain}`.trim()
        : strippedRemain;
      return {
        session: {
          ...session,
          phase: "clarifying",
          plan,
          planStateV2: updatedState,
        },
        response: {
          phase: "clarifying",
          message: messageBody,
          plan,
        },
      };
    }
  }

  // CEO方針 2026-04-17 P1-B (plan_presented 拡張):
  // 条件が揃った瞬間 "了解。startTimeを設定で更新したよ。" のような
  // 実を伴わない preamble は UX ノイズ。プランカードで情報は伝わるため、
  // overrideMessage が明示されていない限り簡潔な一言に置き換える。
  const planPresentedMessage = overrideMessage ?? "こんな感じでどう？";
  return {
    session: {
      ...session,
      phase: "plan_presented",
      plan,
      planStateV2: updatedState,
    },
    response: {
      phase: "plan_presented",
      message: planPresentedMessage,
      plan,
      personalizeHints: session.personalizeHints,
    },
  };
}

/** v2 用 DayConditions マージ */
function buildV2DayConditions(session: MorningSession, message: string): DayConditions {
  return {
    ...(session.plan?.dayConditions ?? {}),
    ...extractDayConditions(message),
  };
}

/** v2 用 buildDayPlan ラッパー（targetDate / endTime を反映） */
/**
 * Travel 挿入を抑止すべきかを判定する。
 *
 * CEO方針 2026-04-18 Week 1 Step 6a:
 *   「全セグメントが high/medium confidence でない限り travel を挿入しない」
 *
 *   true を返す条件（いずれか該当でセグ単位に抑止）:
 *     - placeSearchHint が残っているのに座標解決されていない
 *     - resolutionConfidence === "low"
 *     - place が明示されているのに座標が無い（現在地フォールバックで誤った travel が出る）
 */
function hasUnresolvedSegmentsForTravel(planState: PlanState): boolean {
  for (const seg of planState.segments) {
    if (seg.placeSearchHint && (seg.resolvedLat === undefined || seg.resolvedLng === undefined)) {
      return true;
    }
    if (seg.resolutionConfidence === "low") return true;
    if (seg.place && !seg.placeSearchHint) {
      // place は明示されているが座標は未解決 → 現在地フォールバックで破綻する恐れ
      if (seg.resolvedLat === undefined || seg.resolvedLng === undefined) {
        // ただし known_base（自宅等）や base 未指定の inferred は別経路で解決されるので除外。
        // ここでは「place 文字列があるのに resolvedLat が無い」状態のみ弾く。
        if (seg.placeType !== "known_base") return true;
      }
    }
  }
  return false;
}

function buildV2DayPlan(
  items: PlanItem[],
  dayConditions: DayConditions,
  planState: PlanState,
): MorningPlan {
  const goOut = planState.goOut ?? planState.segments.some(s => s.place);
  // W2-2 2026-04-19: 旧コードは `returnDest = planState.startPoint` と semantic バグを持っていた
  //   （startPoint は origin であって endpoint ではない）。sync 版は session を受け取らないため
  //   endpointAnchor を参照できない。baseline home（undefined）にフォールバックする。
  //   非 home 終点の Routes 精密計算は async 版（buildV2DayPlanAsync）でのみ有効。
  const returnDest = undefined;
  // CEO方針 2026-04-18 Week 1 Step 6a: Travel Suppress
  //   未解決 place / low confidence のセグメントが残っている間は travel を挿入しない。
  //   壊れた座標を元に算出した移動時間を提示すると、確定プラン化したときに
  //   「真逆のカフェへ 40 分」のような破綻が起きる。解決完了まで静かに隠す。
  const effectiveGoOut = goOut && !hasUnresolvedSegmentsForTravel(planState);
  if (goOut && !effectiveGoOut) {
    console.log(
      "[travel-suppress] unresolved segments present; skipping travel insertion (sync)",
    );
  }
  const plan = buildDayPlan(items, dayConditions, undefined, {
    goOut: effectiveGoOut,
    returnDestination: returnDest,
    targetDate: planState.targetDate,
    endTimeConstraint: planState.endTime,
    departureTime: planState.departureTime,
  });
  plan.date = planState.targetDate;
  if (planState.startPoint) {
    if (!plan.flowContext) plan.flowContext = {};
    (plan.flowContext as any).startPlace = planState.startPoint;
  }
  return plan;
}

/**
 * v2 用 buildDayPlanAsync ラッパー（Phase C-6: Routes API 統合版）
 *
 * セグメントの resolvedLat/resolvedLng + locationResolver の origin 座標を
 * buildDayPlanAsync に渡し、Routes API で移動時間を精密計算する。
 *
 * savedBase が null / coordsMap が空 → sync 版にフォールバック。
 */
async function buildV2DayPlanAsync(
  items: PlanItem[],
  dayConditions: DayConditions,
  planState: PlanState,
  session: MorningSession,
): Promise<MorningPlan> {
  // ── セグメントから座標マップを構築 ──
  const coordsMap: Record<string, LatLng> = {};
  for (const seg of planState.segments) {
    const coords = getSegmentCoords(seg);
    if (coords) {
      // canonicalId or place ラベルをキーにする（PlanItem.location.canonicalId と対応）
      const key = seg.placeCanonical ?? seg.place;
      if (key) coordsMap[key] = coords;
    }
  }

  // ── origin を解決 ──
  const savedBase: SavedBase | null =
    session.userPrefecture
      ? {
          prefecture: session.userPrefecture,
          city: session.userCity,
          // 2026-04-19 baseline 編集対応: cache + label を propagate
          cachedHomeLat: session.userHomeLat ?? null,
          cachedHomeLng: session.userHomeLng ?? null,
          homeLabel: session.userHomeLabel ?? null,
        }
      : null;
  const origin = resolveOrigin(planState, savedBase);

  // ── W2-2 2026-04-19: endpoint を解決 ──
  //   旧挙動: returnDest を planState.startPoint から流用（semantic バグ — startPoint は origin）。
  //   新挙動: endpointAnchor > endAction > baseline home で終点を決定、座標も解決する。
  const endpointAnchor = session.parsedIntent?.endpointAnchor;
  const endpoint = resolveEndpoint(planState, endpointAnchor, savedBase);
  // 自宅帰宅は returnDestination 未指定で従来挙動（origin 座標を使う）に任せる
  const returnDest = endpoint.source === "baseline_home" || endpoint.source === "end_action_home"
    ? undefined
    : endpoint.label;
  const endpointCoords = endpoint.coords;

  const goOut = planState.goOut ?? planState.segments.some(s => s.place);
  // CEO方針 2026-04-18 Week 1 Step 6a: Travel Suppress（async 版）
  const effectiveGoOut = goOut && !hasUnresolvedSegmentsForTravel(planState);
  if (goOut && !effectiveGoOut) {
    console.log(
      "[travel-suppress] unresolved segments present; skipping travel insertion (async)",
    );
  }

  const plan = await buildDayPlanAsync(items, dayConditions, undefined, {
    goOut: effectiveGoOut,
    returnDestination: returnDest,
    endpointAnchor,
    targetDate: planState.targetDate,
    endTimeConstraint: planState.endTime,
    departureTime: planState.departureTime,
    coordsMap,
    originCoords: origin.coords,
    endpointCoords,
    departureTimeIso: planState.departureTime
      ? `${planState.targetDate}T${planState.departureTime}:00+09:00`
      : undefined,
  });

  // ── Block 2-(b) CEO方針 2026-04-17: gapFillEngine × Places Nearby ──
  // gap-fill 提案（proposal=true）に近傍 Places 候補を添付。
  // 原則:
  //   1. anchor が高確信（anchorScore>=4 + resolvedLat/lng）の時だけ発動
  //   2. 勝手に採用しない → proposedPlaceCandidates のみ。resolved* は触らない
  //   3. objective function（距離・近傍・往復）をそのまま効かせる
  //   4. gap fill の主題を壊さない（非 proposal / 対象外 category は不変）
  // fail-open: API 未設定 / anchor 無し / API 失敗はすべて静かにスキップ
  if (_attachNearbyPlacesToProposals && _extractHardAnchors) {
    try {
      const hardAnchors = _extractHardAnchors(planState.segments);
      if (hardAnchors.length > 0) {
        plan.items = await _attachNearbyPlacesToProposals(plan.items, hardAnchors);
      }
    } catch (e) {
      console.warn("[morning-protocol] attachNearbyPlacesToProposals failed (fail-open):", e);
    }
  }

  plan.date = planState.targetDate;
  if (planState.startPoint) {
    if (!plan.flowContext) plan.flowContext = {};
    (plan.flowContext as any).startPlace = planState.startPoint;
  }
  return plan;
}

async function handlePlanPresentedPhase(
  message: string,
  session: MorningSession
): Promise<{ session: MorningSession; response: MorningProtocolResponse }> {
  const trimMsg = message.trim();
  const isConfirm = /^(これ|ok|おk|いい|いく|決定|確定|大丈夫|了解|りょ)/i.test(trimMsg);

  if (isConfirm) {
    const confirmedPlan = session.plan
      ? { ...session.plan, confirmed: true }
      : undefined;
    return {
      session: {
        ...session,
        phase: "outfit_offered",
        plan: confirmedPlan,
      },
      response: {
        phase: "outfit_offered",
        message: `${planDateLabel(confirmedPlan)}のプラン決まったね。\nコーデどうする？キレイめ？カジュアル？きっちり？`,
        plan: confirmedPlan,
      },
    };
  }

  // ── 変更リクエストの検出（「変更する」ボタン等） ──
  // パースせずに直接編集モードへ遷移する。
  // 旧挙動: 「変更する」をパースして新タスクとして追加してしまっていた。
  const isEditRequest = /^(変更|変えたい|変える|修正|直す|やめ|取り消|キャンセル|やり直|編集)/i.test(trimMsg);
  if (isEditRequest) {
    return {
      session,
      response: {
        phase: "plan_presented",
        message: "どこを変えたい？\n・タスクの追加や削除\n・時間の長さ\n・順番の入れ替え\nなんでも言ってね。",
        plan: session.plan,
      },
    };
  }

  // ── v2: PlanState がある場合は LLM delta で処理 ──
  if (session.planStateV2 && session.plan && await ensureV2Modules()) {
    // P2 fail-safe: LLM 障害（Gemini 503 等）を検出し、v1 fallthrough を防止
    let delta: Awaited<ReturnType<NonNullable<typeof _detectDelta>>> | null = null;
    let llmFailed = false;
    try {
      delta = await _detectDelta!(message, session.planStateV2);
    } catch (e) {
      console.error("[morning-protocol] delta detection failed (LLM infrastructure error):", e);
      llmFailed = true;
    }

    if (llmFailed) {
      // LLM 障害時: state を進めず、現在のプランをそのまま返す
      return {
        session, // state 不変
        response: {
          phase: "plan_presented",
          message: "ごめんね、今ちょっと処理がうまくいかなかった。もう一度言ってもらえる？",
          plan: session.plan,
        },
      };
    }

    if (delta && delta.changes.length > 0) {
      try {
        const updatedState = _applyDelta!(session.planStateV2, delta);
        delta.confirmSummary = _buildDeltaConfirmMessage!(updatedState, delta).replace(/^了解。/, "");

        const allItems = _planStateToPlanItems!(updatedState);
        const dayConditions = session.plan.dayConditions;

        if (updatedState.transport && !dayConditions.mainTransport) {
          dayConditions.mainTransport = updatedState.transport;
        }

        const plan = await buildV2DayPlanAsync(allItems, dayConditions, updatedState, session);

        // W2-1 2026-04-19: anchor-first 配置結果を segment に伝播してから Gate 評価
        const deltaStateAfterPlacement = applyPlacementStatusFromPlan(updatedState, plan);

        const confirmMsg = _buildDeltaConfirmMessage!(deltaStateAfterPlacement, delta);
        // GPT指摘: delta 後に stale な pendingPlaceConfirmations をクリーンアップ
        const cleanedPending = cleanupPendingPlaceConfirmations(session, deltaStateAfterPlacement, delta);
        // 追加セグメントに不足情報がある場合はclarifyingフェーズへ
        const hasMissingSegmentFields = deltaStateAfterPlacement.missingFields.some(
          f => f.startsWith("segmentTime:") || f.startsWith("segmentPlace:")
        );
        // CEO方針 2026-04-18 Week 1 Step 6a: Plan Readiness Gate
        //   delta 適用後も、placeSearchHint が解けていない / low confidence が残っていたら
        //   plan_presented に進ませない（壊れた確定プランを出さない）。
        const deltaGate = evaluatePlanReadiness(deltaStateAfterPlacement);
        const shouldPresent = !hasMissingSegmentFields && deltaGate.ready;
        const nextPhase: MorningPhase = shouldPresent ? "plan_presented" : "clarifying";
        let nextMessage: string;
        if (shouldPresent) {
          nextMessage = confirmMsg;
        } else if (hasMissingSegmentFields) {
          // 既存 missingFields 由来の clarify が confirmMsg に含まれている想定
          nextMessage = confirmMsg;
        } else if (!deltaGate.ready) {
          console.log("[plan-readiness-gate] delta blocked:", deltaGate.diagnostic);
          // 変更は適用されたよ + sharp clarify を続けて提示
          nextMessage = `${confirmMsg}\n\n${deltaGate.clarifyMessage}`;
        } else {
          nextMessage = confirmMsg;
        }
        return {
          session: { ...session, phase: nextPhase, plan, planStateV2: deltaStateAfterPlacement, pendingPlaceConfirmations: cleanedPending },
          response: {
            phase: nextPhase,
            message: nextMessage,
            plan,
          },
        };
      } catch (e) {
        // P2 fail-safe: applyDelta / buildDayPlan が失敗しても state を進めない
        console.error("[morning-protocol] delta apply/build failed:", e);
        return {
          session, // state 不変
          response: {
            phase: "plan_presented",
            message: "ごめんね、プランの更新中にエラーが出た。もう一度言ってくれる？",
            plan: session.plan,
          },
        };
      }
    }
  }

  // P1 fail-closed (CEO 2026-04-17):
  // V2 delta が changes=0 / planStateV2 未保持 / V2 モジュール未ロード のまま
  // ここに落ちた編集発話が複雑（メタ訂正、複数条件、人名、日付混在）な場合、
  // V1 planEditor + addDifferentialItems に通すとタスクが増殖する
  // （例: 「今日じゃなくて、明日の話。場所は未定。おすすめある？」→ 4タスク化）。
  // シンプル編集（「14時に商談」「Aさん削除」等）だけ V1 に通す。
  if (detectInputComplexity(message) === "complex") {
    return {
      session, // state 不変（plan も保持）
      response: {
        phase: "plan_presented",
        message: SAFE_CLARIFY_PLAN_EDIT_MESSAGE,
        plan: session.plan,
      },
    };
  }

  // ── v1: 変更リクエスト → planEditor で編集を試行 ──
  if (session.plan) {
    const editResult = applyPlanEdit(message, session.plan);

    if (editResult.applied) {
      // 編集が成功 → プランを再構築
      // transport 等の条件変更を dayConditions に反映
      const updatedDayConditions = { ...session.plan.dayConditions };
      if (editResult.conditionChanges?.transport) {
        updatedDayConditions.mainTransport = editResult.conditionChanges.transport;
      }
      const goOutForRebuild =
        session.plan.flowContext?.goOut === true ||
        (session.plan.mainLocation != null && session.plan.mainLocation.category !== "home");
      const plan = buildDayPlan(editResult.items, updatedDayConditions, undefined, {
        goOut: goOutForRebuild,
        targetDate: session.plan.date !== todayJST() ? session.plan.date : undefined,
      });
      plan.mainLocation = session.plan.mainLocation;
      plan.flowContext = session.plan.flowContext;
      plan.parsedIntent = session.parsedIntent;
      // transport を明示変更した場合、autoInferred.transport をクリア
      if (editResult.conditionChanges?.transport && plan.autoInferred?.transport) {
        plan.autoInferred = { ...plan.autoInferred, transport: undefined };
      }

      return {
        session: { ...session, plan, parsedIntent: plan.parsedIntent },
        response: {
          phase: "plan_presented",
          message: editResult.message,
          plan,
        },
      };
    }

    // planEditor で編集できなかった場合 → 差分追加（全量再パース禁止）
    const turnIndex = session.rawInputs.length - 1; // 現在のターン番号
    const diffResult = addDifferentialItems(message, session.plan, turnIndex);

    if (diffResult.applied) {
      // 新しいアイテムの intent 情報もマージ
      const newIntent = parseIntent(message);
      const mergedFlow = { ...session.plan.flowContext, ...newIntent.flowContext };
      const goOutForRebuild =
        mergedFlow?.goOut === true ||
        (newIntent.mainLocation != null && newIntent.mainLocation.category !== "home") ||
        (session.plan.mainLocation != null && session.plan.mainLocation.category !== "home");
      const plan = buildDayPlan(diffResult.items, session.plan.dayConditions, undefined, {
        goOut: goOutForRebuild,
        endpointAnchor: newIntent.endpointAnchor ?? session.parsedIntent?.endpointAnchor,
        returnDestination: newIntent.returnDestination ?? session.parsedIntent?.returnDestination,
        targetDate: session.plan.date !== todayJST() ? session.plan.date : undefined,
      });
      plan.mainLocation = newIntent.mainLocation ?? session.plan.mainLocation;
      plan.flowContext = mergedFlow;
      plan.parsedIntent = mergeIntents(session.parsedIntent, newIntent);

      return {
        session: { ...session, plan, parsedIntent: plan.parsedIntent },
        response: {
          phase: "plan_presented",
          message: diffResult.message,
          plan,
        },
      };
    }
  }

  // 変更の意図はあるが具体的でない場合
  return {
    session,
    response: {
      phase: "plan_presented",
      message: "どこを変えたい？\n・タスクの追加や削除\n・開始時間の変更\n・時間の長さ\n・順番の入れ替え\nなんでも言ってね。",
      plan: session.plan,
    },
  };
}

function handlePlanConfirmedPhase(
  _message: string,
  session: MorningSession
): { session: MorningSession; response: MorningProtocolResponse } {
  // プラン確定後 → コーデ提案（mood を一緒に聞く）
  return {
    session: { ...session, phase: "outfit_offered" },
    response: {
      phase: "outfit_offered",
      message: `${planDateLabel(session.plan)}のプラン決まったね。\nコーデどうする？キレイめ？カジュアル？きっちり？`,
      plan: session.plan,
    },
  };
}

function handleOutfitOfferedPhase(
  message: string,
  session: MorningSession
): { session: MorningSession; response: MorningProtocolResponse } {
  const trimMsg = message.trim();

  // ── 明示的な拒否 ──
  const declinesOutfit = /^(いらない|不要|いい[やよ]?$|大丈夫|パス|なし|見ない|skip)/i.test(trimMsg);
  if (declinesOutfit) {
    return {
      session: { ...session, phase: "completed" },
      response: {
        phase: "completed",
        message: `了解。${planDateLabel(session.plan)}もいい1日にしよう`,
        plan: session.plan,
      },
    };
  }

  // ── mood をテキストから検出（「キレイめ」「カジュアル」等） ──
  // CEO指摘: 「コーデも見る？」は情報が薄い。mood を一緒に聞くので、
  // 回答からmoodが取れたら dayConditions に反映し、clarifying をスキップできる。
  const detectedMood = detectMood(trimMsg);
  if (detectedMood && session.plan) {
    session.plan.dayConditions = {
      ...session.plan.dayConditions,
      moodText: detectedMood,
    };
  }

  // ── Outfit Sufficiency Gate ──
  if (session.plan) {
    const outfitCheck = checkOutfitSufficiency(session.plan, session.rawInputs);

    // venue 自動推定を DayConditions に反映
    if (outfitCheck.inferredVenue && !session.plan.dayConditions.venue) {
      session.plan.dayConditions = {
        ...session.plan.dayConditions,
        venue: outfitCheck.inferredVenue as DayConditions["venue"],
      };
    }

    if (!outfitCheck.sufficient) {
      // 不足あり → 1 問に束ねて聞く
      const clarifyQ = buildOutfitClarifyQuestion(outfitCheck.missingFields);
      return {
        session: { ...session, phase: "outfit_clarifying" },
        response: {
          phase: "outfit_clarifying",
          message: clarifyQ,
          plan: session.plan,
        },
      };
    }
  }

  // 情報十分 → 即コーデ提示
  return {
    session: { ...session, phase: "outfit_presented" },
    response: {
      phase: "outfit_presented",
      message: `${planDateLabel(session.plan)}のプランに合わせたコーデ、チェックしてみて`,
      plan: session.plan,
    },
  };
}

function handleOutfitClarifyingPhase(
  message: string,
  session: MorningSession
): { session: MorningSession; response: MorningProtocolResponse } {
  // ユーザーの回答から DayConditions を更新
  if (session.plan) {
    session.plan.dayConditions = applyOutfitClarifyResponse(
      message,
      session.plan.dayConditions
    );

    // venue が未設定なら自動推定を再適用
    if (!session.plan.dayConditions.venue) {
      const inferred = inferVenueFromPlan(session.plan);
      if (inferred) {
        session.plan.dayConditions = {
          ...session.plan.dayConditions,
          venue: inferred as DayConditions["venue"],
        };
      }
    }
  }

  // 回答を受けたらコーデ提示へ（追加質問はしない — 1 問ルール）
  return {
    session: { ...session, phase: "outfit_presented" },
    response: {
      phase: "outfit_presented",
      message: `ありがとう。${planDateLabel(session.plan)}のプランに合わせたコーデ、チェックしてみて`,
      plan: session.plan,
    },
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// pendingPlaceConfirmations ライフサイクル管理
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * delta 操作後に stale な pendingPlaceConfirmations をクリーンアップする。
 *
 * GPT指摘: 日付変更・セグメント削除・場所変更・reorder 後に
 * 古い pending confirmation が残るとバグになる。
 *
 * ルール:
 *   - セグメントが削除された → その pending を除去
 *   - セグメントの place が変更された → その pending を除去
 *   - 日付が変更された → 全 pending をクリア
 */
function cleanupPendingPlaceConfirmations(
  session: MorningSession,
  updatedState: PlanState,
  delta?: { changes: Array<{ type: string; field: string; segmentId: string | null }> },
): MorningSession["pendingPlaceConfirmations"] {
  if (!session.pendingPlaceConfirmations || session.pendingPlaceConfirmations.length === 0) {
    return undefined;
  }

  // 日付変更 → 全クリア
  if (delta?.changes.some(c => c.field === "targetDate")) {
    return undefined;
  }

  const currentSegmentIds = new Set(updatedState.segments.map(s => s.id));

  // delta で place が変更されたセグメント or 削除されたセグメント
  const invalidatedSegIds = new Set<string>();
  if (delta) {
    for (const c of delta.changes) {
      if (c.type === "remove_segment" && c.segmentId) {
        invalidatedSegIds.add(c.segmentId);
      }
      if (c.field === "place" && c.segmentId) {
        invalidatedSegIds.add(c.segmentId);
      }
    }
  }

  const remaining = session.pendingPlaceConfirmations.filter(pc => {
    // セグメントが存在しない → 除去
    if (!currentSegmentIds.has(pc.segmentId)) return false;
    // delta で無効化された → 除去
    if (invalidatedSegIds.has(pc.segmentId)) return false;
    return true;
  });

  return remaining.length > 0 ? remaining : undefined;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 場所確認メッセージ構築 + 場所確認レスポンスハンドラー
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * confidence に基づいて場所確認の質問を生成する。
 *
 * CEO方針 2026-04-17:
 *   - high → 黙って採用（質問なし）
 *   - medium → 「○○でどう？」と軽く提案（anchor近傍のチェーン店含む）
 *   - low → 候補提示 or 追加質問
 */
/** @internal test export — buildPlaceConfirmQuestions */
export function buildPlaceConfirmQuestions(
  confirmations: NonNullable<MorningSession["pendingPlaceConfirmations"]>,
): string {
  if (confirmations.length === 0) return "";

  const questions: string[] = [];

  for (const pc of confirmations) {
    if (pc.confidence === "medium" && pc.resolvedName) {
      // medium: 「サドヤ ワイナリーでどう？」
      // 元テキストと resolvedName が同じならシンプルに、違えば両方明示
      const sameName =
        pc.originalText.replace(/\s+/g, "") === pc.resolvedName.replace(/\s+/g, "") ||
        pc.resolvedName.startsWith(pc.originalText);
      questions.push(
        sameName
          ? `${pc.resolvedName}でどう？`
          : `${pc.originalText}って${pc.resolvedName}でどう？`,
      );
    } else if (pc.confidence === "low") {
      if (pc.candidates && pc.candidates.length > 0) {
        // low + 候補あり: 候補を提示
        const candidateList = pc.candidates
          .map((c, i) => `${i + 1}. ${c.name}${c.address ? `（${c.address}）` : ""}`)
          .join("\n");
        questions.push(
          `${pc.originalText}ってどこのこと？\n${candidateList}`,
        );
      } else if (pc.nearAnchorContext) {
        // GPT rule 4 UI side: near-anchor 検索で 0 件
        //   「サドヤ近くでカフェは見つからなかった。範囲を広げる？ 別カテゴリで探す？」
        //   ボタンは最小 2 つ + 必要なら「場所を変える」3 つ目。
        const { anchorLabel, searchCategory } = pc.nearAnchorContext;
        questions.push(
          `${anchorLabel}近くで${searchCategory}は見つからなかった。\n・範囲を広げる？\n・別カテゴリで探す？\n・場所を変える？`,
        );
      } else {
        // low + 候補なし: 場所を聞く
        questions.push(`${pc.originalText}ってどこにあるお店？`);
      }
    }
  }

  if (questions.length === 0) return "";
  if (questions.length === 1) return questions[0];
  return questions.join("\nそれと、");
}

/**
 * 場所確認への回答を決定論的に処理する。
 *
 * 「うん」「はい」「そう」→ medium 候補を採用
 * 「1」「2」「3」→ low 候補から選択
 * 具体的な場所名 → セグメントに直接設定
 */
/** @internal test export — tryDirectPlaceConfirmResponse */
export function tryDirectPlaceConfirmResponse(
  message: string,
  state: PlanState,
  pendingConfirmations: NonNullable<MorningSession["pendingPlaceConfirmations"]>,
): { updatedState: PlanState; descriptions: string[]; resolvedConfirmations: string[] } | null {
  const trimmed = message.trim();
  const descriptions: string[] = [];
  const resolvedConfirmations: string[] = [];
  let updated = {
    ...state,
    segments: state.segments.map(s => ({ ...s, companions: [...s.companions] })),
    missingFields: [...state.missingFields],
  };

  for (const pc of pendingConfirmations) {
    const seg = updated.segments.find(s => s.id === pc.segmentId);
    if (!seg) continue;

    if (pc.confidence === "medium" && pc.resolvedName) {
      // medium: 肯定応答 → 採用
      // （"でどう？" に対しては「いいね」「それで」「おけ」等の応答も拾う）
      if (/^(うん|はい|そう|それ|おk|ok|yes|合って|あって|正解|いい|おけ|了解|ok|オッケ|オーケー|それで)/i.test(trimmed)) {
        seg.resolvedPlaceName = pc.resolvedName;
        seg.resolutionConfidence = "high"; // ユーザー確認済み → high に昇格
        descriptions.push(`${pc.originalText}は${pc.resolvedName}で確定`);
        resolvedConfirmations.push(pc.segmentId);

        // missingFields から除去
        updated.missingFields = updated.missingFields.filter(
          f => !f.startsWith(`placeConfirm:${pc.segmentId}`),
        );
      } else if (/違う|ちがう|いいえ|いや|ちゃう/.test(trimmed)) {
        // 否定 → low 相当に降格（場所を聞く）
        seg.resolutionConfidence = "low";
        seg.resolvedPlaceName = undefined;
        resolvedConfirmations.push(pc.segmentId);

        // placeConfirm → placeAsk に変更
        updated.missingFields = updated.missingFields.filter(
          f => !f.startsWith(`placeConfirm:${pc.segmentId}`),
        );
        updated.missingFields.push(
          `segmentPlace:${pc.segmentId}:${seg.activityCanonical ?? seg.activity}`,
        );
        descriptions.push(`${pc.originalText}の場所を再確認`);
      }
    } else if (pc.confidence === "low" && pc.candidates && pc.candidates.length > 0) {
      // low: 番号選択 → 候補採用
      const numMatch = trimmed.match(/^(\d)$/);
      if (numMatch) {
        const idx = parseInt(numMatch[1], 10) - 1;
        if (idx >= 0 && idx < pc.candidates.length) {
          const chosen = pc.candidates[idx];
          seg.resolvedPlaceName = chosen.name;
          seg.resolvedAddress = chosen.address;
          seg.resolutionConfidence = "high";
          descriptions.push(`${pc.originalText}は${chosen.name}で確定`);
          resolvedConfirmations.push(pc.segmentId);

          updated.missingFields = updated.missingFields.filter(
            f => !f.startsWith(`placeAsk:${pc.segmentId}`),
          );
        }
      }
    } else if (pc.confidence === "low" && pc.nearAnchorContext) {
      // GPT rule 4 UI side: near-anchor 0 件時の 3 ボタン応答
      const ctx = pc.nearAnchorContext;

      // 1. 「広げる」「範囲」 → radiusOverrideM を書き込み、次パスで再検索
      if (/広げ|もっと(広|遠)|範囲|遠く|周辺広|もう少し広/.test(trimmed)) {
        const newRadius = Math.min(ctx.radiusM * 2, 5000); // 2× (上限 5km)
        seg.placeSearchHint = {
          ...(seg.placeSearchHint ?? {}),
          nearAnchorLabel: ctx.anchorLabel,
          searchCategory: ctx.searchCategory,
          radiusOverrideM: newRadius,
        };
        // resolved* は 0 件時点で undefined のまま。
        // missingFields の placeAsk を除去（再検索で確認を作り直す）
        updated.missingFields = updated.missingFields.filter(
          f => !f.startsWith(`placeAsk:${pc.segmentId}`) &&
               !f.startsWith(`placeConfirm:${pc.segmentId}`),
        );
        descriptions.push(`${ctx.anchorLabel}近くの${ctx.searchCategory}を ${newRadius}m 圏で再検索`);
        resolvedConfirmations.push(pc.segmentId);
      }
      // 2. 「別カテゴリ」「他のジャンル」「違うカテゴリ」「違うジャンル」→ searchCategory をクリア、ユーザーに新カテゴリを聞く
      else if (/別(の)?(カテゴリ|ジャンル|種類)|他(の)?(カテゴリ|ジャンル)|違う(カテゴリ|ジャンル)|カテゴリ(変|を)|ジャンル(変|を)/.test(trimmed)) {
        seg.placeSearchHint = {
          ...(seg.placeSearchHint ?? {}),
          nearAnchorLabel: ctx.anchorLabel,
          searchCategory: undefined,
          radiusOverrideM: undefined,
        };
        // placeCategoryAsk: カテゴリを聞く専用 missingField（既存 placeAsk と区別）
        updated.missingFields = updated.missingFields.filter(
          f => !f.startsWith(`placeAsk:${pc.segmentId}`) &&
               !f.startsWith(`placeConfirm:${pc.segmentId}`),
        );
        updated.missingFields.push(
          `placeCategoryAsk:${pc.segmentId}:${ctx.anchorLabel}`,
        );
        descriptions.push(`${ctx.anchorLabel}近くで別カテゴリを探す`);
        resolvedConfirmations.push(pc.segmentId);
      }
      // 3. 「場所を変える」「違う場所」「他の場所」→ placeSearchHint 全クリア、普通の placeAsk に戻す
      else if (/場所(変|を|と)|違う場所|他の場所|別の場所|ここじゃ|ここは/.test(trimmed)) {
        seg.placeSearchHint = undefined;
        updated.missingFields = updated.missingFields.filter(
          f => !f.startsWith(`placeAsk:${pc.segmentId}`) &&
               !f.startsWith(`placeConfirm:${pc.segmentId}`),
        );
        updated.missingFields.push(
          `segmentPlace:${pc.segmentId}:${seg.activityCanonical ?? seg.activity}`,
        );
        descriptions.push(`場所を変更する（${ctx.anchorLabel} 近くの検索を中止）`);
        resolvedConfirmations.push(pc.segmentId);
      }
      // それ以外 → 未解決（次の LLM delta / clarify に委ねる）
    }
  }

  if (descriptions.length === 0) return null;

  return { updatedState: updated, descriptions, resolvedConfirmations };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Intent マージ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function mergeIntents(
  existing: ParsedDayIntent | undefined,
  incoming: ParsedDayIntent
): ParsedDayIntent {
  if (!existing) return incoming;

  // 重複タスクを除外してマージ
  const existingTaskTexts = new Set(existing.primaryTasks.map(t => t.text));
  const newTasks = incoming.primaryTasks.filter(t => !existingTaskTexts.has(t.text));

  const existingEventTitles = new Set(existing.fixedEvents.map(e => e.title));
  const newEvents = incoming.fixedEvents.filter(e => !existingEventTitles.has(e.title));

  // locationSequence マージ（重複ラベル除外）
  const existingLocLabels = new Set((existing.locationSequence ?? []).map(ls => ls.label));
  const newLocs = (incoming.locationSequence ?? []).filter(ls => !existingLocLabels.has(ls.label));
  const mergedLocs = [...(existing.locationSequence ?? []), ...newLocs];

  return {
    primaryTasks: [...existing.primaryTasks, ...newTasks],
    fixedEvents: [...existing.fixedEvents, ...newEvents],
    flowContext: {
      ...existing.flowContext,
      ...incoming.flowContext,
    },
    mainLocation: incoming.mainLocation ?? existing.mainLocation,
    taskLocations: [
      ...(existing.taskLocations ?? []),
      ...(incoming.taskLocations ?? []),
    ],
    locationSequence: mergedLocs.length > 0 ? mergedLocs : undefined,
    endpointAnchor: incoming.endpointAnchor ?? existing.endpointAnchor,
    returnDestination: incoming.returnDestination ?? existing.returnDestination,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// メッセージ構築
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function buildStructuredSummary(items: PlanItem[]): string {
  const fixed = items.filter((i) => i.kind === "fixed");
  const todos = items.filter((i) => i.kind === "todo");

  const parts: string[] = ["整理するとこんな感じかな。"];

  if (fixed.length > 0) {
    parts.push("\n━━ 予定 ━━");
    for (const item of fixed) {
      parts.push(`・${item.startTime ?? ""} ${item.text}`);
    }
  }

  if (todos.length > 0) {
    parts.push("\n━━ やること ━━");
    for (const item of todos) {
      parts.push(`・${item.text}`);
    }
  }

  return parts.join("\n");
}

function buildPlanMessage(plan: MorningPlan, hints: string[]): string {
  const parts: string[] = [];

  if (hints.length > 0) {
    // パーソナライズヒントを1つだけ表示（多すぎると冗長）
    parts.push(hints[0]);
    parts.push("");
  }

  parts.push("こんな感じで組んでみたよ。長さ変えたいものある？");

  return parts.join("\n");
}
