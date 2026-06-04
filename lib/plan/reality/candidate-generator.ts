/**
 * Reality Control OS — Candidate Generator（A1-1 器のみ・safe no-op）
 *
 * 親設計: docs/aneurasync-reality-control-os-phase0-design.md（4 mode）
 *         + best-action.ts（Gate-first→score）/ authority.ts（不可侵の正本）
 *
 * 役割: RealityInput（実 plan 状態の抽象）から BestActionCandidate[] を **生成**する入口。
 *   既存 best-action は「どう選ぶか」だけを担い、metrics は呼び出し側が事前計算する。
 *   ＝候補生成器は (1) ChangeSet 生成 (2) metrics 算出 の双方を担う中核臓器。
 *
 * 【範囲】:
 *   - A1-1: GenerationContext（器）＋ generateCandidates は safe no-op。
 *   - A1-3-R1a: **Repair overlap trim-only** のみ実装（generateRepairTrim・最大 1 件・update op 1 つ）。
 *     Complete/Build/Optimize は別 slice。生成物は **CandidateDraft（metrics を持たない）**。
 *   - 安全 metrics 評価器（feasible/recoveryProtected 等）は **A1-2**（candidate-evaluator）。
 *   - 本ファイルが作る GenerationContext:
 *       dayNode ↔ anchors.governance の join を明示し、authority の述語を *消費*（再実装しない）して
 *       touchable / preserved に分類する。modes はこの context を経由してしか node に触れない。
 *
 * 【安全原則（独立分析）】:
 *   Gate-first は不安全候補を採用前に弾くが、Gate は候補の metrics を *信じる*。
 *   ゆえに真のリスクは「生成器が metrics を甘く自己認証する」こと。→ A1-2 で保守評価器を先に固める。
 *   A1-1 では metrics を一切付けない（no-op）。「何に触れてよいか」の床だけを authority 消費で確定する。
 *
 * 制約: 純関数のみ。LLM / DB / UI / route / runtime / 実データ / push なし。additive / reversible。
 */

import { isImmovable, isRepairTouchable, hasProtection, repairTouchOrder, flexibilityRank, type PlanItemGovernance } from "./authority";
import type { RealityInput } from "./integration/input-adapter";
import type { NodeImportance } from "./post-event-recompute";
import type { EngineMode } from "./invariant-check";
import type { SourceTrace } from "./source-trace";
import type { ChangeSet, ChangeOp } from "./change-set";
import type { CandidateDraft } from "./candidate-evaluator";

/**
 * anchor governance が見つからない dayNode への保守的デフォルト = immovable。
 * 「分類できないものは触らない」（fail-closed）。
 */
const CONSERVATIVE_IMMOVABLE_GOVERNANCE: PlanItemGovernance = {
  origin: "imported",
  authority: "import_locked",
  flexibility: "locked",
  protectionReasons: ["hard_external"],
};

/** dayNode と anchors.governance を join 済みのノード（生成器が見る最小単位）。 */
export interface GovernedNode {
  readonly id: string;
  readonly startMin: number;
  readonly endMin: number;
  readonly importance: NodeImportance;
  readonly hard: boolean;
  readonly governance: PlanItemGovernance;
}

/** seed 由来の希望（生成 mode が満たそうとする目的）。A1-1 では trace を保持するのみ。 */
export interface GenerationGoals {
  readonly seeds: readonly SourceTrace[];
}

/** 生成 mode が消費する文脈。touchable/preserved は authority を消費して分類済み。 */
export interface GenerationContext {
  readonly mode: EngineMode;
  /** dayNode↔governance join 済の全ノード（入力順を保持） */
  readonly nodes: readonly GovernedNode[];
  /** 触れてよいノード（isRepairTouchable ∧ 非 recovery_core）。repairTouchOrder 順。 */
  readonly touchable: readonly GovernedNode[];
  /** 保全ノード（immovable ∪ recovery_core）。生成器は決して触れない。 */
  readonly preserved: readonly GovernedNode[];
  readonly goals: GenerationGoals;
}

/**
 * 触れてよいか（authority を *消費*・再実装しない）。
 *   = repair が触れてよい（isRepairTouchable = 非 isImmovable）∧ 回復核でない（recovery_core 保全）。
 * A1-1 floor は保守的: recovery_core は preserve-as-is（A1-5 Repair で評価器付きで再考しうる）。
 */
export function isTouchableForGeneration(g: PlanItemGovernance): boolean {
  return isRepairTouchable(g) && !hasProtection(g, "recovery_core");
}

/** 保全（触れない）か。= immovable(isImmovable) ∪ recovery_core。isTouchableForGeneration の補集合。 */
export function isPreservedForGeneration(g: PlanItemGovernance): boolean {
  return !isTouchableForGeneration(g);
}

