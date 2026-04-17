/**
 * Deterministic Delta Pre-Classifier — CEO方針 2026-04-18 Bug A
 *
 * 背景（実機ログ 2026-04-18）:
 *   Turn 1: items=3（マック/仕事、サドヤ/ランチ、カフェ/ミーティング）
 *   Turn 2: "カフェ森の中へだと甲府から相当遠くなるので、甲府にしてください。要は9時から家を出ます"
 *           → 期待: カフェ seg の place を「甲府」に replace + departureTime=09:00
 *           → 実際: items=7（LLM が add_segment を幻覚）
 *
 * CEO 指示:
 *   最優先 — place refinement を targeted replace に固定すること。
 *   汎用 delta ではなく、下のどれかに分類せよ:
 *     「甲府にしてください」→ place_replacement
 *     「甲府駅でおすすめある？」→ anchor_near_search
 *     「ミーティングもその場所の近い場所でやりたい」→ near_anchor_refinement
 *     「車」→ transport_update
 *
 * 設計原則:
 *   - LLM より先に決定論的パターンで短絡。幻覚の add_segment を防ぐ。
 *   - 強い確信度のパターンのみ短絡。曖昧なときは LLM にフォールスルー。
 *   - 「追加」「新しく」「やめる」「キャンセル」等、複合シグナルが混ざる発話は
 *     短絡せず LLM に委ねる（誤分類のほうがコスト大）。
 *   - 直交シグナル（place/departure/transport）は同一発話内で併存可能。
 *     同時に検出できれば複数 change を返す（turnType=correction）。
 *   - 対象セグメント解決は「発話内に既存 seg の place/activity トークンが現れるか」
 *     を主軸とする。見つからなければ null 返しで LLM フォールバック。
 */

import {
  type PlanState,
  type PlanDelta,
  type DeltaChange,
} from "./planState";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Patterns
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 「場所名にしてください/にする/に変更」パターン。
 *
 * 厳密な境界制御:
 *   - 先頭は文頭 または 助詞/句読点（は, が, を, と, で, も, へ, 、, 。, spaces, 括弧）
 *   - キャプチャ内に 助詞 (は/が/を/と) を含めない（誤って「ミーティングは甲府」を
 *     ひとかたまりで拾うのを防ぐ）
 *   - 数字を含まない（時刻の誤検出防止）
 *   - 2-20 文字
 *
 * 例:
 *   "甲府にしてください"                    → group1=甲府
 *   "スタバに変更"                         → group1=スタバ
 *   "渋谷駅にする"                         → group1=渋谷駅
 *   "ミーティングは甲府にしてください"       → group1=甲府（「ミーティングは」はスキップ）
 *   "9時にしてください"                     → マッチしない（数字）
 */
