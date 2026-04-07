#!/usr/bin/env npx tsx
/**
 * alter-naturalness-e2e.ts
 *
 * テストユーザー作成 → データ投入 → Alter API 4ドメイン呼び出し → 自然さ監査
 * 一気通貫スクリプト。本番ユーザーには一切触れない。
 *
 * 実行: export PATH="$HOME/.local/share/mise/shims:$PATH" && set -a && source .env.local && set +a && npx tsx scripts/alter-naturalness-e2e.ts
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const BASE_URL = "http://localhost:3000";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
  console.error("❌ 環境変数不足");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const TEST_EMAIL = "alter-layer-test@aneurasync.dev";
const TEST_PASSWORD = "layer-test-pw-2026!";

// ─── ダミー軸スコア（実際のTRAIT_AXES IDに準拠） ───
const DUMMY_AXIS_SCORES: Record<string, number> = {
  introvert_vs_extrovert: 0.3,
  individual_vs_social: -0.2,
  cautious_vs_bold: 0.15,
  analytical_vs_intuitive: -0.3,
  change_embrace_vs_resist: 0.25,
  plan_vs_spontaneous: -0.1,
  tradition_vs_novelty: 0.2,
  independence_vs_harmony: 0.4,
  direct_vs_diplomatic: -0.15,
  stress_isolation_vs_social: 0.1,
  function_vs_expression: -0.25,
  minimal_vs_maximal: 0.35,
  perfectionist_vs_pragmatic: -0.2,
  quality_vs_quantity: 0.45,
  classic_vs_trendy: -0.1,
  intimacy_pace: 0.2,
  reassurance_need: -0.3,
  emotional_variability: 0.15,
  social_initiative: -0.25,
  boundary_awareness: 0.3,
};

// ─── テストケース ───
const TEST_CASES = [
  {
    domain: "relationship",
    message: "最近いい感じの人がいるんだけど、距離の縮め方がわからない",
    description: "恋愛相談 — A+C+Life 3層発火",
  },
  {
    domain: "career",
    message: "転職しようか迷ってる。今の仕事にやりがい感じないんだよね",
    description: "キャリア相談 — A+Life(career) 2層発火",
  },
  {
    domain: "self_understanding",
    message: "自分が本当に何がしたいのかわからなくなってきた",
    description: "自己理解 — Life(全要素) 発火",
  },
  {
    domain: "general",
    message: "今日なにしようかな",
    description: "汎用 — 全層沈黙",
  },
];

// ─── プロフィール読み上げ検出 ───
const PROFILE_READOUT_PATTERNS = [
  { pattern: /あなたは\d+歳/, label: "年齢直接言及" },
  { pattern: /\d+歳の(男性|女性)/, label: "年齢+性別プロフィール文" },
  { pattern: /東京(都)?に(住|在)/, label: "居住地直接言及" },
  { pattern: /エンジニアと(して|いう)/, label: "職業直接言及(エンジニア)" },
  { pattern: /フリーランス(として|の|で)/, label: "職業直接言及(フリーランス)" },
  { pattern: /結婚を(積極的に)?考えて/, label: "結婚意向読み上げ" },
  { pattern: /子どもを(望|欲)/, label: "子ども意向読み上げ" },
  { pattern: /誠実さ.*(自由|成長)/, label: "価値観列挙" },
  { pattern: /価値観(は|として).*誠実/, label: "価値観ラベル貼り" },
  { pattern: /あなたのプロフィール/, label: "プロフィール言及" },
  { pattern: /登録(情報|データ)/, label: "登録情報言及" },
];

// ─── 再質問検出 ───
const RE_ASK_PATTERNS = [
  { pattern: /結婚.*(どう|つい|考え)[？?]/, label: "結婚観の再質問" },
  { pattern: /子ども.*(ほしい|望|考え)[？?]/, label: "子ども意向の再質問" },
  { pattern: /お仕事は[？?]/, label: "仕事の再質問" },
  { pattern: /何(が|を)好き[？?]/, label: "好きなものの再質問" },
  { pattern: /趣味は[？?]/, label: "趣味の再質問" },
  { pattern: /どこに住/, label: "居住地の再質問" },
];

// ─── Layer attribution 検出 ───
const LAYER_SIGNALS = {
  A_baseline: [
    { pattern: /年(齢|代)|世代|若/, label: "A:lifeStage影響" },
    { pattern: /男(性)?|女(性)?/, label: "A:gender影響" },
    { pattern: /東京|都内|都会|地方/, label: "A:area影響" },
  ],
  C_relationship: [
    { pattern: /結婚|パートナー|将来/, label: "C:relationshipIntent影響" },
    { pattern: /子ども|家族/, label: "C:parentingOpenness影響" },
    { pattern: /朝型|夜型|リズム/, label: "C:lifestyleAlignment影響" },
  ],
  Life_layer: [
    { pattern: /誠実|自由|成長/, label: "Life:values影響" },
    { pattern: /音楽|旅行|読書/, label: "Life:passions影響" },
    { pattern: /エンジニア|フリーランス|仕事|キャリア/, label: "Life:career影響" },
  ],
};

async function main() {
  console.log("━".repeat(70));
  console.log("  Alter 4層注入 自然さ監査 — E2E");
  console.log("━".repeat(70));

  // ════════════════════════════════════════════
  // Step 1: テストユーザー作成
  // ════════════════════════════════════════════
  console.log("\n[Step 1] テストユーザー作成...");

  // 既存ユーザーの削除（クリーンスタート）
  const { data: existingUsers } = await admin.auth.admin.listUsers();
  const existing = existingUsers?.users?.find(u => u.email === TEST_EMAIL);
  if (existing) {
    // 関連データを削除
    await admin.from("life_profile_entries").delete().eq("user_id", existing.id);
    await admin.from("stargazer_resolved_types").delete().eq("user_id", existing.id);
    await admin.from("stargazer_profiles").delete().eq("user_id", existing.id);
    await admin.from("rendezvous_profiles").delete().eq("user_id", existing.id);
    await admin.from("profiles").delete().eq("id", existing.id);
    await admin.from("stargazer_alter_dialogues").delete().eq("user_id", existing.id);
    await admin.auth.admin.deleteUser(existing.id);
    console.log(`  旧テストユーザー削除: ${existing.id.slice(0, 8)}`);
  }

  // 新規作成
  const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
  });

  if (createErr || !newUser?.user) {
    console.error("❌ ユーザー作成失敗:", createErr?.message);
    process.exit(1);
  }
  const userId = newUser.user.id;
  console.log(`  ✅ テストユーザー作成: ${userId.slice(0, 8)}`);

  // ════════════════════════════════════════════
  // Step 2: データ投入
  // ════════════════════════════════════════════
  console.log("\n[Step 2] テストデータ投入...");

  // A baseline: profiles
  await admin.from("profiles").upsert({
    id: userId,
    gender: "male",
    date_of_birth: "1998-03-20",
    prefecture: "東京都",
    city: "渋谷区",
    baseline_completed_at: new Date().toISOString(),
  });
  console.log("  ✅ A baseline (profiles): gender=male, DOB=1998-03-20, prefecture=東京都");

  // B baseline: rendezvous_profiles
  await admin.from("rendezvous_profiles").upsert({
    user_id: userId,
    enabled_categories: ["romantic", "friendship"],
    profile_details: {
      marriageIntent: "いい人がいれば",
      childrenPreference: "未定",
      smokingStatus: "non_smoker",
      lifestyleMorningNight: 45,
    },
    is_enabled: true,
  });
  console.log("  ✅ B baseline (rendezvous_profiles): marriageIntent=いい人がいれば, children=未定");

  // Life layer: life_profile_entries
  const now = new Date().toISOString();
  const lifeEntries = [
    { id: `lp_test_v1`, category: "values", title: "誠実さ" },
    { id: `lp_test_v2`, category: "values", title: "自由" },
    { id: `lp_test_v3`, category: "values", title: "成長" },
    { id: `lp_test_p1`, category: "passions", title: "音楽" },
    { id: `lp_test_p2`, category: "passions", title: "旅行" },
    { id: `lp_test_p3`, category: "passions", title: "読書" },
    { id: `lp_test_c1`, category: "career", title: "エンジニア" },
    { id: `lp_test_c2`, category: "career", title: "フリーランス" },
  ];
  await admin.from("life_profile_entries").upsert(
    lifeEntries.map(e => ({
      ...e,
      user_id: userId,
      active: true,
      depth_responses: [],
      impact: 3,
      created_at: now,
      updated_at: now,
    }))
  );
  console.log("  ✅ Life layer (life_profile_entries): values×3, passions×3, career×2");

  // Stargazer データ: axis_scores（Alter API が hasEvidence を通過するために必須）
  await admin.from("stargazer_resolved_types").upsert({
    user_id: userId,
    axis_scores: DUMMY_AXIS_SCORES,
    resolved_at: now,
  });
  await admin.from("stargazer_profiles").upsert({
    user_id: userId,
    total_sessions: 5,
    dimensions: DUMMY_AXIS_SCORES,
  });
  console.log("  ✅ Stargazer (axis_scores + profiles): 20軸のダミースコア投入");

  // ════════════════════════════════════════════
  // Step 3: 認証セッション取得
  // ════════════════════════════════════════════
  console.log("\n[Step 3] テストユーザーでサインイン...");

  const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: signIn, error: signInErr } = await anonClient.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  if (signInErr || !signIn?.session) {
    console.error("❌ サインイン失敗:", signInErr?.message);
    process.exit(1);
  }
  console.log("  ✅ サインイン成功");

  const projectRef = SUPABASE_URL.replace("https://", "").split(".")[0];
  // @supabase/ssr createServerClient expects cookie value:
  //   "base64-" + base64url(JSON.stringify(session))
  const sessionJson = JSON.stringify(signIn.session);
  const encoded = "base64-" + Buffer.from(sessionJson).toString("base64url");
  const cookieName = `sb-${projectRef}-auth-token`;
  const authHeaders = {
    "Content-Type": "application/json",
    "Cookie": `${cookieName}=${encoded}`,
  };

  // ════════════════════════════════════════════
  // Step 4: 4ドメインで Alter API 呼び出し
  // ════════════════════════════════════════════
  console.log("\n[Step 4] Alter API 4ドメイン呼び出し + 監査...\n");

  const results: Array<{
    domain: string;
    response: string;
    detectedDomain: string;
    responseMode: string;
    profileReadouts: string[];
    reAsks: string[];
    layerAttribution: Record<string, string[]>;
    pass: boolean;
  }> = [];

  for (const tc of TEST_CASES) {
    console.log("═".repeat(70));
    console.log(`DOMAIN: ${tc.domain}`);
    console.log(`質問: 「${tc.message}」`);
    console.log(`想定: ${tc.description}`);
    console.log("═".repeat(70));

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
        console.log(`\n  ❌ HTTP ${res.status}: ${text.slice(0, 300)}`);
        continue;
      }

      const data = await res.json();
      if (!data.ok) {
        console.log(`\n  ❌ API error: ${data.error || JSON.stringify(data).slice(0, 300)}`);
        continue;
      }

      const response: string = data.response || "";
      const qc = data.queryContext || {};

      // ── 応答全文 ──
      console.log(`\n  [応答全文]`);
      console.log(`  「${response}」`);

      console.log(`\n  [ルーティング] domain=${qc.domain} | mode=${qc.response_mode}`);

      // ── プロフィール読み上げ検出 ──
      const profileHits = PROFILE_READOUT_PATTERNS
        .filter(p => p.pattern.test(response))
        .map(p => p.label);

      console.log(`\n  [プロフィール読み上げ検出]`);
      if (profileHits.length === 0) {
        console.log(`  ✅ なし`);
      } else {
        for (const h of profileHits) console.log(`  ⚠️ ${h}`);
      }

      // ── 再質問検出 ──
      const reAskHits = RE_ASK_PATTERNS
        .filter(p => p.pattern.test(response))
        .map(p => p.label);

      console.log(`\n  [再質問検出]`);
      if (reAskHits.length === 0) {
        console.log(`  ✅ なし`);
      } else {
        for (const h of reAskHits) console.log(`  ⚠️ ${h}`);
      }

      // ── Layer attribution ──
      const attribution: Record<string, string[]> = {};
      for (const [layer, signals] of Object.entries(LAYER_SIGNALS)) {
        const hits = signals.filter(s => s.pattern.test(response)).map(s => s.label);
        if (hits.length > 0) attribution[layer] = hits;
      }

      console.log(`\n  [Layer attribution — どの文が何層の影響か]`);
      if (Object.keys(attribution).length === 0) {
        console.log(`  ⬜ 検出なし（注入データが応答表面に現れていない）`);
      } else {
        for (const [layer, hits] of Object.entries(attribution)) {
          for (const h of hits) console.log(`  📎 ${layer}: ${h}`);
        }
      }

      const pass = profileHits.length === 0 && reAskHits.length === 0;
      console.log(`\n  [判定] ${pass ? "✅ PASS" : "⚠️ 要確認"}\n`);

      results.push({
        domain: tc.domain,
        response,
        detectedDomain: qc.domain || "?",
        responseMode: qc.response_mode || "?",
        profileReadouts: profileHits,
        reAsks: reAskHits,
        layerAttribution: attribution,
        pass,
      });

    } catch (err) {
      console.log(`\n  ❌ Fetch error: ${err}\n`);
    }
  }

  // ════════════════════════════════════════════
  // Step 5: 監査サマリ
  // ════════════════════════════════════════════
  console.log("━".repeat(70));
  console.log("  監査サマリ");
  console.log("━".repeat(70));
  console.log("");

  console.log("  ドメイン              判定    profile  reask  layers");
  console.log("  " + "─".repeat(60));
  for (const r of results) {
    const status = r.pass ? "✅ PASS" : "⚠️ FAIL";
    const layers = Object.keys(r.layerAttribution).join("+") || "none";
    console.log(
      `  ${r.domain.padEnd(20)} ${status}   ${String(r.profileReadouts.length).padEnd(8)} ${String(r.reAsks.length).padEnd(6)} ${layers}`
    );
  }

  const allPass = results.length > 0 && results.every(r => r.pass);
  console.log(`\n  総合: ${allPass ? "✅ 全ドメイン PASS" : results.length === 0 ? "❌ 結果なし" : "⚠️ 要確認あり"}`);

  // ════════════════════════════════════════════
  // Step 6: テストユーザー掃除（任意）
  // ════════════════════════════════════════════
  // テストユーザーは残しておく（再テスト用）
  console.log(`\n  テストユーザー (${TEST_EMAIL}) は残置。再テスト可能。`);
  console.log("━".repeat(70));
}

main().catch(console.error);
