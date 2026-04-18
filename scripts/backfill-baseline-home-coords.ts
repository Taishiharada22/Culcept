import "server-only";

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { MUNICIPALITY_COORDS } from "@/lib/shared/municipalityCoords";

config({ path: ".env.local" });

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// baseline_home_lat/lng backfill
// 仕様: docs/baseline-edit-spec-v1.md §2
// migration: supabase/migrations/20260418120000_baseline_home_columns.sql
//
// 既存ユーザーのうち、baseline 完了済み + city が MUNICIPALITY_COORDS に収録されている
// 行の lat/lng を埋める。idempotent（lat が NULL の行のみ対象）。
// 未収録 city / city NULL は lat/lng NULL のまま。
// （runtime の locationResolver が prefecture フォールバックで動くため機能劣化なし）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const supabaseUrl =
  (process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "").trim();
const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Supabase service role env is missing (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

type ProfileRow = {
  id: string;
  prefecture: string | null;
  city: string | null;
};

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  console.log(`[backfill] mode: ${dryRun ? "DRY-RUN" : "EXECUTE"}`);

  const { data, error } = await supabase
    .from("profiles")
    .select("id, prefecture, city")
    .not("baseline_completed_at", "is", null)
    .is("baseline_home_lat", null)
    .not("city", "is", null);

  if (error) {
    console.error("[backfill] fetch error:", error);
    process.exit(1);
  }

  const profiles = (data ?? []) as ProfileRow[];
  console.log(`[backfill] candidates: ${profiles.length}`);

  let updated = 0;
  let skippedNoCoords = 0;
  let failed = 0;

  for (const p of profiles) {
    if (!p.city) {
      skippedNoCoords++;
      continue;
    }
    const coords = MUNICIPALITY_COORDS[p.city];
    if (!coords) {
      skippedNoCoords++;
      continue;
    }

    if (dryRun) {
      console.log(`[backfill] would update ${p.id}: ${p.prefecture}/${p.city} -> (${coords.lat}, ${coords.lon})`);
      updated++;
      continue;
    }

    const { error: upErr } = await supabase
      .from("profiles")
      .update({
        baseline_home_lat: coords.lat,
        baseline_home_lng: coords.lon,
      })
      .eq("id", p.id);

    if (upErr) {
      console.error(`[backfill] update failed for ${p.id}:`, upErr);
      failed++;
      continue;
    }
    updated++;
  }

  console.log(`[backfill] done: updated=${updated}, skipped(no_coords)=${skippedNoCoords}, failed=${failed}`);
}

main().catch((e) => {
  console.error("[backfill] fatal:", e);
  process.exit(1);
});
