/**
 * FeasibilityJudgmentV0 — RJ1a 成立性の純粋判定器（pure core 限定）
 *
 * 正本: docs/reality-graph-contract-hardening-rg06.md / CEO RJ1a GO（2026-06-13）
 *
 * 思想（最重要・人間レベルの認識論的誠実さ）: これは **成立性の純粋判定器**であって判断文・提案・出発線ではない。
 *   核は **4 バケットの厳格分離**:
 *     - confirmedBlockingReasons … 「成立し得ない」と**確証**している（これだけが infeasible を作る）
 *     - inferredBlockingReasons  … 崩れる**兆候**はあるが未確証（最大でも feasible_with_risk）
 *     - unresolvedCriticalInputs … 判断に必要な材料が**欠けている**（→ unknown。失敗理由ではない）
 *     - riskFactors              … 脆さの severity context（block しない。riskLevel に集約）
 *   不確実を infeasible とも feasible とも**断定しない**。unknown は一級の正直な出力。
 *
 * 絶対規律（CEO RJ1a）:
 *   - Feasibility と Risk を分ける（別軸）。confirmed がある時のみ infeasible。
 *   - decisionDebt high ≠ risk high / commitment high ≠ infeasible / mobilityDebt high ≠ 遅刻確定。
 *   - missingInputs は判断不能理由であって失敗理由そのものではない。
 *   - **確率・% を出さない**（riskLevel は factor 集約であって probability ではない）。
 *   - proposal / 3 案 / 出発線 / intervention ladder / permission 緩和を**出さない**（型に存在しない）。
 *   - knownComponentSummary を正本入力にしない。LLM 推定を使わない。
 *   - permission blocked は **action 不可**であって feasibility 不可とは限らない（action gate context 扱い）。
 *   - pure（I/O・時刻 API・乱数なし）。RealityInstant は snapshot.builtAt を carry。UI/DB/外部 read 不接触。
 *
 * v0 の正直な振る舞い: RC2a v0 は placeCertainty 常に unknown・leaveBy 常に null・movementRequired は
 *   transition 無で unknown。よって**多くの target は unknown**（場所/ETA/route を本当に知らない）。
 *   infeasible は confirmed 構造衝突（hard 同士の時間 overlap）のみ。aggressive に infeasible を出さない。
 *
 * 独立裁定: FEASIBILITY_JUDGMENT_VERSION は **REALITY_DERIVATION_VERSIONS に入れない**。あの manifest は
 *   graph derivation 用で graphBaseId を決める。downstream の判断器版を混ぜると graph identity が判断ロジック
 *   変更で揺れる（誤り）。judgment 版は local const として judgmentId basis にのみ含める。
 */

import type { RealityGraphSnapshotV0 } from "./realityGraphSnapshot";
import type { RealityJudgmentInputV0, TargetScope } from "./realityJudgmentInput";
import { targetScopeKey } from "./realityJudgmentInput";
import type { EventRealityNodeV0 } from "./eventRealityNode";
import type { CommitmentSignalV0 } from "./commitmentSignal";
import type { MovementRealityV0 } from "./movementReality";
import type { MissingInputRef } from "./momentSnapshot";
import type { RealityInstant } from "./realityInstant";
import { DECISION_DEBT_COMPONENT_KEYS } from "./decisionDebt";
import { fnv1a64Hex, canonicalSerialize, type InputRevisionSet, type DerivationVersionSet } from "./graphIdentity";
import { toSubjectiveMin } from "@/lib/plan/dayState/timeOfDay";

/** judgment derive 版（graph manifest と独立 — judgmentId basis のみ） */
export const FEASIBILITY_JUDGMENT_VERSION = 0;

export type FeasibilityStatus = "feasible" | "feasible_with_risk" | "infeasible" | "unknown";
/** factor 集約であって probability ではない（% 禁止） */
export type RiskLevel = "low" | "elevated" | "high" | "unknown";
/** 判断の確信度（成功確率ではない）。confirmed vs inferred/missing の比を質的に表す */
export type JudgmentConfidence = "high" | "moderate" | "low" | "none";

export interface FeasibilityReason {
  readonly code: string;
  /** 関係するノード（day scope の集約 reason は対象が複数なら null 可） */
  readonly targetNodeId: string | null;
  readonly evidenceRefs: ReadonlyArray<string>;
}

