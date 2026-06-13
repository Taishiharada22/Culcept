/**
 * RealityGraphSnapshotV0 — Graph root assembler（RC2a-6・pure core 限定）
 *
 * 正本: docs/reality-graph-contract-hardening-rg06.md §1（root の正本）/
 *       docs/reality-graph-identity-hardening-rg06b.md §1-4/§12（identity 3 層・viewer 擬名化）/
 *       CEO RC2a-6 GO（2026-06-13）
 *
 * 思想（RG0.6 §1）: Snapshot は**保存される blob ではなく毎回 derive される編成結果**。
 *   RC2a で作った compile 済み材料（ern / mv / cs / decisionDebt / momentSnapshot）を一つの graph root に束ね、
 *   identity（graphBaseId/snapshotId）・InputRevisionSet・sourceRefs・missingInputRefs・safetyFlags を完成させる。
 *
 * Department: Plan/Risk joint（瞬間の判断入力 + 当日 graph を束ねる。**判断結果は出さない**）。
 *
 * 最重要原則（CEO/GPT）: これは **identity と編成の層**であって判断の層ではない。
 *   Feasibility / CollapseRisk / 3 案 / 出発線 / Proposal / Permission action を**出さない**（型に存在しない）。
 *   RJ1 がこの snapshot を RealityJudgmentInput として消費して初めて判断する。
 *
 * identity 規律（RG0.6b §1-3 + CEO RC2a-6）— 前提を疑った上での裁定:
 *  - **2 層 identity**: graphBaseId（**day-level**・InputRevisionSet 由来・分に依存しない）→
 *    snapshotId（graphBaseId + minuteOfSubjectiveDay）。分は snapshot 層でのみ入る。
 *  - **momentSnapshotCacheKey を InputRevisionSet に入れない**（CEO 裁定の独立判断）: cacheKey は分を内包する
 *    派生物。base に混ぜると graphBaseId が毎分変わり 2 層モデルが崩れる（= CEO 自身の identity 規律と矛盾）。
 *    cacheKey は **sourceRefs に trace として**載せる（identity basis ではない）。
 *  - **source compile versions / graphAssemblerVersion は derivationRevision が既に内包**（InputRevisionSet に
 *    別 field を増やさない）。可視性は derivationVersionSet（full manifest object）で担保。
 *  - hash は cache key であって内容同一の証明ではない（id 同一 ⇒ 内容同一ではない）。
 *  - raw viewerId を id/log/debug に出さない（graphViewerKey の擬名化のみ・未供給は pending sentinel）。
 *  - builtAt（= momentSnapshot.instant）の秒/ms・computed timestamp は identity 対象外（分 precision まで）。
 *  - array index を identity/参照に使わない。node 配列は id で canonical 整列。duplicate id は fail。
 *
 * 規律:
 *  - pure（I/O・時刻 API・乱数・Date.now なし）。RealityInstant は momentSnapshot から carry（再計算しない）。
 *  - **decisionDebt / instant は momentSnapshot から取る**（別入力にして mismatch を生まない — 単一正本）。
 *  - 未実装入力（DayStateRecord / weather / hints / shift）は **pending sentinel** で明示（空文字/0 で埋めない）。
 *  - browser local timezone / getHours を使わない。UI / localStorage / API / DB / location / notification / 外部 read 不接触。
 *  - safetyFlags は**宣言的な規律マニフェスト**であって実行権限ではない（実行可否は Permission/Action Boundary 側）。
 */

import type { DayStateRecordV0 } from "@/lib/plan/dayState/dayStateTypes";
import type { EventRealityNodeV0 } from "./eventRealityNode";
import type { MovementRealityV0 } from "./movementReality";
import type { CommitmentSignalV0 } from "./commitmentSignal";
import type { DecisionDebtV0 } from "./decisionDebt";
import { decisionDebtViolations } from "./decisionDebt";
import type { MomentStateSnapshotV0, MissingInputRef } from "./momentSnapshot";
import { momentSnapshotViolations } from "./momentSnapshot";
import type { RealityInstant } from "./realityInstant";
import {
  buildGraphBaseId,
  buildSnapshotId,
  derivationRevision,
  recordRevisionOf,
  REALITY_DERIVATION_VERSIONS,
  type InputRevisionSet,
  type DerivationVersionSet,
} from "./graphIdentity";

