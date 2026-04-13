/**
 * Intent Translation Engine — 332件 Rule-Layer-Only Eval ハーネス
 *
 * ⚠️ 重要: このevalはLLMをモックしたルール層単独の評価です。
 *    結果を「全体品質」として扱わないでください。
 *    LLM層を含む End-to-End eval は別途実行が必要です。
 *
 * CEO方針（2026-04-13）:
 *   「精度ではなく介入の気持ち悪さ」が勝負。
 *   5分類でfailを仕分ける:
 *     1. 介入すべきでないのに出た (false_positive)
 *     2. 出るべきなのに出なかった (false_negative)
 *     3. 受信ヒントが怖い (scary_hint)
 *     4. 言い換えが不自然 (unnatural_rewrite)
 *     5. Alterが主役を奪った (alter_takeover)
 *
 *   false_negative はさらに2つに再分類:
 *     - rule_layer_miss: ルール層で本来拾うべきだが失敗
 *     - llm_dependent: LLM層がないため未到達（ルール層の責任外）
 *
 * 実行: npx vitest run tests/unit/talk/intentTranslationEval.test.ts
 */

import { describe, it, expect, vi, beforeAll } from "vitest";

// ── Mocks ──
vi.mock("server-only", () => ({}));

// LLM mock: ルールベース層のみ評価。LLM呼び出しは空結果を返す
vi.mock("@/lib/ai", () => ({
  runAI: vi.fn().mockResolvedValue(null),
}));

import {
  simulateReading,
  reconstructIntent,
  mediate,
} from "@/lib/talk/intentTranslation";

import {
  ALL_EVAL_CASES,
  EVAL_CASES_A_AMBIGUOUS,
  EVAL_CASES_B_FRICTION,
  EVAL_CASES_C_JOINT,
} from "./intentTranslationEvalCases";

import type { EvalCase } from "./intentTranslationEvalCases";
import type {
  ReadingSimulationResult,
  IntentReconstructionResult,
  MediationResult,
  InterventionLevel,
} from "@/lib/talk/intentTranslation";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fail 分類
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type FailCategory =
  | "false_positive"       // 介入すべきでないのに出た
  | "false_negative"       // 出るべきなのに出なかった
  | "scary_hint"           // 受信ヒントが怖い
  | "unnatural_rewrite"    // 言い換えが不自然
  | "alter_takeover";      // Alterが主役を奪った

/** false_negative の再分類 */
type FalseNegativeSubtype =
  | "rule_layer_miss"      // ルール層で本来拾うべきだが失敗
  | "llm_dependent";       // LLM層がないため未到達（ルール層の責任外）

