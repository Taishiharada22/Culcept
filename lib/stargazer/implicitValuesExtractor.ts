// lib/stargazer/implicitValuesExtractor.ts
// 暗黙の価値観抽出 — 選択パターンから価値観の優先順位を導出する
// 心理学的根拠: Schwartz（価値観理論）、ACT（価値に基づく行動）、
// Rokeach（目的価値と手段価値）

import type { TraitAxisKey } from "./traitAxes";
import { TRAIT_AXES } from "./traitAxes";

// ── Types ──

export interface ImplicitValue {
  /** 価値観の名前 */
  name: string;
  /** 価値観の説明 */
  description: string;
  /** 確信度 (0-1) */
  confidence: number;
  /** この価値観が最も強く現れる場面 */
  manifestation: string;
  /** この価値観が脅かされた時の反応 */
  whenThreatened: string;
  /** この価値観を支えている軸 */
  supportingAxes: { axis: TraitAxisKey; contribution: number }[];
  /** Schwartz の価値観カテゴリ */
  schwartzCategory: SchwartzCategory;
}

export type SchwartzCategory =
  | "self_direction"    // 自律
  | "stimulation"       // 刺激
  | "hedonism"          // 快楽
  | "achievement"       // 達成
  | "power"             // 力
  | "security"          // 安全
  | "conformity"        // 従順
  | "tradition"         // 伝統
  | "benevolence"       // 慈善
  | "universalism";     // 普遍

export interface ValueConflict {
  /** 対立する価値観A */
  valueA: string;
  /** 対立する価値観B */
  valueB: string;
  /** 対立の説明 */
  description: string;
  /** 統合のヒント */
  integrationHint: string;
}

export interface ImplicitValuesResult {
  /** 価値観の優先順位（上位から） */
  values: ImplicitValue[];
  /** 価値観の対立 */
  conflicts: ValueConflict[];
  /** 全体サマリー */
  summary: string;
  /** 人生の中心テーマ */
  coreTheme: string;
  /** 目的価値 vs 手段価値 */
  terminalVsInstrumental: string;
}

// ── Value Patterns ──

interface ValuePattern {
  name: string;
  schwartzCategory: SchwartzCategory;
  description: string;
  manifestation: string;
  whenThreatened: string;
  /** 軸とその重み（正=右寄りで強化、負=左寄りで強化） */
  weights: Partial<Record<TraitAxisKey, number>>;
  /** 最低限必要なスコアの絶対値合計 */
  minTotalSignal: number;
}