/** assembler の derive 版（RC2a-1b §4 — manifest 一致 fixture）。= REALITY_DERIVATION_VERSIONS.graphAssembler */
export const GRAPH_ASSEMBLER_VERSION = 0;
/** Graph schema 版（= REALITY_DERIVATION_VERSIONS.graphSchema）。InputRevisionSet.schemaVersion に載る */
export const GRAPH_SCHEMA_VERSION = 0;

/** viewer 未供給時の sentinel（raw viewerId を入れない・graphViewerKey も無いケース） */
export const VIEWER_SCOPE_PENDING = "vkpending";

/** InputRevisionSet の未供給入力 sentinel（空文字/0 で埋めない — 明示 pending） */
const RECORD_REVISION_PENDING = "rec0:none";
const ENVIRONMENT_REVISION_PENDING = "env0:none";
const HINTS_REVISION_PENDING = "hints0:none";
const SHIFT_REVISION_PENDING = "shift0:none";

/** 部署名（runtime に identity/ref として載せてはいけない — RC2a-5B §1 の graph 昇格） */
const DEPARTMENT_NAMES: ReadonlySet<string> = new Set([
  "Plan",
  "Mobility",
  "Energy",
  "Context",
  "Memory",
  "Risk",
  "Permission",
  "Communication",
]);

/**
 * 宣言的な規律マニフェスト（CEO RC2a-6 §safetyFlags）。**実行権限ではない**。
 *  - 一部（unknownNotZero / missingInputTracePreserved / noRuntimeDepartmentObject）は**実データ検証結果**。
 *  - 残り（no*Output / no*Read / cacheKeyNotContentProof）は型/コードの構造保証 = tripwire（false 化したら test が落ちる）。
 */
export interface RealityGraphSafetyFlags {
  readonly unknownNotZero: boolean;
  readonly noRuntimeDepartmentObject: boolean;
  readonly noFeasibilityOutput: boolean;
  readonly noProposalOutput: boolean;
  readonly noPermissionRelaxation: boolean;
  readonly noLocationRuntimeRead: boolean;
  readonly noExternalRead: boolean;
  readonly noUiConnection: boolean;
  readonly cacheKeyNotContentProof: boolean;
  readonly missingInputTracePreserved: boolean;
}

export interface RealityGraphViewerScope {
  /** pseudonymous = graphViewerKey 供給済み / pending = 未供給（raw viewerId は決して入れない） */
  readonly kind: "pseudonymous" | "pending";
  readonly viewerKey: string;
}

export interface RealityGraphSnapshotV0 {
  readonly schemaVersion: 0;
  /** assembler の derive 版（identity basis の derivationRevision に内包・可視化のため別途 carry） */
  readonly graphAssemblerVersion: number;

  // ── identity（2 層・RG0.6b）──
  /** **day-level**・InputRevisionSet 由来・分に依存しない cache key（内容証明ではない） */
  readonly graphBaseId: string;
  /** graphBaseId + minuteOfSubjectiveDay（minute 層）。同分 ⇒ 同 snapshotId */
  readonly snapshotId: string;
  /** 擬名化 viewer scope（raw viewerId なし） */
  readonly viewerScope: RealityGraphViewerScope;

  // ── 時刻（builtAt = momentSnapshot.instant の carry）──
  /** builtAt: RealityInstant（Asia/Tokyo・browser TZ 非依存・秒/ms は identity 対象外） */
  readonly builtAt: RealityInstant;
  readonly subjectiveDate: string;
  readonly timezone: string;
  readonly minuteOfSubjectiveDay: number;

