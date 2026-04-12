/**
 * Perspective Engine Phase 0 評価スクリプト
 *
 * 目的: 検索統合で「返答の質がどれだけ変わるか」を測る
 * 方法: 同一質問 × 同一プロファイルで A（検索なし）vs B（検索あり）を比較
 *
 * 5軸評価:
 *   1. 具体性 — 抽象論で終わらず、具体的な情報・数字・事例が含まれるか
 *   2. 多視点性 — 1方向ではなく、複数の角度から語れているか
 *   3. 本人適応 — ユーザーのパーソナルモデルに合った解釈か
 *   4. 直答率 — 質問に対して明確な結論を出せているか
 *   5. テンプレ減少 — 定型的な励まし・一般論が減り、固有の洞察が増えているか
 *
 * 失敗4パターン検出:
 *   ❌ ChatGPT劣化版化
 *   ❌ 「いろんな意見があるね」bot化
 *   ❌ 監査不能
 *   ❌ 抽象的なまま
 *
 * Usage: npx tsx scripts/perspective-engine-eval.ts
 *
 * @see docs/alter-perspective-engine-design.md v2 Phase 0
 */

// Direct import causes server-only error, so we import only the pure functions
// that don't depend on runAI. For full E2E test, use the API route instead.
import type { QueryContext, QuestionCategory } from "../lib/stargazer/alterHomeAdapter";

// Inline the gate logic for testing (pure function, no server dependencies)
function evaluateSearchGateTest(
  message: string,
  queryContext: QueryContext,
  questionCategory: QuestionCategory,
  hdmPhase: number,
  trustLevel: number,
  responseMode: string,
  perspectiveEngineLive: boolean = true,
): { shouldSearch: boolean; searchNeed: number; reason: string } {
  if (!perspectiveEngineLive) {
    return { shouldSearch: false, searchNeed: 0, reason: "kill_switch_off" };
  }
  if (hdmPhase < 2) {
    return { shouldSearch: false, searchNeed: 0, reason: "phase_too_low" };
  }
  if (trustLevel < 3) {
    return { shouldSearch: false, searchNeed: 0, reason: "trust_too_low" };
  }
  if (responseMode === "clarify" || responseMode === "repair") {
    return { shouldSearch: false, searchNeed: 0, reason: `mode_${responseMode}` };
  }
  const greetingPatterns = /^(おはよう|こんにちは|こんばんは|ただいま|やあ|よう|ひさしぶり)/;
  const askMePatterns = /(質問して|聞いて|何か聞いて)/;
  if (greetingPatterns.test(message)) {
    return { shouldSearch: false, searchNeed: 0, reason: "greeting" };
  }
  if (askMePatterns.test(message)) {
    return { shouldSearch: false, searchNeed: 0, reason: "ask_me" };
  }

  let searchNeed = 0;
  const temporalPatterns = /今|最近|2026|2025|最新|トレンド|今後|将来|動向/;
  if (temporalPatterns.test(message)) searchNeed += 0.2;
  const factualPatterns = /って(本当|ほんと)|って(何|なに)|とは|意味|定義|割合|%|パーセント|統計|データ|研究|科学的/;
  if (factualPatterns.test(message)) searchNeed += 0.25;
  const entityPatterns = /[A-Z][a-z]+|[A-Z]{2,}|HSP|ADHD|MBTI|エニアグラム|ストレングスファインダー/;
  if (entityPatterns.test(message)) searchNeed += 0.15;
  const highExternalDomains = ["career_fit", "industry_fit", "creation", "lifestyle", "founder_team_fit"];
  const mediumExternalDomains = ["work", "romance"];
  if (highExternalDomains.includes(queryContext.domain)) {
    searchNeed += 0.25;
  } else if (mediumExternalDomains.includes(queryContext.domain)) {
    searchNeed += 0.15;
  }
  const selfExternalPatterns = /って(甘え|普通|おかしい|変|異常)|みんなは|一般的|他の人|タイプの人|こういう(性格|人|タイプ)|な人って|損してる|得してる/;
  if (queryContext.domain === "self" && selfExternalPatterns.test(message)) {
    searchNeed += 0.3;
  }
  const decisionPatterns = /すべき|した(ほう|方)がいい|どうすれば|何から始め|どう(受け止め|対処|対応|向き合)|迷って/;
  if (decisionPatterns.test(message)) {
    searchNeed += 0.15;
  }
  const practicalPatterns = /準備|方法|やり方|手順|コツ|ポイント|始め(たい|よう|る)|何を(準備|用意)/;
  if (practicalPatterns.test(message)) {
    searchNeed += 0.15;
  }
  const pureEmotionalPatterns = /^(しんどい|つらい|疲れた|泣きたい|もう(無理|だめ|やだ)|きつい|消えたい)/;
  if (pureEmotionalPatterns.test(message)) {
    searchNeed = Math.max(0, searchNeed - 0.4);
  }
  const pureInternalPatterns = /^(僕|私|俺|自分)(の|って)(強み|弱み|特徴|性格|いいところ|課題)/;
  if (pureInternalPatterns.test(message) && !selfExternalPatterns.test(message)) {
    searchNeed = Math.max(0, searchNeed - 0.3);
  }

  const shouldSearch = searchNeed >= 0.3;
  const reason = shouldSearch
    ? `searchNeed=${searchNeed.toFixed(2)}_domain=${queryContext.domain}`
    : `searchNeed=${searchNeed.toFixed(2)}_below_threshold`;
  return { shouldSearch, searchNeed, reason };
}

