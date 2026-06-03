#!/usr/bin/env tsx
/**
 * Reality Control OS — Stage 4-B-1C-b 実 read smoke（CEO 手動・単発・dev-only）
 *
 * 役割: 認証済み（RLS）user context で external_anchors を **column-restricted** に 1 回だけ読み、
 *   判断 OS を通して **構造的 redacted な RealSmokeReport** を出力する。
 *   ＝「実 Plan データを読んでも raw が漏れない」ことを実データで確認する初回 smoke。
 *
 * 実行（CEO operation・明示 GO flag 必須）:
 *   REALITY_SMOKE_GO=1 NODE_OPTIONS="--conditions=react-server" \
 *     npx tsx scripts/reality-real-read-smoke.ts [YYYY-MM-DD] [limit]
 *   （日付省略時は today。limit 省略時は 50・コードが ≤50 に clamp）
 *
 * 安全（CEO 固定条件をコード強制）:
 *   - service role 禁止: SHIFT_SMOKE anon key を使用し、文字列 "service_role" 検出で即 fail。
 *   - user RLS: anon key + email/password sign-in（service role でない）。
 *   - CEO 1 account: sign-in した user の id を requestedUserId=allowedDevUserId に固定。
 *   - production no-op: NODE_ENV=production で即 fail（gate も二重 no-op）。
 *   - 単一日 + limit≤50: createDatedColumnRestrictedAnchorSource（date eq + clampSmokeLimit）。
 *   - 許可列のみ / PlanSeed 不読 / one-off のみ（recurring=date null は除外）。
 *   - 出力は RealSmokeReport のみ（型で raw 排除）。書込/保存/push なし（read-only）。
 *   - barrel 非 export の dev-runtime* を使用。route/UI/Server Action 非接続。
 *
 * server-only 解決: dev-runtime* は `import "server-only"` を持つため
 *   NODE_OPTIONS="--conditions=react-server" で no-op 解決して実行する。
 */

import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { createDatedColumnRestrictedAnchorSource, type UserContextClient } from "@/lib/plan/reality/integration/dev-runtime-realsource";
import { runRealReadSmoke } from "@/lib/plan/reality/integration/dev-runtime-smoke";

loadDotenv({ path: ".env.local" });

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
const SB_URL = process.env.SHIFT_SMOKE_SUPABASE_URL ?? "";
const SB_ANON = process.env.SHIFT_SMOKE_SUPABASE_ANON_KEY ?? "";
const EMAIL = process.env.SHIFT_SMOKE_TEST_EMAIL ?? "";
const PASSWORD = process.env.SHIFT_SMOKE_TEST_PASSWORD ?? "";

function todayISO(): string {
  // dev script ゆえ実時刻可（Workflow の制約は非適用）
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
  if (!SB_URL) missing.push("SHIFT_SMOKE_SUPABASE_URL");
  if (!SB_ANON) missing.push("SHIFT_SMOKE_SUPABASE_ANON_KEY");
  if (!EMAIL) missing.push("SHIFT_SMOKE_TEST_EMAIL");
  if (!PASSWORD) missing.push("SHIFT_SMOKE_TEST_PASSWORD");
  if (missing.length) fatal(`Missing env: ${missing.join(", ")}`);
  // SECRET GUARD: anon key に service_role が混入していないか（no-service-role 強制）
  if (/service_role/i.test(SB_ANON)) fatal('SECRET GUARD: SHIFT_SMOKE_SUPABASE_ANON_KEY に "service_role" が含まれます。anon key のみ許可。');
  let host = "";
  try { host = new URL(SB_URL).host; } catch { fatal("SHIFT_SMOKE_SUPABASE_URL が不正な URL です。"); }
  log(`▶ target host = ${host}（公開 URL）/ date = ${DATE} / limit = ${LIMIT}（≤50 に clamp）`);
}

async function main(): Promise<void> {
  preflight();

  // anon key + email/password sign-in → RLS user context（service role でない）
  const supabase = createClient(SB_URL, SB_ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: auth, error: signInError } = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (signInError || !auth.user) fatal(`sign-in 失敗: ${signInError?.message ?? "no user"}`);
  const userId = auth.user.id;
  log(`▶ signed in（RLS user context）userId = ${userId.slice(0, 8)}..`);

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