const VALUE_PATTERNS: ValuePattern[] = [
  {
    name: "自由",
    schwartzCategory: "self_direction",
    description: "自分の判断で生きること。誰にも制約されない状態を最も大切にしている。",
    manifestation: "選択肢があると安心し、選択肢がないと窮屈さを感じる。ルールや制約に対して敏感。",
    whenThreatened: "束縛されると反発する。小さなルールでも「なぜこれに従わないといけないのか」と問いたくなる。",
    weights: {
      independence_vs_harmony: -1,
      plan_vs_spontaneous: 0.7,
      change_embrace_vs_resist: -0.6,
      cautious_vs_bold: 0.4,
    },
    minTotalSignal: 0.8,
  },
  {
    name: "安全",
    schwartzCategory: "security",
    description: "予測可能で安定した環境。危険から守られている感覚を最も大切にしている。",
    manifestation: "新しい環境ではまず安全を確認する。リスクを取る前に退路を確保する。",
    whenThreatened: "不確実性に直面すると強い不安を感じる。最悪のシナリオを先に考える傾向が強まる。",
    weights: {
      change_embrace_vs_resist: 1,
      cautious_vs_bold: -1,
      plan_vs_spontaneous: -0.7,
      emotional_regulation: 0.5,
    },
    minTotalSignal: 0.8,
  },
  {
    name: "繋がり",
    schwartzCategory: "benevolence",
    description: "人との深い繋がりを持つこと。孤立ではなく、誰かと共にあることを最も大切にしている。",
    manifestation: "一人の時間が長すぎると不安になる。人間関係の質が人生の質と直結している。",
    whenThreatened: "孤立を感じると、自分の存在価値に疑問を持ち始める。「自分は必要とされているか」と確認したくなる。",
    weights: {
      independence_vs_harmony: 1,
      introvert_vs_extrovert: 0.6,
      reassurance_need: 0.7,
      social_initiative: 0.5,
    },
    minTotalSignal: 0.8,
  },
  {
    name: "成長",
    schwartzCategory: "stimulation",
    description: "常に変化し、より良い自分になること。停滞は死と同じ。",
    manifestation: "新しいことを学ぶとエネルギーが湧く。同じことの繰り返しに耐えられない。",
    whenThreatened: "マンネリを感じると焦る。「このままでいいのか」という問いが頭から離れなくなる。",
    weights: {
      change_embrace_vs_resist: -1,
      tradition_vs_novelty: 0.8,
      cautious_vs_bold: 0.5,
      quality_vs_quantity: -0.4,
    },
    minTotalSignal: 0.7,
  },
  {
    name: "誠実さ",
    schwartzCategory: "conformity",
    description: "嘘がない状態。自分にも他者にも正直であることを最も大切にしている。",
    manifestation: "表と裏を使い分けることに居心地の悪さを感じる。本音と建前のギャップが小さい。",
    whenThreatened: "嘘を強いられる状況では強いストレスを感じる。「本当はこう思っている」を飲み込むことが苦痛。",
    weights: {
      direct_vs_diplomatic: -1,
      public_private_gap: -0.8,
      independence_vs_harmony: -0.5,
    },
    minTotalSignal: 0.7,
  },
  {
    name: "調和",
    schwartzCategory: "benevolence",
    description: "争いがなく、全員が穏やかでいられる状態。場の平和を守ることを最も大切にしている。",
    manifestation: "意見の対立を見ると不安になる。自分が仲裁者の役割を引き受けがち。",
    whenThreatened: "争いが起きると、自分が原因ではなくても責任を感じる。対立を避けるために自分の意見を後回しにする。",
    weights: {
      independence_vs_harmony: 1,
      direct_vs_diplomatic: 1,
      emotional_regulation: 0.5,
      boundary_awareness: -0.3,
    },
    minTotalSignal: 0.8,
  },
  {
    name: "卓越",
    schwartzCategory: "achievement",
    description: "高い基準を達成すること。平凡ではなく、際立つ存在であることを最も大切にしている。",
    manifestation: "「普通」と言われるとがっかりする。常に期待を上回りたいという欲求がある。",
    whenThreatened: "自分の能力が疑われると、過剰に証明しようとする。失敗を人に見せることが極端に怖い。",
    weights: {
      perfectionist_vs_pragmatic: -1,
      quality_vs_quantity: -0.8,
      cautious_vs_bold: 0.4,
    },
    minTotalSignal: 0.7,
  },
  {
    name: "貢献",
    schwartzCategory: "universalism",
    description: "誰かの役に立つこと。自分の存在が世界をわずかでも良くしていると実感すること。",
    manifestation: "人の役に立てた時に最も充実感を感じる。「ありがとう」が最高の報酬。",
    whenThreatened: "自分が役に立てていないと感じると、存在価値に疑問を持つ。「お荷物になっていないか」と不安になる。",
    weights: {
      independence_vs_harmony: 0.8,
      individual_vs_social: 0.7,
      social_initiative: 0.5,
      direct_vs_diplomatic: 0.4,
    },
    minTotalSignal: 0.7,
  },
  {
    name: "自律",
    schwartzCategory: "self_direction",
    description: "自分のことは自分で決めること。他者の判断に従うのではなく、自分の基準で生きること。",
    manifestation: "アドバイスを求められても、最終的には自分で決めないと気が済まない。権威的な指示に抵抗を感じる。",
    whenThreatened: "他者にコントロールされていると感じると、強い反発が生まれる。自分の裁量が奪われることが最大のストレス。",
    weights: {
      independence_vs_harmony: -1,
      individual_vs_social: -0.8,
      introvert_vs_extrovert: -0.4,
      control_tendency: 0.5,
    },
    minTotalSignal: 0.8,
  },
];

// ── Extraction ──

/**
 * 軸スコアから暗黙の価値観を抽出する
 */
