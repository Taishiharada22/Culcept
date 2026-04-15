// lib/talk/intentTranslation/japanesePragmatics.ts
// 日本語曖昧表現の意図推定辞書 + 敬語シフト検出器
//
// 学術的基盤:
//   - 高文脈文化（Hall, 1976）: 言葉にせず察する文化
//   - 日本語の敬語分類（Construction and Validation of a Japanese Honorific Corpus, ACL 2022）
//   - ruptureDetection.ts の WITHDRAWAL_PATTERNS を意図翻訳文脈に拡張
//
// 設計原則:
//   - 既存の ruptureDetection.ts のパターンを**そのまま温存**。
//     ここでは「Alter-ユーザー間」ではなく「ユーザー-ユーザー間」のテキスト分析用に
//     独立した辞書を構築する。
//   - パターンマッチ（高速、確定的）+ LLM推論（文脈依存、確率的）のハイブリッド設計。

import type {
  AmbiguousExpressionHit,
  KeigoLevel,
  KeigoShiftSignal,
  ConversationTurn,
  IntentTranslationProfile,
} from "./types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 日本語曖昧表現辞書
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type AmbiguousEntry = {
  /** マッチパターン（正規表現） */
  pattern: RegExp;
  /** 表現名 */
  expression: string;
  /** 文字通りの意味 */
  literalMeaning: string;
  /** 推定される真の意図候補（確率付き） */
  likelyIntents: Array<{ intent: string; probability: number }>;
  /** 判定に必要な追加文脈 */
  contextNeeded: string;
  /** この表現の曖昧性スコア (0.0-1.0)。高いほど誤読リスクが高い */
  ambiguityScore: number;
};

/**
 * 日本語テキストにおける曖昧表現の辞書。
 * 各エントリは「文字通りの意味」と「実際の意図候補」の乖離を定義する。
 *
 * 確率は一般的なベースライン。実際の判定では送信者の性格プロファイル
 * （特に direct_vs_diplomatic, public_private_gap）で調整する。
 */
