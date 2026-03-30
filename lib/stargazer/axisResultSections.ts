// lib/stargazer/axisResultSections.ts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 45軸スコアから6つの結果セクションを生成するユーティリティ
// 星座タイプ表示に代わる、軸ベースの結果ビュー用データ構造
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import {
  type TraitAxisKey,
  type AxisCategory,
  TRAIT_AXES,
  TRAIT_AXIS_KEYS,
} from "./traitAxes";
import {
  type ReactionTypeCode,
  REACTION_TYPES,
  getReactionType,
} from "./reactionTypes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** confidence がこの値未満の軸は「まだ十分に観測できていません」扱い */
const LOW_CONFIDENCE_THRESHOLD = 0.15;

/** confidence がこの値未満の場合、解釈テキストに注記を追加 */
const WEAK_CONFIDENCE_THRESHOLD = 0.2;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// -- Section 1: Overall Summary --

export interface OverallSummary {
  /** 2-3文の全体サマリ */
  summaryText: string;
  /** もっとも支配的なカテゴリ */
  dominantCategory: string;
  /** 上位の特徴ラベル (3-5個) */
  keyTraits: string[];
}

// -- Section 2: Behavioral Tendencies --

export interface AxisEntry {
  key: TraitAxisKey;
  label: string;
  score: number;
  confidence: number;
  description: string;
  isLowConfidence: boolean;
}

export interface AxisCluster {
  clusterName: string;
  clusterKey: string;
  axes: AxisEntry[];
}

// -- Section 3: Cognitive Style --

export interface CognitiveAxisEntry {
  key: TraitAxisKey;
  leftLabel: string;
  rightLabel: string;
  score: number;
  interpretation: string;
}

export interface CognitiveStyleResult {
  axes: CognitiveAxisEntry[];
  profileSummary: string;
}

// -- Section 4: Deep Psychology --

export interface DeepDimension {
  key: TraitAxisKey;
  displayName: string;
  score: number;
  confidence: number;
  interpretation: string;
  isLowConfidence: boolean;
}

export interface DeepPsychologyResult {
  dimensions: DeepDimension[];
}

// -- Section 5: Relational Style --

export interface RelationalDimension {
  key: TraitAxisKey;
  displayName: string;
  score: number;
  confidence: number;
  interpretation: string;
  isLowConfidence: boolean;
}

export interface RelationalStyleResult {
  dimensions: RelationalDimension[];
}

// -- Section 6: Reaction Type Detail --

export interface ReactionIndicator {
  key: TraitAxisKey;
  label: string;
  score: number;
  /** この軸がタイプ判定にどれだけ寄与したか (0-1) */
  contribution: number;
}

