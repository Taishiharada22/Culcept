/**
 * Perspective Engine A/B 比較スクリプト
 *
 * 同一質問を Alter API に2回投げて、検索あり/なしの応答品質を比較する。
 * 5軸評価: 具体性 / 多視点性 / 本人適応 / 直答率 / テンプレ減少
 *
 * 前提:
 *   1. dev サーバーが起動中 (npm run dev)
 *   2. STARGAZER_PERSPECTIVE_ENGINE_LIVE=true が .env.local に設定済み
 *   3. テストユーザーの認証トークンが必要
 *
 * Usage: npx tsx scripts/perspective-ab-compare.ts
 *
 * @see docs/alter-perspective-engine-design.md v2 Phase 0
 */

import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

// ─── Config ──────────────────────────────────────────────────────────────

const DEV_SERVER = process.env.AB_TEST_SERVER || "http://localhost:3000";
const ALTER_ENDPOINT = `${DEV_SERVER}/api/stargazer/alter`;

// テストケース: 検索が発火すべき質問のみ
interface ABTestCase {
  id: string;
  message: string;
  description: string;
}

const TEST_CASES: ABTestCase[] = [
  {
    id: "career_1",
    message: "転職すべきかどうか迷ってる。今の会社3年目だけど成長が止まった気がする",
    description: "転職判断 — 市場情報と体験談が価値を持つ",
  },
  {
    id: "self_external_1",
    message: "HSPって甘えなの？自分がそうかもしれないと思ってるんだけど",
    description: "自己理解×外部視点 — 科学的根拠",
  },
  {
    id: "creation_1",
    message: "起業したいけど、最初の一歩が怖い。何から始めればいい？",
    description: "起業相談 — 具体的手順と事実",
  },
];

// ─── Auth Helper ─────────────────────────────────────────────────────────

interface AuthSession {
  accessToken: string;
  refreshToken: string;
  cookieHeader: string;
}

async function getTestAuthSession(): Promise<AuthSession> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY が未設定");
  }

  const email = process.env.ADMIN_EMAILS?.split(",")[0]?.trim();
  if (!email) throw new Error("ADMIN_EMAILS が未設定");

  console.log(`  🔐 認証中: ${email}`);

  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: supabaseAnonKey,
    },
    body: JSON.stringify({
      email,
      password: process.env.TEST_USER_PASSWORD || "test-password-dev",
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Auth failed (${response.status}): ${err}`);
  }

  const data = await response.json();
  const accessToken = data.access_token as string;
  const refreshToken = data.refresh_token as string;

  // Supabase SSR (@supabase/ssr) のクッキー形式を構築
  // sb-<ref>-auth-token.0, .1 ... のチャンク形式 or base64 encoded single cookie
  const ref = supabaseUrl.match(/https:\/\/([^.]+)\./)?.[1] || "unknown";
  const cookieName = `sb-${ref}-auth-token`;
  const sessionJson = JSON.stringify({
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: data.user,
  });

  // base64url エンコード（@supabase/ssr の BASE64_PREFIX 付き）
  const base64Encoded = `base64-${Buffer.from(sessionJson).toString("base64url")}`;

  // チャンク分割（@supabase/ssr は ~3180 バイトでチャンク分割）
  const CHUNK_SIZE = 3180;
  const chunks: string[] = [];
  for (let i = 0; i < base64Encoded.length; i += CHUNK_SIZE) {
    chunks.push(base64Encoded.slice(i, i + CHUNK_SIZE));
  }

  let cookieHeader: string;
  if (chunks.length === 1) {
    cookieHeader = `${cookieName}=${chunks[0]}`;
  } else {
    cookieHeader = chunks
      .map((chunk, i) => `${cookieName}.${i}=${chunk}`)
      .join("; ");
  }

  return { accessToken, refreshToken, cookieHeader };
}

// ─── API Call ────────────────────────────────────────────────────────────

interface AlterResponse {
  response?: string;
  alterResponse?: string;
  error?: string;
  [key: string]: unknown;
}

async function callAlter(
  message: string,
  session: AuthSession,
  disablePerspective: boolean,
): Promise<{ response: string; latencyMs: number; raw: AlterResponse }> {
  const start = Date.now();

  let response: Response;
  try {
    response = await fetch(ALTER_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.accessToken}`,
        Cookie: session.cookieHeader,
      },
      body: JSON.stringify({
        message,
        source: "home",
        _abTestDisablePerspective: disablePerspective,
        // Gate の Phase/Trust チェックをバイパスして検索を発火させる
        _abTestOverridePhase: 3,
        _abTestOverrideTrust: 4,
      }),
    });
  } catch (e) {
    throw new Error(`fetch failed: ${(e as Error).message} — dev サーバー (${ALTER_ENDPOINT}) が起動していることを確認してください`);
  }

  const latencyMs = Date.now() - start;
  let data: AlterResponse;
  try {
    data = (await response.json()) as AlterResponse;
  } catch {
    const text = await response.text().catch(() => "(body unreadable)");
    throw new Error(`Alter API returned non-JSON (${response.status}): ${text.slice(0, 200)}`);
  }

  if (!response.ok || data.error) {
    throw new Error(`Alter API error (${response.status}): ${JSON.stringify(data.error || data).slice(0, 300)}`);
  }

  // Alter の応答テキストを取得（フィールド名は実装による）
  const alterText = (data.response || data.alterResponse || "") as string;

  return { response: alterText, latencyMs, raw: data };
}