export interface RealityJudgmentTrace {
  readonly schemaVersion: 0;
  /** cache key（snapshotId+targetScope+judgmentKind+version から決定的）。内容証明ではない・raw viewerId 不含 */
  readonly judgmentId: string;
  readonly judgmentKind: "feasibility";
  readonly feasibilityJudgmentVersion: number;
  readonly targetScope: TargetScope;
  readonly graphBaseId: string;
  readonly snapshotId: string;
  readonly inputRevisionSet: InputRevisionSet;
  readonly derivationVersionSet: DerivationVersionSet;
  readonly sourcesRevisionPending: true;
  readonly sourceRecordRevisionPending: true;
  /** 読んだ材料 id（ern/cs/mv）。array index 非依存・dedup 済み */
  readonly usedInputRefs: ReadonlyArray<string>;
  /** snapshot から carry（source trace を失わない） */
  readonly missingInputRefs: ReadonlyArray<MissingInputRef>;
  readonly factorRefs: ReadonlyArray<string>;
  readonly confirmedBlockingRefs: ReadonlyArray<string>;
  readonly inferredBlockingRefs: ReadonlyArray<string>;
  /** 評価が表す瞬間（= snapshot.builtAt の carry）。**identity 対象外**（computedAt を id に混ぜない） */
  readonly evaluatedAtInstant: RealityInstant;
}

export interface FeasibilityJudgmentV0 {
  readonly schemaVersion: 0;
  readonly feasibilityStatus: FeasibilityStatus;
  readonly riskLevel: RiskLevel;
  // ── 4 バケット（混ぜない）──
  readonly confirmedBlockingReasons: ReadonlyArray<FeasibilityReason>;
  readonly inferredBlockingReasons: ReadonlyArray<FeasibilityReason>;
  readonly unresolvedCriticalInputs: ReadonlyArray<FeasibilityReason>;
  readonly riskFactors: ReadonlyArray<FeasibilityReason>;
  // ── 正直さ ──
  readonly missingInputs: ReadonlyArray<string>;
  readonly missingInputRefs: ReadonlyArray<MissingInputRef>;
  readonly judgmentConfidence: JudgmentConfidence;
  readonly displayPolicy: "visible" | "hidden" | "debugOnly" | "notActionable";
  readonly evidenceRefs: ReadonlyArray<string>;
  readonly sourceRefs: {
    readonly dayGraphSnapshotId: string;
    readonly snapshotId: string;
    readonly momentSnapshotCacheKey: string;
  };
  readonly judgmentTrace: RealityJudgmentTrace;
}

// ── 内部: factor 集約の素材 ──

interface EventBuckets {
  confirmed: FeasibilityReason[];
  inferred: FeasibilityReason[];
  unresolved: FeasibilityReason[];
  risk: FeasibilityReason[];
  used: string[];
}

/** riskLevel に数えない context-only code（commitment/permission/changeCost は severity context であって脆さでない） */
const CONTEXT_ONLY_RISK_CODES: ReadonlySet<string> = new Set([
  "change_cost_context",
  "commitment_severity_context",
  "permission_action_gate",
]);

function reason(code: string, targetNodeId: string | null, evidenceRefs: ReadonlyArray<string>): FeasibilityReason {
  return { code, targetNodeId, evidenceRefs };
}

function subjectiveWindow(ern: EventRealityNodeV0): { start: number; end: number } | null {
  const s = toSubjectiveMin(ern.timeWindow.startHHMM);
  const e = toSubjectiveMin(ern.timeWindow.endHHMM);
  if (s === null || e === null || e < s) return null; // 主観境界跨ぎ/parse 不能は overlap 判定から除外（捏造しない）
  return { start: s, end: e };
}

function windowsOverlap(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start < b.end && b.start < a.end;
}

interface EvalCtx {
  snapshot: RealityGraphSnapshotV0;
  csByTarget: ReadonlyMap<string, CommitmentSignalV0>;
  mvByToAnchor: ReadonlyMap<string, MovementRealityV0>;
}

function isHardEvent(ern: EventRealityNodeV0, ctx: EvalCtx): boolean {
  // cs 不在/未確定は「hard でない」= confirmed 衝突を作らない（保守的・false infeasible を避ける）
  return ctx.csByTarget.get(ern.eventRealityNodeId)?.rigidity.value === "hard";
}

