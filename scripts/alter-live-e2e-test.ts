#!/usr/bin/env npx tsx
/**
 * Alter ライブE2Eテスト — 実際にAPIを叩いて会話ログを取得
 *
 * 実行: npx tsx scripts/alter-live-e2e-test.ts
 *
 * 前提: localhost:3000 で dev server が起動中
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("❌ 環境変数不足: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const BASE_URL = "http://localhost:3000";

// ─── テストケース ───
interface TestCase {
  id: string;
  messages: string[];
  description: string;
}

const TEST_CASES: TestCase[] = [
  { id: "TC1", messages: ["おはよう", "何もないけどお話ししよう"], description: "挨拶→雑談" },
  { id: "TC2", messages: ["今の仕事わかる？"], description: "事実照会(work)" },
  { id: "TC3", messages: ["私の本音に気づいてる？"], description: "事実照会(self)" },
  { id: "TC4", messages: ["私には何があってる？"], description: "キャリア適性" },
  { id: "TC5", messages: ["わたしが本当に望んでいる業界って何？"], description: "業界適性" },
  { id: "TC6", messages: ["君に選んで欲しい", "逃げるな"], description: "委任→逃げ禁止" },
  { id: "TC7", messages: ["今日の後半戦、どんな感じに動けばいいかな？"], description: "DG(後半戦)" },
  { id: "TC8a", messages: ["今日は何してしようかな"], description: "DG1回目" },
  { id: "TC8b", messages: ["今日は何してしようかな"], description: "DG2回目" },
  { id: "TC8c", messages: ["今日は何してしようかな"], description: "DG3回目" },
];

// ─── メイン ───
async function main() {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  Alter ライブE2Eテスト — 実API呼び出し");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  // テスト用ユーザーの認証セッションを取得
  // まず既存のテストユーザーでサインイン試行
  const testEmail = "alter-e2e-test@aneurasync.dev";
  const testPassword = "test-password-12345";

  const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // サインイン or サインアップ
  let session: { access_token: string; refresh_token: string } | null = null;
  const { data: signIn } = await anonClient.auth.signInWithPassword({
    email: testEmail,
    password: testPassword,
  });

  if (signIn?.session) {
    session = signIn.session;
    console.log(`  ✅ テストユーザーにサインイン: ${signIn.user?.id?.slice(0, 8)}`);
  } else {
    // サインアップ
    const { data: signUp, error } = await anonClient.auth.signUp({
      email: testEmail,
      password: testPassword,
    });
    if (error || !signUp?.session) {
      console.error("❌ テストユーザー作成失敗:", error?.message);
      // 匿名認証にフォールバック
      const { data: anon, error: anonErr } = await anonClient.auth.signInAnonymously();
      if (anonErr || !anon?.session) {
        console.error("❌ 匿名認証も失敗:", anonErr?.message);
        process.exit(1);
      }
      session = anon.session;
      console.log(`  ✅ 匿名ユーザーで認証: ${anon.user?.id?.slice(0, 8)}`);
    } else {
      session = signUp.session;
      console.log(`  ✅ テストユーザー作成: ${signUp.user?.id?.slice(0, 8)}`);
    }
  }

  if (!session) {
    console.error("❌ セッション取得失敗");
    process.exit(1);
  }

  // Supabase SSR uses chunked cookies: sb-<ref>-auth-token.0, .1, etc.
  // For a single token that fits in one chunk:
  const projectRef = SUPABASE_URL.replace("https://", "").split(".")[0];
  const tokenPayload = JSON.stringify([
    session.access_token,
    session.refresh_token,
  ]);
  // Base64URL encode to match what Supabase SSR expects
  const encoded = Buffer.from(tokenPayload).toString("base64url");
  const cookieName = `sb-${projectRef}-auth-token`;

  const authHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    "Cookie": `${cookieName}=${encoded}`,
  };

  console.log("");

  // 各テストケースを実行
  const sessionId = crypto.randomUUID();

  for (const tc of TEST_CASES) {
    console.log(`  ─── ${tc.id}: ${tc.description} ───`);

    for (const msg of tc.messages) {
      try {
        const res = await fetch(`${BASE_URL}/api/stargazer/alter`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            sessionId,
            message: msg,
            mode: "warm",
            source: "home",
          }),
        });

        if (!res.ok) {
          const text = await res.text();
          console.log(`    ❌ HTTP ${res.status}: ${text.slice(0, 100)}`);
          continue;
        }

        const data = await res.json();

        if (!data.ok) {
          console.log(`    ❌ API error: ${JSON.stringify(data).slice(0, 200)}`);
          continue;
        }

        // 結果表示
        const qc = data.queryContext;
        const response = data.response?.slice(0, 120) || "(no response)";
        console.log(`    入力: 「${msg}」`);
        console.log(`    domain: ${qc?.domain ?? "?"} | mode: ${qc?.response_mode ?? "?"} | reason: ${qc?.mode_decision_reason ?? "?"}`);
        console.log(`    creepiness: ${qc?.creepiness_check ? (qc.creepiness_check.pass ? "✅ pass" : `❌ fail (${qc.creepiness_check.violation_count} violations)`) : "N/A"}`);
        console.log(`    quality: ${qc?.quality_check ? (qc.quality_check.pass ? "✅ pass" : `❌ fail (generic=${qc.quality_check.generic_response_score?.toFixed(2)})`) : "N/A"}`);
        console.log(`    応答: 「${response}${data.response?.length > 120 ? "..." : ""}」`);
        console.log("");
      } catch (err) {
        console.log(`    ❌ Fetch error: ${err}`);
      }
    }
  }

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  E2Eテスト完了");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}

main().catch(console.error);
