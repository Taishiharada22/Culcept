/**
 * E2E テスト: flag ON時のAlter API呼び出し + derived_facts記録確認
 *
 * 前提:
 *   1. .env.local に STARGAZER_USE_DERIVED_FACTS=true を設定
 *   2. 開発サーバが起動中 (npm run dev)
 *   3. Supabase にテストユーザーが存在
 *
 * 使い方:
 *   npx tsx scripts/e2e-derived-facts-test.ts
 *
 * このスクリプトは:
 *   - Supabaseに直接ログインしてセッションを取得
 *   - flag ONのAlter APIを呼び出し
 *   - レスポンスにderived_factsの痕跡があるか確認
 *   - stargazer_analyticsテーブルにderived_facts metadataが記録されたか確認
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

// .env.local を読み込み
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const DEV_SERVER_URL = "http://localhost:3000";

// テストユーザー（.env.localまたは環境変数で指定）
const TEST_EMAIL = process.env.TEST_USER_EMAIL;
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD;

async function main() {
  console.log("=== E2E: Derived Facts Flag-ON Test ===\n");

  // ── Step 0: 環境確認 ──
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error("❌ NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY が未設定");
    console.log("   .env.local を確認してください");
    process.exit(1);
  }

  if (!TEST_EMAIL || !TEST_PASSWORD) {
    console.error("❌ TEST_USER_EMAIL / TEST_USER_PASSWORD が未設定");
    console.log("   環境変数で指定してください:");
    console.log("   TEST_USER_EMAIL=xxx TEST_USER_PASSWORD=yyy npx tsx scripts/e2e-derived-facts-test.ts");
    process.exit(1);
  }

  console.log(`Supabase URL: ${SUPABASE_URL}`);
  console.log(`Test user: ${TEST_EMAIL}`);

  // ── Step 1: Supabase認証 ──
  console.log("\n[Step 1] Supabase認証...");
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });

  if (authError || !authData.session) {
    console.error("❌ 認証失敗:", authError?.message ?? "セッション取得不可");
    process.exit(1);
  }

  const accessToken = authData.session.access_token;
  const userId = authData.user?.id;
  console.log(`✅ 認証成功 (userId: ${userId})`);

  // ── Step 2: 開発サーバ確認 ──
  console.log("\n[Step 2] 開発サーバ確認...");
  try {
    const healthCheck = await fetch(`${DEV_SERVER_URL}/api/health`, {
      signal: AbortSignal.timeout(5000),
    }).catch(() => null);

    if (!healthCheck) {
      console.log("⚠️  /api/health が応答しません。開発サーバが起動しているか確認してください");
      console.log("   npm run dev で起動後、再実行してください");
      process.exit(1);
    }
    console.log(`✅ 開発サーバ応答あり (status: ${healthCheck.status})`);
  } catch {
    console.log("⚠️  開発サーバへの接続に失敗");
    console.log("   npm run dev で起動後、再実行してください");
    process.exit(1);
  }

  // ── Step 3: STARGAZER_USE_DERIVED_FACTS 確認 ──
  console.log("\n[Step 3] Feature flag確認...");
  console.log("   STARGAZER_USE_DERIVED_FACTS:", process.env.STARGAZER_USE_DERIVED_FACTS ?? "(未設定)");
  if (process.env.STARGAZER_USE_DERIVED_FACTS !== "true") {
    console.log("⚠️  STARGAZER_USE_DERIVED_FACTS=true が .env.local に設定されていない可能性");
    console.log("   サーバ側の env を確認してください（このスクリプトの env とは別）");
  }

  // ── Step 4: Alter API 呼び出し ──
  console.log("\n[Step 4] Alter API呼び出し...");
  const apiStart = Date.now();

  // Supabase SSR Cookie名: sb-<project-ref>-auth-token
  const projectRef = SUPABASE_URL.replace("https://", "").split(".")[0];
  const sessionPayload = JSON.stringify(authData.session);
  // Supabase SSR はセッションをchunk化するが、単一cookieでも動作する
  const cookieName = `sb-${projectRef}-auth-token`;
  const cookieValue = `${encodeURIComponent(sessionPayload)}`;

  const response = await fetch(`${DEV_SERVER_URL}/api/stargazer/alter`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cookie": `${cookieName}=${cookieValue}`,
    },
    body: JSON.stringify({
      message: "最近、上司と意見が合わなくて仕事を辞めようか悩んでる。安定を取るか、自分の信念を貫くか。どっちがいいと思う？",
      source: "home",  // Home Alter経路に入るために必須
    }),
  });

  const apiDuration = Date.now() - apiStart;
  console.log(`   API status: ${response.status} (${apiDuration}ms)`);

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "(読み取り不可)");
    console.error(`❌ API呼び出し失敗: ${response.status}`);
    console.error(`   Body: ${errorBody.slice(0, 500)}`);
    process.exit(1);
  }

  const responseData = await response.json();
  console.log(`✅ API応答取得`);
  console.log(`   Response keys: ${Object.keys(responseData).join(", ")}`);
  if (responseData.reply) {
    console.log(`   Reply (先頭100文字): ${responseData.reply.slice(0, 100)}...`);
  }
  if (responseData.sessionId) {
    console.log(`   SessionId: ${responseData.sessionId}`);
  }
  if (responseData.mode) {
    console.log(`   Mode: ${responseData.mode}`);
  }
  if (responseData.response) {
    console.log(`   Response (先頭150文字): ${String(responseData.response).slice(0, 150)}...`);
  }

  // ── Step 5: derived_facts 記録確認 ──
  console.log("\n[Step 5] derived_facts 記録確認...");
  console.log("   (analytics insertは非同期のため3秒待機...)");
  await new Promise((r) => setTimeout(r, 3000));

  // stargazer_analyticsから最新レコードを検索（まずイベント種別を確認）
  const { data: recentRecords } = await supabase
    .from("stargazer_analytics")
    .select("id, event, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(5);

  if (recentRecords && recentRecords.length > 0) {
    console.log("   直近5件のanalytics:");
    for (const r of recentRecords) {
      console.log(`     - ${r.event} (${r.created_at})`);
    }
  } else {
    console.log("   ⚠️ このユーザーのanalyticsレコードが0件");
  }

  // home_alter_judgment を検索
  const { data: analyticsData, error: analyticsError } = await supabase
    .from("stargazer_analytics")
    .select("id, event, metadata, created_at")
    .eq("user_id", userId)
    .eq("event", "home_alter_judgment")
    .order("created_at", { ascending: false })
    .limit(1);

  if (analyticsError) {
    console.error("❌ analytics取得失敗:", analyticsError.message);
  } else if (!analyticsData || analyticsData.length === 0) {
    console.log("⚠️  home_alter_judgment レコードが見つかりません");
    console.log("   （Deep Alter以外のパスで応答した可能性）");
  } else {
    const latest = analyticsData[0];
    const metadata = latest.metadata as Record<string, unknown>;
    console.log(`   Latest record: ${latest.id} (${latest.created_at})`);

    if (metadata?.derived_facts) {
      const df = metadata.derived_facts as Array<Record<string, unknown>>;
      console.log(`✅ derived_facts 記録あり (${df.length}件)`);
      for (const fact of df.slice(0, 3)) {
        console.log(`     - type: ${fact.sourceType}, axes: ${(fact.sourceAxes as string[]).join(",")}, conf: ${fact.confidence}`);
      }
    } else {
      console.log("⚠️  derived_facts フィールドなし");
      console.log("   flag OFFで応答した可能性、またはhome_alter（非Deep Alter）経路");
    }

    if (metadata?.derived_facts_summary) {
      const summary = metadata.derived_facts_summary as Record<string, number>;
      console.log(`   Summary: generated=${summary.totalGenerated}, included=${summary.totalIncluded}, axes=${summary.uniqueAxesUsed}`);
    }

    if (metadata?.axis_registry_version) {
      console.log(`   Registry version: ${metadata.axis_registry_version}`);
    }
  }

  // ── Summary ──
  console.log("\n─── E2E Test Summary ────────────────────\n");
  console.log(`API call: ${response.ok ? "PASS" : "FAIL"} (${response.status}, ${apiDuration}ms)`);

  const hasDerivedFacts = analyticsData?.[0]?.metadata &&
    (analyticsData[0].metadata as Record<string, unknown>)?.derived_facts;
  console.log(`derived_facts record: ${hasDerivedFacts ? "PASS" : "INCONCLUSIVE"}`);
  console.log();

  if (!hasDerivedFacts) {
    console.log("Note: derived_factsが記録されていない場合の考えられる原因:");
    console.log("  1. サーバ側の STARGAZER_USE_DERIVED_FACTS が false");
    console.log("  2. Home Alter経路で応答した（Deep Alterではない）");
    console.log("  3. ユーザーのStargazerデータ（axisScores等）が未登録");
    console.log("  4. analytics記録がスキップされた");
  }

  await supabase.auth.signOut();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
