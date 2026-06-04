/**
 * Reality Control OS — Candidate Evaluator（A1-2-1: CandidateDraft 型 + applyChangeSet 器のみ）
 *
 * 親設計: docs/aneurasync-reality-candidate-generator-design.md（A1 系）
 *
 * 役割（A1-2 全体）: 候補の安全 metrics を **generator の自己申告でなく evaluator が独立算出** する。
 *   - generator(A1-3+) は `CandidateDraft`（metrics を持たない型）を出す＝**自己申告できない**。
 *   - evaluator(A1-2-2) だけが metrics を産み `BestActionCandidate` を組む（A1-2-1 ではまだ作らない）。
 *
 * 【A1-2-1 の範囲】:
 *   - `CandidateDraft` 型（metrics / score / gate result を構造的に持てない）。
 *   - `applyChangeSet(nodes, cs)` の **最小純関数**（適用結果の計算のみ・safety 判定しない）。
 *     supported op のみ / unsupported は fail / unknown・missing node は fail /
 *     before・after 不整合は fail / **node mutation なし** / **raw title/location/text を持ち込まない**。
 * 【A1-2-2 の範囲】:
 *   - `evaluateSafetyMetrics(draft, context)`：**4 安全 metric のみ**を独立・保守的に算出
 *     （feasible / recoveryProtected / deadlineSatisfied / wholePartCoherent）。
 *   - 不明・apply 失敗・recovery_core/critical を触る等は **安全側(false)**。
 * 【A1-2-3 の範囲（CEO 限定 GO）】:
 *   - `evaluateCandidate(draft, context)`：draft → BestActionCandidate の橋。
 *   - safety は evaluateSafetyMetrics 由来（self-report 不使用）。客観 `instability` のみ実算出。
 *   - subjective metric は中立 default 0（水増ししない）。best-action は不変で Gate-first がそのまま効く。
 *   - **subjective 本実装 / 客観 score 拡充(A1-2-4) / mode 生成 / rank の production 接続は作らない**。
 *
 * 【安全原則（表現は CEO 補正済）】:
 *   Gate-first は候補を採用前に弾くが Gate は metrics を信じる。ゆえに generator が metrics を
 *   *申告できない* 構造（CandidateDraft）にし、unsupported/unknown/missing は必ず安全側(fail)に倒して、
 *   **不安全候補が安全扱いされる経路を構造的に減らす**（絶対化はしない＝実装バグ/未対応 op は残りうる）。
 *
 * 制約: 純関数のみ。LLM / DB / UI / route / runtime / 実データ / push なし。barrel 未追加。
 */

import type { BestActionCandidate, CandidateMetrics } from "./best-action";
import type { ChangeSet, PlanItemSnapshot } from "./change-set";
import { isImmovable, hasProtection, type PlanItemGovernance } from "./authority";
import type { GenerationContext, GovernedNode } from "./candidate-generator";

/**
 * generator が出す候補草案。`BestActionCandidate` から **metrics を除いた型**。
 * ＝ metrics / score / gate result を **構造的に持てない**（generator が安全を自己申告できない）。
 */
export type CandidateDraft = Omit<BestActionCandidate, "metrics">;

/**
 * apply の対象/結果ノード（**raw title/location を持たない最小形**）。
 * governance は raw でないため保持してよい（A1-2-2 の安全判定が使う）。
 */
export interface PlanNode {
  readonly id: string;
  readonly startMin: number;
  readonly endMin: number;
  readonly governance?: PlanItemGovernance;
}

export interface ApplyResult {
  /** 全 op が整合的に適用できたか（atomic: false なら nodes は入力不変） */
  readonly ok: boolean;
  /** 適用後ノード（ok=false なら入力不変）。raw を持たない。startMin 昇順。 */
  readonly nodes: readonly PlanNode[];
  /** 失敗理由（op index + kind + itemId のみ。raw title/location/text を含まない） */
  readonly issues: readonly string[];
}

/** snapshot → PlanNode（**raw を落とす**: title 等を持ち込まない）。timing 不完全なら null。 */
function snapshotToNode(s: PlanItemSnapshot): PlanNode | null {
  if (typeof s.itemId !== "string" || s.itemId.length === 0) return null;
  if (typeof s.startMin !== "number" || !Number.isFinite(s.startMin)) return null;
  if (typeof s.endMin !== "number" || !Number.isFinite(s.endMin)) return null;
  // title / location / sourceTraces は持ち込まない。governance のみ（raw でない）。
  return s.governance
    ? { id: s.itemId, startMin: s.startMin, endMin: s.endMin, governance: s.governance }
    : { id: s.itemId, startMin: s.startMin, endMin: s.endMin };
}

/** before snapshot が現状ノードと整合するか（stale changeSet 検出・fail-closed）。 */
function beforeMatches(before: PlanItemSnapshot, cur: PlanNode): boolean {
  if (before.itemId !== cur.id) return false;
  if (typeof before.startMin === "number" && before.startMin !== cur.startMin) return false;
  if (typeof before.endMin === "number" && before.endMin !== cur.endMin) return false;
  return true;
}

