#!/usr/bin/env npx tsx
/**
 * Phase 9: 中盤以降の会話追従性テスト
 * CEO固定10ケースで、follow-up / fatigue / creation / dissatisfaction の
 * ルーティングと domain 継承を検証する。
 */

import {
  classifyQuestionType,
  analyzeQueryContext,
  applyQuestionTypeOverride,
  selectResponseModeWithReason,
  detectFollowUp,
  isFatigueMessage,
  isCreationVisionTheme,
  isCreationContaminatingContext,
  classifyReaction,
  buildFatigueGuidancePromptBlock,
  buildDissatisfactionRevisionPromptBlock,
  buildFollowUpContinuationPromptBlock,
  buildFollowUpCorrectionPromptBlock,
  buildCreationDeepPromptBlock,
  buildCreationModePromptBlock,
  type FollowUpType,
  type QueryDomain,
} from "../lib/stargazer/alterHomeAdapter";

// CEO固定テストケース（会話順序あり）
interface TestTurn {
  msg: string;
  expectedDomain?: string;
  expectedFollowUp?: FollowUpType;
  expectedFatigue?: boolean;
  expectedMode?: string;
  description: string;
}

const CONVERSATION: TestTurn[] = [
  {
    msg: "こんにちは",
    expectedDomain: "general",
    expectedFollowUp: null,
    expectedFatigue: false,
    expectedMode: "direct_response",
    description: "TC1: 挨拶",
  },
  {
    msg: "何もないけど、話にきたよ",
    expectedDomain: "general",
    expectedFollowUp: null,
    expectedFatigue: false,
    expectedMode: "direct_response",
    description: "TC2: 雑談開始",
  },
  {
    msg: "最近忙しくてあんま寝れてないから、ちょっときつい",
    expectedDomain: undefined, // fatigue は domain 不問
    expectedFollowUp: null,
    expectedFatigue: true,
    expectedMode: "conclude",
    description: "TC3: 疲労/睡眠不足",
  },
  {
    msg: "正直、転職より、起業をしたい気持ちの方が強いんだよね。",
    expectedDomain: "creation",
    expectedFollowUp: null,
    expectedFatigue: false,
    description: "TC4: 起業意向 → creation domain",
  },
  {
    msg: "続けて",
    expectedFollowUp: "continuation",
    description: "TC5: 続けて → continuation follow-up",
  },
  {
    msg: "薄いな",
    expectedFollowUp: "dissatisfaction",
    description: "TC6: 薄いな → dissatisfaction follow-up",
  },
  {
    msg: "足を止めてるんじゃなくて、まだ準備段階ってこと",
    expectedFollowUp: "correction",
    description: "TC7: 軌道修正 → correction follow-up",
  },
  {
    msg: "今aneurasyncを作ってるけど、まだまだalterの質がひくい。alterが大きな転換点となるはずだから、ここをどうにかしてうまく市場に投入したい",
    expectedDomain: "creation",
    expectedFollowUp: null,
    expectedFatigue: false,
    description: "TC8: aneurasync/alter → creation deep",
  },
  {
    msg: "続けて",
    expectedFollowUp: "continuation",
    description: "TC9: 続けて → continuation (creation 継承)",
  },
  {
    msg: "なんか君、すごいアホになったね",
    expectedFollowUp: "dissatisfaction",
    description: "TC10: アホになったね → dissatisfaction",
  },
];

console.log("═══════════════════════════════════════════════════════════════");
console.log("  Phase 9: 中盤以降の会話追従性テスト");
console.log("═══════════════════════════════════════════════════════════════");
console.log("");

let passCount = 0;
let failCount = 0;
const results: string[] = [];

// 前ターンの ALTER 応答をシミュレート
let lastAlterContent: string | null = null;
let previousUserMsg: string | null = null;

