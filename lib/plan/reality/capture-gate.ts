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
  /** PLAN_FLAGS.canaryUserIds（共有 allowlist・空なら誰も許可しない＝fail-closed・staging で reality 専用 list が空のときの fallback）。 */
  readonly canaryUserIds: readonly string[];
  /**
   * A1-5-13: production canary 専用 enable flag（PLAN_FLAGS.realityCaptureProductionCanary）。
   *   **未指定/false（既定）→ production ref は block**（staging-only 維持）。true ∧ production ref ∧ reality canary 該当 のみ production allow。
   */
  readonly productionCanaryEnabled?: boolean;
  /**
   * A1-5-13: reality 専用 canary allowlist（PLAN_FLAGS.realityCanaryUserIds・REALITY_CAPTURE_CANARY_USER_IDS）。
   *   PLAN_CANARY_USER_IDS（共有）から分離。**非空なら staging/production とも本 list を優先**（依存を減らす）。
   *   **production lane は本 list 必須**（shared list へ fallback しない）。未指定/空（既定）→ staging は canaryUserIds へ fallback。
   */
  readonly realityCanaryUserIds?: readonly string[];
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
 * A1-5-5a/A1-5-13: capture live gate（**pure・fail-closed**・production canary scaffold）。全条件を満たす時のみ `allow:true`。
 *   kill/flag/ref を先に評価し、その後 **2 lane** に分岐:
 *     - **PRODUCTION CANARY lane**（A1-5-13・**明示・多重・default-off**）: `productionCanaryEnabled` ∧ production ref（aljav）のとき。
 *       reality 専用 canary list 必須（shared へ fallback しない）。env 未設定→`productionCanaryEnabled` false→この lane に入らず default lane（＝既存 staging-only 挙動）へ。
 *     - **DEFAULT/STAGING lane**: 既存挙動を **EXACTLY 維持**（nodeEnv=production block / aljav block / hjcr allowlist / canary）。
 *   canary 優先: reality 専用 list（realityCanaryUserIds）非空→それを使用、空→staging のみ canaryUserIds(PLAN_CANARY_USER_IDS) へ fallback（依存を減らす）。
 *   **production 挙動変更 0**: productionCanaryEnabled 未指定/false（既定）では production ref は必ず block（PRODUCTION_PROJECT_REF）。
 *   注: lane 分岐に ref が要るため ref 抽出を nodeEnv より先に評価（未解決はどちらの lane でも block・fail-closed 不変）。
 */
export function evaluateCaptureGate(input: CaptureGateInput): CaptureGateVerdict {
  // 1. kill switch（最優先・live flag を無視して停止）
  if (input.killed) return { allow: false, reason: "KILLED" };
  // 2. flag off（default false）
  if (!input.liveEnabled) return { allow: false, reason: "FLAG_OFF" };
  // 3. project ref 抽出（未解決→fail-closed・lane 分岐前）
  const ref = refFromSupabaseUrl(input.supabaseUrl);
  if (ref === null) return { allow: false, reason: "UNRESOLVED_PROJECT_REF" };

  const isProductionRef = CAPTURE_PROD_REF_DENYLIST.includes(ref);
  const productionCanaryEnabled = input.productionCanaryEnabled ?? false;
  const realityCanary = input.realityCanaryUserIds ?? [];

  // ── PRODUCTION CANARY lane（A1-5-13・明示・多重・default-off）──
  //   productionCanaryEnabled ∧ production ref のときのみ。reality 専用 canary list 必須（shared へ fallback しない）。
  //   env 未設定→productionCanaryEnabled false→この lane に入らず default lane（＝既存 staging-only 挙動）へ。
  if (productionCanaryEnabled && isProductionRef) {
    if (!input.requestedUserId) return { allow: false, reason: "NO_USER" };
    if (realityCanary.length === 0) return { allow: false, reason: "NO_CANARY_ALLOWLIST" };
    if (!realityCanary.includes(input.requestedUserId)) return { allow: false, reason: "USER_NOT_CANARY" };
    return { allow: true }; // production canary 許可（明示 env が全て揃った場合のみ）
  }

  // ── DEFAULT/STAGING lane（既存挙動を EXACTLY 維持）──
  // production nodeEnv hard block
  if (input.nodeEnv === "production") return { allow: false, reason: "PRODUCTION_NODE_ENV" };
  // production project hard block（aljav・productionCanaryEnabled でない限りここで block＝既存挙動）
  if (isProductionRef) return { allow: false, reason: "PRODUCTION_PROJECT_REF" };
  // staging allowlist（hjcr のみ・新規本番 ref が未 denylist でも staging 以外は拒否）
  if (!CAPTURE_STAGING_REF_ALLOWLIST.includes(ref)) return { allow: false, reason: "NON_STAGING_PROJECT_REF" };
  // requested user
  if (!input.requestedUserId) return { allow: false, reason: "NO_USER" };
  // canary: reality 専用 list を優先・空なら shared(PLAN_CANARY_USER_IDS) へ fallback（staging backward-compat・依存を減らす）
  const canary = realityCanary.length > 0 ? realityCanary : input.canaryUserIds;
  if (canary.length === 0) return { allow: false, reason: "NO_CANARY_ALLOWLIST" };
  if (!canary.includes(input.requestedUserId)) return { allow: false, reason: "USER_NOT_CANARY" };
  return { allow: true };
}
