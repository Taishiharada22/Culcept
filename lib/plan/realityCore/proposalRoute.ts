/**
 * proposalRoute — RO-4（2026-06-20）: Proposal 3案（protect/easy/push）pure kernel（pure・no-IO）
 *
 * 正本設計: docs/reality-os-ro4-proposal-routes-design.md（RO-4 v0.1・敵対的検証 17 mustFix 反映）
 * 思想: RO-3 の RealityLearningSignalV0 を読み、その日の現実が動いた後の task に対して「どう構えるか」の
 *   3案 — protect（守る）/ easy（楽に）/ push（攻める）— を pure に生成する。実行でなく**候補生成まで**。
 *
 * 位置づけ（CEO 二重正本化回避・empty-day-generator と「兄弟レーン」）:
 *   - 入力源直交: empty-day は EmptyDayInput（空き window）を読む。RO-4 は RealityLearningSignalV0 のみ読む。
 *   - 出力意味直交: EmptyDayProposal は day skeleton（時間ブロック）。ProposalRouteV0 は reaction stance（ブロックなし）。
 *   - 正本型を新設しない: RO-3 が materialize 済みの task_proposal edge（realityGraphEdge.ts:128-130）に着地。
 *     taskProposalJoinKey（taskEdgePrep.ts:57「RJ4 が参照・RO-4 所管」・RO-4 は RJ4 と参照を共有）。
 *
 * stance vocab（CorrectionDirection 先例・correctionGradient.ts:36-39）:
 *   - RealityProposalStance は EmptyDayTier（empty-day-generator.ts:23）と**値同形・別意味**（充填度 vs reaction stance）。
 *   - import 結合せず realityCore lineage 内で**独立 re-define**（semantics-bleed 回避）。
 *     ※ EmptyDayTier/Intent/Proposal を import も借用もしない。empty-day runtime（generateEmptyDay 等）を呼ばない。
 *
 * 不変条件: IO / RNG / now / Date / DB / localStorage / PredictionLedger write を一切持たない（全 read-only・戻り値のみ）。
 *   RO-1/2/3 + empty-day 既存型を改変しない（import type のみ）。
 */
import type { RealityLearningSignalV0 } from "./realityLearningSignal";
import type { RealityFrameV0, RealityNodeRef } from "./realityFrame";
import type { TaskRealityNodeV0 } from "./taskRealityNode";
import type { CorrectionAxis, CorrectionGradientV0 } from "./correctionGradient";
import type { TaskOutcomeKind } from "./taskOutcome";

export const PROPOSAL_ROUTE_VERSION = 0;

/**
 * RealityProposalStance — EmptyDayTier（"protect"|"easy"|"push"・empty-day-generator.ts:23）と**値同形だが
 * 別意味**（空き window 充填度ではなく制約グラフ route の reaction stance）。import 結合せず独立 re-define。
 * 将来 system-wide stance vocab を中立 location に統合する余地あり（過渡対応）。
 */
export type RealityProposalStance = "protect" | "easy" | "push";

export const PROPOSAL_STANCES: ReadonlyArray<RealityProposalStance> = ["protect", "easy", "push"];

/** 断定しない（empty-day-reasoning.ts:99-100 と同水準）。visible/high を持たない。 */
export type RouteConfidence = "low" | "tentative";

export type RouteBasisBucket = "diff_collapsed" | "change_task" | "gradient_axis";

export interface ProposalRouteReasonV0 {
  readonly stance: RealityProposalStance;
  readonly basisBucket: RouteBasisBucket;
  /** signal 由来 evidence のみ（捏造禁止・空 source は skip）。 */
  readonly evidenceRefs: ReadonlyArray<string>;
}

export interface ProposalRouteV0 {
  readonly stance: RealityProposalStance;
  /** 空可（evidence 無し route は reasons 空 + confidence=tentative で honest に出す・黙らせない）。 */
  readonly reasons: ReadonlyArray<ProposalRouteReasonV0>;
  readonly confidence: RouteConfidence;
}

export interface ProposalRouteSetV0 {
  readonly schemaVersion: 0;
  /** injected seed から deterministic（乱数/now なし）。 */
  readonly routeSetId: string;
  /** task_proposal edge の from（task・universe='workLane'）に固定（M4）。 */
  readonly forTarget: RealityNodeRef;
  /** 常に 3（protect/easy/push 順）。 */
  readonly routes: ReadonlyArray<ProposalRouteV0>;
  /** 根拠最多・同点/不足/incomplete は null（偽推薦なし）。 */
  readonly recommended: RealityProposalStance | null;
  readonly unresolvedCount: number;
  readonly unresolvedNotes: ReadonlyArray<string>;
  /** ledgerCandidates の targetNodeId を read-only 転記（PredictionLedger に write しない）。 */
  readonly ledgerRefsObserved: ReadonlyArray<string>;
}

/** push にできる前進系 outcome（carried_over/blocked/skipped は前進でないので除外・honest）。 */
const PUSH_OUTCOMES: ReadonlySet<TaskOutcomeKind> = new Set<TaskOutcomeKind>(["completed", "partial", "progressed"]);

