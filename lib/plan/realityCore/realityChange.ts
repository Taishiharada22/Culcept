/**
 * realityChange — RO-3 D4a（2026-06-20）: RealityChangeV0 上位 dispatch（pure・no-IO）
 *
 * 正本設計: docs/reality-os-ro3-reality-ir-learning-design.md（RO-3 §4-③・v0.1）
 * 思想: diff の changed/resolved/collapsed bucket を、既存 6 union を **1 巨大 union に畳まず** sourceVocab
 *   タグ付きで参照する上位 dispatch。task の partial/progressed と anchor の time_changed/location_changed の
 *   意味次元を潰さない（RO-1 doc:252 二重正本回避を型で強制）。
 *
 * CEO 裁定（2026-06-20）の厳守点:
 *   - intervention asked/ignored/acted は InsightReaction（accepted/denied/ignored/explored）を流用せず
 *     `ro3_intervention_outcome` として **別レーン新設**（ignored の部分重複は sourceVocab で分離）。
 *   - producer 実体（介入後の本人反応観測）は別 owning session 依存ゆえ **honest dormant**（v0 は diff から生成しない）。
 *
 * 不変条件: IO / RNG / now / Date / write を持たない。既存 union を merge/再定義しない（join 鍵参照のみ）。
 */
import type { RealityDiffV0 } from "./realityDiff";
import type { RealityFrameV0, RealityNodeRef } from "./realityFrame";
import type { TaskOutcomeKind } from "./taskOutcome";

export const REALITY_CHANGE_VERSION = 0;

export type ChangeLane = "task" | "event" | "movement" | "intervention";

/** 「どの既存語彙の値か」を追跡（畳まずに参照する）。 */
export type SourceVocab =
  | "task_outcome" // TaskOutcomeKind（taskOutcome.ts）
  | "plan_drift" // PlanDriftType（anchor 側正本）
  | "night_check" // NightCheckDriftSelection.driftType（dayStateTypes.ts:118）
  | "movement" // 出発線変化（leaveByLines 由来）
  | "ro3_intervention_outcome"; // 新設・InsightReaction と別レーン

/** 介入後の反応（RO-3 新設・InsightReaction とは別レーン・v0 dormant）。 */
export type InterventionOutcomeKind = "asked" | "ignored" | "acted";

export interface RealityChangeV0 {
  readonly target: RealityNodeRef;
  readonly lane: ChangeLane;
  readonly classifiedAs: string;
  readonly sourceVocab: SourceVocab;
  readonly evidenceRefs: ReadonlyArray<string>;
}

/** completionStatus value → TaskOutcomeKind の参照写像（畳まず・既存 union を引くだけ）。 */
function completionStatusToOutcome(status: string): TaskOutcomeKind | null {
  switch (status) {
    case "done":
      return "completed";
    case "partially_done":
      return "partial";
    case "in_progress":
      return "progressed";
    case "blocked":
      return "blocked";
    case "not_started":
      return null; // skipped/carried_over の区別は outcome レコード側（completionStatus からは確定できない）
    default:
      return null;
  }
}

/**
 * classifyChange — diff（+ frame）から RealityChangeV0 を materialize（pure）。
 *   task lane = completionStatus changed + carryOver signals / event lane = ern 非移動 changed /
 *   movement lane = leaveByLines resolved/collapsed。intervention lane は v0 dormant（diff から生成しない）。
 */
export function classifyChange(diff: RealityDiffV0, frame: RealityFrameV0): RealityChangeV0[] {
  const out: RealityChangeV0[] = [];

  // ── task lane: completionStatus の changed ──
  for (const ch of diff.nodes.changed) {
    if (ch.ref.kind === "task" && ch.field === "completionStatus" && typeof ch.to === "string") {
      const outcome = completionStatusToOutcome(ch.to);
      out.push({
        target: ch.ref,
        lane: "task",
        classifiedAs: outcome ?? `completion_${ch.to}`,
        sourceVocab: "task_outcome",
        evidenceRefs: ["diff_changed_completionStatus", `to_${ch.to}`],
      });
    } else if (ch.ref.kind === "event" && (ch.field === "leaveBy" || ch.field === "placeCertainty" || ch.field === "movementRequired")) {
      // ── event lane: ern の非移動属性変化（正本は anchor 側＝plan_drift で参照） ──
      out.push({
        target: ch.ref,
        lane: "event",
        classifiedAs: `event_${ch.field}_changed`,
        sourceVocab: "plan_drift",
        evidenceRefs: [`diff_changed_${ch.field}`],
      });
    }
  }

  // ── task lane: carryOver signals（carried_over / blocked の区別を保つ） ──
  for (const signal of frame.workLane.carryOverSignals) {
    if (!signal.carriedOver) continue;
    out.push({
      target: { universe: "workLane", kind: "task", id: signal.taskRealityNodeId },
      lane: "task",
      classifiedAs: signal.reason, // TaskOutcomeKind（carried_over / blocked）
      sourceVocab: "task_outcome",
      evidenceRefs: ["carry_over_signal", `reason_${signal.reason}`],
    });
  }

  // ── movement lane: leaveByLines resolved / collapsed = departure_line_changed ──
  for (const r of diff.resolved) {
    if (r.field === "leaveByLines" && r.via === "leave_by_lines") {
      out.push({
        target: r.ref,
        lane: "movement",
        classifiedAs: "departure_line_changed",
        sourceVocab: "movement",
        evidenceRefs: ["leave_by_lines_resolved"],
      });
    }
  }
  for (const c of diff.collapsed) {
    if (c.field === "leaveByLines.bandGapMin") {
      out.push({
        target: c.ref,
        lane: "movement",
        classifiedAs: "departure_line_changed",
        sourceVocab: "movement",
        evidenceRefs: ["leave_by_lines_collapsed", `gap_${c.fromGap}_to_${c.toGap}`],
      });
    }
  }

  return out;
}

/** INV: RealityChange の不変条件（空=適合）。 */
export function realityChangeViolations(change: RealityChangeV0): string[] {
  const out: string[] = [];
  const push = (m: string) => out.push(`realityChange: ${m}`);
  if (change.classifiedAs.length === 0) push("classifiedAs が空");
  if (change.evidenceRefs.length === 0) push("evidenceRefs が空（捏造防止: 根拠なしの分類禁止）");
  // intervention lane は v0 dormant（diff から生成されない）— もし生成されたら sourceVocab で分離されているべき
  if (change.lane === "intervention" && change.sourceVocab !== "ro3_intervention_outcome") {
    push("intervention lane は sourceVocab=ro3_intervention_outcome（InsightReaction と別レーン）");
  }
  return out;
}
