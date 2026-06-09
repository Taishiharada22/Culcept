#!/usr/bin/env tsx
/**
 * Reality Control OS — Live Reader Step 2: Memory-only Staging Shadow（CEO 承認・**staging 限定・read-only・write 0**）
 *
 * 役割: culcept-staging の RLS user context で **実 M1/M3 を read** し、`assembleMemoryItems` → `synthesizeMemory` →
 *   `fakeWorldState` → `runRealityPipeline` を通して **redacted envelope を観測**する。
 *   ＝「実 PRM データを読んでも raw が漏れず、記憶が pipeline を破綻なく通る」ことの初回 shadow。**書き込み 0・apply 0**。
 *
 * 実行（CEO operation・staging のみ・GO 必須）:
 *   REALITY_MEMORY_SHADOW_GO=1 NODE_OPTIONS="--conditions=react-server" \
 *     npx tsx scripts/reality-memory-shadow.ts
 *
 * env（.env.local・staging 値）: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY /
 *   STAGING_SUPABASE_PROJECT_REF / STAGING_USER_A_EMAIL / STAGING_USER_A_PASSWORD
 *
 * 安全（CEO 固定条件をコード強制）:
 *   - **staging 限定**: URL host ref===STAGING_PROJECT_REF・本番 ref(denylist) 一致で fatal。
 *   - service_role 禁止（anon key に "service_role" 検出で fatal）。NODE_ENV=production / GO 無しで fatal。
 *   - user-RLS（anon + sign-in）・**read だけ**（reader は select/eq/is/order/limit のみ）・**write/insert/update/delete/apply 0**。
 *   - 読むのは **M1 readEventRows / M3 readSecondSelfTendencies のみ**（M2 deferred）・WorldState は fakeWorldState。
 *   - 出力は **redacted summary**（counts + envelope 要約・raw/PII を出さない）。redaction 違反 / 高リスク allowed / write 検出で exit 1。
 */

import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { STAGING_PROJECT_REF, PRODUCTION_PROJECT_REF } from "@/lib/plan/shift/devFixtureHost";
import { createSupabaseMemorySourcePorts } from "@/lib/plan/reality/assembly/supabase-memory-source-ports";
import { assembleMemoryItems } from "@/lib/plan/reality/assembly/memory-assembler";
import { synthesizeMemory } from "@/lib/plan/reality/learning/memory-synthesis";
import { fakeWorldState } from "@/lib/plan/reality/assembly/fixture-assembler";
import { runRealityPipeline } from "@/lib/plan/reality/orchestration/reality-pipeline";

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
function ok(cond: boolean, label: string): boolean {
  log(`${cond ? "✅" : "❌"} ${label}`);
  return cond;
}

const GO = process.env.REALITY_MEMORY_SHADOW_GO === "1";
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SB_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const PROJECT_REF = process.env.STAGING_SUPABASE_PROJECT_REF ?? "";
const EMAIL = process.env.STAGING_USER_A_EMAIL ?? "";
const PASSWORD = process.env.STAGING_USER_A_PASSWORD ?? "";
const PROD_DENY = [PRODUCTION_PROJECT_REF];
const STAGING_ALLOW = [STAGING_PROJECT_REF];
const FORBIDDEN = /seed_?ref|utterance|personality|怠惰|だらしな|無責任|@[a-z]|\b\d{10,}\b/i;

function preflight(): void {
  if (!GO) fatal("明示 GO 未設定。`REALITY_MEMORY_SHADOW_GO=1` を付けて実行してください。");
  if (process.env.NODE_ENV === "production") fatal("NODE_ENV=production では実行しません。");
  const missing = [
    ["NEXT_PUBLIC_SUPABASE_URL", SB_URL], ["NEXT_PUBLIC_SUPABASE_ANON_KEY", SB_ANON],
    ["STAGING_SUPABASE_PROJECT_REF", PROJECT_REF], ["STAGING_USER_A_EMAIL", EMAIL], ["STAGING_USER_A_PASSWORD", PASSWORD],
  ].filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) fatal(`Missing env: ${missing.join(", ")}`);
  if (/service_role/i.test(SB_ANON)) fatal('SECRET GUARD: anon key に "service_role" 混入。');
  if (!/^[a-z0-9]{20}$/.test(PROJECT_REF)) fatal(`PROJECT_REF 不正: ${PROJECT_REF}`);
  if (PROD_DENY.includes(PROJECT_REF)) fatal("PRODUCTION GUARD: project ref が本番。");
  if (!STAGING_ALLOW.includes(PROJECT_REF)) fatal(`STAGING GUARD: project ref が許可 staging(${STAGING_PROJECT_REF})でない。`);
  let host = "";
  try { host = new URL(SB_URL).host.toLowerCase(); } catch { fatal("URL 不正。"); }
  const m = host.match(/^([a-z0-9]+)\.supabase\.(co|in)$/);
  if (!m) fatal(`host="${host}" が <ref>.supabase.co 形でない。`);
  const ref = m[1]!;
  if (PROD_DENY.includes(ref)) fatal(`PRODUCTION GUARD: URL host が本番 ref(${ref})。`);
  if (!STAGING_ALLOW.includes(ref)) fatal(`STAGING GUARD: URL host ref(${ref})が許可 staging でない。`);
  if (ref !== PROJECT_REF) fatal(`URL host ref="${ref}" ≠ PROJECT_REF="${PROJECT_REF}"。`);
  log(`▶ target = staging host ${host}（memory-only shadow・read-only）`);
}

