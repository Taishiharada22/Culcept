/**
 * MomentStateSnapshotV0 — RC2a-5 input-bundle snapshot（RJ1 前の「今この瞬間の判断入力」地面・pure core 限定）
 *
 * 正本: docs/reality-graph-state-model-addendum.md §2 / docs/reality-graph-contract-hardening-rg06.md §3 /
 *       CEO RC2a-5 GO + 追加ガード 5 件 + RC2a-5A 検収（GPT 8 点・2026-06-13）
 *
 * 範囲の正確な表現（RC2a-5A §1/§2 — "完全版"/"全部署" の過大表現を撤回）:
 *   - **full MomentStateSnapshot ではない**。cross-day / carryover / fatigue projection は未実装
 *   - 束ねるのは **available RC2a materials** = Plan/Mobility/Context/Risk の compile 済み（ern/mv/cs/decisionDebt）。
 *     **Energy / Memory 部署の compile 材料は未接続**（missingInputs / backlog に明記）。Permission は consumer 側
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
 * identity（RC2a-5A §3）: momentSnapshotId は **cache key であって内容同一の証明ではない**（id 同一 ⇒ 内容同一ではない）。
 *   決定的（subjectiveDate + minuteOfSubjectiveDay + dayGraphSnapshotId hash）・array order / runtime timestamp で揺れない。
 *   nowInstant の秒/ms は identity 対象外（minute 精度）。full InputRevisionSet は RC2a-6 assembler が完成させる。
 *
 * 規律:
 *   - pure（I/O・時刻 API・乱数なし）。**RealityInstant は注入**（makeRealityInstantJst が唯一正本・再計算しない）
 *   - browser local timezone を使わない / new Date().getHours() を呼ばない
 *   - unknown を 0 にしない・single score にしない・permission を緩めない・LLM 不使用・UI 接続なし
 *   - ノードは **id/ref で束ねる**（所有・再計算・array index join をしない）。join key: ern=eventRealityNodeId /
 *     cs=targetNodeId / mv=movementRealityId / decisionDebt=sourceRefs。duplicate id は guard で検出
 *   - **missingInputs は source trace を失わない**（missingInputRefs で「どのノードのどの field が欠けたか」を保持）
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
import { fnv1a64Hex, REALITY_DERIVATION_VERSIONS, type DerivationVersionSet } from "./graphIdentity";

/** missingInput の source trace（RC2a-5A §4 — string 集合に潰さず「どのノードのどの field」を保持） */
export interface MissingInputRef {
  readonly code: string;
  readonly sourceNodeKind: "event" | "movement" | "commitment" | "decision_debt";
  readonly sourceNodeId: string;
  readonly sourceField: string;
  readonly evidenceRefs: ReadonlyArray<string>;
}

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
  /**
   * 主観日境界（05:00）を跨ぐ event（subjective 変換で end < start）。v0 では past/active/upcoming に
   * 分類しない（誤分類を避ける）。**「判断済み」と扱わず** missingInputs に "event_spans_subjective_boundary"。
   * 注: 日跨ぎ単一 event（23:00-翌01:00）は DayGraph が end_before_start で拒否するため ern 化されない（別制約）。
   */
  readonly boundarySpanningEventNodeIds: ReadonlyArray<string>;
}

export interface MomentStateSnapshotV0 {
  readonly schemaVersion: 0;
  /** cache key（内容同一の証明ではない・決定的・RC2a-5A §3） */
  readonly momentSnapshotId: string;
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
  /**
   * DecisionDebt（components 正本・**knownComponentSummary は RJ1/Proposal/Intervention の正本入力にしない**
   * — debugOnly metadata であって components の代替ではない・RC2a-5A §7）
   */
  readonly decisionDebt: DecisionDebtV0;
  /** 統合 missingInputs codes（dedup・利便用）。source trace は missingInputRefs を見る */
  readonly missingInputs: ReadonlyArray<string>;
  /** missingInput の source trace（RC2a-5A §4 — どのノードのどの field が欠けたか・dedup で trace を失わない） */
  readonly missingInputRefs: ReadonlyArray<MissingInputRef>;
  /** Energy/Memory 部署が未接続であることの明示（RC2a-5A §2） */
  readonly unconnectedDepartments: ReadonlyArray<string>;
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

  // duplicate id guard（array index join をしない前提の健全性 — RC2a-5A §5）
  const ernIds = input.ern.map((e) => e.eventRealityNodeId);
  if (new Set(ernIds).size !== ernIds.length) {
    throw new Error("deriveMomentSnapshot: duplicate eventRealityNodeId（id join が壊れる）");
  }

