// ============================================================
// Orbiter Feature 5: Relationship Trajectory
// 関係の育ち方 — ChemistryMap + 軸傾向から関係の展開パターンを予測
//
// TrajectoryType: 6種のテンプレート
// 各タイプ → 3-4フェーズ + ペース予測 + リスク軸
// ============================================================

import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";
import type { RendezvousCategory } from "@/lib/rendezvous/types";
import type { StyleChemistryMap, ChemistryQuadrant } from "@/lib/relational/types";
import type {
  TrajectoryType,
  TrajectoryPhase,
  TrajectoryForecast,
} from "./types";

// ── Phase Templates ──

const TRAJECTORY_TEMPLATES: Record<
  TrajectoryType,
  {
    label: string;
    description: string;
    phases: TrajectoryPhase[];
    keyRiskAxis: TraitAxisKey | null;
  }
> = {
  slow_deep: {
    label: "じっくり深まる",
    description:
      "時間をかけて信頼を積み、深く安定した関係を築いていくパターン",
    phases: [
      {
        name: "静かな距離を縮める期",
        description:
          "お互いを観察しながら少しずつ心を開いていく段階",
        estimatedDuration: "2〜4週間",
        riskPoints: ["沈黙が続きすぎると不安が生まれやすい"],
        growthOpportunities: [
          "小さな共感の積み重ねが信頼の土台になる",
        ],
      },
      {
        name: "信頼構築期",
        description:
          "本音を少しずつ出し始め、相手の本質が見えてくる段階",
        estimatedDuration: "1〜2ヶ月",
        riskPoints: [
          "深さを求めるペースにズレが生じやすい",
        ],
        growthOpportunities: [
          "お互いの弱さを見せ合うことで一段深い関係に",
        ],
      },
      {
        name: "深い安定期",
        description:
          "言葉がなくても通じ合う、穏やかで深い関係が成立する段階",
        estimatedDuration: "安定後は長期持続",
        riskPoints: [
          "マンネリを刺激不足と感じる可能性",
        ],
        growthOpportunities: [
          "新しい共通体験を取り入れることで関係がさらに豊かに",
        ],
      },
    ],
    keyRiskAxis: "intimacy_pace" as TraitAxisKey,
  },

  fast_intense: {
    label: "急速に深まる",
    description:
      "短期間で強い結びつきが生まれるが、調整の壁に直面しやすいパターン",
    phases: [
      {
        name: "急接近期",
        description:
          "強い共鳴や魅力で急速に距離が縮まる段階",
        estimatedDuration: "1〜2週間",
        riskPoints: [
          "盛り上がりに任せて本質的な差異を見落としやすい",
        ],
        growthOpportunities: [
          "このエネルギーで多くの共通体験を積める",
        ],
      },
      {
        name: "調整の壁",
        description:
          "初期の高揚が落ち着き、現実的な違いが見えてくる段階",
        estimatedDuration: "2〜4週間",
        riskPoints: [
          "「こんなはずじゃなかった」という失望のリスク",
          "テンションの差に疲れる可能性",
        ],
        growthOpportunities: [
          "ここを乗り越えると本物の信頼が生まれる",
        ],
      },
      {
        name: "再選択期",
        description:
          "現実的な相手像を踏まえて関係を続けるか選び直す段階",
        estimatedDuration: "2〜3週間",
        riskPoints: [
          "どちらかが諦めやすいタイミング",
        ],
        growthOpportunities: [
          "意識的に選び直すことで、より成熟した関係へ",
        ],
      },
      {
        name: "成熟期",
        description:
          "お互いの現実を受け入れた上での安定した関係",
        estimatedDuration: "安定後は長期持続",
        riskPoints: [],
        growthOpportunities: [
          "初期の情熱と成熟した理解が両立する稀有な関係に",
        ],
      },
    ],
    keyRiskAxis: "emotional_variability" as TraitAxisKey,
  },

  oscillating: {
    label: "揺れながら育つ",
    description:
      "近づいたり離れたりを繰り返しながら、徐々に安定点を見つけるパターン",
    phases: [
      {
        name: "接近と後退の波",
        description:
          "心地よい距離と不安な距離を行き来する段階",
        estimatedDuration: "継続的（1〜3ヶ月）",
        riskPoints: [
          "「また繰り返すのか」という疲弊感",
          "片方が安定を求めて先に離脱する可能性",
        ],
        growthOpportunities: [
          "波のパターンを理解すると、揺れ自体が安心材料に",
        ],
      },
      {
        name: "パターン認識期",
        description:
          "お互いの波のリズムが見えてきて、予測可能になる段階",
        estimatedDuration: "1〜2ヶ月",
        riskPoints: [
          "パターンを変えたい焦りが衝突に",
        ],
        growthOpportunities: [
          "「揺れても戻ってくる」という信頼が生まれる",
        ],
      },
      {
        name: "安定均衡期",
        description:
          "揺れの幅が小さくなり、安定した関係の形が見つかる段階",
        estimatedDuration: "安定後は持続",
        riskPoints: [],
        growthOpportunities: [
          "揺れを経験したからこそ、柔軟で強い関係に",
        ],
      },
    ],
    keyRiskAxis: "emotional_variability" as TraitAxisKey,
  },

  parallel_growth: {
    label: "並走して育つ",
    description:
      "それぞれが自分の成長を続けながら、横並びで関係を深めるパターン",
    phases: [
      {
        name: "共感の発見期",
        description:
          "似た価値観や目標を持つことを確認し合う段階",
        estimatedDuration: "2〜3週間",
        riskPoints: [
          "似すぎて刺激が足りないと感じる可能性",
        ],
        growthOpportunities: [
          "安心感がベースにあるので、本音を出しやすい",
        ],
      },
      {
        name: "並走期",
        description:
          "お互いの成長を応援しながら、共に進む段階",
        estimatedDuration: "継続的",
        riskPoints: [
          "成長速度の差が嫉妬や焦りに",
        ],
        growthOpportunities: [
          "お互いの成功を心から喜べる関係に",
        ],
      },
      {
        name: "深化期",
        description:
          "共有した経験が絆になり、かけがえのない存在になる段階",
        estimatedDuration: "長期持続",
        riskPoints: [],
        growthOpportunities: [
          "人生の変化にも一緒に対応できる柔軟な関係へ",
        ],
      },
    ],
    keyRiskAxis: null,
  },

  complementary_fit: {
    label: "補い合って育つ",
    description:
      "異なる特性が噛み合い、お互いの足りない部分を補い合うパターン",
    phases: [
      {
        name: "新鮮な驚き期",
        description:
          "自分にはない視点や特性に新鮮さを感じる段階",
        estimatedDuration: "1〜3週間",
        riskPoints: [
          "違いが「理解できない」と感じるリスク",
        ],
        growthOpportunities: [
          "新しい世界が広がる刺激的な体験",
        ],
      },
      {
        name: "役割分担期",
        description:
          "お互いの得意を活かした自然な役割分担が生まれる段階",
        estimatedDuration: "1〜2ヶ月",
        riskPoints: [
          "役割が固定化して窮屈に感じる可能性",
          "片方に負担が偏るリスク",
        ],
        growthOpportunities: [
          "チームとしての強さが生まれる",
        ],
      },
      {
        name: "統合期",
        description:
          "お互いの特性を理解し尊重した上での安定した関係",
        estimatedDuration: "長期持続",
        riskPoints: [],
        growthOpportunities: [
          "1人では到達できない場所に2人で到達できる",
        ],
      },
    ],
    keyRiskAxis: "direct_vs_diplomatic" as TraitAxisKey,
  },

  creative_tension: {
    label: "摩擦から生まれる",
    description:
      "ぶつかり合いながらも、その緊張感が成長と深い理解を生むパターン",
    phases: [
      {
        name: "衝突と発見期",
        description:
          "価値観やスタイルの違いが表面化し、驚きと戸惑いが混在する段階",
        estimatedDuration: "1〜3週間",
        riskPoints: [
          "摩擦を「合わない」と結論づけて離脱するリスク",
          "感情的な衝突がエスカレートする可能性",
        ],
        growthOpportunities: [
          "自分の当たり前を疑うきっかけになる",
        ],
      },
      {
        name: "交渉と理解期",
        description:
          "違いをどう扱うかのルールを一緒に作っていく段階",
        estimatedDuration: "1〜2ヶ月",
        riskPoints: [
          "交渉疲れが生じる可能性",
        ],
        growthOpportunities: [
          "コミュニケーション力が飛躍的に伸びる",
          "相手を通じて自分を深く知れる",
        ],
      },
      {
        name: "共創の安定期",
        description:
          "摩擦を糧にした深い理解と独自の関係スタイルが確立する段階",
        estimatedDuration: "確立後は長期持続",
        riskPoints: [],
        growthOpportunities: [
          "困難を乗り越えた分、他の関係より強い絆に",
        ],
      },
    ],
    keyRiskAxis: "direct_vs_diplomatic" as TraitAxisKey,
  },
};

