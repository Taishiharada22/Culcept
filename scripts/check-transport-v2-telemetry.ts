/**
 * check-transport-v2-telemetry.ts
 *
 * W3-PR-10 Transport Staircase canary telemetry 回収スクリプト。
 *
 * 目的:
 *   PR #26 (positive-path nudge) の merge 判断に、CEO が Preview で手動確認
 *   した直後の `transport_v2_*` 3 event を shape ごと回収して、Claude 側で
 *   positive-path shape の real 値を確認する。
 *
 * 対象 event:
 *   - transport_v2_segments_built     (server: build 直後の分布)
 *   - transport_v2_display_rendered   (server: display cache interleave 直後)
 *   - transport_v2_edit_regression    (client: regenerateTravel 後の travel 増減)
 *
 * 既定: 直近 2 時間の event を拾う（CEO 確認直後の窓）。
 *   LOOKBACK_MINUTES=60 npx tsx scripts/check-transport-v2-telemetry.ts
 *
 * 出力: 各 event の count、metadata shape（代表値 + 分布）、positive/zero shape 比。
 *
 * service_role 利用: stargazer_analytics は user_id gate の RLS があるため、
 *   CEO + 他ユーザー横断で回収するには service_role が必要。
 */

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

const LOOKBACK_MINUTES = Number(process.env.LOOKBACK_MINUTES ?? "120"); // 既定 2 時間

const TRANSPORT_V2_EVENTS = [
  "transport_v2_segments_built",
  "transport_v2_display_rendered",
  "transport_v2_edit_regression",
] as const;

type TransportV2Event = (typeof TRANSPORT_V2_EVENTS)[number];

interface AnalyticsRow {
  id?: string;
  user_id: string;
  event: string;
  feature: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

function fmtTime(iso: string): string {
  return iso.slice(0, 19).replace("T", " ");
}

function summarize(rows: AnalyticsRow[], event: TransportV2Event): void {
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  ${event}  —  ${rows.length} rows`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  if (rows.length === 0) {
    console.log(`  (no rows in last ${LOOKBACK_MINUTES} min)`);
    return;
  }

  // positive vs zero shape
  let positive = 0;
  let zero = 0;
  let undefinedShape = 0;
  const flagSources = new Map<string, number>();
  const schemaVersions = new Map<string, number>();
  const callers = new Map<string, number>();
  const uniqueUsers = new Set<string>();

  for (const r of rows) {
    uniqueUsers.add(r.user_id);

    const md = r.metadata ?? {};
    const flagSource = String(md.flag_source ?? "(unset)");
    flagSources.set(flagSource, (flagSources.get(flagSource) ?? 0) + 1);

    const schemaVersion = String(md.schema_version ?? "(unset)");
    schemaVersions.set(schemaVersion, (schemaVersions.get(schemaVersion) ?? 0) + 1);

    const caller = String(md.caller ?? "(unset)");
    callers.set(caller, (callers.get(caller) ?? 0) + 1);

    // shape 判定は event 種別で分岐
    let count: unknown = undefined;
    if (event === "transport_v2_segments_built") {
      count = md.segment_count;
    } else if (event === "transport_v2_display_rendered") {
      count = md.travel_rendered_count;
    } else if (event === "transport_v2_edit_regression") {
      // regression 系は signed delta / absolute の両方見る
      count = md.travel_delta ?? md.travel_count_after;
    }
    if (typeof count !== "number") {
      undefinedShape += 1;
    } else if (count > 0) {
      positive += 1;
    } else {
      zero += 1;
    }
  }

  console.log(`  unique users: ${uniqueUsers.size}`);
  console.log(`  shape — positive: ${positive} | zero: ${zero} | undefined: ${undefinedShape}`);
  console.log(
    `  flag_source: ${[...flagSources.entries()]
      .map(([k, v]) => `${k}=${v}`)
      .join(" / ")}`,
  );
  console.log(
    `  schema_version: ${[...schemaVersions.entries()]
      .map(([k, v]) => `${k}=${v}`)
      .join(" / ")}`,
  );
  console.log(
    `  caller: ${[...callers.entries()]
      .map(([k, v]) => `${k}=${v}`)
      .join(" / ")}`,
  );

  // 代表 3 件（最新）を metadata 全文で
  console.log(`\n  ── representative rows (newest 3) ──`);
  const show = rows.slice(0, 3);
  for (const r of show) {
    console.log(
      `  [${fmtTime(r.created_at)}] user=${r.user_id.slice(0, 8)}… feature=${r.feature}`,
    );
    console.log(`    metadata: ${JSON.stringify(r.metadata)}`);
  }
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceRole) {
    throw new Error(
      "missing_supabase_env: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY を .env.local に設定してください",
    );
  }

  const supabase = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const since = new Date(Date.now() - LOOKBACK_MINUTES * 60 * 1000).toISOString();
  const nowStr = fmtTime(new Date().toISOString());

  console.log(`W3-PR-10 Transport V2 Telemetry Snapshot`);
  console.log(`  now:     ${nowStr}`);
  console.log(`  lookback: last ${LOOKBACK_MINUTES} min (since ${fmtTime(since)})`);

  for (const ev of TRANSPORT_V2_EVENTS) {
    const { data, error } = await supabase
      .from("stargazer_analytics")
      .select("user_id, event, feature, metadata, created_at")
      .eq("event", ev)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      console.error(`\n[${ev}] query failed:`, error.message);
      continue;
    }
    summarize((data ?? []) as AnalyticsRow[], ev);
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  Done.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