// ─── 5-Axis Evaluation ──────────────────────────────────────────────────

interface FiveAxisScore {
  specificity: number;      // 具体性: 具体的な情報・数字・事例が含まれるか
  multiPerspective: number; // 多視点性: 複数の角度から語れているか
  personalFit: number;      // 本人適応: パーソナルモデルに合った解釈か
  directAnswer: number;     // 直答率: 明確な結論を出せているか
  antiTemplate: number;     // テンプレ減少: 定型的な励まし・一般論が減っているか
}

function evaluateResponse(text: string): FiveAxisScore {
  // ルールベースの簡易評価（Phase 0 では十分）
  // 後段で LLM 評価に置き換え可能

  // 1. 具体性: 数字、固有名詞、具体例の有無
  const numberPattern = /\d+[%％万円年月日回人件社歳]/g;
  const specificPatterns = /例えば|具体的に|たとえば|実際に|現実に|というケース/g;
  const numberCount = (text.match(numberPattern) || []).length;
  const specificCount = (text.match(specificPatterns) || []).length;
  const specificity = Math.min(1, (numberCount * 0.15 + specificCount * 0.2));

  // 2. 多視点性: 「一方で」「逆に」「別の見方」等の転換表現
  const perspectivePatterns = /一方で|逆に|別の見方|反面|ただし|でも実は|もう一つ|他方|そうは言っても|裏を返せば|見方を変えれば/g;
  const perspectiveCount = (text.match(perspectivePatterns) || []).length;
  const multiPerspective = Math.min(1, perspectiveCount * 0.25);

  // 3. 本人適応: 「君は」「あなたは」「こういうタイプ」等のパーソナル参照
  const personalPatterns = /君[はのが]|あなた[はのが]|こういうタイプ|そういう人|性格的に|傾向として|パターンとして/g;
  const personalCount = (text.match(personalPatterns) || []).length;
  const personalFit = Math.min(1, personalCount * 0.2);

  // 4. 直答率: 冒頭で結論を述べているか + 「思う」「だろう」等の断定
  const conclusionPatterns = /だと思う|だろうね|じゃないかな|だよ[。！]|なんだよ|だね[。！]|すべき|したほうがいい/g;
  const hedgePatterns = /かもしれない|わからない|難しい問題|一概に|人それぞれ|ケースバイケース/g;
  const conclusionCount = (text.match(conclusionPatterns) || []).length;
  const hedgeCount = (text.match(hedgePatterns) || []).length;
  const directAnswer = Math.min(1, Math.max(0, conclusionCount * 0.2 - hedgeCount * 0.15));

  // 5. テンプレ減少: 定型フレーズの逆スコア
  const templatePatterns = /大丈夫|頑張って|応援して|気持ちはわかる|それぞれの道|正解はない|自分を信じ|自分らしく|焦らず/g;
  const templateCount = (text.match(templatePatterns) || []).length;
  const antiTemplate = Math.max(0, 1 - templateCount * 0.2);

  return { specificity, multiPerspective, personalFit, directAnswer, antiTemplate };
}

function totalScore(scores: FiveAxisScore): number {
  return (
    scores.specificity +
    scores.multiPerspective +
    scores.personalFit +
    scores.directAnswer +
    scores.antiTemplate
  ) / 5;
}

// ─── Failure Pattern Detection ──────────────────────────────────────────

