/**
 * operatorPreviewLeaveByPresence — RD3x-P2（2026-06-16）: operator real-data preview の **safe boolean 抽出**（pure・no-DB）
 *
 * 正本設計: docs/reality-operator-seed-activation-plan-rd3x-0.md（RD3x-P2）
 *
 * 思想（computed leaveBy を「出す」のではなく「あるか」だけを出す）:
 *   RD3x-P1 の consume loop（confirmation → durationValue → RD2e-SUPPLY → computed leaveBy → attach）を operator real-data
 *   preview path で走らせ、**schema-state boolean（`leaveByComputedPresent`）だけ**を返す。exact instant / leaveByInstant /
 *   arrivalTargetInstant / timeContract / *Ref / durationValue / capability / supply bundle / trace / reason は**一切返さない**。
 *
 * honest 供給（fake しない）:
 *   - durationValue は **real duration_confirmation row** 由来（caller が read-only で供給）。
 *   - arrival / buffer / origin は **real day anchor**（startTime / rigidity / 同日 earlier sibling の endTime）由来。
 *   - 派生不能（startTime 非 HH:MM / earlier sibling 不在 / startTimeSource 非 confirmed 等）→ supply incomplete → uncomputed → false。
 *   - row が当日 event を指さない / scope 不一致 → skip（fail-closed）。fixture へ fallback しない。
 *
 * 不変条件: pure（IO/時刻 API/乱数なし・instant/now は caller 供給）・DB read を行わない・MovementReality/Feasibility/Risk/
 *   Permission を import しない・boolean 以外を返さない・raw location/title を内部 ref に echo しない。
 */
import {
  consumeDurationConfirmationForLeaveBy,
  type OperatorSeedSupplyContextV0,
} from "./operatorSeedConsume";
import type { DurationConfirmationRowV0 } from "./durationConfirmation";
import type { DurationConfirmationRequestScopeV0 } from "./durationConfirmationAdapter";
import { assembleLeaveByBindings, type LeaveBySupplyCandidateV0 } from "./leaveByAssembly";
import type { LeaveBySupplyScopeV0 } from "./leaveBySupply";
import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import type { EventRealityNodeV0 } from "./eventRealityNode";
import type { RealityInstant } from "./realityInstant";

export const OPERATOR_PREVIEW_LEAVEBY_PRESENCE_VERSION = 0;

const HHMM = /^\d{2}:\d{2}$/;

/** day anchor の ERN id（compileEventRealityNodes:191 と同形・`ern:${subjectiveDate}:${anchorId}`）。 */
function ernIdOf(subjectiveDate: string, anchorId: string): string {
  return `ern:${subjectiveDate}:${anchorId}`;
}

/**
 * deriveSupplyContext — real day anchor から honest な arrival/buffer/origin を導出（fake しない・null=派生不能）。
 *   arrival: anchor.startTime（HH:MM のみ）+ startTimeSource。buffer: anchor.rigidity（highCommitment は v0=false）。
 *   origin: 同日で時間的に前の sibling（endTime あり）の previous_event_end。earlier sibling 不在 → origin null → uncomputed。
 */
function deriveSupplyContext(
  anchor: ExternalAnchor,
  dayAnchors: ReadonlyArray<ExternalAnchor>,
  subjectiveDate: string,
  evaluatedAtIso: string,
): OperatorSeedSupplyContextV0 | null {
  if (!HHMM.test(anchor.startTime)) return null; // ISO/非 HH:MM は materialize しない（fail-closed）
  const arrivalTargetInstant = `${subjectiveDate}T${anchor.startTime}:00+09:00`;

  // 同日 earlier sibling（endTime あり・最も遅く終わるもの）を previous_event_end origin として採用
  let prev: OperatorSeedSupplyContextV0["origin"] = null;
  let prevEnd = "";
  for (const s of dayAnchors) {
    if (s === anchor) continue;
    if (typeof s.endTime !== "string" || !HHMM.test(s.endTime)) continue;
    if (!HHMM.test(s.startTime) || !(s.startTime < anchor.startTime)) continue;
    if (prev !== null && !(s.endTime > prevEnd)) continue;
    prevEnd = s.endTime;
    prev = {
      originInferenceStage: "previous_event_end",
      dayGraphDate: subjectiveDate,
      dayGraphSnapshotId: `daygraph:${subjectiveDate}`,
      previousEvent: {
        nodeId: ernIdOf(subjectiveDate, s.id),
        endTimeHHMM: s.endTime,
        durationSource: "explicit",
        boundaryClipped: false,
        // honest: origin の location tri-state（present/redacted_sensitive/absent）を sibling の実データで導出。
        // sensitive anchor は redacted（location を echo しない）。location 不在なら origin unavailable（uncomputed・honest）。
        locationText: typeof s.locationText === "string" && s.locationText.length > 0 ? s.locationText : undefined,
        sensitive: s.sensitiveCategory !== undefined,
        startTimeSource: s.startTimeSource ?? "unknown",
        anchorRef: `origin-prev:${subjectiveDate}`,
      },
    };
  }

  return {
    evaluatedAtIso,
    arrival: {
      arrivalTargetInstant,
      arrivalTargetRef: `arr:${subjectiveDate}`,
      targetEventDate: subjectiveDate,
      startTimeSource: anchor.startTimeSource ?? "unknown",
      sourceRefs: ["anchor-start"],
      evidenceRefs: ["anchor-start-ev"],
    },
    buffer: {
      bufferPolicyId: `buf:${subjectiveDate}`,
      bufferScopeRef: `bscope:${subjectiveDate}`,
      rigidity: anchor.rigidity,
      highCommitment: false,
      freshness: "valid",
      sourceRefs: ["anchor-rigidity"],
      evidenceRefs: ["anchor-rigidity-ev"],
    },
    origin: prev,
  };
}

