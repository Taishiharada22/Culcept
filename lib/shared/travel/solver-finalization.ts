/**
 * S4-C/D/E/F — Finalization: selection-ledger + time_window materializer + re-propagation + handoff（**pure・未配線**）
 *
 * 設計正本: docs/t11-s4-finalization-handoff-design.md（+ CEO 補正: accept_default stale 防止・
 *   AssemblyInputCandidate は server-only・S4 は assembler を呼ばない）
 *
 * 役割: forced 値 + 明示 ChoiceSelection を STN に適用・再伝播し、**完全解決時のみ** 非権限・server-only な
 *   `AssemblyInputCandidate` を作る。**provisionalDefault は SUGGESTION のみ・自動適用しない**。
 *
 * 厳守:
 *   - provisionalDefault を ledger 適用で読まない・nodeIntervals に copy しない・handoff 適格に数えない。
 *   - accept_default は identity 一致時のみ受理（不一致→stale_default）・選択値 = provisionalDefault 必須。
 *   - private 違反選択は neutral `selection_infeasible`（private 理由を出さない）。
 *   - **`assembleScheduledDraft` を呼ばない**・ScheduledTravelItineraryDraft/TravelItinerary/TravelCandidate を産まない。
 *   - day は forced(single_day_zero) / explicit nodeDayBindings のみ（列挙しない）。
 */

import type { EventRegion, ScheduleChoicePoint, SharedScheduleProvenance, SolverScheduleInput, SolverTimeBoundInput } from "./solver-schedule-types";
import { MATERIAL_SLACK_THRESHOLD_MIN } from "./solver-schedule-types";
import { computeSharedTemporalFeasibility, computeTemporalFeasibility } from "./solver-stn-feasibility";
import { computeSharedSequencingFeasibility } from "./solver-sequencing-feasibility";
import { detectAssemblyReadiness } from "./assembly-readiness-detector";
import type { AssemblyInput } from "./assembly-types";
import type {
  ChoiceSelection,
  HandoffBasis,
  HandoffProvenanceEntry,
  S4ResolutionInput,
  S4ResolutionResult,
  SelectionRejection,
} from "./solver-finalization-types";

// ── helpers ───────────────────────────────────────────────────────────────────

/** shared region（private narrowing 非反映）。infeasible/needs_input は null */
function sharedRegion(input: SolverScheduleInput): Record<string, EventRegion> | null {
  const r = computeSharedTemporalFeasibility(input);
  return r.outcome === "feasible_region" ? r.events : null;
}

/** ★ time_window_choice を機械 materialize（shared region slack ≥ 閾値・decision でない） */
function deriveTimeWindowChoicePoints(region: Record<string, EventRegion>): ScheduleChoicePoint[] {
  const cps: ScheduleChoicePoint[] = [];
  for (const nodeId of Object.keys(region).sort()) {
    const r = region[nodeId];
    if (r.startLatest - r.startEarliest >= MATERIAL_SLACK_THRESHOLD_MIN) {
      cps.push({
        kind: "time_window_choice",
        ref: nodeId,
        feasibleRange: { lo: r.startEarliest, hi: r.startLatest },
        namedTieBreak: "earliest_feasible",
        // ★ earliest_feasible は grounded（feasibleRange あり）ゆえ SUGGESTION を付す・自動適用しない
        provisionalDefault: r.startEarliest,
        rationale: { shared: "開始時刻は選べます（暫定提案あり・変更可）。", forParticipant: {} },
      });
    }
  }
  return cps;
}

/** 現在の shared choice 集合（S3 ordering + materialized time）。lexicographic-only ordering は provisionalDefault UNSET（S3 既定） */
function currentChoicePoints(input: SolverScheduleInput): ScheduleChoicePoint[] {
  const seq = computeSharedSequencingFeasibility(input);
  const ordering = seq.outcome === "feasible_space" ? seq.choicePoints : [];
  const reg = sharedRegion(input);
  const time = reg ? deriveTimeWindowChoicePoints(reg) : [];
  return [...ordering, ...time];
}

/** choice point identity（stale 検出用・決定論文字列） */
function fingerprint(cp: ScheduleChoicePoint): string {
  const range = cp.feasibleRange ? `${cp.feasibleRange.lo}-${cp.feasibleRange.hi}` : "";
  return `${cp.kind}|${cp.ref}|${(cp.feasibleOptions ?? []).join(",")}|${range}|${cp.provisionalDefault ?? ""}|${cp.namedTieBreak}`;
}

/** 選択値が現 choice の feasible 内か */
function validateOption(sel: ChoiceSelection, cp: ScheduleChoicePoint): boolean {
  if (sel.selected.mode === "time") {
    return cp.kind === "time_window_choice" && !!cp.feasibleRange && sel.selected.startMin >= cp.feasibleRange.lo && sel.selected.startMin <= cp.feasibleRange.hi;
  }
  if (sel.selected.mode === "ordering") {
    return cp.kind === "ordering_choice" && (cp.feasibleOptions ?? []).includes(sel.selected.option);
  }
  // ordering_pair（composite cluster の有向 pair）
  const opts = cp.feasibleOptions ?? [];
  return cp.kind === "ordering_choice" && sel.selected.from !== sel.selected.to && opts.includes(sel.selected.from) && opts.includes(sel.selected.to);
}

