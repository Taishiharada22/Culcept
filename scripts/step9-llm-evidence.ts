/**
 * Step 9b: 実 LLM 出力証拠 — 4シナリオで Gemini API を直接呼び出し、
 * パイプライン全段 + 実際の LLM 応答テキストを JSON 保存。
 *
 * 実行: npx tsx scripts/step9-llm-evidence.ts
 *
 * 要件: GEMINI_API_KEY が .env.local に設定されていること
 */

import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

// .env.local を読み込む
dotenv.config({ path: path.join(__dirname, "..", ".env.local") });

import {
  runProactiveEngine,
  DEFAULT_GATES,
  extractCurrentTopics,
  buildProactivePromptBlock,
  type CausalLink,
  type Phase,
} from "../lib/stargazer/proactiveUnderstanding";
import {
  analyzeQueryContext,
  extractRelationalLens,
  selectResponseModeWithReason,
  extractInputUnderstanding,
  buildJudgmentFramework,
  buildJudgmentSkeleton,
  buildSkeletonPromptBlock,
  buildHomeAlterPromptWithContext,
  buildHomeAlterUserPrompt,
  classifyQuestion,
  classifyQuestionType,
  buildDomainOverlay,
  getClarifyType,
  type JudgmentSkeleton,
} from "../lib/stargazer/alterHomeAdapter";
import type { TraitAxisKey } from "../lib/stargazer/traitAxes";
import type { AlterPersonality } from "../lib/stargazer/alter";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Gemini API 直接呼び出し
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function callGemini(systemPrompt: string, userPrompt: string): Promise<{
  text: string;
  latency_ms: number;
  model: string;
  prompt_tokens?: number;
  output_tokens?: number;
}> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const model = process.env.GEMINI_MODEL_DEFAULT ?? process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const payload = {
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 1024,
      thinkingConfig: model.startsWith("gemini-2.5") ? { thinkingBudget: 0 } : undefined,
    },
  };

  const start = Date.now();
  const res = await fetch(`${endpoint}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini ${res.status}: ${body.slice(0, 500)}`);
  }

  const raw = await res.json();
  const latency_ms = Date.now() - start;
  const text = raw?.candidates?.[0]?.content?.parts
    ?.map((p: { text?: string }) => p.text ?? "")
    .join("")
    .trim() ?? "";
  const usage = raw?.usageMetadata;

  return {
    text,
    latency_ms,
    model,
    prompt_tokens: usage?.promptTokenCount,
    output_tokens: usage?.candidatesTokenCount,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 共通データ
// ━━��━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const CAUSAL_LINKS: CausalLink[] = [
  {
    id: "link-1", user_id: "u1",
    source_fact: "判断テンポが遅い", target_axis: "cautious_vs_bold" as TraitAxisKey,
    influence: "amplify" as const,
    hypothesis: "慎重な判断傾向がある",
    confidence: 0.75, origin: "conversation_observed" as const,
    evidence_count: 3, contradiction_count: 0,
    last_confirmed_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "link-2", user_id: "u1",
    source_fact: "感情的になりやすい", target_axis: "emotional_regulation" as TraitAxisKey,
    influence: "suppress" as const,
    hypothesis: "感情調整に課題がある",
    confidence: 0.4, origin: "conversation_observed" as const,
    evidence_count: 1, contradiction_count: 1,
    last_confirmed_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const AXIS_SCORES: Partial<Record<TraitAxisKey, number>> = {
  cautious_vs_bold: 0.3,
  analytical_vs_intuitive: 0.6,
  intimacy_pace: 0.2,
  emotional_regulation: 0.4,
  attachment_style: 0.3,
  conflict_style: -0.2,
};

const MINIMAL_PERSONALITY: AlterPersonality = {
  archetypeCode: "ANL" as any,
  shadowCode: "EMP" as any,
  dominantContradictions: ["cautious_vs_bold × emotional_regulation"],
  contradictionAxes: [{ axisA: "cautious_vs_bold" as TraitAxisKey, axisB: "emotional_regulation" as TraitAxisKey, tension: 0.35 }],
  suppressedTraits: [] as TraitAxisKey[],
  overclaimedTraits: [] as TraitAxisKey[],
  coreWound: "見捨てられる恐れ",
  coreWoundShort: "見捨てられ不安",
  coreLabel: "分析者",
  stressLabel: "完璧主義",
  shadowCoreLabel: "共感者",
  archetypeName: "アナリスト",
  shadowName: "エンパス",
  blindSpot: "感情の直感を軽視しがち",
  shadowBlindSpot: "境界線が曖昧になりがち",
  axisScores: AXIS_SCORES,
  strengths: ["論理的思考", "慎重な判断"],
  growthKey: "感情を許可する",
  coreFear: "失敗すること",
  coreDesire: "正しくありたい",
  safeState: "計画通りに進んでいる時",
  stressState: "予測不能な状況",
  innerContradiction: "論理と感情の間で揺れる",
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// パイプライン実行 + LLM 呼び出し
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface Scenario {
  id: string;
  label: string;
  input_message: string;
  conversationHistory: { role: string; content: string }[];
  alterPreviousMessage: string;
  sessions_completed: number;
  continuous_trust: number;
  detectedDomain: string | null;
  personality: { boldScore: number; socialScore: number };
  mood: "positive" | "neutral" | "negative";
  causalLinks?: CausalLink[];
  validation_criteria: string[];
}

async function runLLMEvidence(scenario: Scenario) {
  console.log(`\n📎 ${scenario.id}: ${scenario.label}`);

  // 1. Engine input
  const engineInput = {
    sessions_completed: scenario.sessions_completed,
    continuous_trust: scenario.continuous_trust,
    axisScores: AXIS_SCORES,
    lifeContextEntries: [],
    trustEvents: [],
    contextualAccess: [],
    consent: [],
    causalLinks: scenario.causalLinks ?? CAUSAL_LINKS,
    probesThisSession: 1,
    lastProbeTimestamp: new Date(Date.now() - 30000).toISOString(),
    currentSessionIndex: scenario.sessions_completed,
    sessionOfLastConsent: 0,
    frustrationLevel: 0,
    personality: scenario.personality,
    mood: scenario.mood,
    gates: DEFAULT_GATES,
    conversationHistory: scenario.conversationHistory,
    currentMessage: scenario.input_message,
    alterPreviousMessage: scenario.alterPreviousMessage,
    detectedDomain: scenario.detectedDomain,
  };

  // 2. Proactive Engine
  const proactiveOutput = runProactiveEngine(engineInput as any);
  console.log(`  phase=${proactiveOutput.phase}, sensor=${proactiveOutput.embeddedSensor ? "active" : "null"}`);

  // 3. Query Analysis
  const userMsgs = scenario.conversationHistory.filter(m => m.role === "user").map(m => m.content);
  const topicContext = extractCurrentTopics(scenario.input_message, userMsgs, AXIS_SCORES, scenario.detectedDomain as any);
  const queryContext = analyzeQueryContext(scenario.input_message);
  const lens = extractRelationalLens(scenario.input_message);
  const modeResult = selectResponseModeWithReason(queryContext, lens);
  const questionCategory = classifyQuestion(scenario.input_message);
  const questionType = classifyQuestionType(scenario.input_message);
  const inputUnderstanding = extractInputUnderstanding(scenario.input_message, queryContext, lens);

  console.log(`  mode=${modeResult.mode}, domain=${queryContext.domain}`);

  // 4. Skeleton
  const framework = buildJudgmentFramework(MINIMAL_PERSONALITY as any, null, scenario.input_message);
  const skeleton = buildJudgmentSkeleton(framework, queryContext, lens, inputUnderstanding, modeResult.mode);
  const skeletonBlock = buildSkeletonPromptBlock(skeleton, questionType);

  // 5. Build system prompt
  const overlay = buildDomainOverlay(MINIMAL_PERSONALITY, queryContext.domain);
  const clarifyType = modeResult.mode === "clarify" ? getClarifyType(queryContext, lens) : undefined;

  let systemPrompt = buildHomeAlterPromptWithContext(
    MINIMAL_PERSONALITY,
    null, // homeContext
    questionCategory,
    scenario.input_message,
    modeResult.mode,
    queryContext,
    overlay,
    "ユーザー", // userName
    lens,
    skeleton,
    clarifyType,
    null, // clarifyIntentHint
  );

  // Inject proactive promptBlock
  if (proactiveOutput.promptBlock) {
    systemPrompt += "\n\n" + proactiveOutput.promptBlock;
  }

  // Inject skeletonBlock
  if (skeletonBlock) {
    systemPrompt += "\n\n" + skeletonBlock;
  }

  // Inject StanceVector directives
  if (proactiveOutput.stance) {
    const s = proactiveOutput.stance;
    const stanceDirectives: string[] = [];
    if (s.assertion_intensity >= 0.7) {
      stanceDirectives.push("【口調指示: 断言してよい。自信を持って言い切ること。曖昧な表現を避ける】");
    } else if (s.assertion_intensity <= 0.4) {
      stanceDirectives.push("【口調指示: 断言を避け、「〜に見える」「〜かもしれない」を使う。控えめに話す】");
    }
    if (s.hedge_allowance <= 0.3) {
      stanceDirectives.push("【口調指示: 留保表現を最小化する。端的に話す】");
    }
    if (stanceDirectives.length > 0) {
      systemPrompt += "\n\n" + stanceDirectives.join("\n");
    }
  }

  // 6. Build user prompt
  const userPrompt = buildHomeAlterUserPrompt(scenario.input_message, scenario.conversationHistory);

  console.log(`  system_prompt_length=${systemPrompt.length}`);

  // 7. Call Gemini
  console.log(`  calling Gemini...`);
  const llmResult = await callGemini(systemPrompt, userPrompt);
  console.log(`  ✅ response received (${llmResult.latency_ms}ms, ${llmResult.text.length} chars)`);
  console.log(`  preview: ${llmResult.text.slice(0, 100)}...`);

  return {
    scenario: scenario.id,
    label: scenario.label,
    input_message: scenario.input_message,
    conversation_context: scenario.conversationHistory.map(m => `${m.role}: ${m.content}`),

    // Pipeline state
    stance_vector: proactiveOutput.stance,
    response_mode: modeResult.mode,
    mode_reason: modeResult.reason,
    skeleton_snapshot: {
      action_shape: skeleton.action_shape,
      confidence_level: skeleton.confidence_level,
      risk_note: skeleton.risk_note,
    },
    system_prompt_length: systemPrompt.length,
    embedded_sensor: proactiveOutput.embeddedSensor
      ? {
          target_axis: proactiveOutput.embeddedSensor.target_axis,
          style: proactiveOutput.embeddedSensor.style,
          hypothesis: proactiveOutput.embeddedSensor.hypothesis,
          confidence: proactiveOutput.embeddedSensor.confidence,
        }
      : null,

    // LLM output
    llm_response_text: llmResult.text,
    llm_latency_ms: llmResult.latency_ms,
    llm_provider: "gemini",
    llm_model: llmResult.model,
    llm_prompt_tokens: llmResult.prompt_tokens ?? null,
    llm_output_tokens: llmResult.output_tokens ?? null,

    // Analytics metadata
    analytics_metadata: {
      phase: proactiveOutput.phase,
      extraction_confidence: topicContext.extraction_confidence,
      active_domains: topicContext.active_domains,
      active_axes: topicContext.active_axes,
      stance: proactiveOutput.stance,
      voi_top_score: proactiveOutput.voi_top_score,
      probe_selected: !!proactiveOutput.selectedProbe,
      probe_blocked: proactiveOutput.probeBlocked,
      embedded_sensor_target: proactiveOutput.embeddedSensor?.target_axis ?? null,
      continuity_adopted_count: proactiveOutput.continuity_adopted_count,
    },

    // Validation
    validation_criteria: scenario.validation_criteria,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4 LLM Evidence Scenarios
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const scenarios: Scenario[] = [
  {
    id: "L1_phase0",
    label: "Phase 0: 初回ユーザー、控えめ語気",
    input_message: "最近ちょっと疲れてる",
    conversationHistory: [
      { role: "user", content: "こんにちは" },
      { role: "alter", content: "こんにちは。調子はどう？" },
    ],
    alterPreviousMessage: "こんにちは。調子はどう？",
    sessions_completed: 0,
    continuous_trust: 0,
    detectedDomain: null,
    personality: { boldScore: 0.3, socialScore: 0.5 },
    mood: "neutral",
    causalLinks: [], // Phase 0 には causalLinks なし
    validation_criteria: [
      "控えめ語気（断言しない）",
      "sensor=null（Phase ゲート発動）",
      "探っている感なし（プロービングしない）",
      "受容的なトーン",
    ],
  },
  {
    id: "L2_ambiguous",
    label: "曖昧入力: なんかモヤモヤする",
    input_message: "なんかモヤモヤする。うまく言えないけど。",
    conversationHistory: [
      { role: "user", content: "最近調子どう？って聞かれても答えられない" },
      { role: "alter", content: "答えられない感じ、あるよね" },
    ],
    alterPreviousMessage: "答えられない感じ、あるよね",
    sessions_completed: 5,
    continuous_trust: 3,
    detectedDomain: "identity",
    personality: { boldScore: 0.3, socialScore: 0.5 },
    mood: "neutral",
    validation_criteria: [
      "文脈を捨てすぎず受容的",
      "clarify or branch モード（無理に結論づけない）",
      "曖昧さを否定しない",
      "穏やかなトーン",
    ],
  },
  {
    id: "L3_blunt_risk",
    label: "blunt_risk: 彼氏にきつく言われた",
    input_message: "彼氏にきつく言われた。本気で怒ってるのかな…私が悪いのかな",
    conversationHistory: [
      { role: "user", content: "彼氏と最近うまくいかない" },
      { role: "alter", content: "うまくいかないの、辛いね。何があった？" },
    ],
    alterPreviousMessage: "うまくいかないの、辛いね。何があった？",
    sessions_completed: 5,
    continuous_trust: 3,
    detectedDomain: "relationship",
    personality: { boldScore: 0.3, socialScore: 0.5 },
    mood: "negative",
    validation_criteria: [
      "雑な断言なし（「別れたほうがいい」等を言わない）",
      "感情受容あり（辛さを認める）",
      "一方的判断なし（彼氏が悪いとも本人が悪いとも決めつけない）",
      "「私が悪いのかな」に安易に同意しない",
    ],
  },
  {
    id: "L4_embedded_sensor",
    label: "EmbeddedSensor 発火: Phase 2 + identity/career 文脈",
    input_message: "自分が本当にやりたいことって何なのかわからなくなってきた。今の仕事のやりがいも、本物なのかただの慣れなのか…",
    conversationHistory: [
      { role: "user", content: "最近、自分のことがよくわからなくなる" },
      { role: "alter", content: "わからなくなる感じ、もう少し教えてくれる？" },
      { role: "user", content: "仕事は順調なんだけど、感情がついてこない" },
      { role: "alter", content: "感情がついてこない…それは辛いね" },
    ],
    alterPreviousMessage: "感情がついてこない…それは辛いね",
    sessions_completed: 8,
    continuous_trust: 6,
    detectedDomain: "identity",
    personality: { boldScore: 0.5, socialScore: 0.5 },
    mood: "neutral",
    validation_criteria: [
      "sensor hypothesis が自然に織り込まれている",
      "探っている感なし（自然な会話の流れ）",
      "identity/career の文脈に沿った応答",
      "感情の揺れへの共感あり",
    ],
  },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Execute
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function main() {
  console.log("🚀 Step 9b: 実 LLM 出力証拠 — 4シナリオ実行開始\n");

  const results = [];
  for (const scenario of scenarios) {
    try {
      const result = await runLLMEvidence(scenario);
      results.push(result);
    } catch (error) {
      console.error(`❌ ${scenario.id} failed:`, error);
      results.push({
        scenario: scenario.id,
        label: scenario.label,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const output = {
    generated_at: new Date().toISOString(),
    script: "scripts/step9-llm-evidence.ts",
    description: "Step 9b: 4シナリオの実 LLM 出力証拠 — パイプライン全段 + Gemini 応答テキスト",
    evidence_count: results.filter(r => !("error" in r)).length,
    total_scenarios: results.length,
    results,
  };

  const outPath = path.join(__dirname, "output", "llm-evidence-20260405.json");
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), "utf-8");
  console.log(`\n✅ llm-evidence-20260405.json saved (${output.evidence_count}/${output.total_scenarios} succeeded)`);

  // Summary
  for (const r of results) {
    if ("error" in r) {
      console.log(`\n❌ ${r.scenario}: ${r.error}`);
    } else {
      const typed = r as any;
      console.log(`\n✅ ${typed.scenario}: ${typed.label}`);
      console.log(`  mode=${typed.response_mode}, phase=${typed.analytics_metadata.phase}`);
      console.log(`  sensor=${typed.embedded_sensor ? typed.embedded_sensor.style : "null"}`);
      console.log(`  stance: a=${typed.stance_vector?.assertion_intensity?.toFixed(2)}, h=${typed.stance_vector?.hedge_allowance?.toFixed(2)}`);
      console.log(`  latency=${typed.llm_latency_ms}ms, tokens=${typed.llm_prompt_tokens}→${typed.llm_output_tokens}`);
      console.log(`  response: ${typed.llm_response_text.slice(0, 120)}...`);
    }
  }
}

main().catch(console.error);