const PLACE_REPLACEMENT_RE =
  /(?<=^|[、。\s「『（(！？「]|[はがをとでもへ])((?:(?![はがをとへ])[一-龥ぁ-んァ-ヴー々〆ヵヶA-Za-z・ー]){2,20}?)(?:に(?:して(?:ください|下さい|欲しい|欲しくて)|する|変更|変えて|してほしい)|でお願い(?:します|))/;

/**
 * 「HH時(から|に)(家を出る|出発|出ます)」パターン。
 *
 * 例:
 *   "9時から家を出ます"       → group1=9, group2=undefined
 *   "8時30分に出発"           → group1=8, group2=30
 *   "9時出発"                 → group1=9, group2=undefined
 */
const DEPARTURE_TIME_RE =
  /(\d{1,2})時(?:(\d{1,2})分)?(?:(?:から|に|頃|ころ)?(?:家を?出(?:る|ます|ました|発)|出発(?:します|)|出ます))/;

/** 単独発話の transport トークン（前後に句読点のみ許容） */
const TRANSPORT_SINGLE_RE = /^(車|徒歩|歩き|電車|バス|自転車|タクシー|バイク|飛行機)[。\s]?$/;

/** 明示的 transport 宣言（「移動は車」「車で行く」） */
const TRANSPORT_EXPLICIT_RE =
  /(?:移動(?:手段)?は|移動は|で行(?:く|きます)(?:$|[。\s]))?(車|徒歩|歩き|電車|バス|自転車|タクシー|バイク|飛行機)(?:で(?:行|移動)|が(?:いい|いいです)|$|[。\s])/;

/** 日本語 transport ラベル → TransportMode */
const TRANSPORT_MAP: Record<string, string> = {
  車: "car",
  徒歩: "walk",
  歩き: "walk",
  電車: "train",
  バス: "bus",
  自転車: "bicycle",
  タクシー: "taxi",
  バイク: "motorcycle",
  飛行機: "plane",
};

/**
 * 「〇〇も追加/やめる/キャンセル」等、pre-classifier の短絡を禁じる
 * 複合シグナルキーワード。検出したら LLM にフォールスルー。
 */
const COMPOUND_SIGNAL_RE =
  /(追加|新しく|新規|やめる|キャンセル|中止|なし(?:で|に)|もう一つ|もうひとつ|あと([^\s。]{0,6})(も|もある|ある))/;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Target segment resolution（発話文脈からターゲット seg を決める）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 発話文中に現れる既存 seg の place/activity トークンから対象セグメントを選ぶ。
 *
 * 優先順位:
 *   (1) 発話中に現れた seg.place / seg.placeCanonical（最長一致を優先）
 *   (2) 発話中に現れた seg.activity / seg.activityCanonical（最長一致）
 *   見つからなければ null。
 *
 * 例:
 *   utterance = "カフェ森の中へだと甲府から相当遠くなるので、甲府にしてください"
 *   segments = [マック/仕事, サドヤ/ランチ, カフェ/ミーティング]
 *   → seg[3]（place="カフェ"）が「カフェ」でマッチ → 返す
 *
 *   utterance = "甲府にしてください"（文脈なし）
 *   → どの seg にもマッチしない → null（LLM フォールバック）
 */
function resolveTargetSegmentByContext(
  utterance: string,
  state: PlanState,
  excludePlace: string, // これから置換する新 place 自身は対象判定から除外
): string | null {
  let bestSegId: string | null = null;
  let bestMatchLen = 0;

  for (const seg of state.segments) {
    const candidates = [
      seg.place,
      seg.placeCanonical,
      seg.activity,
      seg.activityCanonical,
    ].filter((s): s is string => !!s && s.length >= 2 && s !== excludePlace);

    for (const token of candidates) {
      if (utterance.includes(token) && token.length > bestMatchLen) {
        bestSegId = seg.id;
        bestMatchLen = token.length;
      }
    }
  }

  return bestSegId;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Individual classifiers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface ClassifierResult {
  change: DeltaChange;
  /** デバッグ用: どのパターンで判定したか */
  pattern: string;
}

function classifyPlaceReplacement(
  utterance: string,
  state: PlanState,
): ClassifierResult | null {
  const m = utterance.match(PLACE_REPLACEMENT_RE);
  if (!m) return null;

  const newPlace = m[1].trim();
  if (!newPlace) return null;

  // 人名敬称の誤検出除け: 「さん/様/君/ちゃん」で終わる語は人名
  if (/(さん|様|君|くん|ちゃん|殿|氏)$/.test(newPlace)) return null;

  // 時刻トークンの誤検出除け（保険: 正規表現側で数字は弾いているが念のため）
  if (/(時|分|秒)$/.test(newPlace)) return null;

  // 移動手段単語が place 側に紛れ込むのを防ぐ（「車にしてください」を block）
  if (TRANSPORT_MAP[newPlace] !== undefined) return null;

  const targetId = resolveTargetSegmentByContext(utterance, state, newPlace);
  if (!targetId) return null; // 文脈不明 → LLM にゆだねる

  return {
    change: {
      type: "replace",
      segmentId: targetId,
      field: "place",
      newValue: newPlace,
    },
    pattern: "place_replacement",
  };
}

function classifyDepartureTime(
  utterance: string,
): ClassifierResult | null {
  const m = utterance.match(DEPARTURE_TIME_RE);
  if (!m) return null;

  const hour = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  if (hour < 0 || hour > 23 || min < 0 || min > 59) return null;

  const hhmm = `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`;

  return {
    change: {
      type: "set",
      segmentId: null,
      field: "departureTime",
      newValue: hhmm,
    },
    pattern: "departure_time",
  };
}

function classifyTransportUpdate(
  utterance: string,
): ClassifierResult | null {
  const trimmed = utterance.trim();

  // 単独トークン発話（"車"、"車。"）
  const mSingle = trimmed.match(TRANSPORT_SINGLE_RE);
  if (mSingle) {
    const mode = TRANSPORT_MAP[mSingle[1]];
    if (mode) {
      return {
        change: {
          type: "set",
          segmentId: null,
          field: "transport",
          newValue: mode,
        },
        pattern: "transport_single",
      };
    }
  }

  // 明示宣言（「移動は車」「車で行きます」）
  const mExp = trimmed.match(TRANSPORT_EXPLICIT_RE);
  if (mExp) {
    const mode = TRANSPORT_MAP[mExp[1]];
    if (mode) {
      return {
        change: {
          type: "set",
          segmentId: null,
          field: "transport",
          newValue: mode,
        },
        pattern: "transport_explicit",
      };
    }
  }

  return null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface DeterministicDeltaResult {
  delta: PlanDelta;
  /** マッチしたパターンのリスト（ログ/デバッグ用） */
  matchedPatterns: string[];
}

/**
 * 発話を決定論的に分類し、明確な場合のみ PlanDelta を返す。
 *
 * 返り値の判断基準:
 *   - 複合シグナル（追加/削除キーワード）を含む → null（LLM へ）
 *   - place_replacement / departure_time / transport_update のいずれかが
 *     1 つ以上マッチ → PlanDelta を返す（turnType = correction）
 *   - 何もマッチしない → null（LLM へ）
 *
 * 短絡成立時は LLM 呼び出しをスキップするため、幻覚 add_segment を防ぐ。
 */
export function classifyDeltaDeterministic(
  userMessage: string,
  state: PlanState,
): DeterministicDeltaResult | null {
  // 複合シグナル検出: 「追加」「やめる」等が混じる発話は決定論化しない
  if (COMPOUND_SIGNAL_RE.test(userMessage)) return null;

  const results: ClassifierResult[] = [];

  const place = classifyPlaceReplacement(userMessage, state);
  if (place) results.push(place);

  const departure = classifyDepartureTime(userMessage);
  if (departure) results.push(departure);

  // transport は単独発話時のみ信用する（place/departure と併存する発話は誤検出が多い）
  // ただし transport の明示宣言（「移動は車」）だけは他シグナルと併存可能
  const transport = classifyTransportUpdate(userMessage);
  if (transport) {
    if (transport.pattern === "transport_single") {
      // 単独発話なので他シグナルと競合しないはず。そのまま採用。
      results.push(transport);
    } else if (transport.pattern === "transport_explicit") {
      // 「移動は車で」のような明示 — 他シグナルと併存させてよい
      results.push(transport);
    }
  }

  if (results.length === 0) return null;

  return {
    delta: {
      turnType: "correction",
      changes: results.map((r) => r.change),
      confirmSummary: "", // 呼び出し側で buildDeltaConfirmMessage が上書き
    },
    matchedPatterns: results.map((r) => r.pattern),
  };
}
