/**
 * 横 R2 — A-4-c35 Life Ops Production Stage Gate（**pure・dormant・consumer なし**＝Plan C の具体化のみ・barrel 非 export）
 *
 * 設計: docs/life-ops-production-release-gate-a4-c35-design.md（§2・Release Gate Matrix）
 *
 * 役割: production の段階解禁（P2 read → P3 input+structured write → P4 feedback write）を判定する pure gate。
 *   **本 slice では呼び出し元を作らない**（既存 staging-only gate 群 G1-G9 は不変更）。将来の解禁 slice が
 *   `既存 staging 経路 OR 本 gate` を段階ごとに**別 CEO GO で**配線する。
 *
 * 厳守:
 *   - **production URL ∧ stage flag ∧ userId ∈ allowlist の AND**（どれか欠けたら false）。
 *   - **allowlist 空 = 全 false**（一般開放 P5 は allowlist 条項を外す別 CEO gate の改修＝設定だけでは全開しない）。
 *   - staging では常に false（staging は既存 gate 群の領分・本 gate は production 専用）。
 *   - source safety（real_only 恒久）は本 gate の対象外＝fixture は何段階でも production に出ない。
 */

import { PRODUCTION_PROJECT_REF } from "../../shift/devFixtureHost";

/** 解禁段階（P2/P3/P4 に対応・順序の単調性は運用 checklist が担保）。 */
export type LifeOpsProductionStage = "read_visibility" | "input_ui" | "structured_write" | "feedback_write";

export interface LifeOpsProductionGateEnv {
  /** PLAN_FLAGS.lifeopsProdReadVisibility 等（stage ごと・default OFF）。 */
  readonly stageFlags: Readonly<Record<LifeOpsProductionStage, boolean>>;
  /** `LIFEOPS_PROD_USER_ALLOWLIST`（uuid CSV・server-only・log 不出力）。空/未設定=全 false。 */
  readonly allowlistCsv: string | undefined;
  readonly userId: string | undefined;
  readonly supabaseUrl: string | undefined;
}

/** CSV → uuid 集合（trim・空要素除去・大文字小文字は保存どおり＝Supabase uuid は小文字）。 */
export function parseLifeOpsProdAllowlist(csv: string | undefined): ReadonlySet<string> {
  return new Set(
    (csv ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
  );
}

/**
 * production 段階 gate（**production URL ∧ stage flag ∧ allowlisted user**・どれか欠けたら false）。
 */
export function isLifeOpsProductionStageAllowed(stage: LifeOpsProductionStage, env: LifeOpsProductionGateEnv): boolean {
  const url = env.supabaseUrl ?? "";
  if (!url.includes(PRODUCTION_PROJECT_REF)) return false; // production 専用（staging は既存 gate 群の領分）
  if (env.stageFlags[stage] !== true) return false; // 段階 flag（default OFF）
  const allowlist = parseLifeOpsProdAllowlist(env.allowlistCsv);
  if (allowlist.size === 0) return false; // 空 allowlist=全 false（事故で全開しない）
  return env.userId !== undefined && allowlist.has(env.userId);
}