  // ── ノード集合（full objects・id で相互参照・所有しない・canonical 整列）──
  readonly eventRealityNodes: ReadonlyArray<EventRealityNodeV0>;
  readonly movementRealityNodes: ReadonlyArray<MovementRealityV0>;
  readonly commitmentSignals: ReadonlyArray<CommitmentSignalV0>;
  /** = momentSnapshot.decisionDebt（単一正本・別入力にしない） */
  readonly decisionDebt: DecisionDebtV0;
  readonly momentSnapshot: MomentStateSnapshotV0;

  // ── identity / revision の完成 ──
  readonly inputRevisionSet: InputRevisionSet;
  readonly derivationVersionSet: DerivationVersionSet;
  /** InputRevisionSet で pending sentinel になっている入力名（"recordRevision" 等・machine-visible） */
  readonly pendingInputs: ReadonlyArray<string>;

  // ── 正直さ・安全 ──
  /** 統合 missingInputs codes（refs 由来のみ・sort 済み） */
  readonly missingInputs: ReadonlyArray<string>;
  /** source trace（momentSnapshot から失わず carry + graph-level pending refs・dedupeKey で整列） */
  readonly missingInputRefs: ReadonlyArray<MissingInputRef>;
  readonly safetyFlags: RealityGraphSafetyFlags;
  /** 構造健全性検査の結果（空 = 健全）。重複/不整合は throw 済みなので主に momentSnapshot provenance */
  readonly integrityViolations: ReadonlyArray<string>;
  readonly sourceRefs: {
    readonly dayGraphSnapshotId: string;
    /** momentSnapshot の cache key を trace として保持（identity basis ではない — 上記裁定） */
    readonly momentSnapshotCacheKey: string;
  };
  readonly evidenceRefs: ReadonlyArray<string>;
}

export interface AssembleRealityGraphInput {
  /** 当日の EventRealityNode 全量（full objects） */
  readonly ern: ReadonlyArray<EventRealityNodeV0>;
  readonly mv: ReadonlyArray<MovementRealityV0>;
  readonly cs: ReadonlyArray<CommitmentSignalV0>;
  /** 「今この瞬間」の判断入力。instant / decisionDebt はここから取る（単一正本） */
  readonly momentSnapshot: MomentStateSnapshotV0;
  /** graphViewerKey の出力（raw viewerId 禁止）。未供給は pending sentinel */
  readonly viewerKey?: string;
  /** 本人台帳（recordRevision 用）。未供給は pending sentinel */
  readonly dayStateRecord?: DayStateRecordV0;
}

function assertUniqueIds(label: string, ids: ReadonlyArray<string>): void {
  if (new Set(ids).size !== ids.length) {
    throw new Error(`assembleRealityGraph: duplicate ${label}（id join が壊れる）`);
  }
}

function assertSameIdSet(label: string, a: ReadonlyArray<string>, b: ReadonlyArray<string>): void {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size !== sb.size || [...sa].some((id) => !sb.has(id))) {
    throw new Error(`assembleRealityGraph: ${label} が momentSnapshot.nodeRefs と一致しない（材料が別 graph 由来の疑い）`);
  }
}

