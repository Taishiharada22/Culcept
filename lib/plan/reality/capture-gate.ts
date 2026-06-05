/**
 * Reality Control OS — A1-5-5a Capture Live Gate（pure・no-run・fail-closed・barrel 非 export）
 *
 * 設計: docs/aneurasync-reality-control-os-connection-design.md §8.25/§8.26
 *
 * 役割: structured capture（seed write）を runtime 接続する **前**の安全 primitive。
 *   以降の全 capture slice（A1-5-5b+）が必ず通る gate。**production 誤 write / staging 外 / canary 外 /
 *   常時 capture / kill switch 無視** を構造的に封じる。`evaluateSmokeGate`（dev-runtime）と同型の多層 fail-closed。
 *
 * 厳守:
 *   - **pure**: 入力は全て注入（process.env を内部で読まない・Supabase client を持たない）。env 解決は呼び出し側（A1-5-5c resolver・別 GO）。
 *   - canonical refs は **`devFixtureHost`（A1-5-ref-fix 単一ソース）** から import（executable code に ref literal を持たない＝drift 防止）。
 *   - **kill switch 最優先**（live flag より先に block）。
 *   - **全段 fail-closed**: 未解決 ref / 空 canary / 空 user / flag off / 曖昧 → block。
 *   - DB / Supabase / runtime / route / UI なし。server-only 不要（pure）。barrel 非 export。
 */

import { STAGING_PROJECT_REF, PRODUCTION_PROJECT_REF } from "../shift/devFixtureHost";

/** 許可 staging ref（capture は staging のみ・canonical 参照）。 */
export const CAPTURE_STAGING_REF_ALLOWLIST: readonly string[] = [STAGING_PROJECT_REF];
/** 拒否 production ref（capture を絶対に向けない・canonical 参照）。 */
export const CAPTURE_PROD_REF_DENYLIST: readonly string[] = [PRODUCTION_PROJECT_REF];

/** gate の入力（全て呼び出し側が注入・pure）。 */
export interface CaptureGateInput {
  /** PLAN_FLAGS.realityCaptureLive（REALITY_CAPTURE_LIVE === "true"）。 */
  readonly liveEnabled: boolean;
  /** PLAN_FLAGS.realityCaptureKill（REALITY_CAPTURE_KILL === "true"）。live flag より優先。 */
  readonly killed: boolean;
  /** process.env.NODE_ENV（production hard block 用・呼び出し側が渡す）。 */
  readonly nodeEnv: string;
  /** NEXT_PUBLIC_SUPABASE_URL（host から project ref を抽出する元・Supabase client ではない）。 */
  readonly supabaseUrl: string | undefined;
  /** capture 対象 user。 */
  readonly requestedUserId: string;
  /** PLAN_FLAGS.canaryUserIds（許可 user allowlist・空なら誰も許可しない＝fail-closed）。 */
  readonly canaryUserIds: readonly string[];
}

/** block 理由コード（observability・raw を含まない）。 */
export type CaptureGateBlockReason =
  | "KILLED" // kill switch（最優先）
  | "FLAG_OFF" // realityCaptureLive=false（default）
  | "PRODUCTION_NODE_ENV" // NODE_ENV=production
  | "UNRESOLVED_PROJECT_REF" // supabaseUrl 未設定/不正/非 supabase host（曖昧→fail-closed）
  | "PRODUCTION_PROJECT_REF" // host ref が production（aljav）
  | "NON_STAGING_PROJECT_REF" // host ref が staging（hjcr）以外
  | "NO_USER" // requestedUserId 空
  | "NO_CANARY_ALLOWLIST" // canary 空（誰も許可しない→fail-closed）
  | "USER_NOT_CANARY"; // canary allowlist 非該当

export type CaptureGateVerdict =
  | { readonly allow: true }
  | { readonly allow: false; readonly reason: CaptureGateBlockReason };

/**
 * Supabase URL の host から project ref（20 文字小文字英数）を抽出。
 *   `https://<ref>.supabase.co|in` のみ受理。未設定/不正/非 supabase host は **null**（→ 呼び出し側で fail-closed block）。
 *   pure（`new URL` は Web 標準・Supabase client ではない）。
 */
export function refFromSupabaseUrl(url: string | undefined): string | null {
  if (typeof url !== "string" || url.length === 0) return null;
  let host: string;
  try {
    host = new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
  const m = host.match(/^([a-z0-9]{20})\.supabase\.(co|in)$/);
  return m ? m[1]! : null;
}

/**
 * A1-5-5a: capture live gate（**pure・fail-closed**）。全条件を満たす時のみ `allow:true`。
 *   判定順（fail-closed・最も致命的を先に）:
 *     1. killed（kill switch・**live flag より優先**）
 *     2. !liveEnabled（flag off・default）
 *     3. nodeEnv=production（production hard block）
 *     4. project ref 未解決（曖昧→fail-closed）
 *     5. project ref が production（aljav・denylist）
 *     6. project ref が staging（hjcr）以外（allowlist 非該当）
 *     7. requestedUserId 空
 *     8. canary allowlist 空（fail-closed）
 *     9. canary allowlist 非該当
 */
export function evaluateCaptureGate(input: CaptureGateInput): CaptureGateVerdict {
  // 1. kill switch（最優先・live flag を無視して停止）
  if (input.killed) return { allow: false, reason: "KILLED" };
  // 2. flag off（default false）
  if (!input.liveEnabled) return { allow: false, reason: "FLAG_OFF" };
  // 3. production nodeEnv hard block
  if (input.nodeEnv === "production") return { allow: false, reason: "PRODUCTION_NODE_ENV" };
  // 4. project ref 抽出（未解決→fail-closed）
  const ref = refFromSupabaseUrl(input.supabaseUrl);
  if (ref === null) return { allow: false, reason: "UNRESOLVED_PROJECT_REF" };
  // 5. production project hard block（aljav）
  if (CAPTURE_PROD_REF_DENYLIST.includes(ref)) return { allow: false, reason: "PRODUCTION_PROJECT_REF" };
  // 6. staging allowlist（hjcr のみ・新規本番 ref が未 denylist でも staging 以外は拒否）
  if (!CAPTURE_STAGING_REF_ALLOWLIST.includes(ref)) return { allow: false, reason: "NON_STAGING_PROJECT_REF" };
  // 7. requested user
  if (!input.requestedUserId) return { allow: false, reason: "NO_USER" };
  // 8. canary allowlist 空（誰も許可しない→fail-closed）
  if (input.canaryUserIds.length === 0) return { allow: false, reason: "NO_CANARY_ALLOWLIST" };
  // 9. canary allowlist 非該当
  if (!input.canaryUserIds.includes(input.requestedUserId)) return { allow: false, reason: "USER_NOT_CANARY" };
  return { allow: true };
}
