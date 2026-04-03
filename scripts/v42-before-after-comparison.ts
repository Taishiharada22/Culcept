#!/usr/bin/env npx tsx
/**
 * v4.2 Before/After 実出力比較
 *
 * 実行: npx tsx scripts/v42-before-after-comparison.ts
 *
 * 10本のテストケース（7問題パターン網羅）に対し:
 *   Before = 既存パイプライン（v4.2 なし）で Gemini 実呼び出し
 *   After  = v4.2 FULL パイプライン追加で Gemini 実呼び出し
 * を行い、実出力を比較・KPI算出する。
 *
 * 出力: scripts/audit-results/v42-before-after-{timestamp}.json
 *       + 標準出力に人間評価用サマリ
 */

import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

// ━━━━ Existing pipeline imports ━━━━
import {
  analyzeQueryContext,
  extractRelationalLens,
  selectResponseModeWithReason,
  extractInputUnderstanding,
  buildJudgmentFramework,
  buildJudgmentSkeleton,
  buildDomainOverlay,
  buildHomeAlterPromptWithContext,
  classifyQuestion,
  formatHomeAlterResponse,
  type ResponseMode,
  type QueryContext,
  type RelationalLens,
  type JudgmentSkeleton,
  type InputUnderstanding,
  type Reaction,
  type QuestionType,
} from "../lib/stargazer/alterHomeAdapter";

// ━━━━ v4.2 imports ━━━━
import {
  selectAlterRole,
  checkSemanticBans,
  buildRoleContractBlock,
  buildBurdenTransferBlock,
  buildSemanticBansBlock,
  type RoleSelection,
  type SemanticBanCheck,
} from "../lib/stargazer/alterContracts";

import {
  readTurnSignal,
  type TurnSignal,
} from "../lib/stargazer/alterSignalReader";

import {
  projectSelfModel,
  buildSelfModelPromptBlock,
  type LivingSelfModel,
} from "../lib/stargazer/alterSelfModel";

import {
  runInterpretationArena,
  buildArenaPromptBlock,
  type WinningInterpretation,
} from "../lib/stargazer/alterInterpretationArena";

import {
  checkStrategyCompliance,
  assessRally,
  buildRallyCriticBlock,
  type ComplianceCheckResult,
  type RallyCriticResult,
} from "../lib/stargazer/alterStrategyCompliance";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Config
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL_DEFAULT || "gemini-2.5-flash";
const RETRY_MAX = 2;

if (!GEMINI_API_KEY) {
  console.error("❌ GEMINI_API_KEY が設定されていません (.env.local を確認)");
  process.exit(1);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Gemini API wrapper (same as homeAlterResponseAudit.ts)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function callGemini(
  systemPrompt: string,
  userPrompt: string,
  temperature = 0.6,
  maxTokens = 2048,
): Promise<{ text: string; latencyMs: number }> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const payload = {
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: { temperature, maxOutputTokens: maxTokens },
  };

  const start = Date.now();
  let lastError = "";
  for (let attempt = 0; attempt <= RETRY_MAX; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 45000);
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        lastError = `HTTP ${res.status}: ${await res.text()}`;
        if (res.status === 429) {
          await sleep(5000 * (attempt + 1));
          continue;
        }
        throw new Error(lastError);
      }

      const result = await res.json();
      const text = result.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      return { text, latencyMs: Date.now() - start };
    } catch (e: any) {
      lastError = e.message;
      if (attempt < RETRY_MAX) await sleep(2000 * (attempt + 1));
    }
  }
  throw new Error(`Gemini call failed after ${RETRY_MAX + 1} attempts: ${lastError}`);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test Personalities (reused from audit)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const CAUTIOUS_PERSONALITY = {
  archetypeName: "慎重な探索者",
  archetypeDescription: "石橋を叩いて渡る。でも渡らないことも多い。",
  coreWoundShort: "見捨てられ不安",
  axisScores: {
    decision_tempo: 0.3, social_initiative: 0.7, intimacy_pace: 0.2,
    attachment_style: 0.4, reassurance_need: 0.7, emotional_variability: 0.6,
    boundary_awareness: 0.3, locus_of_control: 0.6, growth_mindset: 0.7,
    rumination_tendency: 0.7, cautious_vs_bold: 0.3,
    independence_vs_harmony: 0.6, change_embrace_vs_resist: 0.5,
  },
} as any;

const BOLD_PERSONALITY = {
  archetypeName: "衝動的な挑戦者",
  archetypeDescription: "考える前に動く。後悔は後から来る。",
  coreWoundShort: "自分には価値がない不安",
  axisScores: {
    decision_tempo: 0.8, social_initiative: 0.9, intimacy_pace: 0.7,
    attachment_style: 0.6, reassurance_need: 0.3, emotional_variability: 0.8,
    boundary_awareness: 0.7, locus_of_control: 0.8, growth_mindset: 0.9,
    rumination_tendency: 0.2, cautious_vs_bold: 0.8,
    independence_vs_harmony: 0.3, change_embrace_vs_resist: 0.8,
  },
} as any;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Mock data for Self Model projection
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const MOCK_GROWTH_STATE = {
  session_count: 8,
  total_turns: 42,
  trust_trajectory: "growing",
  topics_explored: ["work", "relationships", "identity"],
  recurring_themes: ["承認欲求", "比較癖", "決断の先延ばし"],
  archetype_shift_history: [],
} as any;