// ── Trajectory Type Detection ──

function detectTrajectoryType(params: {
  dominantQuadrant: ChemistryQuadrant;
  selfAxisScores: Partial<Record<TraitAxisKey, number>>;
  counterpartAxisScores: Partial<Record<TraitAxisKey, number>>;
  category: RendezvousCategory;
}): TrajectoryType {
  const { dominantQuadrant, selfAxisScores, counterpartAxisScores, category } =
    params;

  const selfIntimacy =
    selfAxisScores["intimacy_pace" as TraitAxisKey] ?? 0;
  const otherIntimacy =
    counterpartAxisScores["intimacy_pace" as TraitAxisKey] ?? 0;
  const selfEmotVar =
    selfAxisScores["emotional_variability" as TraitAxisKey] ?? 0;
  const otherEmotVar =
    counterpartAxisScores["emotional_variability" as TraitAxisKey] ?? 0;
  const selfCautious =
    selfAxisScores["cautious_vs_bold" as TraitAxisKey] ?? 0;
  const otherCautious =
    counterpartAxisScores["cautious_vs_bold" as TraitAxisKey] ?? 0;

  // 揺れやすい組み合わせ → oscillating
  if (selfEmotVar > 0.4 || otherEmotVar > 0.4) {
    return "oscillating";
  }

  switch (dominantQuadrant) {
    case "resonance":
      // 共鳴 + 両方の親密ペースが速い + 恋愛 → fast_intense
      if (
        category === "romantic" &&
        selfIntimacy > 0 &&
        otherIntimacy > 0
      ) {
        return "fast_intense";
      }
      // 共鳴 + 両方慎重 → slow_deep
      if (selfCautious < 0 && otherCautious < 0) {
        return "slow_deep";
      }
      // 共鳴 + 友人/コミュニティ → parallel_growth
      if (category === "friendship" || category === "community") {
        return "parallel_growth";
      }
      // 共鳴 + 共創 + 両方大胆 → fast_intense（高エネルギーの共創）
      if (category === "cocreation" && selfCautious > 0.2 && otherCautious > 0.2) {
        return "fast_intense";
      }
      return "parallel_growth";

    case "complement":
      // 補完 + 恋愛 + 親密ペース差 → oscillating（差が揺れを生む）
      if (category === "romantic" && Math.abs(selfIntimacy - otherIntimacy) > 0.3) {
        return "oscillating";
      }
      return "complementary_fit";

    case "friction":
      // 摩擦 + 両方慎重 → slow_deep（摩擦だが慎重に進む）
      if (selfCautious < -0.3 && otherCautious < -0.3) {
        return "slow_deep";
      }
      return "creative_tension";

    case "unknown":
    default:
      // データ不足時は安全にslow_deep
      return "slow_deep";
  }
}

