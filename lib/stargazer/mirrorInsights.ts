// lib/stargazer/mirrorInsights.ts
// カテゴリ完了後の「鏡の瞬間」— 蓄積された回答から短い観測断片を生成
// 「理解されている」感覚を生み出し、次のカテゴリでより正直な回答を引き出す
// 原則: 評価ではなく映し返し。断定ではなく「～の傾向が見えてきました」

import type { TraitAxisKey } from "./traitAxes";
import type { Stage1Category } from "./stage1Questions";

interface MirrorInsight {
  observation: string;
  confidence: number;
}

type InsightGenerator = (
  scores: Partial<Record<TraitAxisKey, number>>
) => MirrorInsight;

const INSIGHT_GENERATORS: Record<Stage1Category, InsightGenerator> = {
  self_core: (scores) => {
    const analytical = scores.analytical_vs_intuitive ?? 0;
    const cautious = scores.cautious_vs_bold ?? 0;
    const change = scores.change_embrace_vs_resist ?? 0;

    if (Math.abs(analytical) >= Math.abs(cautious) && Math.abs(analytical) > 0.2) {
      return {
        observation:
          analytical > 0
            ? "物事を判断するとき、直感より分析的な思考を優先する傾向が見えてきました"
            : "あなたは論理よりも直感で物事を捉える傾向がありそうです。それは大切な感覚です",
        confidence: Math.abs(analytical),
      };
    }
    if (Math.abs(cautious) > 0.2) {
      return {
        observation:
          cautious > 0
            ? "未知の状況に対して慎重に構える傾向が見えます。それは自分を守る力でもあります"
            : "新しい状況に対して、恐れよりも好奇心が先に来る傾向が見えてきました",
        confidence: Math.abs(cautious),
      };
    }
    if (Math.abs(change) > 0.2) {
      return {
        observation:
          change > 0
            ? "変化を受け入れやすい柔軟性が見えてきました"
            : "安定を大切にする芯の強さが見えてきました",
        confidence: Math.abs(change),
      };
    }
    return {
      observation:
        "あなたの判断の核には、バランスを大切にする傾向が見えてきました",
      confidence: 0.4,
    };
  },

  emotional_pattern: (scores) => {
    const variability = scores.emotional_variability ?? 0;
    const reassurance = scores.reassurance_need ?? 0;
    const stress = scores.stress_isolation_vs_social ?? 0;

    if (Math.abs(variability) > 0.2) {
      return {
        observation:
          variability > 0
            ? "状況によって感情が揺れやすい傾向が見えます。それは感受性の豊かさの裏返しです"
            : "感情の安定性が高い傾向が見えてきました。周囲に安心を与える力があるようです",
        confidence: Math.abs(variability),
      };
    }
    if (Math.abs(reassurance) > 0.2) {
      return {
        observation:
          reassurance > 0
            ? "安心の確認を求める傾向が見えます。それは関係性を大切にしている証です"
            : "一人でも安心を保てる自立性が見えてきました",
        confidence: Math.abs(reassurance),
      };
    }
    if (Math.abs(stress) > 0.2) {
      return {
        observation:
          stress > 0
            ? "つらい時に一人で処理する傾向が見えます。静かな水面の下に深い感覚があるようです"
            : "つらい時に人と共有することで回復する傾向が見えてきました",
        confidence: Math.abs(stress),
      };
    }
    return {
      observation:
        "感情との付き合い方に、あなた独自のバランスが見えてきました",
      confidence: 0.4,
    };
  },

  social_style: (scores) => {
    const introvert = scores.introvert_vs_extrovert ?? 0;
    const initiative = scores.social_initiative ?? 0;
    const individual = scores.individual_vs_social ?? 0;

    if (Math.abs(individual) > 0.2) {
      return {
        observation:
          individual > 0
            ? "深い関係を少人数と築くことを好む傾向が見えます。それは信頼を大切にする表れです"
            : "広い交友関係を楽しめる傾向が見えてきました。多様な人との繋がりがエネルギーになるようです",
        confidence: Math.abs(individual),
      };
    }
    if (Math.abs(initiative) > 0.2) {
      return {
        observation:
          initiative > 0
            ? "自分から距離を縮めていく積極性が見えてきました"
            : "相手のペースを待つ、受容的な姿勢が見えます",
        confidence: Math.abs(initiative),
      };
    }
    if (Math.abs(introvert) > 0.2) {
      return {
        observation:
          introvert > 0
            ? "一人の時間から力を回復する傾向が見えてきました"
            : "人との交流からエネルギーを得る傾向が見えます",
        confidence: Math.abs(introvert),
      };
    }
    return {
      observation:
        "対人距離の取り方に、あなた独自のスタイルが形づくられてきました",
      confidence: 0.4,
    };
  },

  relationship_mode: (scores) => {
    const modeSplit = scores.relationship_mode_split ?? 0;
    const intimacyPace = scores.intimacy_pace ?? 0;
    const harmony = scores.independence_vs_harmony ?? 0;

    if (Math.abs(modeSplit) > 0.2) {
      return {
        observation:
          modeSplit > 0
            ? "関係性の種類によって態度が変わる傾向が見えます。それは場面を読む力でもあります"
            : "どの関係性でも一貫した自分でいられる傾向が見えてきました",
        confidence: Math.abs(modeSplit),
      };
    }
    if (Math.abs(intimacyPace) > 0.2) {
      return {
        observation:
          intimacyPace > 0
            ? "距離を縮めるのに時間をかける傾向が見えます。慎重さの中に、関係を大切にする気持ちが感じられます"
            : "距離を積極的に縮められる傾向が見えてきました。そのオープンさは関係構築の力になります",
        confidence: Math.abs(intimacyPace),
      };
    }
    if (Math.abs(harmony) > 0.2) {
      return {
        observation:
          harmony > 0
            ? "調和を重視する傾向が見えます。周囲との関係を大切にする姿勢です"
            : "自分の軸を持って関係に臨む傾向が見えてきました",
        confidence: Math.abs(harmony),
      };
    }
    return {
      observation:
        "関係性の中でのあなたの態度に、一つのパターンが浮かび上がってきました",
      confidence: 0.4,
    };
  },

  boundary_safety: (scores) => {
    const boundary = scores.boundary_awareness ?? 0;
    const direct = scores.direct_vs_diplomatic ?? 0;

    if (Math.abs(boundary) > 0.2) {
      return {
        observation:
          boundary > 0
            ? "境界線を明確に意識する傾向が見えます。それは自分も相手も守る大切な感覚です"
            : "境界線を柔軟に扱う傾向が見えてきました。柔軟さの中にも、あなたなりの基準がありそうです",
        confidence: Math.abs(boundary),
      };
    }
    if (Math.abs(direct) > 0.2) {
      return {
        observation:
          direct > 0
            ? "率直に気持ちを伝える傾向が見えます。それは関係の透明性を大切にしている表れです"
            : "配慮しながら伝える傾向が見えてきました。相手への思いやりが感じられます",
        confidence: Math.abs(direct),
      };
    }
    return {
      observation:
        "距離感と安全の感覚に、あなた固有のバランスが見えてきました",
      confidence: 0.4,
    };
  },

  style_identity: (scores) => {
    const independence = scores.independence_vs_harmony ?? 0;
    const funcExpr = scores.function_vs_expression ?? 0;
    const minimal = scores.minimal_vs_maximal ?? 0;

    if (Math.abs(funcExpr) > 0.2) {
      return {
        observation:
          funcExpr > 0
            ? "機能性を重視する傾向が見えます。本質的なものを見抜く目を持っているようです"
            : "表現としてのスタイルを大切にする傾向が見えてきました。美意識が生き方に反映されています",
        confidence: Math.abs(funcExpr),
      };
    }
    if (Math.abs(independence) > 0.2) {
      return {
        observation:
          independence > 0
            ? "自分らしさを独自に貫く傾向が見えます。その信念は、あなたの核を形作る力です"
            : "周囲と調和することを大切にする傾向が見えてきました。環境を読む感覚が豊かです",
        confidence: Math.abs(independence),
      };
    }
    if (Math.abs(minimal) > 0.2) {
      return {
        observation:
          minimal > 0
            ? "少ないもので整える美意識が見えます"
            : "豊かさの中で自分を表現する楽しさが見えてきました",
        confidence: Math.abs(minimal),
      };
    }
    return {
      observation:
        "自分らしさの表現に、あなただけのスタイルが見えてきました",
      confidence: 0.4,
    };
  },
};

/**
 * カテゴリ完了時の鏡の瞬間テキストを生成
 * 蓄積された軸スコアから最も顕著な傾向を短い観測として返す
 */
export function generateMirrorInsight(
  category: Stage1Category,
  partialScores: Partial<Record<TraitAxisKey, number>>
): MirrorInsight {
  const generator = INSIGHT_GENERATORS[category];
  return generator(partialScores);
}