/** 単一 event の factor 収集（4 バケットに分離・混ぜない） */
function evaluateEvent(ern: EventRealityNodeV0, ctx: EvalCtx): EventBuckets {
  const b: EventBuckets = { confirmed: [], inferred: [], unresolved: [], risk: [], used: [ern.eventRealityNodeId] };
  const ernId = ern.eventRealityNodeId;
  const cs = ctx.csByTarget.get(ernId);
  if (cs) b.used.push(cs.commitmentSignalId);
  const mv = ctx.mvByToAnchor.get(ern.sourceRefs.anchorId);
  if (mv) b.used.push(mv.movementRealityId);

  // ── overlap: hard 同士 = confirmed / それ以外 = inferred（動かせる側がある）──
  const win = subjectiveWindow(ern);
  if (win) {
    const selfHard = isHardEvent(ern, ctx);
    for (const other of ctx.snapshot.eventRealityNodes) {
      if (other.eventRealityNodeId === ernId) continue;
      const ow = subjectiveWindow(other);
      if (!ow || !windowsOverlap(win, ow)) continue;
      if (selfHard && isHardEvent(other, ctx)) {
        b.confirmed.push(reason("hard_time_conflict", ernId, [`overlap_with:${other.eventRealityNodeId}`, "both_hard"]));
      } else {
        b.inferred.push(reason("schedule_tension_inferred", ernId, [`overlap_with:${other.eventRealityNodeId}`, "movable_side"]));
      }
    }
  } else {
    // 主観境界跨ぎ/parse 不能 = 分類不能 → risk context（unsupported・判断材料にしきれない）
    b.risk.push(reason("subjective_boundary_unsupported", ernId, ["unsupported_cross_subjective_boundary"]));
  }

  const isFixedStart = cs?.fixedStart.value === true;

  // ── place（critical unresolved: どこか分からねば mobility を判断できない）──
  if (ern.placeCertainty.status === "unknown") {
    b.unresolved.push(reason("place_resolution_pending", ernId, ern.placeCertainty.evidenceRefs));
  }

  // ── movement requirement / departure ──
  const mr = ern.movementRequired;
  if (mr.status === "unknown") {
    // 移動が要るかすら不明 = critical（mv 不在を「移動不要」と読まない）
    b.unresolved.push(reason("movement_requirement_unknown", ernId, mr.evidenceRefs));
  } else if (mr.value === true) {
    const etaUnknown = !mv || mv.etaKnown.value !== true;
    const routeUnknown = !mv || mv.routeKnown.value !== true;
    const leaveByUnresolved = ern.leaveBy.value === null;
    // fixed start + 移動必要 + 出発材料欠落 = 崩れる兆候（候補ブロッカー・断定しない）
    if (isFixedStart && (etaUnknown || routeUnknown || leaveByUnresolved)) {
      b.inferred.push(reason("movement_feasibility_unverified", ernId, ["fixed_start", "movement_required"]));
    }
    if (etaUnknown) b.unresolved.push(reason("eta_source_missing", ernId, mv?.mobilityStatus.evidenceRefs ?? []));
    if (routeUnknown) b.unresolved.push(reason("route_unresolved", ernId, mv?.mobilityStatus.evidenceRefs ?? []));
    if (leaveByUnresolved) b.unresolved.push(reason("leave_by_unresolved", ernId, ern.leaveBy.evidenceRefs));
  }

  // ── risk factors（block しない severity context）──
  for (const key of DECISION_DEBT_COMPONENT_KEYS) {
    const c = ctx.snapshot.decisionDebt.components[key];
    if (c.status !== "unknown" && (c.value ?? 0) > 0) {
      b.risk.push(reason(`decision_debt_${key}`, null, c.evidenceRefs));
    }
  }
  if (cs) {
    if (cs.changeCost.status !== "unknown" && (cs.changeCost.value ?? 0) > 0) {
      b.risk.push(reason("change_cost_context", ernId, cs.changeCost.evidenceRefs)); // severity only
    }
    if (cs.socialWeight.status !== "unknown" && (cs.socialWeight.value ?? 0) >= 0.5) {
      b.risk.push(reason("commitment_severity_context", ernId, cs.socialWeight.evidenceRefs)); // commitment ≠ blocker
    }
  }
  if (isFixedStart && ern.cascadeSensitivity.value === true) {
    b.risk.push(reason("time_pressure_context", ernId, ern.cascadeSensitivity.evidenceRefs));
  }
  // permission = action gate context（feasibility ではない・autonomy の話）
  if (ern.permissionLevel.status !== "unknown" && (ern.permissionLevel.value ?? 0) <= 0) {
    b.risk.push(reason("permission_action_gate", ernId, ern.permissionLevel.evidenceRefs));
  }

  return b;
}