function detectFailurePatterns(withSearch: string, withoutSearch: string): string[] {
  const failures: string[] = [];

  // ❌ 失敗1: ChatGPT劣化版化 — 「調べた」「記事によると」が出ている
  const chatgptPatterns = /調べ(た|ると)|記事によると|ネットで|検索すると|サイトで|情報によれば/;
  if (chatgptPatterns.test(withSearch)) {
    failures.push("❌ 失敗1: ChatGPT劣化版化 — 検索結果を直接引用している");
  }

  // ❌ 失敗2: 「いろんな意見があるね」bot化 — 結論が弱くなっている
  const weakConclusionPatterns = /いろんな(意見|考え|見方)|人それぞれ|正解はない|どれも正しい|一長一短/;
  const weakInWithSearch = (withSearch.match(weakConclusionPatterns) || []).length;
  const weakInWithout = (withoutSearch.match(weakConclusionPatterns) || []).length;
  if (weakInWithSearch > weakInWithout) {
    failures.push("❌ 失敗2: 「いろんな意見があるね」bot化 — 検索で結論が弱まった");
  }

  // ❌ 失敗4: 抽象的なまま — 具体性が向上していない
  const withScores = evaluateResponse(withSearch);
  const withoutScores = evaluateResponse(withoutSearch);
  if (withScores.specificity <= withoutScores.specificity) {
    failures.push("❌ 失敗4: 抽象的なまま — 検索を入れても具体性が向上していない");
  }

  return failures;
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("╔═══════════════════════════════════════════════════════╗");
  console.log("║  Perspective Engine A/B Compare                      ║");
  console.log("║  同一質問 × 検索あり/なし → 5軸評価                   ║");
  console.log("╚═══════════════════════════════════════════════════════╝\n");

  // 認証
  let session: AuthSession;
  try {
    session = await getTestAuthSession();
    console.log("  ✅ 認証成功\n");
  } catch (e) {
    console.error(`  ❌ 認証失敗: ${(e as Error).message}`);
    console.log("\n  .env.local に TEST_USER_PASSWORD=（パスワード） を設定してください。\n");
    process.exit(1);
  }

  const results: Array<{
    id: string;
    description: string;
    withSearch: { response: string; scores: FiveAxisScore; latency: number };
    withoutSearch: { response: string; scores: FiveAxisScore; latency: number };
    failures: string[];
    delta: number;
  }> = [];

  for (const tc of TEST_CASES) {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`  🧪 ${tc.id}: ${tc.description}`);
    console.log(`  質問: "${tc.message}"`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    // A: 検索なし（従来パス）
    console.log("  🅰️  条件A: 検索なし（従来 Alter）");
    let withoutResult: { response: string; latencyMs: number; raw: AlterResponse };
    try {
      withoutResult = await callAlter(tc.message, session, true);
      console.log(`     ✅ 応答取得 (${withoutResult.latencyMs}ms)`);
      console.log(`     ${withoutResult.response.slice(0, 200).replace(/\n/g, " ")}...\n`);
    } catch (e) {
      console.error(`     ❌ ${(e as Error).message}\n`);
      continue;
    }

    // 少し間を空ける（レート制限対策）
    await new Promise((r) => setTimeout(r, 2000));

    // B: 検索あり（Perspective Engine 有効）
    console.log("  🅱️  条件B: 検索あり（Perspective Engine）");
    let withResult: { response: string; latencyMs: number; raw: AlterResponse };
    try {
      withResult = await callAlter(tc.message, session, false);
      console.log(`     ✅ 応答取得 (${withResult.latencyMs}ms)`);
      console.log(`     ${withResult.response.slice(0, 200).replace(/\n/g, " ")}...\n`);
    } catch (e) {
      console.error(`     ❌ ${(e as Error).message}\n`);
      continue;
    }

    // 5軸評価
    const scoresA = evaluateResponse(withoutResult.response);
    const scoresB = evaluateResponse(withResult.response);
    const totalA = totalScore(scoresA);
    const totalB = totalScore(scoresB);
    const delta = totalB - totalA;

    // 失敗パターン検出
    const failures = detectFailurePatterns(withResult.response, withoutResult.response);

    results.push({
      id: tc.id,
      description: tc.description,
      withSearch: { response: withResult.response, scores: scoresB, latency: withResult.latencyMs },
      withoutSearch: { response: withoutResult.response, scores: scoresA, latency: withoutResult.latencyMs },
      failures,
      delta,
    });

    // 結果表示
    console.log("  📊 5軸評価比較:");
    console.log(`     ${"軸".padEnd(14)} ${"A(検索なし)".padEnd(12)} ${"B(検索あり)".padEnd(12)} ${"Δ"}`);
    console.log(`     ${"─".repeat(50)}`);
    const axes: [keyof FiveAxisScore, string][] = [
      ["specificity", "具体性"],
      ["multiPerspective", "多視点性"],
      ["personalFit", "本人適応"],
      ["directAnswer", "直答率"],
      ["antiTemplate", "テンプレ減少"],
    ];
    for (const [key, label] of axes) {
      const a = scoresA[key];
      const b = scoresB[key];
      const d = b - a;
      const arrow = d > 0.05 ? "↑" : d < -0.05 ? "↓" : "→";
      console.log(
        `     ${label.padEnd(12)} ${a.toFixed(2).padEnd(12)} ${b.toFixed(2).padEnd(12)} ${arrow} ${d >= 0 ? "+" : ""}${d.toFixed(2)}`,
      );
    }
    console.log(`     ${"─".repeat(50)}`);
    console.log(
      `     ${"合計".padEnd(12)} ${totalA.toFixed(2).padEnd(12)} ${totalB.toFixed(2).padEnd(12)} ${delta >= 0 ? "+" : ""}${delta.toFixed(2)}`,
    );

    if (failures.length > 0) {
      console.log(`\n  ⚠️  失敗パターン検出:`);
      for (const f of failures) {
        console.log(`     ${f}`);
      }
    } else {
      console.log(`\n  ✅ 失敗パターンなし`);
    }
  }

  // ─── Summary ──────────────────────────────────────────────────────────
  console.log("\n\n══════════════════════════════════════════════════════");
  console.log("  A/B 比較サマリ");
  console.log("══════════════════════════════════════════════════════\n");

  let totalDelta = 0;
  let totalFailures = 0;

  for (const r of results) {
    const status = r.delta > 0.02 ? "🟢 改善" : r.delta < -0.02 ? "🔴 悪化" : "🟡 同等";
    console.log(`  ${r.id}: ${status} (Δ${r.delta >= 0 ? "+" : ""}${r.delta.toFixed(2)}) ${r.failures.length > 0 ? `— 失敗${r.failures.length}件` : ""}`);
    totalDelta += r.delta;
    totalFailures += r.failures.length;
  }

  const avgDelta = results.length > 0 ? totalDelta / results.length : 0;
  console.log(`\n  平均 Δ: ${avgDelta >= 0 ? "+" : ""}${avgDelta.toFixed(3)}`);
  console.log(`  失敗パターン合計: ${totalFailures} 件`);

  // 判定
  console.log("\n  ──────────────────────────────────────────────");
  if (avgDelta > 0.05 && totalFailures === 0) {
    console.log("  🟢 結論: Perspective Engine は応答品質を改善している");
    console.log("  → Phase 0 PASS。本番有効化を推奨");
  } else if (totalFailures > 0) {
    console.log("  🔴 結論: 失敗パターンが検出された");
    console.log("  → 失敗パターンの修正後に再テストが必要");
  } else if (avgDelta > 0) {
    console.log("  🟡 結論: わずかに改善しているが、追加テストが必要");
    console.log("  → テストケースを増やし、LLM 評価を導入して再検証");
  } else {
    console.log("  🔴 結論: 改善が見られない or 悪化している");
    console.log("  → Gate チューニングまたはプロンプト設計の見直しが必要");
  }
  console.log("  ──────────────────────────────────────────────\n");

  // レスポンス全文を出力（手動確認用）
  console.log("\n══════════════════════════════════════════════════════");
  console.log("  全文比較（手動評価用）");
  console.log("══════════════════════════════════════════════════════\n");

  for (const r of results) {
    console.log(`\n┌─ ${r.id}: ${r.description} ─────────────────────────┐`);
    console.log(`│`);
    console.log(`│ 🅰️  検索なし (${r.withoutSearch.latency}ms):`);
    console.log(`│ ${r.withoutSearch.response.replace(/\n/g, "\n│ ")}`);
    console.log(`│`);
    console.log(`│ 🅱️  検索あり (${r.withSearch.latency}ms):`);
    console.log(`│ ${r.withSearch.response.replace(/\n/g, "\n│ ")}`);
    console.log(`│`);
    console.log(`└${"─".repeat(60)}┘`);
  }
}

main().catch(console.error);