// ─── Test Cases ───────────────────────────────────────────────────────────

interface TestCase {
  id: string;
  message: string;
  domain: string;
  category: QuestionCategory;
  description: string;
  expectedSearch: boolean; // 検索が発火すべきか
}

const TEST_CASES: TestCase[] = [
  // 発火すべきケース
  {
    id: "career_1",
    message: "転職すべきかどうか迷ってる。今の会社3年目だけど成長が止まった気がする",
    domain: "career_fit",
    category: "career",
    description: "転職判断 — 市場情報と体験談が価値を持つ",
    expectedSearch: true,
  },
  {
    id: "creation_1",
    message: "起業したいけど、最初の一歩が怖い。何から始めればいい？",
    domain: "creation",
    category: "career",
    description: "起業相談 — 具体的な手順と事実が必要",
    expectedSearch: true,
  },
  {
    id: "self_external_1",
    message: "HSPって甘えなの？自分がそうかもしれないと思ってるんだけど",
    domain: "self",
    category: "general",
    description: "自己理解×外部視点 — 科学的根拠と専門家見解が有効",
    expectedSearch: true,
  },
  {
    id: "self_external_2",
    message: "内向的な人って社会では損してるのかな",
    domain: "self",
    category: "general",
    description: "内省×外部視点 — 外部研究が自己理解を立体化する",
    expectedSearch: true,
  },
  {
    id: "lifestyle_1",
    message: "一人暮らし始めたいんだけど、何を準備すればいい？",
    domain: "lifestyle",
    category: "general",
    description: "生活判断 — 実用情報が有効",
    expectedSearch: true,
  },
  {
    id: "relationship_1",
    message: "パートナーに距離を置きたいと言われた。どう受け止めればいい？",
    domain: "romance",
    category: "general",
    description: "関係性判断 — 心理学的視点が有効",
    expectedSearch: true,
  },

  // 発火すべきでないケース
  {
    id: "emotional_1",
    message: "しんどい。もう何もしたくない",
    domain: "self",
    category: "general",
    description: "純粋感情 — 共感が目的、検索不要",
    expectedSearch: false,
  },
  {
    id: "greeting_1",
    message: "おはよう、今日もよろしく",
    domain: "general",
    category: "general",
    description: "挨拶 — 明らかに検索不要",
    expectedSearch: false,
  },
  {
    id: "internal_1",
    message: "僕の強みって何だと思う？",
    domain: "self",
    category: "general",
    description: "純粋内省 — パーソナルモデルで完結",
    expectedSearch: false,
  },
  {
    id: "ask_me_1",
    message: "何か質問してほしい",
    domain: "general",
    category: "general",
    description: "ask_me — 観測モード",
    expectedSearch: false,
  },
];

// ─── Evaluation ───────────────────────────────────────────────────────────

function buildMockQueryContext(domain: string): QueryContext {
  return {
    domain: domain as QueryContext["domain"],
    domain_confidence: 0.8,
    hidden_variables: {
      target_person: null,
      target_group: null,
      timeline: null,
      stakes: "medium",
      emotional_load: 0.5,
    },
    ambiguity_score: 0.3,
    information: {
      sufficiency: 0.5,
      missing_critical: [],
    },
  } as QueryContext;
}

