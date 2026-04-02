/**
 * P0 LLM出力検証用テストエンドポイント（一時的）
 * 認証不要・ダミーデータで P0 修正後のプロンプト構築 → LLM呼び出し → バリデーションを検証
 *
 * Usage: POST /api/test/alter-p0 { "message": "..." }
 * 本番デプロイ前に削除すること
 */

import { NextRequest, NextResponse } from "next/server";
import { runAI } from "@/lib/ai";
import {
  buildAlterPersonality,
  type AlterInput,
} from "@/lib/stargazer/alter";
import {
  buildHomeAlterPromptWithContext,
  buildHomeAlterUserPrompt,
  buildPersonalizedFactsWithDomain,
  extractExpectedKeywords,
  validateHomeAlterResponseWithMode,
  formatHomeAlterResponse,
  classifyQuestion,
  analyzeQueryContext,
  selectResponseModeWithReason,
  buildDomainOverlay,
  parseDecisionMetadata,
  buildJudgmentFramework,
  extractRelationalLens,
  extractInputUnderstanding,
  buildJudgmentSkeleton,
  buildHomeAlterRetryPrompt,
  isEmotionalQuestion,
  isSelfUnderstandingQuestion,
  classifyQuestionType,
  applyQuestionTypeOverride,
  type QuestionType,
  type ResponseMode,
  type ModeDecisionReason,
} from "@/lib/stargazer/alterHomeAdapter";
import { resolveArchetype } from "@/lib/stargazer/archetypeResolver";
import { getArchetypeByCode } from "@/lib/stargazer/archetypeTypes";
import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";

// テスト用の軸スコア（代表的なプロフィール）
const DUMMY_AXIS_SCORES: Partial<Record<TraitAxisKey, number>> = {
  introvert_vs_extrovert: -0.3,
  individual_vs_social: 0.2,
  cautious_vs_bold: 0.4,
  analytical_vs_intuitive: -0.5,
  change_embrace_vs_resist: 0.3,
  plan_vs_spontaneous: -0.2,
  tradition_vs_novelty: 0.6,
  independence_vs_harmony: 0.3,
  direct_vs_diplomatic: -0.1,
  stress_isolation_vs_social: -0.4,
  abstract_structuring: 0.5,
  decomposition: 0.4,
  cognitive_updating: 0.3,
  decision_tempo: -0.2,
  exploration_closure: 0.1,
};