for (let i = 0; i < CONVERSATION.length; i++) {
  const tc = CONVERSATION[i];
  const problems: string[] = [];

  console.log(`┌── ${tc.description}`);
  console.log(`│ 入力: 「${tc.msg}」`);

  // Step 1: Follow-up detection
  const followUp = detectFollowUp(tc.msg, lastAlterContent);
  console.log(`│ followUp: ${followUp ?? "null"}`);

  if (tc.expectedFollowUp !== undefined && followUp !== tc.expectedFollowUp) {
    problems.push(`followUp expected=${tc.expectedFollowUp} actual=${followUp}`);
  }

  // Step 2: Fatigue detection
  const fatigue = isFatigueMessage(tc.msg);
  console.log(`│ fatigue: ${fatigue}`);

  if (tc.expectedFatigue !== undefined && fatigue !== tc.expectedFatigue) {
    problems.push(`fatigue expected=${tc.expectedFatigue} actual=${fatigue}`);
  }

  // Step 3: Domain detection
  const questionType = classifyQuestionType(tc.msg);
  const queryContext = analyzeQueryContext(tc.msg);
  let effectiveDomain = queryContext.domain;

  // Follow-up domain inheritance simulation
  let inherited: QueryDomain | undefined;
  if (followUp && previousUserMsg) {
    const prevContext = analyzeQueryContext(previousUserMsg);
    if (prevContext.domain !== "general") {
      inherited = prevContext.domain;
      effectiveDomain = inherited;
    }
  }

  console.log(`│ questionType: ${questionType}`);
  console.log(`│ domain: ${queryContext.domain}${inherited ? ` → inherited: ${inherited}` : ""}`);

  if (tc.expectedDomain !== undefined && effectiveDomain !== tc.expectedDomain) {
    problems.push(`domain expected=${tc.expectedDomain} actual=${effectiveDomain}`);
  }

  // Step 4: Mode decision
  const rawMode = selectResponseModeWithReason(queryContext);
  let modeDecision = applyQuestionTypeOverride(rawMode, questionType);

  // Follow-up mode override simulation
  if (followUp === "dissatisfaction") {
    modeDecision = { mode: "repair", reason: "followup_dissatisfaction" };
  } else if (followUp === "continuation") {
    modeDecision = { mode: "conclude", reason: "followup_continuation" };
  } else if (followUp === "correction") {
    modeDecision = { mode: "repair", reason: "followup_correction" };
  } else if (fatigue) {
    modeDecision = { mode: "conclude", reason: "fatigue_guidance" };
  }

  console.log(`│ mode: ${modeDecision.mode} (${modeDecision.reason})`);

  if (tc.expectedMode !== undefined && modeDecision.mode !== tc.expectedMode) {
    problems.push(`mode expected=${tc.expectedMode} actual=${modeDecision.mode}`);
  }

  // Step 5: Prompt block check
  const promptBlocks: string[] = [];

  if (questionType === "greeting") promptBlocks.push("greeting");
  if (questionType === "chat_opening") promptBlocks.push("chat_opening");
  if (fatigue) promptBlocks.push("fatigue_guidance");
  if (effectiveDomain === "creation" || isCreationVisionTheme(tc.msg, previousUserMsg ? [previousUserMsg] : [])) {
    promptBlocks.push("creation_deep");
  }
  if (followUp === "dissatisfaction" && lastAlterContent) promptBlocks.push("dissatisfaction_revision");
  if (followUp === "continuation" && lastAlterContent) promptBlocks.push("continuation");
  if (followUp === "correction" && lastAlterContent) promptBlocks.push("correction");

  console.log(`│ promptBlocks: ${promptBlocks.length > 0 ? promptBlocks.join(", ") : "standard"}`);

  // Step 6: Creation contamination check
  if (effectiveDomain === "creation") {
    const contaminatingExamples = [
      "転職を検討中",
      "無職・求職中",
      "進路に関する動き",
      "キャリアチェンジを検討中",
    ];
    const filtered = contaminatingExamples.filter(c => isCreationContaminatingContext(c));
    console.log(`│ creation汚染フィルタ: ${filtered.length}/${contaminatingExamples.length} 件 suppress`);
  }

  // Step 7: Noisy signal check
  const shouldSuppressSignal =
    questionType === "greeting" ||
    questionType === "chat_opening" ||
    fatigue ||
    followUp !== null ||
    effectiveDomain === "creation";
  console.log(`│ signalSuppress: ${shouldSuppressSignal}`);

  // Result
  if (problems.length > 0) {
    console.log(`│ ❌ FAIL: ${problems.join(" / ")}`);
    failCount++;
  } else {
    console.log(`│ ✅ PASS`);
    passCount++;
  }
  console.log(`└──`);
  console.log("");

  // Simulate ALTER response for next turn's follow-up detection
  lastAlterContent = `[ALTER応答: ${tc.description}への返答シミュレーション]`;
  previousUserMsg = tc.msg;
}

