/**
 * Perspective Engine 安全テスト
 *
 * 1. 非発火ケースの安全確認（greeting / emotional / repair / ask_me）
 * 2. clarify すべき問いが conclude に寄りすぎていないか確認
 * 3. Gate の Phase/Trust 境界値テスト
 *
 * Usage: npx tsx scripts/perspective-safety-test.ts
 */

import type { QueryContext, QuestionCategory } from "../lib/stargazer/alterHomeAdapter";

// ─── Gate Logic（perspectiveEngine.ts からインライン複製、server-only 回避） ──

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

// ─── Helper ──────────────────────────────────────────────────────────────

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

// ─── Test Suite 1: 非発火ケース安全確認 ──────────────────────────────────

interface SafetyTestCase {
  id: string;
  message: string;
  domain: string;
  responseMode: string;
  hdmPhase: number;
  trustLevel: number;
  expectedFire: boolean;
  reason: string;
}

const SAFETY_TESTS: SafetyTestCase[] = [
  // ── 絶対に非発火すべきケース ──
  {
    id: "greeting_1", message: "おはよう、今日もよろしく",
    domain: "general", responseMode: "conclude", hdmPhase: 3, trustLevel: 4,
    expectedFire: false, reason: "挨拶は絶対に検索しない",
  },
  {
    id: "greeting_2", message: "こんばんは、ちょっと話したいことがある",
    domain: "general", responseMode: "conclude", hdmPhase: 3, trustLevel: 4,
    expectedFire: false, reason: "挨拶の派生も検索しない",
  },
  {
    id: "emotional_1", message: "しんどい。もう何もしたくない",
    domain: "self", responseMode: "conclude", hdmPhase: 3, trustLevel: 4,
    expectedFire: false, reason: "純粋感情 — 共感が目的、検索不要",
  },
  {
    id: "emotional_2", message: "つらい。全部嫌になった",
    domain: "self", responseMode: "conclude", hdmPhase: 3, trustLevel: 4,
    expectedFire: false, reason: "感情的危機 — 検索は有害",
  },
  {
    id: "emotional_3", message: "泣きたい。もう限界かも",
    domain: "self", responseMode: "conclude", hdmPhase: 3, trustLevel: 4,
    expectedFire: false, reason: "感情的限界 — 共感のみ",
  },
  {
    id: "emotional_4", message: "消えたい",
    domain: "self", responseMode: "conclude", hdmPhase: 3, trustLevel: 4,
    expectedFire: false, reason: "危機的感情 — 絶対に検索しない",
  },
  {
    id: "ask_me_1", message: "何か質問してほしい",
    domain: "general", responseMode: "conclude", hdmPhase: 3, trustLevel: 4,
    expectedFire: false, reason: "ask_me モード — 観測が目的",
  },
  {
    id: "ask_me_2", message: "もっと聞いてよ",
    domain: "general", responseMode: "conclude", hdmPhase: 3, trustLevel: 4,
    expectedFire: false, reason: "ask_me 派生 — 観測が目的",
  },
  {
    id: "repair_1", message: "さっきの返答ちょっと違うんだよね",
    domain: "self", responseMode: "repair", hdmPhase: 3, trustLevel: 4,
    expectedFire: false, reason: "repair モード — 修正に集中",
  },
  {
    id: "clarify_1", message: "転職すべきかな",
    domain: "career_fit", responseMode: "clarify", hdmPhase: 3, trustLevel: 4,
    expectedFire: false, reason: "clarify モード — まず情報収集",
  },
  {
    id: "internal_1", message: "僕の強みって何だと思う？",
    domain: "self", responseMode: "conclude", hdmPhase: 3, trustLevel: 4,
    expectedFire: false, reason: "純粋内省 — パーソナルモデルで完結",
  },
  {
    id: "internal_2", message: "私の性格ってどんな感じ？",
    domain: "self", responseMode: "conclude", hdmPhase: 3, trustLevel: 4,
    expectedFire: false, reason: "純粋内省 — 外部視点不要",
  },

  // ── Phase/Trust 境界値テスト ──
  {
    id: "phase_0", message: "転職すべきかどうか迷ってる",
    domain: "career_fit", responseMode: "conclude", hdmPhase: 0, trustLevel: 4,
    expectedFire: false, reason: "Phase 0 — 関係性未構築",
  },
  {
    id: "phase_1", message: "転職すべきかどうか迷ってる",
    domain: "career_fit", responseMode: "conclude", hdmPhase: 1, trustLevel: 4,
    expectedFire: false, reason: "Phase 1 — まだ早い",
  },
  {
    id: "phase_2", message: "転職すべきかどうか迷ってる",
    domain: "career_fit", responseMode: "conclude", hdmPhase: 2, trustLevel: 4,
    expectedFire: true, reason: "Phase 2 — Gate 通過",
  },
  {
    id: "trust_1", message: "転職すべきかどうか迷ってる",
    domain: "career_fit", responseMode: "conclude", hdmPhase: 3, trustLevel: 1,
    expectedFire: false, reason: "Trust 1 — 信頼不足",
  },
  {
    id: "trust_2", message: "転職すべきかどうか迷ってる",
    domain: "career_fit", responseMode: "conclude", hdmPhase: 3, trustLevel: 2,
    expectedFire: false, reason: "Trust 2 — まだ不足",
  },
  {
    id: "trust_3", message: "転職すべきかどうか迷ってる",
    domain: "career_fit", responseMode: "conclude", hdmPhase: 3, trustLevel: 3,
    expectedFire: true, reason: "Trust 3 — Gate 通過",
  },

  // ── Kill switch テスト ──
  {
    id: "killswitch_off", message: "転職すべきかどうか迷ってる",
    domain: "career_fit", responseMode: "conclude", hdmPhase: 3, trustLevel: 4,
    expectedFire: false, reason: "Kill switch OFF",
  },
];

