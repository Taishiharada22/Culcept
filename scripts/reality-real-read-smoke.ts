#!/usr/bin/env tsx
/**
 * Reality Control OS — Stage 4-B-1C-b 実 read smoke（CEO 手動・単発・dev-only・**staging 限定**）
 *
 * 役割: culcept-staging の認証済み（RLS）user context で external_anchors を **column-restricted**
 *   に 1 回だけ読み、判断 OS を通して **構造的 redacted な RealSmokeReport** を出力する。
 *   ＝「実 Plan データを読んでも raw が漏れない」ことを staging 実データで確認する初回 smoke。
 *
 * 実行（CEO operation・staging のみ・明示 GO flag 必須）:
 *   1. `.env.staging.local` を作り、staging 値を入れる（下記 §必要env）。**本番値を入れない**。
 *   2. REALITY_SMOKE_GO=1 NODE_OPTIONS="--conditions=react-server" \
 *        npx tsx scripts/reality-real-read-smoke.ts [YYYY-MM-DD] [limit]
 *      （日付省略時は today。limit 省略時は 50・コードが ≤50 に clamp）
 *
 * 必要 env（.env.staging.local）:
 *   STAGING_SUPABASE_URL          = https://<staging-ref>.supabase.co
 *   STAGING_SUPABASE_ANON_KEY     = staging の anon public key（service_role 不可）
 *   STAGING_SUPABASE_PROJECT_REF  = <staging-ref>（20 文字小文字英数。URL host と一致必須）
 *   STAGING_CEO_EMAIL             = staging 上の CEO 1 アカウント email
 *   STAGING_CEO_PASSWORD          = 同 password
 *
 * 安全（CEO 固定条件をコード強制）:
 *   - **staging 限定**: URL host から ref を抽出し STAGING_SUPABASE_PROJECT_REF と厳格一致しなければ fatal。
 *     既知の本番 ref（PROD_REF_DENYLIST）に一致したら fatal（誤設定でも本番を読めない）。
 *   - service role 禁止: anon key に "service_role" 検出で fatal。
 *   - user RLS: anon key + email/password sign-in（service role でない）。
 *   - CEO 1 account: sign-in した user の id を requestedUserId=allowedDevUserId に固定。
 *   - production no-op: NODE_ENV=production / 明示 GO 無し で fatal（gate も二重 no-op）。
 *   - 単一日 + limit≤50 / 許可列のみ / PlanSeed 不読 / one-off のみ（recurring=date null 除外）。
 *   - 出力は RealSmokeReport のみ（型で raw 排除）。実 id/title/location/sensitive_category/個別時刻なし。
 *   - read-only（書込/保存/push/PRM/native/Routes/UI なし）。barrel 非 export の dev-runtime* を使用。
 *
 * server-only 解決: NODE_OPTIONS="--conditions=react-server" で no-op 解決して実行する。
 */

import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { createDatedColumnRestrictedAnchorSource, type UserContextClient } from "@/lib/plan/reality/integration/dev-runtime-realsource";
import { runRealReadSmoke } from "@/lib/plan/reality/integration/dev-runtime-smoke";

loadDotenv({ path: ".env.staging.local" });

/** 既知の本番 project ref（誤設定でも本番を読まないための denylist）。 */
const PROD_REF_DENYLIST = ["hjcrvndumgiovyfdacwc"];

function fatal(reason: string): never {
  // eslint-disable-next-line no-console
  console.error(`\n❌ FATAL: ${reason}\n`);
  process.exit(1);
}
function log(msg: string): void {
  // eslint-disable-next-line no-console
  console.log(msg);
}

const GO = process.env.REALITY_SMOKE_GO === "1";
const SB_URL = process.env.STAGING_SUPABASE_URL ?? "";
const SB_ANON = process.env.STAGING_SUPABASE_ANON_KEY ?? "";
const PROJECT_REF = process.env.STAGING_SUPABASE_PROJECT_REF ?? "";
const EMAIL = process.env.STAGING_CEO_EMAIL ?? "";
const PASSWORD = process.env.STAGING_CEO_PASSWORD ?? "";

function todayISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const DATE = process.argv[2] && /^\d{4}-\d{2}-\d{2}$/.test(process.argv[2]) ? process.argv[2] : todayISO();
const LIMIT = process.argv[3] ? Number(process.argv[3]) : 50;

