/**
 * LLM Plan Extractor — Turn 1 のユーザー発話から PlanState を構造化抽出
 *
 * 設計原則:
 * - LLM が意味理解（5W1H 抽出、否定検出）を担当
 * - 既存テーブル（placeTable / activityVocabulary）が語彙正規化を担当
 * - コードが状態管理・ID生成・型変換を担当
 * - LLM は情報抽出のみ。状態を持たない
 *
 * 参照: docs/morning-protocol-v2-design.md §4
 */

import { runAI } from "@/lib/ai";
import { resolvePlaceFromText } from "./placeTable";
import { resolveActivity, getDefaultDuration } from "./activityVocabulary";
import { todayJST } from "./dateUtils";
import {
  type PlanState,
  type PlanSegment,
  type PlaceType,
  type LLMExtractResult,
  type LLMRawSegment,
  type TimeHint,
  type TimeConstraint,
  type TimeConstraintType,
  type SegmentStatus,
  LLM_EXTRACT_SCHEMA,
  TIME_WINDOWS,
  generateSegmentId,
} from "./planState";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LLM System Prompt
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const SYSTEM_PROMPT = `あなたはスケジュール解析AIです。ユーザーの発話から1日の予定を構造化してください。

ルール:
- ユーザーが言及していない情報は null にする
- 「マック」「マクド」「スタバ」等の略称はそのまま出力する（正規化は後工程）
- 否定文（「〜ない」「〜以外に〜ない」）は予定に含めない
- 「仕事の打ち合わせ」「コードレビュー」は1つの活動として扱う（分割しない）
- 「食事して」→「食事」、「買い物して」→「買い物」のように動詞を除去して名詞形で出力
- 「明日の予定だけど」「今日なんだけど」等の前置きから targetDate を判定する
- 「帰宅」「帰る」「終了」等は endAction として抽出する
- companions: 「A君」「佐藤さん」等の人名のみ抽出。「友達」「同僚」も可
- 外出するか判定: 場所が自宅外なら goOut=true、「家で」「自宅で」なら goOut=false、不明なら null
- startPlace: 出発地点（今いる場所）。「自宅」「ホテル」「実家」「会社」「図書館」等。言及がなければ null
  - 「今図書館にいるんだけど」「今はカフェにいる」「オフィスにいるけど」→ startPlace にその場所を設定
  - 現在地を言っている場合、goOut=true（既に外にいるので外出中）

場所+活動の統合（最重要ルール）:
「場所で活動する」「場所に行って活動する」パターンは必ず1つのセグメントにする。場所と活動を別セグメントに分割しない。
- 「図書館で仕事する」→ 1セグメント: activity="仕事", place="図書館"（×「図書館に行く」+「仕事」の2つにしない）
- 「マックに行って仕事」→ 1セグメント: activity="仕事", place="マック"（×「マック」+「仕事」にしない）
- 「カフェでミーティング」→ 1セグメント: activity="ミーティング", place="カフェ"
- 「スタバで勉強する」→ 1セグメント: activity="勉強", place="スタバ"
- 場所への移動は別の仕組み（travel挿入エンジン）が自動生成する。「行く」を活動にしないこと
- 場所名だけのセグメント（activity="マック" 等）は禁止。場所は place フィールドに入れる

時間意味論（重要 — timeType の判定ルール）:
ユーザーが言及した時刻が「何の時刻か」を必ず判定してください。startTime だけでは足りません。

timeType の値:
- "fixed_departure": 「8時に家を出る」「9時に出発」→ 出発時刻。startTime にその時刻を入れる
- "fixed_start": 「14時から打ち合わせ」「10時に仕事開始」→ 活動の開始時刻。startTime にその時刻を入れる
- "fixed_arrival": 「18時までに帰宅」「17時に着きたい」→ 到着時刻。startTime にその時刻を入れる
- "window_morning": 「朝」「午前中」→ 06:00〜12:00 の間。startTime は null、timeHint は "morning"
- "window_noon": 「お昼」「昼ごろ」→ 11:00〜14:00 の間。startTime は null、timeHint は "noon"
- "window_afternoon": 「午後」「午後から」→ 13:00〜18:00 の間。startTime は null、timeHint は "afternoon"
- "window_evening": 「夕方」→ 17:00〜21:00 の間。startTime は null、timeHint は "evening"
- "window_night": 「夜」→ 20:00〜24:00 の間
- null: 時間に関する言及なし

departureTime（トップレベル）:
- 「8時に家を出る」「9時出発」等のプラン全体の出発時刻。セグメントにはせず departureTime に設定。
- 出発行為をセグメントとして作成しないこと（出発はプラン起点であり予定ではない）。

placeType（場所の種類 — 各セグメントの place に対して必ず判定）:
場所が指定されている場合、以下のいずれかを placeType に設定する。場所がなければ null。
- "exact_proper_noun": 固有の店名・施設名。他と間違えようがない名前。
  例: 「サドヤ」「叙々苑」「アトレ恵比寿」「鳥貴族○○店」「帝国ホテル」
- "chain_brand": チェーン店・フランチャイズ。同名の店舗が複数存在する。
  例: 「マック」「スタバ」「ドトール」「コメダ」「吉野家」「TSUTAYAの」「ガスト」「無印」
- "generic_place": 一般名詞。特定の1つを指していない。
  例: 「図書館」「カフェ」「公園」「駅前の店」「近くのレストラン」
- "known_base": ユーザーの既知の拠点。
  例: 「自宅」「家」「オフィス」「会社」「職場」「実家」

疑問文を place にしないこと（最重要 — CEO 方針 2026-04-17）:
ユーザーが「〜近くのカフェないかな？」「〜ある？」「〜どこかいい店ない？」のように
疑問形で「場所を探して欲しい」と言ったとき、その疑問文をそのまま place に入れてはいけない。
- 誤: place="サドヤ近くのカフェないかな？"（疑問文が literal 化）
- 正: place=null, needsPlaceSearch=true, nearAnchorLabel="サドヤ", searchCategory="カフェ"
疑問文パターン:
  - 文末に「？」「?」
  - 語尾が「ないかな」「ある？」「ないかい」「どこかいい〜ない？」「おすすめ〜？」
  - このとき place は必ず null。後段の find_near_anchor エンジンが Places API で探索する。
  - 代わりに、可能なら activity のヒントとして残す（「カフェ」「レストラン」等）。`;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Turn 1: LLM 抽出 → PlanState
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function extractPlanFromText(
  userMessage: string,
  userId?: string,
): Promise<PlanState | null> {
  const result = await runAI({
    taskType: "morning_plan_extract",
    prompt: userMessage,
    systemPrompt: SYSTEM_PROMPT,
    requireJson: true,
    jsonSchema: LLM_EXTRACT_SCHEMA as Record<string, unknown>,
    temperature: 0.1,
    maxOutputTokens: 1024,
    timeoutMs: 8000,
    userId,
  });

  if (!result.success || !result.structured) {
    return null;
  }

  const raw = result.structured as unknown as LLMExtractResult;
  if (!raw.targetDate || !Array.isArray(raw.segments)) {
    return null;
  }

  return normalizeLLMOutput(raw);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 場所+活動の防御マージ（LLM が分割した場合の安全網）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 「場所に行く」+「活動」の2セグメントを1セグメントに統合する。
 *
 * 検出パターン:
 *   A: activity が場所名のみ（place が未設定）、かつ次のセグメントが活動
 *   B: activity が「〜に行く」「〜へ行く」パターンで、中身が場所名
 *
 * 統合: B の activity + A の場所 → 1セグメント
 *
 * CEO指摘 2026-04-16: 「図書館で仕事」→「図書館に行く」+「仕事」の分裂は30点レベルの欠陥
 */
const GO_PATTERN = /^(.+?)(?:に行く|へ行く|行く|に行って|へ行って)$/;

function isPlaceOnlyActivity(activity: string): string | null {
  // 「〜に行く」パターン
  const goMatch = activity.match(GO_PATTERN);
  if (goMatch) return goMatch[1];

  // activity が場所名そのもの（placeTable で解決できるか）
  const placeResult = resolvePlaceFromText(activity);
  if (placeResult) return placeResult.place.canonicalLabel ?? activity;

  return null;
}

export function mergeLocationActivitySegments(segments: LLMRawSegment[]): LLMRawSegment[] {
  if (segments.length < 2) return segments;

  const result: LLMRawSegment[] = [];
  let i = 0;

  while (i < segments.length) {
    const current = segments[i];
    const next = i + 1 < segments.length ? segments[i + 1] : null;

    if (next) {
      // パターン1: current が場所名のみ → next の活動に place として統合
      const placeName = isPlaceOnlyActivity(current.activity);
      if (placeName && !current.place) {
        // next に place が未設定なら統合。既に place があれば統合しない
        if (!next.place) {
          result.push({
            ...next,
            order: current.order,
            place: placeName,
            // current に時間情報があれば引き継ぐ
            startTime: next.startTime ?? current.startTime,
            timeType: next.timeType ?? current.timeType,
            timeHint: next.timeHint ?? current.timeHint,
            // companions はマージ
            companions: [...(current.companions ?? []), ...(next.companions ?? [])],
            transport: next.transport ?? current.transport,
          });
          i += 2; // 2セグメントを消費
          continue;
        }
      }

      // パターン2: current に place あり、next が同じ場所で場所名のみの活動
      // （逆順の分裂は稀だが防御）
    }

    result.push(current);
    i++;
  }

  // order を振り直す
  return result.map((seg, idx) => ({ ...seg, order: idx + 1 }));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LLM 出力の正規化 → PlanState
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function normalizeLLMOutput(raw: LLMExtractResult): PlanState {
  // LLMが場所+活動を2セグメントに分割した場合の防御マージ
  const mergedRaw = mergeLocationActivitySegments(raw.segments);
  const segments: PlanSegment[] = mergedRaw.map((seg) =>
    normalizeSegment(seg),
  );

  const { absoluteDate, label } = resolveTargetDate(raw.targetDate);
  const missingFields = detectMissingFields(segments, raw);

  return {
    targetDate: absoluteDate,
    targetDateLabel: label,
    timezone: "Asia/Tokyo",
    segments,
    transport: normalizeTransport(raw.transport),
    endTime: raw.endTime ?? undefined,
    endAction: raw.endAction ?? undefined,
    endpointType: raw.endAction ? resolveEndpointType(raw.endAction) : undefined,
    goOut: raw.goOut ?? undefined,
    startPoint: raw.startPlace ?? undefined,
    departureTime: raw.departureTime ?? undefined,
    departureTimeConstraint: raw.departureTime
      ? { type: "fixed_departure" as TimeConstraintType, fixedTime: raw.departureTime }
      : undefined,
    status: missingFields.length > 0 ? "collecting" : "collecting",
    missingFields,
  };
}

/**
 * place が疑問文（「〜ないかな？」「〜ある？」等）なら安全弁として scrub する。
 *
 * CEO方針 2026-04-17 Block 1 (a):
 *   LLM が制約を守らず place に疑問文を入れてしまった場合に備え、必ず post-filter で
 *   検出して scrub する。scrub 時は placeSearchHint を生成し、Block 2 (c)/(b) の
 *   find_near_anchor エンジンが拾えるようにしておく。
 *
 * 戻り値: { place, placeSearchHint }
 *   - 疑問文でない: place はそのまま、hint は undefined
 *   - 疑問文: place = null、hint に { nearAnchorLabel, searchCategory, originalQuery }
 */
const QUESTION_PLACE_RE = /[?？]\s*$|ない(かな|かい|\?|？)|ある[?？]|どこかいい|おすすめ.*[?？]/;
const NEAR_ANCHOR_RE = /^(.+?)(?:の)?(?:近く|付近|周り|周辺|近辺)(?:の|に)?(.+?)(?:ない(?:かな|かい)?|ある|どこかいい|おすすめ)?[?？]?\s*$/;
const PLACE_CATEGORY_KEYWORDS = [
  "カフェ", "喫茶", "コーヒー",
  "レストラン", "飯", "食堂", "居酒屋", "バー",
  "店", "ショップ", "書店", "本屋",
  "公園", "広場",
  "ホテル", "宿",
  "駐車場", "コンビニ", "スーパー",
];

function scrubQuestionPlace(rawPlace: string | null | undefined): {
  place: string | null;
  placeSearchHint?: PlanSegment["placeSearchHint"];
} {
  if (!rawPlace) return { place: null };
  const trimmed = rawPlace.trim();
  if (!QUESTION_PLACE_RE.test(trimmed)) {
    return { place: trimmed };
  }

  // 「サドヤ近くのカフェないかな？」パターンを分解
  let nearAnchorLabel: string | undefined;
  let searchCategory: string | undefined;
  const m = trimmed.match(NEAR_ANCHOR_RE);
  if (m) {
    nearAnchorLabel = m[1]?.trim() || undefined;
    const tail = m[2]?.trim() || "";
    // tail から category を抽出
    for (const kw of PLACE_CATEGORY_KEYWORDS) {
      if (tail.includes(kw)) {
        searchCategory = kw;
        break;
      }
    }
    if (!searchCategory && tail) searchCategory = tail;
  }

  // 疑問文マーカー・語尾を落とした表示用ラベルを生成
  // 「サドヤ近くのカフェないかな？」→「サドヤ近くのカフェ」
  const displayLabel = trimmed
    .replace(/[?？]\s*$/, "")
    .replace(/(ない(?:かな|かい)?|ある|どこかいい|おすすめ)\s*$/, "")
    .trim();

  return {
    place: displayLabel || null,
    placeSearchHint: {
      nearAnchorLabel,
      searchCategory,
      originalQuery: trimmed,
    },
  };
}

function normalizeSegment(seg: LLMRawSegment): PlanSegment {
  // CEO方針 Block 1 (a) 安全弁: 疑問文 place を scrub
  const scrub = scrubQuestionPlace(seg.place);
  const effectivePlace = scrub.place;

  // 場所の正規化
  const placeResult = effectivePlace ? resolvePlaceFromText(effectivePlace) : null;

  // 活動の正規化
  const activityResult = resolveActivity(seg.activity);

  // 時間制約の構築（CEO方針: startTime一枚では足りない）
  const timeConstraint = buildTimeConstraint(seg);

  // 場所タイプの正規化（LLM 出力 or placeTable からフォールバック推定）
  const placeType = normalizePlaceType(seg.placeType, effectivePlace, placeResult);

  // アンカースコア計算（scrub 後の place を使う — 疑問文は anchor にしない）
  const segForAnchor: LLMRawSegment = { ...seg, place: effectivePlace };
  const anchorScore = computeAnchorScore(segForAnchor, placeType);

  return {
    id: generateSegmentId(),
    order: seg.order,
    timeHint: normalizeTimeHint(seg.timeHint),
    startTime: seg.startTime ?? undefined,
    timeConstraint,
    activity: seg.activity,
    activityCanonical: activityResult?.canonical ?? seg.activity,
    activityCategory: activityResult?.category as PlanSegment["activityCategory"],
    estimatedDurationMin: activityResult?.defaultDurationMin ?? getDefaultDuration(seg.activity),
    place: effectivePlace ?? undefined,
    placeCanonical: placeResult?.place.canonicalLabel ?? effectivePlace ?? undefined,
    placeCategory: placeResult?.place.category as PlanSegment["placeCategory"],
    placeType,
    anchorScore,
    placeSearchHint: scrub.placeSearchHint,
    companions: seg.companions ?? [],
    transport: normalizeTransport(seg.transport),
    status: "tentative" as SegmentStatus,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PlaceType 正規化 & AnchorScore 計算
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const VALID_PLACE_TYPES = new Set(["exact_proper_noun", "chain_brand", "generic_place", "known_base"]);

const KNOWN_BASE_RE = /^(自宅|家|うち|オフィス|会社|職場|実家|学校|大学)$/;
const CHAIN_BRAND_RE = /マック|マクド|スタバ|ドトール|コメダ|タリーズ|サイゼ|ガスト|吉野家|松屋|すき家|CoCo壱|丸亀|セブン|ローソン|ファミマ|TSUTAYA|ツタヤ|ユニクロ|無印|ダイソー|イオン|ブックオフ|鳥貴族|日高屋|大戸屋|やよい軒|モス|ケンタ|サブウェイ|ミスド|コンビニ/i;
const GENERIC_PLACE_RE = /^(図書館|カフェ|公園|レストラン|駅|病院|銀行|郵便局|スーパー|薬局|ジム|プール|美容院|床屋|役所|市役所|区役所|居酒屋)$/;

/**
 * LLM出力の placeType を正規化。LLM が判定を返さなかった場合はフォールバック推定。
 */
function normalizePlaceType(
  llmPlaceType: string | null | undefined,
  placeName: string | null | undefined,
  placeResult: ReturnType<typeof resolvePlaceFromText>,
): PlaceType | undefined {
  if (!placeName) return undefined;

  // LLM が有効な値を返した場合はそのまま採用
  if (llmPlaceType && VALID_PLACE_TYPES.has(llmPlaceType)) {
    return llmPlaceType as PlaceType;
  }

  // フォールバック: ルールベースで推定
  if (KNOWN_BASE_RE.test(placeName)) return "known_base";
  if (CHAIN_BRAND_RE.test(placeName)) return "chain_brand";
  if (GENERIC_PLACE_RE.test(placeName)) return "generic_place";

  // placeTable で解決できた場合 → chain か known の可能性。解決できない = 固有名の可能性
  if (placeResult) {
    const cat = placeResult.place.category;
    if (cat === "home" || cat === "work") return "known_base";
    // placeTable にある = よく知られた場所 → chain扱い
    return "chain_brand";
  }

  // placeTable にもない未知の名前 → 固有名と推定
  return "exact_proper_noun";
}

/**
 * アンカースコアを計算する。
 *
 * スコア体系:
 *   explicit_time:        +3（固定時刻あり）
 *   named_place:          +2（固有名） / +1（チェーン） / +0（一般名詞・拠点）
 *   companion:            +1（同行者あり）
 *   opening_hours_depend: +1（飲食店・レストラン等）
 *
 * Hard anchor: >= 4 / Semi-hard: 2-3 / Soft: 0-1
 */
const OPENING_HOURS_ACTIVITY_RE = /ランチ|ディナー|食事|夕食|昼食|飲み|カフェ|レストラン|映画|美容院|病院|歯医者/i;

function computeAnchorScore(seg: LLMRawSegment, placeType?: PlaceType): number {
  let score = 0;

  // explicit_time: +3（固定時刻あり）
  const hasFixedTime = seg.startTime != null &&
    (seg.timeType === "fixed_start" || seg.timeType === "fixed_departure" || seg.timeType === "fixed_arrival");
  if (hasFixedTime) score += 3;

  // named_place: 固有名+2, チェーン+1, その他+0
  if (placeType === "exact_proper_noun") score += 2;
  else if (placeType === "chain_brand") score += 1;

  // companion: +1
  if (seg.companions && seg.companions.length > 0) score += 1;

  // opening_hours_depend: +1（営業時間に依存する活動）
  if (OPENING_HOURS_ACTIVITY_RE.test(seg.activity)) score += 1;

  return score;
}

/**
 * LLM 出力から TimeConstraint を構築する。
 *
 * 優先順位:
 * 1. 明示的な timeType があればそれを使う
 * 2. なければ startTime / timeHint からレガシー推論
 */
function buildTimeConstraint(seg: LLMRawSegment): TimeConstraint | undefined {
  const timeType = seg.timeType;

  if (timeType) {
    // 明示的な timeType
    switch (timeType) {
      case "fixed_departure":
      case "fixed_start":
      case "fixed_arrival":
        return {
          type: timeType as TimeConstraintType,
          fixedTime: seg.startTime ?? undefined,
        };
      case "window_morning":
      case "window_noon":
      case "window_afternoon":
      case "window_evening":
      case "window_night": {
        const window = TIME_WINDOWS[timeType];
        if (window) {
          return {
            type: timeType as TimeConstraintType,
            windowStart: minutesToHHMM(window.start),
            windowEnd: minutesToHHMM(window.end),
          };
        }
        return { type: timeType as TimeConstraintType };
      }
      case "none":
        return undefined;
      default:
        // 不明な timeType → フォールバック
        break;
    }
  }

  // レガシーフォールバック: timeType なしの場合
  if (seg.startTime) {
    return { type: "fixed_start", fixedTime: seg.startTime };
  }
  if (seg.timeHint) {
    const windowKey = `window_${seg.timeHint}`;
    const window = TIME_WINDOWS[windowKey];
    if (window) {
      return {
        type: windowKey as TimeConstraintType,
        windowStart: minutesToHHMM(window.start),
        windowEnd: minutesToHHMM(window.end),
      };
    }
  }

  return undefined;
}

/** 分を "HH:MM" に変換 */
function minutesToHHMM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// targetDate 解決
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function resolveTargetDate(raw: string): { absoluteDate: string; label: string } {
  const today = todayJST();
  const todayDate = new Date(today + "T00:00:00+09:00");

  switch (raw) {
    case "tomorrow": {
      const d = new Date(todayDate);
      d.setDate(d.getDate() + 1);
      return { absoluteDate: formatDate(d), label: "明日" };
    }
    case "day_after_tomorrow": {
      const d = new Date(todayDate);
      d.setDate(d.getDate() + 2);
      return { absoluteDate: formatDate(d), label: "明後日" };
    }
    case "today":
    default:
      return { absoluteDate: today, label: "今日" };
  }
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 不足フィールド検出
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function detectMissingFields(segments: PlanSegment[], raw: LLMExtractResult): string[] {
  const missing: string[] = [];
  const goOut = raw.goOut ?? segments.some((s) => s.place);

  // 1. Departure time — 最初のセグメントに開始時刻が未指定（何時に出発するかでプラン全体が変わる）
  const hasAnyStartTime = segments.some((s) => s.startTime);
  if (!hasAnyStartTime && segments.length > 0) {
    missing.push("departureTime");
  }

  // 2. Transport — 外出するのに移動手段が不明
  if (!raw.transport && !segments.some((s) => s.transport)) {
    if (goOut) {
      missing.push("transport");
    }
  }

  // 3. Place needed — 外出予定で場所が未指定のセグメント（打ち合わせ・会食・社交活動）
  //    CEO指摘 2026-04-16: 「会う」「ディナー」の場所を聞かないと同じ場所にされてしまう
  //    CEO方針 Block 1 (a) 2026-04-17: placeSearchHint あり = ユーザーが「探して」と言った
  //      → 「どこで？」と聞き返さず、Block 2 の find_near_anchor エンジンに委ねる
  if (goOut) {
    const NEEDS_PLACE_RE = /打ち合わせ|ミーティング|meeting|会議|面談|商談|面接|セミナー|研修|会う|ディナー|ランチ|夕食|昼食|飲み|飲み会|食事/i;
    for (const seg of segments) {
      if (NEEDS_PLACE_RE.test(seg.activity) && !seg.place && !seg.placeSearchHint) {
        missing.push(`segmentPlace:${seg.id}:${seg.activityCanonical ?? seg.activity}`);
      }
    }
  }

  return missing;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Confirm Message — PlanState ベースの全体要約 (Turn 1)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const TIME_HINT_LABELS: Record<string, string> = {
  morning: "朝",
  noon: "昼",
  afternoon: "午後",
  evening: "夕方",
};

export function buildPlanConfirmMessage(state: PlanState): string {
  const date = state.targetDateLabel;

  // 出発時刻がある場合は冒頭に追加
  const departurePart = state.departureTime
    ? `${state.departureTime}に出発、`
    : "";

  const segmentDescs = state.segments.map((seg) => {
    // 時間表示: timeConstraint ベースで判定
    let timeLabel = "";
    if (seg.timeConstraint) {
      const tc = seg.timeConstraint;
      if (tc.type === "fixed_start" && tc.fixedTime) {
        timeLabel = `${tc.fixedTime}から`;
      } else if (tc.type === "fixed_departure" && tc.fixedTime) {
        timeLabel = `${tc.fixedTime}出発で`;
      } else if (tc.type === "fixed_arrival" && tc.fixedTime) {
        timeLabel = `${tc.fixedTime}までに`;
      } else if (tc.type.startsWith("window_")) {
        const windowLabels: Record<string, string> = {
          window_morning: "朝",
          window_noon: "昼",
          window_afternoon: "午後",
          window_evening: "夕方",
          window_night: "夜",
        };
        timeLabel = windowLabels[tc.type] ?? "";
      }
    } else if (seg.timeHint) {
      timeLabel = TIME_HINT_LABELS[seg.timeHint] ?? "";
    }
    // resolvedPlaceName > placeCanonical > place の優先順で使用
    const place = seg.resolvedPlaceName ?? seg.placeCanonical ?? seg.place ?? "";
    const who =
      seg.companions.length > 0 ? `${seg.companions.join("、")}と` : "";
    const where = place ? `${place}で` : "";
    const activity = seg.activityCanonical ?? seg.activity;
    const prefix = timeLabel ? `${timeLabel}は` : "";
    return `${prefix}${where}${who}${activity}`;
  });

  const endPart = state.endTime
    ? `、${state.endTime}頃終了予定`
    : "";
  const endActionPart = state.endAction
    ? `で${state.endAction}`
    : "";

  const clarify =
    state.missingFields.length > 0
      ? `\n${buildClarifyFromMissing(state.missingFields)}`
      : "";

  return `了解。${date}は、${departurePart}${segmentDescs.join("、")}${endPart}${endActionPart}だね。${clarify}`.trim();
}

/**
 * 食事・面会系の activity ラベル判定。
 * これらは「時間が既に決まっている」ことが多いため、時間質問を最優先化する
 * （CEO方針 2026-04-17 Block 1）。
 */
const FOOD_MEETING_RE = /ディナー|夕食|ランチ|昼食|朝食|食事|飲み|面会|会う|ミーティング|会議|打ち合わせ|デート/;

/**
 * missingFields を CEO 優先順位に並べ替えて返す。
 *
 * 優先順位（高→低）:
 *   1. 食事・面会の segmentTime — 「時間は決まってることが多い」前提で即確認
 *   2. その他 segmentTime
 *   3. departureTime — 出発時刻（間接的）
 *   4. 食事・面会の segmentPlace
 *   5. その他 segmentPlace
 *   6. transport — 後からでも埋められる
 *
 * placeConfirm / placeAsk は buildPlaceConfirmQuestions 側で扱うためここでは除外。
 */
function sortMissingByPriority(fields: string[]): string[] {
  const rankOf = (f: string): number => {
    if (f.startsWith("segmentTime:")) {
      const label = f.split(":").slice(2).join(":");
      return FOOD_MEETING_RE.test(label) ? 1 : 2;
    }
    if (f === "departureTime") return 3;
    if (f.startsWith("segmentPlace:")) {
      const label = f.split(":").slice(2).join(":");
      return FOOD_MEETING_RE.test(label) ? 4 : 5;
    }
    if (f === "transport") return 6;
    return 99;
  };
  return [...fields]
    .filter(f => !f.startsWith("placeConfirm:") && !f.startsWith("placeAsk:"))
    .sort((a, b) => rankOf(a) - rankOf(b));
}

/**
 * missingField 1件を自然な質問文に変換する。
 */
function fieldToQuestion(f: string): string | null {
  if (f === "departureTime") {
    return "何時頃から動き出す予定？";
  }
  if (f === "transport") {
    return "移動手段は何にする？";
  }
  if (f.startsWith("segmentTime:")) {
    const activityLabel = f.split(":").slice(2).join(":");
    return `${activityLabel}は何時からの予定？`;
  }
  if (f.startsWith("segmentPlace:")) {
    const activityLabel = f.split(":").slice(2).join(":");
    if (/ディナー|夕食|ランチ|昼食|食事|飲み/.test(activityLabel)) {
      return `${activityLabel}はどこで食べる予定？`;
    }
    if (/会う/.test(activityLabel)) {
      return `${activityLabel}のはどこの予定？`;
    }
    return `${activityLabel}はどこでやる予定？`;
  }
  return null;
}

/**
 * CEO方針 2026-04-17 Block 1:
 *   1 ターン 1 質問。複数不足があっても最優先の 1 件だけ聞く。
 *   ユーザー認知負荷を下げ、食事/面会など「時間が決まってる」前提を活かす。
 */
function buildClarifyFromMissing(fields: string[]): string {
  const sorted = sortMissingByPriority(fields);
  for (const f of sorted) {
    const q = fieldToQuestion(f);
    if (q) return q;
  }
  return "";
}

/** missingFields のうち指定フィールドを除去 */
export function removeMissingField(state: PlanState, fieldPrefix: string): PlanState {
  return {
    ...state,
    missingFields: state.missingFields.filter(f => !f.startsWith(fieldPrefix)),
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Confirm Message — Diff (Turn 2+)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { PlanDelta } from "./planState";

export function buildDeltaConfirmMessage(
  state: PlanState,
  delta: PlanDelta,
): string {
  // 変更リストから決定論的に要約を生成
  const descriptions: string[] = [];

  for (const change of delta.changes) {
    const seg = change.segmentId
      ? state.segments.find((s) => s.id === change.segmentId)
      : null;
    const segLabel = seg
      ? (seg.activityCanonical ?? seg.activity)
      : "";

    switch (change.type) {
      case "replace": {
        if (change.field === "place") {
          descriptions.push(
            `${segLabel}の場所を${String(change.newValue ?? "変更")}に変更`,
          );
        } else if (change.field === "activity") {
          descriptions.push(
            `${segLabel}を${String(change.newValue ?? "変更")}に変更`,
          );
        } else if (change.field === "companions") {
          const val = Array.isArray(change.newValue) ? change.newValue.join("、") : String(change.newValue ?? "");
          descriptions.push(`${segLabel}の同行者を${val}に変更`);
        } else if (change.field === "startTime") {
          descriptions.push(`${segLabel}の時間を${String(change.newValue ?? "")}に変更`);
        } else if (change.field === "departureTime") {
          descriptions.push(`出発を${String(change.newValue ?? "")}に変更`);
        } else if (change.field === "targetDate") {
          // targetDate は buildPlanConfirmMessage で日付ラベルが出るので省略
        } else {
          descriptions.push(`${segLabel}の${change.field}を更新`);
        }
        break;
      }
      case "set": {
        if (change.field === "transport") {
          const labels: Record<string, string> = {
            car: "車", train: "電車", bus: "バス", walk: "徒歩",
            bicycle: "自転車", taxi: "タクシー", motorcycle: "バイク",
          };
          const val = String(change.newValue ?? "");
          descriptions.push(`移動は${labels[val] ?? val}`);
        } else if (change.field === "endTime") {
          descriptions.push(`終了時刻を${String(change.newValue ?? "")}に設定`);
        } else if (change.field === "departureTime") {
          descriptions.push(`${String(change.newValue ?? "")}に出発`);
        } else if (change.field === "goOut") {
          descriptions.push(String(change.newValue) === "true" ? "外出" : "在宅");
        } else if (change.field === "targetDate") {
          // targetDate は buildPlanConfirmMessage で日付ラベルが出るので、ここでは省略
        } else {
          descriptions.push(`${change.field}を設定`);
        }
        break;
      }
      case "remove":
        descriptions.push(`${segLabel}の${change.field}を削除`);
        break;
      case "add_segment":
        descriptions.push(`${String(change.newSegment?.activity ?? "新しい予定")}を追加`);
        break;
      case "remove_segment":
        descriptions.push(`${segLabel}を削除`);
        break;
    }
  }

  if (descriptions.length === 0) {
    return "了解。更新したよ。";
  }

  // 不足情報がある場合はclarify質問を追加
  const clarify = state.missingFields.length > 0
    ? `\n${buildClarifyFromMissing(state.missingFields)}`
    : "";

  return `了解。${descriptions.join("、")}で更新したよ。${clarify}`.trim();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PlanState → PlanItem[] 変換（既存 UI 互換レイヤー）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { PlanItem, MainLocation } from "./types";

export function planStateToPlanItems(state: PlanState): PlanItem[] {
  return state.segments.map((seg, index) => {
    const location: MainLocation | undefined = seg.placeCanonical
      ? {
          canonicalId: seg.placeCategory ?? seg.placeCanonical,
          label: seg.placeCanonical,
          category: seg.placeCategory,
          source: "user_explicit" as const,
        }
      : undefined;

    // what(where) 形式のテキスト生成
    const activity = seg.activityCanonical ?? seg.activity;
    const place = seg.placeCanonical ?? seg.place;
    const text = place ? `${activity}(${place})` : activity;

    // kind の判定: timeConstraint を考慮
    //  - fixed_start / fixed_departure / fixed_arrival → "fixed"
    //  - window_* → "todo"（ウィンドウ制約付き、明示的 startTime なし）
    //  - startTime あり → "fixed"（レガシー互換）
    const tcType = seg.timeConstraint?.type;
    const isFixedConstraint = tcType === "fixed_start" || tcType === "fixed_departure" || tcType === "fixed_arrival";
    const kind: "fixed" | "todo" = (isFixedConstraint || !!seg.startTime) ? "fixed" : "todo";

    return {
      id: seg.id,
      kind,
      text,
      what: activity,
      startTime: seg.startTime,
      durationMin: seg.estimatedDurationMin ?? 45,
      fixedStart: isFixedConstraint || !!seg.startTime,
      orderHint: index,
      sourceTurnIndex: 0,
      eventType: undefined,
      withWhom: seg.companions.length > 0 ? seg.companions.join("、") : undefined,
      completed: false,
      location,
      activityCategory: seg.activityCategory,
      timeConstraintType: tcType,
      sequenceOrder: seg.order,
    };
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function normalizeTimeHint(raw?: string | null): TimeHint | undefined {
  if (!raw) return undefined;
  const valid: TimeHint[] = ["morning", "noon", "afternoon", "evening"];
  return valid.includes(raw as TimeHint) ? (raw as TimeHint) : undefined;
}

function normalizeTransport(raw?: string | null): PlanSegment["transport"] {
  if (!raw) return undefined;
  const valid = ["car", "train", "bus", "walk", "bicycle", "taxi", "motorcycle", "plane"];
  return valid.includes(raw) ? (raw as PlanSegment["transport"]) : undefined;
}

function resolveEndpointType(action: string): PlanState["endpointType"] {
  if (/帰宅|帰[るり]|家に/.test(action)) return "home";
  if (/ホテル/.test(action)) return "hotel";
  if (/会社|オフィス|職場/.test(action)) return "office";
  return "home";
}
