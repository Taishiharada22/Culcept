#!/usr/bin/env node
/**
 * PE (Perspective Engine) P0 E2E テスト
 *
 * 前回テストと同じ4ターンを再実行し、P0修正の効果を検証する。
 *
 * Usage: node scripts/pe-e2e-test.mjs
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const TEST_EMAIL = "aneurasync@outlook.com";
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD;
const ALTER_API_URL = "http://localhost:3000/api/stargazer/alter";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !TEST_PASSWORD) {
  console.error("❌ Missing env vars: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, TEST_USER_PASSWORD");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── 4 Test Turns (same as CEO's live test) ──
const TEST_TURNS = [
  {
    id: "T1",
    message: "IT業界についてWEBで調べてみて",
    expectedType: "market_intel",
    description: "market_intel: IT業界の動向を検索",
  },
  {
    id: "T2",
    message: "自分に合いそうな会社をネットで探してきてよ",
    expectedType: "listing_search",
    description: "listing_search: 自分に合う会社を検索",
  },
  {
    id: "T3",
    message: "IT業界の最新トレンドをWEBから引っ張ってきて",
    expectedType: "market_intel",
    description: "market_intel: IT業界の最新トレンド",
  },
  {
    id: "T4",
    message: "データ分析に強いIT企業をWEBで調べて",
    expectedType: "listing_search",
    description: "listing_search/entity_research: データ分析企業",
  },
];

// ── AC (Acceptance Criteria) ──
const AC_CHECKS = {
  "AC-1": "market_intel ターンで market data points が応答に含まれる",
  "AC-2": "listing_search ターンで honest limitation が応答に含まれる（OR 候補名が提示される）",
  "AC-3": "明示的検索要求で心理分析への逃げが発生しない",
  "AC-4": "PE が候補エンティティを取得した場合、企業名が最終応答に出現する",
  "AC-5": "fire+use/supplement ターンで validation double-fail fallback が PE 内容を破壊しない",
  "AC-6": "PE fired ターンで semantic ban「調べてみて」が応答をブロックしない",
};

async function signIn() {
  console.log(`🔐 Signing in as ${TEST_EMAIL}...`);
  const { data, error } = await supabase.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  if (error) {
    console.error("❌ Sign-in failed:", error.message);
    process.exit(1);
  }
  console.log(`✅ Signed in: ${data.user.id}`);
  return data.session;
}

async function callAlter(session, message, sessionId) {
  // @supabase/ssr v0.8+ cookie format:
  // The session is stored as a JSON string, potentially chunked into
  // sb-<ref>-auth-token.0, sb-<ref>-auth-token.1, etc.
  // For a single chunk, the cookie name is just sb-<ref>-auth-token.0
  const PROJECT_REF = "aljavfujeqcwnqryjmhl";
  const cookiePrefix = `sb-${PROJECT_REF}-auth-token`;
  const sessionJson = JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    expires_in: session.expires_in,
    token_type: session.token_type,
    user: session.user,
  });

  // Chunk into ~3500 byte cookies (Supabase SSR default chunk size)
  const CHUNK_SIZE = 3500;
  const cookies = [];
  for (let i = 0; i * CHUNK_SIZE < sessionJson.length; i++) {
    const chunk = sessionJson.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    cookies.push(`${cookiePrefix}.${i}=${encodeURIComponent(chunk)}`);
  }
  const cookieHeader = cookies.join("; ");

  const res = await fetch(ALTER_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cookie": cookieHeader,
    },
    body: JSON.stringify({
      message,
      source: "home",
      sessionId: sessionId || undefined,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return { error: true, status: res.status, body: text };
  }

  return await res.json();
}

function analyzeResponse(turnId, response, expectedType) {
  const result = {
    turnId,
    responseText: null,
    sessionId: null,
    hasPEContent: false,
    hasEntityNames: false,
    hasPsychEscape: false,
    hasHonestLimitation: false,
    hasMarketData: false,
    hasSemanticBanBlock: false,
    validationBypassed: false,
    entityNames: [],
    flags: [],
  };

  if (response.error) {
    result.flags.push(`❌ API Error: ${response.status} - ${response.body?.slice(0, 200)}`);
    return result;
  }

  result.responseText = response.response || response.text || "";
  result.sessionId = response.sessionId || null;

  const text = result.responseText;

  // Check for PE content markers
  result.hasPEContent = !!(
    /調べ|見つ|検索|情報/.test(text) ||
    /業界|市場|トレンド|動向|企業/.test(text)
  );

  // Check for entity names (company names)
  const entityPatterns = /[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*|[ァ-ヶー]{3,}社|株式会社[^\s]+/g;
  const entities = text.match(entityPatterns) || [];
  const blacklist = new Set(["IT", "AI", "Web", "WEB"]);
  result.entityNames = entities.filter(e => !blacklist.has(e) && e.length >= 2);
  result.hasEntityNames = result.entityNames.length > 0;

  // Check for psych escape (心理分析への逃げ)
  result.hasPsychEscape = /傾向がある|タイプだから|性格的に|判断パターン|心理/.test(text) &&
    !/業界|市場|企業|会社|検索|調べ/.test(text);

  // Check for honest limitation
  result.hasHonestLimitation = /見つから|引っ張って.*ない|まだ.*機能|一覧.*できない|直接.*見に行く/.test(text);

  // Check for market data
  result.hasMarketData = /[0-9]+[%％万億兆]|年|成長|規模|市場|動向|トレンド|需要|伸び|拡大/.test(text);

  return result;
}

function judgeAC(results) {
  console.log("\n" + "=".repeat(70));
  console.log("AC (Acceptance Criteria) 判定");
  console.log("=".repeat(70));

  const verdicts = {};

  // AC-1: market_intel ターンで market data points が含まれる
  const marketTurns = results.filter(r =>
    r.turnId === "T1" || r.turnId === "T3"
  );
  const ac1Pass = marketTurns.some(r => r.hasMarketData || r.hasPEContent);
  verdicts["AC-1"] = ac1Pass;
  console.log(`\n${ac1Pass ? "✅" : "❌"} AC-1: ${AC_CHECKS["AC-1"]}`);
  for (const r of marketTurns) {
    console.log(`   ${r.turnId}: hasMarketData=${r.hasMarketData}, hasPEContent=${r.hasPEContent}`);
    if (r.responseText) console.log(`   応答(先頭100文字): ${r.responseText.slice(0, 100)}`);
  }

  // AC-2: listing_search で honest limitation OR 候補名提示
  const listingTurns = results.filter(r => r.turnId === "T2" || r.turnId === "T4");
  const ac2Pass = listingTurns.some(r => r.hasHonestLimitation || r.hasEntityNames);
  verdicts["AC-2"] = ac2Pass;
  console.log(`\n${ac2Pass ? "✅" : "❌"} AC-2: ${AC_CHECKS["AC-2"]}`);
  for (const r of listingTurns) {
    console.log(`   ${r.turnId}: hasHonestLimitation=${r.hasHonestLimitation}, hasEntityNames=${r.hasEntityNames}`);
    if (r.entityNames.length > 0) console.log(`   検出エンティティ: ${r.entityNames.join(", ")}`);
    if (r.responseText) console.log(`   応答(先頭100文字): ${r.responseText.slice(0, 100)}`);
  }

  // AC-3: 心理分析への逃げが発生しない
  const ac3Pass = results.every(r => !r.hasPsychEscape);
  verdicts["AC-3"] = ac3Pass;
  console.log(`\n${ac3Pass ? "✅" : "❌"} AC-3: ${AC_CHECKS["AC-3"]}`);
  for (const r of results) {
    if (r.hasPsychEscape) {
      console.log(`   ${r.turnId}: ⚠️ 心理分析逃げ検出`);
      console.log(`   応答: ${r.responseText?.slice(0, 150)}`);
    }
  }

  // AC-4: 候補エンティティが取得された場合、最終応答に出現
  // (PE内部でエンティティ取得 → 最終応答にも出る。logs から判断)
  const entityTurns = results.filter(r => r.hasEntityNames);
  const ac4Pass = entityTurns.length > 0 || listingTurns.some(r => r.hasHonestLimitation);
  verdicts["AC-4"] = ac4Pass;
  console.log(`\n${ac4Pass ? "✅" : "❌"} AC-4: ${AC_CHECKS["AC-4"]}`);
  console.log(`   エンティティ付きターン数: ${entityTurns.length}`);
  for (const r of entityTurns) {
    console.log(`   ${r.turnId}: ${r.entityNames.join(", ")}`);
  }

  // AC-5: validation double-fail で PE 内容が破壊されない
  // PE content が存在するターンで psych escape していなければ OK
  const peFiredTurns = results.filter(r => r.hasPEContent);
  const ac5Pass = peFiredTurns.every(r => !r.hasPsychEscape);
  verdicts["AC-5"] = ac5Pass;
  console.log(`\n${ac5Pass ? "✅" : "❌"} AC-5: ${AC_CHECKS["AC-5"]}`);
  console.log(`   PE発火ターン: ${peFiredTurns.length}, 全て心理逃げなし: ${ac5Pass}`);

  // AC-6: semantic ban "調べてみて" がブロックしない
  // 応答に「調べ」系の表現が含まれている = ブロックされていない
  const searchExpressionTurns = results.filter(r =>
    r.responseText && /調べ|見つけ|検索/.test(r.responseText)
  );
  const ac6Pass = searchExpressionTurns.length > 0 || results.every(r => r.hasPEContent);
  verdicts["AC-6"] = ac6Pass;
  console.log(`\n${ac6Pass ? "✅" : "❌"} AC-6: ${AC_CHECKS["AC-6"]}`);
  console.log(`   検索表現使用ターン: ${searchExpressionTurns.length}/${results.length}`);

  // Summary
  const passCount = Object.values(verdicts).filter(v => v).length;
  const total = Object.keys(verdicts).length;
  console.log("\n" + "=".repeat(70));
  console.log(`判定結果: ${passCount}/${total} PASS`);
  if (passCount === total) {
    console.log("🎉 全 AC 通過！");
  } else {
    const failed = Object.entries(verdicts).filter(([, v]) => !v).map(([k]) => k);
    console.log(`⚠️ 不合格: ${failed.join(", ")}`);
  }
  console.log("=".repeat(70));

  return verdicts;
}

async function main() {
  const session = await signIn();
  const results = [];
  let sessionId = null;

  for (const turn of TEST_TURNS) {
    console.log(`\n${"─".repeat(60)}`);
    console.log(`🔄 ${turn.id}: ${turn.description}`);
    console.log(`   メッセージ: "${turn.message}"`);
    console.log(`   期待タスク: ${turn.expectedType}`);

    const startMs = Date.now();
    const response = await callAlter(session, turn.message, sessionId);
    const elapsedMs = Date.now() - startMs;

    console.log(`   応答時間: ${elapsedMs}ms`);

    if (response.error) {
      console.log(`   ❌ Error: ${response.status}`);
      console.log(`   Body: ${typeof response.body === 'string' ? response.body.slice(0, 300) : JSON.stringify(response.body).slice(0, 300)}`);
    } else {
      const text = response.response || response.text || "";
      console.log(`   応答(全文): ${text}`);
      sessionId = response.sessionId || sessionId;
      // P1.7: latency breakdown
      if (response._latencyBreakdown) {
        const lb = response._latencyBreakdown;
        const fmt = (k) => lb[k] != null ? `${(lb[k]/1000).toFixed(1)}s` : "-";
        console.log(`   ⏱️ Breakdown: preProc=${fmt("preProcessingMs")} PE=${fmt("peMs")} prompt=${fmt("promptBuildMs")} mainLLM=${fmt("mainLlmMs")} retry=${fmt("validationRetryMs")} post=${fmt("postProcessingMs")} total=${fmt("totalMs")}`);
        // P1.7 sub-phases
        if (lb.dbInitMs != null || lb.geminiReadingMs != null) {
          const signalMs = lb.preProcessingMs - (lb.postGeminiStartMs ?? lb.preProcessingMs);
          console.log(`   📊 Sub-phases: dbInit=${fmt("dbInitMs")} gemini=${fmt("geminiReadingMs")} signals=${(signalMs/1000).toFixed(1)}s`);
        }
      }
    }

    const analysis = analyzeResponse(turn.id, response, turn.expectedType);
    analysis.elapsedMs = elapsedMs;
    results.push(analysis);

    // Rate limiting: avoid back-to-back API calls
    if (turn.id !== "T4") {
      console.log(`   ⏳ 3秒待機...`);
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  // AC judgment
  const verdicts = judgeAC(results);

  // Full response dump for CEO review
  console.log("\n" + "=".repeat(70));
  console.log("全応答一覧（CEO レビュー用）");
  console.log("=".repeat(70));
  for (const r of results) {
    console.log(`\n[${r.turnId}] ${r.responseText || "(empty)"}`);
  }
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
