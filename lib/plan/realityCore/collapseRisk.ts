/**
 * CollapseRiskProfileV0 — RC2b-1 「どこが崩れそうか」の factor map / failure modes（pure core 限定）
 *
 * 正本: docs/reality-graph-contract-hardening-rg06.md §1（E7 CollapseRisk）/ CEO RC2b-1 GO（2026-06-13）
 *
 * 最重要原則（CEO）: **CollapseRisk は Feasibility とは別軸**。混ぜない。
 *   - Feasibility = 成立するか / 判断できるか（feasibilityStatus）
 *   - CollapseRisk = **どこが崩れやすいか / どんな failure mode があるか**（本型）
 *   本 evaluator は **feasibilityStatus / feasibility の riskLevel を読まない / コピーしない**。feasibility の
 *   reasons / relations（既分類の証拠）を「崩れ方の地図」に再投影し、**独立に** riskLevel を集約する。
 *
 * 2 軸分離（RC2b-1A #1）: **riskLevel = known severity**（collapse_source 由来の high/elevated/low。known severity 無 +
 *   risk-relevant 未解決 → unknown / それも無 → low）。**unknown は severity でなく completeness 不足**であり
 *   high/elevated/low と同軸で max しない。未解決は riskCompleteness / hasUnresolvedRiskInputs / unresolvedRiskInputRefs に
 *   別保持し、known severity を潰さない（known high + 未解決 → riskLevel high + completeness partial）。
 *   confidence = evidence completeness（成功確率でない）。source_revision_pending は riskLevel を上げず completeness/confidence に効く。
 *
 * 不変条件（CEO）:
 *   - infeasible = collapseRisk high とは限らない（status をコピーしない）
 *   - unknown = collapseRisk high ではない / missingInputs = failure ではない（missing → unknown 寄与・severity でない）
 *   - decisionDebt high = collapseRisk high ではない（decision_unresolved = unknown 寄与）
 *   - commitment high = collapseRisk high ではない（**severity modifier**: 崩れた時の痛み・risk source でない）
 *   - exact_time_collision_ambiguous = duplicate ではない（RJ1b-A 継承・unknown 寄与）
 *   - permission blocked = feasibility failure でなく **action boundary**（collapse source でない）
 *
 * 規律（CEO）:
 *   - **確率・% を出さない**（riskLevel は factor aggregation）。proposal / 3案 / 出発線 / intervention ladder /
 *     判断文 / 通知 / action / permission 緩和を出さない（型に存在しない）。
 *   - fake ETA / fake leaveBy / fake prep time / currentLocation / weather route friction を作らない。
 *   - knownComponentSummary を正本入力にしない。LLM 推定を使わない。
 *   - 全 failure mode に sourceRefs / evidenceRefs / missingInputRefs を持たせ、code だけで作文できない構造にする。
 *   - pure（I/O・時刻 API・乱数なし）。RealityInstant は feasibilityJudgment 経由 snapshot.builtAt を carry。
 *
 * 独立裁定: COLLAPSE_RISK_VERSION は graph manifest（REALITY_DERIVATION_VERSIONS）に入れない
 *   （downstream 判断器版で graph identity を揺らさない — FEASIBILITY_JUDGMENT_VERSION と同じ）。
 */

import type { RealityGraphSnapshotV0 } from "./realityGraphSnapshot";
import type { MissingInputRef } from "./momentSnapshot";
import type { RealityInstant } from "./realityInstant";
import { fnv1a64Hex, canonicalSerialize } from "./graphIdentity";
import type {
  FeasibilityJudgmentV0,
  FeasibilityReason,
  RiskLevel,
  JudgmentConfidence,
} from "./feasibilityJudgment";

/** collapse derive 版（graph manifest と独立 — collapseRiskId basis のみ） */
export const COLLAPSE_RISK_VERSION = 0;

/** failure mode の意味的カテゴリ（CEO 不変条件の構造化 — risk source / 未解決 / 痛み modifier / action 境界を混ぜない） */
export type CollapseFailureCategory = "collapse_source" | "unresolved" | "severity_modifier" | "action_boundary";

/** riskLevel への寄与（factor aggregation・確率ではない）。none = riskLevel を上げない */
export type RiskContribution = "high" | "elevated" | "unknown" | "none";

