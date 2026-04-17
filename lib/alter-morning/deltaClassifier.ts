/**
 * Deterministic Delta Pre-Classifier — CEO方針 2026-04-18 Bug A（改訂版）
 *
 * === 2026-04-18 改訂（CEO実機再検証フィードバック反映）===
 *
 * 当初の v1（place_replacement / departure_time を短絡）は不採用。
 * 実機検証で CEO が "自然言語の読み取り 0 点" と指摘した背景:
 *   - 「甲府にしてください」の「甲府」は area（広域）なのか point（固有店舗）なのか
 *     compound（「甲府のカフェ」=エリア内の特定カテゴリ）なのかが、自然言語の理解
 *     なしには判定不能。決定論 regex で place 直代入すると、placeResolver が広域名を
 *     座標解決して「甲府駅」等に落ちるか、解決失敗する。
 *   - CEO 指示: "まずは自然言語で理解して、それからリサーチを行なってください。
 *     リサーチは LLM が不要だったら使わなくてもいい。"
 *
 * 新方針: 短絡対象を "曖昧性ゼロ" のものだけに絞る。
 *   - ✓ transport_update: 「車」「徒歩」等の単独発話（語彙が閉じていて曖昧性なし）
 *   - ✗ place_replacement: 自然言語理解が必須。LLM 必須。
 *   - ✗ departure_time: 「9時から家を出ます」も文脈次第で活動 start との混同あり。LLM 必須。
 *
 * 当初 Bug A で回避したかった "LLM 幻覚による items 爆発" は、
 * deltaClassifier ではなく llmDeltaParser 側の prompt 強化で対処する
 * （area / point / compound の区別、既存セグメント維持の明示）。
 *
 * 設計原則:
 *   - 強い確信度のパターンのみ短絡（自然言語理解を要するものは全て LLM）
 *   - 曖昧なときは null を返して LLM にフォールスルー
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

/**
 * 明示的 transport 宣言。
 *   形 A: 「移動は車」「移動手段は車で」 — 明示的な主題提起
 *   形 B: 「車で行く」「徒歩で行きます」 — 手段の宣言
 */
const TRANSPORT_EXPLICIT_RE =
  /(?:移動(?:手段)?は(車|徒歩|歩き|電車|バス|自転車|タクシー|バイク|飛行機)|(車|徒歩|歩き|電車|バス|自転車|タクシー|バイク|飛行機)で(?:行く|行きます|移動する|移動します))/;

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
    // 形 A（移動は〜）か形 B（〜で行く）のどちらかが group 1/2 に入る
    const token = mExp[1] ?? mExp[2];
    const mode = token ? TRANSPORT_MAP[token] : undefined;
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

  // 参照（未使用だが将来の拡張検討のため残置）
  void state;

  const results: ClassifierResult[] = [];

  // CEO方針 2026-04-18 改訂: place/departure は LLM 必須（自然言語理解が先行）
  //   place_replacement / departure_time の短絡はここでは行わない。
  //   classifyPlaceReplacement / classifyDepartureTime の実装は残しているが
  //   呼び出していない（将来的に area/point 区別が決定論で可能になれば復活させる余地）。

  // transport のみ短絡対象。語彙が閉じていて曖昧性が極めて低いため安全。
  const transport = classifyTransportUpdate(userMessage);
  if (transport) {
    results.push(transport);
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