async function main(): Promise<void> {
  preflight();
  const sb = createClient(SB_URL, SB_ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: auth, error: signInErr } = await sb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (signInErr || !auth.user) fatal(`sign-in 失敗: ${signInErr?.message ?? "no user"}`);
  const userId = auth.user.id;
  log(`▶ signed in（RLS user context・id 末尾4=…${userId.slice(-4)}）`);

  // ── 実 M1/M3 read（owner-RLS・read-only）──
  const ports = createSupabaseMemorySourcePorts(sb, userId);
  const eventRows = await ports.readEventRows();
  const tendencies = await ports.readSecondSelfTendencies();
  log(`▶ read: M1 event rows=${eventRows.length} / M3 tendencies=${tendencies.length}（M2 deferred）`);

  // ── assemble → synthesize → pipeline（fakeWorldState・apply しない）──
  const memory = await assembleMemoryItems({ readEventRows: async () => eventRows, readSecondSelfTendencies: async () => tendencies });
  const nowMs = Date.parse(new Date().toISOString());
  const synthesis = synthesizeMemory(memory, nowMs);
  const world = fakeWorldState({
    date: "shadow",
    nowMinute: 540,
    gaps: [{ startTime: "09:00", endTime: "11:00" }, { startTime: "13:00", endTime: "16:00" }, { startTime: "18:00", endTime: "20:00" }],
    schedule: [],
    context: null,
  });
  const env = runRealityPipeline({ memoryItems: memory, worldState: world, permissionLevel: 2, nowMs });
  const highRisk = runRealityPipeline({ memoryItems: memory, worldState: world, permissionLevel: 5, nowMs, requestedAction: { action: "book", flags: ["confirms_booking"] } });

  // ── 観測 + assert ──
  log(`▶ MemoryItem=${memory.length} / usableContexts=${synthesis.usableContexts.length} / suppressed=${synthesis.contexts.filter((c) => c.suppressed).length}`);
  log(`▶ envelope: readiness=${env.worldReadiness} recommended=${env.recommended?.tier ?? "none"} surfacedTrigger=${env.surfacedTrigger?.kind ?? "silent"} permission=${env.permission.verdict} changeSetDraft=${env.changeSetDraft ? `id=… opCount=${env.changeSetDraft.opCount}` : "null"}`);

  let pass = true;
  const blob = JSON.stringify({ memory, env });
  pass = ok(!FORBIDDEN.test(blob), "redaction: memory+envelope に raw/seedRef/PII/personality なし") && pass;
  pass = ok(highRisk.permission.verdict !== "allowed", "high risk(book) は auto-allowed にならない") && pass;
  pass = ok(env.changeSetDraft === null || Object.keys(env.changeSetDraft).join(",") === "id,opCount", "ChangeSet draft は summary のみ(id,opCount)") && pass;
  pass = ok(synthesis.contexts.every((c) => c.confidence !== ("high" as unknown)), "confidence high なし(≤tentative)") && pass;
  // retracted/suppressed が read で除外: M3 reader は retracted_at IS NULL を select → tendencies に retracted は来ない
  pass = ok(tendencies.every((t) => t.certainty !== ("high" as unknown)), "M3 tendency は certainty ≤tentative(retracted/高 certainty 混入なし)") && pass;

  log(`\n${pass ? "✅ PASS" : "❌ FAIL"} — memory-only staging shadow（read-only・write 0・apply 0）`);
  await sb.auth.signOut();
  process.exit(pass ? 0 : 1);
}

main().catch((e) => fatal(`unexpected: ${e instanceof Error ? e.message : String(e)}`));
