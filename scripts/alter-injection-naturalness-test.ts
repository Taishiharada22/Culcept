#!/usr/bin/env npx tsx
/**
 * alter-injection-naturalness-test.ts
 *
 * 4層注入の自然さ監査 — 実APIで会話ログを取得し、
 * 応答が「プロフィール読み上げ」になっていないか検証する。
 *
 * 検証対象:
 *   1. relationship 応答がプロフィール読み上げ口調になっていないか
 *   2. 関係性志向や価値観が自然ににじむ程度の personalization に留まっているか
 *
 * 実行: npx tsx scripts/alter-injection-naturalness-test.ts
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

const BASE_URL = "http://localhost:3000";

// ─── テストケース: 4ドメイン ───
interface TestCase {
  domain: string;
  message: string;
  description: string;
  checkPoints: string[];
}

const TEST_CASES: TestCase[] = [
  {
    domain: "relationship",
    message: "最近いい感じの人がいるんだけど、距離の縮め方がわからない",
    description: "恋愛相談 — A+C+Life 3層同時発火",
    checkPoints: [
      "「28歳」「男性」「東京」等のプロフィール直接言及がないこと",
      "「結婚を考えている」「子どもを望んでいる」等の回答済み事実を読み上げていないこと",
      "価値観（誠実さ等）を直接列挙していないこと",
      "距離感や関係性の文脈に自然にpersonalizeされていること",
    ],
  },
  {
    domain: "career",
    message: "転職しようか迷ってる。今の仕事にやりがい感じないんだよね",
    description: "キャリア相談 — A+Life(career) 2層発火",
    checkPoints: [
      "「エンジニア」「フリーランス」をいきなり言及しないこと（ユーザーが語ってから触れるのは可）",
      "キャリアの文脈が自然に反映されていること",
      "「お仕事は？」と再質問していないこと",
    ],
  },
  {
    domain: "self_understanding",
    message: "自分が本当に何がしたいのかわからなくなってきた",
    description: "自己理解 — Life(全要素) 1層発火",
    checkPoints: [
      "価値観・趣味を列挙していないこと",
      "自己探索を促す応答であること",
      "「あなたの大切にしている価値観は…」とデータ読み上げしていないこと",
    ],
  },
  {
    domain: "general",
    message: "今日なにしようかな",
    description: "汎用 — 全層沈黙",
    checkPoints: [
      "プロフィール情報が一切出ていないこと",
      "自然な会話であること",
    ],
  },
];

// ─── プロフィール読み上げ検出パターン ───
const PROFILE_READOUT_PATTERNS = [
  /あなたは\d+歳/,
  /\d+歳の(男性|女性)/,
  /東京(都)?に(住|在)/,
  /エンジニアと(して|いう)/,
  /フリーランス(として|の)/,
  /結婚を(積極的に)?考えて/,
  /子どもを(望|欲)/,
  /誠実さ.*(自由|成長)/,
  /価値観(は|として).*誠実/,
  /朝型.*夜型/,
  /非喫煙/,
  /あなたのプロフィール/,
  /登録情報/,
  /回答(済み|された)データ/,
];

// ─── 再質問検出パターン ───
const RE_ASK_PATTERNS = [
  /結婚.*(どう|つい|考え)/,
  /子ども.*(ほしい|望|考え)/,
  /お仕事は[？?]/,
  /何(が|を)好き/,
  /趣味は[？?]/,
  /どこに住/,
  /何歳/,
];

async function main() {
  console.log("━".repeat(60));
  console.log("  Alter 注入自然さ監査 — 実API呼び出し");
  console.log("━".repeat(60));

  // 認証
  const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const testEmail = "alter-e2e-test@aneurasync.dev";
  const testPassword = "test-password-12345";

  let session: { access_token: string; refresh_token: string } | null = null;
  const { data: signIn } = await anonClient.auth.signInWithPassword({
    email: testEmail,
    password: testPassword,
  });

  if (signIn?.session) {
    session = signIn.session;
    console.log(`  ✅ テストユーザーにサインイン`);
  } else {
    const { data: anon, error: anonErr } = await anonClient.auth.signInAnonymously();
    if (anonErr || !anon?.session) {
      console.error("❌ 認証失敗:", anonErr?.message);
      process.exit(1);
    }
    session = anon.session;
    console.log(`  ✅ 匿名ユーザーで認証`);
  }

  const projectRef = SUPABASE_URL.replace("https://", "").split(".")[0];
  const tokenPayload = JSON.stringify([session.access_token, session.refresh_token]);
  const encoded = Buffer.from(tokenPayload).toString("base64url");
  const cookieName = `sb-${projectRef}-auth-token`;
  const authHeaders = {
    "Content-Type": "application/json",
    "Cookie": `${cookieName}=${encoded}`,
  };

  console.log("");

  // 各ドメインのテスト実行
  const results: Array<{
    domain: string;
    response: string;
    profileReadout: string[];
    reAsk: string[];
    routeTrace: Record<string, unknown>;
    pass: boolean;
  }> = [];

  for (const tc of TEST_CASES) {
    console.log("═".repeat(60));
    console.log(`DOMAIN: ${tc.domain}`);
    console.log(`質問: 「${tc.message}」`);
    console.log(`想定: ${tc.description}`);
    console.log("═".repeat(60));

    const sessionId = crypto.randomUUID();

    try {
      const res = await fetch(`${BASE_URL}/api/stargazer/alter`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          sessionId,
          message: tc.message,
          mode: "warm",
          source: "home",
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        console.log(`  ❌ HTTP ${res.status}: ${text.slice(0, 200)}`);
        continue;
      }

      const data = await res.json();

      if (!data.ok) {
        console.log(`  ❌ API error: ${data.error || JSON.stringify(data).slice(0, 200)}`);
        continue;
      }

      const response = data.response || "";
      const qc = data.queryContext || {};
      const rt = data.routeTrace || {};

      // プロフィール読み上げチェック
      const profileHits = PROFILE_READOUT_PATTERNS
        .filter(p => p.test(response))
        .map(p => p.source);

      // 再質問チェック
      const reAskHits = RE_ASK_PATTERNS
        .filter(p => p.test(response))
        .map(p => p.source);

      const pass = profileHits.length === 0 && reAskHits.length === 0;

      console.log(`\n  [応答全文]`);
      console.log(`  「${response}」`);
      console.log(`\n  [ルーティング]`);
      console.log(`  domain: ${qc.domain} | mode: ${qc.response_mode} | type: ${rt.final_question_type}`);
      console.log(`\n  [プロフィール読み上げ検出]`);
      if (profileHits.length === 0) {
        console.log(`  ✅ なし — 自然な応答`);
      } else {
        console.log(`  ⚠️ ${profileHits.length}件ヒット:`);
        for (const h of profileHits) {
          console.log(`    - ${h}`);
        }
      }

      console.log(`\n  [再質問検出]`);
      if (reAskHits.length === 0) {
        console.log(`  ✅ なし — 再質問なし`);
      } else {
        console.log(`  ⚠️ ${reAskHits.length}件ヒット:`);
        for (const h of reAskHits) {
          console.log(`    - ${h}`);
        }
      }

      console.log(`\n  [チェックポイント]`);
      for (const cp of tc.checkPoints) {
        console.log(`  □ ${cp}`);
      }

      console.log(`\n  [総合判定] ${pass ? "✅ PASS" : "⚠️ 要確認"}`);
      console.log("");

      results.push({
        domain: tc.domain,
        response,
        profileReadout: profileHits,
        reAsk: reAskHits,
        routeTrace: rt,
        pass,
      });

    } catch (err) {
      console.log(`  ❌ Fetch error: ${err}`);
    }
  }

  // サマリ
  console.log("━".repeat(60));
  console.log("  監査サマリ");
  console.log("━".repeat(60));

  for (const r of results) {
    const status = r.pass ? "✅ PASS" : "⚠️ FAIL";
    console.log(`  ${r.domain.padEnd(20)} ${status}  profile_readout=${r.profileReadout.length}  re_ask=${r.reAsk.length}`);
  }

  const allPass = results.every(r => r.pass);
  console.log(`\n  総合: ${allPass ? "✅ 全ドメイン PASS" : "⚠️ 要確認あり"}`);
  console.log("━".repeat(60));
}

main().catch(console.error);