const MOCK_LONG_TERM_MEMORY = {
  key_facts: [
    "IT企業で働いている",
    "一人暮らし3年目",
    "最近転職を考えている",
  ],
  emotional_patterns: [
    "仕事のストレスを抱えがち",
    "人間関係では受け身になりやすい",
  ],
  blind_spots: ["自分の気持ちを後回しにする傾向"],
  strengths: ["分析力が高い", "慎重に物事を考えられる"],
} as any;

const MOCK_HYPOTHESIS_FACTS = [
  {
    id: "h1", axis: "core_drive", statement: "本当は安定より成長を求めている",
    status: "strengthening", evidence_count: 3,
  },
  {
    id: "h2", axis: "decision_pattern", statement: "「失敗したくない」が判断を支配しがち",
    status: "stable", evidence_count: 5,
  },
] as any;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 10 Test Scenarios (7 problem types)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface TestScenario {
  id: string;
  /** 問題パターン */
  problem_type: string;
  /** ユーザーメッセージ */
  message: string;
  /** 期待される QuestionType */
  questionType: QuestionType;
  /** 会話ターン数（深さ） */
  conversationLength: number;
  /** 会話履歴（ラリーテスト用） */
  conversationHistory?: Array<{ role: string; content: string }>;
  /** ユーザーのリアクション（repair テスト用） */
  reaction?: Reaction | null;
  /** 前回の Alter 応答（repair テスト用） */
  lastAlterContent?: string;
  /** 使用する性格 */
  personality: any;
  /** この問題パターンの説明 */
  problem_description: string;
  /** v4.2 で期待される改善 */
  expected_improvement: string;
}

