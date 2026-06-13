/**
 * compileEventRealityNodes — DayGraph → EventRealityNodeV0 の pure compile adapter（RC1b）
 *
 * 正本: docs/reality-core-guardrail-r05.md §7-8 / CEO RC1 GO 追加ガード 1-8
 *
 * 入力: BuildDayGraphResult.graph（計算済み・再計算しない）+ anchors + sources（origin 判定用）。
 * 出力: EventRealityNodeV0[]（event node のみ。start/end/gap は対象外）。
 *
 * 規律:
 *  - pure（I/O・DB・localStorage・時刻 API・乱数なし）。新規 read ゼロ・保存ゼロ
 *  - 既存 kernel（authority/permission/post-event-recompute/lsat）は**参照のみ・実行は最小**
 *    （LSAT は呼ばない — 仮分布の捏造禁止。recomputeAfterDrift も呼ばない — drift シナリオが無い）
 *  - 不明は unknown / blocked 側に倒す（ガード 6）。値の捏造より欠測の正直表示
 *  - UI / route / PlanClient への接続なし（RC1d は別 GO）
 */

import type { DayGraph, EventNode } from "@/lib/plan/dayGraph/dayGraphTypes";
import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import type { ExternalAnchorSource } from "@/lib/plan/external-anchor-source";
import type { PlanItemFlexibility, PlanItemOrigin } from "@/lib/plan/reality/authority";
import type { PermissionLevel } from "@/lib/plan/reality/permission/permission-model";
import {
  blockedAttribute,
  heuristicAttribute,
  inferredAttribute,
  realityAttributeViolations,
  unknownAttribute,
  type RealityAttribute,
} from "./realityAttribute";
import {
  EVENT_REALITY_ATTRIBUTE_KEYS,
  type ChangeEligibilityValue,
  type EventRealityNodeV0,
  type FixednessValue,
  type LeaveByUnresolvedReason,
} from "./eventRealityNode";

export interface CompileEventRealityInput {
  /** 暦日（DayGraph キーと同一の "YYYY-MM-DD"） */
  date: string;
  graph: DayGraph;
  anchors: ReadonlyArray<ExternalAnchor>;
  /** origin 判定用（無い/引けない anchor は unknown origin = blocked 側） */
  sources?: ReadonlyArray<ExternalAnchorSource>;
}

/** 主観日境界 05:00（dayState/timeOfDay と同一規約） */
const SUBJECTIVE_DAY_START_HOUR = 5;