// ━━━ サマリー ━━━
console.log("═══════════════════════════════════════════════════════════════");
console.log("  Phase 9 検証サマリー");
console.log("═══════════════════════════════════════════════════════════════");
console.log("");

// Follow-up domain inheritance verification
console.log("  ── Follow-up Domain 継承テスト ──");
const inheritCases = [
  { prev: "転職より起業したい", followUp: "続けて", expected: "creation" },
  { prev: "私にあってる職業って何？", followUp: "もっと", expected: "work" }, // career_fit is detected via isCareerFitQuery, not domain
  { prev: "今日の後半戦、どんな感じに動けばいいかな？", followUp: "薄いな", expected: "daily_guidance" },
  { prev: "aneurasyncを作ってる", followUp: "続けて", expected: "creation" },
];

for (const ic of inheritCases) {
  const prevCtx = analyzeQueryContext(ic.prev);
  const followUp = detectFollowUp(ic.followUp, "[ALTER応答]");
  const inherited = prevCtx.domain !== "general" ? prevCtx.domain : "general";
  const match = inherited === ic.expected;
  console.log(`  prev="${ic.prev.slice(0, 20)}" + "${ic.followUp}" → inherited=${inherited} expected=${ic.expected} ${match ? "✅" : "❌"}`);
}

console.log("");
console.log("  ── Creation 汚染フィルタ ──");
const contaminationTests = [
  { content: "転職を検討中", expected: true },
  { content: "無職・求職中", expected: true },
  { content: "進路に関する動きがある", expected: true },
  { content: "キャリアチェンジを検討中", expected: true },
  { content: "判断が慎重な傾向", expected: false },
  { content: "内向的な性格", expected: false },
  { content: "プロダクト開発に興味", expected: false },
];
for (const ct of contaminationTests) {
  const result = isCreationContaminatingContext(ct.content);
  const match = result === ct.expected;
  console.log(`  "${ct.content}" → suppress=${result} expected=${ct.expected} ${match ? "✅" : "❌"}`);
}

console.log("");
console.log("  ── Fatigue 検出テスト ──");
const fatigueTests = [
  { msg: "最近忙しくてあんま寝れてないから、ちょっときつい", expected: true },
  { msg: "疲れた", expected: false }, // too short → emotional
  { msg: "しんどいけど頑張る", expected: true },
  { msg: "寝不足できつい", expected: true },
  { msg: "体調悪い", expected: false }, // 8文字以下なので false
  { msg: "体調が悪くてきつい", expected: true },
  { msg: "転職したい", expected: false },
];
for (const ft of fatigueTests) {
  const result = isFatigueMessage(ft.msg);
  const match = result === ft.expected;
  console.log(`  "${ft.msg}" → fatigue=${result} expected=${ft.expected} ${match ? "✅" : "❌"}`);
}

console.log("");
console.log("  ── Dissatisfaction 検出テスト ──");
const dissatisfactionTests = [
  { msg: "薄いな", expected: "dissatisfaction" as FollowUpType },
  { msg: "浅いな", expected: "dissatisfaction" as FollowUpType },
  { msg: "アホになったね", expected: "dissatisfaction" as FollowUpType },
  { msg: "違う", expected: null as FollowUpType }, // too short for correction, not dissatisfaction pattern
  { msg: "前の方がましだった", expected: "dissatisfaction" as FollowUpType },
  { msg: "なんか君、すごいアホになったね", expected: "dissatisfaction" as FollowUpType },
];
for (const dt of dissatisfactionTests) {
  const result = detectFollowUp(dt.msg, "[ALTER応答]");
  const match = result === dt.expected;
  console.log(`  "${dt.msg}" → followUp=${result} expected=${dt.expected} ${match ? "✅" : "❌"}`);
}

console.log("");
console.log(`═══ 結果: ${passCount} PASS / ${failCount} FAIL ═══`);