function governanceOf(input: RealityInput, id: string): PlanItemGovernance {
  return input.anchors[id]?.governance ?? CONSERVATIVE_IMMOVABLE_GOVERNANCE;
}

function deriveGoals(input: RealityInput): GenerationGoals {
  return { seeds: input.seedTraces.filter((t) => t.kind === "seed") };
}

/**
 * dayNode と anchors.governance を join し、authority を消費して touchable/preserved に分類する。
 * 純粋。modes（A1-3+）はこの context を経由してのみ node に触れる。
 */
export function buildGenerationContext(input: RealityInput, goals?: GenerationGoals): GenerationContext {
  const nodes: GovernedNode[] = input.dayNodes.map((n) => ({
    id: n.id,
    startMin: n.startMin,
    endMin: n.endMin,
    importance: n.importance,
    hard: n.hard,
    governance: governanceOf(input, n.id), // dayNode ↔ anchors.governance の join を明示
  }));

  // authority を *消費* して分類（isImmovable / isRepairTouchable / repairTouchOrder / hasProtection）
  const preserved = nodes.filter((n) => isPreservedForGeneration(n.governance));
  const touchable = repairTouchOrder(nodes.filter((n) => isTouchableForGeneration(n.governance)));

  return { mode: input.mode, nodes, touchable, preserved, goals: goals ?? deriveGoals(input) };
}

/**
 * 候補生成器。**CandidateDraft（metrics を持たない）** を出す（評価/metrics は evaluator の責務）。
 * A1-3-R1a: Repair trim-only のみ実装。Complete/Build/Optimize は別 slice。
 */
export function generateCandidates(input: RealityInput, goals?: GenerationGoals): readonly CandidateDraft[] {
  const context = buildGenerationContext(input, goals);
  return generateFromContext(context);
}

/** mode 別生成の唯一の拡張点。A1-3-R1a では Repair trim-only のみ。 */
function generateFromContext(context: GenerationContext): readonly CandidateDraft[] {
  const repair = generateRepairTrim(context);
  return repair ? [repair] : [];
}

/**
 * A1-3-R1a: Repair overlap **trim-only / shorten-only**（最大 1 件・update op 1 つ）。
 *
 * 戦略（reschedule しない最小修復）: 重複する隣接 2 node (A=earlier, B=later) のうち、
 *   **earlier かつ lower-priority かつ touchable な A の end を B.start まで短縮**する（A.start 固定）。
 *   ＝重複部分だけを切る。move/shift/cascade/add/remove はしない。
 *
 * no candidate にする条件（CEO 補足・推測しない）:
 *   - mode が repair でない / 重複なし。
 *   - A が touchable でない（preserved/immovable/recovery 等）。
 *   - 包含（A.end ≥ B.end）/ trim 後 duration ≤ 0（A.start ≥ B.start）。
 *   - A と B が共に touchable で **優先度が決め切れない**（A が B より strictly more-touchable でない）。
 */
function generateRepairTrim(context: GenerationContext): CandidateDraft | null {
  if (context.mode !== "repair") return null;
  const nodes = [...context.nodes].sort((a, b) => a.startMin - b.startMin || a.id.localeCompare(b.id));
  for (let i = 0; i < nodes.length - 1; i++) {
    const A = nodes[i];
    const B = nodes[i + 1];
    if (B.startMin >= A.endMin) continue; // 重複なし
    if (A.endMin >= B.endMin) continue; // 包含は defer
    if (A.startMin >= B.startMin) continue; // trim 後 duration ≤ 0
    if (!isTouchableForGeneration(A.governance)) continue; // A 不可侵
    if (isTouchableForGeneration(B.governance)) {
      // 両 touchable: A が strictly lower-priority(more touchable) でなければ推測しない
      if (!(flexibilityRank(A.governance.flexibility) < flexibilityRank(B.governance.flexibility))) continue;
    }
    // A の end を B.start へ trim（start 固定・純 shorten）
    const trace: SourceTrace = { kind: "anchor", ref: A.id, reason: "重複解消のため短縮(trim)", confidence: 0.8 };
    const op: ChangeOp = {
      kind: "update",
      itemId: A.id,
      before: { itemId: A.id, startMin: A.startMin, endMin: A.endMin, governance: A.governance },
      after: { itemId: A.id, startMin: A.startMin, endMin: B.startMin, governance: A.governance },
    };
    const changeSet: ChangeSet = { id: `repair-trim-${A.id}`, ops: [op], reason: "trim overlap", sourceTraces: [trace] };
    return { id: `repair-trim-${A.id}`, changeSet, sourceTraces: [trace], proposedDisposition: "confirm" };
  }
  return null;
}