/** accept_default: 選択値 = provisionalDefault か（time choice のみ default あり） */
function selectionEqualsDefault(sel: ChoiceSelection, cp: ScheduleChoicePoint): boolean {
  return sel.selected.mode === "time" && cp.provisionalDefault !== undefined && sel.selected.startMin === cp.provisionalDefault;
}

/** 1 選択を STN edge へ（ordering→precedence / time→startMin pin）。**provisionalDefault を読まない** */
function applyOne(input: SolverScheduleInput, sel: ChoiceSelection): SolverScheduleInput {
  if (sel.selected.mode === "time") {
    const tb: SolverTimeBoundInput[] = [
      { nodeId: sel.ref, event: "start", kind: "no_earlier_than", minute: sel.selected.startMin, constraintId: `selection:${sel.selectionId}` },
      { nodeId: sel.ref, event: "start", kind: "no_later_than", minute: sel.selected.startMin, constraintId: `selection:${sel.selectionId}` },
    ];
    return { ...input, timeBounds: [...(input.timeBounds ?? []), ...tb] };
  }
  let from: string;
  let to: string;
  if (sel.selected.mode === "ordering") [from, to] = sel.selected.option.split("→");
  else { from = sel.selected.from; to = sel.selected.to; }
  return { ...input, selectionPrecedence: [...(input.selectionPrecedence ?? []), { from, to }] };
}

/** 解決済み region から AssemblyInput を構築（S4 所有=intervals/day・他は passthrough・発明しない） */
function buildAssemblyInput(input: SolverScheduleInput, region: Record<string, EventRegion>, extras: S4ResolutionInput["assemblyExtras"]): AssemblyInput {
  const draft = input.draft;
  const single = input.scope?.window?.kind === "single_day";
  const nodeIntervals: Record<string, { startMin: number; endMin: number }> = {};
  for (const n of draft.candidateNodes) {
    const startMin = region[n.nodeId].startEarliest; // forced/sub-threshold/selected はすべて startEarliest に収束
    const endMin = startMin + input.nodeDurations[n.nodeId]; // ★ default dwell なし（nodeDurations 必須・無→detectAssemblyReadiness が node_interval/invalid を出す）
    nodeIntervals[n.nodeId] = { startMin, endMin };
  }
  const nodeDayBindings = single ? Object.fromEntries(draft.candidateNodes.map((n) => [n.nodeId, 0])) : (input.nodeDayBindings ?? {});
  return {
    draft,
    ...(input.scope ? { scope: input.scope } : {}),
    nodeIntervals,
    nodeDayBindings,
    edgeDurations: input.edgeDurations,
    ...(extras?.nodeBudgetBands ? { nodeBudgetBands: extras.nodeBudgetBands } : {}),
    ...(extras?.edgeTransports ? { edgeTransports: extras.edgeTransports } : {}),
    ...(extras?.edgeCosts ? { edgeCosts: extras.edgeCosts } : {}),
    ...(extras?.lockWindows ? { lockWindows: extras.lockWindows } : {}),
  };
}

function buildSharedProvenance(region: Record<string, EventRegion>): SharedScheduleProvenance {
  const slackBands: Record<string, { earliestStart: number; latestStart: number }> = {};
  for (const id of Object.keys(region)) slackBands[id] = { earliestStart: region[id].startEarliest, latestStart: region[id].startLatest };
  return { intervalBasis: {}, daySource: {}, tieBreaksApplied: [], slackBands };
}

// ── main ────────────────────────────────────────────────────────────────────

/**
 * selection-ledger を適用し handoff 適格を判定（pure・決定論）。
 *   - assembly_input_candidate: 完全解決（server-only・S4 は assembler を呼ばない）
 *   - unresolved_choices: 未解決 choice / missing handoff gap（fail-closed）
 *   - selection_rejected: stale/invalid/private 違反（neutral）
 *   - infeasible / needs_input: base 不能 / explicit 欠落
 */
