/**
 * P6: 関係マップ統合の体感検証スクリプト
 *
 * person_map が入ったことで「誰の話か」により返答が変わることを検証する。
 * buildTaggedFacts を直接呼び出し、facts 構成の差異を assert する。
 *
 * 実行: npx tsx scripts/verify-p6-person-map.ts
 */

import {
  buildTaggedFacts,
  buildPersonalizedFactsWithDomain,
  rankFactsForCategory,
  type PersonMapFactEntry,
  type TaggedFact,
  type HomeAlterContextData,
  type QuestionCategory,
} from "../lib/stargazer/alterHomeAdapter";
import type { AlterPersonality } from "../lib/stargazer/alter";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// テスト用のスタブ (最小限の人格データ)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const STUB_PERSONALITY: AlterPersonality = {
  archetypeCode: "INV",
  shadowCode: "ADV",
  dominantContradictions: [],
  contradictionAxes: [],
  suppressedTraits: [],
  overclaimedTraits: [],
  coreWound: "自分の居場所がないかもしれない",
  coreWoundShort: "居場所喪失",
  coreLabel: "探求者",
  stressLabel: "孤立回避",
  shadowCoreLabel: "冒険者",
  archetypeName: "探求者",
  shadowName: "冒険者",
  blindSpot: "他人の期待を過度に読もうとする",
  shadowBlindSpot: "衝動的な決断",
  axisScores: {
    introvert_vs_extrovert: 0.3, // 内向寄り
    cautious_vs_bold: 0.4,
    harmony_autonomy: 0.35,
  },
  strengths: ["深い洞察力", "独立した思考"],
  growthKey: "信頼できる少数との関係構築",
  coreFear: "孤立して理解されないこと",
  coreDesire: "深い理解と繋がり",
  safeState: "ひとりで考える時間が十分に確保できている",
  stressState: "予定が詰まり、回復時間が取れない",
  innerContradiction: "つながりを求めるが、深入りを恐れる",
};

const STUB_HOME_CONTEXT: HomeAlterContextData = {
  observationCount: 15,
  weather: { emoji: "🌤", label: "やや曇り", message: "少し疲れ気味" },
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ヘルパー
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail?: string): void {
  if (condition) {
    console.log(`  PASS: ${label}`);
    passed++;
  } else {
    console.error(`  FAIL: ${label}${detail ? ` -- ${detail}` : ""}`);
    failed++;
  }
}

function findPersonFacts(facts: TaggedFact[]): TaggedFact[] {
  return facts.filter((f) => f.source === "person");
}

