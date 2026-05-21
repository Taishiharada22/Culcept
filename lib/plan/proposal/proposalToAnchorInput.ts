/**
 * Proposal Draft → Create Anchor Input Converter — Phase 3-J-6e-3。
 *
 * 設計書: docs/alter-plan-phase3-predictive-day-orchestration-architecture.md
 *   §3.1 J-6 / accept transaction (= J-6e-3 detailed plan §1)
 *
 * 役割:
 *   ProposedAnchor.draft (= Partial<ExternalAnchor>) を完全な CreateExternalAnchorInput に変換する pure 関数。
 *   accept transaction の step 4 で使用、 必須 field 欠落 / sensitive 混入 / unsupported anchorKind を
 *   discriminated union で reject。
 *
 * 不変原則:
 *   - sensitive は **必ず** reject (= defensive、 上流 computeProposals + ProposalIntegrityContract で除外済の二重防御)
 *   - one_off のみ受理 (= MVP、 recurring は別 phase)
 *   - pure (= 副作用 / mutate なし)
 */

import type { CreateExternalAnchorInput } from "@/lib/plan/external-anchor-input";

import type { ProposedAnchor } from "./proposalTypes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Result
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type BuildAnchorInputResult =
  | { readonly ok: true; readonly input: CreateExternalAnchorInput }
  | {
      readonly ok: false;
      readonly reason:
        | "missing_title"
        | "missing_startTime"
        | "missing_rigidity"
        | "missing_date"
        | "sensitive_not_allowed"
        | "unsupported_anchor_kind";
    };

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Builder
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * ProposedAnchor から CreateExternalAnchorInput を構築。
 *
 * 検証順 (= 早期 return):
 *   1. sensitive 混入 → reject (= defensive)
 *   2. anchorKind one_off 以外 → reject (= MVP)
 *   3. 必須 field (title / startTime / rigidity / date) 欠落 → reject
 *   4. OK → input 構築
 *
 * sourceType は accept transaction 側 (= acceptProposal の bundle builder) で "manual" に確定するが、
 * anchor input にも sourceType: "manual" を明示的に設定 (= API validation 通過必要)。
 */
export function buildAnchorInputFromProposal(
  proposal: ProposedAnchor,
): BuildAnchorInputResult {
  const d = proposal.draft;

  // sensitive 混入は defensive で reject (= 上流で除外済を信頼しつつ二重防御)
  if (d.sensitiveCategory != null) {
    return { ok: false, reason: "sensitive_not_allowed" };
  }

  // MVP: one_off のみ
  if (d.anchorKind !== "one_off") {
    return { ok: false, reason: "unsupported_anchor_kind" };
  }

  // 必須 field
  if (typeof d.title !== "string" || d.title.length === 0) {
    return { ok: false, reason: "missing_title" };
  }
  if (typeof d.startTime !== "string" || d.startTime.length === 0) {
    return { ok: false, reason: "missing_startTime" };
  }
  if (typeof d.rigidity !== "string" || d.rigidity.length === 0) {
    return { ok: false, reason: "missing_rigidity" };
  }
  if (typeof d.date !== "string" || d.date.length === 0) {
    return { ok: false, reason: "missing_date" };
  }

  const input: CreateExternalAnchorInput = {
    title: d.title,
    startTime: d.startTime,
    rigidity: d.rigidity,
    sourceType: "manual",
    anchorKind: "one_off",
    date: d.date,
    // optional fields
    ...(typeof d.endTime === "string" && d.endTime.length > 0
      ? { endTime: d.endTime }
      : {}),
    ...(typeof d.locationText === "string" && d.locationText.length > 0
      ? { locationText: d.locationText }
      : {}),
    ...(typeof d.locationCategory === "string"
      ? { locationCategory: d.locationCategory }
      : {}),
  } as CreateExternalAnchorInput;

  return { ok: true, input };
}
