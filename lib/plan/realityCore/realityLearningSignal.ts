/**
 * realityLearningSignal — RO-3 D5（2026-06-20）: 学習ループの最小心臓部 seam（pure・no-IO・no-write）
 *
 * 正本設計: docs/reality-os-ro3-reality-ir-learning-design.md（RO-3 §4-⑤・v0.1）
 * 思想: edges / diff / changes / gradients / ledgerCandidates を **1 回の pure 呼び出し**に束ね、
 *   B1/PredictionLedger が将来 consume できる **型の口だけ**を返す。**書かない**（DB/localStorage/PredictionLedger
 *   に一切 write しない・関数戻り値のみ）。producer のみ consumer ゼロの honest dormant（現状
 *   nextDayPriorAdjustments と同じ待機状態）。
 *
 * CEO 裁定（2026-06-20・RO-3 実装 GO）の厳守点:
 *   - `PredictionTargetNodeKind`（predictionLedgerTypes.ts:24）に `task` は無い → task 起源の ledgerCandidate は
 *     **`task_untypeable_v0`** のままにする。`PredictionTargetNodeKind` に task を追加しない。
 *   - PredictionLedger write 禁止（eligible 判定 / calibration 焼き戻し / PredictionEntry materialize は B1/RJ6 所管）。
 *
 * 不変条件: IO / RNG / now / Date / DB / localStorage / PredictionLedger write を持たない（observedAt は注入）。
 */
import type { RealityFrameV0 } from "./realityFrame";
import type { RealityGraphEdgeV0 } from "./realityGraphEdge";
import { materializeEdges } from "./realityGraphEdge";
import type { RealityDiffV0 } from "./realityDiff";
import { diffSnapshots } from "./realityDiff";
import type { RealityChangeV0 } from "./realityChange";
import { classifyChange } from "./realityChange";
import type { CorrectionGradientV0 } from "./correctionGradient";
import type { EdgeJoinReadinessV0 } from "./taskEdgePrep";
import type { TaskLedgerSignalV0, TaskCarryOverSignalV0, TaskOutcomeKind } from "./taskOutcome";
import type { PredictionTargetNodeKind } from "./predictionLedgerTypes";

export const REALITY_LEARNING_SIGNAL_VERSION = 0;

/**
 * task 起源は v0 で un-typeable（PredictionTargetNodeKind に task が無い・predictionLedgerTypes.ts:24）。
 * lossless 整形と偽らず、明示マークで honest に運ぶ。
 */
export type LedgerCandidateTargetKind = PredictionTargetNodeKind | "task_untypeable_v0";

export interface LedgerCandidateV0 {
  readonly targetNodeId: string;
  readonly targetNodeKind: LedgerCandidateTargetKind;
  readonly outcome: TaskOutcomeKind;
  readonly observedAt: string; // 注入（pure・now は caller）
  readonly learningSourceKind: "correction" | "drift";
  readonly sampleSizeContribution: number; // dedup は B1 gate に委譲（v0 は単純に 1）
}

export interface RealityLearningSignalV0 {
  readonly edges: ReadonlyArray<RealityGraphEdgeV0>;
  readonly diff: RealityDiffV0;
  readonly changes: ReadonlyArray<RealityChangeV0>;
  readonly gradients: ReadonlyArray<CorrectionGradientV0>;
  readonly ledgerCandidates: ReadonlyArray<LedgerCandidateV0>;
  readonly unresolved: ReadonlyArray<EdgeJoinReadinessV0>;
}

export interface BuildRealityLearningSignalInputV0 {
  /** 前回 frame（初回は null）。 */
  readonly prior: RealityFrameV0 | null;
  /** 今回 frame。 */
  readonly current: RealityFrameV0;
  /** RO-1 applyTaskOutcome の ledgerSignal（injected・frame には載らない口）。 */
  readonly ledgerSignals?: ReadonlyArray<TaskLedgerSignalV0>;
  /** decomposeCorrection 済みの gradient（injected・捏造しない）。 */
  readonly gradients?: ReadonlyArray<CorrectionGradientV0>;
}

/** carryOverSignal → LedgerCandidate（carried_over/blocked は学習対象 event の口）。 */
function carryOverToCandidate(signal: TaskCarryOverSignalV0, observedAt: string): LedgerCandidateV0 {
  return {
    targetNodeId: signal.taskRealityNodeId,
    targetNodeKind: "task_untypeable_v0", // task は PredictionTargetNodeKind に無い（honest）
    outcome: signal.reason,
    observedAt,
    learningSourceKind: "correction",
    sampleSizeContribution: 1,
  };
}

function ledgerSignalToCandidate(signal: TaskLedgerSignalV0): LedgerCandidateV0 {
  return {
    targetNodeId: signal.taskRealityNodeId,
    targetNodeKind: "task_untypeable_v0", // 同上（trn: は task）
    outcome: signal.outcome,
    observedAt: signal.observedAt,
    learningSourceKind: "correction",
    sampleSizeContribution: 1,
  };
}

/**
 * buildRealityLearningSignal — ①②③④ を 1 回の pure 呼び出しに束ねる（書かない・戻り値のみ）。
 *   ledgerCandidates は injected ledgerSignals + frame の carryOverSignals を整形（重複は targetNodeId+outcome で除く）。
 */
export function buildRealityLearningSignal(input: BuildRealityLearningSignalInputV0): RealityLearningSignalV0 {
  const { prior, current } = input;
  const { edges, unresolved } = materializeEdges(current);
  const diff = diffSnapshots(prior, current);
  const changes = classifyChange(diff, current);

  // ledgerCandidates: injected ledgerSignals + carryOverSignals（observedAt は ledgerSignal 側を優先）
  const candidates: LedgerCandidateV0[] = [];
  const seen = new Set<string>();
  const add = (c: LedgerCandidateV0) => {
    const key = `${c.targetNodeId}:${c.outcome}`;
    if (seen.has(key)) return; // dedup（同一 task+outcome の二重カウント防止・厳密 gate は B1）
    seen.add(key);
    candidates.push(c);
  };
  for (const s of input.ledgerSignals ?? []) add(ledgerSignalToCandidate(s));
  for (const s of current.workLane.carryOverSignals) {
    if (!s.carriedOver) continue;
    // carryOver は observedAt を持たないので ledgerSignal が無い場合のみ補完（diff の toSnapshotId を使わず空文字は避ける）
    add(carryOverToCandidate(s, diff.toSnapshotId));
  }

  return {
    edges,
    diff,
    changes,
    gradients: input.gradients ?? [],
    ledgerCandidates: candidates,
    unresolved,
  };
}

/** INV: learning signal の不変条件（空=適合・throw しない）。 */
export function realityLearningSignalViolations(signal: RealityLearningSignalV0): string[] {
  const out: string[] = [];
  const push = (m: string) => out.push(`realityLearningSignal: ${m}`);
  // task 起源は必ず un-typeable（PredictionTargetNodeKind に task を足さない契約）
  for (const c of signal.ledgerCandidates) {
    if (c.targetNodeId.startsWith("trn:") && c.targetNodeKind !== "task_untypeable_v0") {
      push(`task 起源 candidate（${c.targetNodeId}）は targetNodeKind=task_untypeable_v0（PredictionTargetNodeKind に task を足さない）`);
    }
    if (c.sampleSizeContribution <= 0) push("sampleSizeContribution は正");
  }
  // edges は全て resolvable（phantom 排除）
  for (const e of signal.edges) {
    if (!e.resolvable) push(`resolvable=false の edge が signal に混入（${e.edgeId}）`);
  }
  return out;
}
