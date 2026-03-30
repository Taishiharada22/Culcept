// lib/stargazer/workStyleFitness.ts
// 環境適合度 — 職種ではなく「どう働くか」の適性を分析
// 根拠: Hackman & Oldham (Job Characteristics Model), Deci & Ryan (Self-Determination Theory)

import type { TraitAxisKey } from "./traitAxes";

// ── Types ──

export interface WorkStyleDimension {
  id: string;
  label: string;
  /** 左極のラベル */
  leftLabel: string;
  /** 右極のラベル */
  rightLabel: string;
  /** -1〜+1 のスコア */
  score: number;
  /** 解釈テキスト */
  interpretation: string;
  /** この働き方で力が出る具体的場面 */
  bestScenario: string;
  /** この働き方だと辛くなる場面 */
  worstScenario: string;
}

export interface WorkStyleResult {
  dimensions: WorkStyleDimension[];
  /** 総合的な理想の環境 */
  idealEnvironment: string;
  /** 避けるべき環境 */
  avoidEnvironment: string;
}

// ── Dimension Definitions ──

interface DimensionDef {
  id: string;
  label: string;
  leftLabel: string;
  rightLabel: string;
  /** 軸スコアからの算出式 */
  compute: (scores: Partial<Record<TraitAxisKey, number>>) => number;
  interpret: (score: number) => {
    text: string;
    best: string;
    worst: string;
  };
}

const DIMENSIONS: DimensionDef[] = [
  {
    id: "remote_vs_office",
    label: "場所",
    leftLabel: "リモート",
    rightLabel: "出社",
    compute: (s) => {
      const intro = s.introvert_vs_extrovert ?? 0;
      const social = s.social_initiative ?? 0;
      const indep = s.independence_vs_harmony ?? 0;
      return clamp(intro * 0.4 + social * 0.3 - indep * 0.3);
    },
    interpret: (score) => {
      if (score < -0.2)
        return {
          text: "自分のペースで集中できるリモート環境で力が出る。移動時間がないぶん、深い思考に使える。",
          best: "静かな自室でノイズキャンセリングをつけ、3時間集中して成果物を出す",
          worst: "毎日の通勤と、オフィスでの雑談・割り込みが絶え間なく続く環境",
        };
      if (score > 0.2)
        return {
          text: "人がいる空間でエネルギーが上がる。対面のやりとりから生まれるアイデアが強み。",
          best: "チームメンバーとホワイトボードの前でブレストし、その場で方向性が決まる",
          worst: "一人で自宅に篭り、チャットだけでコミュニケーションする日々が続く",
        };
      return {
        text: "ハイブリッドが最適。集中作業はリモート、対話が必要な日は出社、と使い分けられる。",
        best: "週2-3日出社でチームと同期し、残りはリモートで深い作業に集中する",
        worst: "「完全リモート」か「毎日出社」の二択を迫られる",
      };
    },
  },
  {
    id: "large_vs_small",
    label: "組織規模",
    leftLabel: "大組織",
    rightLabel: "少数精鋭",
    compute: (s) => {
      const bold = s.cautious_vs_bold ?? 0;
      const change = s.change_embrace_vs_resist ?? 0;
      const indep = s.independence_vs_harmony ?? 0;
      return clamp(bold * 0.3 + change * 0.4 - indep * 0.3);
    },
    interpret: (score) => {
      if (score < -0.2)
        return {
          text: "大きな組織の安定感と体系的な成長環境が合う。専門性を深める余裕がある。",
          best: "明確な役割分担があり、自分の専門領域に集中できる。研修制度も充実。",
          worst: "毎日が手探りで、何でも屋にならざるを得ない環境",
        };
      if (score > 0.2)
        return {
          text: "少人数で裁量が大きい環境が合う。自分の判断がダイレクトに結果に出る実感が力になる。",
          best: "5-15人のチームで、自分の提案がすぐ実行に移される",
          worst: "承認プロセスが5段階あり、自分のアイデアが2ヶ月経ってやっと動く",
        };
      return {
        text: "中規模の組織がベスト。ある程度の安定感がありつつ、裁量も確保できる。",
        best: "30-100人規模で、チーム内の自由度が高い環境",
        worst: "数千人の巨大組織でも、完全に一人の環境でもない",
      };
    },
  },
  {
    id: "structured_vs_flexible",
    label: "業務スタイル",
    leftLabel: "定型・ルーティン",
    rightLabel: "非定型・変化",
    compute: (s) => {
      const plan = s.plan_vs_spontaneous ?? 0;
      const change = s.change_embrace_vs_resist ?? 0;
      const novelty = s.tradition_vs_novelty ?? 0;
      return clamp(plan * 0.3 + change * 0.4 + novelty * 0.3);
    },
    interpret: (score) => {
      if (score < -0.2)
        return {
          text: "予測可能で安定した業務フローが合う。ルーティンの中で品質を上げることに喜びを感じる。",
          best: "毎日のタスクが明確で、一つひとつを着実に高品質でこなせる",
          worst: "毎日やることが変わり、優先順位が頻繁にひっくり返る",
        };
      if (score > 0.2)
        return {
          text: "変化と刺激がある環境でこそ力が出る。同じことの繰り返しはエネルギーが枯渇する。",
          best: "毎週新しいプロジェクトがあり、違うスキルが求められる",
          worst: "毎日同じ作業を繰り返し、改善の余地もない",
        };
      return {
        text: "ベースのルーティンがありつつ、適度な変化がある環境がベスト。",
        best: "コアの業務は安定しているが、月に2-3回は新しい挑戦がある",
        worst: "極端なルーティンか、極端なカオスのどちらか",
      };
    },
  },
  {
    id: "deadline_vs_autonomous",
    label: "時間管理",
    leftLabel: "締切駆動",
    rightLabel: "自律型",
    compute: (s) => {
      const indep = s.independence_vs_harmony ?? 0;
      const plan = s.plan_vs_spontaneous ?? 0;
      const bold = s.cautious_vs_bold ?? 0;
      return clamp(-indep * 0.4 + plan * 0.2 + bold * 0.3);
    },
    interpret: (score) => {
      if (score < -0.2)
        return {
          text: "明確な締切がある方が力が出る。プレッシャーが集中力を引き出す。",
          best: "1週間後のプレゼンに向けて、逆算でタスクを組み立てる",
          worst: "「いつでもいいよ」と言われ、優先順位が決められない",
        };
      if (score > 0.2)
        return {
          text: "自分でペースをコントロールできる環境が合う。自律的に動けることが生産性の源。",
          best: "目標だけ決まっていて、いつ・どうやるかは自分が決められる",
          worst: "分刻みのスケジュールが詰め込まれ、自分の判断で動く余地がない",
        };
      return {
        text: "大きな締切は設定しつつ、日々の進め方は自分で決められるのが理想。",
        best: "月単位のマイルストーンがあり、週の進め方は自由",
        worst: "締切がない漂流状態か、毎日が締切の連続",
      };
    },
  },
  {
    id: "solo_vs_team",
    label: "チーム構成",
    leftLabel: "個人作業中心",
    rightLabel: "チーム作業中心",
    compute: (s) => {
      const intro = s.introvert_vs_extrovert ?? 0;
      const indSoc = s.individual_vs_social ?? 0;
      const social = s.social_initiative ?? 0;
      return clamp(intro * 0.3 + indSoc * 0.4 + social * 0.3);
    },
    interpret: (score) => {
      if (score < -0.2)
        return {
          text: "一人で深く集中できる時間が多い方が成果が出る。",
          best: "自分の領域を持ち、深く没頭して成果物を仕上げる",
          worst: "一日中ミーティングが続き、自分の作業時間が取れない",
        };
      if (score > 0.2)
        return {
          text: "チームで動く方が力が出る。対話からアイデアが生まれ、一人では到達できない成果を出せる。",
          best: "3-5人のチームで、毎日30分の同期と自由な議論がある",
          worst: "一人でオフィスに座り、誰とも話さず作業する日が続く",
        };
      return {
        text: "個人作業とチームワークのバランスが取れた環境が最適。",
        best: "午前は個人で集中、午後はチームでコラボレーション",
        worst: "完全に孤立するか、常に誰かと一緒の環境",
      };
    },
  },
];

