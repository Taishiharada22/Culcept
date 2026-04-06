/**
 * LLM応答比較 評価ゲート — 旧top8 vs derived facts
 *
 * 設計書 §12 に基づき、実際のLLM応答を生成して品質比較する。
 *
 * 手順:
 *   1. fixtureの各ユーザー×各質問について:
 *      - 旧top8形式のプロンプトでGemini呼び出し → legacy応答
 *      - 派生事実形式のプロンプトでGemini呼び出し → derived応答
 *   2. 自動評価指標:
 *      - 応答長（文字数）
 *      - 人格参照回数（軸ラベルの出現数）
 *      - 判断フレーム参照度（「あなたは」で始まる人格的言及の密度）
 *   3. CEO人手評価用に side-by-side HTML を生成
 *
 * 使い方:
 *   GEMINI_API_KEY=... npx tsx scripts/eval-derived-facts-llm.ts
 *
 * 出力:
 *   docs/eval/derived-facts-llm-comparison.json  (構造化結果)
 *   docs/eval/derived-facts-llm-comparison.html  (CEO評価用 side-by-side)
 *
 * @see docs/design/stargazer-alter-axis-architecture.md §12
 */

import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import {
  generateDerivedFacts,
  formatDerivedFactsForPrompt,
  type ContradictionInput,
  type DerivedFactSet,
} from "../lib/stargazer/derivedFactGenerator";
import type { TraitAxisKey } from "../lib/stargazer/traitAxes";
import { AXIS_REGISTRY } from "../lib/stargazer/axisRegistry";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

// ─── Types ────────────────────────────────────────────────

interface Snapshot {
  id: string;
  description: string;
  axisScores: Partial<Record<TraitAxisKey, number>>;
  contradictions: Array<{ axisA: TraitAxisKey; axisB: TraitAxisKey; tension: number }>;
  questions: string[];
}

interface FixtureFile {
  _meta: { status: string; note: string };
  snapshots: Snapshot[];
}

interface LLMResponse {
  text: string;
  charCount: number;
  /** 応答中に軸ラベルが出現した回数 */
  axisLabelMentions: number;
  /** 「あなたは」「〜傾向」等の人格参照文の数 */
  personalityReferences: number;
  /** 判断に対する具体的提案の数（「〜してみては」「〜という選択肢」等） */
  actionSuggestions: number;
  latencyMs: number;
}

interface EvalCase {
  snapshotId: string;
  snapshotDescription: string;
  question: string;
  legacyPrompt: string;
  derivedPrompt: string;
  derivedFactSet: DerivedFactSet;
  legacy: LLMResponse | null;
  derived: LLMResponse | null;
  comparison: {
    charCountDelta: number; // derived - legacy
    axisLabelDelta: number;
    personalityRefDelta: number;
    actionSuggestionDelta: number;
    /** derivedの方が良いか（自動判定、参考値） */
    autoVerdict: "derived_better" | "legacy_better" | "similar" | "error";
  } | null;
}

// ─── Gemini Direct Call ───────────────────────────────────

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL_DEFAULT ?? "gemini-2.5-flash";