function mergeBuckets(parts: EventBuckets[]): EventBuckets {
  const out: EventBuckets = { confirmed: [], inferred: [], unresolved: [], risk: [], used: [] };
  for (const p of parts) {
    out.confirmed.push(...p.confirmed);
    out.inferred.push(...p.inferred);
    out.unresolved.push(...p.unresolved);
    out.risk.push(...p.risk);
    out.used.push(...p.used);
  }
  out.used = [...new Set(out.used)].sort();
  return out;
}

function fragilitySignalCount(b: EventBuckets): number {
  return b.inferred.length + b.risk.filter((r) => !CONTEXT_ONLY_RISK_CODES.has(r.code)).length;
}

function deriveRiskLevel(b: EventBuckets): RiskLevel {
  if (b.confirmed.length > 0) return "high";
  const signals = fragilitySignalCount(b);
  if (signals === 0) return b.unresolved.length > 0 ? "unknown" : "low";
  return signals >= 3 ? "high" : "elevated";
}

function deriveStatus(b: EventBuckets, riskLevel: RiskLevel): FeasibilityStatus {
  if (b.confirmed.length > 0) return "infeasible"; // confirmed がある時のみ
  if (b.unresolved.length > 0) return "unknown"; // 情報不足は unknown（infeasible にしない）
  if (b.inferred.length > 0 || riskLevel === "elevated" || riskLevel === "high") return "feasible_with_risk";
  return "feasible";
}

function deriveConfidence(b: EventBuckets, status: FeasibilityStatus): JudgmentConfidence {
  if (status === "infeasible") return "high"; // confirmed 構造衝突
  if (status === "feasible") return "high";
  if (status === "unknown") return b.unresolved.length >= 2 ? "none" : "low";
  return "moderate"; // feasible_with_risk
}

function displayPolicyFor(status: FeasibilityStatus): FeasibilityJudgmentV0["displayPolicy"] {
  // unknown は「verdict」として出さない（actionable なのは missingInputs 側）→ notActionable
  return status === "unknown" ? "notActionable" : "visible";
}