export interface OperatorPreviewLeaveByPresenceInputV0 {
  readonly dayAnchors: ReadonlyArray<ExternalAnchor>;
  /** read-only で供給される real duration_confirmation rows（active のみ・caller が owner-RLS select）。 */
  readonly durationConfirmationRows: ReadonlyArray<DurationConfirmationRowV0>;
  readonly subjectiveDate: string;
  /** canonical JST minute（event evaluatedAt 相当・skew 0 にする）。 */
  readonly evaluatedAtIso: string;
  readonly consumingInstant: RealityInstant;
  /** validUntil staleness 判定用 now（canonical JST）。 */
  readonly nowIso: string | null;
}

/**
 * deriveOperatorPreviewLeaveByComputedPresent — real anchor + real confirmation rows から consume loop を走らせ、
 *   **「当日のどれかの event に computed leaveBy が attach されたか」だけ**を boolean で返す（pure・async）。
 *   何も attach されなければ false（fail-closed）。boolean 以外は返さない（internal leaveBy は外へ出さない）。
 */
export async function deriveOperatorPreviewLeaveByComputedPresent(
  input: OperatorPreviewLeaveByPresenceInputV0,
): Promise<boolean> {
  // 当日 anchor を ERN id で index（row.scope.targetNodeId と照合）
  const anchorByErn = new Map<string, ExternalAnchor>();
  for (const a of input.dayAnchors) anchorByErn.set(ernIdOf(input.subjectiveDate, a.id), a);

  const candidates: LeaveBySupplyCandidateV0[] = [];
  const stubErns: EventRealityNodeV0[] = [];
  const scopeByNode: Record<string, LeaveBySupplyScopeV0> = {};

  for (const row of input.durationConfirmationRows) {
    if (row.scope.subjectiveDate !== input.subjectiveDate) continue; // 当日でない seed は skip
    const anchor = anchorByErn.get(row.scope.targetNodeId);
    if (anchor === undefined) continue; // row が当日 event を指さない → skip（fixture fallback しない）

    const ctx = deriveSupplyContext(anchor, input.dayAnchors, input.subjectiveDate, input.evaluatedAtIso);
    if (ctx === null) continue; // honest 供給を作れない → uncomputed

    const reqScope: DurationConfirmationRequestScopeV0 = {
      targetNodeId: row.scope.targetNodeId,
      subjectiveDate: row.scope.subjectiveDate,
      transportMode: row.scope.transportMode,
      temporalScopeRef: row.scope.temporalScopeRef,
    };
    const cand = await consumeDurationConfirmationForLeaveBy([row], reqScope, ctx, input.nowIso);
    if (cand === null) continue; // scope/stale/supply incomplete/非 computed

    candidates.push(cand);
    scopeByNode[cand.eventRealityNodeId] = cand.computedScope;
    if (!stubErns.some((e) => e.eventRealityNodeId === cand.eventRealityNodeId)) {
      stubErns.push({
        eventRealityNodeId: cand.eventRealityNodeId,
        subjectiveDate: input.subjectiveDate,
        leaveBy: { value: null, whyUnresolved: ["eta_source_missing"] },
      } as unknown as EventRealityNodeV0);
    }
  }

  if (candidates.length === 0) return false;

  // attach seam（再検証）を通った時のみ present=true。internal leaveByComputed は外へ出さない（boolean だけ返す）。
  const out = assembleLeaveByBindings({
    eventRealityNodes: stubErns,
    supplyCandidates: candidates,
    consumingInstant: input.consumingInstant,
    ernScopeByNodeId: scopeByNode,
  });
  return out.eventRealityNodes.some((e) => e.leaveByComputed !== undefined);
}