export function extractImplicitValues(
  axisScores: Partial<Record<TraitAxisKey, number>>,
): ImplicitValuesResult | null {
  const entries = Object.entries(axisScores) as [TraitAxisKey, number][];
  if (entries.length < 5) return null;

  const detected: ImplicitValue[] = [];

  for (const pattern of VALUE_PATTERNS) {
    let totalSignal = 0;
    let maxPossible = 0;
    const supportingAxes: ImplicitValue["supportingAxes"] = [];

    for (const [axis, weight] of Object.entries(pattern.weights) as [TraitAxisKey, number][]) {
      const score = axisScores[axis];
      maxPossible += Math.abs(weight);
      if (score === undefined) continue;

      // weight > 0 means: score should be positive (right side)
      // weight < 0 means: score should be negative (left side)
      const contribution = score * weight;
      if (contribution > 0) {
        totalSignal += contribution;
        supportingAxes.push({ axis, contribution });
      }
    }

    if (maxPossible === 0) continue;
    const confidence = totalSignal / maxPossible;

    if (totalSignal >= pattern.minTotalSignal * 0.6 && confidence >= 0.25) {
      detected.push({
        name: pattern.name,
        description: pattern.description,
        confidence: Math.min(1, confidence),
        manifestation: pattern.manifestation,
        whenThreatened: pattern.whenThreatened,
        supportingAxes: supportingAxes.sort((a, b) => b.contribution - a.contribution),
        schwartzCategory: pattern.schwartzCategory,
      });
    }
  }

  if (detected.length === 0) return null;

  // Sort by confidence
  detected.sort((a, b) => b.confidence - a.confidence);

  // Detect value conflicts (opposing Schwartz categories)
  const conflicts: ValueConflict[] = [];
  const opposingPairs: [SchwartzCategory, SchwartzCategory, string, string][] = [
    ["self_direction", "conformity", "自由を求めながらも、ルールに従いたい自分がいる。", "全てのルールを破る必要はない。「自分で選んだルール」と「押し付けられたルール」を区別する。"],
    ["self_direction", "security", "新しい挑戦をしたいのに、安全も手放せない。", "安全な場所を「基地」にして、そこから少しずつ冒険の範囲を広げていく。"],
    ["stimulation", "security", "変化を求めながらも、安定が欲しい。", "変化と安定は交互に訪れるもの。「安定のフェーズ」と「挑戦のフェーズ」を意識的に分ける。"],
    ["achievement", "benevolence", "成果を出したいのに、人との調和も大切にしたい。", "成果を出すことが人のためになるなら、両方を同時に満たせる。「誰のための卓越か」を問い直す。"],
    ["power", "universalism", "自分の力を示したいのに、公平でありたい。", "力は支配のためではなく、公平さを実現するために使える。リーダーシップの再定義。"],
  ];

  for (const [catA, catB, desc, hint] of opposingPairs) {
    const valA = detected.find((v) => v.schwartzCategory === catA);
    const valB = detected.find((v) => v.schwartzCategory === catB);
    if (valA && valB && valA.confidence > 0.3 && valB.confidence > 0.3) {
      conflicts.push({
        valueA: valA.name,
        valueB: valB.name,
        description: desc,
        integrationHint: hint,
      });
    }
  }

  // Core theme
  const top2 = detected.slice(0, 2);
  const coreTheme = top2.length >= 2
    ? `あなたの人生の中心テーマは「${top2[0].name}」と「${top2[1].name}」。この二つが交差する場所に、あなたが最も「生きている」と感じる瞬間がある。`
    : `あなたの人生の中心テーマは「${top2[0].name}」。この価値観があなたの全ての判断の土台にある。`;

  // Terminal vs Instrumental
  const terminalValues = ["自由", "安全", "繋がり", "調和", "貢献"];
  const instrumentalValues = ["成長", "誠実さ", "卓越", "自律"];
  const topTerminal = detected.find((v) => terminalValues.includes(v.name));
  const topInstrumental = detected.find((v) => instrumentalValues.includes(v.name));

  let terminalVsInstrumental: string;
  if (topTerminal && topInstrumental) {
    terminalVsInstrumental = `あなたの究極の目的は「${topTerminal.name}」を実現すること。そのために「${topInstrumental.name}」を手段として使っている。目的と手段が入れ替わっていないか、時々確認してみると良い。`;
  } else if (topTerminal) {
    terminalVsInstrumental = `あなたの行動の原動力は「${topTerminal.name}」という目的価値。全ての選択がこの価値に向かっている。`;
  } else {
    terminalVsInstrumental = `あなたは手段的な価値（どう生きるか）を大切にするタイプ。プロセスそのものに意味を見出している。`;
  }

  const valueList = detected.slice(0, 3).map((v) => `「${v.name}」`).join("、");
  const summary = `あなたの選択パターンから、${valueList}が暗黙の価値観として浮かび上がった。これらはアンケートで答えた「大切なもの」ではなく、実際の判断の中で無意識に優先しているもの。`;

  return {
    values: detected,
    conflicts,
    summary,
    coreTheme,
    terminalVsInstrumental,
  };
}