/** RealityJudgmentInput を消費して成立性を純粋判定する（判断結果のみ・行動/提案を出さない） */
export function evaluateFeasibility(input: RealityJudgmentInputV0): FeasibilityJudgmentV0 {
  const snapshot = input.graphSnapshot;
  const scope = input.targetScope;

  const csByTarget = new Map<string, CommitmentSignalV0>();
  for (const cs of snapshot.commitmentSignals) csByTarget.set(cs.targetNodeId, cs);
  const mvByToAnchor = new Map<string, MovementRealityV0>();
  for (const mv of snapshot.movementRealityNodes) mvByToAnchor.set(mv.sourceRefs.toAnchorId, mv);
  const ctx: EvalCtx = { snapshot, csByTarget, mvByToAnchor };

  // ── 対象 event 群を決める ──
  let targets: EventRealityNodeV0[];
  if (scope.kind === "event") {
    const t = snapshot.eventRealityNodes.find((e) => e.eventRealityNodeId === scope.eventRealityNodeId);
    targets = t ? [t] : [];
  } else {
    // day = 今からの成立性 = active + upcoming（past は済んで成立性に影響しない）
    const ids = new Set([
      ...snapshot.momentSnapshot.relevantNodes.activeEventNodeIds,
      ...snapshot.momentSnapshot.relevantNodes.upcomingEventNodeIds,
    ]);
    targets = snapshot.eventRealityNodes.filter((e) => ids.has(e.eventRealityNodeId));
  }

  const buckets = mergeBuckets(targets.map((ern) => evaluateEvent(ern, ctx)));
  const riskLevel = deriveRiskLevel(buckets);
  const feasibilityStatus = deriveStatus(buckets, riskLevel);
  const judgmentConfidence = deriveConfidence(buckets, feasibilityStatus);

  // ── trace identity（cache key・内容証明でない・raw viewerId 不含[snapshotId が擬名化済み]）──
  const judgmentId = `rjf:${fnv1a64Hex(
    canonicalSerialize({ s: snapshot.snapshotId, scope: targetScopeKey(scope), k: "feasibility", v: FEASIBILITY_JUDGMENT_VERSION }),
  )}`;

  const trace: RealityJudgmentTrace = {
    schemaVersion: 0,
    judgmentId,
    judgmentKind: "feasibility",
    feasibilityJudgmentVersion: FEASIBILITY_JUDGMENT_VERSION,
    targetScope: scope,
    graphBaseId: snapshot.graphBaseId,
    snapshotId: snapshot.snapshotId,
    inputRevisionSet: snapshot.inputRevisionSet,
    derivationVersionSet: snapshot.derivationVersionSet,
    sourcesRevisionPending: true,
    sourceRecordRevisionPending: true,
    usedInputRefs: buckets.used,
    missingInputRefs: snapshot.missingInputRefs, // carry（source trace を失わない）
    factorRefs: buckets.risk.map((r) => r.code),
    confirmedBlockingRefs: buckets.confirmed.map((r) => r.code),
    inferredBlockingRefs: buckets.inferred.map((r) => r.code),
    evaluatedAtInstant: snapshot.builtAt, // identity 対象外
  };

  return {
    schemaVersion: 0,
    feasibilityStatus,
    riskLevel,
    confirmedBlockingReasons: buckets.confirmed,
    inferredBlockingReasons: buckets.inferred,
    unresolvedCriticalInputs: buckets.unresolved,
    riskFactors: buckets.risk,
    missingInputs: snapshot.missingInputs, // carry
    missingInputRefs: snapshot.missingInputRefs, // carry（source trace を失わない）
    judgmentConfidence,
    displayPolicy: displayPolicyFor(feasibilityStatus),
    evidenceRefs: ["feasibility_judgment_v0"],
    sourceRefs: {
      dayGraphSnapshotId: snapshot.sourceRefs.dayGraphSnapshotId,
      snapshotId: snapshot.snapshotId,
      momentSnapshotCacheKey: snapshot.sourceRefs.momentSnapshotCacheKey,
    },
    judgmentTrace: trace,
  };
}

const FEASIBILITY_STATUSES: ReadonlySet<string> = new Set(["feasible", "feasible_with_risk", "infeasible", "unknown"]);
const RISK_LEVELS: ReadonlySet<string> = new Set(["low", "elevated", "high", "unknown"]);

/** judgment の構造健全性検証（空 = 適合）。fixture / 監査が使用 */
export function feasibilityJudgmentViolations(j: FeasibilityJudgmentV0): string[] {
  const out: string[] = [];
  if (!FEASIBILITY_STATUSES.has(j.feasibilityStatus)) out.push(`judgment: feasibilityStatus 不正 "${j.feasibilityStatus}"`);
  if (!RISK_LEVELS.has(j.riskLevel)) out.push(`judgment: riskLevel 不正 "${j.riskLevel}"`);
  // **confirmed がある時のみ infeasible**（未確認ブロックを confirmed 扱いしない）
  if (j.feasibilityStatus === "infeasible" && j.confirmedBlockingReasons.length === 0) {
    out.push("judgment: infeasible なのに confirmedBlockingReasons が空（断定の捏造）");
  }
  // unresolved があるのに feasible 断定していない（unknown へ倒す規律）
  if (j.unresolvedCriticalInputs.length > 0 && j.feasibilityStatus === "feasible") {
    out.push("judgment: 未解決 critical 入力があるのに feasible 断定");
  }
  // trace identity
  if (!j.judgmentTrace.judgmentId) out.push("judgment: judgmentId が空");
  if (!j.judgmentTrace.snapshotId) out.push("judgment: trace.snapshotId が空");
  if (!j.judgmentTrace.graphBaseId) out.push("judgment: trace.graphBaseId が空");
  // missingInputRefs の source trace 健全性
  for (const r of j.missingInputRefs) {
    if (!r.sourceNodeId || !r.dedupeKey) out.push(`judgment: missingInputRef "${r.code}" の source trace 欠落`);
  }
  return out;
}
