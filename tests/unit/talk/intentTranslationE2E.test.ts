/**
 * Intent Translation Engine — E2E Eval（LLMあり、50件厳選）
 *
 * Rule-Layer-Only Eval で LLM依存と判定された161件から
 * 高価値50件を選定し、実LLM呼び出しで評価する。
 *
 * 選定基準:
 *   - カテゴリ均等（A:17, B:17, C:16）
 *   - 4つの薄い領域（Profile/長アーク/世代/時間帯）をカバー
 *   - 複数Phase同時failのケースを優先（情報価値が高い）
 *   - context >= 2ターンのケースを優先（short_conversation回避）
 *
 * 実行: npx vitest run tests/unit/talk/intentTranslationE2E.test.ts
 *
 * ⚠️ 注意:
 *   - 実LLM呼び出しを行うため、API キーが必要
 *   - 50件 × 3Phase × ~800トークン ≈ 120Kトークン
 *   - タイムアウト: 10分
 */

import { describe, it, expect, vi } from "vitest";
import * as fs from "fs";

// server-only のみモック。LLM はモックしない（E2E）
vi.mock("server-only", () => ({}));

// ── E2E 用閾値オーバーライド ──
// LLM を強制発火させるため、全ゲート閾値を 0 に設定。
// 本番コードのデフォルト値は変更しない（env var 未設定時は従来通り）。
process.env.INTENT_LLM_PHASE1_THRESHOLD = "0";    // Phase 1: LLM call gate (default 0.25)
process.env.INTENT_LLM_PHASE2_THRESHOLD = "0";    // Phase 2: LLM call gate (default 0.28)
process.env.INTENT_BUBBLE_RISK_THRESHOLD = "0";    // Phase 2: bubble display risk gate (default 0.35)
process.env.INTENT_BUBBLE_MIN_TURNS = "0";         // Phase 2: minimum conversation turns (default 2)
// INTENT_BUBBLE_CONFIDENCE_THRESHOLD: デフォルト(0.5)を使用。display confidence synthesis でブーストされるはず
// Phase 3: デフォルト維持（0.5）— 閾値0にすると全件mediation→41件alter_takeover発生で評価ノイズになる

import {
  simulateReading,
  reconstructIntent,
  mediate,
} from "@/lib/talk/intentTranslation";

import { ALL_EVAL_CASES } from "./intentTranslationEvalCases";

import type { EvalCase } from "./intentTranslationEvalCases";
import type {
  ReadingSimulationResult,
  IntentReconstructionResult,
  MediationResult,
  InterventionLevel,
} from "@/lib/talk/intentTranslation";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// E2E 対象50件の選定
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * LLM依存161件から選定した高価値50件。
 *
 * A (17件): 複数Phase fail + 薄い領域 + context >= 2
 * B (17件): 摩擦パターンの多様性 + 薄い領域
 * C (16件): 共同意思決定の多様性 + 薄い領域
 */
