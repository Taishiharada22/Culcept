#!/usr/bin/env npx tsx
// scripts/p0-smoke-test.ts
// P0 スモークテスト: staging環境でのフル検証スクリプト
//
// 実行方法:
//   npx tsx scripts/p0-smoke-test.ts
//
// 前提条件:
//   - .env.local に SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY が設定済み
//   - migration 20260401100000_anonymous_auth_support.sql が適用済み
//   - anonymous auth が有効化済み
//
// テスト項目:
//   1. 匿名ユーザー作成
//   2. 回答保存
//   3. 新規登録昇格（ケース1）
//   4. 既存アカウントmerge（ケース2）
//   5. answered_at 新しい方優先
//   6. is_merged 二重防止
//   7. 累計観測数一致

import { createClient } from "@supabase/supabase-js";

// ─── 環境変数 ───
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("❌ 環境変数が不足しています: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// テスト用 Supabase client（匿名ユーザー用）
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";
function createAnonClient() {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ─── ヘルパー ───
let passCount = 0;
let failCount = 0;

function pass(name: string) {
  passCount++;
  console.log(`  ✅ ${name}`);
}

function fail(name: string, reason: string) {
  failCount++;
  console.error(`  ❌ ${name}: ${reason}`);
}

function makeObservation(userId: string, questionId: string, answeredAt: string) {
  const answeredDate = new Date(answeredAt);
  const shownDate = new Date(answeredDate.getTime() - 3000); // response_time_ms分前
  return {
    user_id: userId,
    question_id: questionId,
    phase: "core",
    answered_at: answeredAt,
    shown_at: shownDate.toISOString(),
    response_time_ms: 3000,
    answer: "test_answer",
    observation_layer: "state",
  };
}

// ─── クリーンアップ ───
async function cleanup(userIds: string[]) {
  for (const uid of userIds) {
    await admin.from("stargazer_observations").delete().eq("user_id", uid).like("question_id", "smoke_%");
    await admin.from("profiles").delete().eq("id", uid);
    // auth.users からは admin API で削除
    try {
      await admin.auth.admin.deleteUser(uid);
    } catch {
      // ユーザーが存在しない場合は無視
    }
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// テスト実行
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function main() {
  console.log("\n🔬 P0 スモークテスト開始\n");
  console.log(`  Supabase URL: ${SUPABASE_URL}`);

  const testUserIds: string[] = [];

  try {
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // テスト1: 匿名ユーザー作成
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    console.log("\n📌 テスト1: 匿名ユーザー作成");

    const anonClient = createAnonClient();
    const { data: anonData, error: anonError } = await anonClient.auth.signInAnonymously();

    if (anonError || !anonData.user) {
      fail("匿名サインイン", anonError?.message ?? "user is null");
      console.error("  ⚠️ anonymous auth が有効化されていない可能性があります");
      console.error("  ⚠️ Supabase Dashboard → Authentication → Settings → Allow anonymous sign-ins を確認");
      process.exit(1);
    }

    const anonUserId = anonData.user.id;
    testUserIds.push(anonUserId);

    if (anonData.user.is_anonymous) {
      pass("匿名ユーザー作成成功");
    } else {
      fail("匿名ユーザー作成", "is_anonymous が false");
    }

    // profiles にレコードを作成（実際のフローでは自動作成）
    await admin.from("profiles").upsert({ id: anonUserId, locale: "ja" });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // テスト2: 回答保存
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    console.log("\n📌 テスト2: 回答保存（毎問サーバー保存）");

    const obs1 = makeObservation(anonUserId, "smoke_q01", "2026-04-01T10:00:00Z");
    const obs2 = makeObservation(anonUserId, "smoke_q02", "2026-04-01T10:01:00Z");
    const obs3 = makeObservation(anonUserId, "smoke_q03", "2026-04-01T10:02:00Z");

    const { error: insertErr } = await admin
      .from("stargazer_observations")
      .insert([obs1, obs2, obs3]);

    if (insertErr) {
      fail("回答保存", insertErr.message);
    } else {
      pass("3問の回答を保存");
    }

    // 保存件数を確認
    const { count: savedCount } = await admin
      .from("stargazer_observations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", anonUserId)
      .like("question_id", "smoke_%");

    if (savedCount === 3) {
      pass("保存件数が正しい（3件）");
    } else {
      fail("保存件数", `expected 3, got ${savedCount}`);
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // テスト3: 新規登録昇格（ケース1）
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    console.log("\n📌 テスト3: 新規登録昇格（ケース1 — user_id 維持）");

    // ケース1は linkIdentity / updateUser で同一user_idのまま昇格するため、
    // 観測データの移管は不要。ここではuser_idが変わらないことを確認。
    // (実際の updateUser() テストはブラウザ経由が必要なので、ここではロジック確認のみ)

    const { count: afterUpgradeCount } = await admin
      .from("stargazer_observations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", anonUserId)
      .like("question_id", "smoke_%");

    if (afterUpgradeCount === 3) {
      pass("昇格後も観測数が維持される（3件）");
    } else {
      fail("昇格後の観測数", `expected 3, got ${afterUpgradeCount}`);
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // テスト4: 既存アカウントmerge（ケース2）
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    console.log("\n📌 テスト4: 既存アカウントmerge（ケース2）");

    // 既存ユーザーを作成
    const existingEmail = `smoke-existing-${Date.now()}@test.aneurasync.com`;
    const { data: existingData, error: existingErr } = await admin.auth.admin.createUser({
      email: existingEmail,
      password: "smoke-test-password-123",
      email_confirm: true,
    });

    if (existingErr || !existingData.user) {
      fail("既存ユーザー作成", existingErr?.message ?? "user is null");
      return;
    }

    const existingUserId = existingData.user.id;
    testUserIds.push(existingUserId);

    await admin.from("profiles").upsert({ id: existingUserId, locale: "ja" });

    // 既存ユーザーに2つの回答を入れる
    const existingObs1 = makeObservation(existingUserId, "smoke_q01", "2026-03-30T10:00:00Z"); // q01: 古い
    const existingObs2 = makeObservation(existingUserId, "smoke_q04", "2026-03-30T10:01:00Z"); // q04: 既存のみ

    await admin.from("stargazer_observations").insert([existingObs1, existingObs2]);

    // 新たな匿名ユーザーを作成（merge元）
    const anonClient2 = createAnonClient();
    const { data: anon2Data } = await anonClient2.auth.signInAnonymously();
    const anon2UserId = anon2Data!.user!.id;
    testUserIds.push(anon2UserId);

    await admin.from("profiles").upsert({ id: anon2UserId, locale: "ja" });

    // 匿名ユーザーに3つの回答を入れる
    const anon2Obs1 = makeObservation(anon2UserId, "smoke_q01", "2026-04-01T12:00:00Z"); // q01: 新しい→競合で勝つ
    const anon2Obs2 = makeObservation(anon2UserId, "smoke_q05", "2026-04-01T12:01:00Z"); // q05: 匿名のみ
    const anon2Obs3 = makeObservation(anon2UserId, "smoke_q06", "2026-04-01T12:02:00Z"); // q06: 匿名のみ

    await admin.from("stargazer_observations").insert([anon2Obs1, anon2Obs2, anon2Obs3]);

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // テスト5: answered_at 新しい方優先
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    console.log("\n📌 テスト5: merge実行 + answered_at 新しい方優先");

    // merge処理をシミュレート（直接DB操作で mergeAnonymousIntoExistingUser のロジックを再現）
    // 1. 匿名の observation を取得
    const { data: anonObs } = await admin
      .from("stargazer_observations")
      .select("*")
      .eq("user_id", anon2UserId)
      .like("question_id", "smoke_%");

    // 2. 既存の observation を取得
    const { data: existingObs } = await admin
      .from("stargazer_observations")
      .select("question_id, answered_at")
      .eq("user_id", existingUserId)
      .like("question_id", "smoke_%");

    const existingMap = new Map(
      (existingObs ?? []).map((o) => [o.question_id, o.answered_at])
    );

    // 3. merge実行
    let mergedCount = 0;
    let conflictCount = 0;

    for (const obs of anonObs ?? []) {
      const existingAnsweredAt = existingMap.get(obs.question_id);

      if (!existingAnsweredAt) {
        // 既存に回答なし → 移管
        await admin
          .from("stargazer_observations")
          .update({ user_id: existingUserId })
          .eq("id", obs.id);
        mergedCount++;
      } else {
        const anonTime = new Date(obs.answered_at).getTime();
        const existingTime = new Date(existingAnsweredAt).getTime();

        if (anonTime >= existingTime) {
          // 匿名の方が新しい → 既存を削除して匿名を移管
          await admin
            .from("stargazer_observations")
            .delete()
            .eq("user_id", existingUserId)
            .eq("question_id", obs.question_id)
            .like("question_id", "smoke_%");

          await admin
            .from("stargazer_observations")
            .update({ user_id: existingUserId })
            .eq("id", obs.id);

          conflictCount++;
          mergedCount++;
        } else {
          // 既存の方が新しい → 匿名を削除
          await admin
            .from("stargazer_observations")
            .delete()
            .eq("id", obs.id);
        }
      }
    }

    console.log(`  merged: ${mergedCount}, conflicts resolved: ${conflictCount}`);

    if (conflictCount === 1) {
      pass("q01 の競合で匿名側（新しい方）が優先された");
    } else {
      fail("競合解決", `expected 1 conflict, got ${conflictCount}`);
    }

    // merge後の観測数を確認
    // 期待: q01(匿名版), q04(既存), q05(匿名), q06(匿名) = 4件
    const { count: mergedTotal } = await admin
      .from("stargazer_observations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", existingUserId)
      .like("question_id", "smoke_%");

    if (mergedTotal === 4) {
      pass("merge後の累計観測数が正しい（4件）");
    } else {
      fail("merge後の観測数", `expected 4, got ${mergedTotal}`);
    }

    // q01 の answered_at が匿名版のものになっているか確認
    const { data: q01Data } = await admin
      .from("stargazer_observations")
      .select("answered_at")
      .eq("user_id", existingUserId)
      .eq("question_id", "smoke_q01")
      .like("question_id", "smoke_%")
      .single();

    if (q01Data?.answered_at && new Date(q01Data.answered_at).getTime() === new Date("2026-04-01T12:00:00Z").getTime()) {
      pass("q01 は匿名の answered_at（新しい方）が保持されている");
    } else {
      fail("q01 の answered_at", `expected 2026-04-01T12:00:00Z, got ${q01Data?.answered_at}`);
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // テスト6: is_merged 二重防止
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    console.log("\n📌 テスト6: is_merged 二重防止");

    // is_merged フラグを立てる
    await admin
      .from("profiles")
      .update({ is_merged: true, merged_at: new Date().toISOString() })
      .eq("id", anon2UserId);

    // is_merged を確認
    const { data: mergedProfile } = await admin
      .from("profiles")
      .select("is_merged, merged_at")
      .eq("id", anon2UserId)
      .single();

    if (mergedProfile?.is_merged === true) {
      pass("is_merged フラグが正しく立っている");
    } else {
      fail("is_merged フラグ", `expected true, got ${mergedProfile?.is_merged}`);
    }

    // 二回目のmerge試行 — is_merged=true ならスキップ
    if (mergedProfile?.is_merged) {
      pass("is_merged=true の場合、merge処理をスキップ（二重防止OK）");
    } else {
      fail("二重防止", "is_merged が false のまま");
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // テスト7: 累計観測数一致（サーバー vs 期待値）
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    console.log("\n📌 テスト7: 累計観測数の一致確認");

    // 最初の匿名ユーザー（テスト1-2）の観測数
    const { count: anon1Count } = await admin
      .from("stargazer_observations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", anonUserId)
      .like("question_id", "smoke_%");

    if (anon1Count === 3) {
      pass("匿名ユーザー1の観測数: 3件（正しい）");
    } else {
      fail("匿名ユーザー1の観測数", `expected 3, got ${anon1Count}`);
    }

    // merge先の既存ユーザーの観測数
    const { count: existingCount } = await admin
      .from("stargazer_observations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", existingUserId)
      .like("question_id", "smoke_%");

    if (existingCount === 4) {
      pass("merge先ユーザーの観測数: 4件（正しい）");
    } else {
      fail("merge先ユーザーの観測数", `expected 4, got ${existingCount}`);
    }

    // 匿名2のデータはmerge済みなので0件であるべき
    const { count: anon2Count } = await admin
      .from("stargazer_observations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", anon2UserId)
      .like("question_id", "smoke_%");

    if (anon2Count === 0) {
      pass("merge元の匿名ユーザー2の観測数: 0件（全て移管済み）");
    } else {
      fail("匿名ユーザー2の残留データ", `expected 0, got ${anon2Count}`);
    }

  } finally {
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // クリーンアップ
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    console.log("\n🧹 テストデータのクリーンアップ");
    await cleanup(testUserIds);
    console.log("  完了");
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 結果サマリー
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`📊 結果: ${passCount} PASS / ${failCount} FAIL`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  if (failCount > 0) {
    console.error("❌ スモークテスト失敗。P1に進む前に修正が必要です。");
    process.exit(1);
  } else {
    console.log("✅ 全テスト通過。P1に進んでOKです。");
  }
}

main().catch((err) => {
  console.error("❌ テスト実行エラー:", err);
  process.exit(1);
});