function header(name: string): void {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${name}`);
  console.log(`${"=".repeat(60)}`);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// シナリオ 1: 同じ質問、異なる人物
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function scenario1(): void {
  header("シナリオ 1: 同じ質問、異なる人物");
  console.log("  質問: 「最近ちょっと距離感が難しい相手がいるんだけど...」");
  console.log("");

  // Case A: 上司 (boss)
  const caseA: PersonMapFactEntry[] = [
    {
      label: "上司",
      role: "boss",
      influence_score: 0.7,
      last_sentiment: "negative",
      sentiment_trend: "declining",
      mention_count: 5,
    },
  ];

  // Case B: 彼女 (partner)
  const caseB: PersonMapFactEntry[] = [
    {
      label: "彼女",
      role: "partner",
      influence_score: 0.8,
      last_sentiment: "mixed",
      sentiment_trend: "stable",
      mention_count: 8,
    },
  ];

  const factsA = buildTaggedFacts(STUB_PERSONALITY, STUB_HOME_CONTEXT, null, null, null, caseA);
  const factsB = buildTaggedFacts(STUB_PERSONALITY, STUB_HOME_CONTEXT, null, null, null, caseB);

  const personFactsA = findPersonFacts(factsA);
  const personFactsB = findPersonFacts(factsB);

  console.log("  --- Case A (上司, negative, declining) ---");
  for (const f of personFactsA) {
    console.log(`    [${f.source}] ${f.text}  tags=${f.tags.join(",")}`);
  }

  console.log("  --- Case B (彼女, mixed, stable) ---");
  for (const f of personFactsB) {
    console.log(`    [${f.source}] ${f.text}  tags=${f.tags.join(",")}`);
  }

  // 検証: 両方とも person facts が注入される
  assert(personFactsA.length === 1, "Case A: person fact が 1件注入される");
  assert(personFactsB.length === 1, "Case B: person fact が 1件注入される");

  // 検証: facts の内容が異なる
  assert(
    personFactsA[0]?.text !== personFactsB[0]?.text,
    "Case A と Case B で fact テキストが異なる",
    `A="${personFactsA[0]?.text}" / B="${personFactsB[0]?.text}"`,
  );

  // 検証: role ラベルが正しい
  assert(
    personFactsA[0]?.text.includes("上司"),
    "Case A: 「上司」が fact テキストに含まれる",
    personFactsA[0]?.text,
  );
  assert(
    personFactsB[0]?.text.includes("パートナー"),
    "Case B: 「パートナー」が fact テキストに含まれる",
    personFactsB[0]?.text,
  );

  // 検証: sentiment/trend の反映
  assert(
    personFactsA[0]?.text.includes("ストレス") || personFactsA[0]?.text.includes("ネガティブ"),
    "Case A: negative sentiment が fact に反映される",
    personFactsA[0]?.text,
  );
  assert(
    personFactsB[0]?.text.includes("複雑"),
    "Case B: mixed sentiment が fact に反映される",
    personFactsB[0]?.text,
  );

  // 検証: social_load タグが付いている
  assert(personFactsA[0]?.tags.includes("social_load"), "Case A: social_load タグが付いている");
  assert(personFactsB[0]?.tags.includes("social_load"), "Case B: social_load タグが付いている");
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// シナリオ 2: influence_score による閾値効果
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function scenario2(): void {
  header("シナリオ 2: influence_score による閾値効果");
  console.log("  同じ人物で influence_score = 0.3 vs 0.7");
  console.log("  閾値: influence_score >= 0.5 AND mention_count >= 2");
  console.log("");

  // Case A: influence_score = 0.3 (閾値未満)
  const lowInfluence: PersonMapFactEntry[] = [
    {
      label: "知人A",
      role: "acquaintance",
      influence_score: 0.3,
      last_sentiment: "negative",
      sentiment_trend: "declining",
      mention_count: 5,
    },
  ];

  // Case B: influence_score = 0.7 (閾値以上)
  const highInfluence: PersonMapFactEntry[] = [
    {
      label: "知人A",
      role: "acquaintance",
      influence_score: 0.7,
      last_sentiment: "negative",
      sentiment_trend: "declining",
      mention_count: 5,
    },
  ];

  const factsLow = buildTaggedFacts(STUB_PERSONALITY, STUB_HOME_CONTEXT, null, null, null, lowInfluence);
  const factsHigh = buildTaggedFacts(STUB_PERSONALITY, STUB_HOME_CONTEXT, null, null, null, highInfluence);

  const personFactsLow = findPersonFacts(factsLow);
  const personFactsHigh = findPersonFacts(factsHigh);

  console.log(`  Low influence (0.3): person facts = ${personFactsLow.length}件`);
  console.log(`  High influence (0.7): person facts = ${personFactsHigh.length}件`);

  assert(personFactsLow.length === 0, "influence_score=0.3 は facts に注入されない (< 0.5 閾値)");
  assert(personFactsHigh.length === 1, "influence_score=0.7 は facts に注入される (>= 0.5 閾値)");

  // 境界値: ちょうど 0.5
  const borderInfluence: PersonMapFactEntry[] = [
    {
      label: "同僚B",
      role: "colleague",
      influence_score: 0.5,
      last_sentiment: "neutral",
      sentiment_trend: "stable",
      mention_count: 3,
    },
  ];
  const factsBorder = buildTaggedFacts(STUB_PERSONALITY, STUB_HOME_CONTEXT, null, null, null, borderInfluence);
  const personFactsBorder = findPersonFacts(factsBorder);
  console.log(`  Border influence (0.5): person facts = ${personFactsBorder.length}件`);
  assert(personFactsBorder.length === 1, "influence_score=0.5 は facts に注入される (>= 0.5 境界値)");

  // mention_count 閾値: mention_count = 1 (< 2)
  const lowMention: PersonMapFactEntry[] = [
    {
      label: "先輩C",
      role: "senior",
      influence_score: 0.7,
      last_sentiment: "negative",
      sentiment_trend: "declining",
      mention_count: 1,
    },
  ];
  const factsLowMention = buildTaggedFacts(STUB_PERSONALITY, STUB_HOME_CONTEXT, null, null, null, lowMention);
  const personFactsLowMention = findPersonFacts(factsLowMention);
  console.log(`  Low mention count (1): person facts = ${personFactsLowMention.length}件`);
  assert(
    personFactsLowMention.length === 0,
    "mention_count=1 は facts に注入されない (< 2 閾値)",
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// シナリオ 3: sentiment_trend の反映
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function scenario3(): void {
  header("シナリオ 3: sentiment_trend の反映");
  console.log("  同じ人物で trend=improving vs trend=declining");
  console.log("");

  const improving: PersonMapFactEntry[] = [
    {
      label: "母",
      role: "parent",
      influence_score: 0.8,
      last_sentiment: "positive",
      sentiment_trend: "improving",
      mention_count: 10,
    },
  ];

  const declining: PersonMapFactEntry[] = [
    {
      label: "母",
      role: "parent",
      influence_score: 0.8,
      last_sentiment: "negative",
      sentiment_trend: "declining",
      mention_count: 10,
    },
  ];

  const factsImproving = buildTaggedFacts(STUB_PERSONALITY, STUB_HOME_CONTEXT, null, null, null, improving);
  const factsDeclining = buildTaggedFacts(STUB_PERSONALITY, STUB_HOME_CONTEXT, null, null, null, declining);

  const pImproving = findPersonFacts(factsImproving);
  const pDeclining = findPersonFacts(factsDeclining);

  console.log("  --- trend=improving ---");
  for (const f of pImproving) console.log(`    ${f.text}`);
  console.log("  --- trend=declining ---");
  for (const f of pDeclining) console.log(`    ${f.text}`);

  assert(pImproving.length === 1, "improving: person fact が注入される");
  assert(pDeclining.length === 1, "declining: person fact が注入される");

  // テキストの違いを検証
  assert(
    pImproving[0]?.text !== pDeclining[0]?.text,
    "improving と declining で fact テキストが異なる",
    `improving="${pImproving[0]?.text}" / declining="${pDeclining[0]?.text}"`,
  );

  // improving は「良くなっている」を含む
  assert(
    pImproving[0]?.text.includes("良くなっている"),
    "improving: 「良くなっている」が含まれる",
    pImproving[0]?.text,
  );

  // declining は「ストレス」を含む
  assert(
    pDeclining[0]?.text.includes("ストレス"),
    "declining: 「ストレス」が含まれる",
    pDeclining[0]?.text,
  );

  // stable trend: テキストにトレンド言及なし
  const stable: PersonMapFactEntry[] = [
    {
      label: "母",
      role: "parent",
      influence_score: 0.8,
      last_sentiment: "neutral",
      sentiment_trend: "stable",
      mention_count: 10,
    },
  ];
  const factsStable = buildTaggedFacts(STUB_PERSONALITY, STUB_HOME_CONTEXT, null, null, null, stable);
  const pStable = findPersonFacts(factsStable);
  console.log("  --- trend=stable, sentiment=neutral ---");
  for (const f of pStable) console.log(`    ${f.text}`);

  assert(pStable.length === 1, "stable: person fact が注入される");
  assert(
    !pStable[0]?.text.includes("良くなっている") && !pStable[0]?.text.includes("ストレス"),
    "stable/neutral: トレンドやネガティブ感情の言及がない",
    pStable[0]?.text,
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// シナリオ 4: 複数人物の優先度 (上位2人のみ)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function scenario4(): void {
  header("シナリオ 4: 複数人物の優先度 (上位2人のみ)");
  console.log("  5人: influence 0.9, 0.7, 0.6, 0.5(=境界), 0.3(=閾値未満)");
  console.log("  全員 mention_count >= 2");
  console.log("");

  const fivePeople: PersonMapFactEntry[] = [
    { label: "彼女", role: "partner", influence_score: 0.9, last_sentiment: "positive", sentiment_trend: "improving", mention_count: 20 },
    { label: "上司", role: "boss", influence_score: 0.7, last_sentiment: "negative", sentiment_trend: "declining", mention_count: 8 },
    { label: "母", role: "parent", influence_score: 0.6, last_sentiment: "mixed", sentiment_trend: "stable", mention_count: 5 },
    { label: "同僚", role: "colleague", influence_score: 0.5, last_sentiment: "neutral", sentiment_trend: "stable", mention_count: 3 },
    { label: "知人", role: "acquaintance", influence_score: 0.3, last_sentiment: "neutral", sentiment_trend: "stable", mention_count: 2 },
  ];

  const facts = buildTaggedFacts(STUB_PERSONALITY, STUB_HOME_CONTEXT, null, null, null, fivePeople);
  const personFacts = findPersonFacts(facts);

  console.log(`  注入された person facts: ${personFacts.length}件`);
  for (const f of personFacts) {
    console.log(`    ${f.text}`);
  }

  // 検証: 上位2人のみが注入される (0.9, 0.7)
  // 0.3 は閾値未満なので除外 -> 有効候補は 0.9, 0.7, 0.6, 0.5 の4人
  // そこから上位2人 = 0.9 (彼女) と 0.7 (上司)
  assert(personFacts.length === 2, "上位2人のみが facts に注入される", `実際=${personFacts.length}件`);

  // 1位: 彼女 (0.9)
  assert(
    personFacts[0]?.text.includes("彼女"),
    "1位: 彼女 (influence=0.9) が最初に注入される",
    personFacts[0]?.text,
  );

  // 2位: 上司 (0.7)
  assert(
    personFacts[1]?.text.includes("上司"),
    "2位: 上司 (influence=0.7) が2番目に注入される",
    personFacts[1]?.text,
  );

  // 3位以下は含まれない
  const allText = personFacts.map((f) => f.text).join(" ");
  assert(!allText.includes("母（"), "3位: 母 (influence=0.6) は注入されない");
  assert(!allText.includes("同僚"), "4位: 同僚 (influence=0.5) は注入されない");
  assert(!allText.includes("知人"), "5位: 知人 (influence=0.3) は注入されない (閾値未満)");
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// シナリオ 5: 公開 API (buildPersonalizedFactsWithDomain) 経由
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function scenario5(): void {
  header("シナリオ 5: 公開 API 経由 -- person_map が最終出力に影響するか");
  console.log("  buildPersonalizedFactsWithDomain で「contact」カテゴリを比較");
  console.log("");

  const withPerson: PersonMapFactEntry[] = [
    {
      label: "上司",
      role: "boss",
      influence_score: 0.7,
      last_sentiment: "negative",
      sentiment_trend: "declining",
      mention_count: 5,
    },
  ];

  const factsWithout = buildPersonalizedFactsWithDomain(
    STUB_PERSONALITY,
    STUB_HOME_CONTEXT,
    "contact",
    null, // no domain overlay
    null, // no environment context
    null, // no hypotheses
    null, // no baseline deviations
    null, // no person map
  );

  const factsWith = buildPersonalizedFactsWithDomain(
    STUB_PERSONALITY,
    STUB_HOME_CONTEXT,
    "contact",
    null,
    null,
    null,
    null,
    withPerson,
  );

  console.log("  --- Without person_map ---");
  factsWithout.forEach((f, i) => console.log(`    [${i}] ${f}`));
  console.log("  --- With person_map (上司, negative, declining) ---");
  factsWith.forEach((f, i) => console.log(`    [${i}] ${f}`));

  // 検証: person_map がある方に「上司」が含まれる
  const hasPersonRef = factsWith.some((f) => f.includes("上司"));
  assert(hasPersonRef, "公開 API 経由で「上司」が最終 facts に含まれる");

  // 検証: person_map がない方に「上司」は含まれない
  const hasPersonRefWithout = factsWithout.some((f) => f.includes("上司"));
  assert(!hasPersonRefWithout, "person_map なしでは「上司」は最終 facts に含まれない");

  // 検証: 出力が異なる
  const withStr = factsWith.join("|");
  const withoutStr = factsWithout.join("|");
  assert(withStr !== withoutStr, "person_map の有無で最終 facts が異なる");
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// シナリオ 6: alterUnderstanding の関数検証
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import {
  extractPersonMentions,
  computeInfluenceScore,
  updateSentimentTrend,
} from "../lib/stargazer/alterUnderstanding";

function scenario6(): void {
  header("シナリオ 6: alterUnderstanding の関数単体検証");

  // --- extractPersonMentions ---
  console.log("\n  [extractPersonMentions]");

  const mentions1 = extractPersonMentions("上司が最近厳しくてストレスがすごい");
  console.log(`    "上司が最近厳しくてストレスがすごい" -> ${JSON.stringify(mentions1)}`);
  assert(mentions1.length >= 1, "上司への言及を検出");
  assert(mentions1[0]?.role === "boss", "role が boss");
  assert(mentions1[0]?.sentiment === "negative", "sentiment が negative (ストレス)");

  const mentions2 = extractPersonMentions("彼女に感謝してるけど、ちょっと怖いところもある");
  console.log(`    "彼女に感謝してるけど、ちょっと怖いところもある" -> ${JSON.stringify(mentions2)}`);
  assert(mentions2.length >= 1, "彼女への言及を検出");
  assert(mentions2[0]?.role === "partner", "role が partner");
  assert(mentions2[0]?.sentiment === "mixed", "sentiment が mixed (感謝+怖い)");

  const mentions3 = extractPersonMentions("今日は天気がいいね");
  console.log(`    "今日は天気がいいね" -> ${JSON.stringify(mentions3)}`);
  assert(mentions3.length === 0, "人物言及なし -> 空配列");

  // --- computeInfluenceScore ---
  console.log("\n  [computeInfluenceScore]");

  const partnerScore = computeInfluenceScore(10, "partner", "negative");
  const acquaintanceScore = computeInfluenceScore(2, "acquaintance", "neutral");
  console.log(`    partner, 10mentions, negative -> ${partnerScore.toFixed(3)}`);
  console.log(`    acquaintance, 2mentions, neutral -> ${acquaintanceScore.toFixed(3)}`);
  assert(partnerScore > acquaintanceScore, "partner は acquaintance より influence_score が高い");
  assert(partnerScore >= 0.5, "partner の influence_score は閾値 0.5 以上");

  // role weight 比較
  const bossScore = computeInfluenceScore(5, "boss", "negative");
  const friendScore = computeInfluenceScore(5, "friend", "negative");
  console.log(`    boss, 5mentions, negative -> ${bossScore.toFixed(3)}`);
  console.log(`    friend, 5mentions, negative -> ${friendScore.toFixed(3)}`);
  assert(bossScore > friendScore, "boss は friend より influence_score が高い (同条件)");

  // --- updateSentimentTrend ---
  console.log("\n  [updateSentimentTrend]");

  const t1 = updateSentimentTrend("stable", "negative", "positive");
  console.log(`    stable + negative->positive = ${t1}`);
  assert(t1 === "improving", "negative->positive は improving");

  const t2 = updateSentimentTrend("stable", "positive", "negative");
  console.log(`    stable + positive->negative = ${t2}`);
  assert(t2 === "declining", "positive->negative は declining");

  const t3 = updateSentimentTrend("improving", "positive", "positive");
  console.log(`    improving + positive->positive = ${t3}`);
  assert(t3 === "improving", "positive->positive は前のトレンド維持 (improving)");

  const t4 = updateSentimentTrend(null, null, "positive");
  console.log(`    null + null->positive = ${t4}`);
  assert(t4 === "stable", "初回はデフォルト stable");
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 実行
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function main(): void {
  console.log("P6 関係マップ統合 -- 体感検証スクリプト");
  console.log("========================================");

  scenario1();
  scenario2();
  scenario3();
  scenario4();
  scenario5();
  scenario6();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  結果: ${passed} PASS / ${failed} FAIL / ${passed + failed} TOTAL`);
  console.log(`${"=".repeat(60)}`);

  if (failed > 0) {
    process.exit(1);
  }
}

main();
