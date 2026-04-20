/**
 * Recommendation Pre-Classifier — W2-4 (CEO方針 2026-04-19)
 *
 * ユーザー発話を決定論的に以下の 4 分類に粗く落とす:
 *   - "recommendation_request": 「おすすめある？」「どこかいい店ない？」等の **提案要求**
 *   - "explicit_place":         「渋谷のスタバで」「サドヤに行く」等の **場所指定**
 *   - "explicit_category":      「カフェで作業する」等の **カテゴリのみ指定**（場所名なし）
 *   - "none":                   上記に該当しない
 *
 * 設計原則（CEO 3 条件 2026-04-19）:
 *   (1) emit 条件を厳しくする:
 *       recommendation_request に落とすのは、提案要求の phrase が **純粋に提案だけ** を
 *       要求している場合のみ。explicit place がある発話では recommendation を主役にしない。
 *   (2) pre-classifier を先に置く:
 *       LLM に丸投げせず、決定論で粗分類 → LLM の emit を制御する。文言揺れに強くなる。
 *   (3) delta でも同じ意味論を守る:
 *       Turn 2+ の llmDeltaParser でも同じ classifier を使う。途中ターンで
 *       「やっぱ近くでおすすめある？」が来た時だけ recommendationIntent を追加し、
 *       既存 segment の explicit place を壊さない。
 *
 * 返し値は **LLM への指示生成** と **deterministic emit** の両方で使える形。
 */

import type {
  RecommendationIntent,
  RecommendationSource,
} from "./types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Public API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type RecommendationClassificationKind =
  | "recommendation_request"
  | "explicit_place"
  | "explicit_category"
  | "none";