export async function POST(req: NextRequest) {
  // 開発環境のみ許可
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }

  let body: { message: string; userName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { message, userName = "テスト" } = body;
  if (!message || typeof message !== "string") {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  try {
    // 1. 性格データ構築（ダミー）
    const archetype = resolveArchetype(DUMMY_AXIS_SCORES);
    const alterInput: AlterInput = {
      archetypeCode: archetype.code,
      shadowCode: getArchetypeByCode(archetype.code)?.shadowCode ?? archetype.code,
      axisScores: DUMMY_AXIS_SCORES,
      observationDepth: 30,
    };
    const personality = buildAlterPersonality(alterInput);

    // 2. P1-A: 5タイプルーター
    const questionType: QuestionType = classifyQuestionType(message);
    const emotional = isEmotionalQuestion(message);
    const selfUnderstanding = isSelfUnderstandingQuestion(message);
    const questionCategory = classifyQuestion(message);
    const queryContext = analyzeQueryContext(message);
    const domainOverlay = buildDomainOverlay(personality, queryContext.domain);
    // extractRelationalLens は message のみ受け取る
    const relationalLens = extractRelationalLens(message);

    // 3. 応答モード選択 + P1-A型オーバーライド
    const rawModeDecision = selectResponseModeWithReason(queryContext, relationalLens, null);
    const modeDecision = applyQuestionTypeOverride(rawModeDecision, questionType);
    const responseMode: ResponseMode = modeDecision.mode;
    const modeDecisionReason: ModeDecisionReason = modeDecision.reason;

    // 4. Judgment Framework + Skeleton
    // buildJudgmentFramework(personality, homeContext?, userMessage?)
    const framework = buildJudgmentFramework(personality, null, message);
    // extractInputUnderstanding(message, queryContext, relationalLens)
    const inputUnderstanding = extractInputUnderstanding(message, queryContext, relationalLens);
    // buildJudgmentSkeleton(framework, queryContext, relationalLens, inputUnderstanding, responseMode)
    const skeleton = buildJudgmentSkeleton(
      framework, queryContext, relationalLens, inputUnderstanding, responseMode,
    );

    // 5. P0修正後のプロンプト構築（T0 = コンテキスト注入なし）
    const personalizedFacts = buildPersonalizedFactsWithDomain(
      personality, { observationCount: 0 } as any, questionCategory, domainOverlay,
      null, // activeLifeContext = null (T0 = no context injection)
      null, // hypothesisFacts = null
      null, // baselineDeviations = null
      null, // personMapFacts = null
    );

    const homeSystemPrompt = buildHomeAlterPromptWithContext(
      personality, { observationCount: 0 } as any, questionCategory, message,
      responseMode, queryContext, domainOverlay, userName, relationalLens,
      skeleton,
    );

    const homeUserPrompt = buildHomeAlterUserPrompt(message);

    // 6. LLM呼び出し
    let homeResponse = "";
    let rawLlmOutput = "";
    const aiResult = await runAI({
      taskType: "stargazer_alter_response",
      prompt: homeUserPrompt,
      systemPrompt: homeSystemPrompt,
      requireJson: false,
      temperature: responseMode === "clarify" ? 0.3 : 0.6,
      maxOutputTokens: responseMode === "clarify" ? 512 : 2048,
      userId: "test-p0-verification",
      metadata: {
        feature: "alter_p0_test",
        mode: "warm",
        turnNumber: 0,
        skipCache: true,
      },
    });

    if (aiResult.success && aiResult.text?.trim()) {
      rawLlmOutput = aiResult.text.trim();
      if (responseMode === "clarify" || responseMode === "direct_response") {
        homeResponse = formatHomeAlterResponse(rawLlmOutput, userName);
      } else {
        const { responseText: stripped } = parseDecisionMetadata(rawLlmOutput);
        homeResponse = formatHomeAlterResponse(stripped, userName);
      }
    }

    // 7. P0修正後のバリデーション
    const expectedKeywords = extractExpectedKeywords(personalizedFacts);
    let validation = homeResponse
      ? validateHomeAlterResponseWithMode(homeResponse, message, expectedKeywords, responseMode)
      : { pass: false, failures: ["応答の生成に失敗"] };
    let retried = false;

    // 8. 不合格ならリトライ（本番と同じ動作）
    if (!validation.pass && homeResponse && responseMode !== "clarify" && responseMode !== "direct_response") {
      retried = true;
      try {
        const retryPrompt = buildHomeAlterRetryPrompt(
          message, homeResponse, validation.failures,
          personalizedFacts, questionCategory, userName,
        );
        const retryResult = await runAI({
          taskType: "stargazer_alter_response",
          prompt: retryPrompt,
          systemPrompt: homeSystemPrompt,
          requireJson: false,
          temperature: 0.4,
          maxOutputTokens: 2048,
          userId: "test-p0-verification",
          metadata: {
            feature: "alter_p0_test",
            mode: "warm",
            turnNumber: 0,
            skipCache: true,
            attempt: 1,
          },
        });
        if (retryResult.success && retryResult.text?.trim()) {
          const { responseText: retryStripped } = parseDecisionMetadata(retryResult.text);
          const retryFormatted = formatHomeAlterResponse(retryStripped, userName);
          const retryValidation = validateHomeAlterResponseWithMode(retryFormatted, message, expectedKeywords, responseMode);
          if (retryValidation.pass) {
            homeResponse = retryFormatted;
            validation = retryValidation;
          } else {
            // リトライも失敗 - リトライ版を使うが failures は保持
            homeResponse = retryFormatted || homeResponse;
            validation = retryValidation;
          }
        }
      } catch { /* retry failed silently */ }
    }

    // 9. 結果を返す
    return NextResponse.json({
      message,
      detection: {
        questionType,
        emotional,
        selfUnderstanding,
        questionCategory,
        domain: queryContext.domain,
        domainConfidence: queryContext.domain_confidence,
        ambiguityScore: queryContext.ambiguity_score,
        responseMode,
        modeDecisionReason,
        actionShape: skeleton.action_shape,
      },
      response: homeResponse,
      validation: {
        pass: validation.pass,
        failures: validation.failures,
      },
      meta: {
        archetype: archetype.code,
        archetypeName: personality.archetypeName,
        promptLength: homeSystemPrompt.length,
        trustLevel: 0, // T0 = no context injection
        retried,
      },
    });
  } catch (e: any) {
    console.error("[test/alter-p0] Error:", e);
    return NextResponse.json({
      error: e.message,
      stack: e.stack?.split("\n").slice(0, 10),
    }, { status: 500 });
  }
}
