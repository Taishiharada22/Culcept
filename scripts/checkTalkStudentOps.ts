#!/usr/bin/env npx tsx
// scripts/checkTalkStudentOps.ts
// Talk Conversation Insight の student LLM 運用状況チェック
//
// 実行: npx tsx scripts/checkTalkStudentOps.ts
//
// チェック項目:
// 1. teacher_outputs の蓄積状況（talk_conversation_insight タスク）
// 2. student 出力の品質評価
// 3. 昇格判定

import { createClient } from "@supabase/supabase-js";
import { evaluateTalkStudentOutput, TALK_TASK_TYPE, TALK_PROMOTION_THRESHOLDS } from "../lib/genome/talkStudentTrack";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log("=== Talk Student Ops チェック ===\n");

  // 1. teacher_outputs 蓄積状況
  const { count: teacherCount } = await supabase
    .from("teacher_outputs")
    .select("id", { count: "exact", head: true })
    .eq("task_type", TALK_TASK_TYPE);

  console.log(`📚 Teacher outputs: ${teacherCount ?? 0} 件`);
  console.log(`   昇格に必要: ${TALK_PROMOTION_THRESHOLDS.min_sample_size} 件\n`);

  // 2. 最新のteacher出力を評価
  const { data: recentOutputs } = await supabase
    .from("teacher_outputs")
    .select("teacher_response, student_response, created_at")
    .eq("task_type", TALK_TASK_TYPE)
    .order("created_at", { ascending: false })
    .limit(20);

  if (recentOutputs && recentOutputs.length > 0) {
    let totalScore = 0;
    let passCount = 0;

    console.log("📊 直近の品質評価:");
    for (const output of recentOutputs) {
      const teacherEval = evaluateTalkStudentOutput(output.teacher_response ?? "");
      totalScore += teacherEval.score;
      if (teacherEval.score >= TALK_PROMOTION_THRESHOLDS.min_avg_score) passCount++;

      console.log(`   ${new Date(output.created_at).toLocaleDateString()} | Score: ${(teacherEval.score * 100).toFixed(0)}% | ${
        Object.entries(teacherEval.criteria).filter(([, v]) => v).map(([k]) => k).join(", ") || "FAIL"
      }`);
    }

    const avgScore = totalScore / recentOutputs.length;
    const passRate = passCount / recentOutputs.length;

    console.log(`\n📈 集計:`);
    console.log(`   平均スコア: ${(avgScore * 100).toFixed(1)}% (閾値: ${TALK_PROMOTION_THRESHOLDS.min_avg_score * 100}%)`);
    console.log(`   パス率: ${(passRate * 100).toFixed(1)}% (閾値: ${TALK_PROMOTION_THRESHOLDS.min_pass_rate * 100}%)`);
    console.log(`   サンプル数: ${recentOutputs.length} / ${TALK_PROMOTION_THRESHOLDS.min_sample_size}`);

    // 3. 昇格判定
    const readyForPromotion =
      (teacherCount ?? 0) >= TALK_PROMOTION_THRESHOLDS.min_sample_size &&
      avgScore >= TALK_PROMOTION_THRESHOLDS.min_avg_score &&
      passRate >= TALK_PROMOTION_THRESHOLDS.min_pass_rate;

    console.log(`\n🎯 昇格判定: ${readyForPromotion ? "✅ 昇格可能" : "❌ まだ早い"}`);

    if (!readyForPromotion) {
      const reasons: string[] = [];
      if ((teacherCount ?? 0) < TALK_PROMOTION_THRESHOLDS.min_sample_size) reasons.push(`サンプル不足（${teacherCount}/${TALK_PROMOTION_THRESHOLDS.min_sample_size}）`);
      if (avgScore < TALK_PROMOTION_THRESHOLDS.min_avg_score) reasons.push(`スコア不足（${(avgScore * 100).toFixed(1)}%）`);
      if (passRate < TALK_PROMOTION_THRESHOLDS.min_pass_rate) reasons.push(`パス率不足（${(passRate * 100).toFixed(1)}%）`);
      console.log(`   理由: ${reasons.join(", ")}`);
    }
  } else {
    console.log("📊 まだ出力データがありません。会話インサイトが生成されるとここに表示されます。");
  }

  // 4. ai_runs の蓄積状況
  const { count: runCount } = await supabase
    .from("ai_runs")
    .select("id", { count: "exact", head: true })
    .eq("task_type", TALK_TASK_TYPE);

  console.log(`\n🔄 AI Runs: ${runCount ?? 0} 件（全実行回数）`);

  console.log("\n=== チェック完了 ===");
}

main().catch(console.error);