const SCENARIOS: TestScenario[] = [
  // ── 1. 宿題化（delegation）──
  {
    id: "BA01",
    problem_type: "delegation",
    message: "転職するか迷ってる。今の会社に3年いるけど成長を感じない",
    questionType: "judgment",
    conversationLength: 1,
    personality: CAUTIOUS_PERSONALITY,
    problem_description: "Alter が「考えてみて」「整理してみて」で投げ返す（宿題化）",
    expected_improvement: "v4.2: co_thinker/operator role + semantic ban で宿題化を禁止。Alter が自分で構造を提供する",
  },
  // ── 2. 抽象論逃げ（evasion）──
  {
    id: "BA02",
    problem_type: "evasion",
    message: "上司に無茶な仕事を断るべき？断ったらどうなるか不安",
    questionType: "judgment",
    conversationLength: 1,
    personality: CAUTIOUS_PERSONALITY,
    problem_description: "「状況による」「一概には言えない」で判断を回避する",
    expected_improvement: "v4.2: operator role + evasion ban → 仮説付きで「僕の読みだと〜」で入る",
  },
  // ── 3. repair 失敗（self-defense）──
  {
    id: "BA03",
    problem_type: "repair_failure",
    message: "いや、全然違う。そんなこと聞いてない",
    questionType: "judgment",
    conversationLength: 4,
    conversationHistory: [
      { role: "user", content: "彼女と別れるか迷ってる" },
      { role: "alter", content: "それはつらいね。まず自分の気持ちを整理してみて。3つ書き出してみるといいかも。" },
      { role: "user", content: "いや、整理とかじゃなくて、別れた方がいいかどうか聞きたいんだけど" },
      { role: "alter", content: "うーん、状況によるから一概には言えないけど、お互いの気持ちを確認することが大事だと思うよ。" },
    ],
    reaction: { type: "disagree", disagree_strength: "strong", confidence: 0.9 } as any,
    lastAlterContent: "うーん、状況によるから一概には言えないけど、お互いの気持ちを確認することが大事だと思うよ。",
    personality: BOLD_PERSONALITY,
    problem_description: "強い否定に対し自己弁護・前回の正当化で逃げる（repair 失敗）",
    expected_improvement: "v4.2: repair role 強制 → ズレを認め、別角度から再アプローチ",
  },
  // ── 4. 投げ返し（pass-back）──
  {
    id: "BA04",
    problem_type: "pass_back",
    message: "副業始めたいんだけど何から始めればいい？",
    questionType: "strategy",
    conversationLength: 1,
    personality: CAUTIOUS_PERSONALITY,
    problem_description: "「まず情報収集して」「調べてみて」で投げ返す",
    expected_improvement: "v4.2: operator role + delegation ban → Alter が具体的なアクション計画を提供する",
  },
  // ── 5. 堂々巡り（loop）──
  {
    id: "BA05",
    problem_type: "loop",
    message: "やっぱり転職は怖い。でも今のままも嫌だ",
    questionType: "judgment",
    conversationLength: 6,
    conversationHistory: [
      { role: "user", content: "転職するか迷ってる" },
      { role: "alter", content: "転職は大きな決断だよね。今の会社の何が嫌？" },
      { role: "user", content: "成長を感じない。でも安定はしてる" },
      { role: "alter", content: "安定と成長のバランスだね。転職のリスクも考えた？" },
      { role: "user", content: "リスクが怖い。失敗したらどうしよう" },
      { role: "alter", content: "失敗が怖いのは自然だよ。でも成長したいなら動かないとね。" },
    ],
    personality: CAUTIOUS_PERSONALITY,
    problem_description: "同じテーマを堂々巡りし、新しい角度が出てこない",
    expected_improvement: "v4.2: Rally Critic がループ検知 → 新しい角度を強制注入",
  },
  // ── 6. 一般論（generic platitude）──
  {
    id: "BA06",
    problem_type: "generic",
    message: "自分に自信が持てない。何をしても不安になる",
    questionType: "emotional",
    conversationLength: 2,
    conversationHistory: [
      { role: "user", content: "最近、何をやっても自信が持てない" },
      { role: "alter", content: "自信がないのはつらいよね。自分の良いところを見つけてみよう。" },
    ],
    personality: CAUTIOUS_PERSONALITY,
    problem_description: "教科書的な一般論（「自分を信じて」「いいところを見つけて」）で返す",
    expected_improvement: "v4.2: mirror role + Self Model → この人の具体的なパターンに基づいた鏡返し",
  },
  // ── 7. 過度な前置き（preamble）──
  {
    id: "BA07",
    problem_type: "preamble",
    message: "親に進路を反対されてる。でも自分の気持ちを押し通すべきか",
    questionType: "judgment",
    conversationLength: 1,
    personality: BOLD_PERSONALITY,
    problem_description: "「いい質問だね」「確かにそれは深い問いだ」で始まる無駄な前置き",
    expected_improvement: "v4.2: preamble ban → 1行目から結論を出す",
  },
  // ── 8. 空虚な共感（hollow empathy）──
  {
    id: "BA08",
    problem_type: "hollow_empathy",
    message: "もう疲れた。仕事も人間関係もうまくいかない",
    questionType: "emotional",
    conversationLength: 1,
    personality: CAUTIOUS_PERSONALITY,
    problem_description: "「つらいよね」「大変だよね」を繰り返すだけで洞察がない",
    expected_improvement: "v4.2: mirror role + hollow_empathy ban → 共感は1回、2回目以降は洞察を入れる",
  },
  // ── 9. 複合: 判断回避 + 宿題化 ──
  {
    id: "BA09",
    problem_type: "evasion_delegation_combo",
    message: "彼女に結婚の話を切り出すべきか。でもまだ早いかもしれない",
    questionType: "judgment",
    conversationLength: 1,
    personality: CAUTIOUS_PERSONALITY,
    problem_description: "「人それぞれだから」+「自分の気持ちを見つめてみて」のコンボ",
    expected_improvement: "v4.2: operator role + evasion/delegation ban → 具体的な判断材料を提示",
  },
  // ── 10. 深い自己理解質問への一般論 ──
  {
    id: "BA10",
    problem_type: "generic_self",
    message: "俺って結局何がしたいんだろう。30歳になって焦ってる",
    questionType: "self_understanding",
    conversationLength: 3,
    conversationHistory: [
      { role: "user", content: "最近将来が不安でさ" },
      { role: "alter", content: "30歳前後って色々考える時期だよね。" },
      { role: "user", content: "周りはどんどん進んでるのに、自分だけ止まってる気がする" },
    ],
    personality: CAUTIOUS_PERSONALITY,
    problem_description: "self_understanding に対して教科書的な「自分探し」を勧める",
    expected_improvement: "v4.2: co_thinker role + Self Model + identity_quest lens → この人の判断パターンから仮説を提示",
  },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Pipeline Execution
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface ComparisonResult {
  scenario: TestScenario;
  // Before (baseline)
  before: {
    systemPrompt: string;
    response: string;
    latencyMs: number;
    semanticBanCheck: SemanticBanCheck;
  };
  // After (v4.2)
  after: {
    systemPrompt: string;
    response: string;
    latencyMs: number;
    semanticBanCheck: SemanticBanCheck;
    // v4.2 pipeline details
    signal: TurnSignal | null;
    role: RoleSelection | null;
    selfModel: LivingSelfModel | null;
    arena: WinningInterpretation | null;
    rallyCritic: RallyCriticResult | null;
    compliance: ComplianceCheckResult | null;
    v42PromptAddition: string;
  };
  // KPI measurements
  kpis: {
    /** Before に禁止表現が含まれていたか */
    before_has_ban_violation: boolean;
    /** After に禁止表現が含まれていたか */
    after_has_ban_violation: boolean;
    /** Before が直接回答しているか */
    before_direct_answer: boolean;
    /** After が直接回答しているか */
    after_direct_answer: boolean;
    /** Before に宿題化が含まれるか */
    before_has_delegation: boolean;
    /** After に宿題化が含まれるか */
    after_has_delegation: boolean;
    /** v4.2 の機構が改善に寄与したか */
    v42_mechanisms_activated: string[];
  };
}

/** Build baseline system prompt (existing pipeline without v4.2) */
function buildBaselinePrompt(scenario: TestScenario): string {
  const msg = scenario.message;
  const personality = scenario.personality;

  const queryContext = analyzeQueryContext(msg);
  const lens = extractRelationalLens(msg);
  const modeDecision = selectResponseModeWithReason(queryContext, lens);
  const inputUnderstanding = extractInputUnderstanding(msg, queryContext, lens);
  const framework = buildJudgmentFramework(personality, null, msg);
  const skeleton = buildJudgmentSkeleton(framework, queryContext, lens, inputUnderstanding, modeDecision.mode);
  const questionCategory = classifyQuestion(msg);
  const overlay = buildDomainOverlay(personality, queryContext.domain);

  return buildHomeAlterPromptWithContext(
    personality, null, questionCategory, msg,
    modeDecision.mode, queryContext, overlay, "テスト太郎", lens, skeleton,
  );
}

/** Build v4.2 enhanced system prompt */
function buildV42EnhancedPrompt(scenario: TestScenario): {
  systemPrompt: string;
  signal: TurnSignal | null;
  role: RoleSelection | null;
  selfModel: LivingSelfModel | null;
  arena: WinningInterpretation | null;
  rallyCritic: RallyCriticResult | null;
  v42Addition: string;
} {
  // Start with baseline
  let systemPrompt = buildBaselinePrompt(scenario);
  let v42Addition = "";

  const msg = scenario.message;
  const responseMode: ResponseMode = scenario.reaction?.type === "disagree" && scenario.reaction.disagree_strength === "strong"
    ? "repair" : "conclude";

  // Phase A: Signal Reader + Role Selection
  let signal: TurnSignal | null = null;
  let role: RoleSelection | null = null;
  try {
    signal = readTurnSignal(
      msg, scenario.questionType, responseMode,
      scenario.reaction ?? null,
      scenario.lastAlterContent ?? null,
      scenario.conversationLength,
    );
    role = selectAlterRole(
      responseMode, scenario.questionType,
      scenario.reaction ?? null,
      scenario.conversationLength,
    );
  } catch (e) {
    console.warn(`  [v4.2] Signal/Role failed:`, e);
  }

  // Phase B: Self Model
  let selfModel: LivingSelfModel | null = null;
  try {
    selfModel = projectSelfModel(
      MOCK_GROWTH_STATE,
      MOCK_LONG_TERM_MEMORY,
      MOCK_HYPOTHESIS_FACTS,
      scenario.personality,
      2, // discreteTrustLevel
    );
  } catch (e) {
    console.warn(`  [v4.2] Self Model failed:`, e);
  }

  // Phase B: Interpretation Arena
  let arena: WinningInterpretation | null = null;
  try {
    if (signal && selfModel) {
      const arenaHistory = (scenario.conversationHistory ?? [])
        .filter(m => m.role === "user")
        .map(() => "open_hypothesis" as any); // simplified history
      arena = runInterpretationArena(msg, signal, selfModel, null, arenaHistory);
    }
  } catch (e) {
    console.warn(`  [v4.2] Arena failed:`, e);
  }

  // Rally Critic
  let rallyCritic: RallyCriticResult | null = null;
  try {
    if (signal) {
      const history = (scenario.conversationHistory ?? []).map(m => ({
        role: m.role as "user" | "alter",
        content: m.content,
      }));
      rallyCritic = assessRally(history, [], signal);
    }
  } catch (e) {
    console.warn(`  [v4.2] Rally Critic failed:`, e);
  }

  // Prompt Injection
  if (role && selfModel && arena) {
    const roleBlock = buildRoleContractBlock(role);
    const burdenBlock = buildBurdenTransferBlock(role.role);
    const bansBlock = buildSemanticBansBlock();
    const selfModelBlock = buildSelfModelPromptBlock(selfModel);
    const arenaBlock = buildArenaPromptBlock(arena);

    v42Addition += roleBlock;
    v42Addition += burdenBlock;
    v42Addition += bansBlock;
    v42Addition += selfModelBlock;
    v42Addition += arenaBlock;

    if (rallyCritic) {
      const rallyBlock = buildRallyCriticBlock(rallyCritic);
      v42Addition += rallyBlock;
    }

    systemPrompt += v42Addition;
  }

  return { systemPrompt, signal, role, selfModel, arena, rallyCritic, v42Addition };
}

/** Check for delegation patterns in response */
function hasDelegationPattern(response: string): boolean {
  const patterns = [
    /考えてみて/, /書き出してみ/, /整理してみて/,
    /リストアップしてみ/, /まず情報収集/, /調べてみて/,
    /自分の気持ちを.*見つめ/, /振り返ってみて/, /紙に書い/,
  ];
  return patterns.some(p => p.test(response));
}

/** Check if response gives a direct answer (not evasion) */
function hasDirectAnswer(response: string): boolean {
  const evasionPatterns = [
    /状況による(?:から|ので|けど)/,
    /場合による(?:から|ので|けど)/,
    /一概には[言い]えない/,
    /人それぞれ/,
    /正解はない/,
    /どちらとも言えない/,
  ];
  const hasEvasion = evasionPatterns.some(p => p.test(response));

  // Direct answer indicators
  const directPatterns = [
    /僕の読みだと/, /僕なら/, /結論.*(?:は|から言うと)/,
    /やる(?:べき|方がいい)/, /やめ(?:た方がいい|るべき)/,
    /行(?:くべき|った方がいい)/, /断(?:るべき|った方がいい)/,
    /伝え(?:るべき|た方がいい)/, /待(?:つべき|った方がいい)/,
  ];
  const hasDirect = directPatterns.some(p => p.test(response));

  return hasDirect && !hasEvasion;
}

async function runComparison(scenario: TestScenario): Promise<ComparisonResult> {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`📋 ${scenario.id}: ${scenario.problem_type}`);
  console.log(`   Message: "${scenario.message.slice(0, 50)}..."`);
  console.log(`${"─".repeat(60)}`);

  // ── Before: Baseline ──
  const baselinePrompt = buildBaselinePrompt(scenario);
  const userPrompt = `ユーザーの質問: 「${scenario.message}」\n\n1行目から結論。挨拶・前置き不要。根拠は「この人について今日わかっていること」から引用すること。`;

  console.log("  ⏳ Before (baseline) calling Gemini...");
  const beforeResult = await callGemini(baselinePrompt, userPrompt, 0.6, 2048);
  const beforeResponse = formatHomeAlterResponse(beforeResult.text.trim(), "テスト太郎");
  const beforeBanCheck = checkSemanticBans(beforeResponse);
  console.log(`  ✅ Before: ${beforeResult.latencyMs}ms, ${beforeResponse.length}文字`);

  // Rate limit courtesy
  await sleep(2000);

  // ── After: v4.2 Enhanced (with closed-loop re-generation) ──
  const v42Result = buildV42EnhancedPrompt(scenario);
  console.log("  ⏳ After (v4.2) calling Gemini...");
  const afterResult = await callGemini(v42Result.systemPrompt, userPrompt, 0.6, 2048);
  let afterResponse = formatHomeAlterResponse(afterResult.text.trim(), "テスト太郎");
  let afterBanCheck = checkSemanticBans(afterResponse);
  let afterLatencyMs = afterResult.latencyMs;
  let regenerated = false;
  console.log(`  ✅ After: ${afterResult.latencyMs}ms, ${afterResponse.length}文字`);

  // Compliance check on After response
  let compliance: ComplianceCheckResult | null = null;
  try {
    if (v42Result.role && v42Result.arena) {
      compliance = checkStrategyCompliance(
        afterResponse, v42Result.role, null, null, v42Result.arena,
      );
    }
  } catch {
    // non-fatal
  }

  // ── v4.2 Closed-Loop Re-generation: ban 違反があれば 1回再生成 ──
  if (!afterBanCheck.passed) {
    console.log("  🔄 Ban violation detected → triggering re-generation...");
    await sleep(2000);

    const banCorrections = afterBanCheck.violations.map(v =>
      `- 「${v.expression}」を使ってはならない（${v.category === "delegation" ? "宿題化" : v.category === "evasion" ? "判断回避" : v.category === "hollow_empathy" ? "空虚な共感" : "過度な前置き"}）`
    ).join("\n");
    const complianceCorrections = compliance?.correction_prompt ?? "";

    const retryPrompt = [
      `ユーザーの質問: 「${scenario.message}」`,
      "",
      "## 前回の応答（問題あり — 修正して再生成せよ）",
      `「${afterResponse.slice(0, 400)}」`,
      "",
      "## 禁止表現（絶対に使うな）",
      banCorrections,
      "",
      complianceCorrections,
      "",
      "## 修正ルール",
      "- 上記の禁止表現を含まない応答を生成せよ",
      "- 「考えてみて」「書き出してみて」「整理してみて」→ Alter（あなた）が考えた結果を渡せ",
      "- 「状況による」「場合による」→ 仮説付きで「僕の読みだと〜」で入れ",
      "- 構造を提供するのはあなたの仕事。ユーザーに宿題を出すな。",
      "- 1行目から結論。前置き不要。",
    ].join("\n");

    try {
      const retryResult = await callGemini(v42Result.systemPrompt, retryPrompt, 0.4, 2048);
      const retryFormatted = formatHomeAlterResponse(retryResult.text.trim(), "テスト太郎");
      const retryBanCheck = checkSemanticBans(retryFormatted);

      if (retryBanCheck.passed) {
        afterResponse = retryFormatted;
        afterBanCheck = retryBanCheck;
        afterLatencyMs += retryResult.latencyMs;
        regenerated = true;
        console.log(`  ✅ Re-generation succeeded: ${retryResult.latencyMs}ms, ban violations cleared`);

        // Re-check compliance
        if (v42Result.role && v42Result.arena) {
          compliance = checkStrategyCompliance(
            afterResponse, v42Result.role, null, null, v42Result.arena,
          );
        }
      } else {
        console.log(`  ⚠️  Re-generation still has violations: ${retryBanCheck.violations.map(v => v.expression).join(", ")}`);
        afterLatencyMs += retryResult.latencyMs;
      }
    } catch (e: any) {
      console.warn(`  ❌ Re-generation failed: ${e.message}`);
    }
  }

  // KPI measurements
  const beforeDelegation = hasDelegationPattern(beforeResponse);
  const afterDelegation = hasDelegationPattern(afterResponse);

  const v42Mechanisms: string[] = [];
  if (v42Result.role) v42Mechanisms.push(`role:${v42Result.role.role}`);
  if (v42Result.arena) v42Mechanisms.push(`lens:${v42Result.arena.primary.lens}`);
  if (v42Result.rallyCritic?.status === "looping" || v42Result.rallyCritic?.status === "stalling") {
    v42Mechanisms.push(`rally:${v42Result.rallyCritic.status}`);
  }
  if (v42Result.selfModel && v42Result.selfModel.model_completeness > 0.1) {
    v42Mechanisms.push(`self_model:${(v42Result.selfModel.model_completeness * 100).toFixed(0)}%`);
  }
  if (regenerated) {
    v42Mechanisms.push("regeneration:success");
  }
  if (afterBanCheck.passed && !beforeBanCheck.passed) {
    v42Mechanisms.push("semantic_ban:corrected");
  }

  return {
    scenario,
    before: {
      systemPrompt: baselinePrompt,
      response: beforeResponse,
      latencyMs: beforeResult.latencyMs,
      semanticBanCheck: beforeBanCheck,
    },
    after: {
      systemPrompt: v42Result.systemPrompt,
      response: afterResponse,
      latencyMs: afterLatencyMs,
      semanticBanCheck: afterBanCheck,
      signal: v42Result.signal,
      role: v42Result.role,
      selfModel: v42Result.selfModel,
      arena: v42Result.arena,
      rallyCritic: v42Result.rallyCritic,
      compliance,
      v42PromptAddition: v42Result.v42Addition,
    },
    kpis: {
      before_has_ban_violation: !beforeBanCheck.passed,
      after_has_ban_violation: !afterBanCheck.passed,
      before_direct_answer: hasDirectAnswer(beforeResponse),
      after_direct_answer: hasDirectAnswer(afterResponse),
      before_has_delegation: beforeDelegation,
      after_has_delegation: afterDelegation,
      v42_mechanisms_activated: v42Mechanisms,
    },
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// KPI Calculation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface KPISummary {
  total_scenarios: number;
  // 責任転嫁率
  before_delegation_rate: number;
  after_delegation_rate: number;
  delegation_improvement: string;
  // 直接回答率
  before_direct_answer_rate: number;
  after_direct_answer_rate: number;
  direct_answer_improvement: string;
  // Semantic Ban 違反率
  before_ban_violation_rate: number;
  after_ban_violation_rate: number;
  ban_violation_improvement: string;
  // v4.2 機構発動率
  role_distribution: Record<string, number>;
  lens_distribution: Record<string, number>;
  rally_critic_activations: number;
  self_model_avg_completeness: number;
}

function calculateKPIs(results: ComparisonResult[]): KPISummary {
  const n = results.length;

  const beforeDelegation = results.filter(r => r.kpis.before_has_delegation).length;
  const afterDelegation = results.filter(r => r.kpis.after_has_delegation).length;
  const beforeDirect = results.filter(r => r.kpis.before_direct_answer).length;
  const afterDirect = results.filter(r => r.kpis.after_direct_answer).length;
  const beforeBan = results.filter(r => r.kpis.before_has_ban_violation).length;
  const afterBan = results.filter(r => r.kpis.after_has_ban_violation).length;

  const roleDist: Record<string, number> = {};
  const lensDist: Record<string, number> = {};
  let rallyActivations = 0;
  let selfModelTotal = 0;
  let selfModelCount = 0;

  for (const r of results) {
    const role = r.after.role?.role;
    if (role) roleDist[role] = (roleDist[role] ?? 0) + 1;
    const lens = r.after.arena?.primary.lens;
    if (lens) lensDist[lens] = (lensDist[lens] ?? 0) + 1;
    if (r.after.rallyCritic?.status === "looping" || r.after.rallyCritic?.status === "stalling") {
      rallyActivations++;
    }
    if (r.after.selfModel) {
      selfModelTotal += r.after.selfModel.model_completeness;
      selfModelCount++;
    }
  }

  const pct = (v: number) => ((v / n) * 100).toFixed(1) + "%";
  const delta = (before: number, after: number) => {
    const diff = ((after - before) / n) * 100;
    return diff >= 0 ? `+${diff.toFixed(1)}%` : `${diff.toFixed(1)}%`;
  };

  return {
    total_scenarios: n,
    before_delegation_rate: beforeDelegation / n,
    after_delegation_rate: afterDelegation / n,
    delegation_improvement: `${pct(beforeDelegation)} → ${pct(afterDelegation)} (${delta(beforeDelegation, afterDelegation)})`,
    before_direct_answer_rate: beforeDirect / n,
    after_direct_answer_rate: afterDirect / n,
    direct_answer_improvement: `${pct(beforeDirect)} → ${pct(afterDirect)} (${delta(beforeDirect, afterDirect)})`,
    before_ban_violation_rate: beforeBan / n,
    after_ban_violation_rate: afterBan / n,
    ban_violation_improvement: `${pct(beforeBan)} → ${pct(afterBan)} (${delta(beforeBan, afterBan)})`,
    role_distribution: roleDist,
    lens_distribution: lensDist,
    rally_critic_activations: rallyActivations,
    self_model_avg_completeness: selfModelCount > 0 ? selfModelTotal / selfModelCount : 0,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Human Evaluation Report
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function printHumanReport(results: ComparisonResult[], kpis: KPISummary): void {
  console.log("\n\n");
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║          v4.2 Before/After 実出力比較レポート               ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");

  for (const r of results) {
    console.log(`\n${"━".repeat(70)}`);
    console.log(`📋 ${r.scenario.id}: ${r.scenario.problem_type}`);
    console.log(`📝 問題: ${r.scenario.problem_description}`);
    console.log(`💬 Input: "${r.scenario.message}"`);
    console.log(`${"─".repeat(70)}`);

    console.log(`\n🔴 Before（既存パイプライン）[${r.before.latencyMs}ms]:`);
    console.log(`${r.before.response.slice(0, 500)}`);
    if (r.before.semanticBanCheck.violations.length > 0) {
      console.log(`  ⚠️  Ban violations: ${r.before.semanticBanCheck.violations.map(v => `"${v.expression}" (${v.category})`).join(", ")}`);
    }
    if (r.kpis.before_has_delegation) console.log(`  ⚠️  宿題化パターン検出`);

    console.log(`\n🟢 After（v4.2 FULL）[${r.after.latencyMs}ms]:`);
    console.log(`${r.after.response.slice(0, 500)}`);
    if (r.after.semanticBanCheck.violations.length > 0) {
      console.log(`  ⚠️  Ban violations: ${r.after.semanticBanCheck.violations.map(v => `"${v.expression}" (${v.category})`).join(", ")}`);
    }

    console.log(`\n🔧 v4.2 機構:`);
    console.log(`  Role: ${r.after.role?.role ?? "N/A"} (${r.after.role?.reason ?? "N/A"})`);
    console.log(`  Arena Lens: ${r.after.arena?.primary.lens ?? "N/A"} (conf: ${r.after.arena?.primary.confidence?.toFixed(2) ?? "N/A"})`);
    console.log(`  Self Model: ${r.after.selfModel ? `${(r.after.selfModel.model_completeness * 100).toFixed(0)}%` : "N/A"}`);
    console.log(`  Rally: ${r.after.rallyCritic?.status ?? "N/A"} (depth: ${r.after.rallyCritic?.depth_estimate ?? "N/A"})`);
    if (r.after.compliance) {
      console.log(`  Compliance: ${r.after.compliance.passed ? "PASS" : "FAIL"} (violations: ${r.after.compliance.violations?.length ?? 0})`);
    }
    console.log(`  Activated: [${r.kpis.v42_mechanisms_activated.join(", ")}]`);

    console.log(`\n📊 改善判定:`);
    console.log(`  直接回答: ${r.kpis.before_direct_answer ? "✅" : "❌"} → ${r.kpis.after_direct_answer ? "✅" : "❌"}`);
    console.log(`  宿題化: ${r.kpis.before_has_delegation ? "❌検出" : "✅なし"} → ${r.kpis.after_has_delegation ? "❌検出" : "✅なし"}`);
    console.log(`  Ban違反: ${r.kpis.before_has_ban_violation ? "❌あり" : "✅なし"} → ${r.kpis.after_has_ban_violation ? "❌あり" : "✅なし"}`);
  }

  console.log(`\n\n${"━".repeat(70)}`);
  console.log("📊 KPI サマリ（初回実測値）");
  console.log(`${"━".repeat(70)}`);
  console.log(`  総シナリオ数:        ${kpis.total_scenarios}`);
  console.log(`  責任転嫁率:          ${kpis.delegation_improvement}`);
  console.log(`  直接回答率:          ${kpis.direct_answer_improvement}`);
  console.log(`  Semantic Ban 違反率: ${kpis.ban_violation_improvement}`);
  console.log(`  Rally Critic 発動:   ${kpis.rally_critic_activations}/${kpis.total_scenarios}`);
  console.log(`  Self Model 平均充実度: ${(kpis.self_model_avg_completeness * 100).toFixed(1)}%`);
  console.log(`\n  Role 分布:`);
  for (const [role, count] of Object.entries(kpis.role_distribution)) {
    console.log(`    ${role}: ${count} (${((count / kpis.total_scenarios) * 100).toFixed(0)}%)`);
  }
  console.log(`\n  Lens 分布:`);
  for (const [lens, count] of Object.entries(kpis.lens_distribution)) {
    console.log(`    ${lens}: ${count} (${((count / kpis.total_scenarios) * 100).toFixed(0)}%)`);
  }

  // CEO 人間評価用テンプレート
  console.log(`\n\n${"━".repeat(70)}`);
  console.log("👤 CEO 人間評価テンプレート（5軸 × 10ラリー）");
  console.log(`${"━".repeat(70)}`);
  console.log("各ラリーを以下 5軸で 1-5 評価してください:");
  console.log("  A. 判断の具体性（1=抽象的 → 5=具体的アクション提示）");
  console.log("  B. 個人化度（1=一般論 → 5=この人だけの応答）");
  console.log("  C. 責任の引き受け（1=丸投げ → 5=Alterが構造化して渡す）");
  console.log("  D. 共感の質（1=空虚な共感 → 5=洞察付きの共感）");
  console.log("  E. 1文目のインパクト（1=前置き → 5=結論から入る）");
  console.log("");
  console.log("| ID | Before A-E | After A-E | 勝者 | メモ |");
  console.log("|-----|-----------|----------|------|------|");
  for (const r of results) {
    console.log(`| ${r.scenario.id} | _-_-_-_-_ | _-_-_-_-_ | B/A/= | |`);
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function main() {
  console.log("🚀 v4.2 Before/After 実出力比較開始");
  console.log(`   Model: ${GEMINI_MODEL}`);
  console.log(`   Scenarios: ${SCENARIOS.length}`);
  console.log(`   Time: ${new Date().toISOString()}\n`);

  const results: ComparisonResult[] = [];

  for (const scenario of SCENARIOS) {
    try {
      const result = await runComparison(scenario);
      results.push(result);
      // Rate limit between scenarios
      await sleep(3000);
    } catch (e: any) {
      console.error(`  ❌ ${scenario.id} failed: ${e.message}`);
    }
  }

  // Calculate KPIs
  const kpis = calculateKPIs(results);

  // Print human-readable report
  printHumanReport(results, kpis);

  // Save JSON results
  const outputDir = path.resolve(__dirname, "audit-results");
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const timestamp = Date.now();
  const outputPath = path.join(outputDir, `v42-before-after-${timestamp}.json`);

  const jsonOutput = {
    metadata: {
      model: GEMINI_MODEL,
      timestamp: new Date().toISOString(),
      total_scenarios: SCENARIOS.length,
      completed: results.length,
    },
    kpis,
    results: results.map(r => ({
      id: r.scenario.id,
      problem_type: r.scenario.problem_type,
      message: r.scenario.message,
      problem_description: r.scenario.problem_description,
      expected_improvement: r.scenario.expected_improvement,
      before_response: r.before.response,
      before_latency_ms: r.before.latencyMs,
      before_ban_violations: r.before.semanticBanCheck.violations,
      after_response: r.after.response,
      after_latency_ms: r.after.latencyMs,
      after_ban_violations: r.after.semanticBanCheck.violations,
      after_role: r.after.role?.role,
      after_role_reason: r.after.role?.reason,
      after_arena_lens: r.after.arena?.primary.lens,
      after_arena_confidence: r.after.arena?.primary.confidence,
      after_rally_status: r.after.rallyCritic?.status,
      after_self_model_completeness: r.after.selfModel?.model_completeness,
      after_compliance_passed: r.after.compliance?.passed,
      kpis: r.kpis,
      v42_prompt_addition_length: r.after.v42PromptAddition.length,
    })),
  };

  fs.writeFileSync(outputPath, JSON.stringify(jsonOutput, null, 2));
  console.log(`\n\n💾 Results saved to: ${outputPath}`);
  console.log(`\n✅ Complete: ${results.length}/${SCENARIOS.length} scenarios`);
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