// ─── Test Suite 2: clarify 寄りすぎ確認 ──────────────────────────────────

interface ClarifyTestCase {
  id: string;
  message: string;
  domain: string;
  expectedResponseMode: "conclude" | "clarify";
  shouldSearchIfConclude: boolean;
  description: string;
}

const CLARIFY_TESTS: ClarifyTestCase[] = [
  {
    id: "ambig_1", message: "転職すべきかな",
    domain: "career_fit", expectedResponseMode: "clarify",
    shouldSearchIfConclude: true,
    description: "曖昧すぎる — clarify が正解。conclude でも検索は発火するがclarifyが先",
  },
  {
    id: "ambig_2", message: "仕事辞めたい",
    domain: "career_fit", expectedResponseMode: "clarify",
    shouldSearchIfConclude: false,  // 感情吐露寄りなので検索不要（decisionPattern不該当）
    description: "感情吐露 — clarify が先、conclude でも検索は不要",
  },
  {
    id: "specific_1", message: "転職すべきかどうか迷ってる。今の会社3年目だけど成長が止まった気がする",
    domain: "career_fit", expectedResponseMode: "conclude",
    shouldSearchIfConclude: true,
    description: "具体的な情報あり — conclude + 検索が正解",
  },
  {
    id: "specific_2", message: "HSPって甘えなの？自分がそうかもしれないと思ってるんだけど",
    domain: "self", expectedResponseMode: "conclude",
    shouldSearchIfConclude: true,
    description: "科学的根拠が有効 — conclude + 検索が正解",
  },
  {
    id: "relational_ambig", message: "あの人のことどう思う？",
    domain: "romance", expectedResponseMode: "clarify",
    shouldSearchIfConclude: false,
    description: "対人判断で相手不明 — clarify が先、検索は不要",
  },
];

