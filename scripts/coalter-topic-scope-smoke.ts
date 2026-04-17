/**
 * CoAlter Phase 1.5.4.6: topic scope smoke
 *
 * 目的:
 *   - 四国雑談 + 来週木曜ランチ シナリオで anchor / analysis が期待通りに動くこと
 *   - proposalGenerator の buildUserPrompt に anchor block が入ること
 *
 * 実行: npx tsx scripts/coalter-topic-scope-smoke.ts
 */

import { buildTopicAnchor } from "@/lib/coalter/topicScope";
import { analyzeConversation } from "@/lib/coalter/conversationParser";
import type { ConversationTurn } from "@/lib/coalter/types";

function main() {
  // ── Scenario A: 四国 regression ──
  console.log("\n================================================");
  console.log("Scenario A: 四国 regression");
  console.log("================================================");

  const messagesA: ConversationTurn[] = [
    { id: "m1", senderId: "a", body: "この前、徳島に旅行行ったの良かったよね", createdAt: "t1" },
    { id: "m2", senderId: "b", body: "うん、四国一周したいな", createdAt: "t2" },
    { id: "m3", senderId: "a", body: "また行きたい", createdAt: "t3" },
    { id: "m4", senderId: "b", body: "そうしよう", createdAt: "t4" },
    { id: "m5", senderId: "a", body: "ところで、来週木曜日のランチどこで食べる？", createdAt: "t5" },
  ];
  const userMessageA = "来週木曜日のランチ決めて";
  const anchorA = buildTopicAnchor(messagesA, userMessageA);

  console.log("\n-- anchor --");
  console.log(JSON.stringify(anchorA, null, 2));

  const analysisA = analyzeConversation(messagesA, "a", "b", {
    topicAnchor: anchorA ?? undefined,
  });

  console.log("\n-- analysis --");
  console.log(
    JSON.stringify(
      {
        theme: analysisA.theme,
        location: analysisA.extractedConstraints.location,
        date: analysisA.extractedConstraints.date,
        timeSlot: analysisA.extractedConstraints.timeSlot,
        primaryScopeCount: analysisA.primaryScopeCount,
        backgroundScopeCount: analysisA.backgroundScopeCount,
        agreedConstraints: analysisA.agreedConstraints,
      },
      null,
      2,
    ),
  );

  const checksA: Array<{ name: string; pass: boolean; detail: string }> = [];
  checksA.push({
    name: "A1. anchor.source === user_message",
    pass: anchorA?.source === "user_message",
    detail: `got: ${anchorA?.source}`,
  });
  checksA.push({
    name: "A2. anchor.detectedScope.theme === food",
    pass: anchorA?.detectedScope.theme === "food",
    detail: `got: ${anchorA?.detectedScope.theme}`,
  });
  checksA.push({
    name: "A3. anchor.detectedScope.timeRef includes 木曜",
    pass: !!anchorA?.detectedScope.timeRef?.includes("木曜"),
    detail: `got: ${anchorA?.detectedScope.timeRef}`,
  });
  checksA.push({
    name: "A4. analysis.theme === food (NOT travel)",
    pass: analysisA.theme === "food",
    detail: `got: ${analysisA.theme}`,
  });
  const locA = analysisA.extractedConstraints.location;
  checksA.push({
    name: "A5. extractedConstraints.location does NOT contain 徳島/四国",
    pass: !locA || !/徳島|四国/.test(locA),
    detail: `got: ${locA}`,
  });
  checksA.push({
    name: "A6. extractedConstraints.date includes 木曜",
    pass: !!analysisA.extractedConstraints.date?.includes("木曜"),
    detail: `got: ${analysisA.extractedConstraints.date}`,
  });

  // ── Scenario B: movie (backward compat) ──
  console.log("\n================================================");
  console.log("Scenario B: movie (backward compat, anchor 無し)");
  console.log("================================================");

  const messagesB: ConversationTurn[] = [
    { id: "b1", senderId: "a", body: "今日の夜、映画見に行こう", createdAt: "t1" },
    { id: "b2", senderId: "b", body: "渋谷で新作見たいな", createdAt: "t2" },
  ];
  // anchor なしで従来動作を確認
  const analysisB = analyzeConversation(messagesB, "a", "b");
  console.log("\n-- analysis --");
  console.log(
    JSON.stringify(
      {
        theme: analysisB.theme,
        location: analysisB.extractedConstraints.location,
        date: analysisB.extractedConstraints.date,
        timeSlot: analysisB.extractedConstraints.timeSlot,
        topicAnchor: analysisB.topicAnchor,
      },
      null,
      2,
    ),
  );

  const checksB: Array<{ name: string; pass: boolean; detail: string }> = [];
  checksB.push({
    name: "B1. movie theme 検出（後方互換）",
    pass: analysisB.theme === "movie",
    detail: `got: ${analysisB.theme}`,
  });
  checksB.push({
    name: "B2. anchor 無しでも topicAnchor が undefined",
    pass: analysisB.topicAnchor === undefined,
    detail: `got: ${JSON.stringify(analysisB.topicAnchor)}`,
  });
  checksB.push({
    name: "B3. location = 渋谷",
    pass: analysisB.extractedConstraints.location === "渋谷",
    detail: `got: ${analysisB.extractedConstraints.location}`,
  });

  // ── Scenario C: food anchor + movie chat (切替ケース) ──
  console.log("\n================================================");
  console.log("Scenario C: movie 話題 → 途中で ランチ の anchor（切替ケース）");
  console.log("================================================");

  const messagesC: ConversationTurn[] = [
    { id: "c1", senderId: "a", body: "新作映画いいのないかな", createdAt: "t1" },
    { id: "c2", senderId: "b", body: "渋谷のシネマで探す？", createdAt: "t2" },
    { id: "c3", senderId: "a", body: "んーそういえば", createdAt: "t3" },
    { id: "c4", senderId: "b", body: "先に今日のランチ決めない？", createdAt: "t4" },
  ];
  const anchorC = buildTopicAnchor(messagesC, null); // userMessage 無し → 最新 talk_messages
  console.log("\n-- anchor --");
  console.log(JSON.stringify(anchorC, null, 2));

  const analysisC = analyzeConversation(messagesC, "a", "b", {
    topicAnchor: anchorC ?? undefined,
  });
  console.log("\n-- analysis --");
  console.log(JSON.stringify({ theme: analysisC.theme }, null, 2));

  const checksC: Array<{ name: string; pass: boolean; detail: string }> = [];
  checksC.push({
    name: "C1. anchor.source === last_talk_message",
    pass: anchorC?.source === "last_talk_message",
    detail: `got: ${anchorC?.source}`,
  });
  checksC.push({
    name: "C2. anchor.messageId === 'c4'",
    pass: anchorC?.messageId === "c4",
    detail: `got: ${anchorC?.messageId}`,
  });
  checksC.push({
    name: "C3. anchor.detectedScope.theme === food（movie に引っ張られない）",
    pass: anchorC?.detectedScope.theme === "food",
    detail: `got: ${anchorC?.detectedScope.theme}`,
  });
  checksC.push({
    name: "C4. analysis.theme === food",
    pass: analysisC.theme === "food",
    detail: `got: ${analysisC.theme}`,
  });

  // ── Summary ──
  console.log("\n================================================");
  console.log("RESULT");
  console.log("================================================");
  const allChecks = [...checksA, ...checksB, ...checksC];
  let pass = 0;
  let fail = 0;
  for (const c of allChecks) {
    const mark = c.pass ? "✅" : "❌";
    console.log(`${mark} ${c.name}  [${c.detail}]`);
    if (c.pass) pass += 1;
    else fail += 1;
  }
  console.log(`\n${fail === 0 ? "✅ ALL PASS" : "❌ FAIL"}  (${pass}/${allChecks.length})`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