type EvalResult = {
  caseId: string;
  category: string;
  pass: boolean;
  fails: FailCategory[];
  /** false_negative の再分類（Phase別） */
  fnSubtypes: Array<{ phase: 1 | 2 | 3; subtype: FalseNegativeSubtype; reason: string }>;
  details: string[];
  // Phase 1
  expectedIntervene: boolean;
  actualLevel: InterventionLevel | "error";
  actualRisk: number;
  // Phase 2
  expectedBubble: boolean;
  actualBubble: boolean | "error";
  bubbleSkipReason?: string | null;
  actualBubbleRisk: number;
  // Phase 3
  expectedMediate: boolean;
  actualMediate: boolean | "error";
  actualEscalationLevel: number;
  // Content for review
  rewriteSuggestion?: string | null;
  bubbleHintText?: string | null;
  mediationContent?: {
    forSender?: string | null;
    forReceiver?: string | null;
    sharedInsight?: string | null;
  };
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ケース実行
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function runSingleCase(c: EvalCase): Promise<EvalResult> {
  const result: EvalResult = {
    caseId: c.id,
    category: c.category,
    pass: true,
    fails: [],
    fnSubtypes: [],
    details: [],
    expectedIntervene: c.expected.shouldIntervene,
    actualLevel: "error",
    actualRisk: 0,
    expectedBubble: c.expected.shouldShowBubble,
    actualBubble: "error",
    actualBubbleRisk: 0,
    expectedMediate: c.expected.shouldMediate,
    actualMediate: "error",
    actualEscalationLevel: 0,
  };

  // ── Phase 1: 送信側チェック ──
  try {
    const p1: ReadingSimulationResult = await simulateReading({
      message: c.message,
      senderProfile: c.senderProfile,
      receiverProfile: c.receiverProfile,
      conversationContext: c.context,
    });

    result.actualLevel = p1.interventionLevel;
    result.actualRisk = p1.misreadRisk;
    result.rewriteSuggestion = p1.rewriteSuggestion;

    const engineIntervenes = p1.interventionLevel !== "silent";

    // Check 1: 介入判定
    if (!c.expected.shouldIntervene && engineIntervenes) {
      result.pass = false;
      result.fails.push("false_positive");
      result.details.push(
        `Phase1: 介入すべきでないのに ${p1.interventionLevel} が出た (risk=${p1.misreadRisk.toFixed(3)})`,
      );
    }
    if (c.expected.shouldIntervene && !engineIntervenes) {
      result.pass = false;
      result.fails.push("false_negative");
      result.details.push(
        `Phase1: 介入すべきなのに silent (risk=${p1.misreadRisk.toFixed(3)})`,
      );

      // ── false_negative 再分類 ──
      // ルール層の閾値(0.3)に対して risk がどの程度か
      // risk >= 0.15 → ルール層が部分的に反応しているが閾値未達 → rule_layer_miss
      // risk < 0.15 → ルール層ではほぼ無反応 → LLM依存ケース
      if (p1.misreadRisk >= 0.15) {
        result.fnSubtypes.push({
          phase: 1,
          subtype: "rule_layer_miss",
          reason: `risk=${p1.misreadRisk.toFixed(3)} は閾値0.3の半分以上。ルール層の感度調整で拾える可能性`,
        });
      } else {
        result.fnSubtypes.push({
          phase: 1,
          subtype: "llm_dependent",
          reason: `risk=${p1.misreadRisk.toFixed(3)} が極端に低い。文脈依存の意図ギャップはLLM層が必要`,
        });
      }
    }

    // Check 2: 介入レベルの精度
    if (c.expected.expectedLevel && engineIntervenes) {
      if (p1.interventionLevel !== c.expected.expectedLevel) {
        result.details.push(
          `Phase1: level期待=${c.expected.expectedLevel} 実際=${p1.interventionLevel}`,
        );
      }
    }

    // Check 3: 言い換えの自然さ
    if (p1.rewriteSuggestion && !c.expected.shouldIntervene) {
      result.fails.push("unnatural_rewrite");
      result.details.push(
        `Phase1: 介入不要なのに言い換え提案あり: "${p1.rewriteSuggestion}"`,
      );
    }
  } catch (e) {
    result.actualLevel = "error";
    result.details.push(`Phase1: エラー: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── Phase 2: 受信側チェック ──
  try {
    const p2: IntentReconstructionResult = await reconstructIntent({
      receivedMessage: c.message,
      senderProfile: c.senderProfile,
      receiverProfile: c.receiverProfile,
      conversationContext: c.context,
    });

    result.actualBubble = p2.bubbleHint.show;
    result.actualBubbleRisk = p2.bubbleHint.misreadRisk;
    result.bubbleHintText = p2.bubbleHint.hintText;
    result.bubbleSkipReason = p2.bubbleHint.skipReason;

    // Check 4: 💭表示判定
    if (!c.expected.shouldShowBubble && p2.bubbleHint.show) {
      result.pass = false;
      result.fails.push("scary_hint");
      result.details.push(
        `Phase2: 💭不要なのに表示 (hint="${p2.bubbleHint.hintText}", risk=${p2.bubbleHint.misreadRisk.toFixed(3)})`,
      );
    }
    if (c.expected.shouldShowBubble && !p2.bubbleHint.show) {
      result.pass = false;
      result.fails.push("false_negative");
      result.details.push(
        `Phase2: 💭表示すべきなのに非表示 (reason=${p2.bubbleHint.skipReason}, risk=${p2.bubbleHint.misreadRisk.toFixed(3)})`,
      );

      // ── false_negative 再分類 ──
      const skipReason = p2.bubbleHint.skipReason;
      if (skipReason === "short_conversation") {
        // 会話が短いのはケース設計の問題であり、ルール層の欠陥ではない
        // ただし、conversationContext >= 2 のケースでこれが出たら rule_layer_miss
        result.fnSubtypes.push({
          phase: 2,
          subtype: c.context.length >= 2 ? "rule_layer_miss" : "llm_dependent",
          reason: `skipReason=short_conversation, context.length=${c.context.length}`,
        });
      } else if (skipReason === "low_risk") {
        // risk が閾値(0.35)未満 → LLM層が risk を引き上げるケース
        if (p2.bubbleHint.misreadRisk >= 0.2) {
          result.fnSubtypes.push({
            phase: 2,
            subtype: "rule_layer_miss",
            reason: `risk=${p2.bubbleHint.misreadRisk.toFixed(3)} は閾値0.35に近い。ルール層感度調整で拾える可能性`,
          });
        } else {
          result.fnSubtypes.push({
            phase: 2,
            subtype: "llm_dependent",
            reason: `risk=${p2.bubbleHint.misreadRisk.toFixed(3)} が低い。文脈分析はLLM層の責務`,
          });
        }
      } else if (skipReason === "low_confidence") {
        // LLMがないため confidence=0.3 固定 → LLM依存
        result.fnSubtypes.push({
          phase: 2,
          subtype: "llm_dependent",
          reason: `confidence不足(LLMモック中は常に0.3)。LLM層で解決`,
        });
      } else {
        result.fnSubtypes.push({
          phase: 2,
          subtype: "llm_dependent",
          reason: `skipReason=${skipReason}`,
        });
      }
    }
  } catch (e) {
    result.actualBubble = "error";
    result.details.push(`Phase2: エラー: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── Phase 3: 仲介チェック ──
  try {
    const p3: MediationResult = await mediate({
      threadId: `eval-${c.id}`,
      latestMessage: {
        senderId: c.senderProfile.userId,
        body: c.message,
      },
      profileA: c.senderProfile,
      profileB: c.receiverProfile,
      conversationContext: c.context,
    });

    result.actualMediate = p3.decision.shouldMediate;
    result.actualEscalationLevel = p3.escalation.level;
    result.mediationContent = {
      forSender: p3.forSender?.reframe ?? null,
      forReceiver: p3.forReceiver?.insight ?? null,
      sharedInsight: p3.sharedInsight,
    };

    // Check 5: 仲介判定
    if (!c.expected.shouldMediate && p3.decision.shouldMediate) {
      result.pass = false;
      result.fails.push("alter_takeover");
      result.details.push(
        `Phase3: 仲介不要なのに仲介発動 (reason=${p3.decision.reason}, urgency=${p3.decision.urgency})`,
      );
    }
    if (c.expected.shouldMediate && !p3.decision.shouldMediate) {
      result.pass = false;
      result.fails.push("false_negative");
      result.details.push(
        `Phase3: 仲介すべきなのに不発動 (escalation=${p3.escalation.level.toFixed(3)})`,
      );

      // ── false_negative 再分類 ──
      // escalation.level >= 0.25 → ルール層が部分的に反応 → 閾値調整で拾える
      if (p3.escalation.level >= 0.25) {
        result.fnSubtypes.push({
          phase: 3,
          subtype: "rule_layer_miss",
          reason: `escalation=${p3.escalation.level.toFixed(3)} は閾値0.5の半分以上。感度調整で対応可能`,
        });
      } else {
        result.fnSubtypes.push({
          phase: 3,
          subtype: "llm_dependent",
          reason: `escalation=${p3.escalation.level.toFixed(3)} が低い。文脈依存のエスカレーション検出はLLM層の責務`,
        });
      }
    }

    // Check 6: 仲介理由の一致
    if (
      c.expected.expectedMediationReason &&
      p3.decision.shouldMediate &&
      p3.decision.reason !== c.expected.expectedMediationReason
    ) {
      result.details.push(
        `Phase3: 仲介理由 期待=${c.expected.expectedMediationReason} 実際=${p3.decision.reason}`,
      );
    }
  } catch (e) {
    result.actualMediate = "error";
    result.details.push(`Phase3: エラー: ${e instanceof Error ? e.message : String(e)}`);
  }

  return result;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// レポート生成
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function generateReport(results: EvalResult[]) {
  const total = results.length;
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;

  // カテゴリ別
  const categories = ["ambiguous_short", "light_friction", "joint_decision"] as const;
  const catStats = categories.map((cat) => {
    const catResults = results.filter((r) => r.category === cat);
    const catPass = catResults.filter((r) => r.pass).length;
    return {
      category: cat,
      total: catResults.length,
      pass: catPass,
      fail: catResults.length - catPass,
      rate: catResults.length > 0 ? (catPass / catResults.length * 100).toFixed(1) : "N/A",
    };
  });

  // Fail分類別
  const failCats: FailCategory[] = [
    "false_positive",
    "false_negative",
    "scary_hint",
    "unnatural_rewrite",
    "alter_takeover",
  ];
  const failLabels: Record<FailCategory, string> = {
    false_positive: "介入すべきでないのに出た",
    false_negative: "出るべきなのに出なかった",
    scary_hint: "受信ヒントが怖い",
    unnatural_rewrite: "言い換えが不自然",
    alter_takeover: "Alterが主役を奪った",
  };
  const failStats = failCats.map((fc) => {
    const count = results.filter((r) => r.fails.includes(fc)).length;
    return { category: fc, label: failLabels[fc], count };
  });

  // ── false_negative 再分類 ──
  const allFnSubtypes = results.flatMap((r) => r.fnSubtypes);
  const ruleLayerMissCount = allFnSubtypes.filter((s) => s.subtype === "rule_layer_miss").length;
  const llmDependentCount = allFnSubtypes.filter((s) => s.subtype === "llm_dependent").length;

  // Phase別の再分類
  const fnByPhase = ([1, 2, 3] as const).map((phase) => {
    const phaseItems = allFnSubtypes.filter((s) => s.phase === phase);
    return {
      phase,
      ruleLayerMiss: phaseItems.filter((s) => s.subtype === "rule_layer_miss").length,
      llmDependent: phaseItems.filter((s) => s.subtype === "llm_dependent").length,
    };
  });

  // ── ケース分類: rule-only対象 vs LLM依存対象 ──
  const ruleOnlyCases: string[] = [];
  const llmDependentCases: string[] = [];
  for (const r of results) {
    if (r.pass) {
      ruleOnlyCases.push(r.caseId); // PASSしたケースはルール層で処理済み
    } else if (r.fnSubtypes.length > 0) {
      // fnSubtypes のうち1つでも rule_layer_miss があればルール層改善対象
      const hasRuleMiss = r.fnSubtypes.some((s) => s.subtype === "rule_layer_miss");
      if (hasRuleMiss) {
        ruleOnlyCases.push(r.caseId);
      } else {
        llmDependentCases.push(r.caseId);
      }
    } else if (r.fails.includes("alter_takeover") || r.fails.includes("false_positive")) {
      ruleOnlyCases.push(r.caseId); // 過検出はルール層の問題
    } else {
      llmDependentCases.push(r.caseId);
    }
  }

  // failケース一覧
  const failCases = results
    .filter((r) => !r.pass)
    .map((r) => ({
      id: r.caseId,
      category: r.category,
      fails: r.fails.map((f) => failLabels[f]).join(" / "),
      fnSubtypes: r.fnSubtypes.map((s) => `Phase${s.phase}:${s.subtype}`).join(" / "),
      details: r.details.join(" | "),
    }));

  console.log("\n" + "═".repeat(70));
  console.log("  Intent Translation — Rule-Layer-Only Eval（LLMモック）");
  console.log("  ⚠️ この結果はルール層単独の評価です。全体品質ではありません。");
  console.log("═".repeat(70));

  console.log(`\n▸ ルール層単独: ${passed}/${total} PASS (${(passed / total * 100).toFixed(1)}%) | ${failed} FAIL`);

  console.log("\n▸ カテゴリ別成功率:");
  for (const s of catStats) {
    const label =
      s.category === "ambiguous_short" ? "A. 曖昧短文" :
      s.category === "light_friction" ? "B. 軽い摩擦" :
      "C. 共同意思決定";
    console.log(`  ${label}: ${s.pass}/${s.total} (${s.rate}%) | ${s.fail} fail`);
  }

  console.log("\n▸ Fail分類:");
  for (const fs of failStats) {
    if (fs.count > 0) {
      console.log(`  ${fs.label}: ${fs.count}件`);
    }
  }

  console.log("\n▸ false_negative 再分類:");
  console.log(`  ルール層で拾うべき失敗 (rule_layer_miss): ${ruleLayerMissCount}件`);
  console.log(`  LLM層がないため未到達 (llm_dependent):   ${llmDependentCount}件`);
  for (const p of fnByPhase) {
    if (p.ruleLayerMiss + p.llmDependent > 0) {
      console.log(`    Phase${p.phase}: rule_miss=${p.ruleLayerMiss} / llm_dep=${p.llmDependent}`);
    }
  }

  console.log("\n▸ ケース分割:");
  console.log(`  rule-only対象（ルール層で評価完結 or ルール層改善対象）: ${ruleOnlyCases.length}件`);
  console.log(`  LLM依存対象（E2E eval が必要）: ${llmDependentCases.length}件`);

  if (failCases.length > 0) {
    console.log("\n▸ Failケース一覧:");
    for (const fc of failCases) {
      console.log(`  [${fc.id}] ${fc.category}`);
      console.log(`    分類: ${fc.fails}`);
      if (fc.fnSubtypes) console.log(`    FN再分類: ${fc.fnSubtypes}`);
      console.log(`    詳細: ${fc.details}`);
    }
  }

  console.log("\n" + "═".repeat(70));

  return {
    total, passed, failed, catStats, failStats, failCases,
    fnBreakdown: { ruleLayerMissCount, llmDependentCount, fnByPhase },
    caseSplit: { ruleOnlyCases, llmDependentCases },
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// テスト実行
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Intent Translation — Rule-Layer-Only Eval（LLMモック）", () => {
  let allResults: EvalResult[] = [];

  it("全332ケースを実行", async () => {
    expect(ALL_EVAL_CASES.length).toBe(332);

    // 並列実行（各ケースは独立）
    allResults = await Promise.all(
      ALL_EVAL_CASES.map((c) => runSingleCase(c)),
    );

    // レポート生成
    const report = generateReport(allResults);

    // テストとしては「レポートが生成されること」を保証
    expect(report.total).toBe(332);
  }, 120_000); // LLM mock済みだが安全マージン

  it("カテゴリ別件数の整合性", () => {
    expect(EVAL_CASES_A_AMBIGUOUS.length).toBe(112);
    expect(EVAL_CASES_B_FRICTION.length).toBe(122);
    expect(EVAL_CASES_C_JOINT.length).toBe(98);
    expect(
      EVAL_CASES_A_AMBIGUOUS.length +
      EVAL_CASES_B_FRICTION.length +
      EVAL_CASES_C_JOINT.length,
    ).toBe(332);
  });

  it("IDの重複がないこと", () => {
    const ids = ALL_EVAL_CASES.map((c) => c.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});
