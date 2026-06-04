/**
 * Reality Control OS — Candidate Evaluator（A1-2-1: CandidateDraft 型 + applyChangeSet 器のみ）
 *
 * 親設計: docs/aneurasync-reality-candidate-generator-design.md（A1 系）
 *
 * 役割（A1-2 全体）: 候補の安全 metrics を **generator の自己申告でなく evaluator が独立算出** する。
 *   - generator(A1-3+) は `CandidateDraft`（metrics を持たない型）を出す＝**自己申告できない**。
 *   - evaluator(A1-2-2) だけが metrics を産み `BestActionCandidate` を組む（A1-2-1 ではまだ作らない）。
 *
 * 【A1-2-1 の範囲（CEO GO・厳密）】:
 *   - `CandidateDraft` 型（metrics / score / gate result を構造的に持てない）。
 *   - `applyChangeSet(nodes, cs)` の **最小純関数**（適用結果の計算のみ）。
 *     supported op のみ / unsupported は fail / unknown・missing node は fail /
 *     before・after 不整合は fail / **node mutation なし** / **raw title/location/text を持ち込まない**。
 *   - **safety 判定はしない**（feasible / recoveryProtected / deadlineSatisfied / wholePartCoherent の
 *     本判定は A1-2-2）。BestActionCandidate 化・score 計算・mode 生成も A1-2-1 では作らない。
 *
 * 【安全原則（表現は CEO 補正済）】:
 *   Gate-first は候補を採用前に弾くが Gate は metrics を信じる。ゆえに generator が metrics を
 *   *申告できない* 構造（CandidateDraft）にし、unsupported/unknown/missing は必ず安全側(fail)に倒して、
 *   **不安全候補が安全扱いされる経路を構造的に減らす**（絶対化はしない＝実装バグ/未対応 op は残りうる）。
 *
 * 制約: 純関数のみ。LLM / DB / UI / route / runtime / 実データ / push なし。barrel 未追加。
 */

import type { BestActionCandidate } from "./best-action";
import type { ChangeSet, PlanItemSnapshot } from "./change-set";
import type { PlanItemGovernance } from "./authority";

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
