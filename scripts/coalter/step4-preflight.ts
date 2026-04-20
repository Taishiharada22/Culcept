/**
 * [Step 4 preflight 2026-04-20]
 *   flag ON 直前の新ペア / 既存ペア 状態チェック。
 *
 *   確認対象:
 *     (a) NEW pair: connection=3b7cd157-... (users 76a5c4c8-... / 1c6ef878-...)
 *     (b) OLD pair: pair_state=a3352c44-... (thread=18eeb9ff-...)
 *
 *   期待（flag OFF 時点）:
 *     - NEW: coalter_pair_states は未作成（activate 未実行）、
 *            talk_threads は存在（C4 で修復済み）、
 *            talk_messages は 0 件（cold-start 前提のため）
 *     - OLD: coalter_pair_states.onboarded_at = NULL（migration 直後、flag OFF で stamp されない契約）
 *     - seed row (session_id IS NULL) は 0 件（flag OFF 中の契約）
 *     - normal ledger rows（session_id IS NOT NULL）は既存のまま
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import path from "node:path";

config({ path: path.resolve(process.cwd(), ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("env missing");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const NEW_CONNECTION = "3b7cd157-1cf6-45c3-aed8-6a3ec7339b1d";
const NEW_THREAD = "2e9b38c8-8257-4886-8954-c550404eaf51";
const OLD_PAIR_STATE = "a3352c44-3fae-4d35-b4d0-0e57cac17f37";
const OLD_THREAD = "18eeb9ff-7e24-4870-a371-c45fecd510b5";

type Check = { name: string; ok: boolean; detail: string };

async function main() {
  const checks: Check[] = [];

  // ── NEW PAIR ──────────────────────────────────────────────────────────
  const { data: newConn } = await admin
    .from("genome_connections")
    .select("status, requester_id, target_id")
    .eq("id", NEW_CONNECTION)
    .maybeSingle();
  checks.push({
    name: "NEW genome_connections accepted",
    ok: newConn?.status === "accepted",
    detail: JSON.stringify(newConn),
  });

  const { data: newThread } = await admin
    .from("talk_threads")
    .select("id")
    .eq("id", NEW_THREAD)
    .maybeSingle();
  checks.push({
    name: "NEW talk_threads exists (post-C4-repair)",
    ok: newThread?.id === NEW_THREAD,
    detail: JSON.stringify(newThread),
  });

  const { data: newPair } = await admin
    .from("coalter_pair_states")
    .select("id, state, onboarded_at")
    .eq("thread_id", NEW_THREAD)
    .maybeSingle();
  checks.push({
    name: "NEW coalter_pair_states NOT YET created (awaits activate)",
    ok: newPair === null,
    detail: JSON.stringify(newPair),
  });

  // NEW talk_messages count: cold-start protection は onboarded_at=null かつ
  //   count=0 の両方が必要。flag ON + activate 後は onboarded_at が stamp
  //   されるので cold-start には入らない。よって count は Step 4 の blocker
  //   ではない。情報として記録のみ。
  const { count: newMsgCount } = await admin
    .from("talk_messages")
    .select("id", { head: true, count: "exact" })
    .eq("thread_id", NEW_THREAD);
  checks.push({
    name: `NEW talk_messages count (info only, not a blocker)`,
    ok: true,
    detail: `count=${newMsgCount}`,
  });

  // ── OLD PAIR ──────────────────────────────────────────────────────────
  const { data: oldPair } = await admin
    .from("coalter_pair_states")
    .select("id, state, onboarded_at, thread_id")
    .eq("id", OLD_PAIR_STATE)
    .maybeSingle();
  checks.push({
    name: "OLD coalter_pair_states exists + onboarded_at = NULL (flag OFF contract)",
    ok: oldPair?.state === "enabled" && oldPair.onboarded_at === null && oldPair.thread_id === OLD_THREAD,
    detail: JSON.stringify(oldPair),
  });

  const { count: oldSeedCount } = await admin
    .from("coalter_fairness_ledger")
    .select("id", { head: true, count: "exact" })
    .eq("pair_state_id", OLD_PAIR_STATE)
    .is("session_id", null);
  checks.push({
    name: "OLD seed rows (session_id IS NULL) = 0 (flag OFF contract)",
    ok: (oldSeedCount ?? -1) === 0,
    detail: `count=${oldSeedCount}`,
  });

  const { count: oldNormalCount } = await admin
    .from("coalter_fairness_ledger")
    .select("id", { head: true, count: "exact" })
    .eq("pair_state_id", OLD_PAIR_STATE)
    .not("session_id", "is", null);
  checks.push({
    name: "OLD normal ledger rows (session_id IS NOT NULL) > 0",
    ok: (oldNormalCount ?? 0) > 0,
    detail: `count=${oldNormalCount}`,
  });

  // ── SEED TOTAL ACROSS ALL PAIRS ───────────────────────────────────────
  const { count: totalSeed } = await admin
    .from("coalter_fairness_ledger")
    .select("id", { head: true, count: "exact" })
    .is("session_id", null);
  checks.push({
    name: "TOTAL seed rows across ALL pairs = 0 (flag OFF contract)",
    ok: (totalSeed ?? -1) === 0,
    detail: `count=${totalSeed}`,
  });

  // ── SCHEMA PRESENCE (column existence via sampling) ──────────────────
  // nullable session_id: insert a probe row? No — just verify migration applied
  //   via information_schema equivalent. Supabase has no direct IS schema
  //   query, so we rely on previous B-1/B-2 results and skip here.

  // ── REPORT ────────────────────────────────────────────────────────────
  console.log("=== Step 4 preflight (flag OFF baseline) ===\n");
  let allOk = true;
  for (const c of checks) {
    const mark = c.ok ? "✅" : "❌";
    console.log(`${mark} ${c.name}`);
    console.log(`   ${c.detail}`);
    if (!c.ok) allOk = false;
  }
  console.log("\n" + (allOk ? "✅ ALL PASS — ready for flag ON" : "❌ FAIL — 先に解消してから flag ON"));
  process.exit(allOk ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