// ── Pace Estimation ──

function estimatePace(
  selfAxisScores: Partial<Record<TraitAxisKey, number>>,
  counterpartAxisScores: Partial<Record<TraitAxisKey, number>>,
  trajectoryType: TrajectoryType,
): { pace: "slow" | "moderate" | "fast"; narrative: string } {
  const selfIntimacy =
    selfAxisScores["intimacy_pace" as TraitAxisKey] ?? 0;
  const otherIntimacy =
    counterpartAxisScores["intimacy_pace" as TraitAxisKey] ?? 0;
  const avgIntimacy = (selfIntimacy + otherIntimacy) / 2;
  const intimacyGap = Math.abs(selfIntimacy - otherIntimacy);

  // ペースのギャップが大きい場合の特別ナラティブ
  if (intimacyGap > 0.5) {
    const fasterSide = selfIntimacy > otherIntimacy ? "あなた" : "相手";
    return {
      pace: "moderate",
      narrative: `${fasterSide}の方が距離を縮めるのが早い。ペースを合わせる意識が、この関係の鍵になる`,
    };
  }

  if (avgIntimacy > 0.3) {
    // Trajectory-type specific fast narrative
    const fastNarratives: Partial<Record<TrajectoryType, string>> = {
      fast_intense: "情熱的に距離が縮まる分、「調整の壁」を乗り越える準備も意識して",
      complementary_fit: "違いに惹かれ合うスピードは速い。最初の新鮮さが落ち着いた後が本番",
    };
    return {
      pace: "fast",
      narrative: fastNarratives[trajectoryType] ??
        "お互い関係を深めるのが早いタイプ。自然な流れで距離が縮まりそう",
    };
  }
  if (avgIntimacy < -0.3) {
    const slowNarratives: Partial<Record<TrajectoryType, string>> = {
      slow_deep: "急がず焦らず。時間をかけた分だけ、深く安定した関係が育つ",
      oscillating: "ゆっくりしたペースだが、波がある。波のリズムを掴むと安心感が増す",
    };
    return {
      pace: "slow",
      narrative: slowNarratives[trajectoryType] ??
        "じっくり時間をかけて信頼を積むタイプ同士。焦らず進めると良い",
    };
  }
  return {
    pace: "moderate",
    narrative: "自然なペースで段階的に関係が育っていきそう。お互いの反応を見ながら進めて",
  };
}

// ── Main Export ──

export function computeTrajectoryForecast(params: {
  chemistryMap: StyleChemistryMap | null;
  selfAxisScores: Partial<Record<TraitAxisKey, number>>;
  counterpartAxisScores: Partial<Record<TraitAxisKey, number>>;
  category: RendezvousCategory;
}): TrajectoryForecast | null {
  const { chemistryMap, selfAxisScores, counterpartAxisScores, category } =
    params;

  if (!chemistryMap) return null;

  const trajectoryType = detectTrajectoryType({
    dominantQuadrant: chemistryMap.dominantQuadrant,
    selfAxisScores,
    counterpartAxisScores,
    category,
  });

  const template = TRAJECTORY_TEMPLATES[trajectoryType];
  const paceResult = estimatePace(selfAxisScores, counterpartAxisScores, trajectoryType);

  return {
    type: trajectoryType,
    typeLabel: template.label,
    typeDescription: template.description,
    phases: template.phases,
    estimatedPace: paceResult.pace,
    paceNarrative: paceResult.narrative,
    keyRiskAxis: template.keyRiskAxis,
  };
}
