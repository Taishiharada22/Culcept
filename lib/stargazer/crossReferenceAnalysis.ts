// lib/stargazer/crossReferenceAnalysis.ts
// 意識的（相手タブ）回答と無意識的（日次観測）回答のギャップ分析
// 「意識的には頼れると思っているが、無意識では距離を取る傾向」のような洞察を生成

import type { TraitAxisKey } from "./traitAxes";
import type { PartnerCategory } from "./partnerTypes";
import { CATEGORY_QUESTIONS } from "./partnerCategoryQuestions";

// ── Types ──

export interface CrossReferenceResult {
  /** 意識的な観測（相手タブ）から見えた傾向 */
  conscious: CrossReferenceSignal[];
  /** 無意識的な観測（日次観測）から見えた傾向 */
  unconscious: CrossReferenceSignal[];
  /** 意識と無意識のギャップ */
  gaps: CrossReferenceGap[];
}

export interface CrossReferenceSignal {
  axis: TraitAxisKey;
  source: "partner_tab" | "daily_observation";
  score: number;
  label: string;
}

export interface CrossReferenceGap {
  axis: TraitAxisKey;
  label: string;
  consciousScore: number;
  unconsciousScore: number;
  delta: number;
  narrative: string;
}

// ── ギャップ検出のための軸-ナラティブマッピング ──

const GAP_NARRATIVES: Record<
  string, // axis key
  { positiveGap: string; negativeGap: string }
> = {
  intimacy_pace: {
    positiveGap:
      "意識的には積極的に近づきたいと思っているが、無意識では慎重になっている。",
    negativeGap:
      "意識的には距離を保ちたいと思っているが、無意識ではもっと近づきたがっている。",
  },
  reassurance_need: {
    positiveGap:
      "自覚以上に安心を求めている傾向がある。日常の場面で不安が顔を出しやすい。",
    negativeGap:
      "思っているほど確認を必要としていない。自然体では安定した人間関係を保てている。",
  },
  boundary_awareness: {
    positiveGap:
      "意識的には柔軟でいたいが、無意識では境界線を大事にしている。",
    negativeGap:
      "境界を意識しているつもりが、実際には踏み込みやすい傾向がある。",
  },
  public_private_gap: {
    positiveGap:
      "相手の前では本音を見せているつもりだが、日常では使い分けが出ている。",
    negativeGap:
      "普段は使い分けていると思っているが、実はかなりオープンに振る舞えている。",
  },
  independence_vs_harmony: {
    positiveGap:
      "関係の中では調和を重視しているが、根底では独立志向が強い。",
    negativeGap:
      "一人で動けると思っているが、実は周囲との調和を求めている。",
  },
  direct_vs_diplomatic: {
    positiveGap:
      "率直でいたいと思っているが、実際には配慮が先に来る場面が多い。",
    negativeGap:
      "配慮的でいるつもりが、無意識では率直さが出ている。",
  },
  emotional_regulation: {
    positiveGap:
      "感情をコントロールしているつもりだが、日常では感情に左右されやすい場面がある。",
    negativeGap:
      "感情的になりがちだと思っているが、実際には冷静に対処できている。",
  },
  social_initiative: {
    positiveGap:
      "関係の中では受け身だと思っているが、日常の場面では積極的に動けている。",
    negativeGap:
      "積極的だと思っているが、実際には様子を見ることが多い。",
  },
  control_tendency: {
    positiveGap:
      "相手に任せられると思っているが、無意識では主導権を握りたがっている。",
    negativeGap:
      "コントロール欲があると思っているが、実際には柔軟に委ねられている。",
  },
  relationship_mode_split: {
    positiveGap:
      "いつもの自分だと思っているが、相手によって無意識に振る舞いを変えている。",
    negativeGap:
      "使い分けていると思っているが、実はどの相手にも似たような接し方をしている。",
  },
};

// ── 分析関数 ──

/**
 * 意識的（相手タブ）と無意識的（日次観測）の回答を比較し、ギャップを検出
 */
export function analyzeCrossReference(
  partnerTabScores: Partial<Record<TraitAxisKey, number>>,
  dailyObservationScores: Partial<Record<TraitAxisKey, number>>,
  category: PartnerCategory
): CrossReferenceResult {
  const conscious: CrossReferenceSignal[] = [];
  const unconscious: CrossReferenceSignal[] = [];
  const gaps: CrossReferenceGap[] = [];

  // カテゴリに関連する軸を取得
  const categoryQuestions = CATEGORY_QUESTIONS[category] || [];
  const relevantAxes = new Set<TraitAxisKey>();
  for (const q of categoryQuestions) {
    for (const opt of q.options) {
      for (const mapping of opt.axisMappings) {
        relevantAxes.add(mapping.key);
      }
    }
  }

  // 共通軸でギャップを検出
  const axisLabels: Partial<Record<TraitAxisKey, string>> = {
    intimacy_pace: "親密さのペース",
    reassurance_need: "安心確認の必要性",
    boundary_awareness: "境界意識",
    public_private_gap: "表裏の使い分け",
    independence_vs_harmony: "独立と調和",
    direct_vs_diplomatic: "率直さと配慮",
    emotional_regulation: "感情の安定性",
    social_initiative: "社交の積極性",
    control_tendency: "コントロール傾向",
    relationship_mode_split: "相手別モード切替",
    exclusivity_pressure: "排他性の圧",
    consent_maturity: "合意の成熟度",
    emotional_variability: "感情の変動",
  };

  for (const axis of relevantAxes) {
    const pScore = partnerTabScores[axis];
    const dScore = dailyObservationScores[axis];

    if (pScore === undefined || dScore === undefined) continue;

    const label = axisLabels[axis] || axis.replace(/_/g, " ");

    conscious.push({
      axis,
      source: "partner_tab",
      score: pScore,
      label,
    });

    unconscious.push({
      axis,
      source: "daily_observation",
      score: dScore,
      label,
    });

    const delta = pScore - dScore;
    if (Math.abs(delta) > 0.2) {
      const narrativeConfig = GAP_NARRATIVES[axis];
      const narrative = narrativeConfig
        ? delta > 0
          ? narrativeConfig.positiveGap
          : narrativeConfig.negativeGap
        : `${label}において、意識と無意識の間に差が見られる。`;

      gaps.push({
        axis,
        label,
        consciousScore: pScore,
        unconsciousScore: dScore,
        delta,
        narrative,
      });
    }
  }

  // ギャップをdelta絶対値の大きい順に
  gaps.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  return { conscious, unconscious, gaps: gaps.slice(0, 3) };
}

/**
 * ギャップ結果からサマリーナラティブを生成
 */
export function generateGapSummary(result: CrossReferenceResult): string {
  if (result.gaps.length === 0) {
    return "意識的な観測と日常の観測の間に、大きなギャップは見られません。自覚と実際の行動が比較的一致しています。";
  }

  if (result.gaps.length === 1) {
    return result.gaps[0].narrative;
  }

  const topGap = result.gaps[0];
  return `最も顕著なのは「${topGap.label}」のギャップ。${topGap.narrative} 他にも${result.gaps.length - 1}つの微妙なずれが観測されています。`;
}