export function assembleRealityGraph(input: AssembleRealityGraphInput): RealityGraphSnapshotV0 {
  const ms = input.momentSnapshot;
  const decisionDebt = ms.decisionDebt; // 単一正本（別入力にしない）
  const instant = ms.instant; // builtAt = momentSnapshot の instant（再計算しない）

  // ── duplicate id guard（全 node 種別 — CEO #5）──
  const ernIds = input.ern.map((e) => e.eventRealityNodeId);
  const mvIds = input.mv.map((m) => m.movementRealityId);
  const csIds = input.cs.map((c) => c.commitmentSignalId);
  assertUniqueIds("eventRealityNodeId", ernIds);
  assertUniqueIds("movementRealityId", mvIds);
  assertUniqueIds("commitmentSignalId", csIds);

  // ── 材料整合性 guard（momentSnapshot と同一の node 集合・同一 graph 由来か）──
  assertSameIdSet("eventRealityNodeIds", ernIds, ms.nodeRefs.eventRealityNodeIds);
  assertSameIdSet("movementRealityIds", mvIds, ms.nodeRefs.movementRealityIds);
  // cs は targetNodeId(=ern id) で join。commitmentSignalTargetIds と cs.targetNodeId を突き合わせ
  assertSameIdSet("commitmentSignalTargetIds", input.cs.map((c) => c.targetNodeId), ms.nodeRefs.commitmentSignalTargetIds);

  // dayGraphSnapshotId / subjectiveDate の正本一致（材料が別日/別 graph 由来でないこと）
  const dayGraphSnapshotId = ms.sourceRefs.dayGraphSnapshotId;
  if (dayGraphSnapshotId !== decisionDebt.sourceRefs.dayGraphSnapshotId) {
    throw new Error("assembleRealityGraph: dayGraphSnapshotId が momentSnapshot と decisionDebt で食い違う");
  }
  if (instant.subjectiveDate !== decisionDebt.subjectiveDate) {
    throw new Error("assembleRealityGraph: subjectiveDate が instant と decisionDebt で食い違う");
  }

  // ── InputRevisionSet（real where available / 未供給は pending sentinel・空文字/0 で埋めない）──
  const inputRevisionSet: InputRevisionSet = {
    dayGraphRevision: dayGraphSnapshotId,
    recordRevision: input.dayStateRecord ? recordRevisionOf(input.dayStateRecord) : RECORD_REVISION_PENDING,
    environmentRevision: ENVIRONMENT_REVISION_PENDING,
    hintsRevision: HINTS_REVISION_PENDING,
    shiftRevision: SHIFT_REVISION_PENDING,
    derivationRevision: derivationRevision(REALITY_DERIVATION_VERSIONS),
    schemaVersion: GRAPH_SCHEMA_VERSION,
  };
  const pendingInputs = [
    input.dayStateRecord ? null : "recordRevision",
    "environmentRevision",
    "hintsRevision",
    "shiftRevision",
  ].filter((x): x is string => x !== null);

  // ── identity 2 層（既存 helper を使う・再発明しない）──
  const viewerKey = input.viewerKey ?? VIEWER_SCOPE_PENDING;
  const viewerScope: RealityGraphViewerScope = {
    kind: input.viewerKey ? "pseudonymous" : "pending",
    viewerKey,
  };
  const graphBaseId = buildGraphBaseId({ subjectiveDate: instant.subjectiveDate, viewerKey, inputRevisionSet });
  const snapshotId = buildSnapshotId(graphBaseId, instant.minuteOfSubjectiveDay);

  // ── missingInputRefs: momentSnapshot から失わず carry + graph-level pending refs ──
  const graphRefs: MissingInputRef[] = [];
  for (const name of pendingInputs) {
    // pending revision を pipeline_capability として表現（部署名を runtime に載せない）
    const code = `${name === "recordRevision" ? "day_state_record" : name.replace(/Revision$/, "")}_pending`;
    graphRefs.push({
      code,
      sourceNodeKind: "pipeline_capability",
      sourceNodeId: "graph",
      sourceField: name,
      evidenceRefs: [],
      dedupeKey: `pipeline_capability:graph:${name}:${code}`,
      displayPolicy: "debugOnly",
      criticality: "unknown",
    });
  }
  const allRefs = [...ms.missingInputRefs, ...graphRefs].sort((a, b) => a.dedupeKey.localeCompare(b.dedupeKey));
  const missingInputs = [...new Set(allRefs.map((r) => r.code))].sort();

  // ── safetyFlags（実データ検証 + 構造 tripwire）──
  const provenanceClean = decisionDebtViolations(decisionDebt).length === 0;
  const noDeptInRefs = !allRefs.some((r) => DEPARTMENT_NAMES.has(r.sourceField));
  const traceComplete = missingInputs.every((c) => allRefs.some((r) => r.code === c));
  const safetyFlags: RealityGraphSafetyFlags = {
    unknownNotZero: provenanceClean,
    noRuntimeDepartmentObject: noDeptInRefs,
    missingInputTracePreserved: traceComplete,
    // 構造保証（型/コード由来・false 化したら test が落ちる tripwire）
    noFeasibilityOutput: true,
    noProposalOutput: true,
    noPermissionRelaxation: true,
    noLocationRuntimeRead: true,
    noExternalRead: true,
    noUiConnection: true,
    cacheKeyNotContentProof: true,
  };

  // ── 構造健全性検査（重複/不整合は throw 済み。残りは momentSnapshot provenance/trace）──
  const integrityViolations = momentSnapshotViolations(ms);

  // ── canonical 整列（array index 非依存・content 比較を安定化）──
  const eventRealityNodes = [...input.ern].sort((a, b) => a.eventRealityNodeId.localeCompare(b.eventRealityNodeId));
  const movementRealityNodes = [...input.mv].sort((a, b) => a.movementRealityId.localeCompare(b.movementRealityId));
  const commitmentSignals = [...input.cs].sort((a, b) => a.commitmentSignalId.localeCompare(b.commitmentSignalId));

  return {
    schemaVersion: 0,
    graphAssemblerVersion: GRAPH_ASSEMBLER_VERSION,
    graphBaseId,
    snapshotId,
    viewerScope,
    builtAt: instant,
    subjectiveDate: instant.subjectiveDate,
    timezone: instant.timezone,
    minuteOfSubjectiveDay: instant.minuteOfSubjectiveDay,
    eventRealityNodes,
    movementRealityNodes,
    commitmentSignals,
    decisionDebt,
    momentSnapshot: ms,
    inputRevisionSet,
    derivationVersionSet: REALITY_DERIVATION_VERSIONS,
    pendingInputs,
    missingInputs,
    missingInputRefs: allRefs,
    safetyFlags,
    integrityViolations,
    sourceRefs: { dayGraphSnapshotId, momentSnapshotCacheKey: ms.momentSnapshotCacheKey },
    evidenceRefs: ["reality_graph_snapshot_v0"],
  };
}

