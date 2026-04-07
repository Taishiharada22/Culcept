/**
 * P4-6.5: stargazer_counterfactual_shadow_log テーブルを作成する
 * service_role_key で Supabase に接続し、DDL を実行
 *
 * 使い方: node scripts/run-migration-p4.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Step 1: テーブル存在確認
const { data: existing, error: checkErr } = await supabase
  .from("stargazer_counterfactual_shadow_log")
  .select("id")
  .limit(1);

if (!checkErr) {
  console.log("✅ テーブル stargazer_counterfactual_shadow_log は既に存在します");
  process.exit(0);
}

if (checkErr && !checkErr.message.includes("does not exist") && !checkErr.message.includes("relation")) {
  console.log("テーブル確認結果:", checkErr.message);
  console.log("テーブルが存在しない可能性があります。作成を試みます...");
}

// Step 2: rpc で SQL を実行（Supabase の pg_execute がある場合）
// Supabase は直接 DDL を REST で実行できないので、
// supabase db push または Dashboard SQL Editor での手動実行が必要

console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("Supabase REST API では DDL を直接実行できません。");
console.log("以下のいずれかの方法でテーブルを作成してください:");
console.log("");
console.log("方法 1: Supabase Dashboard SQL Editor");
console.log(`  URL: ${url.replace('.co', '.co')}/project/aljavfujeqcwnqryjmhl/sql`);
console.log("  ファイル: supabase/migrations/20260408100000_counterfactual_shadow_log.sql");
console.log("");
console.log("方法 2: supabase db push (Docker が必要)");
console.log("  supabase link --project-ref aljavfujeqcwnqryjmhl");
console.log("  supabase db push");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("");
console.log("参考: 実行する SQL:");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
const sql = readFileSync("supabase/migrations/20260408100000_counterfactual_shadow_log.sql", "utf8");
console.log(sql);
