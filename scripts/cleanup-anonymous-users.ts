#!/usr/bin/env npx tsx
// scripts/cleanup-anonymous-users.ts
// TTL バッチジョブ: 30日超の未昇格匿名ユーザーのデータを削除する
//
// 実行方法:
//   npx tsx scripts/cleanup-anonymous-users.ts              # dry-run（デフォルト）
//   npx tsx scripts/cleanup-anonymous-users.ts --execute    # 本番実行
//
// 前提条件:
//   - .env.local に SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY が設定済み
//   - migration 20260401100000_anonymous_auth_support.sql が適用済み
//
// 削除対象:
//   - is_anonymous = true
//   - 作成から30日超
//   - is_merged = false（merge済みユーザーは対象外）
//
// 削除順序（FK制約に従う）:
//   stargazer_observations → stargazer_axis_snapshots → stargazer_profiles →
//   stargazer_context_profiles → stargazer_behavioral_signals →
//   stargazer_analytics → profiles → auth.users

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("❌ 環境変数が不足しています: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const isDryRun = !process.argv.includes("--execute");

// 削除対象テーブル（FK依存順）
const CLEANUP_TABLES = [
  "stargazer_observations",
  "stargazer_axis_snapshots",
  "stargazer_profiles",
  "stargazer_context_profiles",
  "stargazer_behavioral_signals",
  "stargazer_detected_patterns",
  "stargazer_analytics",
  "stargazer_daily_states",
  "stargazer_question_shown",
  "stargazer_footprint_summaries",
  "stargazer_mirror_snapshots",
  "profiles",
] as const;

async function main() {
  console.log(`\n🧹 匿名ユーザー TTL クリーンアップ ${isDryRun ? "(DRY RUN)" : "(EXECUTE)"}\n`);
  console.log(`  Supabase URL: ${SUPABASE_URL}`);
  console.log(`  TTL: 30日`);

  // 1. 対象ユーザーを特定
  // anonymous_users_to_cleanup VIEW を直接使えない場合があるので、
  // 同等のクエリを profiles + auth を使って構成する
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // auth.users から is_anonymous=true かつ 30日超のユーザーを取得
  const { data: authUsers, error: authErr } = await admin.auth.admin.listUsers({
    perPage: 1000,
  });

  if (authErr) {
    console.error("❌ ユーザー一覧取得失敗:", authErr.message);
    process.exit(1);
  }

  const targetUsers = (authUsers?.users ?? []).filter((u) => {
    if (!u.is_anonymous) return false;
    if (new Date(u.created_at).getTime() > new Date(thirtyDaysAgo).getTime()) return false;
    return true;
  });

  if (targetUsers.length === 0) {
    console.log("\n✅ 削除対象の匿名ユーザーはいません。");
    return;
  }

  // is_merged チェック（merge済みユーザーを除外）
  const targetIds = targetUsers.map((u) => u.id);
  const { data: mergedProfiles } = await admin
    .from("profiles")
    .select("id, is_merged")
    .in("id", targetIds)
    .eq("is_merged", true);

  const mergedIds = new Set((mergedProfiles ?? []).map((p) => p.id));
  const cleanupUsers = targetUsers.filter((u) => !mergedIds.has(u.id));

  console.log(`\n📊 対象ユーザー数:`);
  console.log(`  30日超の匿名ユーザー: ${targetUsers.length}`);
  console.log(`  merge済み（除外）: ${mergedIds.size}`);
  console.log(`  削除対象: ${cleanupUsers.length}`);

  if (cleanupUsers.length === 0) {
    console.log("\n✅ 削除対象ユーザーなし（全てmerge済み）。");
    return;
  }

  // 各ユーザーの観測数を表示
  console.log(`\n📋 削除対象一覧:`);
  for (const u of cleanupUsers) {
    const { count } = await admin
      .from("stargazer_observations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", u.id);
    console.log(`  ${u.id} | 作成: ${u.created_at} | 観測数: ${count ?? 0}`);
  }

  if (isDryRun) {
    console.log(`\n⚠️ DRY RUN: 実際の削除は行いません。`);
    console.log(`  本番実行するには: npx tsx scripts/cleanup-anonymous-users.ts --execute`);
    return;
  }

  // 2. データ削除（テーブル順）
  console.log(`\n🗑️ 削除実行中...`);
  const cleanupIds = cleanupUsers.map((u) => u.id);

  for (const table of CLEANUP_TABLES) {
    const userIdCol = table === "profiles" ? "id" : "user_id";
    const { count, error } = await admin
      .from(table)
      .delete({ count: "exact" })
      .in(userIdCol, cleanupIds);

    if (error) {
      console.error(`  ❌ ${table}: ${error.message}`);
    } else {
      console.log(`  ${table}: ${count ?? 0}件削除`);
    }
  }

  // 3. auth.users から削除
  console.log(`\n  auth.users からユーザー削除中...`);
  let authDeleted = 0;
  let authFailed = 0;
  for (const u of cleanupUsers) {
    try {
      const { error } = await admin.auth.admin.deleteUser(u.id);
      if (error) {
        console.error(`  ❌ auth.users ${u.id}: ${error.message}`);
        authFailed++;
      } else {
        authDeleted++;
      }
    } catch (err) {
      console.error(`  ❌ auth.users ${u.id}: ${err}`);
      authFailed++;
    }
  }
  console.log(`  auth.users: ${authDeleted}件削除, ${authFailed}件失敗`);

  // 4. サマリー
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📊 クリーンアップ完了: ${authDeleted}/${cleanupUsers.length} ユーザー削除`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
}

main().catch((err) => {
  console.error("❌ クリーンアップエラー:", err);
  process.exit(1);
});
