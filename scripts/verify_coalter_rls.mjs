import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const env = readFileSync("/Users/haradataishi/Culcept/.env.local", "utf8")
  .split("\n")
  .reduce((acc, line) => {
    const m = line.match(/^([^=#]+)=(.*)$/);
    if (m) acc[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
    return acc;
  }, {});

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("missing env");

const sb = createClient(url, key, { auth: { persistSession: false } });

// Use PostgREST-style RPC to run arbitrary SQL via a helper function is not available by default.
// Instead, query pg_policies view via PostgREST if exposed; likely not.
// So: do an indirect test — try INSERT with service role bypassing RLS to confirm table is writable,
// then try INSERT as anon without auth to confirm RLS blocks it.

// Step A: fetch one pair_state to use for testing
const { data: ps, error: psErr } = await sb
  .from("coalter_pair_states")
  .select("id, thread_id, user_a, user_b, state")
  .eq("state", "enabled")
  .limit(1)
  .maybeSingle();
if (psErr) { console.error("pair_states read error:", psErr); process.exit(1); }
if (!ps) { console.log("No enabled pair_state found. Skipping negative test."); process.exit(0); }

console.log("Using pair_state:", ps.id, "thread:", ps.thread_id);

// fetch a session
const { data: sess } = await sb
  .from("coalter_sessions")
  .select("id")
  .eq("pair_state_id", ps.id)
  .limit(1)
  .maybeSingle();
if (!sess) { console.log("No session found. Skipping."); process.exit(0); }

// Step B: negative test — try insert via anon (no auth) — should be blocked
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (anonKey) {
  const anon = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error: anonErr } = await anon.from("coalter_plan_items").insert({
    thread_id: ps.thread_id,
    session_id: sess.id,
    target_date: "2026-04-17",
    title: "negative-test-unauth",
    created_by: ps.user_a,
  }).select("id");
  if (anonErr) {
    console.log("[NEGATIVE OK] anon insert blocked:", anonErr.code, anonErr.message);
  } else {
    console.log("[NEGATIVE FAIL] anon insert succeeded!");
  }
}

// Step C: negative test — try insert with service role but wrong user_a not matching auth.uid()
// Actually service role bypasses RLS. So instead test: insert with random UUID as created_by & thread_id
// won't have matching pair_state — this tests the "thread participant" check.
// But service role bypasses RLS. So we can't test this directly.
// Workaround: use a real user's session token if we had one. We don't.
// Conclusion: anon test is sufficient to confirm RLS is engaged.

console.log("Verification done.");
