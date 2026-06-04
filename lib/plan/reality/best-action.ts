/**
 * Reality Control OS — Best Action 純粋核（Slice 2C）
 *
 * 親設計:
 *   - docs/aneurasync-live-plan-controller-adaptive-trigger-matrix.md §5（スコアリング）
 *   - docs/aneurasync-live-plan-controller-golden-scenarios.md（Invariant）
 *
 * 中核原則: **Gate first, score second.**
 *   Safety / Permission / Traceability / Reversibility / Whole-Part / Recovery-Core を
 *   先に通し、残った候補だけ score する。**スコアが高くても gate 不通過は採用しない。**
 *   gate 不通過は silent に捨てず rejected として理由付きで残す（透明性・INV-12）。
 *
 * 制約: 純関数のみ。LLM・DB・push 判断・PRM 実更新・Receptivity Gate・既存 Plan 接続なし。
 *       metrics は事前計算（呼び出し側）で渡す。ここは「どう選ぶか」だけを担う。
 */

import { changeSetRequiresConfirmation, validateUndoability, type ChangeSet } from "./change-set";
import { isTraceable, type SourceTrace } from "./source-trace";

export type GateKind =
  | "safety"
  | "permission"
  | "traceability"
  | "reversibility"
  | "whole_part"
  | "recovery_core"
  | "deadline"; // A1-2-2.5: 保護対象 deadline 破壊を hard reject（score 救済を断つ）

export interface GateResult {
  readonly gate: GateKind;
  readonly pass: boolean;
  readonly reason?: string;
}

/** 候補の事前計算メトリクス（純粋・LLM 不要。呼び出し側で算出して渡す） */
export interface CandidateMetrics {
  readonly feasible: boolean; // 物理的に成立（safety gate）
  readonly wholePartCoherent: boolean; // 全体×一部の整合（INV-16）
  readonly recoveryProtected: boolean; // 回復核を守れている（INV-19）
  readonly deadlineSatisfied: boolean; // hard 締切充足
  readonly goalAttainment: number; // 0..1 目的/seed 充足
  readonly rhythmFit: number; // 0..1 状態・クロノタイプ適合
  readonly slackHealth: number; // 0..1 余白健全（充填率）
  readonly overpack: number; // 0..1 過密ペナルティ量
  readonly contextSwitches: number; // 件数（切替税）
  readonly instability: number; // 移動+削除の量（repair）
  readonly correctionMisalignment: number; // 0..1 学習済み修正に反する度
}

export interface BestActionCandidate {
  readonly id: string;
  readonly changeSet: ChangeSet; // reversibility / permission gate に使う
  readonly sourceTraces: readonly SourceTrace[]; // traceability gate（INV-4/23）
  readonly metrics: CandidateMetrics;
  /** この候補を auto 適用しようとしているか（permission gate に使う） */
  readonly proposedDisposition: "auto" | "confirm";
}

/**
 * 7 つの gate を評価する（pass/fail + 理由）。Gate first の本体。
 * deadline gate（A1-2-2.5）: deadlineSatisfied=false（= 保護対象 deadline 破壊）は hard reject。
 *   deadlineSatisfied は A1-2-2 の保守的 proxy ゆえ「すべての deadline 問題を完全捕捉」はしない。
 */
export function evaluateGates(c: BestActionCandidate): GateResult[] {
  const m = c.metrics;
  const undo = validateUndoability(c.changeSet);
  const requiresConfirm = changeSetRequiresConfirmation(c.changeSet);
  const permissionOk = !(c.proposedDisposition === "auto" && requiresConfirm);
  return [
    { gate: "safety", pass: m.feasible, reason: m.feasible ? undefined : "infeasible" },
    {
      gate: "traceability",
      pass: isTraceable(c.sourceTraces),
      reason: isTraceable(c.sourceTraces) ? undefined : "no source trace (phantom)",
    },
    {
      gate: "reversibility",
      pass: undo.ok,
      reason: undo.ok ? undefined : `not undoable: ${undo.errors.join("; ")}`,
    },
    {
      gate: "permission",
      pass: permissionOk,
      reason: permissionOk ? undefined : "auto-applies a change requiring confirmation",
    },
    {
      gate: "whole_part",
      pass: m.wholePartCoherent,
      reason: m.wholePartCoherent ? undefined : "breaks whole-day / downstream / next-day / budget",
    },
    {
      gate: "recovery_core",
      pass: m.recoveryProtected,
      reason: m.recoveryProtected ? undefined : "cuts a protected recovery core",
    },
    {
      gate: "deadline",
      pass: m.deadlineSatisfied,
      reason: m.deadlineSatisfied ? undefined : "breaks a protected deadline",
    },
  ];
}

export function gateFailures(c: BestActionCandidate): GateResult[] {
  return evaluateGates(c).filter((g) => !g.pass);
}

export function passesAllGates(c: BestActionCandidate): boolean {
  return evaluateGates(c).every((g) => g.pass);
}

// --- Scoring（gate 通過候補のみ意味を持つ） ---

export interface ScoreWeights {
  readonly deadline: number;
  readonly goalAttainment: number;
  readonly rhythmFit: number;
  readonly slackHealth: number;
  readonly overpack: number;
  readonly contextSwitch: number;
  readonly instability: number;
  readonly correctionMisalignment: number;
}