/** snapshot の構造健全性検証（空 = 適合）。fixture / 監査が使用 */
export function realityGraphSnapshotViolations(snap: RealityGraphSnapshotV0): string[] {
  const out: string[] = [];
  if (!snap.graphBaseId) out.push("graph: graphBaseId が空");
  if (!snap.snapshotId) out.push("graph: snapshotId が空");
  if (!snap.sourceRefs.dayGraphSnapshotId) out.push("graph: dayGraphSnapshotId が空");
  if (snap.evidenceRefs.length === 0) out.push("graph: evidenceRefs が空");
  // raw viewerId 混入禁止: viewerScope.viewerKey は vk... か pending sentinel のみ
  if (snap.viewerScope.kind === "pseudonymous" && !snap.viewerScope.viewerKey.startsWith("vk")) {
    out.push("graph: viewerKey が擬名化形式でない（raw viewerId の疑い）");
  }
  // 部署名を runtime ref に載せない
  for (const r of snap.missingInputRefs) {
    if (DEPARTMENT_NAMES.has(r.sourceField)) out.push(`graph: missingInputRef "${r.code}" が部署名を runtime に載せている`);
  }
  // flat missingInputs は refs 由来のみ
  for (const code of snap.missingInputs) {
    if (!snap.missingInputRefs.some((r) => r.code === code)) out.push(`graph: missingInput "${code}" の source trace が欠落`);
  }
  // momentSnapshot 層の検査も graph レベルで担保
  out.push(...momentSnapshotViolations(snap.momentSnapshot));
  return out;
}
