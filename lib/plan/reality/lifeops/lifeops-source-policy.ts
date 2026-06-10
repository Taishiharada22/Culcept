/**
 * 横 R2 — A-4-c25 Life Ops Source Policy（**pure・URL 由来・flag では開けない fixture kill-switch**・barrel 非 export）
 *
 * 設計: docs/life-ops-production-source-safety-a4-c25-mini-design.md（§3）
 *
 * 役割: 環境（supabase URL）から Life Ops の base 候補 source mode を決める。
 *   - `fixture_allowed`: staging allowlist のみ（dev/operator preview・staging mainline dogfood）。
 *   - `real_only`: production deny list・**不明 host・未設定を含む全てのその他**（fail-safe）。
 *     base inputs は空＝fixture の deadline/event/cadence 候補が**構造的に 0**。real channel（feedback 由来）だけが上に乗る。
 *
 * 厳守:
 *   - **env flag を設けない**（「fixture allow flag」は production 誤設定 1 つで嘘候補が出る footgun になるため・
 *     staging は URL allowlist で恒久 fixture_allowed・それ以外は設定では開かない）。
 *   - 将来 production deny（card/writer gate）を解除しても、本 policy は独立に real_only を強制する（多層防御）。
 */

import type { LifeOpsInputs } from "../../../lifeops/candidate-collector";
import { STAGING_PROJECT_REF, PRODUCTION_PROJECT_REF } from "../../shift/devFixtureHost";

export type LifeOpsSourceMode = "fixture_allowed" | "real_only";

/**
 * URL → source mode（staging のみ fixture 可・production/不明/未設定は real_only＝fail-safe）。
 */
export function resolveLifeOpsSourceMode(env: { readonly supabaseUrl: string | undefined }): LifeOpsSourceMode {
  const url = env.supabaseUrl ?? "";
  if (url.includes(PRODUCTION_PROJECT_REF)) return "real_only"; // production: fixture 構造的禁止
  if (url.includes(STAGING_PROJECT_REF)) return "fixture_allowed"; // staging: dogfood 用途で fixture 可
  return "real_only"; // 不明 host/未設定: fixture を出さない（fail-safe）
}

/**
 * mode → mainline model の base inputs。
 *   fixture_allowed → undefined（compute 既定の fixture を使う）／ real_only → **空 inputs**
 *   （deadline/event/cadence/将来 field 含め base 候補 0。real channel の merge はこの上に行われる）。
 */
export function baseLifeOpsInputsForMode(mode: LifeOpsSourceMode): LifeOpsInputs | undefined {
  return mode === "fixture_allowed" ? undefined : {};
}
