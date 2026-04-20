/**
 * [C4 diag 2026-04-20] orphan connection 診断
 *
 *   指定 connection_id に対して以下を確認:
 *     1. genome_connections 行が存在するか (status, 両端 user)
 *     2. talk_threads 行が存在するか
 *     3. 存在しない場合: 直接 upsert で修復できるかを試す (dryRun 既定)
 *
 *   使用:
 *     npx tsx scripts/diag-orphan-connection.ts <connectionId>
 *     REPAIR=1 npx tsx scripts/diag-orphan-connection.ts <connectionId>  // 実際に upsert
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import path from "node:path";

config({ path: path.resolve(process.cwd(), ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("❌ env missing: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const connectionId = process.argv[2];
if (!connectionId) {
  console.error("usage: npx tsx scripts/diag-orphan-connection.ts <connectionId>");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log(`=== diag orphan connection: ${connectionId} ===\n`);

  // 1. connection
  const { data: conn, error: connErr } = await admin
    .from("genome_connections")
    .select("id, requester_id, target_id, status, responded_at, created_at")
    .eq("id", connectionId)
    .maybeSingle();

  if (connErr) {
    console.error("❌ genome_connections query failed:", connErr);
    process.exit(1);
  }
  if (!conn) {
    console.log(`❌ no genome_connections row for id=${connectionId}`);
    process.exit(1);
  }
  console.log("✅ genome_connections:", {
    id: conn.id,
    status: conn.status,
    requester_id: conn.requester_id,
    target_id: conn.target_id,
    responded_at: conn.responded_at,
  });

  // 2. talk_threads
  const { data: thread, error: threadErr } = await admin
    .from("talk_threads")
    .select("id, connection_id, created_at")
    .eq("connection_id", connectionId)
    .maybeSingle();

  if (threadErr) {
    console.error("❌ talk_threads query failed:", threadErr);
    process.exit(1);
  }
  if (thread) {
    console.log("✅ talk_threads exists:", thread);
    console.log("\n=> nothing to repair. threadId = " + thread.id);
    return;
  }
  console.log("❌ talk_threads MISSING for this connection");

  if (conn.status !== "accepted") {
    console.log(`\n=> connection.status = ${conn.status} (≠ accepted). thread 作成は accept 時の契約なのでここでは作らない。`);
    return;
  }

  // 3. repair attempt
  const REPAIR = process.env.REPAIR === "1";
  console.log(`\n=> REPAIR=${REPAIR ? "on" : "off (dry run)"}`);
  if (!REPAIR) {
    console.log("   dry-run: upsert は実行しない。実行するには REPAIR=1 をつけて再実行。");
    return;
  }

  const { data: created, error: upsertErr } = await admin
    .from("talk_threads")
    .upsert({ connection_id: connectionId }, { onConflict: "connection_id" })
    .select("id, created_at")
    .single();

  if (upsertErr) {
    console.error("❌ upsert failed:", upsertErr);
    process.exit(1);
  }
  console.log("✅ repaired:", created);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
