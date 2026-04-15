#!/usr/bin/env node
/**
 * PE P1.8 Baseline Benchmark
 *
 * 4系統×3ケース = 12ケース。
 * モード:
 *   --isolated   各ケースを独立セッションで実行（デフォルト）
 *   --shared     全ケースを同一セッションで連続実行（文脈汚染ありベンチ）
 *
 * 結果をJSONファイルに保存し、中央値・p90・失敗率を表示。
 *
 * Usage: node scripts/pe-p18-baseline.mjs [--isolated|--shared]
 */

import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync } from "fs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const TEST_EMAIL = "aneurasync@outlook.com";
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD;
const ALTER_API_URL = "http://localhost:3000/api/stargazer/alter";

const MODE = process.argv.includes("--shared") ? "shared" : "isolated";

// --case C3 or --case C1,C2,C3 で特定ケースのみ実行
const caseArg = process.argv.find((_, i, a) => a[i - 1] === "--case");
const CASE_FILTER = caseArg ? new Set(caseArg.split(",").map(s => s.trim())) : null;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !TEST_PASSWORD) {
  console.error("❌ Missing env vars: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, TEST_USER_PASSWORD");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── 12 Test Cases: 4系統×3ケース ──
const TEST_CASES = [
  // ━━ A: market_intel（3ケース） ━━
  {
    id: "A1",
    category: "market_intel",
    message: "IT業界の最新トレンドをWEBで調べて",
    description: "market_intel: IT業界トレンド（明示的）",
    evaluationFocus: "市場データの具体性、数値の有無",
  },
  {
    id: "A2",
    category: "market_intel",
    message: "AIスタートアップの資金調達状況を調べてきて",
    description: "market_intel: AIスタートアップ資金調達（明示的・ニッチ）",
    evaluationFocus: "具体的な企業名・金額の有無",
  },
  {
    id: "A3",
    category: "market_intel",
    message: "リモートワークの普及率って今どれくらいなのか調べてみて",
    description: "market_intel: リモートワーク統計（明示的・統計要求）",
    evaluationFocus: "統計データ・数値の具体性",
  },

  // ━━ B: listing_search（3ケース） ━━
  {
    id: "B1",
    category: "listing_search",
    message: "自分に合いそうなIT企業をWEBで探してきて",
    description: "listing_search: 自分に合うIT企業（明示的・適性依存）",
    evaluationFocus: "候補が「この人向き」か、理由の納得感",
  },
  {
    id: "B2",
    category: "listing_search",
    message: "データ分析に強いIT企業をWEBで調べて",
    description: "listing_search: データ分析企業（明示的・スキル指定）",
    evaluationFocus: "データ分析との一致度、企業名の妥当性",
  },
  {
    id: "B3",
    category: "listing_search",
    message: "少人数でリモートOKのスタートアップをネットで調べてみて",
    description: "listing_search: 働き方条件指定（明示的・条件具体）",
    evaluationFocus: "条件（少人数・リモート）との一致度",
  },

  // ━━ C: comparison（3ケース） ━━
  {
    id: "C1",
    category: "comparison",
    message: "サイバーエージェントとマクロミルならどっちが自分に合う？調べてみて",
    description: "comparison: 2社比較（明示的・適性判断要求）",
    evaluationFocus: "比較軸の妥当性、パーソナリティとの接続",
  },
  {
    id: "C2",
    category: "comparison",
    message: "PythonとRならデータ分析にはどっちがいい？ネットで調べて",
    description: "comparison: 技術比較（明示的・スキル選択）",
    evaluationFocus: "技術的正確性、ユーザー適性との接続",
  },
  {
    id: "C3",
    category: "comparison",
    message: "フリーランスと正社員、自分にはどっちが合うかな？調べてみて",
    description: "comparison: キャリア形態比較（明示的・ライフスタイル判断）",
    evaluationFocus: "パーソナリティとの接続、具体的根拠",
  },

  // ━━ L1: Chained Exploration 発火検証ケース（4ケース） ━━
  // L0 品質が意図的に低くなるシナリオで L1 proceed=true を狙う
  {
    id: "L1A",
    category: "l1_comparison",
    message: "NUROとeo光ってどっちがいい？調べて",
    description: "L1: ニッチ比較（片側情報薄）",
    evaluationFocus: "L1発火有無、stance diversity 改善、比較軸の補強",
  },
  {
    id: "L1B",
    category: "l1_comparison",
    message: "NotionとObsidian、自分にはどっちが合う？調べて",
    description: "L1: ツール比較（一般的だがstance偏りやすい）",
    evaluationFocus: "L1発火有無、stance diversity 改善",
  },
  {
    id: "L1C",
    category: "l1_market_intel",
    message: "地方移住して転職する流れって今どうなってる？調べてみて",
    description: "L1: ニッチ市場（数値が薄い）",
    evaluationFocus: "L1発火有無、数値データの補強",
  },
  {
    id: "L1D",
    category: "l1_listing_search",
    message: "自分に合うBtoB SaaS企業をネットで探してきて",
    description: "L1: ニッチリスト（entity 解決困難）",
    evaluationFocus: "L1発火有無、entity 補強",
  },

  // ━━ D: 曖昧な explicit ask（3ケース） ━━
  {
    id: "D1",
    category: "ambiguous_explicit",
    message: "なんかいい仕事ないかなぁ、ちょっと調べてみてよ",
    description: "曖昧explicit: 漠然とした仕事探し",
    evaluationFocus: "曖昧さへの対応、clarifyか直答か",
  },
  {
    id: "D2",
    category: "ambiguous_explicit",
    message: "最近面白い会社とかある？ネットで見てきて",
    description: "曖昧explicit: 面白い会社（基準が曖昧）",
    evaluationFocus: "「面白い」の解釈がユーザーに合っているか",
  },
  {
    id: "D3",
    category: "ambiguous_explicit",
    message: "転職するならどういう方向がいいかWEBで調べて",
    description: "曖昧explicit: 転職方向性（広範・適性依存）",
    evaluationFocus: "方向性提案がパーソナリティに基づいているか",
  },
];

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

function buildCookieHeader(session) {
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

  const CHUNK_SIZE = 3500;
  const cookies = [];
  for (let i = 0; i * CHUNK_SIZE < sessionJson.length; i++) {
    const chunk = sessionJson.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    cookies.push(`${cookiePrefix}.${i}=${encodeURIComponent(chunk)}`);
  }
  return cookies.join("; ");
}

async function callAlter(cookieHeader, message, sessionId) {
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

function extractEntities(text) {
  const all = new Set();
  const blacklist = new Set([
    "IT", "AI", "Web", "WEB", "OK", "DX", "SaaS", "Python", "React", "IoT",
    "AWS", "HERP", "Career", "Slack", "Zoom",
  ]);

  const kabuMatches = text.match(/株式会社[^\s、。,.:：（）()]+/g) || [];
  for (const m of kabuMatches) all.add(m);

  const engMatches = text.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+/g) || [];
  for (const m of engMatches) {
    if (!blacklist.has(m) && m.length >= 4) all.add(m);
  }

  const quoteMatches = text.match(/「([^」]{2,20})」/g) || [];
  for (const m of quoteMatches) {
    const clean = m.replace(/^「|」$/g, "");
    if (/[てるいすよ]$/.test(clean)) continue;
    if (/^[\u3040-\u309F]+$/.test(clean)) continue;
    if (clean.length < 3) continue;
    all.add(clean);
  }

  return [...all].filter(e => !blacklist.has(e));
}

// ── 統計ヘルパー ──
function median(arr) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function p90(arr) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil(sorted.length * 0.9) - 1;
  return sorted[Math.min(idx, sorted.length - 1)];
}

