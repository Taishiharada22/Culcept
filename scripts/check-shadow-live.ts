/**
 * check-shadow-live.ts
 *
 * Gap C: Shadow pipeline 稼働確認スクリプト
 *
 * 確認項目:
 * 1. STARGAZER_SHADOW_ENABLED / ORBITER_SHADOW_ENABLED / IDENTITY_SHADOW_ENABLED 環境変数
 * 2. ai_runs テーブルに直近7日間の shadow runs が存在するか
 * 3. teacher_outputs が生成されているか
 * 4. ai_eval_runs に shadow eval 結果が蓄積されているか
 * 5. Pass 率 (domain別)
 * 6. student_eval_cases の件数（fine-tune データセット準備状況）
 *
 * Usage:
 *   npx tsx scripts/check-shadow-live.ts
 *   LOOKBACK_HOURS=48 npx tsx scripts/check-shadow-live.ts
 */

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

const LOOKBACK_HOURS = Number(process.env.LOOKBACK_HOURS ?? "168"); // 7日間デフォルト

// ── Emoji helpers ──────────────────────────────────────────────────────────
const OK = "✓";
const WARN = "⚠";
const ERR = "✗";

function status(ok: boolean, warn = false) {
  if (ok) return OK;
  if (warn) return WARN;
  return ERR;
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceRole) {
    throw new Error("missing_supabase_env: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  }

  const supabase = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const cutoff = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();
  const nowStr = new Date().toISOString().slice(0, 16).replace("T", " ");

  console.log(`\n[check-shadow-live] ${nowStr} | lookback=${LOOKBACK_HOURS}h`);
  console.log("=".repeat(60));

  // ── 1. 環境変数チェック ────────────────────────────────────────────────
  console.log("\n## 1. 環境変数");
  const stargazerEnabled = ["1", "true", "yes", "on"].includes(
    (process.env.STARGAZER_SHADOW_ENABLED ?? "").toLowerCase()
  );
  const orbiterEnabled = ["1", "true", "yes", "on"].includes(
    (process.env.ORBITER_SHADOW_ENABLED ?? "").toLowerCase()
  );
  const identityEnabled = ["1", "true", "yes", "on"].includes(
    (process.env.IDENTITY_SHADOW_ENABLED ?? "").toLowerCase()
  );
  const teacherEnabled = !["0", "false", "no", "off"].includes(
    (process.env.AI_TEACHER_GENERATION_ENABLED ?? "true").toLowerCase()
  );

  const stargazerPct = process.env.STARGAZER_SHADOW_SAMPLE_PERCENT ?? "100";
  const orbiterPct = process.env.ORBITER_SHADOW_SAMPLE_PERCENT ?? "100";
  const identityPct = process.env.IDENTITY_SHADOW_SAMPLE_PERCENT ?? "100";

  console.log(`  ${status(stargazerEnabled)} STARGAZER_SHADOW_ENABLED = ${process.env.STARGAZER_SHADOW_ENABLED ?? "(未設定→デフォルトfalse)"}`);
  console.log(`  ${status(orbiterEnabled)}   ORBITER_SHADOW_ENABLED   = ${process.env.ORBITER_SHADOW_ENABLED ?? "(未設定→デフォルトfalse)"}`);
  console.log(`  ${status(identityEnabled)}   IDENTITY_SHADOW_ENABLED  = ${process.env.IDENTITY_SHADOW_ENABLED ?? "(未設定→デフォルトfalse)"}`);
  console.log(`  ${status(teacherEnabled)}   AI_TEACHER_GENERATION_ENABLED = ${process.env.AI_TEACHER_GENERATION_ENABLED ?? "(未設定→デフォルトtrue)"}`);
  console.log(`     Sample%: Stargazer=${stargazerPct}%  Orbiter=${orbiterPct}%  Identity=${identityPct}%`);

  if (!stargazerEnabled && !orbiterEnabled && !identityEnabled) {
    console.log(`\n  ${ERR} 全shadow無効。.env.local に以下を追加してください:`);
    console.log("     STARGAZER_SHADOW_ENABLED=true");
    console.log("     ORBITER_SHADOW_ENABLED=true");
    console.log("     IDENTITY_SHADOW_ENABLED=true");
  }

  // ── 2. Primary runs (user-facing) ─────────────────────────────────────
  console.log("\n## 2. Primary runs（直近7日間）");
  const { count: primaryCount } = await supabase
    .from("ai_runs")
    .select("*", { count: "exact", head: true })
    .eq("success", true)
    .neq("metadata->>shadowPass", "true")
    .gte("created_at", cutoff);

  console.log(`  ${status((primaryCount ?? 0) > 0, (primaryCount ?? 0) < 10)} Primary runs: ${primaryCount ?? 0} 件`);

  // ── 3. Shadow runs ─────────────────────────────────────────────────────
  console.log("\n## 3. Shadow runs（直近7日間）");
  const { data: shadowRuns } = await supabase
    .from("ai_runs")
    .select("id, task_type, provider, model, success, metadata, created_at")
    .eq("metadata->>shadowPass", "true")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(1000);

  const shadows = shadowRuns ?? [];
  const totalShadow = shadows.length;
  const shadowSuccess = shadows.filter((r) => r.success).length;

  // domain 別集計
  const shadowByDomain: Record<string, { total: number; success: number }> = {};
  for (const r of shadows) {
    const tt = (r.task_type as string) ?? "unknown";
    const domain = tt.startsWith("stargazer_") ? "stargazer"
      : tt.startsWith("orbiter_") ? "orbiter"
      : tt.startsWith("identity_") ? "identity"
      : "other";
    if (!shadowByDomain[domain]) shadowByDomain[domain] = { total: 0, success: 0 };
    shadowByDomain[domain].total++;
    if (r.success) shadowByDomain[domain].success++;
  }

  console.log(`  ${status(totalShadow > 0, totalShadow < 5)} Shadow runs: ${totalShadow} 件 (成功: ${shadowSuccess})`);
  for (const [domain, stats] of Object.entries(shadowByDomain)) {
    const rate = stats.total > 0 ? ((stats.success / stats.total) * 100).toFixed(0) : "0";
    console.log(`     ${domain.padEnd(12)} ${stats.total} 件  成功率 ${rate}%`);
  }

  if (totalShadow === 0) {
    console.log(`\n  ${ERR} Shadow runs が蓄積されていません。`);
    if (!stargazerEnabled) {
      console.log("     STARGAZER_SHADOW_ENABLED=true が必要です");
    }
  }

  // ── 4. Teacher outputs ─────────────────────────────────────────────────
  console.log("\n## 4. Teacher outputs（直近7日間）");
  const { count: teacherCount } = await supabase
    .from("teacher_outputs")
    .select("*", { count: "exact", head: true })
    .gte("created_at", cutoff);

  console.log(`  ${status((teacherCount ?? 0) > 0, (teacherCount ?? 0) < 5)} Teacher outputs: ${teacherCount ?? 0} 件`);

  // ── 5. Shadow eval results ─────────────────────────────────────────────
  console.log("\n## 5. Shadow eval results（ai_eval_runs）");
  const { data: evalRuns } = await supabase
    .from("ai_eval_runs")
    .select("id, eval_type, score, passed, created_at")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(1000);

  const evals = evalRuns ?? [];
  const evalByType: Record<string, { total: number; passed: number; avgScore: number }> = {};
  for (const e of evals) {
    const et = (e.eval_type as string) ?? "unknown";
    if (!evalByType[et]) evalByType[et] = { total: 0, passed: 0, avgScore: 0 };
    evalByType[et].total++;
    if (e.passed) evalByType[et].passed++;
    evalByType[et].avgScore += (e.score as number) ?? 0;
  }
  for (const et of Object.keys(evalByType)) {
    evalByType[et].avgScore = evalByType[et].avgScore / evalByType[et].total;
  }

  if (evals.length === 0) {
    console.log(`  ${ERR} eval results なし。Shadow が動いていないか、eval が無効です`);
  } else {
    console.log(`  ${OK} 合計 ${evals.length} 件`);
    for (const [et, s] of Object.entries(evalByType).sort((a, b) => b[1].total - a[1].total)) {
      const passRate = s.total > 0 ? ((s.passed / s.total) * 100).toFixed(1) : "0";
      const passOk = parseFloat(passRate) >= 70;
      console.log(`     ${status(passOk)} ${et.padEnd(30)} ${s.total.toString().padStart(4)}件  Pass率 ${passRate.padStart(5)}%  avg score ${s.avgScore.toFixed(2)}`);
    }
  }

  // ── 6. student_eval_cases ─────────────────────────────────────────────
  console.log("\n## 6. student_eval_cases（fine-tune データセット）");
  const { count: evalCasesCount } = await supabase
    .from("student_eval_cases")
    .select("*", { count: "exact", head: true });

  const { data: evalCasesDomains } = await supabase
    .from("student_eval_cases")
    .select("domain, quality_tier")
    .limit(5000);

  const domainCounts: Record<string, number> = {};
  for (const row of evalCasesDomains ?? []) {
    const key = `${row.domain}/${row.quality_tier}`;
    domainCounts[key] = (domainCounts[key] ?? 0) + 1;
  }

  const goldCount = (evalCasesDomains ?? []).filter((r) => r.quality_tier === "gold").length;
  const isReady = (evalCasesCount ?? 0) >= 50;

  console.log(`  ${status(isReady, !isReady && (evalCasesCount ?? 0) > 0)} student_eval_cases: ${evalCasesCount ?? 0} 件 (gold: ${goldCount})`);
  if ((evalCasesCount ?? 0) === 0) {
    console.log(`\n  ${ERR} データセット未作成。Supabase SQL エディタで以下を実行してください:`);
    console.log("     scripts/build-student-eval-set.sql");
  } else {
    for (const [key, count] of Object.entries(domainCounts).sort((a, b) => b[1] - a[1])) {
      console.log(`     ${key.padEnd(30)} ${count}`);
    }
  }

  // ── 7. 最新 shadow run の詳細 ──────────────────────────────────────────
  if (shadows.length > 0) {
    const latest = shadows[0];
    const latestMeta = latest.metadata as Record<string, unknown> | null;
    console.log(`\n## 7. 最新 shadow run`);
    console.log(`  task_type:        ${latest.task_type}`);
    console.log(`  provider:         ${latest.provider}`);
    console.log(`  model:            ${latest.model}`);
    console.log(`  success:          ${latest.success}`);
    console.log(`  created_at:       ${latest.created_at}`);
    console.log(`  shadowOfAiRunId:  ${latestMeta?.shadowOfAiRunId ?? "N/A"}`);
    console.log(`  studentTrack:     ${latestMeta?.studentTrack ?? "N/A"}`);
  }

  // ── Summary ───────────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(60));
  const shadowOk = totalShadow > 0;
  const teacherOk = (teacherCount ?? 0) > 0;
  const evalOk = evals.length > 0;
  const datasetOk = (evalCasesCount ?? 0) >= 50;

  console.log("## Summary");
  console.log(`  ${status(stargazerEnabled)} Shadow 有効（Stargazer）`);
  console.log(`  ${status(shadowOk, !shadowOk)} Shadow runs 蓄積中`);
  console.log(`  ${status(teacherOk, !teacherOk)} Teacher outputs 生成中`);
  console.log(`  ${status(evalOk, !evalOk)} Eval results 蓄積中`);
  console.log(`  ${status(datasetOk, !datasetOk)} Fine-tune データセット準備 (${evalCasesCount ?? 0}件 / 目標50+)`);

  if (!shadowOk) {
    console.log(`\n[NEXT ACTION] .env.local に STARGAZER_SHADOW_ENABLED=true を追加 → サーバー再起動`);
  }
  if (shadowOk && !evalOk) {
    console.log(`\n[NEXT ACTION] Shadow eval が動いていません。lib/stargazer/shadowRun.ts の evaluateShadowCandidates を確認`);
  }
  if (!datasetOk && (teacherCount ?? 0) > 20) {
    console.log(`\n[NEXT ACTION] scripts/build-student-eval-set.sql を Supabase SQL エディタで実行 → student_eval_cases を生成`);
    console.log("  その後: npx tsx scripts/export-finetune-jsonl.ts");
  }

  console.log("");
}

main().catch((err) => {
  console.error("[check-shadow-live] Fatal:", err);
  process.exit(1);
});