const AMBIGUOUS_EXPRESSIONS: AmbiguousEntry[] = [
  {
    pattern: /別に/,
    expression: "別に",
    literalMeaning: "特にない",
    likelyIntents: [
      { intent: "不満・拒否", probability: 0.65 },
      { intent: "本当に特にない", probability: 0.25 },
      { intent: "関心の低下", probability: 0.10 },
    ],
    contextNeeded: "前の質問内容、会話の緊張度",
    ambiguityScore: 0.8,
  },
  {
    pattern: /まあ[、。\s]?$/,
    expression: "まあ",
    literalMeaning: "一応",
    likelyIntents: [
      { intent: "消極的同意", probability: 0.45 },
      { intent: "諦め・妥協", probability: 0.35 },
      { intent: "関心の低下", probability: 0.20 },
    ],
    contextNeeded: "直前の提案内容",
    ambiguityScore: 0.7,
  },
  {
    pattern: /一応/,
    expression: "一応",
    literalMeaning: "念のため",
    likelyIntents: [
      { intent: "不安・確信の欠如", probability: 0.50 },
      { intent: "保険をかける", probability: 0.30 },
      { intent: "本当に念のため", probability: 0.20 },
    ],
    contextNeeded: "話題の重要度",
    ambiguityScore: 0.5,
  },
  {
    pattern: /ちょっと(?:難し|厳し|きつ|無理|微妙)/,
    expression: "ちょっと〜",
    literalMeaning: "少し困難",
    likelyIntents: [
      { intent: "拒否の婉曲表現", probability: 0.80 },
      { intent: "本当に少しだけ難しい", probability: 0.15 },
      { intent: "検討中", probability: 0.05 },
    ],
    contextNeeded: "申し出の内容",
    ambiguityScore: 0.85,
  },
  {
    pattern: /(?:^|\s)いいよ[。\s]?$/,
    expression: "いいよ",
    literalMeaning: "良い・OK",
    likelyIntents: [
      { intent: "同意・了承", probability: 0.55 },
      { intent: "諦め・どうでもいい", probability: 0.30 },
      { intent: "嫌だけど合わせる", probability: 0.15 },
    ],
    contextNeeded: "会話の緊張度、前の流れ",
    ambiguityScore: 0.65,
  },
  {
    pattern: /大丈夫/,
    expression: "大丈夫",
    literalMeaning: "問題ない",
    likelyIntents: [
      { intent: "本当に問題ない", probability: 0.50 },
      { intent: "拒否の婉曲表現（いらない）", probability: 0.30 },
      { intent: "強がり・本当は辛い", probability: 0.20 },
    ],
    contextNeeded: "申し出の内容、送信者の emotional_regulation",
    ambiguityScore: 0.7,
  },
  {
    pattern: /(?:^|\s)了解[。\s]?$/,
    expression: "了解",
    literalMeaning: "理解した",
    likelyIntents: [
      { intent: "効率的な応答", probability: 0.60 },
      { intent: "冷たさ・距離感", probability: 0.25 },
      { intent: "不満を飲み込んだ", probability: 0.15 },
    ],
    contextNeeded: "送信者の通常の文体との比較",
    ambiguityScore: 0.55,
  },
  {
    pattern: /(?:^|\s)うん[。\s]?$/,
    expression: "うん",
    literalMeaning: "はい",
    likelyIntents: [
      { intent: "同意・聞いている", probability: 0.50 },
      { intent: "関心の低下", probability: 0.30 },
      { intent: "考え中でとりあえず返事", probability: 0.20 },
    ],
    contextNeeded: "メッセージ長の変化パターン",
    ambiguityScore: 0.5,
  },
  {
    pattern: /考えさせて|考えとく|考えておく/,
    expression: "考えさせて",
    literalMeaning: "検討する",
    likelyIntents: [
      { intent: "婉曲的な拒否", probability: 0.45 },
      { intent: "本当に検討中", probability: 0.40 },
      { intent: "先延ばし", probability: 0.15 },
    ],
    contextNeeded: "提案の内容、送信者の decision_tempo",
    ambiguityScore: 0.6,
  },
  {
    pattern: /好きにして|勝手にして|お好きにどうぞ/,
    expression: "好きにして",
    literalMeaning: "自由にしていい",
    likelyIntents: [
      { intent: "怒り・諦め", probability: 0.70 },
      { intent: "本当に任せる", probability: 0.20 },
      { intent: "距離を取りたい", probability: 0.10 },
    ],
    contextNeeded: "直前の会話の緊張度",
    ambiguityScore: 0.85,
  },
  {
    pattern: /なんでもいい|どっちでもいい|何でもいい/,
    expression: "なんでもいい",
    literalMeaning: "どれでも構わない",
    likelyIntents: [
      { intent: "本当にどれでもいい", probability: 0.35 },
      { intent: "考えるのが面倒", probability: 0.30 },
      { intent: "自分の意見を言いにくい", probability: 0.20 },
      { intent: "相手に試されている感じがする", probability: 0.15 },
    ],
    contextNeeded: "質問の繰り返し回数、送信者の conflict_style",
    // 0.80→0.82: 反復使用パターン（C-2 では2回出現）を考慮した微調整。
    // factor: 0.98→0.992 で軽い抑制パスを安定確保。
    ambiguityScore: 0.82,
  },
  {
    pattern: /ごめん[ね。]?$/,
    expression: "ごめん",
    literalMeaning: "謝罪",
    likelyIntents: [
      { intent: "本当の謝罪", probability: 0.40 },
      { intent: "会話を終わらせたい", probability: 0.30 },
      { intent: "自分を責めている", probability: 0.20 },
      { intent: "面倒だから折れる", probability: 0.10 },
    ],
    contextNeeded: "謝罪の対象、会話の流れ",
    ambiguityScore: 0.55,
  },
  // ── 「...」（三点リーダー）の使用 ──
  {
    pattern: /\.{3}|…{1,}/,
    expression: "...",
    literalMeaning: "言い淀み",
    likelyIntents: [
      { intent: "ためらい・迷い", probability: 0.40 },
      { intent: "意味深・言外の意味がある", probability: 0.30 },
      { intent: "寂しさ・切なさ", probability: 0.20 },
      { intent: "単なる文体", probability: 0.10 },
    ],
    contextNeeded: "送信者の通常の「...」使用頻度",
    ambiguityScore: 0.5,
  },
  // ── Round 3 追加: 複合パターン + 新規曖昧表現 ──
  {
    pattern: /まあ(?:いいよ|いいか|いっか)/,
    expression: "まあいいよ",
    literalMeaning: "まあ、良い",
    likelyIntents: [
      { intent: "諦め・妥協", probability: 0.50 },
      { intent: "消極的同意", probability: 0.30 },
      { intent: "本当に問題ない", probability: 0.20 },
    ],
    contextNeeded: "直前の提案内容、会話の緊張度",
    ambiguityScore: 0.85,
  },
  {
    pattern: /^えっ[。？?！!…\.]*$/,
    expression: "えっ",
    literalMeaning: "驚き",
    likelyIntents: [
      { intent: "驚き・困惑", probability: 0.40 },
      { intent: "不満・拒否感", probability: 0.35 },
      { intent: "聞き返し", probability: 0.25 },
    ],
    contextNeeded: "前の発言の内容、会話の緊張度",
    ambiguityScore: 0.45,
  },
  // ── Round 2-B 追加: E2E で検出漏れしたパターン ──
  {
    pattern: /(?:^|\s)わかった[。\s]?$/,
    expression: "わかった",
    literalMeaning: "理解した",
    likelyIntents: [
      { intent: "了承（納得）", probability: 0.40 },
      { intent: "不満を飲み込んだ（消極的了承）", probability: 0.35 },
      { intent: "会話を切り上げたい", probability: 0.25 },
    ],
    contextNeeded: "前の発言の圧迫度、送信者の conflict_style",
    // 0.65→0.75: 対立文脈での「わかった」は「大丈夫」(0.70)と同等以上の曖昧性。
    // 了承(40%)/消極的了承(35%)/打ち切り(25%) と3通りに分岐し文脈依存性が高い。
    // A-20/A-112 の区別は contextRisk（対立マーカー検出）で行う。
    ambiguityScore: 0.75,
  },
  {
    pattern: /^は[？?！!]?$/,
    expression: "は？",
    literalMeaning: "驚き",
    likelyIntents: [
      { intent: "驚き・困惑", probability: 0.35 },
      { intent: "不満・怒り", probability: 0.45 },
      { intent: "聞き返し", probability: 0.20 },
    ],
    contextNeeded: "前の発言の内容、送信者の emotional_regulation",
    ambiguityScore: 0.85,
  },
  {
    pattern: /はいはい/,
    expression: "はいはい",
    literalMeaning: "了解了解",
    likelyIntents: [
      { intent: "面倒・投げやり", probability: 0.55 },
      { intent: "軽い苛立ち", probability: 0.30 },
      { intent: "軽い同意", probability: 0.15 },
    ],
    contextNeeded: "会話の緊張度、繰り返し回数",
    ambiguityScore: 0.8,
  },
  {
    pattern: /もう(?:いい|いいよ|いいって|いいから)/,
    expression: "もういい",
    literalMeaning: "十分",
    likelyIntents: [
      { intent: "諦め・打ち切り", probability: 0.50 },
      { intent: "怒り・拒絶", probability: 0.35 },
      { intent: "本当に満足", probability: 0.15 },
    ],
    contextNeeded: "直前の論争の有無、送信者の conflict_style",
    ambiguityScore: 0.85,
  },
  {
    pattern: /勝手に(?:すれば|して|しろ|どうぞ)/,
    expression: "勝手にすれば",
    literalMeaning: "自由にしていい",
    likelyIntents: [
      { intent: "怒り・見放し", probability: 0.65 },
      { intent: "諦め", probability: 0.25 },
      { intent: "本当に任せる", probability: 0.10 },
    ],
    contextNeeded: "直前の対立の有無",
    ambiguityScore: 0.9,
  },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// プロファイル条件付き確率調整
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 学術根拠:
 *   - Tannen (1990): 同一表現でも高文脈話者と低文脈話者で意図が異なる
 *   - Ambady & Rosenthal (1992): 性格特性が非言語・テキスト手がかりの解釈を変える
 *   - Planalp (1998): 関係親密度が曖昧表現の解釈精度に影響
 *
 * 送信者のプロファイルに基づき、曖昧表現の意図確率を動的に調整する。
 * 例: 率直な人が「了解」→ 効率的応答の確率↑ / 外交的な人が「了解」→ 不満飲み込みの確率↑
 */

/** プロファイルが各意図カテゴリに与える確率シフト */
type IntentShiftRule = {
  /** この表現に適用 */
  expression: string;
  /** シフト対象の意図キーワード（部分一致） */
  intentKeyword: string;
  /** プロファイル軸 */
  axis: keyof Omit<IntentTranslationProfile, "userId">;
  /**
   * シフト方向:
   *   positive = 軸が正(+1方向)のとき、この意図の確率が上がる
   *   negative = 軸が負(-1方向)のとき、この意図の確率が上がる
   */
  direction: "positive" | "negative";
  /** シフト量（最大 ±0.25） */
  maxShift: number;
};

const INTENT_SHIFT_RULES: IntentShiftRule[] = [
  // ── 了解: 率直 vs 外交的 ──
  { expression: "了解", intentKeyword: "効率", axis: "direct_vs_diplomatic", direction: "negative", maxShift: 0.2 },
  { expression: "了解", intentKeyword: "不満", axis: "direct_vs_diplomatic", direction: "positive", maxShift: 0.15 },
  { expression: "了解", intentKeyword: "冷た", axis: "public_private_gap", direction: "positive", maxShift: 0.1 },

  // ── 別に: 表裏の差 + 対立スタイル ──
  { expression: "別に", intentKeyword: "不満", axis: "public_private_gap", direction: "positive", maxShift: 0.2 },
  { expression: "別に", intentKeyword: "特に", axis: "direct_vs_diplomatic", direction: "negative", maxShift: 0.15 },
  { expression: "別に", intentKeyword: "関心", axis: "emotional_variability", direction: "positive", maxShift: 0.1 },

  // ── 大丈夫: 感情制御 + 愛着スタイル ──
  { expression: "大丈夫", intentKeyword: "強がり", axis: "emotional_regulation", direction: "positive", maxShift: 0.2 },
  { expression: "大丈夫", intentKeyword: "拒否", axis: "direct_vs_diplomatic", direction: "positive", maxShift: 0.15 },
  { expression: "大丈夫", intentKeyword: "問題ない", axis: "direct_vs_diplomatic", direction: "negative", maxShift: 0.15 },

  // ── いいよ: 対立スタイル ──
  { expression: "いいよ", intentKeyword: "諦め", axis: "conflict_style", direction: "negative", maxShift: 0.2 },
  { expression: "いいよ", intentKeyword: "嫌だけど", axis: "public_private_gap", direction: "positive", maxShift: 0.15 },

  // ── 好きにして: 感情変動 + 対立スタイル ──
  { expression: "好きにして", intentKeyword: "怒り", axis: "emotional_variability", direction: "positive", maxShift: 0.15 },
  { expression: "好きにして", intentKeyword: "任せる", axis: "direct_vs_diplomatic", direction: "negative", maxShift: 0.15 },

  // ── なんでもいい: 自己開示 + 対立回避 ──
  { expression: "なんでもいい", intentKeyword: "意見を言いにくい", axis: "self_disclosure_depth", direction: "negative", maxShift: 0.2 },
  { expression: "なんでもいい", intentKeyword: "面倒", axis: "conflict_style", direction: "negative", maxShift: 0.15 },

  // ── ごめん: 愛着 + 感情制御 ──
  { expression: "ごめん", intentKeyword: "責めている", axis: "attachment_style", direction: "positive", maxShift: 0.2 },
  { expression: "ごめん", intentKeyword: "終わらせたい", axis: "conflict_style", direction: "negative", maxShift: 0.15 },

  // ── 考えさせて: boundary_awareness ──
  { expression: "考えさせて", intentKeyword: "拒否", axis: "boundary_awareness", direction: "positive", maxShift: 0.15 },
  { expression: "考えさせて", intentKeyword: "検討中", axis: "direct_vs_diplomatic", direction: "negative", maxShift: 0.1 },

  // ── まあ: 対立スタイル ──
  { expression: "まあ", intentKeyword: "諦め", axis: "conflict_style", direction: "negative", maxShift: 0.2 },
  { expression: "まあ", intentKeyword: "関心", axis: "relational_investment", direction: "negative", maxShift: 0.15 },

  // ── わかった: 対立スタイル + 感情制御 ──
  { expression: "わかった", intentKeyword: "不満", axis: "conflict_style", direction: "negative", maxShift: 0.2 },
  { expression: "わかった", intentKeyword: "了承", axis: "direct_vs_diplomatic", direction: "negative", maxShift: 0.15 },

  // ── は？: 感情変動 ──
  { expression: "は？", intentKeyword: "怒り", axis: "emotional_variability", direction: "positive", maxShift: 0.2 },
  { expression: "は？", intentKeyword: "驚き", axis: "emotional_regulation", direction: "positive", maxShift: 0.1 },

  // ── はいはい: 対立スタイル ──
  { expression: "はいはい", intentKeyword: "面倒", axis: "conflict_style", direction: "negative", maxShift: 0.2 },
  { expression: "はいはい", intentKeyword: "苛立ち", axis: "emotional_regulation", direction: "negative", maxShift: 0.15 },

  // ── もういい: 対立スタイル + 感情変動 ──
  { expression: "もういい", intentKeyword: "諦め", axis: "conflict_style", direction: "negative", maxShift: 0.2 },
  { expression: "もういい", intentKeyword: "怒り", axis: "emotional_variability", direction: "positive", maxShift: 0.15 },

  // ── 勝手にすれば: 感情変動 + 対立 ──
  { expression: "勝手にすれば", intentKeyword: "怒り", axis: "emotional_variability", direction: "positive", maxShift: 0.2 },
  { expression: "勝手にすれば", intentKeyword: "見放し", axis: "relational_investment", direction: "negative", maxShift: 0.15 },
];

/**
 * 送信者プロファイルに基づき、曖昧表現の意図確率を動的調整する。
 *
 * 1. 該当する IntentShiftRule を適用（軸の値 × maxShift で確率をシフト）
 * 2. 確率を正規化して合計1.0に戻す
 *
 * @returns 調整済みの likelyIntents（元の配列は変更しない）
 */
export function adjustProbabilitiesForProfile(
  intents: AmbiguousExpressionHit["likelyIntents"],
  expression: string,
  senderProfile: IntentTranslationProfile,
): AmbiguousExpressionHit["likelyIntents"] {
  // コピーを作成
  const adjusted = intents.map(i => ({ ...i }));

  for (const rule of INTENT_SHIFT_RULES) {
    if (rule.expression !== expression) continue;

    // 該当する意図を見つける
    const target = adjusted.find(i => i.intent.includes(rule.intentKeyword));
    if (!target) continue;

    // 軸の値を取得 (-1 ～ +1)
    const axisValue = senderProfile[rule.axis];

    // シフト計算: direction が positive なら軸値が正のとき確率増加
    const shift = rule.direction === "positive"
      ? Math.max(0, axisValue) * rule.maxShift
      : Math.max(0, -axisValue) * rule.maxShift;

    target.probability += shift;
  }

  // 正規化: 合計1.0に戻す
  const sum = adjusted.reduce((s, i) => s + i.probability, 0);
  if (sum > 0) {
    for (const i of adjusted) {
      i.probability = Math.round((i.probability / sum) * 100) / 100;
    }
  }

  return adjusted;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 曖昧表現検出
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * メッセージから曖昧表現を検出する。
 * パターンマッチによる高速検出。
 *
 * senderProfile が渡された場合、プロファイルに基づく確率調整を適用する。
 */
export function detectAmbiguousExpressions(
  message: string,
  senderProfile?: IntentTranslationProfile,
): AmbiguousExpressionHit[] {
  const hits: AmbiguousExpressionHit[] = [];

  for (const entry of AMBIGUOUS_EXPRESSIONS) {
    if (entry.pattern.test(message)) {
      const likelyIntents = senderProfile
        ? adjustProbabilitiesForProfile(entry.likelyIntents, entry.expression, senderProfile)
        : entry.likelyIntents;

      hits.push({
        expression: entry.expression,
        literalMeaning: entry.literalMeaning,
        likelyIntents,
        contextNeeded: entry.contextNeeded,
      });
    }
  }

  return hits;
}

/**
 * 曖昧表現の検出結果から ambiguity_factor を算出する。
 * 誤読リスクスコアの構成要素として使用。
 *
 * @returns 0.5（曖昧性なし）〜 2.0（高い曖昧性）
 */
export function computeAmbiguityFactor(message: string): number {
  const BASE = 0.5;
  const MAX = 2.0;

  let totalScore = 0;

  for (const entry of AMBIGUOUS_EXPRESSIONS) {
    if (entry.pattern.test(message)) {
      totalScore += entry.ambiguityScore;
    }
  }

  // 主語省略の検出（日本語特有）
  // 主語がない短文で、動詞・形容詞で始まるメッセージ
  const trimmed = message.trim();
  if (trimmed.length < 30 && /^[ぁ-ん]/.test(trimmed)) {
    // 「嫌だった」「行きたくない」等、主語なしで感情・意志を表す短文
    if (/(?:だった|たくない|してほしい|やめて|つらい|嫌|怖い|不安)/.test(trimmed)) {
      totalScore += 0.3; // 主語省略による曖昧性加算
    }
  }

  // 「...」の使用は追加の曖昧性
  if (/\.{3}|…/.test(trimmed)) {
    totalScore += 0.15;
  }

  // 0.5-2.0 にクランプ
  return Math.min(MAX, BASE + totalScore * 0.6);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 対人摩擦パターン検出（Round 2-C: B カテゴリ特化）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 対人摩擦パターンの検出結果。
 *
 * 学術根拠:
 *   - Gottman (1994): 四騎士（批判・防衛・軽蔑・石壁）の早期検出が関係悪化予防に有効
 *   - Watzlawick (1967): ダブルバインドの構造（矛盾する指示の同時発信）
 *   - Linehan (1993): 感情無効化（emotion invalidation）が関係的苦痛を増幅
 *
 * 2群に分類:
 *   Group 1（sender-improvable）: 送信者が表現を改善できるパターン → Phase 1 リスク加算
 *   Group 2（distress-expression）: 送信者の苦痛表出 → Phase 2 confidence 加算のみ
 */
export type FrictionSignalResult = {
  /** 全摩擦パターンの合計スコア (0.0–0.5) */
  score: number;
  /** Group 1 のみのスコア — Phase 1 additive risk 用 */
  senderRiskScore: number;
  /** 検出されたパターンラベル */
  patterns: string[];
};

type FrictionPatternEntry = {
  pattern: RegExp;
  label: string;
  score: number;
  /** true = Group 1 (sender-improvable), false = Group 2 (distress-expression) */
  senderImprovable: boolean;
};

const FRICTION_PATTERNS: FrictionPatternEntry[] = [
  // ── Group 1: Sender-improvable（送信者が改善できる表現）──

  // Gottman criticism — 性格攻撃 + 一般化
  {
    pattern: /いつも(?:あなた|お前|君|おまえ)(?:は|って)/,
    label: "criticism_always",
    score: 0.40,
    senderImprovable: true,
  },
  {
    pattern: /何回(?:言えば|言ったら)/,
    label: "criticism_repetition",
    score: 0.35,
    senderImprovable: true,
  },

  // ダブルバインド — 許可と罰の同時発信
  {
    pattern: /(?:行けば|すれば|したら)[？?]?[^。]{0,20}(?:でも|けど)[^。]{0,20}(?:がっかり|悲し|寂し|残念|嫌)/,
    label: "double_bind",
    score: 0.35,
    senderImprovable: true,
  },

  // 条件付き謝罪 — 謝罪の形式だが実質は自己正当化
  {
    pattern: /ごめん(?:けど|だけど)/,
    label: "conditional_apology",
    score: 0.30,
    senderImprovable: true,
  },

  // 感情矮小化 — 相手の感情を否定・軽視
  {
    pattern: /(?:大げさ|心配しすぎ|考えすぎ|気にしすぎ)/,
    label: "emotion_minimization",
    score: 0.30,
    senderImprovable: true,
  },

  // 要求パターン — 「ちゃんとやれ」式の命令
  {
    pattern: /ちゃんと(?:答え|して|やって|聞いて|見て|読んで|考えて)/,
    label: "demand_properly",
    score: 0.30,
    senderImprovable: true,
  },

  // 不公平感の表出 — 「私ばっかり」式の偏り指摘
  {
    pattern: /(?:ばっかり|ばかり)(?:やって|出して|して|だ)/,
    label: "unfair_burden",
    score: 0.30,
    senderImprovable: true,
  },

  // ── Group 2: Distress-expression（苦痛の表出 — 介入より共感が適切）──

  // 要求型「なぜ」— 不安からの追及
  {
    pattern: /なんで.{0,20}(?:ない|くれない)の/,
    label: "demand_why_not",
    score: 0.30,
    senderImprovable: false,
  },

  // 監視言語 — 既読・SNS行動の追跡
  {
    pattern: /既読.{0,10}(?:返事|返信).{0,5}(?:しない|ない|くれない)/,
    label: "monitoring_read",
    score: 0.25,
    senderImprovable: false,
  },
  {
    pattern: /(?:インスタ|SNS|ストーリー).{0,15}(?:いいね|フォロー)/,
    label: "monitoring_sns",
    score: 0.25,
    senderImprovable: false,
  },

  // 感謝・承認の要求 — 認めてほしいという気持ちの表出
  {
    pattern: /ちゃんと(?:言って|伝えて)/,
    label: "demand_acknowledgment",
    score: 0.30,
    senderImprovable: false,
  },

  // 拒絶・怒りの表出 — ふざけるなの変形
  {
    pattern: /ふざけ(?:ないで|るな|んな)/,
    label: "anger_expression",
    score: 0.30,
    senderImprovable: false,
  },

  // 関係不確実性 — 別れの可能性への言及
  {
    pattern: /(?:合わない|合ってない)(?:のかも|かもしれない)/,
    label: "relationship_uncertainty",
    score: 0.30,
    senderImprovable: false,
  },
];

/**
 * メッセージから対人摩擦パターンを検出する。
 *
 * Phase 1 と Phase 2 で異なる使い方をする:
 *   - Phase 1 (readingSimulation): senderRiskScore を additive risk に加算
 *   - Phase 2 (intentReconstruction): score を display confidence boost に使用
 */
export function computeFrictionSignal(message: string): FrictionSignalResult {
  const MAX_SCORE = 0.50;
  let totalScore = 0;
  let senderRiskScore = 0;
  const patterns: string[] = [];

  for (const entry of FRICTION_PATTERNS) {
    if (entry.pattern.test(message)) {
      totalScore += entry.score;
      if (entry.senderImprovable) {
        senderRiskScore += entry.score;
      }
      patterns.push(entry.label);
    }
  }

  return {
    score: Math.min(MAX_SCORE, totalScore),
    senderRiskScore: Math.min(MAX_SCORE, senderRiskScore),
    patterns,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 敬語レベル検出
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 丁寧語のパターン */
const POLITE_PATTERNS = /(?:です[。か？]?|ます[。か？]?|ました|でしょう|ございます|いたします|くださ[いる])/;
/** フォーマル敬語のパターン（尊敬語・謙譲語） */
const FORMAL_PATTERNS = /(?:いらっしゃ|おっしゃ|なさ[いる]|申し|存じ|拝[見読]|ご[連確報]|お[伝願申目])/;
/** カジュアルの指標（文末） */
const CASUAL_ENDINGS = /(?:だよ[ね。]?|だね|じゃん|だろ[う]?|だけど|なんだ|ってば|よね|でしょ[。]?|じゃない[？?]|だわ|かな[。]?|っけ|だぜ|だな[あぁ]?|やん|ねえ|さあ|っす|すよ)$/;

/**
 * 単一メッセージの敬語レベルを判定する。
 */
export function classifyKeigoLevel(message: string): KeigoLevel {
  const trimmed = message.trim();
  if (!trimmed) return "casual";

  // フォーマル > ポライト > カジュアル の優先度
  if (FORMAL_PATTERNS.test(trimmed)) return "formal";
  if (POLITE_PATTERNS.test(trimmed)) return "polite";
  if (CASUAL_ENDINGS.test(trimmed)) return "casual";

  // デフォルト: 短文で判定できない場合はカジュアル
  return "casual";
}

/**
 * 敬語レベルを数値化する（シフト計算用）。
 */
function keigoToNumeric(level: KeigoLevel): number {
  switch (level) {
    case "casual": return 0;
    case "polite": return 1;
    case "formal": return 2;
  }
}

/**
 * 直近の会話履歴から敬語シフトを検出する。
 *
 * baseline: 直近20メッセージの平均敬語レベル
 * current: 最新メッセージの敬語レベル
 *
 * 急にですます調 → distance_increase（距離を取り始めた）
 * 急にタメ口 → intimacy_increase（親密度の上昇）
 */
export function detectKeigoShift(
  recentMessages: ConversationTurn[],
  targetUserId: string,
): KeigoShiftSignal {
  const none: KeigoShiftSignal = {
    detected: false,
    baseline: "casual",
    current: "casual",
    direction: "none",
    magnitude: 0,
  };

  // 対象ユーザーのメッセージだけ抽出
  const userMessages = recentMessages.filter(m => m.senderId === targetUserId);
  if (userMessages.length < 3) return none; // データ不足

  const latest = userMessages[userMessages.length - 1];
  const currentLevel = classifyKeigoLevel(latest.body);

  // baseline: 最新を除く直近20件の平均
  const baselineMessages = userMessages.slice(-21, -1);
  if (baselineMessages.length < 2) return none;

  const baselineSum = baselineMessages.reduce(
    (sum, m) => sum + keigoToNumeric(classifyKeigoLevel(m.body)),
    0,
  );
  const baselineAvg = baselineSum / baselineMessages.length;

  // 平均を最も近いレベルにマップ
  const baselineLevel: KeigoLevel =
    baselineAvg < 0.5 ? "casual" :
    baselineAvg < 1.5 ? "polite" :
    "formal";

  const currentNumeric = keigoToNumeric(currentLevel);
  const shift = currentNumeric - baselineAvg;
  const absMagnitude = Math.abs(shift) / 2; // 0-1 にスケール

  // 閾値: 0.4以上のシフトで検出
  if (absMagnitude < 0.4) return { ...none, baseline: baselineLevel, current: currentLevel };

  return {
    detected: true,
    baseline: baselineLevel,
    current: currentLevel,
    direction: shift > 0 ? "distance_increase" : "intimacy_increase",
    magnitude: Math.min(1, absMagnitude),
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 話題の繊細さ判定
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 繊細な話題のパターンと重み */
const SENSITIVE_TOPIC_PATTERNS: Array<{ pattern: RegExp; weight: number; topic: string }> = [
  // 関係性・恋愛 (重い)
  { pattern: /(?:別れ|付き合|浮気|嫉妬|束縛|好き[？?]|嫌い[？?]|冷め)/, weight: 2.5, topic: "relationship" },
  // 将来・進路
  { pattern: /(?:結婚|離婚|子ども|転職|退職|引っ越|将来|夢|目標)/, weight: 2.0, topic: "future" },
  // 金銭
  { pattern: /(?:お金|金額|借り|返[すし]|高い|安い|給料|年収|貯金)/, weight: 2.0, topic: "money" },
  // 家族
  { pattern: /(?:親|母|父|兄弟|姉妹|家族|実家|義[母父])/, weight: 1.5, topic: "family" },
  // 健康・心理
  { pattern: /(?:病[気院]|体調|鬱|うつ|不安|死|自[傷殺]|薬|通院)/, weight: 2.5, topic: "health" },
  // 外見
  { pattern: /(?:太[っり]|痩せ|ブス|かわい[くい]|かっこ[いよ]|身長|体重|容姿)/, weight: 1.8, topic: "appearance" },
];

/**
 * メッセージの話題の繊細さを判定する。
 * @returns 0.5（日常的話題）〜 3.0（極めて繊細）
 */
export function computeTopicWeight(message: string): number {
  const BASE = 0.5;
  const MAX = 3.0;
  let maxWeight = 0;

  for (const { pattern, weight } of SENSITIVE_TOPIC_PATTERNS) {
    if (pattern.test(message)) {
      maxWeight = Math.max(maxWeight, weight);
    }
  }

  return Math.min(MAX, BASE + maxWeight * 0.8);
}
