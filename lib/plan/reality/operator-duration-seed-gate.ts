/**
 * operator-duration-seed-gate — RD3c-P3a-wire-C（2026-06-16）: operator duration seed write の **gate**（pure・fail-closed・barrel 非 export）
 *
 * 設計: docs/reality-operator-seed-wiring-rd3-c-p3a-wire-0.md §2/§3
 *
 * 思想（capture-gate 同型・JWT claim を使わない pure allowlist gate）:
 *   operator だけが dogfood/staging で seed write orchestration を呼べることを **server-side で決める**。
 *   client から isOperator / environment / provenance を **受け取らない**（本 gate が server inputs から resolve）。
 *
 * 不変条件（triple fail-closed）:
 *   - flag OFF → deny。production nodeEnv → deny。production ref(aljav) → deny。
 *   - operator allowlist 空 → deny。非 allowlist user → deny。
 *   - allow 時のみ environment を resolve（staging ref(hjcr)→staging・他の非 production→dogfood）。
 *   - DB / Supabase / network / Date.now なし（pure）。server-only 不要（pure）。barrel 非 export。
 */
import { refFromSupabaseUrl, CAPTURE_PROD_REF_DENYLIST, CAPTURE_STAGING_REF_ALLOWLIST } from "./capture-gate";

export type OperatorDurationSeedEnvironment = "dogfood" | "staging";

export interface OperatorDurationSeedGateInput {
  /** PLAN_FLAGS.realityOperatorSeedWriteEnabled（default false）。 */
  readonly flagEnabled: boolean;
  /** process.env.NODE_ENV 相当。 */
  readonly nodeEnv: string | undefined;
  /** NEXT_PUBLIC_SUPABASE_URL ?? SUPABASE_URL。ref 抽出で production/staging を判定。 */
  readonly supabaseUrl: string | undefined;
  /** PLAN_FLAGS.realityOperatorSeedUserIds（空=fail-closed）。 */
  readonly operatorAllowlist: ReadonlyArray<string>;
  /** server が auth.getUser() で確定した auth.uid()（**client から受けない**）。 */
  readonly requestedUserId: string | null;
}

export type OperatorDurationSeedGateBlockReason =
  | "FLAG_OFF"
  | "PRODUCTION_NODE_ENV"
  | "PRODUCTION_PROJECT_REF"
  | "NO_OPERATOR_ALLOWLIST"
  | "NO_USER"
  | "USER_NOT_OPERATOR";

export type OperatorDurationSeedGateVerdict =
  | { readonly allow: true; readonly environment: OperatorDurationSeedEnvironment }
  | { readonly allow: false; readonly reason: OperatorDurationSeedGateBlockReason };

/**
 * evaluateOperatorDurationSeedGate — pure・fail-closed。全条件を満たす時のみ `allow:true` + resolved environment。
 *   evaluation 順（fail-closed）: flag → production nodeEnv → production ref → allowlist 空 → user 不在 → 非 allowlist。
 */
export function evaluateOperatorDurationSeedGate(input: OperatorDurationSeedGateInput): OperatorDurationSeedGateVerdict {
  // 1. flag OFF（default）→ deny
  if (!input.flagEnabled) return { allow: false, reason: "FLAG_OFF" };
  // 2. production nodeEnv hard block
  if (input.nodeEnv === "production") return { allow: false, reason: "PRODUCTION_NODE_ENV" };
  // 3. production project ref hard block（aljav・nodeEnv に依らず）
  const ref = refFromSupabaseUrl(input.supabaseUrl);
  if (ref !== null && CAPTURE_PROD_REF_DENYLIST.includes(ref)) return { allow: false, reason: "PRODUCTION_PROJECT_REF" };
  // 4. operator allowlist 空 → deny（fail-closed）
  if (input.operatorAllowlist.length === 0) return { allow: false, reason: "NO_OPERATOR_ALLOWLIST" };
  // 5. user 不在 → deny
  if (!input.requestedUserId) return { allow: false, reason: "NO_USER" };
  // 6. 非 allowlist user → deny
  if (!input.operatorAllowlist.includes(input.requestedUserId)) return { allow: false, reason: "USER_NOT_OPERATOR" };
  // allow: environment を server-side で resolve（staging ref → staging・他の非 production → dogfood）
  const environment: OperatorDurationSeedEnvironment =
    ref !== null && CAPTURE_STAGING_REF_ALLOWLIST.includes(ref) ? "staging" : "dogfood";
  return { allow: true, environment };
}