/** 既定の重み（締切が支配。修復時の不安定ペナルティは強め） */
export const DEFAULT_WEIGHTS: ScoreWeights = {
  deadline: 3.0,
  goalAttainment: 2.0,
  rhythmFit: 1.0,
  slackHealth: 1.0,
  overpack: 2.0,
  contextSwitch: 1.0,
  instability: 1.5,
  correctionMisalignment: 1.5,
};

export interface ScoreTerm {
  readonly key: string;
  readonly value: number; // 生のメトリクス
  readonly weighted: number; // 符号付き寄与
  readonly reason: string; // explainScore 用の人間可読理由
}

export interface ScoreBreakdown {
  readonly total: number;
  readonly terms: readonly ScoreTerm[];
}

/** 件数を 0..1 に飽和（0 件→0、多いほど 1 に漸近） */
function sat(x: number, k = 3): number {
  const v = Math.max(0, Number.isFinite(x) ? x : 0);
  return v / (v + k);
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.min(1, Math.max(0, x));
}

/**
 * 候補をスコアリングする（ScoreBreakdown を返す = explainScore 構造）。
 * 注: gate 通過の判定はしない。rank が gate first で適用する。
 */
export function scoreCandidate(c: BestActionCandidate, weights: ScoreWeights = DEFAULT_WEIGHTS): ScoreBreakdown {
  const m = c.metrics;
  const terms: ScoreTerm[] = [
    {
      key: "deadline",
      value: m.deadlineSatisfied ? 1 : 0,
      weighted: weights.deadline * (m.deadlineSatisfied ? 1 : 0),
      reason: m.deadlineSatisfied ? "hard 締切を満たす" : "hard 締切を満たさない",
    },
    {
      key: "goalAttainment",
      value: clamp01(m.goalAttainment),
      weighted: weights.goalAttainment * clamp01(m.goalAttainment),
      reason: `目的/seed 充足 ${clamp01(m.goalAttainment).toFixed(2)}`,
    },
    {
      key: "rhythmFit",
      value: clamp01(m.rhythmFit),
      weighted: weights.rhythmFit * clamp01(m.rhythmFit),
      reason: `状態・クロノタイプ適合 ${clamp01(m.rhythmFit).toFixed(2)}`,
    },
    {
      key: "slackHealth",
      value: clamp01(m.slackHealth),
      weighted: weights.slackHealth * clamp01(m.slackHealth),
      reason: `余白健全 ${clamp01(m.slackHealth).toFixed(2)}`,
    },
    {
      key: "overpack",
      value: clamp01(m.overpack),
      weighted: -weights.overpack * clamp01(m.overpack),
      reason: `過密ペナルティ ${clamp01(m.overpack).toFixed(2)}`,
    },
    {
      key: "contextSwitch",
      value: m.contextSwitches,
      weighted: -weights.contextSwitch * sat(m.contextSwitches),
      reason: `コンテキスト切替 ${Math.max(0, m.contextSwitches)} 件`,
    },
    {
      key: "instability",
      value: m.instability,
      weighted: -weights.instability * sat(m.instability),
      reason: `不安定(移動+削除) ${Math.max(0, m.instability)}`,
    },
    {
      key: "correctionMisalignment",
      value: clamp01(m.correctionMisalignment),
      weighted: -weights.correctionMisalignment * clamp01(m.correctionMisalignment),
      reason: `学習済み修正への不整合 ${clamp01(m.correctionMisalignment).toFixed(2)}`,
    },
  ];
  const total = terms.reduce((acc, t) => acc + t.weighted, 0);
  return { total, terms };
}

/** ScoreBreakdown を人間可読の「なぜ」に（autonomy-supportive・監査用） */
export function explainScore(breakdown: ScoreBreakdown): string {
  return breakdown.terms
    .filter((t) => Math.abs(t.weighted) > 1e-9)
    .map((t) => t.reason)
    .join(" / ");
}

// --- Ranking（Gate first, score second） ---

export interface RankedCandidate {
  readonly candidate: BestActionCandidate;
  readonly gates: readonly GateResult[];
  readonly passed: boolean;
  /** gate 通過した候補のみスコアを持つ（不通過は null） */
  readonly score: ScoreBreakdown | null;
}

export interface RankResult {
  readonly best: RankedCandidate | null;
  readonly alternatives: readonly RankedCandidate[];
  /** gate 不通過（理由付き）。silent に捨てない。 */
  readonly rejected: readonly RankedCandidate[];
}

/**
 * 候補を Gate first で評価し、通過候補のみスコア順に並べる。
 * **gate 不通過はスコアに関わらず best/alternatives に入らない**（危険候補を出さない）。
 */
export function rankCandidates(
  candidates: readonly BestActionCandidate[],
  weights: ScoreWeights = DEFAULT_WEIGHTS
): RankResult {
  const evaluated: RankedCandidate[] = candidates.map((candidate) => {
    const gates = evaluateGates(candidate);
    const passed = gates.every((g) => g.pass);
    return { candidate, gates, passed, score: passed ? scoreCandidate(candidate, weights) : null };
  });

  const survivors = evaluated
    .filter((e) => e.passed)
    .sort((a, b) => (b.score as ScoreBreakdown).total - (a.score as ScoreBreakdown).total);
  const rejected = evaluated.filter((e) => !e.passed);

  return {
    best: survivors[0] ?? null,
    alternatives: survivors.slice(1),
    rejected,
  };
}