export function applySelectionLedger(input: S4ResolutionInput): S4ResolutionResult {
  const candidateId = input.base.draft.candidateId;

  // base feasibility
  const baseSeq = computeSharedSequencingFeasibility(input.base);
  if (baseSeq.outcome === "needs_input") return { outcome: "needs_input", authoritative: false, draft: true, candidateId, missingForSchedule: baseSeq.missingForSchedule };
  if (baseSeq.outcome === "infeasible") return { outcome: "infeasible", authoritative: false, draft: true, candidateId, infeasibility: baseSeq.infeasibility };

  // 逐次適用（各 selection を当時の surface に対し検証）
  let augmented = input.base;
  const rejections: SelectionRejection[] = [];
  const seenRefs = new Set<string>();
  const timeSelectionByNode = new Map<string, ChoiceSelection>();
  const orderingSelectionIds: string[] = [];

  for (const sel of input.ledger) {
    if (seenRefs.has(sel.ref)) { rejections.push({ selectionId: sel.selectionId, reason: "duplicate_selection" }); continue; }
    const cp = currentChoicePoints(augmented).find((c) => c.ref === sel.ref && c.kind === sel.kind);
    if (!cp) { rejections.push({ selectionId: sel.selectionId, reason: "unknown_choice" }); continue; }
    if (sel.origin === "accept_default") {
      // ★ stale 防止: 現 choice の identity と一致しなければ拒否（古い default をすり抜けさせない）
      if (cp.provisionalDefault === undefined || sel.acceptedDefaultIdentity !== fingerprint(cp)) { rejections.push({ selectionId: sel.selectionId, reason: "stale_default" }); continue; }
      if (!selectionEqualsDefault(sel, cp)) { rejections.push({ selectionId: sel.selectionId, reason: "invalid_option" }); continue; }
    }
    if (!validateOption(sel, cp)) { rejections.push({ selectionId: sel.selectionId, reason: "invalid_option" }); continue; }
    const next = applyOne(augmented, sel);
    // ★ authoritative 再検証（private 含む）。shared で valid でも private 違反なら neutral 拒否
    if (computeTemporalFeasibility(next, { includePrivate: true }).outcome !== "feasible_region") { rejections.push({ selectionId: sel.selectionId, reason: "selection_infeasible" }); continue; }
    augmented = next;
    seenRefs.add(sel.ref);
    if (sel.kind === "time_window_choice") timeSelectionByNode.set(sel.ref, sel);
    else orderingSelectionIds.push(sel.selectionId);
  }
  if (rejections.length > 0) return { outcome: "selection_rejected", authoritative: false, draft: true, candidateId, rejections };

  // 再伝播後の shared region / residual
  const reg = sharedRegion(augmented);
  if (!reg) {
    const s = computeSharedSequencingFeasibility(augmented);
    if (s.outcome === "infeasible") return { outcome: "infeasible", authoritative: false, draft: true, candidateId, infeasibility: s.infeasibility };
    return { outcome: "needs_input", authoritative: false, draft: true, candidateId, missingForSchedule: s.outcome === "needs_input" ? s.missingForSchedule : [] };
  }
  const sharedProvenance = buildSharedProvenance(reg);
  const residual = currentChoicePoints(augmented);
  if (residual.length > 0) {
    return { outcome: "unresolved_choices", authoritative: false, draft: true, candidateId, placed: [], residualChoicePoints: residual, missingForHandoff: [], sharedProvenance };
  }

  // 全 axis 解決 → AssemblyInput 構築 + detectAssemblyReadiness で全 AssemblyGap を mirror
  const assemblyInput = buildAssemblyInput(augmented, reg, input.assemblyExtras);
  const readiness = detectAssemblyReadiness(assemblyInput);
  if (!readiness.assemblyReady) {
    return { outcome: "unresolved_choices", authoritative: false, draft: true, candidateId, placed: [], residualChoicePoints: [], missingForHandoff: readiness.gaps, sharedProvenance };
  }
  // 最終 authoritative 確認（private）
  if (computeTemporalFeasibility(augmented, { includePrivate: true }).outcome !== "feasible_region") {
    return { outcome: "selection_rejected", authoritative: false, draft: true, candidateId, rejections: [{ selectionId: "handoff", reason: "selection_infeasible" }] };
  }

  // provenance / trace
  const baseReg = sharedRegion(input.base);
  const handoffProvenance: HandoffProvenanceEntry[] = [];
  const resolutionTrace: Record<string, "forced" | "explicit_selection"> = {};
  for (const n of input.base.draft.candidateNodes) {
    const ts = timeSelectionByNode.get(n.nodeId);
    if (ts) {
      handoffProvenance.push({ ref: n.nodeId, basis: ts.origin === "accept_default" ? "accepted_default" : "explicit_choice", selectionId: ts.selectionId });
      resolutionTrace[n.nodeId] = "explicit_selection";
    } else if (baseReg && baseReg[n.nodeId]?.forced) {
      handoffProvenance.push({ ref: n.nodeId, basis: "forced_by_constraint" });
      resolutionTrace[n.nodeId] = "forced";
    } else {
      // base 未 forced・time 未選択 → ordering 選択の cascade or sub-threshold
      const cascade = orderingSelectionIds.length > 0;
      const basis: HandoffBasis = cascade ? "cascade_of_choice" : "forced_by_constraint";
      handoffProvenance.push({ ref: n.nodeId, basis, ...(cascade ? { selectionId: orderingSelectionIds[0] } : {}) });
      resolutionTrace[n.nodeId] = cascade ? "explicit_selection" : "forced";
    }
  }

  return { outcome: "assembly_input_candidate", serverOnly: true, authoritative: false, draft: true, candidateId, assemblyInput, handoffProvenance, resolutionTrace };
}
