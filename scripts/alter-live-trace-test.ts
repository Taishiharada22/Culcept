#!/usr/bin/env npx tsx
/**
 * ライブ経路トレーステスト
 * CEO固定10ケースで、各検出関数を個別に呼び出し、
 * どこで潰れるかを特定する。
 */

import {
  classifyQuestionType,
  analyzeQueryContext,
  applyQuestionTypeOverride,
  selectResponseModeWithReason,
  isGreetingOnly,
  isChatOpening,
  isDelegationRequest,
  isCareerFitQuery,
  isIndustryFitQuery,
  isScopeDisclosureQuestion,
  isEmotionalQuestion,
  isSelfUnderstandingQuestion,
  isFactualRecallQuestion,
  isKnowledgeQuestion,
  isStrategyQuestion,
} from "../lib/stargazer/alterHomeAdapter";

const LIVE_CASES = [
  "こんにちわ",
  "何もないけど話そう",
  "なぜ判断が重い認定？",
  "明日はどうするべき？",
  "実際に動き始めるのはいつから？",
  "私には何が必要なの？",
  "私にあってる職業って何？",
  "もっと具体的に",
  "私の性格にあってる会社を教えて",
  "その業界の1日の流れをリサーチして送って",
];

console.log("═══════════════════════════════════════════════════════════════");
console.log("  ライブ経路トレース — 検出関数個別診断");
console.log("═══════════════════════════════════════════════════════════════");
console.log("");

for (const msg of LIVE_CASES) {
  console.log(`┌── 「${msg}」`);

  // Step 1: Individual detection functions (in classifyQuestionType order)
  const detections = {
    isGreetingOnly: isGreetingOnly(msg),
    isChatOpening: isChatOpening(msg),
    isScopeDisclosure: isScopeDisclosureQuestion(msg),
    isDelegationRequest: isDelegationRequest(msg),
    isEmotional: isEmotionalQuestion(msg),
    isSelfUnderstanding: isSelfUnderstandingQuestion(msg),
    isFactualRecall: isFactualRecallQuestion(msg),
    isKnowledge: isKnowledgeQuestion(msg),
    isStrategy: isStrategyQuestion(msg),
    isCareerFit: isCareerFitQuery(msg),
    isIndustryFit: isIndustryFitQuery(msg),
  };

  // Which detections fired?
  const fired = Object.entries(detections)
    .filter(([_, v]) => v)
    .map(([k]) => k);

  // Step 2: classifyQuestionType result
  const questionType = classifyQuestionType(msg);

  // Step 3: analyzeQueryContext
  const queryContext = analyzeQueryContext(msg);

  // Step 4: mode decision
  const rawMode = selectResponseModeWithReason(queryContext);
  const finalMode = applyQuestionTypeOverride(rawMode, questionType);

  // Step 5: effective domain (with override logic from route.ts)
  let effectiveDomain = queryContext.domain;
  if (isCareerFitQuery(msg)) effectiveDomain = "career_fit";
  if (isIndustryFitQuery(msg)) effectiveDomain = "industry_fit";

  // Step 6: what prompt block would fire?
  let promptBlock = "none";
  if (questionType === "greeting") promptBlock = "greeting";
  else if (questionType === "chat_opening") promptBlock = "chat_opening";
  else if (questionType === "delegation_request") promptBlock = "delegation";
  else if (effectiveDomain === "career_fit") promptBlock = "career_fit";
  else if (effectiveDomain === "industry_fit") promptBlock = "industry_fit";
  else if (effectiveDomain === "daily_guidance") promptBlock = "daily_guidance";
  else if (questionType === "factual_recall") promptBlock = "factual_recall";

  // Output
  console.log(`│ 検出関数: ${fired.length > 0 ? fired.join(", ") : "全て false → judgment fallback"}`);
  console.log(`│ questionType: ${questionType}`);
  console.log(`│ domain: ${queryContext.domain} (conf: ${queryContext.domain_confidence.toFixed(2)}) → effective: ${effectiveDomain}`);
  console.log(`│ mode: ${finalMode.mode} (${finalMode.reason})`);
  console.log(`│ promptBlock: ${promptBlock}`);

  // Identify problems
  const problems: string[] = [];

  // こんにちわ → should be greeting
  if (msg === "こんにちわ" && questionType !== "greeting") {
    problems.push(`greeting未検出: isGreetingOnly=${detections.isGreetingOnly}`);
  }
  // 何もないけど話そう → should be chat_opening
  if (msg === "何もないけど話そう" && questionType !== "chat_opening") {
    problems.push(`chat_opening未検出: isChatOpening=${detections.isChatOpening}`);
  }
  // 私にあってる職業 → should be career_fit
  if (msg.includes("職業") && effectiveDomain !== "career_fit") {
    problems.push(`career_fit未検出: isCareerFit=${detections.isCareerFit}`);
  }
  // 会社を教えて → should be career_fit or industry_fit
  if (msg.includes("会社を教えて") && effectiveDomain === "general") {
    problems.push(`career/industry未検出: isCareerFit=${detections.isCareerFit}, isIndustryFit=${detections.isIndustryFit}`);
  }
  // リサーチして送って → should NOT be generic judgment
  if (msg.includes("リサーチして") && questionType === "judgment" && promptBlock === "none") {
    problems.push("research/execution要求が汎用judgmentに落ちている");
  }
  // もっと具体的に → should trigger core demand
  if (msg === "もっと具体的に" && promptBlock === "none") {
    problems.push("core_demand未検出: 専用テンプレなし");
  }
  // daily guidance patterns
  if ((msg.includes("明日") || msg.includes("どうするべき")) && effectiveDomain !== "daily_guidance" && effectiveDomain !== "general") {
    // domain check
  }

  if (problems.length > 0) {
    console.log(`│ ⚠️  PROBLEMS: ${problems.join(" / ")}`);
  } else {
    console.log(`│ ✅ OK`);
  }
  console.log(`└──`);
  console.log("");
}

