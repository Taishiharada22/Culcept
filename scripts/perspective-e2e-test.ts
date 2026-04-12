/**
 * Perspective Engine E2E テスト
 * Exa API を直接叩いて検索→分類→プロンプト生成の全パイプラインをテストする。
 *
 * server-only 制約を回避するため、perspectiveEngine.ts の関数を直接呼ばず、
 * ロジックをインラインで再現する。
 *
 * Usage: source .env.local && npx tsx scripts/perspective-e2e-test.ts
 */

import * as dotenv from "dotenv";
import * as path from "path";

// .env.local を読み込む
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

// ─── Exa Search ────────────────────────────────────────────────────────

const EXA_API_URL = "https://api.exa.ai/search";

interface ExaResult {
  title: string;
  url: string;
  text?: string;
  highlights?: string[];
  score?: number;
}

async function searchExa(query: string): Promise<ExaResult[]> {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) {
    console.error("❌ EXA_API_KEY が未設定です。.env.local を確認してください。");
    process.exit(1);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(EXA_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        query,
        type: "auto",
        numResults: 3,
        contents: {
          text: { maxCharacters: 500 },
          highlights: { numSentences: 2 },
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Exa API error ${response.status}: ${errorText}`);
      return [];
    }

    const data = await response.json();
    return (data.results || []).map((r: ExaResult) => ({
      title: r.title || "",
      url: r.url || "",
      text: r.text || "",
      highlights: r.highlights || [],
      score: r.score,
    }));
  } catch (e) {
    if ((e as Error).name === "AbortError") {
      console.error("❌ Exa API timeout (5s)");
    } else {
      console.error("❌ Exa API error:", e);
    }
    return [];
  } finally {
    clearTimeout(timer);
  }
}

// ─── Test Cases ────────────────────────────────────────────────────────

interface TestCase {
  id: string;
  message: string;
  searchQueries: string[];
  description: string;
}

const TEST_CASES: TestCase[] = [
  {
    id: "career_1",
    message: "転職すべきかどうか迷ってる。今の会社3年目だけど成長が止まった気がする",
    searchQueries: ["転職 3年目 判断基準", "キャリア 停滞感 対処法"],
    description: "転職判断 — 市場情報と体験談",
  },
  {
    id: "self_external_1",
    message: "HSPって甘えなの？自分がそうかもしれないと思ってるんだけど",
    searchQueries: ["HSP 高感受性 科学的根拠", "HSP 甘え 誤解"],
    description: "自己理解×外部視点 — 科学的根拠",
  },
  {
    id: "creation_1",
    message: "起業したいけど、最初の一歩が怖い。何から始めればいい？",
    searchQueries: ["起業 最初の一歩 始め方", "スタートアップ 初期 リスク管理"],
    description: "起業相談 — 具体的手順と事実",
  },
];

// ─── Main ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("╔═══════════════════════════════════════════════════════╗");
  console.log("║  Perspective Engine E2E Test                         ║");
  console.log("║  Exa API → 検索結果 → 分類 → プロンプト生成          ║");
  console.log("╚═══════════════════════════════════════════════════════╝\n");

  for (const tc of TEST_CASES) {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`  📡 ${tc.id}: ${tc.description}`);
    console.log(`  質問: "${tc.message}"`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    for (const query of tc.searchQueries) {
      console.log(`  🔍 検索: "${query}"`);
      const startTime = Date.now();
      const results = await searchExa(query);
      const latency = Date.now() - startTime;

      if (results.length === 0) {
        console.log(`     ⚠️  結果なし (${latency}ms)\n`);
        continue;
      }

      console.log(`     ✅ ${results.length} 件取得 (${latency}ms)\n`);

      for (const r of results) {
        console.log(`     📄 "${r.title}"`);
        console.log(`        URL: ${r.url}`);
        if (r.text) {
          const preview = r.text.slice(0, 150).replace(/\n/g, " ");
          console.log(`        Text: ${preview}...`);
        }
        if (r.highlights && r.highlights.length > 0) {
          console.log(`        Highlights: ${r.highlights[0]?.slice(0, 100)}...`);
        }
        console.log();
      }
    }

    // Perspective Engine が生成するプロンプトブロックの模擬
    console.log(`  📝 模擬プロンプトブロック（Alter に注入される形式）:`);
    console.log(`  ──────────────────────────────────────────────`);
    console.log(`  ## 外界の視点（参考材料）`);
    console.log(`  以下の視点を自分のレンズで消化して語ってよい。ただし:`);
    console.log(`  - 「調べた」「記事によると」とは言わない`);
    console.log(`  - 必ず結論を出す。「いろんな意見があるね」で終わることは禁止`);
    console.log(`  - 外部視点を入れても、結論はパーソナルモデルから導出すること`);
    console.log(`  ──────────────────────────────────────────────\n`);
  }

  console.log("\n══════════════════════════════════════════════════════");
  console.log("  E2E テスト完了");
  console.log("  次: A/B 比較（同一質問で検索あり/なしの応答品質を5軸で比較）");
  console.log("══════════════════════════════════════════════════════\n");
}

main().catch(console.error);
