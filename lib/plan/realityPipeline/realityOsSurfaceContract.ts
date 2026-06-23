/**
 * Reality OS surface DTO contract（P3-3・凍結契約）
 *
 * UI / API 接続前に「画面へ渡せる形」を安定化するための **redacted surface contract**。
 * realityPipeline adapter 層に置く（realityCore leaf 純度を壊さない）。
 *
 * 契約不変条件（surfaceContractViolations で機械検証）:
 *  - shift は離散 4 値（better/same/worse/unknown）のみ
 *  - confidence は有限 & 0..1
 *  - reasonCodes は controlled prefix のみ（raw 内部参照を漏らさない）
 *  - evidence は件数(evidenceCount)のみ・raw evidence 配列を持たない（redaction）
 *  - 提案実行/通知/DB を示すフィールドを持たない
 *
 * 規律: pure・型 + 検証のみ。runtime composer は realityOsFixturePipeline.ts。
 */

import type {
  RealityPipelineSurfaceV0,
  RealityPipelineScenarioSurfaceV0,
} from "@/lib/plan/realityCore/realityPipelineSurface";

export const REALITY_OS_SURFACE_CONTRACT_VERSION = 0 as const;

/** 凍結 surface 契約（realityPipelineSurface の出力をそのまま安定契約名で再公開） */
export type RealityOsSurfaceV0 = RealityPipelineSurfaceV0;
export type RealityOsScenarioSurfaceV0 = RealityPipelineScenarioSurfaceV0;

const SHIFTS = new Set(["better", "same", "worse", "unknown"]);
const CONTROLLED_REASON_PREFIXES = [
  "feasibility_shift:",
  "overrun_shift:",
  "collapse_shift:",
  "current_incomplete",
  "contains_unknown_shift",
  "proposal:",
  "proposal_basis:",
  "proposal_unresolved",
];
/** surface に出てはいけない（提案実行/通知/DB/raw）キー */
const FORBIDDEN_KEYS = ["execute", "notify", "send", "persist", "save", "dbId", "mutation", "evidence", "rawEvidence", "evidenceRefs"];

function isControlled(code: string): boolean {
  return CONTROLLED_REASON_PREFIXES.some((p) => code === p || code.startsWith(p));
}

/** 契約違反を列挙（空 = 適合）。throw しない（test / audit 両用）。 */
export function surfaceContractViolations(surface: RealityOsSurfaceV0): string[] {
  const out: string[] = [];
  if (typeof surface.honestUnknown !== "boolean") out.push("honestUnknown must be boolean");
  surface.reasonCodes.forEach((c) => {
    if (!isControlled(c)) out.push(`result reasonCode not controlled: ${c}`);
  });
  surface.scenarios.forEach((s, i) => {
    for (const f of [s.feasibilityShift, s.overrunRiskShift, s.collapseRiskShift]) {
      if (!SHIFTS.has(f)) out.push(`scenario[${i}] invalid shift: ${f}`);
    }
    if (!Number.isFinite(s.confidence) || s.confidence < 0 || s.confidence > 1) {
      out.push(`scenario[${i}] confidence out of range: ${s.confidence}`);
    }
    if (!Number.isInteger(s.evidenceCount) || s.evidenceCount < 0) {
      out.push(`scenario[${i}] evidenceCount invalid: ${s.evidenceCount}`);
    }
    s.reasonCodes.forEach((c) => {
      if (!isControlled(c)) out.push(`scenario[${i}] reasonCode not controlled: ${c}`);
    });
    for (const k of Object.keys(s)) {
      if (FORBIDDEN_KEYS.includes(k)) out.push(`scenario[${i}] forbidden key: ${k}`);
    }
    if (s.minimalProgressText !== null && typeof s.minimalProgressText !== "string") {
      out.push(`scenario[${i}] minimalProgressText must be string|null`);
    }
  });
  return out;
}