export interface CollapseFailureMode {
  readonly mode: string;
  readonly category: CollapseFailureCategory;
  readonly riskContribution: RiskContribution;
  readonly targetNodeId: string | null;
  /** field-level（feasibility reason から carry・node#field・code だけで作文させない） */
  readonly evidenceRefs: ReadonlyArray<string>;
  /** unresolved/ambiguous mode: 解消に要る入力 code。collapse_source / modifier は [] */
  readonly missingInputRefs: ReadonlyArray<string>;
  /** time mode: 対応する pairwise relationId（day → event pair）。非 time は [] */
  readonly relationRefs: ReadonlyArray<string>;
  readonly sourceRefs: { readonly dayGraphSnapshotId: string };
}

export interface CollapseRiskTrace {
  readonly schemaVersion: 0;
  /** cache key（snapshotId + feasibilityJudgmentId + kind + version）。内容証明でない・raw viewerId 不含 */
  readonly collapseRiskId: string;
  readonly collapseRiskVersion: number;
  readonly graphBaseId: string;
  readonly snapshotId: string;
  /** どの FeasibilityJudgment を材料にしたか */
  readonly feasibilityJudgmentId: string;
  readonly usedInputRefs: ReadonlyArray<string>;
  readonly factorRefs: ReadonlyArray<string>;
  readonly missingInputRefs: ReadonlyArray<MissingInputRef>;
  /** 参照した pairwise relationId（day → event pair → field） */
  readonly relationRefs: ReadonlyArray<string>;
  readonly evidenceRefs: ReadonlyArray<string>;
  /** 評価が表す瞬間（= snapshot.builtAt の carry）。identity 対象外 */
  readonly evaluatedAtInstant: RealityInstant;
}

export interface CollapseRiskProfileV0 {
  readonly schemaVersion: 0;
  /**
   * **known risk severity**（factor aggregation・確率でない）。**collapse_source からのみ** high/elevated を出す。
   * known severity が無く risk-relevant unresolved があれば unknown（gauge できない）/ それも無ければ low。
   * **unknown は severity ではなく completeness 不足**であり、high/elevated/low と同軸で max しない（RC2b-1A #1）。
   */
  readonly riskLevel: RiskLevel;
  /** 評価の充足度（別軸）: complete = 未解決なし / partial = known severity あり + 未解決/source pending / unknown = known severity なし + 未解決 */
  readonly riskCompleteness: "complete" | "partial" | "unknown";
  /** risk-relevant な未解決入力（unresolved/unknown 寄与）があるか。source_revision_pending は含めない */
  readonly hasUnresolvedRiskInputs: boolean;
  /** 未解決 risk 入力の参照（後続判断で聞く/補うべき入力・field-level） */
  readonly unresolvedRiskInputRefs: ReadonlyArray<string>;
  readonly failureModes: ReadonlyArray<CollapseFailureMode>;
  /** feasibility から carry（severity context・崩れた時の痛み等。risk source ではない） */
  readonly riskFactors: ReadonlyArray<FeasibilityReason>;
  /** feasibility から carry（未解決 = 判断材料不足。failure ではない） */
  readonly unresolvedCriticalInputs: ReadonlyArray<FeasibilityReason>;
  readonly missingInputs: ReadonlyArray<string>;
  readonly missingInputRefs: ReadonlyArray<MissingInputRef>;
  /** 参照した pairwise relationId */
  readonly pairwiseRelationRefs: ReadonlyArray<string>;
  readonly confidence: JudgmentConfidence;
  readonly displayPolicy: "visible" | "hidden" | "debugOnly" | "notActionable";
  readonly sourceRefs: {
    readonly dayGraphSnapshotId: string;
    readonly snapshotId: string;
    readonly feasibilityJudgmentId: string;
  };
  readonly evidenceRefs: ReadonlyArray<string>;
  readonly trace: CollapseRiskTrace;
}

export interface EvaluateCollapseRiskInput {
  readonly graphSnapshot: RealityGraphSnapshotV0;
  readonly feasibilityJudgment: FeasibilityJudgmentV0;
}

/** reason code → failure mode（category / riskContribution）。CEO 不変条件を mapping に固定 */
interface ModeSpec {
  readonly mode: string;
  readonly category: CollapseFailureCategory;
  readonly riskContribution: RiskContribution;
}

