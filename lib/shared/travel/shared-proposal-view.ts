/**
 * C6-A-1 — display-safe な提案候補ビュー（**pure・private 非搭載**）
 *
 * 役割: engine 内部の `ProposalSetOutput`（private rationale / private soft / private 違反を含む）を、
 *   UI/client へ渡せる **display-safe な候補一覧 + 却下一覧** へ射影する純関数。
 *
 *   なぜ必要か: `PlanDecisionPacket`（= 決定知性）は候補ごとの角度/適合/なぜを「決定」へ畳み込むため、
 *   候補カード（3案）の表示には角度別の shared view が要る。これを engine output に **additive** で載せ、
 *   UI は engine output のみを consume する（engine-types.ts L7「中間層を直接呼ばない」境界を守る）。
 *
 * 厳守（display-safe・M5 二層）:
 *   - `forParticipant`（本人 private 説明）を **型レベルで持たない**（UI が受け取れない＝leak 不能）。
 *   - softMatches / rejected reasons は **shared のもののみ**（`toSharedProposalView` が private を除去済）。
 *   - 場所/距離/座標/具体時刻を **持たない**（solver 未実装・engine は「場所確定前の骨格」のみ）。
 */

import type { BudgetBand, ConstraintAxis, UncertaintyLevel } from "./core-types";
import type { DescriptorKey, TravelSlotKey } from "./slot-types";
import type { FitLabel, ProposalAngle, ProposalInputError, ProposalSetOutput } from "./proposal-types";
import { toSharedProposalView } from "./proposal-builder";

/** shared な soft preference 一致（どの希望が角度に効いたか・visibility は shared 固定なので持たない） */
export interface SharedSoftMatch {
  descriptorKey: DescriptorKey;
  descriptorValue: string;
}

/**
 * 候補（提案骨格）の display-safe view。
 * ★ `forParticipant` を field に持たない＝本人 private 説明は構造的に露出不能。
 */
export interface SharedProposalView {
  candidateId: string;
  angle: ProposalAngle;
  title: string;
  summary: string;
  /** 場所/エリアの placeholder（解決前。"未指定" もあり） */
  areaPlaceholder: string;
  budgetBand: BudgetBand | null;
  /** 2 人合意 pace への適合（fit / stretch / conflict） */
  paceFit: FitLabel;
  /** 移動許容への適合（fit / stretch / conflict） */
  mobilityFit: FitLabel;
  /** この角度に効いた共有希望（shared のみ） */
  softMatches: SharedSoftMatch[];
  uncertainty: UncertaintyLevel;
  /** この提案に不足している入力（slot key） */
  missingInputs: TravelSlotKey[];
  /** rationale.shared のみ（forParticipant は型に持たない＝leak 不能） */
  whyShared: string;
}

/** 却下された角度の display-safe view（「なぜ選ばなかったか」の透明性） */
export interface RejectedAngleView {
  angle: ProposalAngle;
  /** shared 違反のみ（private owner の違反は toSharedProposalView が存在ごと除去） */
  reasons: { axis: ConstraintAxis; descriptor: string }[];
}

/** engine output に additive で載せる display-safe 候補/却下ビュー */
export interface SharedProposalDisplay {
  proposals: SharedProposalView[];
  rejected: RejectedAngleView[];
  inputError: ProposalInputError | null;
}

/**
 * `ProposalSetOutput` → display-safe 候補/却下ビュー。決定論・副作用なし。
 *   private（forParticipant / private soft / private 違反）は `toSharedProposalView` が除去済。
 *   本関数はその shared 射影を UI 表示用の bounded 形へ写すのみ（権限/raw を生成しない）。
 */
export function toSharedProposalDisplay(result: ProposalSetOutput): SharedProposalDisplay {
  const shared = toSharedProposalView(result);
  return {
    proposals: shared.proposals.map((p) => ({
      candidateId: p.candidateId,
      angle: p.angle,
      title: p.title,
      summary: p.summary,
      areaPlaceholder: p.areaPlaceholder,
      budgetBand: p.budgetBand,
      paceFit: p.paceFit,
      mobilityFit: p.mobilityFit,
      softMatches: p.softPreferenceMatches.map((m) => ({
        descriptorKey: m.descriptorKey,
        descriptorValue: m.descriptorValue,
      })),
      uncertainty: p.uncertainty,
      missingInputs: p.missingInputs,
      whyShared: p.rationale.shared,
    })),
    rejected: shared.rejected.map((r) => ({
      angle: r.angle,
      reasons: r.violations.map((v) => ({ axis: v.axis, descriptor: v.descriptor })),
    })),
    inputError: result.inputError,
  };
}