export interface ReactionTypeDetail {
  code: ReactionTypeCode;
  name: string;
  emoji: string;
  description: string;
  indicatorAxes: ReactionIndicator[];
  confidenceNote: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getAxisDef(key: TraitAxisKey) {
  return TRAIT_AXES.find((a) => a.id === key);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helper: Axis Interpretation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 1軸のスコアと確信度から、日本語の1行解釈を返す。
 *
 * - |score| > 0.6 : 強い傾向
 * - |score| 0.3-0.6 : 中程度の傾向
 * - |score| < 0.3 : 状況により揺れる
 * - confidence < 0.15 : 「まだ十分に観測できていません」
 * - confidence < 0.2 : 末尾に注記追加
 */
export function interpretAxisScore(
  key: TraitAxisKey,
  score: number,
  confidence: number,
): string {
  if (confidence < LOW_CONFIDENCE_THRESHOLD) {
    return "まだ十分に観測できていません";
  }

  const def = getAxisDef(key);
  if (!def) return "";

  const abs = Math.abs(score);
  const isLeft = score < 0;
  const pole = isLeft ? def.labelLeft : def.labelRight;

  let text: string;

  if (abs > 0.6) {
    text = `${pole}の傾向がはっきり出ています`;
  } else if (abs > 0.3) {
    text = `どちらかというと「${pole}」寄りの傾向があります`;
  } else {
    text = `「${def.labelLeft}」と「${def.labelRight}」の間で、状況により揺れる傾向があります`;
  }

  if (confidence < WEAK_CONFIDENCE_THRESHOLD) {
    text += "（観測が少なく、今後変わる可能性があります）";
  }

  return text;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Section 1: Overall Summary
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const CATEGORY_DISPLAY_NAMES: Record<string, string> = {
  core: "行動原理",
  relational: "対人スタイル",
  emotional: "感情パターン",
  motion: "行動スタイル",
  aesthetic: "美意識",
  safety: "安全性指標",
  relational_deep: "深層関係性",
  depth: "深層心理",
  cognitive: "認知スタイル",
};

/**
 * 45軸スコアから全体サマリを生成する。
 * 上位の明確な傾向をピックアップし、2-3文でまとめる。
 */
export function generateOverallSummary(
  axisScores: Record<TraitAxisKey, number>,
  axisConfidences: Record<TraitAxisKey, number>,
): OverallSummary {
  // 確信度 >= LOW_CONFIDENCE_THRESHOLD かつ |score| が大きい軸を抽出
  const ranked = TRAIT_AXIS_KEYS
    .filter((k) => (axisConfidences[k] ?? 0) >= LOW_CONFIDENCE_THRESHOLD)
    .map((k) => ({
      key: k,
      score: axisScores[k] ?? 0,
      absScore: Math.abs(axisScores[k] ?? 0),
      confidence: axisConfidences[k] ?? 0,
      def: getAxisDef(k)!,
    }))
    .filter((e) => e.def && e.absScore > 0.25)
    .sort((a, b) => b.absScore - a.absScore);

  // カテゴリ別の出現頻度
  const categoryCount: Record<string, number> = {};
  for (const entry of ranked) {
    const cat = entry.def.category;
    categoryCount[cat] = (categoryCount[cat] ?? 0) + 1;
  }

  const dominantCategory =
    Object.entries(categoryCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "core";

  // 上位5軸をキートレイトに
  const topEntries = ranked.slice(0, 5);
  const keyTraits = topEntries.map((e) => {
    const pole = e.score < 0 ? e.def.labelLeft : e.def.labelRight;
    return pole;
  });

  // サマリテキスト生成
  const summaryText = buildSummaryText(topEntries, dominantCategory);

  return {
    summaryText,
    dominantCategory: CATEGORY_DISPLAY_NAMES[dominantCategory] ?? dominantCategory,
    keyTraits,
  };
}

interface RankedEntry {
  key: TraitAxisKey;
  score: number;
  absScore: number;
  confidence: number;
  def: { id: TraitAxisKey; labelLeft: string; labelRight: string; category: AxisCategory };
}

function buildSummaryText(
  topEntries: RankedEntry[],
  dominantCategory: string,
): string {
  if (topEntries.length === 0) {
    return "まだ観測データが少なく、全体像を描くには時間が必要です。観測を重ねるほど、あなたの傾向が見えてきます。";
  }

  const traitPhrases = topEntries.slice(0, 3).map((e) => {
    const pole = e.score < 0 ? e.def.labelLeft : e.def.labelRight;
    return `「${pole}」`;
  });

  const catName = CATEGORY_DISPLAY_NAMES[dominantCategory] ?? "全般";

  const firstSentence =
    traitPhrases.length >= 3
      ? `${traitPhrases[0]}${traitPhrases[1]}${traitPhrases[2]}が、あなたの中で特に際立っている傾向です。`
      : traitPhrases.length === 2
        ? `${traitPhrases[0]}と${traitPhrases[1]}が、あなたの中で際立っています。`
        : `${traitPhrases[0]}が、もっとも強く観測された傾向です。`;

  const secondSentence = `全体として${catName}の領域に特徴が集中しており、ここがあなたの判断や行動に大きく影響しています。`;

  return `${firstSentence}${secondSentence}`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Section 2: Behavioral Tendencies (行動傾向)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 4クラスタとそれぞれに属する軸の定義 */
const CLUSTER_DEFINITIONS: {
  clusterName: string;
  clusterKey: string;
  axisKeys: TraitAxisKey[];
}[] = [
  {
    clusterName: "行動傾向",
    clusterKey: "action",
    axisKeys: [
      "introvert_vs_extrovert",
      "cautious_vs_bold",
      "plan_vs_spontaneous",
      "change_embrace_vs_resist",
      "function_vs_expression",
      "minimal_vs_maximal",
      "perfectionist_vs_pragmatic",
      "tradition_vs_novelty",
    ],
  },
  {
    clusterName: "感情傾向",
    clusterKey: "emotion",
    axisKeys: [
      "emotional_variability",
      "emotional_regulation",
      "stress_isolation_vs_social",
      "rumination_tendency",
      "shame_vs_guilt",
      "attachment_style",
    ],
  },
  {
    clusterName: "対人傾向",
    clusterKey: "interpersonal",
    axisKeys: [
      "independence_vs_harmony",
      "direct_vs_diplomatic",
      "individual_vs_social",
      "intimacy_pace",
      "reassurance_need",
      "social_initiative",
      "boundary_awareness",
      "relationship_mode_split",
      "public_private_gap",
      "fairness_sensitivity",
      "friend_mode_fit",
    ],
  },
  {
    clusterName: "美意識・価値観",
    clusterKey: "aesthetic",
    axisKeys: [
      "quality_vs_quantity",
      "classic_vs_trendy",
    ],
  },
  {
    clusterName: "認知傾向",
    clusterKey: "cognitive",
    axisKeys: [
      "analytical_vs_intuitive",
      "abstract_structuring",
      "decomposition",
      "cognitive_updating",
      "decision_tempo",
      "social_modeling",
      "exploration_closure",
    ],
  },
];

/**
 * 45軸を4クラスタにグループ化して返す。
 * 各軸にスコア、確信度、1行解釈を付与。
 */
export function deriveBehavioralTendencies(
  axisScores: Record<TraitAxisKey, number>,
  axisConfidences: Record<TraitAxisKey, number>,
): AxisCluster[] {
  return CLUSTER_DEFINITIONS.map((cluster) => {
    const axes: AxisEntry[] = cluster.axisKeys
      .map((key) => {
        const def = getAxisDef(key);
        if (!def) return null;

        const score = axisScores[key] ?? 0;
        const confidence = axisConfidences[key] ?? 0;
        const isLowConfidence = confidence < LOW_CONFIDENCE_THRESHOLD;

        return {
          key,
          label: `${def.labelLeft} / ${def.labelRight}`,
          score,
          confidence,
          description: interpretAxisScore(key, score, confidence),
          isLowConfidence,
        };
      })
      .filter((e): e is AxisEntry => e !== null);

    return {
      clusterName: cluster.clusterName,
      clusterKey: cluster.clusterKey,
      axes,
    };
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Section 3: Cognitive Style (認知スタイル)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const COGNITIVE_AXIS_KEYS: TraitAxisKey[] = [
  "abstract_structuring",
  "decomposition",
  "cognitive_updating",
  "decision_tempo",
  "social_modeling",
  "exploration_closure",
];

/** 認知軸ごとの解釈テンプレート (left寄り / right寄り) */
const COGNITIVE_INTERPRETATIONS: Record<
  string,
  { left: string; right: string; center: string }
> = {
  abstract_structuring: {
    left: "具体的な事実から積み上げて理解するタイプ",
    right: "抽象的な構造で全体を掴むタイプ",
    center: "具体と抽象を行き来して考えるタイプ",
  },
  decomposition: {
    left: "全体像を一気に捉えて判断するタイプ",
    right: "問題を分解して順番に解決するタイプ",
    center: "全体と部分を状況に応じて切り替えられるタイプ",
  },
  cognitive_updating: {
    left: "一度決めた判断を粘り強く維持するタイプ",
    right: "新しい情報で柔軟に判断を更新するタイプ",
    center: "信念と柔軟さのバランスが取れたタイプ",
  },
  decision_tempo: {
    left: "素早く決断して動き出すタイプ",
    right: "じっくり考えてから動くタイプ",
    center: "状況に応じて即断と熟考を使い分けるタイプ",
  },
  social_modeling: {
    left: "相手の行動を観察して理解するタイプ",
    right: "相手の意図や背景から理解するタイプ",
    center: "行動と意図の両面から人を読むタイプ",
  },
  exploration_closure: {
    left: "多くの可能性を広く探索するタイプ",
    right: "素早く選択肢を絞り込むタイプ",
    center: "探索と収束のタイミングを見極められるタイプ",
  },
};

/**
 * 認知スタイル6軸のレーダーチャート用データ + プロフィールサマリを返す。
 */
export function deriveCognitiveStyle(
  axisScores: Record<TraitAxisKey, number>,
): CognitiveStyleResult {
  const axes: CognitiveAxisEntry[] = COGNITIVE_AXIS_KEYS.map((key) => {
    const def = getAxisDef(key)!;
    const score = axisScores[key] ?? 0;
    const interp = COGNITIVE_INTERPRETATIONS[key];

    let interpretation: string;
    if (!interp) {
      interpretation = interpretAxisScore(key, score, 1);
    } else if (score < -0.3) {
      interpretation = interp.left;
    } else if (score > 0.3) {
      interpretation = interp.right;
    } else {
      interpretation = interp.center;
    }

    return {
      key,
      leftLabel: def.labelLeft,
      rightLabel: def.labelRight,
      score,
      interpretation,
    };
  });

  // プロフィールサマリ: はっきり出ている上位2-3軸を自然文に
  const prominent = axes
    .filter((a) => Math.abs(a.score) > 0.25)
    .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
    .slice(0, 3);

  let profileSummary: string;
  if (prominent.length === 0) {
    profileSummary =
      "認知スタイルは全体的にバランスが取れており、状況に応じて柔軟に切り替えられる傾向があります。";
  } else {
    const labels = prominent.map((a) => a.interpretation);
    profileSummary =
      labels.length === 1
        ? `${labels[0]}。この認知傾向があなたの判断に大きく影響しています。`
        : `${labels.slice(0, -1).join("。")}。そして${labels[labels.length - 1]}。これらが組み合わさった認知スタイルが、あなたの判断を形作っています。`;
  }

  return { axes, profileSummary };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Section 4: Deep Psychology (深層プロフィール)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const DEEP_PSYCHOLOGY_AXES: {
  key: TraitAxisKey;
  displayName: string;
  interpretations: { left: string; right: string; center: string };
}[] = [
  {
    key: "attachment_style",
    displayName: "愛着スタイル",
    interpretations: {
      left: "距離を取ることで安全を確保する傾向があります。深い関係に踏み込むことに慎重で、自分の領域を守ろうとします。",
      right: "近さを求め、相手からの応答がないと不安を感じやすい傾向があります。つながりの確認が安心の源になっています。",
      center: "安定した愛着パターンを示しており、距離感のバランスが取れています。",
    },
  },
  {
    key: "locus_of_control",
    displayName: "統制の所在",
    interpretations: {
      left: "物事の結果は自分の行動次第だと感じる傾向が強いです。自分でコントロールできるという感覚が行動の原動力になっています。",
      right: "環境や運、他者の影響が大きいと感じる傾向があります。流れに身を任せる柔軟さがある一方で、無力感を覚えることもあるかもしれません。",
      center: "自分の力と外部の影響のバランスを取りながら判断しています。",
    },
  },
  {
    key: "growth_mindset",
    displayName: "成長観",
    interpretations: {
      left: "人は努力と経験で変われるという信念が強いです。困難を成長の機会として捉える傾向があります。",
      right: "能力や性格は生まれつきの部分が大きいと感じる傾向があります。自分の得意分野を活かす方向に力を注ぎます。",
      center: "変われる部分と変わりにくい部分の両方を認識しており、現実的な成長観を持っています。",
    },
  },
  {
    key: "shame_vs_guilt",
    displayName: "恥と罪悪感",
    interpretations: {
      left: "失敗したとき、「自分自身がダメだ」と感じやすい傾向があります。自己全体への評価と結びつきやすく、回復に時間がかかることがあります。",
      right: "失敗したとき、「あの行動が悪かった」と行為に焦点を当てる傾向があります。具体的な改善につなげやすい思考パターンです。",
      center: "状況に応じて自己評価と行為評価を切り替えられる柔軟さがあります。",
    },
  },
  {
    key: "rumination_tendency",
    displayName: "反芻傾向",
    interpretations: {
      left: "嫌な出来事からの切り替えが早い傾向があります。過去に囚われず前を向ける強みがある一方で、振り返りが浅くなることもあります。",
      right: "出来事を何度も頭の中で繰り返す傾向があります。深く考える力の裏返しですが、切り替えが難しいと感じることもあるかもしれません。",
      center: "適度に振り返りつつも、前に進める切り替えのバランスが取れています。",
    },
  },
  {
    key: "fairness_sensitivity",
    displayName: "公正さへの感度",
    interpretations: {
      left: "自分が多く受け取ることへの不安が強い傾向があります。「もらいすぎていないか」という気持ちが行動の抑制につながることがあります。",
      right: "不公平な状況に対する感度が高い傾向があります。理不尽な扱いに対して強い反応が出やすく、正義感の源泉にもなっています。",
      center: "公正さへの感度はバランスが取れており、状況に応じて柔軟に判断できます。",
    },
  },
];

/**
 * 深層心理6軸の解釈付きデータを返す。
 */
export function deriveDeepPsychology(
  axisScores: Record<TraitAxisKey, number>,
  axisConfidences: Record<TraitAxisKey, number>,
): DeepPsychologyResult {
  const dimensions: DeepDimension[] = DEEP_PSYCHOLOGY_AXES.map((entry) => {
    const score = axisScores[entry.key] ?? 0;
    const confidence = axisConfidences[entry.key] ?? 0;
    const isLowConfidence = confidence < LOW_CONFIDENCE_THRESHOLD;

    let interpretation: string;
    if (isLowConfidence) {
      interpretation = "まだ十分に観測できていません";
    } else if (score < -0.3) {
      interpretation = entry.interpretations.left;
    } else if (score > 0.3) {
      interpretation = entry.interpretations.right;
    } else {
      interpretation = entry.interpretations.center;
    }

    if (!isLowConfidence && confidence < WEAK_CONFIDENCE_THRESHOLD) {
      interpretation += "（観測が少なく、今後変わる可能性があります）";
    }

    return {
      key: entry.key,
      displayName: entry.displayName,
      score,
      confidence,
      interpretation,
      isLowConfidence,
    };
  });

  return { dimensions };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Section 5: Relational Style (関係性スタイル)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 安全性に関わる軸 (低確信度では「観測中」表示) */
/** 安全性に関わる軸: 社会的望ましさバイアスが強いため厳しめの閾値を適用 */
const SAFETY_AXIS_KEYS = new Set<TraitAxisKey>([
  "pressure_risk",
  "escalation_risk",
  "exclusivity_pressure",
  "boundary_respect",
  "consent_maturity",
  "control_tendency",
  "long_term_shift_risk",
] as const);

const RELATIONAL_AXES: {
  key: TraitAxisKey;
  displayName: string;
  interpretations: { left: string; right: string; center: string };
}[] = [
  {
    key: "intimacy_pace",
    displayName: "距離の縮め方",
    interpretations: {
      left: "時間をかけて少しずつ距離を縮めるタイプです。信頼の積み重ねを大切にします。",
      right: "距離を早く縮めたい傾向があります。つながりの実感を早い段階で求めます。",
      center: "距離の縮め方は相手や状況に応じて自然に調整できます。",
    },
  },
  {
    key: "boundary_awareness",
    displayName: "境界線の意識",
    interpretations: {
      left: "境界線を柔軟に扱い、相手との融合を自然に受け入れる傾向があります。",
      right: "自分と相手の境界線を明確に意識します。相手の領域も自分の領域も尊重します。",
      center: "境界線の引き方はバランスが取れており、柔軟に調整できます。",
    },
  },
  {
    key: "social_initiative",
    displayName: "関係構築の主導性",
    interpretations: {
      left: "相手からのアプローチを待つことが多いタイプです。受動的ですが、来るものは受け入れます。",
      right: "自分から積極的に距離を縮めていくタイプです。関係の構築を主導する力があります。",
      center: "状況に応じて待つことも自分から動くこともでき、自然な距離感を作れます。",
    },
  },
  {
    key: "relationship_mode_split",
    displayName: "関係モードの切り替え",
    interpretations: {
      left: "どんな関係でも自分のスタイルが一貫しています。裏表のなさが信頼につながります。",
      right: "関係性の文脈によってモードが大きく変わります。適応力が高い一方で、「本当の自分はどれ？」と感じることもあるかもしれません。",
      center: "関係によって多少変化しつつも、核の部分は一貫しています。",
    },
  },
  {
    key: "public_private_gap",
    displayName: "表と裏のギャップ",
    interpretations: {
      left: "外に見せる自分と内面がほぼ一致しています。表裏のない自然体です。",
      right: "外に見せる顔と内面にギャップがあります。場に合わせる力がある一方で、本音を出せる場所が限られるかもしれません。",
      center: "表と裏のバランスが取れており、場面に応じた自然な使い分けができます。",
    },
  },
  {
    key: "pressure_risk",
    displayName: "圧力リスク",
    interpretations: {
      left: "相手に圧をかけることが少なく、自然な距離感で関係を築けます。",
      right: "意図せず相手に圧を与えてしまうことがあるかもしれません。自分の要求の強さに気づくことが改善の第一歩です。",
      center: "圧力のかけ方に大きな偏りは見られません。",
    },
  },
  {
    key: "escalation_risk",
    displayName: "段階的変化の安定性",
    interpretations: {
      left: "関係の変化が段階的で安定しています。急激なエスカレーションが起きにくい傾向です。",
      right: "感情や関係が急に加速しやすい傾向があります。自分のペースを意識的に調整する力を育てると楽になるかもしれません。",
      center: "関係の変化のペースは安定しており、大きな偏りは見られません。",
    },
  },
  {
    key: "exclusivity_pressure",
    displayName: "排他的な圧力",
    interpretations: {
      left: "相手の自由を尊重し、排他的な要求が少ない傾向です。",
      right: "相手を独占したい気持ちが出やすい傾向があります。その根底にある不安に向き合うことで、より健全な関係を築けます。",
      center: "排他性に大きな偏りは見られません。",
    },
  },
  {
    key: "boundary_respect",
    displayName: "境界線の尊重",
    interpretations: {
      left: "相手の境界線を柔軟に捉える傾向があります。距離感の調整に意識を向けると関係が安定します。",
      right: "相手の境界線をしっかり守る傾向があります。安全な関係を作る力があります。",
      center: "境界線の尊重にバランスが取れています。",
    },
  },
  {
    key: "consent_maturity",
    displayName: "合意形成の成熟度",
    interpretations: {
      left: "相手の意向を確認せず進めてしまうことがあるかもしれません。意識的な確認を習慣にすると関係が安定します。",
      right: "相手の同意を丁寧に確認する傾向があります。対等な関係を築く力があります。",
      center: "合意形成に大きな偏りは見られません。",
    },
  },
  {
    key: "intent_stability",
    displayName: "意図の安定性",
    interpretations: {
      left: "気持ちや意図が変わりやすい傾向があります。柔軟さの裏返しですが、相手に不安を与えることもあるかもしれません。",
      right: "一度決めた気持ちや約束を安定して維持できる傾向があります。信頼されやすい特性です。",
      center: "意図の安定性にバランスが取れています。",
    },
  },
  {
    key: "rejection_response_maturity",
    displayName: "拒絶への対処",
    interpretations: {
      left: "断られたとき感情的になりやすい傾向があります。その反応に気づくことが成長の第一歩です。",
      right: "断られても冷静に受け止められる傾向があります。相手の意思を尊重する力があります。",
      center: "拒絶への対処に大きな偏りは見られません。",
    },
  },
  {
    key: "control_tendency",
    displayName: "コントロール傾向",
    interpretations: {
      left: "相手の行動や判断を尊重し、任せることができる傾向があります。",
      right: "相手をコントロールしたい気持ちが出やすい傾向があります。その背景にある不安に向き合うことで改善できます。",
      center: "コントロール傾向に大きな偏りは見られません。",
    },
  },
  {
    key: "long_term_shift_risk",
    displayName: "長期的変化リスク",
    interpretations: {
      left: "関係の中で安定したパターンを維持できる傾向があります。長期的に一貫した関わり方ができます。",
      right: "関係が長くなるにつれて態度やパターンが変化しやすい傾向があります。変化の自覚があると対処しやすくなります。",
      center: "長期的な変化リスクに大きな偏りは見られません。",
    },
  },
];

/**
 * 関係性スタイルの解釈付きデータを返す。
 * 安全性軸で確信度が低い場合は「観測中」フラグを立てる。
 */
export function deriveRelationalStyle(
  axisScores: Record<TraitAxisKey, number>,
  axisConfidences: Record<TraitAxisKey, number>,
): RelationalStyleResult {
  const dimensions: RelationalDimension[] = RELATIONAL_AXES.map((entry) => {
    const score = axisScores[entry.key] ?? 0;
    const confidence = axisConfidences[entry.key] ?? 0;
    const isSafetyAxis = SAFETY_AXIS_KEYS.has(entry.key);

    // 安全性軸は通常の閾値より厳しめに判定
    const effectiveThreshold = isSafetyAxis
      ? Math.max(LOW_CONFIDENCE_THRESHOLD, 0.2)
      : LOW_CONFIDENCE_THRESHOLD;
    const isLowConfidence = confidence < effectiveThreshold;

    let interpretation: string;
    if (isLowConfidence) {
      interpretation = isSafetyAxis
        ? "この軸はまだ観測中です。十分なデータが集まるまで判定を保留しています。"
        : "まだ十分に観測できていません";
    } else if (score < -0.3) {
      interpretation = entry.interpretations.left;
    } else if (score > 0.3) {
      interpretation = entry.interpretations.right;
    } else {
      interpretation = entry.interpretations.center;
    }

    if (!isLowConfidence && confidence < WEAK_CONFIDENCE_THRESHOLD) {
      interpretation += "（観測が少なく、今後変わる可能性があります）";
    }

    return {
      key: entry.key,
      displayName: entry.displayName,
      score,
      confidence,
      interpretation,
      isLowConfidence,
    };
  });

  return { dimensions };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Section 6: Reaction Type Detail (反応タイプ詳細)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 反応タイプコードと軸スコアから、そのタイプと判定された理由を示す。
 * 各指標軸のスコアと寄与度を返す。
 */
export function deriveReactionTypeDetail(
  reactionType: ReactionTypeCode,
  axisScores: Record<TraitAxisKey, number>,
): ReactionTypeDetail {
  const typeDef = getReactionType(reactionType);
  if (!typeDef) {
    return {
      code: reactionType,
      name: reactionType,
      emoji: "",
      description: "",
      indicatorAxes: [],
      confidenceNote: "タイプ定義が見つかりませんでした",
    };
  }

  // 各指標軸の寄与度を計算
  let totalContribution = 0;
  const rawIndicators = typeDef.indicatorAxes.map((indicator) => {
    const axisValue = axisScores[indicator.key] ?? 0;
    const directionMultiplier = indicator.direction === "positive" ? 1 : -1;
    const contribution = Math.max(0, axisValue * directionMultiplier * indicator.weight);
    totalContribution += contribution;
    return { indicator, contribution };
  });

  // 正規化
  const normalizer = totalContribution > 0 ? totalContribution : 1;

  const indicatorAxes: ReactionIndicator[] = rawIndicators
    .map(({ indicator, contribution }) => {
      const def = getAxisDef(indicator.key);
      return {
        key: indicator.key,
        label: def ? `${def.labelLeft} / ${def.labelRight}` : indicator.key,
        score: axisScores[indicator.key] ?? 0,
        contribution: contribution / normalizer,
      };
    })
    .sort((a, b) => b.contribution - a.contribution);

  // 確信度の注記
  const topContribution = indicatorAxes[0]?.contribution ?? 0;
  const secondContribution = indicatorAxes[1]?.contribution ?? 0;
  const gap = topContribution - secondContribution;

  let confidenceNote: string;
  if (totalContribution < 0.1) {
    confidenceNote =
      "観測データが少なく、反応タイプの判定はまだ暫定的です。観測を重ねると精度が上がります。";
  } else if (gap < 0.1) {
    confidenceNote =
      "複数の軸が均等に影響しており、一つの明確な原因ではなく、複合的な傾向からこのタイプが導かれています。";
  } else {
    const topDef = getAxisDef(indicatorAxes[0].key);
    const topLabel = topDef
      ? `「${topDef.labelLeft} / ${topDef.labelRight}」`
      : indicatorAxes[0].key;
    confidenceNote = `${topLabel}の軸が最も強く影響しており、このタイプを形作る中核的な傾向です。`;
  }

  return {
    code: typeDef.code,
    name: typeDef.label,
    emoji: typeDef.emoji,
    description: typeDef.description,
    indicatorAxes,
    confidenceNote,
  };
}