function subjectiveDateOf(date: string, startHHMM: string): string {
  const h = Number(startHHMM.slice(0, 2));
  if (Number.isNaN(h) || h >= SUBJECTIVE_DAY_START_HOUR) return date;
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** sourceType → PlanItemOrigin（既存語彙への写像。判定不能は "unknown" = blocked 側） */
function resolveOrigin(
  anchor: ExternalAnchor,
  sourcesById: ReadonlyMap<string, ExternalAnchorSource>,
): PlanItemOrigin | "unknown" {
  const src = sourcesById.get(anchor.sourceId);
  if (!src) return "unknown";
  // manual = 本人の手入力。それ以外（template/pdf/image/chat/ics）は外部取り込み扱い。
  // alter_generated は v0 では判別材料が無いため割り当てない（誤って自律度を上げない）
  return src.sourceType === "manual" ? "user" : "imported";
}

/** v0 写像: hard→locked / soft→movable（shortenable/droppable は立てる材料が無い — 保守） */
function flexibilityOf(rigidity: ExternalAnchor["rigidity"]): PlanItemFlexibility {
  return rigidity === "hard" ? "locked" : "movable";
}

function compileOne(
  node: EventNode,
  input: CompileEventRealityInput,
  anchorsById: ReadonlyMap<string, ExternalAnchor>,
  sourcesById: ReadonlyMap<string, ExternalAnchorSource>,
  laterStrictExists: boolean,
): EventRealityNodeV0 {
  const anchor = anchorsById.get(node.anchorId);
  const origin = anchor ? resolveOrigin(anchor, sourcesById) : "unknown";

  // ── fixedness（既存 3 語彙の束。anchor 欠落時は node.rigidity を信頼しつつ inferred） ──
  const rigidity = node.rigidity;
  const fixedness = inferredAttribute<FixednessValue>(
    { rigidity, latencyTolerance: node.latencyTolerance, flexibility: flexibilityOf(rigidity) },
    origin === "user" ? 0.8 : 0.6,
    ["anchor_rigidity", "latency_tolerance"],
    { source: origin === "user" ? "known_from_user" : "derived", status: origin === "user" ? "confirmed" : "inferred", displayPolicy: "visible" },
  );

  // ── placeCertainty: RC1 は常に unknown（場所解決の供給後。捏造しない） ──
  const placeCertainty = unknownAttribute<number>({
    evidenceRefs: node.locationText !== undefined ? ["location_text_present_unresolved"] : [],
  });

  // ── movementRequired: transition の到着側なら true。それ以外は unknown（「不要」を断定しない —
  //    DayGraph は event 間の移動しか見ておらず、自宅→初回予定等は観測外） ──
  const isTransitionTarget = input.graph.transitions.some((t) => t.toNodeId === node.id);
  const movementRequired: RealityAttribute<boolean> = isTransitionTarget
    ? inferredAttribute(true, 0.7, ["movement_transition_present"], { displayPolicy: "visible" })
    : unknownAttribute<boolean>({ evidenceRefs: ["no_movement_signal"], displayPolicy: "hidden" });

  // ── departureStatus: 3-K では構造的に unresolved（MovementResolutionStatus 再利用） ──
  const departureStatus = inferredAttribute<"unresolved" | "resolved">(
    "unresolved",
    0.9,
    ["movement_timing_unresolved_3k"],
    { source: "derived", displayPolicy: "visible" },
  );

  // ── leaveBy: ETA 分布が無い限り null（ガード 8）。whyUnresolved を必ず明示 ──
  const whyUnresolved: LeaveByUnresolvedReason[] = [];
  if (node.locationText === undefined) whyUnresolved.push("place_missing");
  else whyUnresolved.push("route_missing");
  whyUnresolved.push("eta_source_missing");
  const leaveBy = {
    ...unknownAttribute<string>({ evidenceRefs: [], displayPolicy: "hidden" }),
    whyUnresolved: whyUnresolved as ReadonlyArray<LeaveByUnresolvedReason>,
  };

  // ── cascadeSensitivity: 後続に strict/tight 予定が「存在する」構造のみ（影響の断定はしない — ガード 4） ──
  const cascadeSensitivity = inferredAttribute<boolean>(
    laterStrictExists,
    0.7,
    laterStrictExists ? ["strict_event_follows"] : ["no_strict_event_follows"],
    { source: "derived", displayPolicy: "debugOnly" },
  );

  // ── energyCost: duration×verb の heuristic 0-1（confidence ≤0.35・debugOnly・行動判断に使わない — ガード 7） ──
  const verbFactor = node.verb === "social" || node.verb === "work" ? 1.2 : node.verb === "rest" ? 0.5 : 1;
  const energyCost = heuristicAttribute<number>(
    Math.min(1, (node.durationMin / 300) * verbFactor),
    0.3,
    ["duration_heuristic", "verb_heuristic"],
  );

  // ── interpersonalLoad: 構造化供給まで unknown（自由文から推測しない） ──
  const interpersonalLoad = unknownAttribute<"high" | "low">({
    evidenceRefs: node.verb === "social" ? ["social_verb_present_unstructured"] : [],
    displayPolicy: "hidden",
  });

  // ── permissionLevel / changeEligibility: 不明は blocked 側（ガード 6）。v0 上限 = Level 2（候補を提案） ──
  let permissionLevel: RealityAttribute<PermissionLevel>;
  let changeEligibility: RealityAttribute<ChangeEligibilityValue>;
  if (origin === "unknown" || !anchor) {
    permissionLevel = blockedAttribute<PermissionLevel>(["unknown_origin"], { value: 0, confidence: 0 });
    changeEligibility = blockedAttribute<ChangeEligibilityValue>(["unknown_origin"], {
      value: {
        canSuggestMove: false,
        canSuggestShorten: false,
        canSuggestSkip: false,
        canSuggestDelegate: false,
        requiresConfirmation: true,
        requiresExternalCommunication: true, // 不明 = 他者性あり得る側に倒す
        blockedReason: null,
      },
    });
  } else {
    const mayInvolveOthers = node.verb === "social" || node.verb === "work" || node.sensitive;
    const isUserSoft = origin === "user" && rigidity === "soft";
    const level: PermissionLevel = isUserSoft ? 2 : 1; // v0 上限 2（提案まで）。自動系 3+ は付与しない
    permissionLevel = inferredAttribute<PermissionLevel>(
      level,
      origin === "user" ? 0.7 : 0.5,
      ["origin_" + origin, "rigidity_" + rigidity],
      { displayPolicy: "visible" },
    );
    changeEligibility = inferredAttribute<ChangeEligibilityValue>(
      {
        canSuggestMove: isUserSoft && !mayInvolveOthers,
        canSuggestShorten: false,
        canSuggestSkip: false,
        canSuggestDelegate: false,
        // 本人所有の soft × 非対人だけ確認なし提案可。それ以外は確認必須（ガード 6）
        requiresConfirmation: !(isUserSoft && !mayInvolveOthers),
        requiresExternalCommunication: mayInvolveOthers && node.verb !== "rest",
        blockedReason: null,
      },
      origin === "user" ? 0.7 : 0.5,
      ["origin_" + origin, "rigidity_" + rigidity, ...(mayInvolveOthers ? ["may_involve_others"] : [])],
      { displayPolicy: "visible" },
    );
  }

  return {
    schemaVersion: 0,
    eventRealityNodeId: `ern:${input.date}:${node.anchorId}`,
    date: input.date,
    subjectiveDate: subjectiveDateOf(input.date, node.startTime),
    sourceRefs: {
      anchorId: node.anchorId,
      dayGraphNodeId: node.id,
      dayGraphSnapshotId: input.graph.snapshotId,
    },
    displayLabel: node.displayLabel,
    timeWindow: {
      startHHMM: node.startTime,
      endHHMM: node.endTime,
      durationMin: node.durationMin,
      timeBucket: node.timeBucket,
      durationSource: node.durationSource, // RJ1a-A: explicit/assumed_default を判断器へ伝える
    },
    verb: node.verb,
    sensitiveFlagged: node.sensitive, // RC2c-1A: sensitive flag（boolean・true=flagged 強 gate / false=未検出≠確認済み安全）
    fixedness,
    placeCertainty,
    movementRequired,
    departureStatus,
    leaveBy,
    cascadeSensitivity,
    energyCost,
    interpersonalLoad,
    permissionLevel,
    changeEligibility,
    resolvedOrigin: origin,
  };
}

export function compileEventRealityNodes(input: CompileEventRealityInput): EventRealityNodeV0[] {
  const anchorsById = new Map(input.anchors.map((a) => [a.id, a]));
  const sourcesById = new Map((input.sources ?? []).map((s) => [s.id, s]));
  const eventNodes = input.graph.nodes.filter((n): n is EventNode => n.kind === "event");

  return eventNodes.map((node) => {
    // 後続 strict/tight の存在（時刻ベース — 配列 index に依存しない）
    const laterStrictExists = eventNodes.some(
      (other) =>
        other.id !== node.id &&
        other.startTime > node.startTime &&
        (other.latencyTolerance === "strict" || other.latencyTolerance === "tight"),
    );
    return compileOne(node, input, anchorsById, sourcesById, laterStrictExists);
  });
}

/** node 全 10 属性の INV-RC1 違反列挙（空 = 適合）。RC1c fixture と将来の監査が使用 */
export function eventRealityNodeViolations(node: EventRealityNodeV0): string[] {
  const out: string[] = [];
  for (const key of EVENT_REALITY_ATTRIBUTE_KEYS) {
    out.push(...realityAttributeViolations(`${node.eventRealityNodeId}.${key}`, node[key]));
  }
  // leave-by の追加 invariant（ガード 8）: ETA 供給まで value は null・whyUnresolved 非空
  if (node.leaveBy.value !== null) out.push(`${node.eventRealityNodeId}.leaveBy: ETA 供給前に value が非 null`);
  if (node.leaveBy.whyUnresolved.length === 0) out.push(`${node.eventRealityNodeId}.leaveBy: whyUnresolved が空`);
  // departureStatus（3-K）: unresolved 以外は供給実装まで違反
  if (node.departureStatus.value !== "unresolved")
    out.push(`${node.eventRealityNodeId}.departureStatus: 3-K では unresolved のみ`);
  // permission v0 上限（自動系を構造的に禁止）
  if ((node.permissionLevel.value ?? 0) > 2)
    out.push(`${node.eventRealityNodeId}.permissionLevel: v0 上限 2 を超過`);
  return out;
}