async function callGemini(systemPrompt: string, userMessage: string): Promise<{ text: string; latencyMs: number }> {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not set");

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
  const start = Date.now();

  const response = await fetch(`${endpoint}?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        { role: "user", parts: [{ text: `${systemPrompt}\n\n---\nユーザーの相談:\n${userMessage}` }] },
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1024,
      },
    }),
  });

  const latencyMs = Date.now() - start;

  if (!response.ok) {
    const err = await response.text().catch(() => "(読み取り不可)");
    throw new Error(`Gemini API error ${response.status}: ${err.slice(0, 300)}`);
  }

  const json = await response.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return { text, latencyMs };
}

// ─── Legacy Top8 Prompt ───────────────────────────────────

function legacyTop8Prompt(axisScores: Partial<Record<TraitAxisKey, number>>): string {
  const axisEntries = Object.entries(axisScores)
    .filter(([, v]) => v !== undefined && v !== null)
    .sort(([, a], [, b]) => Math.abs((b as number) - 0.5) - Math.abs((a as number) - 0.5))
    .slice(0, 8);

  const lines = ["### 軸スコア（具体的な数値と意味）", ""];
  for (const [key, value] of axisEntries) {
    const entry = AXIS_REGISTRY.get(key as TraitAxisKey);
    const label = entry ? `${entry.labelLeft}/${entry.labelRight}` : key;
    const score = value as number;
    const direction = score >= 0.5
      ? `やや「${entry?.labelRight ?? "右"}」傾向`
      : `やや「${entry?.labelLeft ?? "左"}」傾向`;
    lines.push(`- ${label}: ${score.toFixed(2)} → ${direction}`);
  }
  return lines.join("\n");
}

// ─── Response Analysis ────────────────────────────────────

function analyzeResponse(text: string, axisScores: Partial<Record<TraitAxisKey, number>>): Omit<LLMResponse, "text" | "latencyMs"> {
  // 軸ラベルの出現回数
  let axisLabelMentions = 0;
  for (const [key] of Object.entries(axisScores)) {
    const entry = AXIS_REGISTRY.get(key as TraitAxisKey);
    if (!entry) continue;
    if (text.includes(entry.labelLeft)) axisLabelMentions++;
    if (text.includes(entry.labelRight)) axisLabelMentions++;
  }

  // 人格参照: 「あなたは」「〜な傾向」「〜タイプ」「性格的に」等
  const personalityPatterns = [
    /あなたは/g, /あなたの/g, /傾向/g, /タイプ/g,
    /性格的/g, /本質的/g, /深層/g, /無意識/g,
    /パターン/g, /特徴として/g,
  ];
  let personalityReferences = 0;
  for (const pat of personalityPatterns) {
    const matches = text.match(pat);
    if (matches) personalityReferences += matches.length;
  }

  // 行動提案: 「〜してみて」「〜という選択肢」「〜を試す」等
  const actionPatterns = [
    /してみて/g, /してみる/g, /選択肢/g, /試して/g,
    /やってみ/g, /考えてみ/g, /向き合[うっ]/g,
    /提案/g, /おすすめ/g, /アドバイス/g,
  ];
  let actionSuggestions = 0;
  for (const pat of actionPatterns) {
    const matches = text.match(pat);
    if (matches) actionSuggestions += matches.length;
  }

  return {
    charCount: text.length,
    axisLabelMentions,
    personalityReferences,
    actionSuggestions,
  };
}

// ─── System Prompt Templates ──────────────────────────────

function buildBaseSystemPrompt(snapshot: Snapshot): string {
  return `あなたは Aneurasync の Alter（もうひとりの自分）です。
ユーザーの深層的な性格・判断傾向データに基づき、本人が気づいていない視点から判断を支援します。

## ルール
- 1文目は結論（14-28文字）、後半に理由を述べる
- 「どうすればいいと思う？」には必ず判断を示す（曖昧な共感だけで逃げない）
- ユーザーの性格データを踏まえた、その人固有の判断根拠を提供する
- 一般論ではなく「あなたの場合は」で語る

## ユーザー情報
- ID: ${snapshot.id}
- 特徴: ${snapshot.description}
`;
}

// ─── HTML Generator ───────────────────────────────────────

function generateHTML(cases: EvalCase[]): string {
  const rows = cases.map((c, i) => {
    const legacyText = c.legacy?.text ?? "(エラー)";
    const derivedText = c.derived?.text ?? "(エラー)";
    const verdict = c.comparison?.autoVerdict ?? "error";
    const verdictColor = verdict === "derived_better" ? "#22c55e"
      : verdict === "legacy_better" ? "#ef4444"
      : verdict === "similar" ? "#f59e0b" : "#6b7280";

    return `
    <div class="case" id="case-${i}">
      <div class="case-header">
        <h3>Case ${i + 1}: ${escapeHtml(c.snapshotDescription)}</h3>
        <p class="question">💬 「${escapeHtml(c.question)}」</p>
        <span class="verdict" style="background:${verdictColor}">${verdict}</span>
      </div>
      <div class="comparison">
        <div class="col legacy">
          <h4>🔵 旧ロジック (top8)</h4>
          <div class="metrics">
            文字数: ${c.legacy?.charCount ?? "-"} / 軸ラベル言及: ${c.legacy?.axisLabelMentions ?? "-"} /
            人格参照: ${c.legacy?.personalityReferences ?? "-"} / 提案: ${c.legacy?.actionSuggestions ?? "-"} /
            応答時間: ${c.legacy?.latencyMs ?? "-"}ms
          </div>
          <div class="response">${escapeHtml(legacyText)}</div>
        </div>
        <div class="col derived">
          <h4>🟢 新ロジック (derived facts)</h4>
          <div class="metrics">
            文字数: ${c.derived?.charCount ?? "-"} / 軸ラベル言及: ${c.derived?.axisLabelMentions ?? "-"} /
            人格参照: ${c.derived?.personalityReferences ?? "-"} / 提案: ${c.derived?.actionSuggestions ?? "-"} /
            応答時間: ${c.derived?.latencyMs ?? "-"}ms
          </div>
          <div class="response">${escapeHtml(derivedText)}</div>
        </div>
      </div>
      <div class="ceo-eval">
        <p><strong>CEO評価欄:</strong></p>
        <label><input type="radio" name="eval-${i}" value="derived"> 新ロジックの方が良い</label>
        <label><input type="radio" name="eval-${i}" value="legacy"> 旧ロジックの方が良い</label>
        <label><input type="radio" name="eval-${i}" value="same"> 同等</label>
        <label><input type="radio" name="eval-${i}" value="both_bad"> どちらも不十分</label>
        <br><textarea placeholder="メモ（任意）" rows="2" style="width:100%;margin-top:4px"></textarea>
      </div>
    </div>`;
  }).join("\n");

  // Summary stats
  const total = cases.length;
  const derivedBetter = cases.filter(c => c.comparison?.autoVerdict === "derived_better").length;
  const legacyBetter = cases.filter(c => c.comparison?.autoVerdict === "legacy_better").length;
  const similar = cases.filter(c => c.comparison?.autoVerdict === "similar").length;
  const errors = cases.filter(c => c.comparison?.autoVerdict === "error").length;

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<title>Derived Facts 評価ゲート — LLM応答比較</title>
<style>
  body { font-family: "Helvetica Neue", Arial, sans-serif; max-width: 1400px; margin: 0 auto; padding: 20px; background: #0f172a; color: #e2e8f0; }
  h1 { color: #7dd3fc; border-bottom: 2px solid #334155; padding-bottom: 12px; }
  h2 { color: #93c5fd; }
  .summary { background: #1e293b; padding: 16px; border-radius: 8px; margin: 16px 0; }
  .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
  .stat { text-align: center; padding: 12px; border-radius: 6px; }
  .stat-value { font-size: 2em; font-weight: bold; }
  .case { background: #1e293b; border-radius: 8px; margin: 20px 0; padding: 16px; }
  .case-header { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  .case-header h3 { margin: 0; flex: 1; }
  .question { color: #fbbf24; font-style: italic; margin: 4px 0; }
  .verdict { padding: 4px 12px; border-radius: 12px; color: white; font-size: 0.85em; font-weight: bold; }
  .comparison { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 12px 0; }
  .col { background: #0f172a; padding: 12px; border-radius: 6px; }
  .col h4 { margin: 0 0 8px; }
  .legacy h4 { color: #60a5fa; }
  .derived h4 { color: #4ade80; }
  .metrics { font-size: 0.8em; color: #94a3b8; margin-bottom: 8px; }
  .response { white-space: pre-wrap; line-height: 1.6; font-size: 0.95em; }
  .ceo-eval { background: #334155; padding: 12px; border-radius: 6px; margin-top: 8px; }
  .ceo-eval label { margin-right: 16px; cursor: pointer; }
  .ceo-eval textarea { background: #1e293b; border: 1px solid #475569; color: #e2e8f0; border-radius: 4px; padding: 4px; }
  .eval-guide { background: #1e3a5f; padding: 16px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #3b82f6; }
</style>
</head>
<body>
<h1>Derived Facts 評価ゲート — LLM応答比較</h1>
<p>生成日: ${new Date().toISOString().split("T")[0]} / Model: ${GEMINI_MODEL} / Fixture: synthetic (${total} cases)</p>

<div class="eval-guide">
<h2>CEO評価ガイド</h2>
<p>各ケースについて、以下の観点で旧ロジック vs 新ロジックを比較してください:</p>
<ol>
  <li><strong>人格反映度</strong> — ユーザーの性格特徴が応答に反映されているか</li>
  <li><strong>判断の具体性</strong> — 一般論ではなく、その人固有の根拠で判断を示しているか</li>
  <li><strong>洞察の深さ</strong> — 「自分って、そういう人間だったのか」と思える気づきがあるか</li>
  <li><strong>実用性</strong> — 実際に行動に移せる具体的な提案があるか</li>
  <li><strong>世界観</strong> — Aneurasyncらしい「第二の自己」としてのトーンか</li>
</ol>
<p><strong>GO条件</strong>: 新ロジックが旧ロジックと同等以上のケースが全体の70%以上</p>
</div>

<div class="summary">
<h2>自動評価サマリー</h2>
<div class="summary-grid">
  <div class="stat" style="background:#166534"><div class="stat-value">${derivedBetter}</div>新ロジック優位</div>
  <div class="stat" style="background:#7c2d12"><div class="stat-value">${legacyBetter}</div>旧ロジック優位</div>
  <div class="stat" style="background:#78350f"><div class="stat-value">${similar}</div>同等</div>
  <div class="stat" style="background:#374151"><div class="stat-value">${errors}</div>エラー</div>
</div>
<p style="margin-top:8px;color:#94a3b8">※ 自動判定は参考値です。最終判定はCEOの人手評価で行います。</p>
</div>

${rows}

</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ─── Main ─────────────────────────────────────────────────

async function main() {
  console.log("=== LLM応答比較 評価ゲート ===\n");

  if (!GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY が未設定です。.env.local を確認してください。");
    process.exit(1);
  }
  console.log(`Model: ${GEMINI_MODEL}`);

  // Fixture読み込み
  const fixturePath = path.resolve(__dirname, "../tests/fixtures/alter-axis-snapshots.json");
  const raw = fs.readFileSync(fixturePath, "utf-8");
  const fixture: FixtureFile = JSON.parse(raw);
  console.log(`Fixture: ${fixture.snapshots.length} snapshots, ${fixture.snapshots.reduce((s, sn) => s + sn.questions.length, 0)} total cases\n`);

  // 全ケースに対してサンプリング（全件 or --sample N）
  const sampleSize = process.argv.includes("--sample")
    ? parseInt(process.argv[process.argv.indexOf("--sample") + 1] || "5", 10)
    : undefined; // undefined = 全件

  const evalCases: EvalCase[] = [];
  let caseIndex = 0;

  for (const snapshot of fixture.snapshots) {
    // Contradiction inputs
    const contradictionInputs: ContradictionInput[] = snapshot.contradictions.map((c) => {
      const entryA = AXIS_REGISTRY.get(c.axisA);
      const entryB = AXIS_REGISTRY.get(c.axisB);
      const labelA = entryA ? `${entryA.labelLeft}/${entryA.labelRight}` : c.axisA;
      const labelB = entryB ? `${entryB.labelLeft}/${entryB.labelRight}` : c.axisB;
      return {
        axisA: c.axisA,
        axisB: c.axisB,
        insight: `「${labelA}」と「${labelB}」の傾向が矛盾している`,
        tension: c.tension,
      };
    });

    // Derived facts
    const factSet = generateDerivedFacts({
      axisScores: snapshot.axisScores,
      contradictions: contradictionInputs,
      blindSpots: [],
      queryDomain: null,
    });

    const topExtremeAxes = Object.entries(snapshot.axisScores)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([key, value]) => ({ key: key as TraitAxisKey, score: value as number }))
      .sort((a, b) => Math.abs(b.score - 0.5) - Math.abs(a.score - 0.5))
      .slice(0, 3);

    const derivedPromptSection = formatDerivedFactsForPrompt(factSet, topExtremeAxes);
    const legacyPromptSection = legacyTop8Prompt(snapshot.axisScores);
    const basePrompt = buildBaseSystemPrompt(snapshot);

    for (const question of snapshot.questions) {
      if (sampleSize && caseIndex >= sampleSize) break;
      caseIndex++;

      const legacySystemPrompt = `${basePrompt}\n${legacyPromptSection}`;
      const derivedSystemPrompt = `${basePrompt}\n${derivedPromptSection}`;

      console.log(`[${caseIndex}] ${snapshot.id} | "${question.slice(0, 20)}..." `);

      let legacyResponse: LLMResponse | null = null;
      let derivedResponse: LLMResponse | null = null;

      // Legacy call
      try {
        const { text, latencyMs } = await callGemini(legacySystemPrompt, question);
        const analysis = analyzeResponse(text, snapshot.axisScores);
        legacyResponse = { text, latencyMs, ...analysis };
        console.log(`  legacy: ${text.length}文字, ${latencyMs}ms`);
      } catch (e) {
        console.error(`  legacy ERROR: ${(e as Error).message}`);
      }

      // 500ms wait to avoid rate limiting
      await new Promise(r => setTimeout(r, 500));

      // Derived call
      try {
        const { text, latencyMs } = await callGemini(derivedSystemPrompt, question);
        const analysis = analyzeResponse(text, snapshot.axisScores);
        derivedResponse = { text, latencyMs, ...analysis };
        console.log(`  derived: ${text.length}文字, ${latencyMs}ms`);
      } catch (e) {
        console.error(`  derived ERROR: ${(e as Error).message}`);
      }

      // Comparison
      let comparison: EvalCase["comparison"] = null;
      if (legacyResponse && derivedResponse) {
        const charDelta = derivedResponse.charCount - legacyResponse.charCount;
        const axisLabelDelta = derivedResponse.axisLabelMentions - legacyResponse.axisLabelMentions;
        const personalityRefDelta = derivedResponse.personalityReferences - legacyResponse.personalityReferences;
        const actionDelta = derivedResponse.actionSuggestions - legacyResponse.actionSuggestions;

        // 自動判定: 人格参照+行動提案のスコア合計が高い方を優位とする
        const derivedScore = derivedResponse.personalityReferences + derivedResponse.actionSuggestions;
        const legacyScore = legacyResponse.personalityReferences + legacyResponse.actionSuggestions;
        const diff = derivedScore - legacyScore;

        let autoVerdict: EvalCase["comparison"]["autoVerdict"] = "similar";
        if (diff >= 2) autoVerdict = "derived_better";
        else if (diff <= -2) autoVerdict = "legacy_better";

        comparison = {
          charCountDelta: charDelta,
          axisLabelDelta: axisLabelDelta,
          personalityRefDelta: personalityRefDelta,
          actionSuggestionDelta: actionDelta,
          autoVerdict,
        };
        console.log(`  verdict: ${autoVerdict} (score diff: ${diff})`);
      } else {
        comparison = {
          charCountDelta: 0,
          axisLabelDelta: 0,
          personalityRefDelta: 0,
          actionSuggestionDelta: 0,
          autoVerdict: "error",
        };
      }

      evalCases.push({
        snapshotId: snapshot.id,
        snapshotDescription: snapshot.description,
        question,
        legacyPrompt: legacySystemPrompt,
        derivedPrompt: derivedSystemPrompt,
        derivedFactSet: factSet,
        legacy: legacyResponse,
        derived: derivedResponse,
        comparison,
      });

      // Rate limit wait
      await new Promise(r => setTimeout(r, 500));
    }
    if (sampleSize && caseIndex >= sampleSize) break;
  }

  // ─── Summary ──────────────────────────────────────────
  console.log("\n─── 評価サマリー ────────────────────────\n");
  const total = evalCases.length;
  const derivedBetter = evalCases.filter(c => c.comparison?.autoVerdict === "derived_better").length;
  const legacyBetter = evalCases.filter(c => c.comparison?.autoVerdict === "legacy_better").length;
  const similar = evalCases.filter(c => c.comparison?.autoVerdict === "similar").length;
  const errors = evalCases.filter(c => c.comparison?.autoVerdict === "error").length;

  console.log(`Total cases: ${total}`);
  console.log(`Derived better: ${derivedBetter} (${Math.round(derivedBetter / total * 100)}%)`);
  console.log(`Legacy better:  ${legacyBetter} (${Math.round(legacyBetter / total * 100)}%)`);
  console.log(`Similar:        ${similar} (${Math.round(similar / total * 100)}%)`);
  console.log(`Errors:         ${errors}`);
  console.log();

  const nonWorse = derivedBetter + similar;
  const passRate = Math.round(nonWorse / Math.max(total - errors, 1) * 100);
  console.log(`新ロジック同等以上: ${nonWorse}/${total - errors} (${passRate}%)`);
  console.log(`GO条件 (70%以上): ${passRate >= 70 ? "PASS" : "FAIL"}`);

  // ─── Output ───────────────────────────────────────────
  const outputDir = path.resolve(__dirname, "../docs/eval");
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  // JSON
  const jsonPath = path.join(outputDir, "derived-facts-llm-comparison.json");
  const jsonOutput = {
    meta: {
      date: new Date().toISOString(),
      model: GEMINI_MODEL,
      fixtureStatus: fixture._meta.status,
      totalCases: total,
    },
    summary: {
      derivedBetter,
      legacyBetter,
      similar,
      errors,
      passRate,
      goCondition: passRate >= 70 ? "PASS" : "FAIL",
    },
    cases: evalCases.map(c => ({
      snapshotId: c.snapshotId,
      question: c.question,
      legacyCharCount: c.legacy?.charCount,
      derivedCharCount: c.derived?.charCount,
      legacyPersonalityRefs: c.legacy?.personalityReferences,
      derivedPersonalityRefs: c.derived?.personalityReferences,
      comparison: c.comparison,
      legacyResponsePreview: c.legacy?.text?.slice(0, 200),
      derivedResponsePreview: c.derived?.text?.slice(0, 200),
    })),
  };
  fs.writeFileSync(jsonPath, JSON.stringify(jsonOutput, null, 2));
  console.log(`\nJSON saved: ${jsonPath}`);

  // HTML
  const htmlPath = path.join(outputDir, "derived-facts-llm-comparison.html");
  fs.writeFileSync(htmlPath, generateHTML(evalCases));
  console.log(`HTML saved: ${htmlPath}`);
  console.log(`\n→ HTMLファイルをブラウザで開いてCEO評価を行ってください。`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