function clamp(v: number): number {
  return Math.max(-1, Math.min(1, v));
}

// ── Analysis ──

export function analyzeWorkStyle(
  axisScores: Partial<Record<TraitAxisKey, number>>,
): WorkStyleResult | null {
  const entries = Object.keys(axisScores);
  if (entries.length < 5) return null;

  const dimensions: WorkStyleDimension[] = DIMENSIONS.map((dim) => {
    const score = dim.compute(axisScores);
    const { text, best, worst } = dim.interpret(score);
    return {
      id: dim.id,
      label: dim.label,
      leftLabel: dim.leftLabel,
      rightLabel: dim.rightLabel,
      score,
      interpretation: text,
      bestScenario: best,
      worstScenario: worst,
    };
  });

  // 理想の環境サマリー
  const idealParts: string[] = [];
  const avoidParts: string[] = [];
  for (const d of dimensions) {
    if (Math.abs(d.score) > 0.15) {
      const preferred = d.score > 0 ? d.rightLabel : d.leftLabel;
      const avoided = d.score > 0 ? d.leftLabel : d.rightLabel;
      idealParts.push(preferred);
      avoidParts.push(avoided);
    }
  }

  const idealEnvironment = idealParts.length > 0
    ? `${idealParts.join("・")}が揃った環境であなたの力が最大化される。`
    : "特定の環境に強い偏りはなく、柔軟にフィットできるタイプ。";

  const avoidEnvironment = avoidParts.length > 0
    ? `${avoidParts.join("・")}が極端に強い環境では、本来の力が発揮しにくい。`
    : "大きな不適合リスクはないが、自分のエネルギーが下がる要素には注意。";

  return { dimensions, idealEnvironment, avoidEnvironment };
}
