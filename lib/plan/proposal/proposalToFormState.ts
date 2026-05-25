/**
 * Proposal Draft → AnchorFormState Converter (= Phase 3-J-5 modify path)。
 *
 * 設計書: docs/alter-plan-phase3-predictive-day-orchestration-architecture.md
 *   §3.1 J-5 / §10.1 Smoke 5
 *
 * 役割:
 *   ProposedAnchor.draft (= Partial<ExternalAnchor>) を AddAnchorModal の
 *   initialState (= Partial<AnchorFormState>) に変換する pure helper。
 *
 *   既存 AddAnchorModal が initialState prop を持つので、 そこに渡せば
 *   Place picker (= Phase 2-D) + 各種 form field が prefill された状態で開く。
 *   Phase 2 file 変更ゼロ で modify path が成立する。
 *
 * 不変原則:
 *   - Invariant 4 privacy first: sensitiveCategory は **絶対に渡さない**
 *     (= ProposalIntegrityContract sensitiveExcluded で proposal 生成時除外済を再保証)
 *   - Invariant 10 ProposedAnchor を mutate しない
 *   - Invariant 37 Proposal Integrity Contract 再検査
 *
 * 範囲外:
 *   - recurring proposal の RRULE → selectedWeekdays 完全変換
 *     (= proposal は通常 one_off、 recurring 時は validity 日付のみ prefill、
 *        user が weekday 選択を再 input する degraded UX)
 *   - sourceType の override (= form default に委ねる)
 */

import type { AnchorFormState } from "@/lib/plan/anchor-input-form";

import {
  PROPOSAL_INTEGRITY_CONTRACT,
  assertProposalCompliance,
} from "./proposalIntegrityContract";
import type { ProposedAnchor } from "./proposalTypes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Converter
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * ProposedAnchor.draft → Partial<AnchorFormState>。
 *
 * 変換規約:
 *   - draft.title         → form.title           (= 文字列のみ)
 *   - draft.startTime     → form.startTime
 *   - draft.endTime       → form.endTime
 *   - draft.rigidity      → form.rigidity        (= "soft" | "hard")
 *   - draft.locationText  → form.locationText
 *   - draft.locationCategory → form.locationCategory
 *   - draft.sensitiveCategory → **excluded** (= Invariant 4)
 *   - draft.anchorKind === "one_off"   → form.kind="one_off"、 form.date=draft.date
 *   - draft.anchorKind === "recurring" → form.kind="recurring"、 validFrom/validUntil prefill
 *     (= selectedWeekdays は form default で empty、 user が再 input)
 *
 * 副作用なし、 mutate なし。
 */
export function proposalDraftToFormState(
  proposal: ProposedAnchor,
): Partial<AnchorFormState> {
  assertProposalCompliance(proposal, PROPOSAL_INTEGRITY_CONTRACT);

  const d = proposal.draft;
  const out: Partial<AnchorFormState> = {};

  // 共通 field
  if (typeof d.title === "string") out.title = d.title;
  if (typeof d.startTime === "string") out.startTime = d.startTime;
  if (typeof d.endTime === "string") out.endTime = d.endTime;
  if (typeof d.rigidity === "string") out.rigidity = d.rigidity;
  if (typeof d.locationText === "string") out.locationText = d.locationText;
  if (typeof d.locationCategory === "string") {
    out.locationCategory = d.locationCategory;
  }

  // ⚠️ sensitiveCategory は **意図的に除外** (= Invariant 4 privacy first)。
  // proposal 生成時に既に除外されているはずだが、 念押し。

  // anchorKind 別 field
  if (d.anchorKind === "one_off") {
    out.kind = "one_off";
    if (typeof d.date === "string") out.date = d.date;
  } else if (d.anchorKind === "recurring") {
    out.kind = "recurring";
    if (typeof d.validFrom === "string") out.validFrom = d.validFrom;
    if (typeof d.validUntil === "string") out.validUntil = d.validUntil;
    // selectedWeekdays は form default (= []) に委ねる
    // recurrenceRule の解析 → weekday 抽出は scope 外 (= 通常 one_off で proposal)
  }

  // sourceType は form default に委ねる (= sourceType="" → defaultSourceTypeForKind)

  return out;
}
