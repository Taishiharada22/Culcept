#!/usr/bin/env npx tsx
/**
 * B-3c-2 Phase 0 live verify (= CEO 手動 chat 後の telemetry 監査)
 *
 * Supabase `stargazer_analytics` から直近 30 分の journey_origin_promotion_*
 * events を query。 PASS/FAIL 判定の根拠として CEO に提示。
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

async function main() {
  const envText = readFileSync(
    "/Users/haradataishi/Culcept-w3-integrated/.env.preview",
    "utf8",
  );
  const env: Record<string, string> = {};
  envText.split("\n").forEach((l) => {
    const m = l.match(/^([A-Z0-9_]+)="?([^"]*)"?$/);
    if (m) env[m[1]] = m[2];
  });

  const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
  const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error("❌ env 不足");
    process.exit(1);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const since = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // 30 min ago

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  B-3c-2 Phase 0 live verify — Supabase telemetry");
  console.log(`  Since: ${since}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");

  // Query 1: journey_origin_promotion_* events 直近 30 分
  console.log("=== Query 1: journey_origin_promotion_* events (last 30 min) ===");
  const { data: events, error: e1 } = await admin
    .from("stargazer_analytics")
    .select("created_at, user_id, event, metadata")
    .like("event", "journey_origin_promotion_%")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(50);

  if (e1) {
    console.error("❌ query error:", e1.message);
  } else {
    console.log(`件数: ${events?.length ?? 0}`);
    for (const ev of events ?? []) {
      console.log(
        `  ${ev.created_at} | user=${ev.user_id?.slice(0, 8)} | ${ev.event}`,
      );
      console.log(`    metadata: ${JSON.stringify(ev.metadata)}`);
    }
  }
  console.log("");

  // Query 2: 直近 alter_morning 関連 events 全種 (= 起動経路把握)
  console.log("=== Query 2: 直近 alter_morning feature events 全種 (last 30 min) ===");
  const { data: morningEvents, error: e2 } = await admin
    .from("stargazer_analytics")
    .select("created_at, user_id, event")
    .eq("feature", "alter_morning")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(20);
  if (e2) {
    console.error("❌ query error:", e2.message);
  } else {
    console.log(`件数: ${morningEvents?.length ?? 0}`);
    for (const ev of morningEvents ?? []) {
      console.log(
        `  ${ev.created_at} | user=${ev.user_id?.slice(0, 8)} | ${ev.event}`,
      );
    }
  }
  console.log("");

  // Query 3: 直近 events 全種 (= もし上記 2 つが 0 件なら、何が emit されているか確認)
  console.log("=== Query 3: 直近 events 全種 (last 10 min、limit 10) ===");
  const since10 = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: anyEvents, error: e3 } = await admin
    .from("stargazer_analytics")
    .select("created_at, user_id, event, feature")
    .gte("created_at", since10)
    .order("created_at", { ascending: false })
    .limit(10);
  if (e3) {
    console.error("❌ query error:", e3.message);
  } else {
    console.log(`件数: ${anyEvents?.length ?? 0}`);
    for (const ev of anyEvents ?? []) {
      console.log(
        `  ${ev.created_at} | user=${ev.user_id?.slice(0, 8)} | ${ev.event} | feature=${ev.feature}`,
      );
    }
  }

  console.log("");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  分析");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  const journeyEvents = events ?? [];
  const presented = journeyEvents.filter(
    (e) => e.event === "journey_origin_promotion_presented",
  );
  const succeeded = journeyEvents.filter(
    (e) => e.event === "journey_origin_promotion_succeeded",
  );
  const blocked = journeyEvents.filter(
    (e) => e.event === "journey_origin_promotion_blocked",
  );
  const zero = journeyEvents.filter(
    (e) => e.event === "journey_origin_promotion_zero_candidates",
  );
  const provFail = journeyEvents.filter(
    (e) => e.event === "journey_origin_promotion_provider_failure",
  );

  console.log(`  presented:        ${presented.length}`);
  console.log(`  succeeded:        ${succeeded.length}`);
  console.log(`  blocked:          ${blocked.length}`);
  console.log(`  zero_candidates:  ${zero.length}`);
  console.log(`  provider_failure: ${provFail.length}`);

  if (journeyEvents.length === 0) {
    console.log("");
    console.log("🔴 journey_origin_promotion_* events は 1 件も emit されていない");
    console.log("   → B-3c-2 orchestrator まで到達していない可能性");
  }
}

main().catch((e) => {
  console.error("❌ unexpected:", e);
  process.exit(1);
});