/** easy の burden-reducing 判定で「負荷が下がる＝楽」が成立する負荷系 axis（energy は別扱い）。 */
const EASE_LOAD_AXES: ReadonlySet<CorrectionAxis> = new Set<CorrectionAxis>(["duration", "cognitiveLoad", "prep"]);

/**
 * easy 根拠になる gradient か（axis 別 burden-reducing・M3 修正）。
 *   - 負荷系（duration/cognitiveLoad/prep）: direction='lower'（負荷が見立てより低い＝楽）。
 *   - energy: direction='higher'（余力が見立てより高い＝楽）。energy×lower は「しんどい」で easy ではない。
 *   - 'match'（見立て通り）は easy の根拠にしない（中立）。route/deadline（accept/reject 系）は v0 不採用。
 */
function isEaseReducingGradient(g: CorrectionGradientV0): boolean {
  if (g.basis.length === 0) return false; // 過剰帰属禁止（basis 必須）
  if (EASE_LOAD_AXES.has(g.axis)) return g.direction === "lower";
  if (g.axis === "energy") return g.direction === "higher";
  return false;
}

/** ern id（"ern:<date>:<anchorId>"・compileEventRealityNodes.ts:191）から anchorId を取り出す。 */
function anchorIdFromErnId(ernId: string): string | null {
  const parts = ernId.split(":");
  if (parts.length < 3 || parts[0] !== "ern") return null;
  return parts.slice(2).join(":"); // anchorId（date は YYYY-MM-DD で : を含まない）
}

interface StanceEvidenceV0 {
  readonly protect: ReadonlyArray<ProposalRouteReasonV0>;
  readonly easy: ReadonlyArray<ProposalRouteReasonV0>;
  readonly push: ReadonlyArray<ProposalRouteReasonV0>;
}

/**
 * deriveStanceEvidence — signal の 3 bucket を task の 3 stance evidence に写像（pure・M2/M3 反映）。
 *   protect = collapsed（event 宇宙）を task.sourceRefs.anchorId で橋渡し（非 anchored task は空・honest）。
 *   push    = node-scoped 前進系 task change。
 *   easy    = day-level burden-reducing gradient（per-task ref なし・全 set 共有）。
 */
function deriveStanceEvidence(signal: RealityLearningSignalV0, task: TaskRealityNodeV0): StanceEvidenceV0 {
  const protect: ProposalRouteReasonV0[] = [];
  const easy: ProposalRouteReasonV0[] = [];
  const push: ProposalRouteReasonV0[] = [];

  // protect ← diff.collapsed（anchorId lineage 橋渡し・M2）
  const taskAnchorId = task.sourceRefs.anchorId ?? null;
  if (taskAnchorId !== null) {
    for (const c of signal.diff.collapsed) {
      if (c.ref.kind !== "event") continue;
      const ernAnchor = anchorIdFromErnId(c.ref.id);
      if (ernAnchor === null || ernAnchor !== taskAnchorId) continue;
      protect.push({
        stance: "protect",
        basisBucket: "diff_collapsed",
        evidenceRefs: [`gap_${c.fromGap}_to_${c.toGap}`, `anchor_${taskAnchorId}`],
      });
    }
  }

  // push ← changes[lane='task' && sourceVocab='task_outcome' && 前進系 && target=task]
  for (const ch of signal.changes) {
    if (ch.lane !== "task" || ch.sourceVocab !== "task_outcome") continue;
    if (ch.target.id !== task.taskRealityNodeId) continue;
    if (!PUSH_OUTCOMES.has(ch.classifiedAs as TaskOutcomeKind)) continue; // carried_over/blocked/skipped 除外
    push.push({ stance: "push", basisBucket: "change_task", evidenceRefs: ch.evidenceRefs });
  }

  // easy ← gradients[axis 別 burden-reducing]（day-level・全 set 共有・per-task ref なし）
  for (const g of signal.gradients) {
    if (!isEaseReducingGradient(g)) continue;
    easy.push({ stance: "easy", basisBucket: "gradient_axis", evidenceRefs: g.basis });
  }

  return { protect, easy, push };
}

/**
 * pickRecommended — reasons 数最多の stance を推薦（pure）。
 *   同点 / 全空 / (unresolvedCount>0 かつ push 最多) は null（不完全データで「攻めろ」を推さない・偽推薦なし）。
 *   recommendByEnergy / LOAD_FRACTION / TIERS（empty-day）を一切呼ばない（semantics-bleed 防止）。
 */
function pickRecommended(ev: StanceEvidenceV0, unresolvedCount: number): RealityProposalStance | null {
  const counts: Record<RealityProposalStance, number> = {
    protect: ev.protect.length,
    easy: ev.easy.length,
    push: ev.push.length,
  };
  const max = Math.max(counts.protect, counts.easy, counts.push);
  if (max === 0) return null; // 全空
  const top = PROPOSAL_STANCES.filter((s) => counts[s] === max);
  if (top.length !== 1) return null; // 同点
  const winner = top[0];
  if (unresolvedCount > 0 && winner === "push") return null; // 不完全データで push を推さない
  return winner;
}

