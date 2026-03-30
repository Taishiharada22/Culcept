// ============================================================
// Feature 3: ズレの前向き表示 (Positive Friction Framing)
// 既存のcautionCodeを成長機会として読み替える
// ============================================================

import type { CautionCode } from "@/lib/rendezvous/types";
import { cautionTextMap } from "@/lib/rendezvous/buildReasons";
import type { PositiveFrictionItem } from "./types";

const POSITIVE_FRAMES: Record<
  CautionCode,
  { positiveFrame: string; growthHint: string; trait: string }
> = {
  silence_interpretation_gap: {
    trait: "沈黙の感じ方",
    positiveFrame:
      "沈黙の感じ方が違うからこそ、言葉にする練習になる相手",
    growthHint:
      "「今、考え中」と一言添えるだけで、沈黙が安心に変わる",
  },
  decision_speed_gap: {
    trait: "決断のテンポ",
    positiveFrame:
      "決断のテンポが違うことで、お互いの盲点を補える",
    growthHint:
      "急ぐ場面と待つ場面を事前に決めておくと楽になる",
  },
  depth_progression_gap: {
    trait: "関係の深まり方",
    positiveFrame:
      "深まるスピードが違うからこそ、相手のペースを意識する練習になる",
    growthHint:
      "「今どのくらいの距離感？」と定期的に確認し合うと安心する",
  },
  distance_need_gap: {
    trait: "一人時間の量",
    positiveFrame:
      "一人時間の量が違うことで、自分の「ちょうどいい」を見つけやすくなる",
    growthHint:
      "お互いの充電タイムを尊重するルールを作ると、関係が長続きしやすい",
  },
  initiative_gap: {
    trait: "主導権のバランス",
    positiveFrame:
      "主導権のバランスが違うことで、場面ごとの役割分担が生まれやすい",
    growthHint:
      "「今日はどっちが決める？」と交互にリードする仕組みを試してみて",
  },
  emotional_expression_gap: {
    trait: "感情の出し方",
    positiveFrame:
      "感情の出し方が違うことで、自分の感情表現を見つめ直すきっかけになる",
    growthHint:
      "「嬉しい・悲しい・不安」の3種類だけでも言葉にすると伝わりやすい",
  },
  conflict_style_gap: {
    trait: "すれ違い時の向き合い方",
    positiveFrame:
      "すれ違いの向き合い方が違うからこそ、第三の解決策が生まれやすい",
    growthHint:
      "衝突時に「一旦30分置こう」とクールダウンを提案すると効果的",
  },
  rhythm_gap: {
    trait: "生活リズム",
    positiveFrame:
      "生活リズムの違いが、お互いの時間の使い方を豊かにする可能性がある",
    growthHint:
      "重なる時間帯を1日1回でも確保すると、リズムの違いが味方になる",
  },
  anxious_avoidant_risk: {
    trait: "安心と距離のバランス",
    positiveFrame:
      "安心の求め方が違うからこそ、お互いの安全基地を意識的に作れる",
    growthHint:
      "不安を感じたら「今、安心が欲しい」と伝える練習をしてみて",
  },
  repair_style_gap: {
    trait: "関係修復のスタイル",
    positiveFrame:
      "修復の仕方が違うことで、より多様な解決策が生まれる可能性がある",
    growthHint:
      "すれ違い後の「最初の一歩」をどちらが踏み出すか、事前に話し合っておくと安心",
  },
  autonomy_tension: {
    trait: "自律性の尊重",
    positiveFrame:
      "自律性の感じ方が違うことで、「個」と「関係」のバランスを学べる",
    growthHint:
      "お互いの「譲れない自分時間」を共有し合うと、尊重しやすくなる",
  },
};

export function computePositiveFriction(
  cautionCodes: CautionCode[],
): PositiveFrictionItem[] {
  return cautionCodes
    .filter((code) => code in POSITIVE_FRAMES)
    .map((code) => {
      const frame = POSITIVE_FRAMES[code];
      return {
        cautionCode: code,
        trait: frame.trait,
        cautionText: cautionTextMap[code],
        positiveFrame: frame.positiveFrame,
        growthHint: frame.growthHint,
      };
    });
}
