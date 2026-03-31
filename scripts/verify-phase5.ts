/**
 * Phase 5 検証スクリプト: 継続的検証の4サブ機能を検証
 * 5-1: Judgment Accuracy (followup精度)
 * 5-2: Creepiness Line (不気味ライン検知)
 * 5-3: Trust Threshold Adjustment (Trust閾値調整)
 * 5-4: MI Accuracy (Micro Insight精度)
 * + route.ts 統合確認
 */

import {
  checkCreepinessLine,
  suggestTrustThresholdAdjustment,
  computeMIAccuracy,
  computeJudgmentAccuracy,
} from "../lib/stargazer/alterUnderstanding";
import * as fs from "fs";

let pass = 0;
let fail = 0;
const results: string[] = [];

function assert(name: string, condition: boolean, detail = "") {
  if (condition) {
    pass++;
    results.push(`  ✅ ${name}`);
  } else {
    fail++;
    results.push(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5-1: Judgment Accuracy
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
results.push("\n── 5-1: Judgment Accuracy ──");

// 空配列
const empty = computeJudgmentAccuracy([]);
assert("空入力で全ゼロ", empty.total_count === 0 && empty.execution_rate === 0);

// 正常データ
const followups = [
  { metadata: { executed: true, satisfaction: 5, query_domain: "work" } },
  { metadata: { executed: true, satisfaction: 4, query_domain: "work" } },
  { metadata: { executed: true, satisfaction: 2, did_regret: true, query_domain: "relationship" } },
  { metadata: { skip_reason: "too_complex", query_domain: "work" } },
  { metadata: { executed: false, query_domain: "general" } },
];
const acc = computeJudgmentAccuracy(followups);
assert("total_count = 5", acc.total_count === 5);
assert("execution_rate = 0.6", Math.abs(acc.execution_rate - 0.6) < 0.01);
assert("regret_rate = 1/3", Math.abs(acc.regret_rate - 1 / 3) < 0.01);
assert("skip_rate = 0.2", Math.abs(acc.skip_rate - 0.2) < 0.01);
assert("avg_satisfaction > 0", acc.avg_satisfaction > 0);
assert("domain_breakdown has work", !!acc.domain_breakdown["work"]);
assert("work count = 3", acc.domain_breakdown["work"].count === 3);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5-2: Creepiness Line
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
results.push("\n── 5-2: Creepiness Line ──");

// 安全な応答（Trust 2）
const safe = checkCreepinessLine("その選択肢もありかもしれませんね。", 2, 0, 1);
assert("安全な応答はPASS", safe.pass === true);
assert("安全な応答は違反ゼロ", safe.violations.length === 0);

// 断定表現（Trust 1）→ critical
const assertion = checkCreepinessLine("あなたは慎重な人です。", 1, 0, 1);
assert("断定表現を検出", assertion.violations.some(v => v.type === "identity_assertion"));
assert("Trust 1での断定はcritical", assertion.violations.some(v => v.severity === "critical"));
assert("断定表現でPASS=false", assertion.pass === false);

// 断定表現（Trust 3）→ warning
const assertionHighTrust = checkCreepinessLine("あなたは慎重な人です。", 3, 0, 1);
assert("Trust 3での断定はwarning", assertionHighTrust.violations.some(v => v.severity === "warning"));
assert("Trust 3ではPASS=true（warningのみ）", assertionHighTrust.pass === true);

// 過剰開示（Trust 0, context 5件）
const overDisclose = checkCreepinessLine("テスト", 0, 0, 5);
assert("Trust 0で5件コンテキストは過剰開示", overDisclose.violations.some(v => v.type === "over_disclosure"));

// 早期仮説注入（Trust 1, hypotheses > 0）
const premature = checkCreepinessLine("テスト", 1, 2, 1);
assert("Trust 1で仮説注入はcritical", premature.violations.some(v => v.type === "premature_pattern" && v.severity === "critical"));
assert("早期仮説注入でPASS=false", premature.pass === false);

// 追跡表現（Trust 1）— 「してる」パターン
const tracking = checkCreepinessLine("いつも夜遅くまで仕事してるよね", 1, 0, 1);
assert("追跡表現を検出（してる）", tracking.violations.some(v => v.type === "excessive_tracking"));

// 追跡表現（Trust 1）— 「でいる」パターン
const tracking2 = checkCreepinessLine("いつも仕事で悩んでいるよね", 1, 0, 1);
assert("追跡表現を検出（でいる）", tracking2.violations.some(v => v.type === "excessive_tracking"));

// 追跡表現（Trust 3）→ スルー
const trackingHigh = checkCreepinessLine("いつも夜遅くまで仕事してるよね", 3, 0, 1);
assert("Trust 3では追跡表現はスルー", !trackingHigh.violations.some(v => v.type === "excessive_tracking"));

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5-3: Trust Threshold Adjustment
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
results.push("\n── 5-3: Trust Threshold Adjustment ──");

// サンプル不足
const tooFew = suggestTrustThresholdAdjustment(
  Array.from({ length: 5 }, () => ({ reaction: "accepted", insight_type: "test" }))
);
assert("5件はサンプル不足 → maintain", tooFew.recommendation === "maintain");

// denied 多い（30%+）
const highDenial = suggestTrustThresholdAdjustment([
  ...Array.from({ length: 4 }, () => ({ reaction: "denied", insight_type: "test" })),
  ...Array.from({ length: 6 }, () => ({ reaction: "accepted", insight_type: "test" })),
]);
assert("denied 40% → raise", highDenial.recommendation === "raise");

// ignored 多い（50%+）
const highIgnored = suggestTrustThresholdAdjustment([
  ...Array.from({ length: 6 }, () => ({ reaction: "ignored", insight_type: "test" })),
  ...Array.from({ length: 4 }, () => ({ reaction: "accepted", insight_type: "test" })),
]);
assert("ignored 60% → raise", highIgnored.recommendation === "raise");

// accepted 多い（60%+）
const healthy = suggestTrustThresholdAdjustment([
  ...Array.from({ length: 7 }, () => ({ reaction: "accepted", insight_type: "test" })),
  ...Array.from({ length: 3 }, () => ({ reaction: "ignored", insight_type: "test" })),
]);
assert("accepted 70% → maintain", healthy.recommendation === "maintain");

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5-4: MI Accuracy
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
results.push("\n── 5-4: MI Accuracy ──");

// 空配列
const emptyMI = computeMIAccuracy([]);
assert("空入力でゼロ", emptyMI.total_presented === 0);

// 正常データ（一部deniedが高いタイプあり）
const reactions = [
  { reaction: "accepted", insight_type: "state_pattern", signal_types: ["fatigue"] },
  { reaction: "accepted", insight_type: "state_pattern", signal_types: ["fatigue"] },
  { reaction: "denied", insight_type: "state_pattern", signal_types: ["fatigue"] },
  { reaction: "denied", insight_type: "decision_pattern", signal_types: ["risk"] },
  { reaction: "denied", insight_type: "decision_pattern", signal_types: ["risk"] },
  { reaction: "accepted", insight_type: "decision_pattern", signal_types: ["risk"] },
  { reaction: "denied", insight_type: "decision_pattern", signal_types: ["risk"] },
  { reaction: "ignored", insight_type: "micro_signal", signal_types: ["time"] },
];
const mi = computeMIAccuracy(reactions);
assert("total_presented = 8", mi.total_presented === 8);
assert("accepted_count = 3", mi.accepted_count === 3);
assert("denied_count = 4", mi.denied_count === 4);
assert("ignored_count = 1", mi.ignored_count === 1);
assert("acceptance_rate = 3/8", Math.abs(mi.acceptance_rate - 3 / 8) < 0.01);
assert("type_breakdown has state_pattern", !!mi.type_breakdown["state_pattern"]);
assert("decision_pattern denied率75% → suppress", mi.signals_to_suppress.includes("decision_pattern"));
assert("state_pattern denied率33% → NOT suppress", !mi.signals_to_suppress.includes("state_pattern"));
assert("micro_signal sample<3 → NOT suppress", !mi.signals_to_suppress.includes("micro_signal"));

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// route.ts 統合確認
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
results.push("\n── route.ts 統合確認 ──");

const routeSource = fs.readFileSync("app/api/stargazer/alter/route.ts", "utf-8");

// Import 確認
assert("checkCreepinessLine imported", routeSource.includes("checkCreepinessLine,"));
assert("suggestTrustThresholdAdjustment imported", routeSource.includes("suggestTrustThresholdAdjustment,"));
assert("computeMIAccuracy imported", routeSource.includes("computeMIAccuracy,"));
assert("computeJudgmentAccuracy imported", routeSource.includes("computeJudgmentAccuracy,"));

// 呼び出し確認
assert("checkCreepinessLine called", routeSource.includes("creepinessCheck = checkCreepinessLine("));
assert("suggestTrustThresholdAdjustment called", routeSource.includes("suggestTrustThresholdAdjustment(recentReactions)"));
assert("computeMIAccuracy called", routeSource.includes("computeMIAccuracy(recentReactions"));
assert("computeJudgmentAccuracy called", routeSource.includes("computeJudgmentAccuracy(followupRows"));

// analytics 記録
assert("creepiness_check in analytics", routeSource.includes("creepiness_check:"));
assert("phase5_accuracy_snapshot event", routeSource.includes("phase5_accuracy_snapshot"));
assert("trust_adjustment in metadata", routeSource.includes("trust_adjustment: trustAdj"));
assert("mi_accuracy in metadata", routeSource.includes("mi_accuracy:"));
assert("signals_to_suppress logged", routeSource.includes("signals_to_suppress"));

// レスポンスに creepiness_check 含む
assert("creepiness_check in response JSON", routeSource.includes("creepiness_check: creepinessCheck ?"));

// hypothesesInjectedCount tracked
assert("hypothesesInjectedCount tracked", routeSource.includes("hypothesesInjectedCount = selected.length"));

// fire-and-forget パターン（非同期・エラー無視）
assert("reaction fetch is fire-and-forget (.then)", routeSource.includes('.from("stargazer_alter_reactions")'));
assert("followup fetch is fire-and-forget (.then)", routeSource.includes('home_alter_followup'));

// ── D: MI 頻度制限 統合確認 ──
results.push("\n── D: MI 頻度制限 統合確認 ──");
assert("insightSuppressedReason outer scope", routeSource.includes('let insightSuppressedReason = ""'));
assert("insightPresented outer scope", routeSource.includes("let insightPresented = false"));
assert("lastInsightPresentedAt fetched", routeSource.includes("lastInsightPresentedAt = new Date("));
assert("recentDenyIgnoreStreak computed", routeSource.includes("recentDenyIgnoreStreak++"));
assert("1h minimum interval check", routeSource.includes("hoursSinceLastInsight < 1"));
assert("deny/ignore streak >= 2 check", routeSource.includes("recentDenyIgnoreStreak >= 2"));
assert("suppression logged", routeSource.includes("[micro-insight] Suppressed:"));
assert("suppressed reason in analytics", routeSource.includes("suppressed: insightSuppressedReason"));
assert("presented flag in analytics", routeSource.includes("presented: insightPresented"));

// ── F: Creepiness critical 応答差し替え 統合確認 ──
results.push("\n── F: Creepiness critical 応答差し替え 統合確認 ──");
assert("critical → safe regeneration", routeSource.includes("Safe regeneration succeeded"));
assert("MI section stripped from prompt", routeSource.includes('# Micro Insight（自然に織り込むこと）'));
assert("hypothesis section stripped", routeSource.includes('# 仮説的理解（断定禁止）'));
assert("safe system prompt with 安全制約", routeSource.includes("# 安全制約"));
assert("re-check after safe regen", routeSource.includes("safeCreepiness"));
assert("final fallback on double failure", routeSource.includes("Safe regeneration also failed"));
assert("fallback is neutral/safe", routeSource.includes("もう少し聞かせてもらえますか？"));
assert("safe regen uses low temperature", routeSource.includes("temperature: 0.3, // 安全側に低温"));

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 結果出力
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
console.log("\n═══════════════════════════════════════");
console.log("  Phase 5 検証結果");
console.log("═══════════════════════════════════════");
results.forEach(r => console.log(r));
console.log("\n───────────────────────────────────────");
console.log(`  PASS: ${pass} / ${pass + fail}  |  FAIL: ${fail}`);
console.log("───────────────────────────────────────\n");

if (fail > 0) {
  process.exit(1);
}
