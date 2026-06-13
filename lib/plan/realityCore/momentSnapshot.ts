/**
 * MomentStateSnapshotV0 — 「今この瞬間の判断入力」を束ねる完全版（RC2a-5・pure core 限定）
 *
 * 正本: docs/reality-graph-state-model-addendum.md §2 / docs/reality-graph-contract-hardening-rg06.md §3 /
 *       CEO RC2a-5 GO + 追加ガード 5 件（2026-06-13）
 *
 * 最重要原則（CEO/GPT）: **MomentSnapshot は判断入力であって判断結果ではない**。
 *   Feasibility / CollapseRisk / 3 案 / 出発線 を**出さない**（型に存在しない）。RJ1 がこれを材料に判断する。
 *
 * 3 概念の峻別（debt ≠ risk ≠ commitment）:
 *   - commitment 高 = 崩すと痛い（CommitmentSignal）
 *   - risk 高 = 崩れそう（RJ1+ で算出・本型は出さない）
 *   - **debt 高 = まだ判断材料が足りない / 決める必要が残っている**（DecisionDebt = resolution debt）
 *   timeDebt/mobilityDebt は「時間/移動の判断材料が弱い」であって遅刻・崩壊リスクではない（carry のみ・relabel しない）。
 *
 * 規律:
 *   - pure（I/O・時刻 API・乱数なし）。**RealityInstant は注入**（makeRealityInstantJst が唯一正本・再計算しない）
 *   - browser local timezone を使わない / new Date().getHours() を呼ばない
 *   - unknown を 0 にしない・single score にしない・permission を緩めない・LLM 不使用・UI 接続なし
 *   - ノードは **参照で束ねる**（所有・再計算しない）。missingInputs は失わず集約（placeResolutionPending を消さない）
 */

import type { MomentStateV0 } from "@/lib/plan/dayState/dayStateTypes";
import { toSubjectiveMin } from "@/lib/plan/dayState/timeOfDay";
import type { EventRealityNodeV0 } from "./eventRealityNode";
import type { MovementRealityV0 } from "./movementReality";
import type { CommitmentSignalV0 } from "./commitmentSignal";
import type { DecisionDebtV0 } from "./decisionDebt";
import { DECISION_DEBT_COMPONENT_KEYS } from "./decisionDebt";
import { decisionDebtViolations } from "./decisionDebt";
import type { RealityInstant } from "./realityInstant";
import { REALITY_DERIVATION_VERSIONS, type DerivationVersionSet } from "./graphIdentity";

/** derive version（RC2a-1b §4 — manifest 一致 fixture） */
export const MOMENT_SNAPSHOT_DERIVE_VERSION = 0;

export interface MomentRelevantNodes {
  /** 今いる event（active window が event で対応） */
  readonly activeEventNodeIds: ReadonlyArray<string>;
  readonly activeWindow: { readonly kind: "event" | "travel" | "gap"; readonly startHHMM: string; readonly endHHMM: string } | null;
  /** 次の fixed event（latencyTolerance strict|tight）の ern */
  readonly nextFixedEventNodeIds: ReadonlyArray<string>;
  /** 終了済み event */
  readonly pastEventNodeIds: ReadonlyArray<string>;
  /** これから（未終了）event */
  readonly upcomingEventNodeIds: ReadonlyArray<string>;
  /** 未解決移動（mv で mobilityStatus unresolved）。**mv 不在を「移動不要」と読まない** — それは decisionDebt 側 */
  readonly unresolvedMovementIds: ReadonlyArray<string>;
}

export interface MomentStateSnapshotV0 {
  readonly schemaVersion: 0;
  /** RealityInstant（carry・再計算しない・Asia/Tokyo・browser TZ 非依存） */
  readonly instant: RealityInstant;
  /** 既存 14 field 時間構造（deriveMomentState 出力・carry） */
  readonly momentState: MomentStateV0;
  readonly relevantNodes: MomentRelevantNodes;
  /** 参照束ね（所有しない・join key） */
  readonly nodeRefs: {
    readonly eventRealityNodeIds: ReadonlyArray<string>;
    readonly movementRealityIds: ReadonlyArray<string>;
    /** = ern ids（cs.targetNodeId で join） */
    readonly commitmentSignalTargetIds: ReadonlyArray<string>;
  };
  /** DecisionDebt（components 正本・knownComponentSummary は **RJ1 正本入力にしない**） */
  readonly decisionDebt: DecisionDebtV0;
  /** 統合 missingInputs（各ノードのものを失わず集約・place_resolution_pending を含む） */
  readonly missingInputs: ReadonlyArray<string>;
  readonly sourceRefs: { readonly dayGraphSnapshotId: string };
  readonly evidenceRefs: ReadonlyArray<string>;
  readonly derivationVersions: DerivationVersionSet;
}

