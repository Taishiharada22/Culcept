// lib/stargazer/textLocalizer.ts
// AI生成テキストや動的データに含まれる英語パターンを日本語に変換するフィルター

/** 既知の英語→日本語マッピング */
const ENGLISH_TO_JAPANESE: [RegExp, string][] = [
  // ── 状態ラベル ──
  [/\bstate:\s*moderate\b/gi, "状態: 中程度"],
  [/\bstate:\s*low\b/gi, "状態: 低い"],
  [/\bstate:\s*high\b/gi, "状態: 高い"],
  [/\bstate:\s*very\s*high\b/gi, "状態: 非常に高い"],
  [/\bstate:\s*very\s*low\b/gi, "状態: 非常に低い"],
  [/\bstate:\s*stable\b/gi, "状態: 安定"],
  [/\bstate:\s*unstable\b/gi, "状態: 不安定"],

  // ── コンテキスト/関係性 ──
  [/\bromantic[_\s]?partner\b/gi, "恋人"],
  [/\bromantic\b/gi, "恋愛"],
  [/\bfriendship\b/gi, "友人関係"],
  [/\bfriends?\b/gi, "友人"],
  [/\bfamily\b/gi, "家族"],
  [/\bwork\b/gi, "仕事"],
  [/\bspouse\b/gi, "配偶者"],
  [/\bcocreation\b/gi, "共創"],
  [/\bcommunity\b/gi, "コミュニティ"],
  [/\bone[_\s]on[_\s]one\b/gi, "二人きり"],
  [/\bonline\b/gi, "オンライン"],
  [/\bgeneral\b/gi, "一般"],
  [/\bself\b/gi, "自分自身"],

  // ── 軸名 (axis IDs) ──
  [/\bintimacy[_\s]pace\b/gi, "距離の縮め方"],
  [/\breassurance[_\s]need\b/gi, "安心確認の欲求"],
  [/\brelationship[_\s]mode[_\s]split\b/gi, "関係モードの使い分け"],
  [/\bintent[_\s]stability\b/gi, "意図の安定性"],
  [/\bboundary[_\s]awareness\b/gi, "境界意識"],
  [/\bboundary[_\s]respect\b/gi, "相手への配慮"],
  [/\bconsent[_\s]maturity\b/gi, "合意の成熟度"],
  [/\bpressure[_\s]risk\b/gi, "圧力リスク"],
  [/\bescalation[_\s]risk\b/gi, "激化リスク"],
  [/\bfriend[_\s]mode[_\s]fit\b/gi, "友人適性"],
  [/\brejection[_\s]response[_\s]maturity\b/gi, "拒絶への成熟度"],
  [/\bcontrol[_\s]tendency\b/gi, "支配欲傾向"],
  [/\bexclusivity[_\s]pressure\b/gi, "独占圧"],
  [/\blong[_\s]term[_\s]shift[_\s]risk\b/gi, "長期変動リスク"],
  [/\bpublic[_\s]private[_\s]gap\b/gi, "表と裏の差"],
  [/\bemotional[_\s]regulation\b/gi, "感情制御力"],
  [/\bemotional[_\s]variability\b/gi, "感情の振れ幅"],
  [/\bsocial[_\s]initiative\b/gi, "社交の能動性"],
  [/\bintrovert[_\s]vs[_\s]extrovert\b/gi, "内向⇔外向"],
  [/\bindividual[_\s]vs[_\s]social\b/gi, "個⇔集団"],
  [/\bcautious[_\s]vs[_\s]bold\b/gi, "慎重⇔大胆"],
  [/\banalytical[_\s]vs[_\s]intuitive\b/gi, "分析⇔直感"],
  [/\bchange[_\s]embrace[_\s]vs[_\s]resist\b/gi, "変化⇔安定"],
  [/\bplan[_\s]vs[_\s]spontaneous\b/gi, "計画⇔即興"],
  [/\btradition[_\s]vs[_\s]novelty\b/gi, "伝統⇔新規"],
  [/\bindependence[_\s]vs[_\s]harmony\b/gi, "独立⇔調和"],
  [/\bdirect[_\s]vs[_\s]diplomatic\b/gi, "率直⇔外交"],
  [/\bstress[_\s]isolation[_\s]vs[_\s]social\b/gi, "孤独回復⇔社交回復"],
  [/\bfunction[_\s]vs[_\s]expression\b/gi, "機能⇔表現"],
  [/\bminimal[_\s]vs[_\s]maximal\b/gi, "シンプル⇔華やか"],
  [/\bperfectionist[_\s]vs[_\s]pragmatic\b/gi, "完璧⇔実用"],
  [/\bquality[_\s]vs[_\s]quantity\b/gi, "質⇔量"],
  [/\bclassic[_\s]vs[_\s]trendy\b/gi, "定番派⇔流行派"],

  // ── 方向/トレンド ──
  [/\bpositive\b/g, "ポジティブ"],
  [/\bnegative\b/g, "ネガティブ"],
  [/\boscillating\b/g, "揺れ動き"],
  [/\bstable\b/g, "安定"],
  [/\brising\b/g, "上昇"],
  [/\bdeclining\b/g, "下降"],

  // ── undefined対策 ──
  [/\bundefined\b/g, ""],
];

/**
 * AI生成テキストや動的データ内の既知の英語パターンを日本語に変換する
 * @param text - 変換対象のテキスト
 * @returns 日本語に変換されたテキスト
 */
export function localizeText(text: string | null | undefined): string {
  if (!text) return "";
  let result = text;
  for (const [pattern, replacement] of ENGLISH_TO_JAPANESE) {
    result = result.replace(pattern, replacement);
  }
  // Clean up: remove double spaces, trim
  return result.replace(/\s{2,}/g, " ").trim();
}

/**
 * アンダースコア区切りの英語IDを読みやすい形に変換
 * (localizeTextのマッピングに無い場合のフォールバック)
 */
export function humanizeAxisKey(key: string): string {
  const localized = localizeText(key);
  // If localization changed something, return it
  if (localized !== key) return localized;
  // Fallback: replace underscores and "vs" with readable separators
  return key
    .replace(/_vs_/g, " ⇔ ")
    .replace(/_/g, " ");
}

/**
 * × 区切りの複合キー（例: "relationship_mode_split×intent_stability"）を日本語に変換
 */
export function localizeCompoundKey(key: string): string {
  return key
    .split("×")
    .map((part) => localizeText(part.trim()) || humanizeAxisKey(part.trim()))
    .join(" × ");
}