// ━━━ 問題分析サマリー ━━━
console.log("═══════════════════════════════════════════════════════════════");
console.log("  問題分析サマリー");
console.log("═══════════════════════════════════════════════════════════════");
console.log("");
console.log("  検出漏れパターン:");
console.log("");

// Check specific edge cases
const edgeCases = [
  { msg: "こんにちわ", fn: "isGreetingOnly", result: isGreetingOnly("こんにちわ") },
  { msg: "こんにちは", fn: "isGreetingOnly", result: isGreetingOnly("こんにちは") },
  { msg: "何もないけど話そう", fn: "isChatOpening", result: isChatOpening("何もないけど話そう") },
  { msg: "何もないけどお話ししよう", fn: "isChatOpening", result: isChatOpening("何もないけどお話ししよう") },
  { msg: "私にあってる職業って何？", fn: "isCareerFitQuery", result: isCareerFitQuery("私にあってる職業って何？") },
  { msg: "私には何があってる？", fn: "isCareerFitQuery", result: isCareerFitQuery("私には何があってる？") },
  { msg: "私の性格にあってる会社を教えて", fn: "isCareerFitQuery", result: isCareerFitQuery("私の性格にあってる会社を教えて") },
  { msg: "その業界の1日の流れをリサーチして送って", fn: "isIndustryFitQuery", result: isIndustryFitQuery("その業界の1日の流れをリサーチして送って") },
  { msg: "もっと具体的に", fn: "isDelegationRequest", result: isDelegationRequest("もっと具体的に") },
  { msg: "調べて", fn: "isKnowledge", result: isKnowledgeQuestion("調べて") },
  { msg: "リサーチして", fn: "isKnowledge", result: isKnowledgeQuestion("リサーチして") },
  { msg: "選考フローを教えて", fn: "isKnowledge", result: isKnowledgeQuestion("選考フローを教えて") },
  { msg: "会社名を挙げて", fn: "isKnowledge", result: isKnowledgeQuestion("会社名を挙げて") },
];

for (const ec of edgeCases) {
  const status = ec.result ? "✅ true" : "❌ false";
  console.log(`  ${ec.fn}("${ec.msg}") = ${status}`);
}

console.log("");
console.log("  ─── 未カバーの入力パターン ───");
const uncovered = [
  { msg: "調べて", type: classifyQuestionType("調べて"), expected: "execution_request" },
  { msg: "リサーチして", type: classifyQuestionType("リサーチして"), expected: "execution_request" },
  { msg: "送って", type: classifyQuestionType("送って"), expected: "execution_request" },
  { msg: "選考フローを教えて", type: classifyQuestionType("選考フローを教えて"), expected: "knowledge/execution" },
  { msg: "会社名を挙げて", type: classifyQuestionType("会社名を挙げて"), expected: "knowledge/execution" },
  { msg: "もっと具体的に", type: classifyQuestionType("もっと具体的に"), expected: "core_demand/delegation" },
  { msg: "私の性格にあってる会社を教えて", type: classifyQuestionType("私の性格にあってる会社を教えて"), expected: "career_fit" },
];

for (const u of uncovered) {
  const match = u.type === u.expected || u.expected.includes(u.type);
  console.log(`  「${u.msg}」→ actual: ${u.type}, expected: ${u.expected} ${match ? "✅" : "❌"}`);
}