  // 主観分（05:00 境界）で past / active / upcoming を整理（生 HH:MM 比較は日跨ぎで破綻するため）
  const past: string[] = [];
  const active: string[] = [];
  const upcoming: string[] = [];
  const boundarySpanning: string[] = [];
  for (const e of input.ern) {
    const start = toSubjectiveMin(e.timeWindow.startHHMM);
    const end = toSubjectiveMin(e.timeWindow.endHHMM);
    if (start === null || end === null) continue; // parse 不能は分類しない（捏造しない）
    if (end < start) {
      // 主観日境界（05:00）を跨ぐ event → 分類不能。誤分類せず boundarySpanning に落とす（RC2a-5A §6）
      boundarySpanning.push(e.eventRealityNodeId);
      continue;
    }
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

  // missingInputs 集約（source trace を失わない — RC2a-5A §4）
  const refs: MissingInputRef[] = [];
  for (const key of DECISION_DEBT_COMPONENT_KEYS) {
    for (const code of input.decisionDebt.components[key].missingInputs) {
      refs.push({ code, sourceNodeKind: "decision_debt", sourceNodeId: "decisionDebt", sourceField: key, evidenceRefs: input.decisionDebt.components[key].evidenceRefs });
    }
  }
  for (const e of input.ern) {
    for (const code of e.leaveBy.whyUnresolved) {
      refs.push({ code, sourceNodeKind: "event", sourceNodeId: e.eventRealityNodeId, sourceField: "leaveBy", evidenceRefs: e.leaveBy.evidenceRefs });
    }
  }
  for (const mv of input.mv) {
    for (const code of mv.missingInputs) {
      refs.push({ code, sourceNodeKind: "movement", sourceNodeId: mv.movementRealityId, sourceField: "mobility", evidenceRefs: mv.mobilityStatus.evidenceRefs });
    }
  }
  if (boundarySpanning.length > 0) {
    for (const id of boundarySpanning) {
      refs.push({ code: "event_spans_subjective_boundary", sourceNodeKind: "event", sourceNodeId: id, sourceField: "timeWindow", evidenceRefs: [] });
    }
  }
  // flat codes（dedup・利便用）= refs 由来のみ（全 code に source trace が紐づく不変条件）。
  // decisionDebt の "<key>_unsupplied" 合成サマリは snap.decisionDebt.missingInputs から別途参照可能
  const missingCodes = [...new Set(refs.map((r) => r.code))];

  // momentSnapshotId（cache key・決定的・id ≠ 内容証明）
  const dayGraphSnapshotId = input.decisionDebt.sourceRefs.dayGraphSnapshotId;
  const momentSnapshotId = `ms:${input.instant.subjectiveDate}:${nowMin}:${fnv1a64Hex(dayGraphSnapshotId)}`;

  return {
    schemaVersion: 0,
    momentSnapshotId,
    instant: input.instant,
    momentState: input.momentState,
    relevantNodes: {
      activeEventNodeIds: active,
      activeWindow: input.momentState.nowSegment,
      nextFixedEventNodeIds,
      pastEventNodeIds: past,
      upcomingEventNodeIds: upcoming,
      unresolvedMovementIds,
      boundarySpanningEventNodeIds: boundarySpanning,
    },
    nodeRefs: {
      eventRealityNodeIds: ernIds,
      movementRealityIds: input.mv.map((m) => m.movementRealityId),
      commitmentSignalTargetIds: input.cs.map((c) => c.targetNodeId),
    },
    decisionDebt: input.decisionDebt,
    missingInputs: missingCodes,
    missingInputRefs: refs,
    unconnectedDepartments: ["Energy", "Memory"],
    sourceRefs: input.decisionDebt.sourceRefs,
    evidenceRefs: ["moment_state_snapshot_v0"],
    derivationVersions: REALITY_DERIVATION_VERSIONS,
  };
}

/** snapshot の構造健全性検証（空 = 適合）。fixture / 監査が使用 */
export function momentSnapshotViolations(snap: MomentStateSnapshotV0): string[] {
  const out: string[] = [];
  if (!snap.momentSnapshotId) out.push("snapshot: momentSnapshotId が空");
  if (!snap.sourceRefs.dayGraphSnapshotId) out.push("snapshot: sourceRefs.dayGraphSnapshotId が空");
  if (snap.evidenceRefs.length === 0) out.push("snapshot: evidenceRefs が空");
  if (!snap.derivationVersions) out.push("snapshot: derivationVersions が無い");
  if (!snap.instant.timezone) out.push("snapshot: instant.timezone が無い");
  // missingInputs の source trace 健全性: 各 flat code が refs に source 付きで存在すること
  for (const code of snap.missingInputs) {
    if (!snap.missingInputRefs.some((r) => r.code === code)) {
      out.push(`snapshot: missingInput "${code}" の source trace（missingInputRefs）が欠落`);
    }
  }
  // 各 ref が source node を特定できること（trace が空殻でない）
  for (const r of snap.missingInputRefs) {
    if (!r.sourceNodeId || !r.sourceField) out.push(`snapshot: missingInputRef "${r.code}" の source が不完全`);
  }
  // decisionDebt components の provenance（裸値禁止）も snapshot レベルで担保
  out.push(...decisionDebtViolations(snap.decisionDebt));
  return out;
}