export interface DeriveMomentSnapshotInput {
  instant: RealityInstant;
  momentState: MomentStateV0;
  ern: ReadonlyArray<EventRealityNodeV0>;
  mv: ReadonlyArray<MovementRealityV0>;
  cs: ReadonlyArray<CommitmentSignalV0>;
  decisionDebt: DecisionDebtV0;
}

export function deriveMomentSnapshot(input: DeriveMomentSnapshotInput): MomentStateSnapshotV0 {
  const nowMin = input.instant.minuteOfSubjectiveDay;

  // 主観分（05:00 境界）で past / active / upcoming を整理（生 HH:MM 比較は日跨ぎで破綻するため）
  const past: string[] = [];
  const active: string[] = [];
  const upcoming: string[] = [];
  for (const e of input.ern) {
    const start = toSubjectiveMin(e.timeWindow.startHHMM);
    const end = toSubjectiveMin(e.timeWindow.endHHMM);
    if (start === null || end === null) continue; // parse 不能は分類しない（捏造しない）
    if (end <= nowMin) past.push(e.eventRealityNodeId);
    else if (start <= nowMin && nowMin < end) active.push(e.eventRealityNodeId);
    else upcoming.push(e.eventRealityNodeId);
  }

  const nextAt = input.momentState.nextFixedEventAt;
  const nextFixedEventNodeIds = nextAt
    ? input.ern.filter((e) => e.timeWindow.startHHMM === nextAt).map((e) => e.eventRealityNodeId)
    : [];

  const unresolvedMovementIds = input.mv
    .filter((m) => m.mobilityStatus.value === "unresolved")
    .map((m) => m.movementRealityId);

  // missingInputs 集約（失わない）: decisionDebt 全体 + 各 component + ern leaveBy whyUnresolved + mv missingInputs
  const missing = new Set<string>(input.decisionDebt.missingInputs);
  for (const key of DECISION_DEBT_COMPONENT_KEYS) {
    for (const m of input.decisionDebt.components[key].missingInputs) missing.add(m);
  }
  for (const e of input.ern) for (const r of e.leaveBy.whyUnresolved) missing.add(r);
  for (const mv of input.mv) for (const r of mv.missingInputs) missing.add(r);

  return {
    schemaVersion: 0,
    instant: input.instant,
    momentState: input.momentState,
    relevantNodes: {
      activeEventNodeIds: active,
      activeWindow: input.momentState.nowSegment,
      nextFixedEventNodeIds,
      pastEventNodeIds: past,
      upcomingEventNodeIds: upcoming,
      unresolvedMovementIds,
    },
    nodeRefs: {
      eventRealityNodeIds: input.ern.map((e) => e.eventRealityNodeId),
      movementRealityIds: input.mv.map((m) => m.movementRealityId),
      commitmentSignalTargetIds: input.cs.map((c) => c.targetNodeId),
    },
    decisionDebt: input.decisionDebt,
    missingInputs: [...missing],
    sourceRefs: input.decisionDebt.sourceRefs,
    evidenceRefs: ["moment_state_snapshot_v0"],
    derivationVersions: REALITY_DERIVATION_VERSIONS,
  };
}

/** snapshot の構造健全性検証（空 = 適合）。fixture / 監査が使用 */
export function momentSnapshotViolations(snap: MomentStateSnapshotV0): string[] {
  const out: string[] = [];
  if (!snap.sourceRefs.dayGraphSnapshotId) out.push("snapshot: sourceRefs.dayGraphSnapshotId が空");
  if (snap.evidenceRefs.length === 0) out.push("snapshot: evidenceRefs が空");
  if (!snap.derivationVersions) out.push("snapshot: derivationVersions が無い");
  if (!snap.instant.timezone) out.push("snapshot: instant.timezone が無い");
  // decisionDebt components の provenance（裸値禁止）も snapshot レベルで担保
  out.push(...decisionDebtViolations(snap.decisionDebt));
  return out;
}
