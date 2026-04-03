/**
 * 「この提案に効いている自分の軸」チップ生成
 *
 * Calendar の提案がどの My-Style データに基づいているかを
 * 小さなテキストチップとして可視化する。
 *
 * Calendar = 実行の主戦場
 * My-Style = 編集・理解の本拠地
 * → Calendar内で My-Style が生きていることを伝える
 */

import type { CalendarPersonaProfile } from "./personaBoost";
import type { SatisfactionProfile } from "./types";
import type { GapAnalysis } from "./wardrobeGapDetector";
import type { ObservationContext, OutfitAdaptation } from "./aneurasyncIntegration";

export interface AxisChip {
  label: string;
  /** 根拠の強さ: データ量が十分か */
  confidence: "high" | "medium";
}

/**
 * 提案に実際に効いている軸をチップとして抽出する。
 * 効いていない軸は出さない。最大5個。
 */
export function buildProposalAxisChips(ctx: {
  persona: CalendarPersonaProfile | null;
  satisfaction: SatisfactionProfile | null;
  gap: GapAnalysis | null;
  adaptation: OutfitAdaptation | null;
  observation: ObservationContext | null;
}): AxisChip[] {
  const chips: AxisChip[] = [];

  // ── 優先順位: 満足度 → スタイル軸 → 似合う色 → 心理適応 → ギャップ ──
  // ヒーローでは上位3個のみ表示されるため、刺さる順に並べる

  // 1. 直近満足度 — 学習データが十分な場合（最も"自分のデータ"感が強い）
  if (ctx.satisfaction && ctx.satisfaction.dataPoints >= 7) {
    let totalAvg = 0;
    let count = 0;
    for (const [, score] of ctx.satisfaction.itemScores) {
      if (score.count >= 2) {
        totalAvg += score.avg;
        count++;
      }
    }
    if (count > 0) {
      const avg = totalAvg / count;
      if (avg >= 3.8) {
        chips.push({ label: "直近満足度高め", confidence: "high" });
      } else if (avg <= 2.5) {
        chips.push({ label: "満足度から改善中", confidence: "medium" });
      }
    }
  }

  // 2. スタイル軸 — 明確な方向性がある場合のみ
  if (ctx.persona && ctx.persona.completeness >= 40) {
    const { minimal_vs_maximal, classic_vs_trendy, cautious_vs_bold } = ctx.persona.styleAxis;

    if (minimal_vs_maximal < -0.25) {
      chips.push({ label: "シンプル軸", confidence: "high" });
    } else if (minimal_vs_maximal > 0.25) {
      chips.push({ label: "華やか軸", confidence: "high" });
    }

    if (classic_vs_trendy < -0.25) {
      chips.push({ label: "きれいめ寄り", confidence: "high" });
    } else if (classic_vs_trendy > 0.25) {
      chips.push({ label: "トレンド寄り", confidence: "high" });
    }

    // bold は他軸と被りやすいので控えめ
    if (cautious_vs_bold > 0.4 && chips.length < 3) {
      chips.push({ label: "攻めの構成", confidence: "medium" });
    }
  }

  // 3. PCシーズン配色 — persona に pcSeason4 がある場合
  if (ctx.persona?.pcSeason4) {
    const SEASON_LABELS: Record<string, string> = {
      spring: "スプリング",
      summer: "サマー",
      autumn: "オータム",
      winter: "ウィンター",
    };
    const label = SEASON_LABELS[ctx.persona.pcSeason4];
    if (label) {
      chips.push({
        label: `${label}向け配色`,
        confidence: ctx.persona.completeness >= 60 ? "high" : "medium",
      });
    }
  }

  // 4. Stargazer 内面連携 — adaptation が実際に効いている場合
  if (ctx.adaptation && ctx.observation && ctx.observation.confidence >= 0.4) {
    if (ctx.adaptation.comfortPriority >= 0.6) {
      chips.push({ label: "コンフォート重視", confidence: "medium" });
    } else if (ctx.adaptation.formalityShift > 0.15) {
      chips.push({ label: "フォーマル寄せ", confidence: "medium" });
    } else if (ctx.adaptation.formalityShift < -0.15) {
      chips.push({ label: "リラックス寄せ", confidence: "medium" });
    }
  }

  // 5. クローゼット不足 — gap が high severity を含む場合
  if (ctx.gap && ctx.gap.gaps.some(g => g.severity === "high")) {
    chips.push({ label: "クローゼット不足あり", confidence: "high" });
  }

  // 最大5個に制限
  return chips.slice(0, 5);
}