/**
 * changeSet を nodes に **atomic** に適用する純関数（A1-2-1: 器）。
 * 失敗（unsupported / unknown・missing / before・after 不整合）が 1 つでもあれば ok=false・入力不変。
 * **入力 nodes を mutate しない**。**raw を結果に持ち込まない**。**safety 判定はしない**。
 */
export function applyChangeSet(nodes: readonly PlanNode[], cs: ChangeSet): ApplyResult {
  const issues: string[] = [];
  // 非破壊: 作業 map は入力の copy（入力 nodes/elements を触らない）
  const work = new Map<string, PlanNode>();
  for (const n of nodes) {
    work.set(n.id, { id: n.id, startMin: n.startMin, endMin: n.endMin, governance: n.governance });
  }

  cs.ops.forEach((op, i) => {
    const tag = `op[${i}] ${op.kind} ${op.itemId}`;
    switch (op.kind) {
      case "add": {
        if (work.has(op.itemId)) { issues.push(`${tag}: add of existing id`); break; }
        const node = snapshotToNode(op.after);
        if (!node || node.id !== op.itemId) { issues.push(`${tag}: incomplete/inconsistent after`); break; }
        work.set(node.id, node);
        break;
      }
      case "remove": {
        const cur = work.get(op.itemId);
        if (!cur) { issues.push(`${tag}: remove of unknown id`); break; }
        if (!beforeMatches(op.before, cur)) { issues.push(`${tag}: before mismatch (stale)`); break; }
        work.delete(op.itemId);
        break;
      }
      case "update": {
        const cur = work.get(op.itemId);
        if (!cur) { issues.push(`${tag}: update of unknown id`); break; }
        if (!beforeMatches(op.before, cur)) { issues.push(`${tag}: before mismatch (stale)`); break; }
        const node = snapshotToNode(op.after);
        if (!node || node.id !== op.itemId) { issues.push(`${tag}: incomplete/inconsistent after`); break; }
        work.set(op.itemId, node);
        break;
      }
      default: {
        // 型上は到達しない（exhaustiveness）。runtime malformed op の fail-closed。
        const _never: never = op;
        void _never;
        issues.push(`${tag}: unsupported op`);
      }
    }
  });

  if (issues.length > 0) {
    // atomic: 失敗時は入力不変のまま返す（部分適用しない）
    return { ok: false, nodes, issues };
  }
  const result = [...work.values()].sort((a, b) => a.startMin - b.startMin || a.id.localeCompare(b.id));
  return { ok: true, nodes: result, issues: [] };
}

// ── A1-2-2: safety-metric evaluator（4 安全 metric の保守的・独立算出） ──

/** 1 日の上限（分）。日境界・budget の保守的基準。 */
const MAX_DAY_MIN = 24 * 60;

/**
 * Gate 直結の安全 metric のみ（score / 主観 metric は **含まない**）。
 * best-action の safety / recovery_core / whole_part gate ＋ deadline に対応。
 */
export interface SafetyMetrics {
  readonly feasible: boolean;
  readonly recoveryProtected: boolean;
  readonly deadlineSatisfied: boolean;
  readonly wholePartCoherent: boolean;
}

/** 全 unsafe（apply 失敗・判定不能時の保守的 floor）。 */
const ALL_UNSAFE: SafetyMetrics = {
  feasible: false,
  recoveryProtected: false,
  deadlineSatisfied: false,
  wholePartCoherent: false,
};

/** 締切系の「壊してはいけない」node か（hard / locked / immovable / 重要度 critical）。 */
function isCriticalNode(n: GovernedNode): boolean {
  return n.hard || n.importance === "critical" || n.governance.flexibility === "locked" || isImmovable(n.governance);
}

function hasOverlap(nodes: readonly PlanNode[]): boolean {
  const sorted = [...nodes].sort((a, b) => a.startMin - b.startMin);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].startMin < sorted[i - 1].endMin) return true;
  }
  return false;
}

/** 幾何的に成立するか（各 node: 有限・duration>0・日境界内）∧ overlap なし。 */
function isFeasibleTimeline(nodes: readonly PlanNode[]): boolean {
  for (const n of nodes) {
    if (!(Number.isFinite(n.startMin) && Number.isFinite(n.endMin))) return false;
    if (n.endMin <= n.startMin) return false; // zero/negative duration
    if (n.startMin < 0 || n.endMin > MAX_DAY_MIN) return false; // 日境界外
  }
  return !hasOverlap(nodes);
}