function modeSpecFor(reasonCode: string): ModeSpec | null {
  if (reasonCode.startsWith("decision_debt_")) {
    return { mode: "decision_unresolved", category: "unresolved", riskContribution: "unknown" }; // decisionDebt high ≠ collapse high
  }
  switch (reasonCode) {
    // ── collapse source（確証/兆候の崩れ）──
    case "hard_time_conflict":
      return { mode: "time_conflict_confirmed", category: "collapse_source", riskContribution: "high" };
    case "schedule_tension_inferred":
      return { mode: "time_tension_inferred", category: "collapse_source", riskContribution: "elevated" };
    // ── unresolved（材料不足 = unknown 寄与・failure でない・high でない）──
    case "movement_feasibility_unverified":
    case "movement_requirement_unknown":
    case "route_unresolved":
      return { mode: "movement_unresolved", category: "unresolved", riskContribution: "unknown" };
    case "place_resolution_pending":
      return { mode: "place_unresolved", category: "unresolved", riskContribution: "unknown" };
    case "eta_source_missing":
      return { mode: "eta_unresolved", category: "unresolved", riskContribution: "unknown" };
    case "leave_by_unresolved":
      return { mode: "leave_by_unresolved", category: "unresolved", riskContribution: "unknown" };
    case "exact_time_collision_ambiguous":
      return { mode: "exact_time_collision_ambiguous", category: "unresolved", riskContribution: "unknown" }; // duplicate でない
    case "subjective_boundary_unsupported":
      return { mode: "boundary_spanning_unsupported", category: "unresolved", riskContribution: "unknown" };
    // ── severity modifier（崩れた時の痛み・risk source でない → riskLevel を上げない）──
    case "commitment_severity_context":
      return { mode: "high_commitment_if_disrupted", category: "severity_modifier", riskContribution: "none" };
    case "change_cost_context":
      return { mode: "high_commitment_if_disrupted", category: "severity_modifier", riskContribution: "none" };
    // ── action boundary（permission・collapse source でない → riskLevel を上げない）──
    case "permission_action_gate":
      return { mode: "permission_action_gate", category: "action_boundary", riskContribution: "none" };
    // time_pressure_context 等は failureModes に昇格せず riskFactors（carry）に留める
    default:
      return null;
  }
}

const TIME_MODE_TO_RELATION_KIND: Record<string, string> = {
  time_conflict_confirmed: "confirmed_time_conflict",
  time_tension_inferred: "inferred_time_tension",
  exact_time_collision_ambiguous: "exact_time_collision_ambiguous",
};

/**
 * known severity は **collapse_source からのみ**導く（RC2b-1A #1/#2）。unresolved/modifier/action_boundary は
 * severity を作らない。unknown(completeness) を severity と同軸で max しない。
 */
function deriveKnownSeverity(modes: ReadonlyArray<CollapseFailureMode>): "low" | "elevated" | "high" {
  const sources = modes.filter((m) => m.category === "collapse_source");
  if (sources.some((m) => m.riskContribution === "high")) return "high";
  if (sources.some((m) => m.riskContribution === "elevated")) return "elevated";
  return "low";
}

/**
 * confidence = **evidence completeness / trace confidence**（成功確率ではない・riskLevel と別）。
 * unresolved 多 / source_revision_pending があれば high にしない（RC2b-1A #4/#6）。
 */
function confidenceFor(riskCompleteness: CollapseRiskProfileV0["riskCompleteness"]): JudgmentConfidence {
  return riskCompleteness === "complete" ? "high" : riskCompleteness === "partial" ? "moderate" : "low";
}