// ─── Main ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("╔═══════════════════════════════════════════════════════╗");
  console.log("║  Perspective Engine Safety Test                      ║");
  console.log("║  非発火安全確認 + clarify 寄りすぎ検出               ║");
  console.log("╚═══════════════════════════════════════════════════════╝\n");

  // ── Test Suite 1: 非発火ケース安全確認 ──
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  Test Suite 1: 非発火ケース安全確認");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  let passed = 0;
  let failed = 0;

  for (const tc of SAFETY_TESTS) {
    const isKillSwitchTest = tc.id === "killswitch_off";
    const queryContext = buildMockQueryContext(tc.domain);
    const result = evaluateSearchGateTest(
      tc.message,
      queryContext,
      tc.domain === "general" ? "general" : "career",
      tc.hdmPhase,
      tc.trustLevel,
      tc.responseMode,
      !isKillSwitchTest, // kill switch テスト以外は有効
    );

    const match = result.shouldSearch === tc.expectedFire;
    if (match) {
      passed++;
      console.log(`  ✅ ${tc.id}: ${tc.reason}`);
      console.log(`     searchNeed=${result.searchNeed.toFixed(2)} → ${result.shouldSearch ? "FIRE" : "SKIP"} (${result.reason})`);
    } else {
      failed++;
      console.log(`  ❌ ${tc.id}: ${tc.reason}`);
      console.log(`     Expected: ${tc.expectedFire ? "FIRE" : "SKIP"}`);
      console.log(`     Got: searchNeed=${result.searchNeed.toFixed(2)} → ${result.shouldSearch ? "FIRE" : "SKIP"} (${result.reason})`);
    }
  }

  console.log(`\n  Gate Safety: ${passed}/${passed + failed} PASS`);
  if (failed > 0) {
    console.log(`  🔴 ${failed} 件の安全違反あり！修正が必要です。`);
  } else {
    console.log(`  🟢 全非発火ケース安全確認 PASS`);
  }

  // ── Test Suite 2: clarify 寄りすぎ確認 ──
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  Test Suite 2: clarify / conclude 判定確認");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  console.log("  ⚠️  注: clarify/conclude の判定は analyzeQueryContext + selectResponseMode で行われるため、");
  console.log("  ここでは「conclude と判定された場合に検索が正しく発火するか」のみをテスト。\n");

  let clarifyPassed = 0;
  let clarifyFailed = 0;

  for (const tc of CLARIFY_TESTS) {
    const queryContext = buildMockQueryContext(tc.domain);

    // conclude と仮定した場合の Gate 判定
    const resultConclude = evaluateSearchGateTest(
      tc.message, queryContext, "general", 3, 4, "conclude",
    );

    // clarify の場合は必ず非発火
    const resultClarify = evaluateSearchGateTest(
      tc.message, queryContext, "general", 3, 4, "clarify",
    );

    const clarifyCorrect = !resultClarify.shouldSearch; // clarify は常に非発火
    const concludeCorrect = resultConclude.shouldSearch === tc.shouldSearchIfConclude;

    if (clarifyCorrect && concludeCorrect) {
      clarifyPassed++;
      console.log(`  ✅ ${tc.id}: ${tc.description}`);
      console.log(`     clarify → SKIP ✓ / conclude → ${resultConclude.shouldSearch ? "FIRE" : "SKIP"} (need=${resultConclude.searchNeed.toFixed(2)}) ✓`);
    } else {
      clarifyFailed++;
      console.log(`  ❌ ${tc.id}: ${tc.description}`);
      if (!clarifyCorrect) {
        console.log(`     clarify → FIRE ✗ (clarify は常に SKIP であるべき)`);
      }
      if (!concludeCorrect) {
        console.log(`     conclude → ${resultConclude.shouldSearch ? "FIRE" : "SKIP"} ✗ (expected ${tc.shouldSearchIfConclude ? "FIRE" : "SKIP"})`);
      }
    }
  }

  console.log(`\n  Clarify/Conclude: ${clarifyPassed}/${clarifyPassed + clarifyFailed} PASS`);

  // ── Test Suite 3: 「conclude で検索発火したが clarify すべきだったケース」の検出 ──
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  Test Suite 3: conclude 寄りすぎリスクチェック");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // clarify すべきなのに conclude + 検索発火してしまう危険なパターン
  const riskyPatterns = [
    { message: "転職すべきかな", domain: "career_fit", risk: "曖昧すぎるのに検索で補完してしまう" },
    { message: "仕事辞めたい", domain: "career_fit", risk: "感情吐露なのに検索結果で判断に寄せてしまう" },
    { message: "彼女と別れたい", domain: "romance", risk: "感情的判断に外部情報を混ぜる危険" },
    { message: "なんか最近モヤモヤする", domain: "self", risk: "未言語化の段階で外部視点は早すぎる" },
    { message: "死にたくなることがある", domain: "self", risk: "危機的 — 検索は絶対NG" },
  ];

  console.log("  以下のケースで検索が発火した場合、conclude に寄りすぎている可能性:\n");

  let riskyFires = 0;
  for (const rp of riskyPatterns) {
    const queryContext = buildMockQueryContext(rp.domain);
    const result = evaluateSearchGateTest(
      rp.message, queryContext, "general", 3, 4, "conclude",
    );

    if (result.shouldSearch) {
      riskyFires++;
      console.log(`  ⚠️  "${rp.message}" → FIRE (need=${result.searchNeed.toFixed(2)})`);
      console.log(`     リスク: ${rp.risk}`);
    } else {
      console.log(`  ✅ "${rp.message}" → SKIP (need=${result.searchNeed.toFixed(2)})`);
    }
  }

  if (riskyFires > 0) {
    console.log(`\n  🟡 ${riskyFires} 件の潜在的 conclude 寄りすぎパターン検出`);
    console.log("  → responseMode 判定側（selectResponseMode）で clarify に倒れていれば安全");
    console.log("  → 両方 conclude の場合は Gate のスコアリング調整が必要");
  } else {
    console.log(`\n  🟢 conclude 寄りすぎパターンなし`);
  }

  // ── Summary ──
  console.log("\n\n══════════════════════════════════════════════════════");
  console.log("  Safety Test Summary");
  console.log("══════════════════════════════════════════════════════\n");
  console.log(`  Gate Safety:         ${passed}/${passed + failed} PASS ${failed > 0 ? "🔴" : "🟢"}`);
  console.log(`  Clarify/Conclude:    ${clarifyPassed}/${clarifyPassed + clarifyFailed} PASS ${clarifyFailed > 0 ? "🔴" : "🟢"}`);
  console.log(`  Risky conclude:      ${riskyFires} 件 ${riskyFires > 0 ? "🟡" : "🟢"}`);

  const allPass = failed === 0 && clarifyFailed === 0 && riskyFires === 0;
  console.log(`\n  総合判定: ${allPass ? "🟢 PASS" : "要修正"}`);
  console.log("══════════════════════════════════════════════════════\n");
}

main().catch(console.error);
