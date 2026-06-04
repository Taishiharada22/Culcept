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
 * 【A1-1 の範囲（CEO GO・厳密）】:
 *   - generateCandidates は **safe no-op（[]）**。Build/Complete/Repair/Optimize は **A1-3+**。
 *   - 安全 metrics 評価器（feasible/recoveryProtected 等の保守的自己認証）は **A1-2**（本ファイルに無い）。
 *   - 本ファイルが作るのは **GenerationContext（器）** のみ:
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

import { isImmovable, isRepairTouchable, hasProtection, repairTouchOrder, type PlanItemGovernance } from "./authority";
import type { RealityInput } from "./integration/input-adapter";
import type { NodeImportance } from "./post-event-recompute";
import type { EngineMode } from "./invariant-check";
import type { SourceTrace } from "./source-trace";
import type { BestActionCandidate } from "./best-action";

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
 * A1-1: **safe no-op** 候補生成器（器のみ）。
 * context は構築するが、生成 mode（Build/Complete/Repair/Optimize=A1-3+）も
 * 安全 metrics 床（A1-2）も未実装のため、提案を一切出さない（空配列）。
 */
export function generateCandidates(input: RealityInput, goals?: GenerationGoals): readonly BestActionCandidate[] {
  const context = buildGenerationContext(input, goals);
  return generateFromContext(context);
}

/**
 * mode 別生成の **唯一の拡張点**（A1-3+ でここに Build/Complete/Repair/Optimize を足す）。
 * A1-1 では常に空（modes 未実装・metrics を甘く自己認証しない）。
 */
function generateFromContext(_context: GenerationContext): readonly BestActionCandidate[] {
  return [];
}