export interface BuildProposalRoutesInputV0 {
  /** RO-3 出力（read-only）。 */
  readonly signal: RealityLearningSignalV0;
  /** task ノード（anchorId）解決用・read-only・改変しない。 */
  readonly frame: RealityFrameV0;
  /** injected・deterministic（caller が生成・RO-4 は乱数/now を持たない）。 */
  readonly routeSetIdSeed: string;
}

/**
 * buildProposalRoutes — RO-4 の心臓部（pure・signal の初 reader・戻り値のみ）。
 *   task_proposal edge（resolvable）の from=task ごとに 3 route の ProposalRouteSetV0 を生成。
 *   write は一切しない（PredictionLedger/DB/localStorage 不接触）。
 */
export function buildProposalRoutes(input: BuildProposalRoutesInputV0): ReadonlyArray<ProposalRouteSetV0> {
  const { signal, frame, routeSetIdSeed } = input;
  const taskById = new Map(frame.workLane.tasks.map((t) => [t.taskRealityNodeId, t]));

  // unresolved（graph 品質）= 全 route 共通の honesty gate
  const unresolvedCount = signal.unresolved.length;
  const unresolvedNotes = signal.unresolved.map((u) => u.missing ?? `${u.kind}_unresolved`).filter((m): m is string => m !== null);
  const confidence: RouteConfidence = unresolvedCount > 0 ? "tentative" : "low";

  // task_proposal edge（resolvable）の from=task が母集合（phantom は route 化しない）
  const targets: RealityNodeRef[] = [];
  const seen = new Set<string>();
  for (const e of signal.edges) {
    if (e.kind !== "task_proposal" || !e.resolvable) continue;
    if (e.from.universe !== "workLane" || e.from.kind !== "task") continue;
    if (seen.has(e.from.id)) continue;
    seen.add(e.from.id);
    targets.push(e.from);
  }

  const out: ProposalRouteSetV0[] = [];
  for (const forTarget of targets) {
    const task = taskById.get(forTarget.id);
    if (task === undefined) continue; // frame に task 本体が無ければ anchorId 解決不能（route を発明しない）

    const ev = deriveStanceEvidence(signal, task);
    const routes: ProposalRouteV0[] = PROPOSAL_STANCES.map((stance) => {
      const reasons = stance === "protect" ? ev.protect : stance === "easy" ? ev.easy : ev.push;
      return { stance, reasons, confidence }; // 常に 3 route・evidence 無しは reasons 空 + tentative
    });

    const ledgerRefsObserved = signal.ledgerCandidates
      .filter((c) => c.targetNodeId === forTarget.id)
      .map((c) => c.targetNodeId);

    out.push({
      schemaVersion: 0,
      routeSetId: `proute:${routeSetIdSeed}:${forTarget.id}`,
      forTarget,
      routes,
      recommended: pickRecommended(ev, unresolvedCount),
      unresolvedCount,
      unresolvedNotes,
      ledgerRefsObserved,
    });
  }

  return out;
}

/** INV: ProposalRouteSet の不変条件（空=適合・throw しない・RO 系 *Violations pattern 踏襲）。 */
export function proposalRouteViolations(set: ProposalRouteSetV0): string[] {
  const out: string[] = [];
  const push = (m: string) => out.push(`proposalRoute: ${m}`);

  // 常に 3 route・protect/easy/push を 1 つずつ網羅
  if (set.routes.length !== 3) push(`routes は常に 3（got ${set.routes.length}）`);
  const stances = set.routes.map((r) => r.stance);
  for (const s of PROPOSAL_STANCES) {
    if (stances.filter((x) => x === s).length !== 1) push(`stance ${s} がちょうど 1 つでない`);
  }

  // forTarget は task に一本化（M4: proposal endpoint=universe 'attribute' は不採用）
  if (set.forTarget.universe !== "workLane" || set.forTarget.kind !== "task") {
    push(`forTarget は workLane/task（got ${set.forTarget.universe}/${set.forTarget.kind}）`);
  }

  for (const r of set.routes) {
    // reasons[].stance は route.stance と一致
    for (const reason of r.reasons) {
      if (reason.stance !== r.stance) push(`reason.stance(${reason.stance}) が route.stance(${r.stance}) と不一致`);
      if (reason.evidenceRefs.length === 0) push(`${r.stance} の reason に evidenceRefs が無い（捏造防止: 根拠なし reason 禁止）`);
    }
    // unresolvedNotes 非空時は confidence=tentative
    if (set.unresolvedNotes.length > 0 && r.confidence !== "tentative") {
      push(`unresolved あり時 confidence=tentative（got ${r.confidence}）`);
    }
  }

  // recommended は存在 stance のいずれか（null は許容）
  if (set.recommended !== null && !PROPOSAL_STANCES.includes(set.recommended)) {
    push(`recommended が未知（"${set.recommended}"）`);
  }
  if (set.unresolvedCount !== set.unresolvedNotes.length && set.unresolvedCount < set.unresolvedNotes.length) {
    push("unresolvedCount が unresolvedNotes を下回る");
  }
  return out;
}