async function runGateTests(): Promise<void> {
  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  Phase 0 Test 1: Search Gate 判定テスト");
  console.log("═══════════════════════════════════════════════════════\n");

  let passed = 0;
  let failed = 0;

  for (const tc of TEST_CASES) {
    const queryContext = buildMockQueryContext(tc.domain);
    const result = evaluateSearchGateTest(
      tc.message,
      queryContext,
      tc.category,
      3, // hdmPhase
      4, // trustLevel
      "conclude",
    );

    const match = result.shouldSearch === tc.expectedSearch;
    if (match) {
      passed++;
      console.log(`  ✅ ${tc.id}: ${tc.description}`);
      console.log(`     searchNeed=${result.searchNeed.toFixed(2)} → ${result.shouldSearch ? "FIRE" : "SKIP"} (${result.reason})`);
    } else {
      failed++;
      console.log(`  ❌ ${tc.id}: ${tc.description}`);
      console.log(`     Expected: ${tc.expectedSearch ? "FIRE" : "SKIP"}`);
      console.log(`     Got: searchNeed=${result.searchNeed.toFixed(2)} → ${result.shouldSearch ? "FIRE" : "SKIP"} (${result.reason})`);
    }
    console.log();
  }

  console.log(`  Gate Tests: ${passed}/${passed + failed} PASS\n`);
}

async function runSearchPipelineTest(): Promise<void> {
  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  Phase 0 Test 2: 検索パイプライン E2E テスト");
  console.log("═══════════════════════════════════════════════════════\n");

  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) {
    console.log("  ⚠️  EXA_API_KEY が未設定。検索パイプラインテストをスキップ。");
    console.log("  → .env に EXA_API_KEY=xxx を追加して再実行してください。\n");
    return;
  }

  // 検索が発火するテストケースのみ
  const searchCases = TEST_CASES.filter((tc) => tc.expectedSearch);

  for (const tc of searchCases.slice(0, 3)) {
    console.log(`  📡 Testing: ${tc.id} — "${tc.message.slice(0, 40)}..."`);
    const queryContext = buildMockQueryContext(tc.domain);

    console.log("     ⚠️  検索パイプライン E2E テストは API route 経由で実行してください。");
    console.log("     → server-only 制約により、スクリプトから直接 runAI / fetch を呼べません。");
    console.log("     → POST /api/stargazer/alter に perspectiveEngine が統合された後、");
    console.log("       同一質問で検索あり/なしの応答を比較してください。");
    console.log();
  }
}

async function runFailurePatternCheck(): Promise<void> {
  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  Phase 0 Test 3: 失敗パターン検出チェックリスト");
  console.log("═══════════════════════════════════════════════════════\n");

  console.log("  このテストは A/B 比較後に手動で評価する。");
  console.log("  以下の4パターンに該当しないことを確認:\n");
  console.log("  ❌ 失敗1: ChatGPT劣化版化");
  console.log("     → 検索結果をそれっぽく喋るだけになっていないか？");
  console.log("     → Alterの声（1文目結論、一人称）が維持されているか？\n");
  console.log("  ❌ 失敗2: 「いろんな意見があるね」bot化");
  console.log("     → 多視点を入れた結果、結論が弱くなっていないか？");
  console.log("     → ActionShape が具体的に選択されているか？\n");
  console.log("  ❌ 失敗3: 監査不能");
  console.log("     → source_type タグで内面推論と外部視点が区別できるか？");
  console.log("     → PerspectiveAudit に fragmentsUsed が記録されているか？\n");
  console.log("  ❌ 失敗4: 抽象的なまま");
  console.log("     → 検索を入れても具体性が向上していないケースはないか？");
  console.log("     → 5軸評価で「具体性」スコアが向上しているか？\n");
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("╔═══════════════════════════════════════════════════════╗");
  console.log("║  Perspective Engine Phase 0 Evaluation               ║");
  console.log("║  「返答の質がどれだけ変わるか」を測る                  ║");
  console.log("╚═══════════════════════════════════════════════════════╝");

  await runGateTests();
  await runSearchPipelineTest();
  await runFailurePatternCheck();

  console.log("\n══════════════════════════════════════════════════════");
  console.log("  評価完了");
  console.log("══════════════════════════════════════════════════════\n");
}

main().catch(console.error);
