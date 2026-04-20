import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const env = readFileSync("/Users/haradataishi/Culcept/.env.local", "utf8")
  .split("\n")
  .reduce((acc, line) => {
    const m = line.match(/^([^=#]+)=(.*)$/);
    if (m) acc[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
    return acc;
  }, {});

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data, error } = await sb
  .from("coalter_plan_items")
  .select("id, thread_id, session_id, target_date, title, category, created_by, created_at")
  .order("created_at", { ascending: false })
  .limit(10);

if (error) {
  console.error("ERROR:", error);
  process.exit(1);
}

console.log(`Total recent rows: ${data.length}`);
for (const r of data) {
  console.log(
    `  ${r.created_at} thread=${r.thread_id.slice(0, 8)} date=${r.target_date} title="${r.title}" cat=${r.category} by=${r.created_by.slice(0, 8)}`,
  );
}
