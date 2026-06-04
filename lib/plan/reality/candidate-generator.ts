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
 *   - A1-3-R1a-2a: **Repair overlap trim-only coverage expansion**（generateRepairTrim）。
 *     全隣接 overlap を trim-only で全解消できる場合のみ **1 件の multi-op CandidateDraft**（各 op は update trim）。
 *     trim 対象は touchable かつ later より明確に lower-priority/more-flexible な earlier node のみ。
 *     move/cascade/add/remove・Complete/Build/Optimize は別 slice。生成物は metrics を持たない。
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
import { enrichSeedPlacementsFromEvidences, type DurationEvidence } from "./seed-placement-enrich";
import { generateComplete, type Interval } from "./complete-generator";
import type { SeedPlacement, TimeBand } from "./seed-placement";

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

/**
 * A1-4-4a: Complete dispatch 用の **structured optional input**（RealityInput 由来でない別経路）。
 * raw seed でなく **既に構造化された** SeedPlacement / DurationEvidence のみを受け取る。
 * 既存ノードは context.nodes を使うため含めない。clock 境界は caller 提供（未指定は generateComplete の既定）。
 */
export interface CompleteDispatchInput {
  /** 配置候補の材料（dispatcher 内で buildSeedPlacements/raw seed は使わない） */
  readonly seedPlacements: readonly SeedPlacement[];
  /** duration 証拠（flat・seedRef で内部 group 化して enrich）。任意。 */
  readonly durationEvidences?: readonly DurationEvidence[];
  /** 当日 active window（任意・未指定は generateComplete 既定 [0,1440]） */
  readonly activeWindow?: Interval;
  /** 当日日付（任意・placement.date 照合用） */
  readonly date?: string;
  /** band→clock 境界（任意・banded placement の解決用） */
  readonly bandBounds?: Readonly<Partial<Record<TimeBand, Interval>>>;
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
  /** A1-4-4a: Complete dispatch 用 structured input（mode=complete のときのみ消費・任意） */
  readonly completeInput?: CompleteDispatchInput;
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
export function generateCandidates(
  input: RealityInput,
  goals?: GenerationGoals,
  completeInput?: CompleteDispatchInput
): readonly CandidateDraft[] {
  const base = buildGenerationContext(input, goals);
  const context: GenerationContext = completeInput ? { ...base, completeInput } : base;
  return generateFromContext(context);
}

/**
 * mode 別生成の唯一の拡張点。
 * Complete（mode=complete ∧ completeInput 有）優先 → なければ Repair trim-only。**Repair 既存挙動は不変**。
 */
function generateFromContext(context: GenerationContext): readonly CandidateDraft[] {
  const complete = generateCompleteFromContext(context);
  if (complete) return [complete];
  const repair = generateRepairTrim(context);
  return repair ? [repair] : [];
}

/** DurationEvidence[]（flat）を seedRef→evidence[] の map に group 化（enrich 入力用・純粋）。 */
function groupEvidenceBySeedRef(evidences: readonly DurationEvidence[]): Record<string, DurationEvidence[]> {
  const map: Record<string, DurationEvidence[]> = {};
  for (const e of evidences) {
    const arr = map[e.seedRef] ?? [];
    arr.push(e);
    map[e.seedRef] = arr;
  }
  return map;
}

/**
 * A1-4-4a: Complete dispatch（mode=complete ∧ completeInput のときだけ candidate）。
 * structured placements を（evidence があれば）enrich → generateComplete に純粋に流す。
 * **buildSeedPlacements/raw seed は使わない**。既存ノードは context.nodes。Repair/他 mode は null。
 */
function generateCompleteFromContext(context: GenerationContext): CandidateDraft | null {
  if (context.mode !== "complete") return null;
  const ci = context.completeInput;
  if (!ci) return null;
  const evidenceMap = ci.durationEvidences ? groupEvidenceBySeedRef(ci.durationEvidences) : undefined;
  const enriched = enrichSeedPlacementsFromEvidences(ci.seedPlacements, evidenceMap);
  return generateComplete({
    placements: enriched,
    existing: context.nodes,
    activeWindow: ci.activeWindow,
    date: ci.date,
    bandBounds: ci.bandBounds,
  });
}

const IMPORTANCE_RANK: Record<NodeImportance, number> = { low: 0, normal: 1, high: 2, critical: 3 };

/**
 * trim 対象 A が相手 B より **明確に lower-priority / more-flexible** か（CEO 補正・重要な前予定を切らない）。
 *   - 明確に more-flexible: flexibilityRank(A) < flexibilityRank(B)（同 flexibility は不可＝推測しない）。
 *   - 重要度が逆転していない: importance(A) ≤ importance(B)（A が B より重要なら切らない）。
 * ＝「earlier だから切る」ではなく「明確に lower-priority な時だけ切る」。
 */
function isClearlyLowerPriority(a: GovernedNode, b: GovernedNode): boolean {
  return (
    flexibilityRank(a.governance.flexibility) < flexibilityRank(b.governance.flexibility) &&
    IMPORTANCE_RANK[a.importance] <= IMPORTANCE_RANK[b.importance]
  );
}

/**
 * A1-3-R1a-2a: Repair overlap **trim-only / shorten-only coverage expansion**（R1a の延長）。
 *
 * 戦略（all-or-nothing 全解消）: sorted nodes の隣接 overlapping pair を全走査し、**全 pair が
 *   trim-only で解消可能なら**、各 earlier node の end を直後 neighbor の start へ短縮する
 *   **1 件の multi-op CandidateDraft** を生成（各 op は update trim・start 固定）。
 *   全 overlap を解消しない部分候補は feasible gate で落ちる可能性が高いため、**全解消 1 件に限定**。
 *
 * trim 対象は **earlier かつ touchable かつ later より明確に lower-priority/more-flexible** な node のみ
 *   （isClearlyLowerPriority）。各 node は隣接で earlier に最大 1 回＝**1 回だけ trim**（dedupe 構造的）。
 *
 * **no candidate**（1 つでも該当で全体 null・推測しない）:
 *   mode≠repair / 重複なし / 包含(A.end≥B.end) / trim 後 duration≤0(A.start≥B.start) /
 *   A 非 touchable / A が B より明確に lower-priority でない（同 flexibility・重要度逆転 等）。
 *
 * move/shift/cascade/reschedule/add/remove はしない。later/preserved/protected は絶対に触れない。
 */
function generateRepairTrim(context: GenerationContext): CandidateDraft | null {
  if (context.mode !== "repair") return null;
  const nodes = [...context.nodes].sort((a, b) => a.startMin - b.startMin || a.id.localeCompare(b.id));
  const ops: ChangeOp[] = [];
  const traces: SourceTrace[] = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    const A = nodes[i];
    const B = nodes[i + 1];
    if (B.startMin >= A.endMin) continue; // この pair は重複なし
    // 以下いずれかに該当する overlap があれば trim-only で全解消できない → 全体 no candidate
    if (A.endMin >= B.endMin) return null; // 包含は defer
    if (A.startMin >= B.startMin) return null; // trim 後 duration ≤ 0
    if (!isTouchableForGeneration(A.governance)) return null; // A 不可侵
    if (!isClearlyLowerPriority(A, B)) return null; // A が明確に lower-priority でない → 推測しない
    // A の end を B.start へ trim（start 固定・純 shorten）。各 node は最大 1 回 trim。
    ops.push({
      kind: "update",
      itemId: A.id,
      before: { itemId: A.id, startMin: A.startMin, endMin: A.endMin, governance: A.governance },
      after: { itemId: A.id, startMin: A.startMin, endMin: B.startMin, governance: A.governance },
    });
    traces.push({ kind: "anchor", ref: A.id, reason: "重複解消のため短縮(trim)", confidence: 0.8 });
  }
  if (ops.length === 0) return null; // 解消すべき overlap なし
  const id = `repair-trim-${ops.map((o) => o.itemId).join("-")}`;
  const changeSet: ChangeSet = { id, ops, reason: "trim overlaps", sourceTraces: traces };
  return { id, changeSet, sourceTraces: traces, proposedDisposition: "confirm" };
}