const E2E_CASE_IDS: string[] = [
  // ── A. 曖昧短文（17件）──
  "A-3",   // 「分かった」— 複数Phase fail, 諦め/了承/怒りの3通り
  "A-5",   // 「...」— 沈黙。送信者意図が完全に不明
  "A-10",  // 「え、まじ？」— 3Phase全fail。驚きの質
  "A-12",  // 「ありがとう」— 感謝の温度差。risk=0.062 閾値に近い
  "A-20",  // 「大丈夫」— 3Phase fail。最頻出の曖昧表現
  "A-30",  // 「は？」— 怒り70%/驚き30%。最高レベル曖昧
  "A-34",  // 「そうだね」— 同意の本気度。risk=0.053
  "A-38",  // 「ごめん」— 謝罪の深度。複数Phase fail
  "A-75",  // 「微妙...」— 3Phase fail。否定的ニュアンス
  "A-76",  // 「いいんじゃない？」— 賛成 or 無関心
  "A-79",  // 「好きにすれば」— 放棄 or 委任。感情の分岐点
  "A-91",  // [Profile] 率直×率直で「は？」。率直同士の特殊性
  "A-98",  // [Profile] 不安型×回避型で「うん」。最も危険な組み合わせ
  "A-110", // [長アーク] 5ターンで1語返信が増えていく
  "A-111", // [長アーク] 楽しい会話→突然の1語
  "A-112", // [長アーク] 絵文字が消えていく非言語変化
  "A-81",  // [Profile] 外交×外交で「...」。表面穏やか内面不一致

  // ── B. 軽い摩擦（17件）──
  "B-1",   // 既読無視後の「ごめん寝てた」
  "B-4",   // 「別にいいけど」— 最も表裏が分かれる表現
  "B-11",  // 「もういい」— 諦め/怒り。2ターン文脈
  "B-25",  // 長文vs短文のアシンメトリー
  "B-39",  // 「なんで？」— 質問 or 詰め
  "B-42",  // 冗談がすべる。「えっ...」の傷つき検出
  "B-45",  // 予定キャンセルの温度差
  "B-51",  // 相手の趣味への否定。価値観衝突
  "B-55",  // SNS嫉妬パターン
  "B-65",  // 「了解」の冷たさ
  "B-85",  // [Profile] 安定×不安で既読無視
  "B-93",  // [長アーク] 5ターンで段階的withdrawal
  "B-103", // [長アーク] 返信間隔拡大パターン
  "B-104", // [長アーク] 3ターン前の発言蒸し返し
  "B-108", // [世代] 年上→年下の「頑張れ」。世代間温度差
  "B-114", // [時間帯] 深夜の「起きてる？」
  "B-122", // [時間帯] 朝一の業務連絡が感情的に読まれる

  // ── C. 共同意思決定（16件）──
  "C-2",   // 旅行先選び — 片方の強い希望
  "C-5",   // 結婚式の招待客リスト — 家族関係の軋轢
  "C-10",  // デート場所 — 趣味が合わない
  "C-14",  // ペットを飼うか — 生活変化への不安
  "C-20",  // 引越し先 — 通勤vs住環境のトレードオフ
  "C-28",  // 友達の誘い — 片方だけ行きたい
  "C-36",  // 家具の買い替え — こだわりvs予算
  "C-41",  // 二次会 — 帰りたいvs行きたい
  "C-50",  // 片付け — 「何回言えば」の criticism パターン
  "C-59",  // 愚痴への対応 — 聞くだけvsアドバイス
  "C-63",  // [Profile] 率直×外交の意思決定
  "C-70",  // [世代] 世代間の金銭感覚差
  "C-83",  // [Profile] 回避×不安の大きな決断
  "C-85",  // [世代] 年上の「任せるよ」の真意
  "C-89",  // [時間帯] 疲労時の重要決定
  "C-92",  // [時間帯] 寝る前の蒸し返し
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fail 分類（rule-layer eval と同一型）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type FailCategory =
  | "false_positive"
  | "false_negative"
  | "scary_hint"
  | "unnatural_rewrite"
  | "alter_takeover";

type E2EResult = {
  caseId: string;
  category: string;
  pass: boolean;
  fails: FailCategory[];
  details: string[];
  // Phase 1
  expectedIntervene: boolean;
  actualLevel: InterventionLevel | "error";
  actualRisk: number;
  rewriteSuggestion?: string | null;
  // Phase 2
  expectedBubble: boolean;
  actualBubble: boolean | "error";
  bubbleSkipReason?: string | null;
  bubbleHintText?: string | null;
  // Phase 3
  expectedMediate: boolean;
  actualMediate: boolean | "error";
  mediationReason?: string;
  // LLM発火トラッキング
  llmFired: { phase1: boolean; phase2: boolean; phase3: boolean };
  // LLM出力のコンテンツ品質レビュー用
  llmContent: {
    senderIntentReading?: string | null;
    receiverInterpretations?: string[];
    contextNote?: string | null;
    mediationForSender?: string | null;
    mediationForReceiver?: string | null;
    sharedInsight?: string | null;
  };
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ケース実行（LLM あり）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function runE2ECase(c: EvalCase): Promise<E2EResult> {
  const result: E2EResult = {
    caseId: c.id,
    category: c.category,
    pass: true,
    fails: [],
    details: [],
    expectedIntervene: c.expected.shouldIntervene,
    actualLevel: "error",
    actualRisk: 0,
    expectedBubble: c.expected.shouldShowBubble,
    actualBubble: "error",
    expectedMediate: c.expected.shouldMediate,
    actualMediate: "error",
    llmFired: { phase1: false, phase2: false, phase3: false },
    llmContent: {},
  };

  // ── Phase 1: 送信側 ──
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
    result.llmContent.senderIntentReading = p1.senderIntent?.reading ?? null;
    result.llmContent.receiverInterpretations = p1.receiverInterpretations?.map(i => i.reading) ?? [];
    // LLM発火判定: フォールバック「（分析中）」でなければLLMが返した
    result.llmFired.phase1 = p1.senderIntent?.reading != null && p1.senderIntent.reading !== "（分析中）";

    const engineIntervenes = p1.interventionLevel !== "silent";

    if (!c.expected.shouldIntervene && engineIntervenes) {
      result.pass = false;
      result.fails.push("false_positive");
      result.details.push(
        `Phase1: 介入不要なのに ${p1.interventionLevel} (risk=${p1.misreadRisk.toFixed(3)})`,
      );
    }
    if (c.expected.shouldIntervene && !engineIntervenes) {
      result.pass = false;
      result.fails.push("false_negative");
      result.details.push(
        `Phase1: 介入すべきなのに silent (risk=${p1.misreadRisk.toFixed(3)})`,
      );
    }
    if (p1.rewriteSuggestion && !c.expected.shouldIntervene) {
      result.fails.push("unnatural_rewrite");
      result.details.push(
        `Phase1: 不要な言い換え: "${p1.rewriteSuggestion}"`,
      );
    }
  } catch (e) {
    result.details.push(`Phase1 error: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── Phase 2: 受信側 ──
  try {
    const p2: IntentReconstructionResult = await reconstructIntent({
      receivedMessage: c.message,
      senderProfile: c.senderProfile,
      receiverProfile: c.receiverProfile,
      conversationContext: c.context,
    });

    result.actualBubble = p2.bubbleHint.show;
    result.bubbleSkipReason = p2.bubbleHint.skipReason;
    result.bubbleHintText = p2.bubbleHint.hintText;
    result.llmContent.contextNote = p2.contextNote ?? null;
    // LLM発火判定: contextNote がフォールバック文言でなければLLMが返した
    result.llmFired.phase2 = p2.contextNote != null
      && p2.contextNote !== "この文脈では意図を確定できません"
      && !p2.contextNote.startsWith("送信者は");

    if (!c.expected.shouldShowBubble && p2.bubbleHint.show) {
      result.pass = false;
      result.fails.push("scary_hint");
      result.details.push(
        `Phase2: 💭不要なのに表示 (hint="${p2.bubbleHint.hintText}")`,
      );
    }
    if (c.expected.shouldShowBubble && !p2.bubbleHint.show) {
      result.pass = false;
      result.fails.push("false_negative");
      result.details.push(
        `Phase2: 💭表示すべきなのに非表示 (reason=${p2.bubbleHint.skipReason}, risk=${p2.bubbleHint.misreadRisk.toFixed(3)}, conf=${p2.bubbleHint.confidence.toFixed(3)}, rawConf=${p2.confidence.toFixed(3)})`,
      );
    }
  } catch (e) {
    result.details.push(`Phase2 error: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── Phase 3: 仲介 ──
  try {
    const p3: MediationResult = await mediate({
      threadId: `e2e-${c.id}`,
      latestMessage: {
        senderId: c.senderProfile.userId,
        body: c.message,
      },
      profileA: c.senderProfile,
      profileB: c.receiverProfile,
      conversationContext: c.context,
      // P1→P3 連携: Phase 1 の介入レベルを渡す
      phase1InterventionLevel:
        result.actualLevel !== "error" ? result.actualLevel : undefined,
    });

    result.actualMediate = p3.decision.shouldMediate;
    result.mediationReason = p3.decision.reason;
    result.llmContent.mediationForSender = p3.forSender?.reframe ?? null;
    result.llmContent.mediationForReceiver = p3.forReceiver?.insight ?? null;
    result.llmContent.sharedInsight = p3.sharedInsight ?? null;
    // LLM発火判定: sharedInsight がフォールバック文言でなければLLMが返した
    result.llmFired.phase3 = p3.sharedInsight != null
      && p3.sharedInsight !== "お互いの気持ちを確認し合うと、すれ違いが解消されるかもしれません";

    if (!c.expected.shouldMediate && p3.decision.shouldMediate) {
      result.pass = false;
      result.fails.push("alter_takeover");
      result.details.push(
        `Phase3: 仲介不要なのに発動 (reason=${p3.decision.reason})`,
      );
    }
    if (c.expected.shouldMediate && !p3.decision.shouldMediate) {
      result.pass = false;
      result.fails.push("false_negative");
      result.details.push(
        `Phase3: 仲介すべきなのに不発動 (escalation=${p3.escalation.level.toFixed(3)})`,
      );
    }
  } catch (e) {
    result.details.push(`Phase3 error: ${e instanceof Error ? e.message : String(e)}`);
  }

  return result;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// E2E レポート
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function generateE2EReport(results: E2EResult[]) {
  const total = results.length;
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;

  const categories = ["ambiguous_short", "light_friction", "joint_decision"] as const;
  const catStats = categories.map((cat) => {
    const catResults = results.filter((r) => r.category === cat);
    const catPass = catResults.filter((r) => r.pass).length;
    return {
      category: cat,
      total: catResults.length,
      pass: catPass,
      rate: catResults.length > 0 ? (catPass / catResults.length * 100).toFixed(1) : "N/A",
    };
  });

  const failLabels: Record<FailCategory, string> = {
    false_positive: "介入すべきでないのに出た",
    false_negative: "出るべきなのに出なかった",
    scary_hint: "受信ヒントが怖い",
    unnatural_rewrite: "言い換えが不自然",
    alter_takeover: "Alterが主役を奪った",
  };

  const failCats: FailCategory[] = [
    "false_positive", "false_negative", "scary_hint", "unnatural_rewrite", "alter_takeover",
  ];
  const failStats = failCats.map((fc) => ({
    label: failLabels[fc],
    count: results.filter((r) => r.fails.includes(fc)).length,
  }));

  // レポート行を蓄積（console.log + ファイル出力両方）
  const lines: string[] = [];
  const log = (s: string) => { console.log(s); lines.push(s); };

  log("\n" + "═".repeat(70));
  log("  Intent Translation — E2E Eval（LLMあり、50件厳選）");
  log("═".repeat(70));

  // LLM 発火統計
  const llmStats = {
    phase1: results.filter((r) => r.llmFired.phase1).length,
    phase2: results.filter((r) => r.llmFired.phase2).length,
    phase3: results.filter((r) => r.llmFired.phase3).length,
  };

  log(`\n▸ E2E: ${passed}/${total} PASS (${(passed / total * 100).toFixed(1)}%) | ${failed} FAIL`);

  log(`\n▸ LLM発火: Phase1=${llmStats.phase1}/${total} Phase2=${llmStats.phase2}/${total} Phase3=${llmStats.phase3}/${total}`);

  // ── Provider Health ──
  // LLM成功ケースのみの PASS率を計測（503障害の影響を分離）
  const llmSuccessCases = results.filter((r) => r.llmFired.phase1 || r.llmFired.phase2);
  const llmSuccessPass = llmSuccessCases.filter((r) => r.pass).length;
  const llmFailCases = results.filter((r) => !r.llmFired.phase1 && !r.llmFired.phase2);
  const llmFailPass = llmFailCases.filter((r) => r.pass).length;
  log(`\n▸ Provider Health:`);
  log(`  LLM成功: ${llmSuccessCases.length}/${total}件 → PASS ${llmSuccessPass}/${llmSuccessCases.length} (${llmSuccessCases.length > 0 ? (llmSuccessPass / llmSuccessCases.length * 100).toFixed(1) : "N/A"}%)`);
  log(`  LLM失敗(fallback): ${llmFailCases.length}/${total}件 → PASS ${llmFailPass}/${llmFailCases.length} (${llmFailCases.length > 0 ? (llmFailPass / llmFailCases.length * 100).toFixed(1) : "N/A"}%)`);

  log("\n▸ カテゴリ別:");
  for (const s of catStats) {
    const label =
      s.category === "ambiguous_short" ? "A. 曖昧短文" :
      s.category === "light_friction" ? "B. 軽い摩擦" :
      "C. 共同意思決定";
    log(`  ${label}: ${s.pass}/${s.total} (${s.rate}%)`);
  }

  log("\n▸ Fail分類:");
  for (const fst of failStats) {
    if (fst.count > 0) log(`  ${fst.label}: ${fst.count}件`);
  }

  // ── Fail ケースの詳細 ──
  const failCases = results.filter((r) => !r.pass);
  if (failCases.length > 0) {
    log("\n▸ Failケース:");
    for (const r of failCases) {
      const llmTag = [
        r.llmFired.phase1 ? "P1" : "",
        r.llmFired.phase2 ? "P2" : "",
        r.llmFired.phase3 ? "P3" : "",
      ].filter(Boolean).join("+") || "noLLM";
      log(`  [${r.caseId}] [${llmTag}] ${r.fails.map(f => failLabels[f]).join(" / ")}`);
      for (const d of r.details) log(`    ${d}`);
      if (r.bubbleHintText) log(`    💭: "${r.bubbleHintText}"`);
      if (r.rewriteSuggestion) log(`    言換: "${r.rewriteSuggestion}"`);
    }
  }

  // ── PASS ケースの詳細 ──
  const passCases = results.filter((r) => r.pass);
  if (passCases.length > 0) {
    log(`\n▸ PASSケース (${passCases.length}件):`);
    for (const r of passCases) {
      const llmTag = [
        r.llmFired.phase1 ? "P1" : "",
        r.llmFired.phase2 ? "P2" : "",
        r.llmFired.phase3 ? "P3" : "",
      ].filter(Boolean).join("+") || "noLLM";
      log(`  [${r.caseId}] [${llmTag}]`);
    }
  }

  // コンテンツ品質サンプル（LLM発火のもの優先、先頭15件）
  const llmFiredCases = results.filter(
    (r) => r.llmFired.phase1 || r.llmFired.phase2 || r.llmFired.phase3,
  );
  const sampleCases = llmFiredCases.length > 0 ? llmFiredCases.slice(0, 15) : results.slice(0, 10);
  log(`\n▸ LLMコンテンツサンプル（${sampleCases.length}件）:`);
  for (const r of sampleCases) {
    log(`  [${r.caseId}] ${r.pass ? "PASS" : "FAIL"}`);
    if (r.llmContent.senderIntentReading && r.llmContent.senderIntentReading !== "（分析中）") {
      log(`    意図推定: ${r.llmContent.senderIntentReading}`);
    }
    if (r.bubbleHintText) log(`    💭: ${r.bubbleHintText}`);
    if (r.llmContent.mediationForSender) log(`    仲介(送): ${r.llmContent.mediationForSender}`);
    if (r.llmContent.sharedInsight) log(`    共有: ${r.llmContent.sharedInsight}`);
  }

  log("\n" + "═".repeat(70));

  // ファイルにもレポートを出力（vitest が console.log を吸収するため）
  fs.writeFileSync("/tmp/e2e-eval-report.txt", lines.join("\n"), "utf-8");

  return { total, passed, failed, catStats, failStats, llmStats };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// テスト実行
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Intent Translation — E2E Eval（LLMあり）", () => {
  it("選定50件の存在確認", () => {
    expect(E2E_CASE_IDS.length).toBe(50);

    // 全IDが332件セット内に存在する
    const allIds = new Set(ALL_EVAL_CASES.map((c) => c.id));
    for (const id of E2E_CASE_IDS) {
      expect(allIds.has(id), `${id} が332件セットに存在しない`).toBe(true);
    }

    // カテゴリ分布
    const cases = E2E_CASE_IDS.map((id) => ALL_EVAL_CASES.find((c) => c.id === id)!);
    const aCount = cases.filter((c) => c.category === "ambiguous_short").length;
    const bCount = cases.filter((c) => c.category === "light_friction").length;
    const cCount = cases.filter((c) => c.category === "joint_decision").length;
    expect(aCount).toBe(17);
    expect(bCount).toBe(17);
    expect(cCount).toBe(16);
  });

  it("E2E 50件実行", async () => {
    const cases = E2E_CASE_IDS.map(
      (id) => ALL_EVAL_CASES.find((c) => c.id === id)!,
    );

    // 直列実行（LLM呼び出しのレート制限考慮）
    const results: E2EResult[] = [];
    for (const c of cases) {
      results.push(await runE2ECase(c));
    }

    const report = generateE2EReport(results);
    expect(report.total).toBe(50);
  }, 600_000); // 10分タイムアウト
});