export interface RecommendationClassification {
  /** 粗分類結果 */
  kind: RecommendationClassificationKind;
  /** マッチした「おすすめ」類 phrase（デバッグ / ログ用） */
  recommendationPhrase?: string;
  /** anchor ヒント（「サドヤ近く」「駅前」「代々木で」等の場所参照） */
  anchorHint?: string;
  /** category ヒント（「カフェ」「レストラン」等） */
  categoryHint?: string;
  /** quality ヒント（「静かな」「美味しい」等の形容詞） */
  qualityHint?: string;
  /** このソースで recommendationIntent を作る場合に使うソース値 */
  source: RecommendationSource;
  /** シグナル内訳（判断根拠・監査用） */
  signals: {
    hasRecommendationPhrase: boolean;
    hasExplicitPlace: boolean;
    hasExplicitCategory: boolean;
    hasInterrogativeMarker: boolean;
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 語彙
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 提案要求を示す phrase 群。
 *
 * CEO 条件(1): 純粋な提案要求だけを拾う。
 *   ✓ 「おすすめある？」「オススメ教えて」
 *   ✓ 「どこかいい所ある？」「いい店ない？」
 *   ✓ 「近くで何かない？」「この辺で何か食べる所」
 *   ✓ 「どこで食べよう？」
 *   ✗ 「渋谷のカフェに行く」— 場所指定があるので recommendation にしない
 *   ✗ 「Aさんにおすすめしてもらった店で」— 既に店が決まっている文脈
 */
const RECOMMENDATION_PHRASE_PATTERNS: Array<{ re: RegExp; label: string }> = [
  // 直接「おすすめ」+ 要求
  {
    re: /(?:おすすめ|オススメ|お薦め|お勧め)(?:の|は|を)?(?:[^。]*?)(?:ある|ない|知らない|教えて|ある[?？]|ない[?？]|[?？])/,
    label: "osusume_request",
  },
  // 「おすすめ」単独（語尾に疑問 or 依頼）
  {
    re: /(?:おすすめ|オススメ|お薦め|お勧め)[\s、。!！?？]*$/,
    label: "osusume_tail",
  },
  // 「どこかいい〜」「何かいい〜」
  {
    re: /(?:どこか|なにか|何か)(?:いい|良い|よい)(?:店|所|ところ|場所|お店|スポット|もの|飯|ごはん|ご飯)/,
    label: "dokoka_ii",
  },
  // 「いい〜ない？」「いい〜ある？」
  {
    re: /(?:いい|良い|よい)(?:店|所|ところ|場所|お店|スポット)(?:[^。]*?)(?:ない|ある)[\s、。!！?？]*[?？]?/,
    label: "ii_place_qa",
  },
  // 「近くで何か」「この辺で何か」
  {
    re: /(?:近く|この辺|そのへん|周り|周辺)(?:で|に)(?:何か|なんか|いい|おすすめ|オススメ)/,
    label: "chikaku_nanka",
  },
  // 「どこで〜しよう」「どこで食べよう」等 — 「どこで」直後に対象動詞が来ても OK
  {
    re: /どこで[^。]{0,10}(?:しよう|食べよう|飲もう|やろう|やる[?？]|食べる[?？]?)/,
    label: "doko_shiyou",
  },
  { re: /どこが(?:いい|良い|よい|おすすめ|オススメ)/, label: "doko_ga_ii" },
  // 「提案して」「教えて」(食べ物・場所の文脈に限定)
  {
    re: /(?:店|所|ところ|場所|飯|ご飯|ランチ|ディナー|カフェ)(?:[^。]*?)(?:提案|教えて)/,
    label: "teian_oshie",
  },
];

/**
 * 「明確な 1 地点を指す固有名」の検出。
 *
 * 条件: 以下のいずれか + 場所助詞 (で|に|へ|まで) / 移動動詞 (行く|寄る|行って)
 *   - チェーン店名（CHAIN_BRAND_RE）
 *   - 店舗標識で終わる（〜店 / 〜屋 / 〜亭 / 〜軒 / 〜庵 / 〜ホテル / 〜ビル）
 *   - 駅名（〜駅）
 *   - カタカナ3文字以上（店名想起可能）
 *   - 固有名詞っぽい漢字列 + 助詞
 *
 * CEO 条件(1) 安全側: 迷ったら explicit 扱いにする。
 * 誤って recommendation に落とすより、確定指定を守る方が重要。
 */
const CHAIN_BRAND_RE =
  /(?:マック|マクド|スタバ|ドトール|コメダ|タリーズ|サイゼ|ガスト|吉野家|松屋|すき家|CoCo壱|丸亀|セブン|ローソン|ファミマ|TSUTAYA|ツタヤ|ユニクロ|無印|ダイソー|イオン|ブックオフ|鳥貴族|日高屋|大戸屋|やよい軒|モス|ケンタ|サブウェイ|ミスド|スターバックス)/i;

const SHOP_MARKER_RE = /[一-龥ぁ-んァ-ヴー々〆ヵヶ・A-Za-z]{1,15}(?:店|屋|亭|軒|庵|ホテル|ビル|ハウス|ラウンジ)/;

/**
 * 「XX店」「XX屋」で XX が一般名詞・修飾語（「いい」「人気」「他の」「お」等）の場合は
 * explicit 判定しない。proper noun として扱えないため。
 */
const GENERIC_SHOP_WORDS_RE =
  /^(?:お店|店|お?酒屋(?:さん)?|花屋(?:さん)?|本屋(?:さん)?|床屋|肉屋|魚屋|パン屋|八百屋|居酒屋|飲み屋|焼き肉屋|ラーメン屋|蕎麦屋|うどん屋|寿司屋|焼肉屋)$/;
const GENERIC_SHOP_PREFIX_RE =
  /^(?:いい|良い|よい|何か|なにか|どこかの?|その|この|あの|ある|人気の?|おすすめの?|オススメの?|他の|違う|別の|新しい|古い|安い|高い|同じ)/;

const STATION_RE = /[一-龥ぁ-んァ-ヴー々〆ヵヶ]{1,10}駅/;

/** カタカナ 3 文字以上（店名想起可能な名詞） */
const KATAKANA_NAME_RE = /[ァ-ヴー]{3,}/;

/** 固有名詞らしい漢字連 + 場所助詞（々 / 〆 を含む固有名にも対応） */
const KANJI_PROPER_PLACE_RE =
  /[一-龥々〆]{2,}(?:で|に|へ|から|まで)(?:[^。]*?)(?:行く|行きます|行って|行こう|寄る|寄ります|寄って|向かう|向かい)/;

const LOCATIVE_VERB_RE =
  /(?:で食べる|で食事|で飲む|で働く|で仕事|で打ち合わせ|で会う|で待つ|に行く|に行きます|に行って|に寄る|に向かう|へ行く)/;

/**
 * 広域地名（都道府県 / 市区町村 / 駅前街区）の候補。
 *   explicit_place の判定に使う。地名があっても recommendation phrase があれば
 *   anchor hint として扱うので kind 判定には効かせない（あくまでヒント抽出用）。
 */
const AREA_PATTERNS: Array<RegExp> = [
  /[一-龥]{2,4}(?:県|府|都|市|区|町|村)/,
];

/** カテゴリキーワード（W2-3 placeResolver と揃える） */
const PLACE_CATEGORY_KEYWORDS = [
  "カフェ",
  "喫茶",
  "コーヒー",
  "レストラン",
  "飯",
  "食堂",
  "居酒屋",
  "バー",
  "ランチ",
  "ディナー",
  "朝ごはん",
  "朝食",
  "昼食",
  "夕食",
  "夜ご飯",
  "書店",
  "本屋",
  "公園",
  "ホテル",
  "宿",
  "コンビニ",
  "スーパー",
  "図書館",
];

/**
 * anchor ヒント抽出（「サドヤ近く」「駅前」「代々木で」等）
 *
 * 優先順位:
 *   1. 「Xの近く」「X近く」「X付近」「X周辺」「X周り」
 *   2. 地名+で/に (助詞)
 *   3. 「〜駅前」「〜駅近く」
 */
const ANCHOR_NEAR_RE =
  /([一-龥ぁ-んァ-ヴーA-Za-z々〆ヵヶ・]{2,15})(?:の)?(?:近く|付近|周辺|周り|近辺)/;

const ANCHOR_STATION_RE = /([一-龥ぁ-んァ-ヴー]{1,10}駅)(?:前|近く|の?周辺)?/;

/** quality 形容詞（静かな・美味しい・安い等） */
const QUALITY_HINT_PATTERNS: Array<RegExp> = [
  /(静かな|落ち着(?:く|いた|ける)|ゆっくり(?:できる|できて)?|雰囲気(?:の?)?(?:良い|いい)|美味しい|うまい|コスパ(?:の?いい)?|安い|リーズナブル|個室(?:の?)?(?:ある)?|Wi-?Fi(?:の?)?(?:ある)?|電源(?:の?)?(?:ある)?|夜景(?:の?)?(?:見える|きれい)|おしゃれ|人気|話題)/,
];

/** 疑問 / 依頼マーカー */
const INTERROGATIVE_RE = /[?？]|かな|かしら|ある\??$|ない\??$|教えて|提案(?:して)?|知(?:らない|って(?:る|ますか))/;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Classifier
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * ユーザー発話を 4 分類に落とす。
 *
 * source 引数:
 *   "explicit_ask"    — ユーザーが質問として発した場合（デフォルト）
 *   "implicit_gap"    — planner が空欄を埋めに行く場合
 *   "alter_initiated" — Alter 側から投げかける場合
 */
export function classifyRecommendationIntent(
  utterance: string,
  options: { source?: RecommendationSource } = {},
): RecommendationClassification {
  const source = options.source ?? "explicit_ask";
  const trimmed = utterance.trim();

  // ── 1. シグナル検出 ──
  const phraseMatch = detectRecommendationPhrase(trimmed);
  const hasInterrogative = INTERROGATIVE_RE.test(trimmed);
  const explicitPlace = detectExplicitPlace(trimmed);
  const categoryHint = detectCategoryHint(trimmed);
  const anchorHint = detectAnchorHint(trimmed);
  const qualityHint = detectQualityHint(trimmed);

  const signals = {
    hasRecommendationPhrase: !!phraseMatch,
    hasExplicitPlace: explicitPlace,
    hasExplicitCategory: !!categoryHint,
    hasInterrogativeMarker: hasInterrogative,
  };

  // ── 2. 分類判定（優先順位厳守） ──
  //
  // CEO 条件(1): explicit place がある限り recommendation を主役にしない。
  //   「渋谷のスタバで作業」→ スタバが explicit。
  //     recommendation phrase が同文にあっても explicit_place に倒す。
  if (explicitPlace) {
    return {
      kind: "explicit_place",
      anchorHint,
      categoryHint,
      qualityHint,
      source,
      signals,
    };
  }

  // recommendation phrase + (疑問 or 依頼マーカー) → recommendation_request
  //   疑問マーカーがなくても phrase 自体が依頼形（「オススメ教えて」）なら OK
  if (phraseMatch) {
    // 安全弁: phrase がごく弱い場合は疑問マーカー必須
    const strong = isStrongPhraseLabel(phraseMatch.label);
    if (strong || hasInterrogative) {
      return {
        kind: "recommendation_request",
        recommendationPhrase: phraseMatch.text,
        anchorHint,
        categoryHint,
        qualityHint,
        source,
        signals,
      };
    }
  }

  if (categoryHint) {
    return {
      kind: "explicit_category",
      anchorHint,
      categoryHint,
      qualityHint,
      source,
      signals,
    };
  }

  return {
    kind: "none",
    anchorHint,
    categoryHint,
    qualityHint,
    source,
    signals,
  };
}

/**
 * 分類結果を `RecommendationIntent` に変換する。
 *
 * kind != "recommendation_request" のときは `null`。呼び出し側で explicit 経路に流す。
 *
 * 戦略選択:
 *   - anchorHint があれば anchor_proximity
 *   - なければ category_only
 *     （Stargazer / Relational 加重は W2-5 以降で追加）
 */
export function toRecommendationIntent(
  classification: RecommendationClassification,
  originalQuery: string,
): RecommendationIntent | null {
  if (classification.kind !== "recommendation_request") return null;

  const strategy = classification.anchorHint ? "anchor_proximity" : "category_only";

  return {
    source: classification.source,
    categoryHint: classification.categoryHint,
    anchorHint: classification.anchorHint,
    qualityHint: classification.qualityHint,
    originalQuery,
    strategy,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 個別 detector
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function detectRecommendationPhrase(
  utterance: string,
): { label: string; text: string } | null {
  for (const pat of RECOMMENDATION_PHRASE_PATTERNS) {
    const m = utterance.match(pat.re);
    if (m) return { label: pat.label, text: m[0] };
  }
  return null;
}

/**
 * 「強い」phrase（疑問マーカーなしでも recommendation_request と判断してよいもの）。
 *
 * osusume_request / ii_place_qa / doko_shiyou / doko_ga_ii / teian_oshie は
 * 形態自体が依頼・疑問を内包するので強い。
 *
 * osusume_tail / dokoka_ii / chikaku_nanka は弱い（宣言文に紛れ込む可能性）。
 */
function isStrongPhraseLabel(label: string): boolean {
  return (
    label === "osusume_request" ||
    label === "ii_place_qa" ||
    label === "doko_shiyou" ||
    label === "doko_ga_ii" ||
    label === "teian_oshie"
  );
}

/**
 * explicit place の検出。
 *
 * 条件（いずれか 1 つで true）:
 *   - CHAIN_BRAND_RE のチェーン名
 *   - SHOP_MARKER_RE の店舗標識（〜店 / 〜屋 / 〜亭 / 〜軒 / 〜庵 / 〜ホテル）
 *     ただし「お店」「酒屋さん」等の一般名詞形ではない（長さ 3 文字以上）
 *   - STATION_RE の駅名 + 場所助詞
 *   - LOCATIVE_VERB_RE + カタカナ3文字以上の名詞（店名候補）
 *   - KANJI_PROPER_PLACE_RE（固有名漢字列 + 場所助詞 + 移動動詞）
 *
 * 注意: 「カフェ」「レストラン」等のカテゴリ語が含まれるだけでは explicit_place にしない。
 *   「カフェに行く」— category だけ → explicit_category に流す。
 */
function detectExplicitPlace(utterance: string): boolean {
  // チェーン店名（確度最高）
  if (CHAIN_BRAND_RE.test(utterance)) return true;

  // 駅名 + 場所助詞/動詞
  if (STATION_RE.test(utterance) && /駅(?:前|近く|の|で|に|へ|まで)/.test(utterance)) {
    // ただし「駅前」単独は anchor hint にすぎないので弱い
    // 「〜駅に行く」「〜駅で待つ」等の動詞付きなら強い
    if (LOCATIVE_VERB_RE.test(utterance)) return true;
  }

  // 店舗標識（〜店 / 〜屋 等）
  const shopMatch = utterance.match(SHOP_MARKER_RE);
  if (shopMatch) {
    const word = shopMatch[0];
    // 一般化された店名（「お店」「本屋さん」「居酒屋」等）は除外
    // 「いい店」「人気の店」等の修飾語 prefix も除外（proper noun ではない）
    if (!GENERIC_SHOP_WORDS_RE.test(word) && !GENERIC_SHOP_PREFIX_RE.test(word)) {
      return true;
    }
  }

  // カタカナ 3 文字以上 + 場所助詞/動詞（「スタバで」「ドトールで」は CHAIN で拾うが漏れ対策）
  const katMatches = utterance.match(new RegExp(KATAKANA_NAME_RE.source, "g")) ?? [];
  for (const kat of katMatches) {
    // 一般カテゴリ語は除外
    if (PLACE_CATEGORY_KEYWORDS.includes(kat)) continue;
    // "ランチ"/"ディナー"/"カフェ" 等の category 代表カタカナは除外
    if (/^(ランチ|ディナー|カフェ|バー|コーヒー|レストラン|ホテル|コンビニ)$/.test(kat)) {
      continue;
    }
    // 直後に場所助詞/動詞があれば explicit
    const idx = utterance.indexOf(kat);
    const tail = utterance.slice(idx + kat.length, idx + kat.length + 12);
    if (/^(で|に|へ|まで)/.test(tail) || LOCATIVE_VERB_RE.test(utterance)) {
      return true;
    }
  }

  // 固有名漢字 + 場所助詞 + 移動動詞
  if (KANJI_PROPER_PLACE_RE.test(utterance)) {
    // 地名（都道府県/市区町村）は excluded
    //   「渋谷に行く」は explicit 扱いで OK だが、
    //   「渋谷のおすすめ」は recommendation 側に流したい
    //   → recommendation phrase の有無で後段で吸収される（ここは explicit に倒す保守策）
    return true;
  }

  return false;
}

/** カテゴリキーワード検出 */
function detectCategoryHint(utterance: string): string | undefined {
  for (const kw of PLACE_CATEGORY_KEYWORDS) {
    if (utterance.includes(kw)) return kw;
  }
  return undefined;
}

/** anchor ヒント（「サドヤ近く」「代々木駅前」「渋谷で」） */
function detectAnchorHint(utterance: string): string | undefined {
  // 1. X近く / X付近 / X周辺
  const m1 = utterance.match(ANCHOR_NEAR_RE);
  if (m1) {
    const candidate = m1[1].trim();
    // カテゴリ語そのものは anchor でない（「カフェ近く」等の迷い回避）
    if (!PLACE_CATEGORY_KEYWORDS.includes(candidate)) {
      return candidate;
    }
  }

  // 2. 駅名
  const m2 = utterance.match(ANCHOR_STATION_RE);
  if (m2) return m2[1];

  // 3. 広域地名（県・市・区・町）
  for (const re of AREA_PATTERNS) {
    const m = utterance.match(re);
    if (m) return m[0];
  }

  return undefined;
}

function detectQualityHint(utterance: string): string | undefined {
  for (const re of QUALITY_HINT_PATTERNS) {
    const m = utterance.match(re);
    if (m) return m[1] ?? m[0];
  }
  return undefined;
}
