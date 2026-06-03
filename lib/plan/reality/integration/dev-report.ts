/**
 * Reality Control OS — Dev Report (redacted) skeleton（Stage 3 / 設計のみ + 集約純関数）
 *
 * 設計: docs/aneurasync-reality-control-os-connection-design.md §2-c（dev-only report）
 *
 * ShadowSummary[] を **redacted な集約オブジェクト** にする純関数。
 * counts / enum distribution のみ。**ref すら持たない**（report-local ephemeral ref も集約には不要）。
 *
 * 厳守（GPT 監査）— Stage 3 は設計/型/集約関数まで:
 *   - 画面表示 / console.log / file 出力 / DB 保存 / route 接続 / runtime 呼出 / 実データ読取 なし。
 *   - raw title / location / user text / 第三者名 / raw source signal / 永続 id / anchor id /
 *     source id / location id を一切持たない（型に存在しない）。
 */

import type { EngineMode, InvariantId } from "../invariant-check";
import type { GateKind } from "../best-action";
import type { DeliveryMode } from "../receptivity-gate";
import type { ShadowSummary, RiskLevel } from "./shadow-runner";

const MODES: readonly EngineMode[] = ["build", "complete", "repair", "optimize", "none"];
const GATES: readonly GateKind[] = ["safety", "permission", "traceability", "reversibility", "whole_part", "recovery_core"];
const RISKS: readonly RiskLevel[] = ["none", "low", "medium", "high"];
const DELIVERY: readonly (DeliveryMode | "none")[] = ["silent", "on_open", "push", "urgent_push", "permission_prompt", "none"];

export interface DevReportRedacted {
  readonly runs: number;
  readonly totalCandidates: number;
  readonly totalRejected: number;
  /** best が出なかった run 数（全 reject / ユーザー選択待ち） */
  readonly noBestRuns: number;
  readonly modeDistribution: Readonly<Record<EngineMode, number>>;
  readonly deliveryDistribution: Readonly<Record<DeliveryMode | "none", number>>;
  /** 各 gate が reject 候補で失敗した延べ回数 */
  readonly gateFailureCounts: Readonly<Record<GateKind, number>>;
  /** 各 invariant が best 文脈で違反した延べ回数（理想は全 0） */
  readonly invariantViolationCounts: Readonly<Record<InvariantId, number>>;
  readonly riskDistribution: Readonly<Record<RiskLevel, number>>;
}

function zero<K extends string>(keys: readonly K[]): Record<K, number> {
  const o = {} as Record<K, number>;
  for (const k of keys) o[k] = 0;
  return o;
}

/** ShadowSummary[] を redacted 集約に（純関数・ref/raw 一切なし）。 */
export function aggregateShadowReport(summaries: readonly ShadowSummary[]): DevReportRedacted {
  const modeDistribution = zero(MODES);
  const deliveryDistribution = zero(DELIVERY);
  const gateFailureCounts = zero(GATES);
  const invariantViolationCounts: Record<InvariantId, number> = {} as Record<InvariantId, number>;
  const riskDistribution = zero(RISKS);

  let totalCandidates = 0;
  let totalRejected = 0;
  let noBestRuns = 0;

  for (const s of summaries) {
    modeDistribution[s.mode] += 1;
    deliveryDistribution[s.deliveryMode ?? "none"] += 1;
    riskDistribution[s.risk] += 1;
    totalCandidates += s.candidateCount;
    totalRejected += s.rejected.length;
    if (s.bestRef === null) noBestRuns += 1;
    for (const r of s.rejected) {
      for (const g of r.gates) gateFailureCounts[g] += 1;
    }
    for (const v of s.invariantViolations) {
      invariantViolationCounts[v] = (invariantViolationCounts[v] ?? 0) + 1;
    }
  }

  return {
    runs: summaries.length,
    totalCandidates,
    totalRejected,
    noBestRuns,
    modeDistribution,
    deliveryDistribution,
    gateFailureCounts,
    invariantViolationCounts,
    riskDistribution,
  };
}

/** 集約の 1 行サマリ（counts/enum のみ・raw なし）。 */
export function devReportLine(r: DevReportRedacted): string {
  const totalViolations = Object.values(r.invariantViolationCounts).reduce((a, b) => a + b, 0);
  return (
    `runs=${r.runs} candidates=${r.totalCandidates} rejected=${r.totalRejected} ` +
    `noBest=${r.noBestRuns} violations=${totalViolations} ` +
    `risk[high=${r.riskDistribution.high},med=${r.riskDistribution.medium}]`
  );
}