function preflight(): void {
  if (!GO) fatal('明示 GO flag 未設定。`REALITY_SMOKE_GO=1` を付けて実行してください（誤起動防止）。');
  if (process.env.NODE_ENV === "production") fatal("NODE_ENV=production では実行しません（dev-only）。");
  const missing: string[] = [];
  if (!SB_URL) missing.push("STAGING_SUPABASE_URL");
  if (!SB_ANON) missing.push("STAGING_SUPABASE_ANON_KEY");
  if (!PROJECT_REF) missing.push("STAGING_SUPABASE_PROJECT_REF");
  if (!EMAIL) missing.push("STAGING_CEO_EMAIL");
  if (!PASSWORD) missing.push("STAGING_CEO_PASSWORD");
  if (missing.length) fatal(`Missing env（.env.staging.local）: ${missing.join(", ")}`);

  // SECRET GUARD: anon key に service_role 混入なら fatal（no-service-role 強制）
  if (/service_role/i.test(SB_ANON)) fatal('SECRET GUARD: STAGING_SUPABASE_ANON_KEY に "service_role" が含まれます。anon key のみ許可。');

  // project ref shape（typo 防御）
  if (!/^[a-z0-9]{20}$/.test(PROJECT_REF)) {
    fatal(`STAGING_SUPABASE_PROJECT_REF="${PROJECT_REF}" が不正（20 文字小文字英数を期待）。`);
  }
  // 既知本番 ref 拒否
  if (PROD_REF_DENYLIST.includes(PROJECT_REF)) {
    fatal(`PRODUCTION GUARD: STAGING_SUPABASE_PROJECT_REF が既知の本番 ref です。staging のみ許可。`);
  }

  // URL host から ref を抽出し PROJECT_REF と厳格一致（staging 限定）
  let host = "";
  try { host = new URL(SB_URL).host.toLowerCase(); } catch { fatal("STAGING_SUPABASE_URL が不正な URL です。"); }
  const m = host.match(/^([a-z0-9]+)\.supabase\.(co|in)$/);
  if (!m) fatal(`PRODUCTION GUARD: host="${host}" が "<ref>.supabase.co" 形でない。`);
  const ref = m[1]!;
  if (PROD_REF_DENYLIST.includes(ref)) fatal(`PRODUCTION GUARD: URL host が既知の本番 ref（${ref}）。staging のみ許可。`);
  if (ref !== PROJECT_REF) {
    fatal(`PRODUCTION GUARD: URL host ref="${ref}" が STAGING_SUPABASE_PROJECT_REF="${PROJECT_REF}" と不一致。実行拒否。`);
  }

  log(`▶ target = staging host ${host} / date = ${DATE} / limit = ${LIMIT}（≤50 clamp）`);
}

async function main(): Promise<void> {
  preflight();

  // anon key + email/password sign-in → RLS user context（service role でない）
  const supabase = createClient(SB_URL, SB_ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: auth, error: signInError } = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (signInError || !auth.user) fatal(`sign-in 失敗: ${signInError?.message ?? "no user"}`);
  const userId = auth.user.id; // 報告には出さない（CEO 1 account の内部固定にのみ使用）
  log("▶ signed in（RLS user context・service role でない）");

  // column-restricted source（date+limit・許可列のみ・実 client 注入）
  const dataSource = createDatedColumnRestrictedAnchorSource(
    supabase as unknown as UserContextClient,
    { date: DATE, limit: LIMIT }
  );

  // 実 read smoke 実行（gate: dev-only・CEO 1 account・production no-op）
  const report = await runRealReadSmoke({
    gate: {
      nodeEnv: process.env.NODE_ENV ?? "development",
      flagEnabled: GO,
      capability: "dev-only",
      requestedUserId: userId,
      allowedDevUserId: userId,
    },
    dataSource,
    clientContext: "user_rls",
    date: DATE,
    limit: LIMIT,
  });

  await supabase.auth.signOut();

  log("\n================ RealSmokeReport（構造的 redacted・これをそのまま貼ってください）================");
  log(JSON.stringify(report, null, 2));
  log("================================================================================================");
  if (report.status === "ok" && report.rowsRead === 0) {
    log("ℹ rowsRead=0（指定日に one-off anchor が無い）。pipeline は健全。別日付を引数に渡すと信号が濃くなります。");
  }
}

main().catch((e: unknown) => {
  // raw を出さない（メッセージのみ）
  // eslint-disable-next-line no-console
  console.error("unhandled error:", e instanceof Error ? e.message : "unknown");
  process.exit(1);
});