async function main() {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`PE P1.8 Benchmark — mode: ${MODE}`);
  console.log(`${"=".repeat(70)}\n`);

  const session = await signIn();
  const cookieHeader = buildCookieHeader(session);
  const results = [];
  let sharedSessionId = null;

  const filteredCases = CASE_FILTER
    ? TEST_CASES.filter(tc => CASE_FILTER.has(tc.id))
    : TEST_CASES;

  if (CASE_FILTER) {
    console.log(`🎯 Case filter: ${[...CASE_FILTER].join(", ")} (${filteredCases.length} cases)`);
  }

  for (let i = 0; i < filteredCases.length; i++) {
    const tc = filteredCases[i];
    console.log(`\n${"─".repeat(60)}`);
    console.log(`[${i + 1}/${filteredCases.length}] ${tc.id}: ${tc.description}`);
    console.log(`   メッセージ: "${tc.message}"`);
    console.log(`   モード: ${MODE === "isolated" ? "独立セッション" : "共有セッション"}`);

    // isolated: sessionId=undefined で毎回新規セッション
    // shared: 前回の sessionId を引き継ぐ
    const sessionIdForCall = MODE === "isolated" ? undefined : sharedSessionId;

    const startMs = Date.now();
    const response = await callAlter(cookieHeader, tc.message, sessionIdForCall);
    const elapsedMs = Date.now() - startMs;

    const result = {
      id: tc.id,
      category: tc.category,
      message: tc.message,
      description: tc.description,
      evaluationFocus: tc.evaluationFocus,
      mode: MODE,
      elapsedMs,
      responseText: null,
      latencyBreakdown: null,
      entities: [],
      hasError: false,
      ranking: {
        candidatesFit: null,
        workStyleFit: null,
        industryFit: null,
        reasonCredibility: null,
        notes: "",
      },
    };

    if (response.error) {
      console.log(`   ❌ Error: ${response.status}`);
      result.hasError = true;
    } else {
      const text = response.response || response.text || "";
      result.responseText = text;
      result.latencyBreakdown = response._latencyBreakdown || null;
      result.entities = extractEntities(text);

      if (MODE === "shared") {
        sharedSessionId = response.sessionId || sharedSessionId;
      }

      console.log(`   応答時間: ${elapsedMs}ms`);
      if (response._latencyBreakdown) {
        const lb = response._latencyBreakdown;
        const fmt = (k) => lb[k] != null ? `${(lb[k] / 1000).toFixed(1)}s` : "-";
        console.log(`   ⏱️ preProc=${fmt("preProcessingMs")} PE=${fmt("peMs")} mainLLM=${fmt("mainLlmMs")} total=${fmt("totalMs")}`);
        // S1: PE内部breakdown
        if (lb.peQueryGenMs != null) {
          console.log(`   🔬 PE内訳: queryGen=${fmt("peQueryGenMs")} search=${fmt("peSearchMs")} classify=${fmt("peClassifyMs")} qGate=${fmt("peQualityGateMs")} pBuild=${fmt("pePromptBuildMs")}`);
        }
        // L1: Chained Exploration breakdown
        if (lb.peL1) {
          const l1 = lb.peL1;
          if (l1.fired) {
            console.log(`   🔗 L1: fired=${l1.fired} reason=${l1.reason} queryGen=${(l1.queryGenMs/1000).toFixed(1)}s search=${(l1.searchMs/1000).toFixed(1)}s classify=${(l1.classifyMs/1000).toFixed(1)}s total=${(l1.totalMs/1000).toFixed(1)}s frags=${l1.fragmentsBefore}→${l1.fragmentsAfter}`);
            if (l1.queriesSent?.length > 0) {
              console.log(`   🔗 L1 queries: ${l1.queriesSent.join(" | ")}`);
            }
          } else {
            console.log(`   🔗 L1: not fired (${l1.reason})`);
          }
        }
        // S3: プロンプトサイズ追跡
        if (lb.mainPromptChars != null) {
          console.log(`   📏 プロンプト: ${(lb.mainPromptChars / 1000).toFixed(1)}K chars`);
        }
      }
      console.log(`   エンティティ: ${result.entities.length > 0 ? result.entities.join(", ") : "(なし)"}`);
      console.log(`   応答(先頭150文字): ${text.slice(0, 150)}`);
    }

    results.push(result);

    // Rate limiting
    if (i < TEST_CASES.length - 1) {
      const wait = 3000;
      console.log(`   ⏳ ${wait / 1000}秒待機...`);
      await new Promise(r => setTimeout(r, wait));
    }
  }

  // ── サマリー ──
  console.log("\n" + "=".repeat(70));
  console.log(`P1.8 Benchmark Summary — mode: ${MODE}`);
  console.log("=".repeat(70));

  const categories = ["market_intel", "listing_search", "comparison", "ambiguous_explicit"];
  for (const cat of categories) {
    const catResults = results.filter(r => r.category === cat);
    const latencies = catResults.filter(r => !r.hasError).map(r => r.elapsedMs);
    const entityCount = catResults.reduce((s, r) => s + r.entities.length, 0);
    const errorCount = catResults.filter(r => r.hasError).length;
    const failureRate = ((errorCount / catResults.length) * 100).toFixed(0);

    console.log(`\n📊 ${cat}:`);
    console.log(`   median=${Math.round(median(latencies))}ms, p90=${Math.round(p90(latencies))}ms, entities=${entityCount}, errors=${errorCount}/${catResults.length} (${failureRate}%)`);
    for (const r of catResults) {
      const entityStr = r.entities.length > 0 ? r.entities.slice(0, 3).join(", ") : "(なし)";
      console.log(`   ${r.id}: ${r.elapsedMs}ms | entities=[${entityStr}] | ${r.hasError ? "❌ ERROR" : "✅ OK"}`);
    }
  }

  // ── 全体統計 ──
  const allLatencies = results.filter(r => !r.hasError).map(r => r.elapsedMs);
  const totalErrors = results.filter(r => r.hasError).length;
  console.log(`\n${"─".repeat(70)}`);
  console.log(`全体: median=${Math.round(median(allLatencies))}ms, p90=${Math.round(p90(allLatencies))}ms, 失敗率=${((totalErrors / results.length) * 100).toFixed(0)}% (${totalErrors}/${results.length})`);

  // PE phase breakdown
  const peLatencies = results
    .filter(r => r.latencyBreakdown?.peMs != null)
    .map(r => r.latencyBreakdown.peMs);
  const llmLatencies = results
    .filter(r => r.latencyBreakdown?.mainLlmMs != null)
    .map(r => r.latencyBreakdown.mainLlmMs);
  if (peLatencies.length > 0) {
    console.log(`PE: median=${Math.round(median(peLatencies))}ms, p90=${Math.round(p90(peLatencies))}ms`);
  }
  if (llmLatencies.length > 0) {
    console.log(`mainLLM: median=${Math.round(median(llmLatencies))}ms, p90=${Math.round(p90(llmLatencies))}ms`);
  }

  // S1: PE内部breakdown統計
  const peInternal = {
    queryGen: results.filter(r => r.latencyBreakdown?.peQueryGenMs != null).map(r => r.latencyBreakdown.peQueryGenMs),
    search: results.filter(r => r.latencyBreakdown?.peSearchMs != null).map(r => r.latencyBreakdown.peSearchMs),
    classify: results.filter(r => r.latencyBreakdown?.peClassifyMs != null).map(r => r.latencyBreakdown.peClassifyMs),
    qualityGate: results.filter(r => r.latencyBreakdown?.peQualityGateMs != null).map(r => r.latencyBreakdown.peQualityGateMs),
    promptBuild: results.filter(r => r.latencyBreakdown?.pePromptBuildMs != null).map(r => r.latencyBreakdown.pePromptBuildMs),
  };
  if (peInternal.queryGen.length > 0) {
    console.log(`\n🔬 PE内部breakdown:`);
    console.log(`  queryGen:    median=${Math.round(median(peInternal.queryGen))}ms, p90=${Math.round(p90(peInternal.queryGen))}ms`);
    console.log(`  search:      median=${Math.round(median(peInternal.search))}ms, p90=${Math.round(p90(peInternal.search))}ms`);
    console.log(`  classify:    median=${Math.round(median(peInternal.classify))}ms, p90=${Math.round(p90(peInternal.classify))}ms`);
    console.log(`  qualityGate: median=${Math.round(median(peInternal.qualityGate))}ms, p90=${Math.round(p90(peInternal.qualityGate))}ms`);
    console.log(`  promptBuild: median=${Math.round(median(peInternal.promptBuild))}ms, p90=${Math.round(p90(peInternal.promptBuild))}ms`);
  }

  // L1 stats
  const l1Fired = results.filter(r => r.latencyBreakdown?.peL1?.fired);
  const l1NotFired = results.filter(r => r.latencyBreakdown?.peL1 && !r.latencyBreakdown.peL1.fired);
  if (l1Fired.length > 0 || l1NotFired.length > 0) {
    console.log(`\n🔗 L1 Chained Exploration:`);
    console.log(`  fired: ${l1Fired.length}/${l1Fired.length + l1NotFired.length} cases`);
    if (l1Fired.length > 0) {
      const l1Totals = l1Fired.map(r => r.latencyBreakdown.peL1.totalMs);
      const l1FragGains = l1Fired.map(r => r.latencyBreakdown.peL1.fragmentsAfter - r.latencyBreakdown.peL1.fragmentsBefore);
      console.log(`  L1 total: median=${Math.round(median(l1Totals))}ms, p90=${Math.round(p90(l1Totals))}ms`);
      console.log(`  fragment gain: median=${median(l1FragGains).toFixed(1)}, total=${l1FragGains.reduce((a,b)=>a+b,0)}`);
    }
    if (l1NotFired.length > 0) {
      const reasons = {};
      for (const r of l1NotFired) {
        const reason = r.latencyBreakdown.peL1.reason;
        reasons[reason] = (reasons[reason] || 0) + 1;
      }
      console.log(`  skip reasons: ${Object.entries(reasons).map(([k,v])=>`${k}(${v})`).join(", ")}`);
    }
  }

  // ── JSON保存 ──
  const outputDir = "scripts/pe-p18-results";
  mkdirSync(outputDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outputPath = `${outputDir}/baseline-${MODE}-${timestamp}.json`;

  const output = {
    meta: {
      mode: MODE,
      timestamp: new Date().toISOString(),
      caseCount: results.length,
      errorCount: totalErrors,
      stats: {
        latency: {
          medianMs: Math.round(median(allLatencies)),
          p90Ms: Math.round(p90(allLatencies)),
          minMs: Math.min(...allLatencies),
          maxMs: Math.max(...allLatencies),
        },
        pe: peLatencies.length > 0 ? {
          medianMs: Math.round(median(peLatencies)),
          p90Ms: Math.round(p90(peLatencies)),
        } : null,
        mainLlm: llmLatencies.length > 0 ? {
          medianMs: Math.round(median(llmLatencies)),
          p90Ms: Math.round(p90(llmLatencies)),
        } : null,
        peInternal: peInternal.queryGen.length > 0 ? {
          queryGen: { medianMs: Math.round(median(peInternal.queryGen)), p90Ms: Math.round(p90(peInternal.queryGen)) },
          search: { medianMs: Math.round(median(peInternal.search)), p90Ms: Math.round(p90(peInternal.search)) },
          classify: { medianMs: Math.round(median(peInternal.classify)), p90Ms: Math.round(p90(peInternal.classify)) },
          qualityGate: { medianMs: Math.round(median(peInternal.qualityGate)), p90Ms: Math.round(p90(peInternal.qualityGate)) },
          promptBuild: { medianMs: Math.round(median(peInternal.promptBuild)), p90Ms: Math.round(p90(peInternal.promptBuild)) },
        } : null,
        failureRate: `${((totalErrors / results.length) * 100).toFixed(1)}%`,
      },
    },
    results,
  };

  writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`\n📁 結果保存: ${outputPath}`);

  // ── 全応答一覧（CEO レビュー用） ──
  console.log("\n" + "=".repeat(70));
  console.log("全応答一覧（CEO レビュー用）");
  console.log("=".repeat(70));
  for (const r of results) {
    console.log(`\n[${r.id}] ${r.category} — ${r.description}`);
    console.log(`メッセージ: "${r.message}"`);
    console.log(`応答時間: ${r.elapsedMs}ms`);
    console.log(`エンティティ: ${r.entities.length > 0 ? r.entities.join(", ") : "(なし)"}`);
    console.log(`応答:\n${r.responseText || "(エラー)"}`);
  }
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