/** 全体として 1 日に収まるか（budget: 総時間 ≤ 1日）∧ 日境界 overflow なし（cascade）。 */
function isWholeCoherent(nodes: readonly PlanNode[]): boolean {
  let total = 0;
  for (const n of nodes) {
    if (n.startMin < 0 || n.endMin > MAX_DAY_MIN) return false; // 日末押し出し（cascade overflow）
    total += Math.max(0, n.endMin - n.startMin);
  }
  return total <= MAX_DAY_MIN; // budget 破壊なし
}

/**
 * 候補 draft の **安全 metric を独立・保守的に算出**する純関数（A1-2-2）。
 *
 * 原則（CEO 補正準拠）: unsupported / unknown / missing / apply 失敗は必ず安全側(false)。
 *   不安全候補が安全扱いされる経路を構造的に *減らす*（絶対化はしない）。
 * 独立性: 既存 node の governance は **context（権威的）** から引く。draft の自己申告 snapshot を信じない。
 *
 * - feasible:            applyChangeSet 結果が幾何的に妥当（duration>0・日境界内・overlap なし）
 * - recoveryProtected:   remove/update が recovery_core node を触ったら false（add は無害）
 * - deadlineSatisfied:   remove/update が hard/locked/immovable/critical node を壊したら false
 * - wholePartCoherent:   budget(総時間 ≤ 1日) ∧ 日境界 overflow なし
 *
 * 注: score / goalAttainment / rhythmFit / 主観 metric は **算出しない**（A1-2-3 以降）。
 */
export function evaluateSafetyMetrics(draft: CandidateDraft, context: GenerationContext): SafetyMetrics {
  // context.nodes（GovernedNode）は PlanNode の上位互換。
  const applied = applyChangeSet(context.nodes, draft.changeSet);
  if (!applied.ok) return ALL_UNSAFE; // apply 失敗 → 全 false（保守）

  // 既存 node の governance は context から（独立: generator の before.governance を信じない）
  const byId = new Map<string, GovernedNode>();
  for (const n of context.nodes) byId.set(n.id, n);

  // recoveryProtected: remove/update が recovery_core を触れば false。unknown は安全側(false)。
  const recoveryProtected = !draft.changeSet.ops.some((op) => {
    if (op.kind === "add") return false; // add は recovery を cut しない
    const target = byId.get(op.itemId);
    if (!target) return true; // 不明 node を触る → 安全側
    return hasProtection(target.governance, "recovery_core");
  });

  // deadlineSatisfied: remove/update が critical node（hard/locked/immovable/critical）を壊せば false。
  const deadlineSatisfied = !draft.changeSet.ops.some((op) => {
    if (op.kind === "add") return false;
    const target = byId.get(op.itemId);
    if (!target) return true; // 不明 → 安全側
    return isCriticalNode(target);
  });

  return {
    feasible: isFeasibleTimeline(applied.nodes),
    recoveryProtected,
    deadlineSatisfied,
    wholePartCoherent: isWholeCoherent(applied.nodes),
  };
}

// ── A1-2-3: evaluateCandidate（draft → BestActionCandidate の橋） ──

/** 客観 metric: 不安定量 = 移動(update) + 削除(remove) の数。changeSet から事実として算出。 */
function computeInstability(cs: ChangeSet): number {
  return cs.ops.filter((op) => op.kind === "remove" || op.kind === "update").length;
}

/**
 * CandidateDraft を BestActionCandidate に組み立てる純関数（A1-2-3）。
 *
 * 原則:
 *   - **safety metrics は必ず `evaluateSafetyMetrics` の結果を使う**（generator の自己申告は型に無い）。
 *   - 客観 metric は `instability`（move+remove 数）**のみ**実算出。
 *   - subjective metric（goalAttainment / rhythmFit / slackHealth / overpack / contextSwitches /
 *     correctionMisalignment）は **中立 default 0**（**水増ししない**・本実装は A1-2-4 以降）。
 *   - best-action は不変。標準 BestActionCandidate を産むのみ → rankCandidates の Gate-first がそのまま効く
 *     （safety/recovery_core/whole_part/deadline gate false は score に関わらず reject）。
 */
export function evaluateCandidate(draft: CandidateDraft, context: GenerationContext): BestActionCandidate {
  const safety = evaluateSafetyMetrics(draft, context);
  const metrics: CandidateMetrics = {
    // safety（evaluator 由来・self-report 不使用）
    feasible: safety.feasible,
    wholePartCoherent: safety.wholePartCoherent,
    recoveryProtected: safety.recoveryProtected,
    deadlineSatisfied: safety.deadlineSatisfied,
    // 客観
    instability: computeInstability(draft.changeSet),
    // subjective: 中立 default 0（A1-2-4 以降で実算出。ここでは候補を水増ししない）
    goalAttainment: 0,
    rhythmFit: 0,
    slackHealth: 0,
    overpack: 0,
    contextSwitches: 0,
    correctionMisalignment: 0,
  };
  return {
    id: draft.id,
    changeSet: draft.changeSet,
    sourceTraces: draft.sourceTraces,
    metrics,
    proposedDisposition: draft.proposedDisposition,
  };
}
