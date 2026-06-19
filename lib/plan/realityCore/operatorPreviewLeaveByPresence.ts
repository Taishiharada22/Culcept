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
import { leaveByComputationViolations, type LeaveByComputationV0 } from "./leaveByComputation";
import type { LeaveBySupplyScopeV0 } from "./leaveBySupply";
import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import type { EventRealityNodeV0 } from "./eventRealityNode";
import type { RealityInstant } from "./realityInstant";

export const OPERATOR_PREVIEW_LEAVEBY_PRESENCE_VERSION = 0;

/**
 * toHHMM — DB 由来の時刻文字列を canonical `HH:MM` に正規化（fail-closed）。
 *   実 anchor の `start_time`/`end_time` は Postgres `time` 型で `"16:00:00"`（HH:MM:SS）として返るため、
 *   `HH:MM`（手書き fixture）と `HH:MM:SS`（実 DB）の両形を受理し先頭 5 文字に切り詰める。
 *   非文字列 / ISO / 形式不一致は **null**（materialize しない・捏造しない）。
 *   注: RD3x-P2 初版は `/^\d{2}:\d{2}$/` のみで実 DB の HH:MM:SS を弾いていた（staging smoke が HH:MM fixture で隠蔽）。
 */
function toHHMM(s: unknown): string | null {
  if (typeof s !== "string") return null;
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(s)) return null;
  return s.slice(0, 5);
}

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
  const anchorStart = toHHMM(anchor.startTime); // 実 DB は HH:MM:SS・手書き fixture は HH:MM（両受理・null=不正）
  if (anchorStart === null) return null; // ISO/非 HH:MM(:SS) は materialize しない（fail-closed）
  const arrivalTargetInstant = `${subjectiveDate}T${anchorStart}:00+09:00`;

  // 同日 earlier sibling（endTime あり・最も遅く終わるもの）を previous_event_end origin として採用
  let prev: OperatorSeedSupplyContextV0["origin"] = null;
  let prevEnd = "";
  for (const s of dayAnchors) {
    if (s === anchor) continue;
    const sStart = toHHMM(s.startTime);
    const sEnd = toHHMM(s.endTime);
    if (sStart === null || sEnd === null) continue; // start/end どちらか欠落・不正 → sibling 不採用
    if (!(sStart < anchorStart)) continue; // 正規化済 HH:MM 同士で比較（mixed format でも安定）
    if (prev !== null && !(sEnd > prevEnd)) continue;
    prevEnd = sEnd;
    prev = {
      originInferenceStage: "previous_event_end",
      dayGraphDate: subjectiveDate,
      dayGraphSnapshotId: `daygraph:${subjectiveDate}`,
      previousEvent: {
        nodeId: ernIdOf(subjectiveDate, s.id),
        endTimeHHMM: sEnd,
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
 * buildAttachedNodes — consume loop を走らせ、computed leaveBy を **attach 済みの ERN 群**を返す（pure・async・internal）。
 *   RD3x-P2（safe boolean）と RD3g-P1（departure line candidate）の **共有パイプライン**。何も attach されなければ空配列。
 *   返り値の `leaveByComputed`（internal LeaveByComputationV0）は **本 module 内でのみ検査**し、呼び元には boolean だけ渡す。
 */
async function buildAttachedNodes(
  input: OperatorPreviewLeaveByPresenceInputV0,
): Promise<ReadonlyArray<EventRealityNodeV0>> {
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

  if (candidates.length === 0) return [];

  // attach seam（再検証）を通った時のみ leaveByComputed が attach される。internal object は外へ出さない。
  const out = assembleLeaveByBindings({
    eventRealityNodes: stubErns,
    supplyCandidates: candidates,
    consumingInstant: input.consumingInstant,
    ernScopeByNodeId: scopeByNode,
  });
  return out.eventRealityNodes;
}

/**
 * deriveOperatorPreviewLeaveByComputedPresent — RD3x-P2（L1 safe boolean）: 当日のどれかの event に computed leaveBy が
 *   attach されたかだけを boolean で返す（pure・async）。何も attach されなければ false。boolean 以外は返さない。
 */
export async function deriveOperatorPreviewLeaveByComputedPresent(
  input: OperatorPreviewLeaveByPresenceInputV0,
): Promise<boolean> {
  const nodes = await buildAttachedNodes(input);
  return nodes.some((e) => e.leaveByComputed !== undefined);
}

/**
 * gateBSatisfied — internal computed object（LeaveByComputationV0）が **L2 departure line の Gate B 安全条件**を満たすか（pure）。
 *   RD3g-0 §2-A/§2-C のうち computed object 上で検査可能な不変条件を再確認する（defense-in-depth）。
 *   ※ §2-B の fuel 条件（arrival fixed+confirmed / origin valid / scope 一致 / 非stale）は adapter が status="computed" を
 *      emit する前提として既に強制済み（不成立なら uncomputed → ここに到達しない）。
 *   boolean 以外は返さない（internal object/exact instant を呼び元へ出さない）。
 */
export function gateBSatisfied(c: LeaveByComputationV0): boolean {
  return (
    c.status === "computed" &&
    leaveByComputationViolations(c).length === 0 && // walker green（forged/不整合 computed を排除）
    c.sourceTimeEstimateRef !== null &&
    c.bufferRef !== null &&
    c.originEvidencePresent === true &&
    c.timeEstimateUsableForPlanning === true && // durationValue usable + planning gate
    c.source !== "none" && // planning-grade time source のみ（heuristic/none 排除）
    c.originUsabilityKind !== "current_location_candidate" && // currentLocation 由来排除
    c.originUsabilityKind !== "unknown"
  );
}

/**
 * deriveOperatorPreviewDepartureLinePresence — RD3g-P1（L2 dev-only departure line candidate）: 当日のどれかの event に
 *   **Gate B 全 AND を満たした computed leaveBy** が存在するかだけを boolean で返す（pure・async・presence-only）。
 *   exact instant / leaveByInstant / timeContract / *Ref / durationValue は**一切返さない**（boolean だけ）。
 *   safe boolean（leaveByComputedPresent）より厳しい: computed 存在に加え Gate B 安全 field を再確認する。
 */
export async function deriveOperatorPreviewDepartureLinePresence(
  input: OperatorPreviewLeaveByPresenceInputV0,
): Promise<boolean> {
  const nodes = await buildAttachedNodes(input);
  return nodes.some((e) => e.leaveByComputed !== undefined && gateBSatisfied(e.leaveByComputed));
}
