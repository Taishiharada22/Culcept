/**
 * v4.2 暫定判定スクリプト（4/4 実行用）
 * D1: latency/health, D2: 再生成, D3: kill switch
 * + 初期 ban/delegation/repair 挙動チェック
 */
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { resolve } from "path";

dotenv.config({ path: resolve(__dirname, "../.env.local") });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function run() {
  console.log("=".repeat(60));
  console.log("v4.2 暫定判定 — 4/4 interim check");
  console.log("=".repeat(60));
  console.log();

  // ── D1: 基本ヘルスチェック ──
  console.log("── D1. 基本ヘルスチェック ──");
  const { data: allJudgments, error: e1 } = await supabase
    .from("stargazer_analytics")
    .select("metadata, created_at")
    .eq("event", "home_alter_judgment")
    .eq("feature", "home_alter")
    .gte("created_at", new Date(Date.now() - 48 * 3600 * 1000).toISOString())
    .order("created_at", { ascending: false })
    .limit(500);

  if (e1) {
    console.error("Query failed:", e1.message);
    return;
  }

  const total = allJudgments?.length ?? 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const v42Active = allJudgments?.filter((r: any) => r.metadata?.v42?.role) ?? [];
  const v42Count = v42Active.length;

  console.log(`  総リクエスト数 (48h): ${total}`);
  console.log(`  v4.2 アクティブ: ${v42Count}`);
  console.log(`  v4.2 割合: ${total > 0 ? ((v42Count / total) * 100).toFixed(1) : "N/A"}%`);

  // latency (新デプロイ後のみ)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const withLatency = allJudgments?.filter((r: any) => r.metadata?.total_latency_ms != null) ?? [];
  if (withLatency.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const latencies = withLatency.map((r: any) => r.metadata.total_latency_ms as number).sort((a: number, b: number) => a - b);
    const p50 = latencies[Math.floor(latencies.length * 0.5)];
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    const max = latencies[latencies.length - 1];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const llmCalls = withLatency.map((r: any) => (r.metadata.llm_call_count as number) ?? 0);
    const avgLlm = llmCalls.reduce((a: number, b: number) => a + b, 0) / llmCalls.length;
    const maxLlm = Math.max(...llmCalls);
    console.log(`  latency P50: ${p50}ms | P95: ${p95}ms | MAX: ${max}ms`);
    console.log(`  LLM calls avg: ${avgLlm.toFixed(1)} | max: ${maxLlm}`);
    if (max > 30000) console.log("  🔴 TIMEOUT_RISK: max latency > 30s");
    else if (p95 > 15000) console.log("  🟡 SLOW: P95 > 15s");
    else console.log("  🟢 HEALTHY");
  } else {
    console.log("  latency: データなし（新デプロイ後のリクエスト待ち）");
  }

  console.log();

  // ── D2: Compliance 再生成 ──
  console.log("── D2. Compliance 再生成 ──");
  const { data: regenEvents } = await supabase
    .from("stargazer_analytics")
    .select("metadata, created_at")
    .eq("event", "v42_compliance_regeneration")
    .gte("created_at", new Date(Date.now() - 48 * 3600 * 1000).toISOString())
    .order("created_at", { ascending: false })
    .limit(100);

  const regenCount = regenEvents?.length ?? 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const regenSucceeded = regenEvents?.filter((r: any) => r.metadata?.regeneration_succeeded === true).length ?? 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const regenFailed = regenEvents?.filter((r: any) => r.metadata?.regeneration_succeeded === false).length ?? 0;

  console.log(`  再生成発火: ${regenCount}回`);
  console.log(`  成功: ${regenSucceeded} | 失敗: ${regenFailed}`);
  if (regenCount === 0) console.log("  🟢 NO_VIOLATIONS（ban違反なし = 再生成不要）");
  else if (regenFailed > 0) console.log("  🟡 REGEN_FAILURES: 再生成失敗あり");
  else console.log("  🟢 ALL_CAUGHT: 全違反を再生成で排除");

  console.log();

  // ── D3: Ban / Delegation / Repair 初期挙動 ──
  console.log("── D3. Ban / Delegation / Repair 初期挙動 ──");
  let banFail = 0;
  let delegationBan = 0;
  let evasionBan = 0;
  let complianceFail = 0;
  let criticalCompliance = 0;
  let repairCount = 0;
  let loopingCount = 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of v42Active as any[]) {
    const v42 = row.metadata?.v42;
    if (!v42) continue;
    if (v42.semantic_ban_passed === false) {
      banFail++;
      const cats = v42.semantic_ban_categories ?? [];
      if (cats.includes("delegation")) delegationBan++;
      if (cats.includes("evasion")) evasionBan++;
    }
    if (v42.compliance_passed === false) complianceFail++;
    if ((v42.critical_violations ?? 0) > 0) criticalCompliance++;
    if (v42.role === "repair") repairCount++;
    if (v42.rally_status === "looping") loopingCount++;
  }

  const banPct = v42Count > 0 ? ((banFail / v42Count) * 100).toFixed(1) : "N/A";
  const delegationPct = v42Count > 0 ? ((delegationBan / v42Count) * 100).toFixed(1) : "N/A";
  const repairPct = v42Count > 0 ? ((repairCount / v42Count) * 100).toFixed(1) : "N/A";
  const loopingPct = v42Count > 0 ? ((loopingCount / v42Count) * 100).toFixed(1) : "N/A";

  console.log(`  Semantic Ban 違反: ${banFail}/${v42Count} (${banPct}%)`);
  console.log(`    delegation: ${delegationBan} | evasion: ${evasionBan}`);
  console.log(`  Compliance 違反: ${complianceFail} | critical: ${criticalCompliance}`);
  console.log(`  repair role 発動: ${repairCount} (${repairPct}%)`);
  console.log(`  looping 検出: ${loopingCount} (${loopingPct}%)`);

  // Role 分布
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const roleDist: Record<string, number> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of v42Active as any[]) {
    const role = row.metadata?.v42?.role ?? "unknown";
    roleDist[role] = (roleDist[role] ?? 0) + 1;
  }
  console.log(`  Role 分布: ${JSON.stringify(roleDist)}`);

  // Arena lens 分布
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lensDist: Record<string, number> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of v42Active as any[]) {
    const lens = row.metadata?.v42?.arena_primary_lens ?? "unknown";
    lensDist[lens] = (lensDist[lens] ?? 0) + 1;
  }
  console.log(`  Arena Lens 分布: ${JSON.stringify(lensDist)}`);

  console.log();

  // ── Kill Switch 判定 ──
  console.log("── Kill Switch 判定 ──");
  const issues: string[] = [];
  if (criticalCompliance > 0) issues.push(`🔴 KILL: critical compliance ${criticalCompliance}件`);
  if (v42Count > 0 && banFail / v42Count > 0.2) issues.push(`🔴 KILL: ban違反率 ${banPct}% > 20%`);
  if (withLatency.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const maxLat = Math.max(...withLatency.map((r: any) => r.metadata.total_latency_ms as number));
    if (maxLat > 30000) issues.push(`🔴 KILL: timeout水準 latency ${maxLat}ms`);
  }
  if (v42Count > 0 && loopingCount / v42Count > 0.3) issues.push(`🟡 WATCH: looping率 ${loopingPct}%`);
  if (delegationBan > 0) issues.push(`🟡 WATCH: delegation ban残存 ${delegationBan}件`);

  if (issues.length === 0) {
    console.log("  🟢 問題なし");
  } else {
    for (const issue of issues) console.log(`  ${issue}`);
  }

  console.log();

  // ── 暫定判定 ──
  console.log("=".repeat(60));
  const hasKill = issues.some(i => i.includes("🔴 KILL"));
  const hasWatch = issues.some(i => i.includes("🟡 WATCH"));

  if (v42Count === 0) {
    console.log("判定: ⏸ データ不足 — v4.2 アクティブリクエストが 0件");
    console.log("  デプロイ直後のため、データ蓄積を待つ必要あり");
    console.log("  → 継続GO（監視継続）");
  } else if (hasKill) {
    console.log("判定: 🔴 即停止");
    console.log("  ALTER_THIN_SLICE_ENABLED=false に変更して再デプロイせよ");
  } else if (hasWatch) {
    console.log("判定: 🟡 要修正だが継続");
    console.log("  上記の WATCH 項目を確認し、4/10 までに修正");
  } else {
    console.log("判定: 🟢 継続GO");
    console.log("  技術・運用・初期挙動に問題なし。4/10 最終判定へ進む");
  }
  console.log("=".repeat(60));
}

run().catch(console.error);