export function evaluateCollapseRisk(input: EvaluateCollapseRiskInput): CollapseRiskProfileV0 {
  const snapshot = input.graphSnapshot;
  const fj = input.feasibilityJudgment;
  // 整合性 guard（材料が同一 snapshot 由来か）
  if (fj.sourceRefs.snapshotId !== snapshot.snapshotId) {
    throw new Error("evaluateCollapseRisk: feasibilityJudgment と graphSnapshot の snapshotId が食い違う");
  }
  const dgsId = snapshot.sourceRefs.dayGraphSnapshotId;
  const relations = fj.judgmentTrace.timeRelations;

  // ── feasibility reasons / relations を failure mode に再投影（feasibilityStatus は読まない）──
  const modes: CollapseFailureMode[] = [];
  const seen = new Set<string>();
  const relationsFor = (mode: string, targetNodeId: string | null): string[] => {
    const kind = TIME_MODE_TO_RELATION_KIND[mode];
    if (!kind) return [];
    return relations
      .filter((r) => r.relationKind === kind && (targetNodeId === null || r.fromEventRealityNodeId === targetNodeId || r.toEventRealityNodeId === targetNodeId))
      .map((r) => r.relationId);
  };
  const pushFrom = (reason: FeasibilityReason): void => {
    const spec = modeSpecFor(reason.code);
    if (!spec) return;
    const key = `${spec.mode}:${reason.targetNodeId ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    modes.push({
      mode: spec.mode,
      category: spec.category,
      riskContribution: spec.riskContribution,
      targetNodeId: reason.targetNodeId,
      evidenceRefs: reason.evidenceRefs,
      // unresolved/ambiguous は「何が欠けると解消するか」= 元 reason code（+ ambiguity は identity evidence）
      missingInputRefs:
        spec.category === "unresolved"
          ? spec.mode === "exact_time_collision_ambiguous"
            ? [reason.code, "external_identity_evidence_unexposed"]
            : [reason.code]
          : [],
      relationRefs: relationsFor(spec.mode, reason.targetNodeId),
      sourceRefs: { dayGraphSnapshotId: dgsId },
    });
  };
  for (const r of fj.confirmedBlockingReasons) pushFrom(r);
  for (const r of fj.inferredBlockingReasons) pushFrom(r);
  for (const r of fj.unresolvedCriticalInputs) pushFrom(r);
  for (const r of fj.riskFactors) pushFrom(r);

  // source revision pending（identity 完成性の meta pending・day 崩れ source でない → contribution none）
  if (fj.judgmentTrace.sourcesRevisionPending || fj.judgmentTrace.sourceRecordRevisionPending) {
    const key = "source_revision_pending:";
    if (!seen.has(key)) {
      seen.add(key);
      modes.push({
        mode: "source_revision_pending",
        category: "unresolved",
        riskContribution: "none", // 常時 pending・day 崩れ fragility でない → riskLevel を上げない
        targetNodeId: null,
        evidenceRefs: ["sources_revision_pending", "source_record_revision_pending"],
        missingInputRefs: ["sources_revision", "source_record_revision"],
        relationRefs: [],
        sourceRefs: { dayGraphSnapshotId: dgsId },
      });
    }
  }

  // ── riskLevel(known severity) と completeness(別軸) を分離（RC2b-1A #1）──
  const knownSeverity = deriveKnownSeverity(modes);
  const riskRelevantUnresolved = modes.filter((m) => m.riskContribution === "unknown"); // source_revision_pending(none) は除外
  const hasUnresolvedRiskInputs = riskRelevantUnresolved.length > 0;
  const sourcePending = modes.some((m) => m.mode === "source_revision_pending");
  // known severity あれば優先 / known severity 無 + risk-relevant 未解決 → unknown(gauge 不能) / それも無 → low
  const riskLevel: RiskLevel = knownSeverity !== "low" ? knownSeverity : hasUnresolvedRiskInputs ? "unknown" : "low";
  const riskCompleteness: CollapseRiskProfileV0["riskCompleteness"] =
    riskLevel === "unknown" ? "unknown" : hasUnresolvedRiskInputs || sourcePending ? "partial" : "complete";
  const confidence = confidenceFor(riskCompleteness);
  const unresolvedRiskInputRefs = [...new Set(riskRelevantUnresolved.flatMap((m) => [...m.missingInputRefs, ...m.evidenceRefs]))].sort();
  const displayPolicy: CollapseRiskProfileV0["displayPolicy"] = riskLevel === "unknown" ? "notActionable" : "visible";

  const usedInputRefs = [...new Set(modes.flatMap((m) => m.evidenceRefs))].sort();
  const factorRefs = [...new Set(modes.flatMap((m) => [m.mode, ...m.evidenceRefs]))].sort();
  const relationRefs = [...new Set(relations.map((r) => r.relationId))].sort();
  const feasibilityJudgmentId = fj.judgmentTrace.judgmentId;

  const collapseRiskId = `crp:${fnv1a64Hex(
    canonicalSerialize({ s: snapshot.snapshotId, fj: feasibilityJudgmentId, k: "collapse_risk", v: COLLAPSE_RISK_VERSION }),
  )}`;

  const trace: CollapseRiskTrace = {
    schemaVersion: 0,
    collapseRiskId,
    collapseRiskVersion: COLLAPSE_RISK_VERSION,
    graphBaseId: snapshot.graphBaseId,
    snapshotId: snapshot.snapshotId,
    feasibilityJudgmentId,
    usedInputRefs,
    factorRefs,
    missingInputRefs: fj.missingInputRefs, // carry（source trace 不失）
    relationRefs,
    evidenceRefs: ["collapse_risk_profile_v0"],
    evaluatedAtInstant: fj.judgmentTrace.evaluatedAtInstant,
  };

  return {
    schemaVersion: 0,
    riskLevel,
    riskCompleteness,
    hasUnresolvedRiskInputs,
    unresolvedRiskInputRefs,
    failureModes: modes,
    riskFactors: fj.riskFactors, // carry（severity context）
    unresolvedCriticalInputs: fj.unresolvedCriticalInputs, // carry
    missingInputs: fj.missingInputs, // carry
    missingInputRefs: fj.missingInputRefs, // carry
    pairwiseRelationRefs: relationRefs,
    confidence,
    displayPolicy,
    sourceRefs: { dayGraphSnapshotId: dgsId, snapshotId: snapshot.snapshotId, feasibilityJudgmentId },
    evidenceRefs: ["collapse_risk_profile_v0"],
    trace,
  };
}

const RISK_LEVELS: ReadonlySet<string> = new Set(["low", "elevated", "high", "unknown"]);

/** profile の構造健全性検証（空 = 適合）。fixture / 監査が使用 */
export function collapseRiskViolations(p: CollapseRiskProfileV0): string[] {
  const out: string[] = [];
  if (!RISK_LEVELS.has(p.riskLevel)) out.push(`collapse: riskLevel 不正 "${p.riskLevel}"`);
  if (!["complete", "partial", "unknown"].includes(p.riskCompleteness)) out.push(`collapse: riskCompleteness 不正 "${p.riskCompleteness}"`);
  // confidence(= evidence completeness) は complete 以外で high にしない（RC2b-1A #4/#6）
  if (p.confidence === "high" && p.riskCompleteness !== "complete") out.push("collapse: completeness が complete でないのに confidence high");
  // risk-relevant 未解決があるのに low 断定しない（unknown に倒すべき・unknown を severity と混ぜない）
  if (p.riskLevel === "low" && p.hasUnresolvedRiskInputs) out.push("collapse: risk-relevant 未解決があるのに riskLevel low 断定");
  if (!p.trace.collapseRiskId) out.push("collapse: collapseRiskId が空");
  if (!p.trace.feasibilityJudgmentId) out.push("collapse: feasibilityJudgmentId が空");
  if (!p.trace.snapshotId) out.push("collapse: snapshotId が空");
  // feasibilityStatus を混ぜていない（型に存在しない・status コピー禁止）
  if ("feasibilityStatus" in p) out.push("collapse: feasibilityStatus を混ぜている（Feasibility と分離せよ）");
  // high collapse は collapse_source の high 寄与が要る（missing/commitment/permission だけで high にしない）
  if (p.riskLevel === "high" && !p.failureModes.some((m) => m.category === "collapse_source" && m.riskContribution === "high")) {
    out.push("collapse: high なのに collapse_source(high) failure mode が無い（missing/commitment/permission で high 化の疑い）");
  }
  // 全 failure mode に sourceRefs / evidenceRefs（code だけで作文させない）
  for (const m of p.failureModes) {
    if (!m.sourceRefs.dayGraphSnapshotId) out.push(`collapse: mode "${m.mode}" の sourceRefs 欠落`);
    if (m.evidenceRefs.length === 0) out.push(`collapse: mode "${m.mode}" の evidenceRefs 欠落（code だけで作文不可にする）`);
  }
  // missingInputRefs の source trace（carry 健全性）
  for (const r of p.missingInputRefs) {
    if (!r.sourceNodeId || !r.dedupeKey) out.push(`collapse: missingInputRef "${r.code}" の source trace 欠落`);
  }
  return out;
}
