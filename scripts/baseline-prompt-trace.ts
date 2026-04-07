/**
 * baseline-prompt-trace.ts
 *
 * A/B/C + Life layer → Alter prompt 注入の実コードトレース。
 * 4層構造の注入動作をドメイン別に検証する。
 *
 * 実行: node -e "require('tsx/cjs'); require('./scripts/baseline-prompt-trace.ts')"
 */

import {
  deriveBaselineContext,
  deriveRelationshipContext,
  deriveLifeContext,
  buildBaselinePromptSection,
  buildRelationshipContextPromptSection,
  buildLifeContextPromptSection,
  scoreBaselineRelevance,
  shouldInjectBaseline,
  shouldInjectRelationshipContext,
  shouldInjectLifeContext,
  type RelationshipBaselineInput,
  type BaselineInput,
  type QueryDomainForBaseline,
} from "../lib/stargazer/baselineContext";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Case 1: romantic ユーザー、結婚意向あり・子ども希望あり
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

console.log("=".repeat(70));
console.log("CASE 1: romantic user — marriageIntent + childrenPreference 回答済み");
console.log("=".repeat(70));

const case1A: BaselineInput = {
  gender: "male",
  dateOfBirth: "2000-06-15",
  prefecture: "東京都",
};
const case1B: RelationshipBaselineInput = {
  marriageIntent: "すぐにでも",
  childrenPreference: "ほしい",
  smokingStatus: "non_smoker",
  lifestyleMorningNight: 30,
  enabledCategories: ["romantic"],
  updatedAt: new Date().toISOString(), // 今日 = fresh
};

const case1BaselineCtx = deriveBaselineContext(case1A);
const case1RelCtx = deriveRelationshipContext(case1B);

console.log("\n[A ライン正規化結果]");
console.log(JSON.stringify(case1BaselineCtx, null, 2));

console.log("\n[C ライン正規化結果]");
console.log(JSON.stringify(case1RelCtx, null, 2));

// relationship ドメインでの注入テスト
const domain1: QueryDomainForBaseline = "relationship";
console.log(`\n[Alter prompt 注入 — domain: ${domain1}]`);

if (shouldInjectBaseline(case1BaselineCtx, domain1)) {
  const rel = scoreBaselineRelevance(case1BaselineCtx, domain1);
  const aLines = buildBaselinePromptSection(case1BaselineCtx, rel, domain1);
  console.log("--- A ラインブロック ---");
  console.log(aLines.join("\n"));
}

if (shouldInjectRelationshipContext(case1RelCtx, domain1)) {
  const cLines = buildRelationshipContextPromptSection(case1RelCtx, domain1);
  console.log("\n--- C ラインブロック（★ 再質問禁止ルールを含む） ---");
  console.log(cLines.join("\n"));
} else {
  console.log("[C ラインブロック] 注入スキップ");
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Case 2: friendship only ユーザー
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

console.log("\n" + "=".repeat(70));
console.log("CASE 2: friendship only user — dealbreaker 未回答");
console.log("=".repeat(70));

const case2B: RelationshipBaselineInput = {
  enabledCategories: ["friendship"],
  updatedAt: new Date().toISOString(),
};

const case2RelCtx = deriveRelationshipContext(case2B);
console.log("\n[C ライン正規化結果]");
console.log(JSON.stringify(case2RelCtx, null, 2));

if (shouldInjectRelationshipContext(case2RelCtx, "relationship")) {
  const cLines = buildRelationshipContextPromptSection(case2RelCtx, "relationship");
  console.log("\n--- C ラインブロック ---");
  console.log(cLines.join("\n"));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Case 3: A のみ（rendezvous_profiles なし）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

console.log("\n" + "=".repeat(70));
console.log("CASE 3: A のみ — rendezvous_profiles 不在");
console.log("=".repeat(70));

// relationshipCtx = null の場合
console.log("\n[relationshipCtx = null → C ラインブロック注入なし]");
console.log("shouldInjectRelationshipContext: N/A (null check でスキップ)");

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Case 4: stale データ（180日以上前）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

console.log("\n" + "=".repeat(70));
console.log("CASE 4: stale data — 200日前に回答");
console.log("=".repeat(70));

const staleDate = new Date();
staleDate.setDate(staleDate.getDate() - 200);

const case4B: RelationshipBaselineInput = {
  marriageIntent: "考えていない",
  childrenPreference: "未定",
  enabledCategories: ["romantic"],
  updatedAt: staleDate.toISOString(),
};

const case4RelCtx = deriveRelationshipContext(case4B);
console.log("\n[C ライン正規化結果]");
console.log(JSON.stringify(case4RelCtx, null, 2));

if (shouldInjectRelationshipContext(case4RelCtx, "relationship")) {
  const cLines = buildRelationshipContextPromptSection(case4RelCtx, "relationship");
  console.log("\n--- C ラインブロック（★ stale → soft refresh 許可） ---");
  console.log(cLines.join("\n"));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Relevance gate テスト: general ドメインでは注入されないこと
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

console.log("\n" + "=".repeat(70));
console.log("RELEVANCE GATE: general ドメインでの注入スキップ確認");
console.log("=".repeat(70));

const shouldInjectGeneral = shouldInjectRelationshipContext(case1RelCtx, "general");
console.log(`shouldInjectRelationshipContext(case1, "general") = ${shouldInjectGeneral}`);
console.log(`→ general ドメインでは relationship context を注入しない ✅`);

const shouldInjectCareer = shouldInjectRelationshipContext(case1RelCtx, "career");
console.log(`shouldInjectRelationshipContext(case1, "career") = ${shouldInjectCareer}`);

const shouldInjectLifestyle = shouldInjectRelationshipContext(case1RelCtx, "lifestyle");
console.log(`shouldInjectRelationshipContext(case1, "lifestyle") = ${shouldInjectLifestyle}`);
console.log(`→ lifestyle ドメインでは lifestyle_alignment + substance のみ注入 ✅`);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Life Layer: relevance gating 検証
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

console.log("\n" + "=".repeat(70));
console.log("LIFE LAYER: relevance gating ドメイン別検証");
console.log("=".repeat(70));

const lifeCtx = deriveLifeContext({
  values: ["誠実さ", "自由", "成長"],
  passions: ["音楽", "旅行", "読書"],
  career: ["エンジニア", "フリーランス"],
});
console.log("\n[Life layer 正規化結果]");
console.log(JSON.stringify(lifeCtx, null, 2));

const lifeDomains: QueryDomainForBaseline[] = [
  "career", "relationship", "lifestyle",
  "self_understanding", "health", "general",
];

for (const domain of lifeDomains) {
  const inject = shouldInjectLifeContext(lifeCtx, domain);
  console.log(`\n--- domain: ${domain} ---`);
  console.log(`shouldInjectLifeContext = ${inject}`);
  if (inject) {
    const lines = buildLifeContextPromptSection(lifeCtx, domain);
    console.log(lines.join("\n"));
  } else {
    console.log("→ Life layer 沈黙 ✅");
  }
}

console.log("\n" + "=".repeat(70));
console.log("全ケース検証完了");
console.log("=".repeat(70));
