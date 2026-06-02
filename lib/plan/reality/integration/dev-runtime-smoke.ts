import "server-only";
/**
 * Reality Control OS — Stage 4-B-1C-b Real Read Smoke Orchestration + Fixed Redacted Report
 *   （CEO 条件付き GO・2026-06-03・**createClient なし・実行は CEO の認証文脈の手動 smoke**）
 *
 * 設計: docs/aneurasync-reality-control-os-stage4b1b-real-read-smoke-protocol.md §7.3
 *
 * 役割: 実 read smoke の **orchestration ＋ 出力を構造的に redacted へ固定**する。
 *   GPT 監査の出力制約（rowsRead count / 分布 / redaction pass-fail のみ・raw 厳禁）を **型で強制**。
 *   → CEO の手動実行が raw を出すこと自体を構造的に不可能にする。
 *
 * 厳守:
 *   - **createClient / 実 Supabase client を import しない**（dataSource は注入。実 client は CEO の harness が用意）。
 *   - **service_role を拒否**（実行時にも no-service-role を強制。GPT 点1）。
 *   - 戻り値 `RealSmokeReport` は **counts/enum/boolean のみ**（実 id / title / location / sensitive_category /
 *     個別時刻 / raw row を型に持たない）。`assertRedacted` を必ず通す。
 *   - console / file / DB save / push / PRM / native / Routes なし。barrel 非 export。route/UI から呼ばない。
 *   - 本 module は実 read を *実行しない*（dataSource が mock なら mock、実 client なら CEO 手動時のみ）。
 */

import { evaluateSmokeGate, type SmokeGate, type SmokeNoopCode, type RealityDataSource } from "./dev-runtime";
import { clampSmokeLimit } from "./dev-runtime-realsource";
import { runShadow } from "./shadow-runner";
import { assertRedacted } from "./redaction-guard";
import { aggregateShadowReport, type DevReportRedacted } from "./dev-report";
import type { BestActionCandidate } from "../best-action";
import type { ReceptivityInput } from "../receptivity-gate";

/** client 種別。service_role は拒否し user_rls（CEO 本人 RLS 文脈）のみ許可。 */
export type ClientContext = "user_rls" | "service_role";

export interface RealSmokeDeps {
  readonly gate: SmokeGate;
  readonly dataSource: RealityDataSource;
  /** CEO 本人の RLS 文脈か。service_role は拒否（no-op）。 */
  readonly clientContext: ClientContext;
  /** 報告 echo（個別時刻でなく「指定日」1 日）。 */
  readonly date: string;
  /** 報告 echo（件数上限）。 */
  readonly limit: number;
  readonly candidates?: readonly BestActionCandidate[];
  readonly receptivity?: ReceptivityInput;
}

/**
 * 実 read smoke の **唯一許可される戻り値**（構造的 redacted）。
 * raw id / title / location / sensitive_category / 個別時刻 / raw row を **型に持たない**。
 */
export interface RealSmokeReport {
  readonly status: "ok" | "noop" | "blocked";
  readonly code?: SmokeNoopCode | "SERVICE_ROLE_REFUSED" | "REDACTION_BLOCKED";
  /** 読んだ行数（count のみ） */
  readonly rowsRead: number;
  /** query 設定 echo（指定日 1 日。個別時刻ではない） */
  readonly date: string;
  /** query 設定 echo（件数上限） */
  readonly limit: number;
  /** one-off のみ（recurring 未含有）固定 */
  readonly recurringIncluded: false;
  /** service role 未使用の確認 */
  readonly serviceRoleUsed: boolean;
  /** assertRedacted 結果（summary ∧ report 両方 clean） */
  readonly redactionPass: boolean;
  /** counts/distributions のみ */
  readonly report: DevReportRedacted;
}

const EMPTY_REPORT: DevReportRedacted = aggregateShadowReport([]);

function baseReport(date: string, limit: number): Omit<RealSmokeReport, "status"> {
  return { rowsRead: 0, date, limit, recurringIncluded: false, serviceRoleUsed: false, redactionPass: true, report: EMPTY_REPORT };
}

/**
 * 実 read smoke。gate（+service_role 拒否）→ load 1 回 → rowsRead count → runShadow →
 * assertRedacted（summary ∧ aggregate）→ 構造的 redacted な RealSmokeReport。
 * **実 client は注入**（本 module は createClient しない）。失敗は全て fail-closed。
 */
export async function runRealReadSmoke(deps: RealSmokeDeps): Promise<RealSmokeReport> {
  // 報告 echo も実効 limit（clamp 後・>50 を読まない）に揃える
  const effectiveLimit = clampSmokeLimit(deps.limit);
  const base = baseReport(deps.date, effectiveLimit);

  // 実行時にも no-service-role を強制（GPT 点1）
  if (deps.clientContext === "service_role") return { ...base, status: "noop", code: "SERVICE_ROLE_REFUSED" };

  const gate = evaluateSmokeGate(deps.gate);
  if (!gate.pass) return { ...base, status: "noop", code: gate.code };

  let input: Awaited<ReturnType<RealityDataSource["loadForSmoke"]>>;
  try {
    input = await deps.dataSource.loadForSmoke(deps.gate.requestedUserId);
  } catch {
    return { ...base, status: "noop", code: "ADAPTER_DEGRADED" }; // raw/stack を含めない
  }
  if (!input) return { ...base, status: "noop", code: "NO_INPUT" };

  // 二重防御: seeds 強制空
  const safeInput = { ...input, seedTraces: [] };
  const rowsRead = Object.keys(safeInput.anchors).length; // count のみ（id は出さない）

  let summary;
  try {
    summary = runShadow({ input: safeInput, candidates: deps.candidates ?? [], receptivity: deps.receptivity, intervened: false, conditionPresent: false });
  } catch {
    return { ...base, status: "noop", code: "KERNEL_ERROR", rowsRead };
  }

  // producer 自己表明: summary ∧ aggregate の両方が allowlist-clean のときのみ返す
  const report = aggregateShadowReport([summary]);
  const redactionPass = assertRedacted(summary).clean && assertRedacted(report).clean;
  if (!redactionPass) {
    return { ...base, status: "blocked", code: "REDACTION_BLOCKED", rowsRead, redactionPass: false };
  }

  return { status: "ok", rowsRead, date: deps.date, limit: effectiveLimit, recurringIncluded: false, serviceRoleUsed: false, redactionPass: true, report };
}
