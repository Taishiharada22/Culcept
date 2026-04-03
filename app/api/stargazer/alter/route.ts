import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { checkStargazerTier } from "@/lib/stargazer/tierGuard";
import {
  buildAlterPersonality,
  buildAlterSystemPrompt,
  buildDeepAlterPrompt,
  generateAlterGreeting,
  generateAlterResponse,
  selectAlterMode,
  calculateOptimalMode,
  type AlterInput,
  type AlterMode,
  type AlterMessage,
  type AlterBehavioralEvidence,
  type AlterDeepContext,
} from "@/lib/stargazer/alter";
import { resolveArchetype } from "@/lib/stargazer/archetypeResolver";
import { getArchetypeByCode } from "@/lib/stargazer/archetypeTypes";
import {
  buildAxisScores,
  calcObservationDepth,
  truncateString,
} from "@/lib/stargazer/sharedRouteUtils";
import {
  buildHomeAlterPromptWithContext,
  buildHomeAlterUserPrompt,
  buildHomeAlterRetryPrompt,
  buildPersonalizedFactsWithDomain,
  extractExpectedKeywords,
  validateHomeAlterResponseWithMode,
  formatHomeAlterResponse,
  extractReasoningBasis,
  classifyQuestion,
  analyzeQueryContext,
  selectResponseMode,
  selectResponseModeWithReason,
  buildDomainOverlay,
  parseDecisionMetadata,
  reconcileDecisionMetadata,
  computeFallbackDecisionMetadata,
  computeForceBalance,
  buildJudgmentFramework,
  ALTER_IDENTITY_BLOCK,
  detectDirectRequest,
  detectCorrectionSignal,
  detectGreeting,
  computeResponseSimilarity,
  extractConversationFacts,
  type HomeAlterContextData,
  type DecisionMetadata,
  type QueryContext,
  type ResponseMode,
  type ModeDecisionReason,
  type QuestionCategory,
  extractRelationalLens,
  enrichRelationalLens,
  extractInputUnderstanding,
  buildJudgmentSkeleton,
  buildSkeletonPromptBlock,
  validateResponseQuality,
  sanitizeTraitInversions,
  buildAuditTrail,
  detectActionShapeHints,
  // Daily Guidance
  extractDailyGuidanceFrame,
  checkDailyGuidanceClarify,
  buildDailyGuidanceSkeleton,
  buildDailyGuidancePromptBlock,
  validateDailyGuidanceResponse,
  type RelationalLens,
  type RelationalLensDetailed,
  type InputUnderstanding,
  type JudgmentSkeleton,
  type ConsistencyCheck,
  type AuditTrail,
  getClarifyType,
  type ClarifyIntentHint,
  type HypothesisFactEntry,
  type BaselineDeviationEntry,
  type PersonMapFactEntry,
  isEmotionalQuestion,
  isSelfUnderstandingQuestion,
  classifyQuestionType,
  applyQuestionTypeOverride,
  classifyReaction,
  type Reaction,
  type QuestionType,
} from "@/lib/stargazer/alterHomeAdapter";
import {
  estimateUserState,
  computeStateAdjustment,
  detectMicroSignals,
  checkSignalConvergence,
  extractLifeContextSignals,
  extractExtendedContextSignals,
  extractPersonMentions,
  updateSentimentTrend,
  computeInfluenceScore,
  matchContextEntry,
  updatedConfidence,
  filterActiveContext,
  classifyInsightReaction,
  detectStructuralGaps,
  determineDisclosureLevel,
  formatDisclosureInstruction,
  isContextRelevant,
  deriveTrustLevel,
  extractUserNarratives,
  deriveRecurringPatternHypotheses,
  detectCrossContextPatterns,
  crossContextToHypotheses,
  updateHypothesisStatus,
  formatHypothesisForPrompt,
  selectHypothesesForPrompt,
  deriveContradictionHypotheses,
  detectHypothesisContradictions,
  deriveGrowthSignalHypotheses,
  computeUserBaseline,
  detectBaselineDeviations,
  selectDeepeningProbe,
  formatDeepeningProbeForPrompt,
  evaluateMIGate,
  convertBaselineDeviationsToSignals,
  lintMIAssertions,
  type NarrativeEntry,
  type BaselineDeviation,
  type MIGateDecision,
  checkCreepinessLine,
  suggestTrustThresholdAdjustment,
  computeMIAccuracy,
  computeJudgmentAccuracy,
  selectIntent,
  formatIntentForRouteCPrompt,
  runTrapScan,
  computeWoundActivation,
  detectPotentialWounds,
  computeFinancialPressure,
  applyContextModifiers,
  type UserState,
  type StateForceAdjustment,
  type MicroSignal,
  type MicroInsightCandidate,
  type LifeContextEntry,
  type PersonMapEntry,
  type AlterHypothesis,
  type SelectedIntent,
  type TrapScanResult,
  type TrapScanInput,
  type WoundActivationResult,
  type WoundActivationInput,
  type WoundDefinition,
  type FinancialPressure,
  type AxisContextModifier,
  type ContextualizedAxisScores,
  type ContextDomain,
} from "@/lib/stargazer/alterUnderstanding";
import { runAI } from "@/lib/ai";
import {
  UTTERANCE_READING_SYSTEM_PROMPT,
  UTTERANCE_READING_SCHEMA,
  buildUtteranceReadingPrompt,
  validateUtteranceReading,
  applyEmotionalTemperatureCorrection,
  mergeRelationalContext,
  buildReadingPromptBlock,
  buildShadowLogPayload,
  buildDisagreementLog,
  type UtteranceReading,
} from "@/lib/stargazer/alterUtteranceReading";
import { makeStargazerRunMetadata } from "@/lib/stargazer/studentTrack";
import {
  loadAlterSessionSummaries,
  detectCrossSessionContradiction,
  summarizeAlterSession,
  saveAlterSessionSummary,
  buildMemoryContext,
} from "@/lib/stargazer/alterMemory";
import {
  fetchPatternsForUser,
  selectAhaInsights,
} from "@/lib/stargazer/ahaEngine";
import {
  loadAlterGrowthState,
  updateAlterGrowth,
  detectReadiness,
  generateAlterSelfReport,
} from "@/lib/stargazer/alterGrowth";
import {
  shouldGenerateLetter,
  generateAlterLetter,
  saveAlterLetter,
  getLastLetterSessionCount,
} from "@/lib/stargazer/alterLetters";

export const runtime = "nodejs";

const MAX_MESSAGE_LENGTH = 2000;
const MAX_RESPONSE_LENGTH = 4000;
const VALID_MODES: AlterMode[] = ["warm", "provocative", "analytical", "parts"];
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INCOMPLETE_ENDING_RE =
  /(には|とは|から|まで|だけ|でも|けど|ので|のに|ている|している|という|とか|より|なら|へ|を|に|が|は|で|と)$/;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

function looksIncompleteAlterResponse(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  // 文末が句読点・括弧・疑問符で終わっていれば完了とみなす
  if (/[。！？?…」』】]$/.test(trimmed)) return false;
  // 非常に短くても句読点で終わっていなければ未完了（ただし閾値を緩和）
  if (trimmed.length <= 15) return true;
  return INCOMPLETE_ENDING_RE.test(trimmed);
}

function looksBrokenStoredAlterMessage(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  const openingQuotes = (trimmed.match(/[「『（【]/g) ?? []).length;
  const closingQuotes = (trimmed.match(/[」』）】]/g) ?? []).length;
  if (openingQuotes > closingQuotes) return true;
  return looksIncompleteAlterResponse(trimmed);
}

function finalizeAlterResponse(value: string, fallback: string): string {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  if (looksIncompleteAlterResponse(trimmed)) return fallback;
  if (/[。！？?…」』】]$/.test(trimmed)) return trimmed;
  return `${trimmed} ...どう思う？`;
}

/**
 * GET /api/stargazer/alter
 * ユーザーの Alter パーソナリティと直近の対話セッションを取得。
 */
export async function GET() {
  try {
    const tierCheck = await checkStargazerTier("alter");
    if (tierCheck instanceof NextResponse) return tierCheck;
    const { userId, isBetaTester } = tierCheck;

    const supabase = await supabaseServer();

    const [
      { data: profile },
      { data: dialogues },
      { data: resolvedTypeRow },
    ] = await Promise.all([
      supabase
        .from("stargazer_profiles")
        .select("dimensions, total_sessions")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("stargazer_alter_dialogues")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("stargazer_resolved_types")
        .select("axis_scores")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

    // 軸スコアを構築（ベータテスターはデータ不足でも通過）
    const { axisScores, hasEvidence } = buildAxisScores(
      profile?.dimensions ?? null,
      resolvedTypeRow?.axis_scores ?? null,
      isBetaTester,
    );

    // Alter パーソナリティを解決（データ不足でもフォールバックで会話可能にする）
    const archetype = resolveArchetype(axisScores);
    const observationDepth = calcObservationDepth(
      Number(profile?.total_sessions) || 0,
    );

    const alterInput: AlterInput = {
      archetypeCode: archetype.code,
      shadowCode: getArchetypeByCode(archetype.code)?.shadowCode ?? archetype.code,
      axisScores,
      observationDepth,
    };
    const personality = buildAlterPersonality(alterInput);

    // セッション別にグルーピング
    type DialogueRow = NonNullable<typeof dialogues>[number];
    const sessions: Record<
      string,
      { sessionId: string; messages: DialogueRow[]; latestAt: string }
    > = {};
    for (const d of dialogues ?? []) {
      const sid = d.session_id ?? "default";
      if (!sessions[sid]) {
        sessions[sid] = { sessionId: sid, messages: [], latestAt: d.created_at };
      }
      const sess = sessions[sid];
      if (sess) {
        sess.messages.push(d);
        if (d.created_at > sess.latestAt) {
          sess.latestAt = d.created_at;
        }
      }
    }

    const recentSessions = Object.values(sessions)
      .sort((a, b) => b.latestAt.localeCompare(a.latestAt))
      .slice(0, 10);

    // Growth state の取得（セルフレポートの表示判定用）
    let growthInfo: {
      sessionsCompleted: number;
      trustLevel: number;
      coreWoundConfidence: number;
    } | null = null;
    try {
      const growth = await loadAlterGrowthState(userId);
      if (growth.sessionsCompleted > 0) {
        growthInfo = {
          sessionsCompleted: growth.sessionsCompleted,
          trustLevel: growth.trustLevel,
          coreWoundConfidence: growth.coreWoundConfidence,
        };
      }
    } catch {
      // Non-fatal: growth state not yet created
    }

    return NextResponse.json({
      ok: true,
      personality,
      recentSessions,
      growthInfo,
    });
  } catch (error) {
    console.error("Failed to get alter data:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * POST /api/stargazer/alter
 * Alter にメッセージを送信し、レスポンスを受け取る。
 * Body: { sessionId?: string, message: string, mode?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const tierCheck = await checkStargazerTier("alter");
    if (tierCheck instanceof NextResponse) return tierCheck;
    const { userId, isBetaTester } = tierCheck;

    const supabase = await supabaseServer();

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const {
      sessionId: rawSessionId,
      message: rawMessage,
      mode: requestedMode,
      action,
      source,
      homeContext: rawHomeContext,
      handoffContext,
    } = body as {
      sessionId?: string;
      message: unknown;
      mode?: string;
      action?: string;
      source?: string;
      homeContext?: HomeAlterContextData;
      handoffContext?: {
        whisper?: string;
        signal?: {
          extremeAxis?: { axis: string; label: string; score: number } | null;
          repeatingPattern?: { axis: string; label: string; dayCount: number } | null;
        };
        axisScores?: Record<string, number>;
      };
    };

    const isHomeAlter = source === "home";

    // Intent Pool: 選択された意図の追跡用（スコープを広げて analytics セクションからも参照可能にする）
    let selectedClarifyIntent: SelectedIntent | null = null;
    let selectedRouteCIntent: SelectedIntent | null = null;
    // Wound Activation: 傷の活性化状態（MI抑制・Route C回避・protect_pressure加算に使用）
    let woundActivationResult: WoundActivationResult | null = null;
    // Financial Pressure: 経済的プレッシャー（cost_load加算・高コスト提案抑制に使用）
    let financialPressure: FinancialPressure | null = null;
    // Context Modifiers: ドメイン別軸スコア調整結果
    let contextualizedScores: ContextualizedAxisScores | null = null;

    // ━━━━ end_session action: summarize and save ━━━━
    if (action === "end_session") {
      const sessionId = isUuid(rawSessionId) ? rawSessionId : null;
      if (!sessionId) {
        return NextResponse.json(
          { error: "有効な sessionId が必要です" },
          { status: 400 },
        );
      }

      const supabase = await supabaseServer();
      const { data: dialogues } = await supabase
        .from("stargazer_alter_dialogues")
        .select("role, message, alter_mode, created_at")
        .eq("user_id", userId)
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true });

      if (!dialogues || dialogues.length < 4) {
        return NextResponse.json({
          ok: true,
          summarized: false,
          reason: "対話が短すぎるため要約をスキップしました",
        });
      }

      const messages = dialogues.map((d) => ({
        role: d.role as string,
        content: d.message as string,
        mode: d.alter_mode as string | undefined,
      }));

      const summary = await summarizeAlterSession(messages, userId);
      if (!summary) {
        return NextResponse.json({
          ok: true,
          summarized: false,
          reason: "要約の生成に失敗しました",
        });
      }

      summary.sessionId = sessionId;
      const saved = await saveAlterSessionSummary(userId, summary);

      // Growth state の更新
      let selfReport: string | null = null;
      let letterGenerated = false;
      try {
        const updatedGrowth = await updateAlterGrowth(
          userId,
          summary,
          messages,
        );
        // 5セッションごとのセルフレポート生成
        selfReport = await generateAlterSelfReport(updatedGrowth, userId);

        // ━━━━ Alterからの手紙: 5セッションごとに自動生成 ━━━━
        const sessionsCompleted = updatedGrowth.sessionsCompleted ?? 0;
        const lastLetterSession = await getLastLetterSessionCount(userId);
        if (await shouldGenerateLetter(sessionsCompleted, lastLetterSession)) {
          try {
            // 最近の観測データを取得
            const supabaseForObs = await supabaseServer();
            const { data: recentObs } = await supabaseForObs
              .from("stargazer_observations")
              .select("axis_key, answer_text, created_at")
              .eq("user_id", userId)
              .order("created_at", { ascending: false })
              .limit(10);
            const observations = (recentObs ?? []).map((o) =>
              `${o.axis_key}: ${o.answer_text}`
            );
            const letter = await generateAlterLetter({
              userId,
              sessionCount: sessionsCompleted,
              alterGrowthState: updatedGrowth,
              recentObservations: observations,
              previousLetters: [],
            });
            if (letter) {
              await saveAlterLetter(letter);
              letterGenerated = true;
              console.info("[alter] Letter generated for session", sessionsCompleted);
            }
          } catch (letterErr) {
            console.warn("[alter] Letter generation failed (non-fatal):", letterErr);
          }
        }
      } catch (e) {
        console.warn("[alter] Growth update failed (non-fatal):", e);
      }

      return NextResponse.json({
        ok: true,
        summarized: saved,
        summary: saved
          ? {
              keyThemes: summary.keyThemes,
              emotionalArc: summary.emotionalArc,
              messageCount: summary.rawMessageCount,
            }
          : null,
        selfReport,
        letterGenerated,
      });
    }

    // メッセージ検証
    if (!rawMessage || typeof rawMessage !== "string") {
      return NextResponse.json(
        { error: "message は必須です" },
        { status: 400 },
      );
    }

    const message = truncateString(rawMessage.trim(), MAX_MESSAGE_LENGTH);
    if (message.length === 0) {
      return NextResponse.json(
        { error: "message が空です" },
        { status: 400 },
      );
    }

    // ━━━━ Daily rally limit (5 per day, JST reset) ━━━━
    // β テスターは制限なし。clarify は非消費（Alter 側の都合で聞いているため）。
    if (isHomeAlter && !isBetaTester) {
      const jstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
      const todayJST = jstNow.toISOString().slice(0, 10); // "YYYY-MM-DD"
      // JST 0:00 = UTC 15:00 previous day
      const jstDayStartUTC = new Date(`${todayJST}T00:00:00+09:00`).toISOString();

      // clarify を除外してカウント: emotional_context->response_mode が "clarify" でないものだけ数える
      const { data: todayDialogues, error: countErr } = await supabase
        .from("stargazer_alter_dialogues")
        .select("id, emotional_context")
        .eq("user_id", userId)
        .eq("role", "alter")
        .gte("created_at", jstDayStartUTC);

      if (!countErr && todayDialogues) {
        const consumedCount = todayDialogues.filter((d) => {
          const ctx = d.emotional_context as any;
          return ctx?.response_mode !== "clarify";
        }).length;

        if (consumedCount >= 5) {
          return NextResponse.json(
            { error: "daily_limit_reached", remaining: 0, limit: 5 },
            { status: 429 },
          );
        }
      }
    }

    // sessionId: UUID format required by DB column
    const sessionId = isUuid(rawSessionId)
      ? rawSessionId
      : crypto.randomUUID();

    // ユーザーデータを取得
    const [
      { data: profile },
      { data: resolvedTypeRow },
      { data: existingDialogues },
    ] = await Promise.all([
      supabase
        .from("stargazer_profiles")
        .select("dimensions, total_sessions")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("stargazer_resolved_types")
        .select("axis_scores")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("stargazer_alter_dialogues")
        .select("role, alter_mode, message, created_at")
        .eq("user_id", userId)
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true }),
    ]);

    // 軸スコアを構築（ベータテスターはデータ不足でも通過）
    const { axisScores, hasEvidence } = buildAxisScores(
      profile?.dimensions ?? null,
      resolvedTypeRow?.axis_scores ?? null,
      isBetaTester,
    );

    if (!hasEvidence) {
      return NextResponse.json(
        { error: "観測データが不足しています" },
        { status: 400 },
      );
    }

    const archetype = resolveArchetype(axisScores);
    const observationDepth = calcObservationDepth(
      Number(profile?.total_sessions) || 0,
    );

    const alterInput: AlterInput = {
      archetypeCode: archetype.code,
      shadowCode: getArchetypeByCode(archetype.code)?.shadowCode ?? archetype.code,
      axisScores,
      observationDepth,
    };
    let personality = buildAlterPersonality(alterInput);

    // 会話履歴を構築
    const conversationHistory: AlterMessage[] = (existingDialogues ?? [])
      .map((d) => ({
        role: d.role as "alter" | "user",
        content: d.message as string,
        mode: (d.alter_mode as AlterMode) ?? "warm",
        timestamp: d.created_at,
      }))
      .filter((message) => message.content.trim().length > 0)
      .filter(
        (message) =>
          message.role !== "alter" ||
          !looksBrokenStoredAlterMessage(message.content),
      );

    const conversationDepth = conversationHistory.length;

    // --- Long-term memory + behavioral evidence + growth state integration ---
    let pastSummaries: Awaited<ReturnType<typeof loadAlterSessionSummaries>> = [];
    let contradictionHint: string | null = null;
    let behavioralEvidence: AlterBehavioralEvidence[] = [];
    let longTermMemory: Awaited<ReturnType<typeof buildMemoryContext>> | undefined;
    let growthState: Awaited<ReturnType<typeof loadAlterGrowthState>> | undefined;
    try {
      const [summaries, patterns, memory, growth] = await Promise.all([
        loadAlterSessionSummaries(userId, 10),
        fetchPatternsForUser(supabase, userId).catch(() => []),
        buildMemoryContext(userId, 20).catch(() => undefined),
        loadAlterGrowthState(userId).catch(() => undefined),
      ]);
      pastSummaries = summaries;
      longTermMemory = memory;
      growthState = growth;
      if (pastSummaries.length > 0) {
        contradictionHint = await detectCrossSessionContradiction(
          message,
          pastSummaries,
        );
      }
      if (patterns.length > 0) {
        const ahaInsights = await selectAhaInsights(patterns, "alter", 5);
        behavioralEvidence = ahaInsights.map((i) => ({
          formattedForTarget: i.formattedForTarget,
          patternType: i.patternType,
          confidence: i.confidence,
          axisId: i.axisId,
        }));
      }
    } catch (e) {
      console.warn("[alter] Memory/pattern/growth context load failed (non-fatal):", e);
    }

    // モードを決定 -- readiness ベースの適応型モード選択
    let mode: AlterMode;
    if (requestedMode && VALID_MODES.includes(requestedMode as AlterMode)) {
      mode = requestedMode as AlterMode;
    } else if (growthState && conversationDepth >= 2) {
      // readiness ベースのモード選択
      const readiness = await detectReadiness(
        message,
        conversationHistory.map((m) => ({ role: m.role, content: m.content })),
        growthState,
      );
      const emotionalIntensity = readiness; // readiness はおおよそ感情的関与度と相関
      const trustLevel = growthState.trustLevel;
      const currentMode = conversationHistory.length > 0
        ? (conversationHistory[conversationHistory.length - 1]!.mode ?? "warm")
        : "warm";
      const optimal = calculateOptimalMode(
        currentMode,
        conversationDepth,
        emotionalIntensity,
        trustLevel,
        !!contradictionHint,
      );
      mode = optimal.mode;
    } else {
      mode = selectAlterMode(observationDepth, conversationDepth);
    }

    // Alter のレスポンスを AI で生成（失敗時はテンプレートにフォールバック）
    let alterResponseText = "";
    let homeDecisionMeta: DecisionMetadata | null = null;
    let queryContext: QueryContext | null = null;
    let relationalLens: RelationalLens | null = null;
    let responseMode: ResponseMode = "conclude";
    let modeDecisionReason: ModeDecisionReason = "conclude_low_ambiguity";
    let detectedReaction: Reaction | null = null; // P1-C: リアクション分類結果（analytics用）
    let questionType: QuestionType = "judgment"; // P1-A: 5タイプルーター結果（analytics用にホイスト）
    let questionCategory: QuestionCategory | null = null;
    let followupInsight = "";
    // Understanding System (Layer 2: State)
    let userState: UserState | null = null;
    let stateAdjustment: StateForceAdjustment | null = null;
    // Micro Insight Engine
    let microInsight: MicroInsightCandidate | null = null;
    // 5層品質防御
    let lensDetailed: RelationalLensDetailed | null = null;
    let inputUnderstanding: InputUnderstanding | null = null;
    let judgmentSkeleton: JudgmentSkeleton | null = null;
    let qualityCheck: ConsistencyCheck | null = null;
    let auditTrail: AuditTrail | null = null;
    // Phase 5: 継続的検証
    let hypothesesInjectedCount = 0;
    let creepinessCheck: ReturnType<typeof checkCreepinessLine> | null = null;
    // D: MI 頻度制限
    let lastInsightPresentedAt: Date | null = null;
    let recentDenyIgnoreStreak = 0;
    let insightSuppressedReason = "";
    let insightPresented = false;
    // P5: ベースラインズレ由来の追加シグナル
    let baselineSignals: MicroSignal[] = [];
    // P0/P3/P5: ホイスト変数（Home Alter 内の複数ブロックで共有）
    let alterSessionCount = 0;
    let baselineDeviationsFull: BaselineDeviation[] = [];
    // P0観測配線: judgment engine 内の変数を外部スコープに引き上げ
    let p0ContextEntriesLoaded = 0;
    let p0ValidationFailures: string[] = [];
    let p0DiscreteTrustLevel = 0;
    // Gemini一次読解（Phase 0）: null = 読解未実施 or 失敗（graceful degradation）
    let utteranceReading: UtteranceReading | null = null;
    let utteranceReadingLatencyMs = 0;

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // HOME ALTER: 完全に別フロー（挨拶なし、判断特化、検査+再生成）
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (isHomeAlter) {
      // ━━━━ ユーザー表示名を取得（Embedded Alter の呼称に使用） ━━━━
      let userName: string | undefined;
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        const meta = authUser?.user_metadata;
        const raw = String(meta?.display_name ?? meta?.name ?? "").trim();
        if (raw && raw !== "User") userName = raw;
      } catch {
        // Non-fatal: 名前取得に失敗しても処理は続行
      }

      // 質問カテゴリ分類（行動カテゴリ: gathering/outfit/contact/work/cause/general）
      questionCategory = classifyQuestion(message);
      // P1-A: 5タイプルーター（意図の種類: emotional/self_understanding/knowledge/strategy/judgment）
      questionType = classifyQuestionType(message);

      // ── Ambiguity Engine: ドメイン検出 + 曖昧性解析 + 応答モード選択 ──
      queryContext = analyzeQueryContext(message);

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // DAILY GUIDANCE: 判断エンジンとは完全に独立したパイプライン
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      if (queryContext.domain === "daily_guidance") {
        // userName は外側の isHomeAlter ブロックで取得済み

        // Frame抽出: ユーザー入力 + personality から状態を構造化
        const dgFrame = extractDailyGuidanceFrame(message, personality, rawHomeContext);
        const dgClarify = checkDailyGuidanceClarify(dgFrame);

        if (dgClarify.needs_clarify) {
          // Daily Guidance clarify: time/energy のみ聞く
          const namePrefix = userName ? `${userName}さん、` : "";
          alterResponseText = `${namePrefix}${dgClarify.question}`;
          responseMode = "clarify";
          modeDecisionReason = "clarify_high_ambiguity_high_stake";

          console.info(`[daily-guidance] clarify → ${dgClarify.target_variable}`);

          // analytics 永続化
          try {
            await supabase.from("stargazer_analytics").insert({
              user_id: userId,
              event: "home_alter_clarify",
              feature: "daily_guidance",
              metadata: {
                clarify_target: dgClarify.target_variable,
                frame_snapshot: {
                  time_budget: dgFrame.time_budget,
                  energy_level: dgFrame.energy_level,
                },
              },
            });
          } catch { /* Non-fatal */ }

        } else {
          // Skeleton構築 → Prompt → LLM → Validation
          const dgSkeleton = buildDailyGuidanceSkeleton(dgFrame, personality);
          const dgPromptBlock = buildDailyGuidancePromptBlock(dgSkeleton);

          // Daily Guidance 専用システムプロンプト
          const nameLabel = userName ? `（相手の名前: ${userName}）` : "";
          const dgSystemPrompt = [
            ALTER_IDENTITY_BLOCK,
            "",
            `今日一日をどう過ごすか、具体的にガイドしてください。${nameLabel}`,
            "",
            "# ルール",
            "- 1行目は「今日は〇〇する日」のように明快に始める",
            "- 「最初の一歩」は具体的な行動1つ。必ず動詞+対象+所要時間を含める（例: 「15分で〜する」「30分かけて〜する」）",
            "- 所要時間のない「最初の一歩」は不合格。必ず「〜分」「〜時間」を明記する",
            "- 「休む」だけでは不可。「何をして休むか」を具体的に指示する",
            "- 一般論・精神論は禁止。具体的なアクションだけ",
            "- 全体で200-350文字以内",
            "- 応答は必ず最後まで完結させる。途中で切れた文は不合格",
            "- メタデータブロック不要",
            "",
            dgPromptBlock,
          ].join("\n");

          let dgResponse = "";
          try {
            const aiResult = await runAI({
              taskType: "stargazer_alter_response",
              prompt: `質問: ${message}`,
              systemPrompt: dgSystemPrompt,
              requireJson: false,
              temperature: 0.5,
              maxOutputTokens: 1536,
              userId: userId,
              metadata: makeStargazerRunMetadata({
                feature: "daily_guidance",
                mode: "warm",
                turnNumber: conversationHistory.length,
                skipCache: true,
              }),
            });
            if (aiResult.success && aiResult.text?.trim()) {
              dgResponse = formatHomeAlterResponse(aiResult.text.trim(), userName);
            }
          } catch (e) {
            console.warn("[daily-guidance] LLM generation failed:", e);
          }

          // 専用 Validation
          if (dgResponse) {
            const dgValidation = validateDailyGuidanceResponse(dgResponse, dgSkeleton);
            if (!dgValidation.pass) {
              console.warn("[daily-guidance] Validation failed:", dgValidation.failures);
              // リトライ: 骨格を再度強調して再生成
              try {
                const retryPrompt = [
                  `質問: ${message}`,
                  "",
                  "## 前回の応答の問題点:",
                  ...dgValidation.failures.map((f) => `- ${f}`),
                  "",
                  "上記の問題を修正して、もう一度応答を生成してください。",
                ].join("\n");
                const retryResult = await runAI({
                  taskType: "stargazer_alter_response",
                  prompt: retryPrompt,
                  systemPrompt: dgSystemPrompt,
                  requireJson: false,
                  temperature: 0.4,
                  maxOutputTokens: 1024,
                  userId: userId,
                  metadata: makeStargazerRunMetadata({
                    feature: "daily_guidance",
                    mode: "warm",
                    attempt: 1,
                    skipCache: true,
                  }),
                });
                if (retryResult.success && retryResult.text?.trim()) {
                  const retryFormatted = formatHomeAlterResponse(retryResult.text.trim(), userName);
                  const retryValidation = validateDailyGuidanceResponse(retryFormatted, dgSkeleton);
                  if (retryValidation.pass) {
                    dgResponse = retryFormatted;
                  } else {
                    console.warn("[daily-guidance] Retry also failed:", retryValidation.failures);
                    dgResponse = retryFormatted || dgResponse;
                  }
                }
              } catch (retryError) {
                console.warn("[daily-guidance] Retry failed:", retryError);
              }
            }
          }

          // フォールバック
          if (!dgResponse) {
            const namePrefix = userName ? `${userName}さん、` : "";
            dgResponse = `${namePrefix}${dgSkeleton.primary_axis}。\n最初の一歩: ${dgSkeleton.recommended_first_step}`;
          }

          alterResponseText = dgResponse;
          responseMode = "conclude";
          modeDecisionReason = "conclude_low_ambiguity";

          console.info(`[daily-guidance] mode=${dgSkeleton.daily_mode} first_step="${dgSkeleton.recommended_first_step.slice(0, 30)}..."`);

          // analytics 永続化
          try {
            await supabase.from("stargazer_analytics").insert({
              user_id: userId,
              event: "home_alter_judgment",
              feature: "daily_guidance",
              metadata: {
                daily_mode: dgSkeleton.daily_mode,
                primary_axis: dgSkeleton.primary_axis,
                first_step: dgSkeleton.recommended_first_step,
                frame: {
                  time_budget: dgFrame.time_budget,
                  energy_level: dgFrame.energy_level,
                  desire_direction: dgFrame.desire_direction,
                  social_bandwidth: dgFrame.social_bandwidth,
                },
                grounding_factors: dgSkeleton.grounding_factors,
                query_domain: "daily_guidance",
              },
            });
          } catch { /* Non-fatal */ }
        }

        // Daily Guidance は独立パイプラインなので、ここで分岐を抜ける
        // → 既存の judgment pipeline をスキップ
        // (下の else ブロックで判断エンジンが動く)

      } else {
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // JUDGMENT ENGINE: 既存の対人判断パイプライン
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

      // ── Phase 0: Gemini一次読解（構造化JSON） ──
      // Geminiは「候補を出す役」。意味の確定はAneurasync側で行う。
      // 失敗時は既存パイプラインがそのまま動く（graceful degradation）。
      try {
        const readingStart = Date.now();
        const readingResult = await runAI({
          taskType: "stargazer_alter_utterance_reading",
          prompt: buildUtteranceReadingPrompt(
            message,
            conversationHistory.length > 0
              ? conversationHistory.map((m) => ({ role: m.role, content: m.content }))
              : undefined,
          ),
          systemPrompt: UTTERANCE_READING_SYSTEM_PROMPT,
          requireJson: true,
          jsonSchema: UTTERANCE_READING_SCHEMA,
          temperature: 0.2,
          maxOutputTokens: 1024,
          userId: userId,
          metadata: makeStargazerRunMetadata({
            feature: "alter_utterance_reading",
            mode: "warm",
            turnNumber: conversationHistory.length,
            skipCache: true,
          }),
        });
        utteranceReadingLatencyMs = Date.now() - readingStart;

        if (readingResult.success && readingResult.structured) {
          utteranceReading = validateUtteranceReading(
            readingResult.structured as Record<string, unknown>,
          );
          if (utteranceReading) {
            console.info(
              `[utterance-reading] Phase 0 OK: intent="${utteranceReading.surface_intent.slice(0, 50)}" ` +
              `temp=${utteranceReading.emotional_temperature.toFixed(2)} ` +
              `dir=${utteranceReading.energy_direction} ` +
              `relational=${utteranceReading.relational_context?.target_mentioned ?? false} ` +
              `latency=${utteranceReadingLatencyMs}ms`,
            );
          } else {
            console.warn(`[utterance-reading] Phase 0: validation failed, falling back to existing pipeline (latency=${utteranceReadingLatencyMs}ms)`);
          }
        } else {
          console.warn(`[utterance-reading] Phase 0: AI call failed, falling back to existing pipeline (latency=${utteranceReadingLatencyMs}ms)`);
        }
      } catch (e) {
        console.warn("[utterance-reading] Phase 0: exception, falling back to existing pipeline:", e);
      }

      // ── State Layer (Layer 2): 今この瞬間の心理的状態推定 ──
      userState = estimateUserState(message);

      // Phase 2: State Pattern をベイズ事前確率として統合
      // time_block 別の蓄積パターンがあれば、ルールベース推定と 70:30 で統合
      try {
        const { data: statePattern } = await supabase
          .from("stargazer_alter_patterns")
          .select("pattern_data, observation_count")
          .eq("user_id", userId)
          .eq("pattern_type", "state")
          .eq("pattern_key", "time_capacity")
          .maybeSingle();

        if (statePattern && userState) {
          const hour = new Date().getHours();
          const block = hour < 6 ? "night" : hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
          const blocks = (statePattern.pattern_data as any)?.time_blocks;
          const blockData = blocks?.[block];
          if (blockData && blockData.sample_count >= 3) {
            userState.psychological_capacity =
              userState.psychological_capacity * 0.7 + (blockData.avg_capacity ?? userState.psychological_capacity) * 0.3;
            console.info(`[state-pattern] Bayesian prior applied: block=${block} sample=${blockData.sample_count} capacity_adj=${userState.psychological_capacity.toFixed(2)}`);
          }
        }
      } catch {
        // パターン未蓄積時は静かにスキップ
      }

      // ── Phase A: Gemini読解による State 補正 ──
      // emotional_temperature でルールベース推定を補正（70:30 加重平均）
      if (utteranceReading && userState) {
        const prevLoad = userState.emotional_load;
        userState.emotional_load = applyEmotionalTemperatureCorrection(
          userState.emotional_load,
          utteranceReading.emotional_temperature,
        );
        if (Math.abs(prevLoad - userState.emotional_load) > 0.05) {
          console.info(
            `[phase-a] emotional_load corrected: ${prevLoad.toFixed(2)} → ${userState.emotional_load.toFixed(2)} ` +
            `(gemini_temp=${utteranceReading.emotional_temperature.toFixed(2)})`,
          );
        }
      }

      stateAdjustment = computeStateAdjustment(userState);

      relationalLens = extractRelationalLens(message);
      const ruleBasedTargetRole = relationalLens?.target_role ?? null;

      // ── Phase A: Gemini読解による relationalLens 補完 ──
      // ルールベースが見逃した対人文脈をGemini読解で補完する
      if (utteranceReading && relationalLens) {
        const merged = mergeRelationalContext(
          relationalLens.target_role ?? null,
          utteranceReading.relational_context,
        );
        if (merged.enriched_by_reading && merged.target_role) {
          (relationalLens as any).target_role = merged.target_role;
          console.info(`[phase-a] relationalLens enriched by reading: target_role="${merged.target_role}"`);
        }
      }

      // ── Phase A: Disagreement Log — Gemini vs 既存ルールの並走評価 ──
      // surface_intent は当面プロンプト注入しない。一致率/不一致率をログで育てる。
      if (utteranceReading) {
        const disagreement = buildDisagreementLog(utteranceReading, {
          classifyQuestion_category: questionCategory,
          analyzeQueryContext_domain: queryContext?.domain ?? null,
          extractRelationalLens_targetRole: ruleBasedTargetRole,
        });
        if (disagreement.disagreements.length > 0) {
          console.info(`[disagreement] ${disagreement.disagreements.join("; ")} (agreement=${(disagreement.agreement_rate * 100).toFixed(0)}%)`);
        }
        // fire-and-forget: 並走評価データを蓄積
        supabase.from("stargazer_analytics").insert({
          user_id: userId,
          event: "utterance_reading_disagreement",
          feature: "alter_utterance_reading",
          metadata: {
            agreement_rate: disagreement.agreement_rate,
            entries: disagreement.entries,
            disagreements: disagreement.disagreements,
            gemini_surface_intent: utteranceReading.surface_intent.slice(0, 100),
            rule_question_category: questionCategory,
            rule_query_domain: queryContext?.domain ?? null,
            rule_relational_target: ruleBasedTargetRole,
            gemini_relational_target: utteranceReading.relational_context?.target_role ?? null,
          },
        }).then(({ error }) => {
          if (error) console.warn("[disagreement] Log save failed:", error.message);
        });
      }

      // ── 会話OS基礎: reaction / direct_request / repair / greeting を最優先で検出 ──
      // これらは ambiguity engine より上位。検出されたらパイプラインの大部分をスキップ。
      const lastAlterMsg = conversationHistory.length > 0
        ? conversationHistory[conversationHistory.length - 1]
        : null;
      const lastAlterContent = (lastAlterMsg?.role === "alter") ? lastAlterMsg.content : null;

      // P1-C: リアクション分類器（detectCorrectionSignal より上位）
      detectedReaction = classifyReaction(message, lastAlterContent);

      if (detectedReaction) {
        // リアクション検出 → タイプ別にモード決定
        switch (detectedReaction.type) {
          case "agree":
            responseMode = "direct_response";
            modeDecisionReason = "reaction_agree";
            console.info(`[home-alter] P1-C reaction: agree (conf=${detectedReaction.confidence}) → direct_response`);
            break;
          case "disagree":
            if (detectedReaction.disagree_strength === "strong") {
              responseMode = "repair";
              modeDecisionReason = "reaction_disagree_strong";
              console.info(`[home-alter] P1-C reaction: disagree:strong (conf=${detectedReaction.confidence}) → repair`);
            } else {
              responseMode = "direct_response";
              modeDecisionReason = "reaction_disagree_weak";
              console.info(`[home-alter] P1-C reaction: disagree:weak (conf=${detectedReaction.confidence}) → direct_response`);
            }
            break;
          case "deepen":
            responseMode = "direct_response";
            modeDecisionReason = "reaction_deepen";
            console.info(`[home-alter] P1-C reaction: deepen (conf=${detectedReaction.confidence}) → direct_response`);
            break;
          case "redirect":
            if (detectedReaction.redirect_subtype === "correction") {
              responseMode = "repair";
              modeDecisionReason = "reaction_redirect_correction";
              console.info(`[home-alter] P1-C reaction: redirect:correction (conf=${detectedReaction.confidence}) → repair`);
            } else {
              // topic_change → 新しい話題なので通常パイプラインへフォールスルー
              // modeDecisionReason だけ記録し、responseMode は下の else ブロックで上書き
              modeDecisionReason = "reaction_redirect_topic_change";
              console.info(`[home-alter] P1-C reaction: redirect:topic_change (conf=${detectedReaction.confidence}) → normal pipeline`);
            }
            break;
        }
      }

      // topic_change 以外のリアクションが検出されなかった場合 → 既存の検出チェーン
      if (!detectedReaction || detectedReaction.redirect_subtype === "topic_change") {
        if (detectCorrectionSignal(message, lastAlterContent)) {
          responseMode = "repair";
          modeDecisionReason = "correction_signal_detected";
          console.info(`[home-alter] Correction signal detected → repair mode`);
        } else if (detectGreeting(message)) {
          responseMode = "direct_response";
          modeDecisionReason = "direct_request_detected";
          console.info(`[home-alter] Greeting detected → direct_response mode (light template)`);
        } else if (detectDirectRequest(message)) {
          responseMode = "direct_response";
          modeDecisionReason = "direct_request_detected";
          console.info(`[home-alter] Direct request detected → direct_response mode`);
        } else {
          // 通常パイプライン: ambiguity engine でモード選択
          const rawModeDecision = selectResponseModeWithReason(queryContext, relationalLens, stateAdjustment);
          // P1-A: knowledge/strategy 型は clarify/branch 不要 → conclude 強制
          const modeDecision = applyQuestionTypeOverride(rawModeDecision, questionType);
          responseMode = modeDecision.mode;
          modeDecisionReason = modeDecision.reason;
          if (rawModeDecision.mode !== modeDecision.mode) {
            console.info(`[home-alter] P1-A type override: ${rawModeDecision.mode}→${modeDecision.mode} (questionType=${questionType})`);
          }
        }
      }

      // ── State → Mode 降格: fatigue/load が高い時は branch → conclude ──
      // branch は複数選択肢を提示するが、疲労時はシンプルな結論の方が助かる
      if (responseMode === "branch" && userState) {
        if (userState.cognitive_fatigue > 0.6 || userState.emotional_load > 0.7) {
          responseMode = "conclude";
          modeDecisionReason = "conclude_mid_ambiguity_info_sufficient";
          console.info(`[home-alter] State-driven mode downgrade: branch → conclude (fatigue=${userState.cognitive_fatigue.toFixed(2)}, load=${userState.emotional_load.toFixed(2)})`);
        }
      }

      // ── Phase 2: Reaction Learning — 前回 Micro Insight への反応を記録 ──
      try {
        const { data: lastInsight } = await supabase
          .from("stargazer_analytics")
          .select("id, metadata, created_at")
          .eq("user_id", userId)
          .eq("event", "home_alter_insight_presented")
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        if (lastInsight) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const meta = lastInsight.metadata as any;
          const insightPrompt = meta?.suggested_prompt ?? "";
          const insightType = meta?.presentation_type ?? "casual_check";
          const signalTypes = meta?.signal_types ?? [];

          const reaction = classifyInsightReaction(message, insightPrompt);
          console.info(`[reaction-learning] Reaction to insight "${insightPrompt.slice(0, 30)}...": ${reaction}`);

          // stargazer_alter_reactions に記録（fire-and-forget）
          supabase.from("stargazer_alter_reactions").insert({
            user_id: userId,
            insight_type: insightType,
            signal_types: signalTypes,
            reaction,
            response_summary: message.slice(0, 200),
            analytics_event_id: lastInsight.id,
          }).then(({ error }) => {
            if (error) console.warn("[reaction-learning] Save failed (non-fatal):", error.message);
          });

          // 前回のインサイト提示マーカーを削除（1回だけ反応を記録するため）
          supabase.from("stargazer_analytics")
            .delete()
            .eq("id", lastInsight.id)
            .then(({ error }) => {
              if (error) console.warn("[reaction-learning] Marker cleanup failed:", error.message);
            });

          // Response Pattern 集約: insight_type 別の reaction 分布を蓄積
          supabase.from("stargazer_alter_patterns")
            .select("pattern_data, observation_count, confidence")
            .eq("user_id", userId)
            .eq("pattern_type", "response")
            .eq("pattern_key", "insight_receptivity")
            .maybeSingle()
            .then(async ({ data: existing }) => {
              try {
                const dist = (existing?.pattern_data as any)?.reaction_distribution ?? {};
                if (!dist[insightType]) {
                  dist[insightType] = { accepted: 0, denied: 0, ignored: 0, explored: 0 };
                }
                dist[insightType][reaction] = (dist[insightType][reaction] ?? 0) + 1;
                const newCount = (existing?.observation_count ?? 0) + 1;
                const newConfidence = Math.min(1, 0.2 + newCount * 0.05);

                if (existing) {
                  await supabase.from("stargazer_alter_patterns").update({
                    pattern_data: { reaction_distribution: dist },
                    observation_count: newCount,
                    confidence: newConfidence,
                    last_observed: new Date().toISOString(),
                  }).eq("user_id", userId).eq("pattern_type", "response").eq("pattern_key", "insight_receptivity");
                } else {
                  await supabase.from("stargazer_alter_patterns").insert({
                    user_id: userId,
                    pattern_type: "response",
                    pattern_key: "insight_receptivity",
                    pattern_data: { reaction_distribution: dist },
                    observation_count: 1,
                    confidence: 0.25,
                  });
                }
              } catch (e) {
                console.warn("[response-pattern] Aggregation failed (non-fatal):", e);
              }
            });
        }
      } catch {
        // テーブル未作成時等は静かにスキップ
      }

      // ── D: MI 頻度制限データ取得 ──
      try {
        // 直近の MI 提示時刻を取得（まだマーカーが残っていれば提示直後）
        const { data: recentInsights } = await supabase
          .from("stargazer_analytics")
          .select("created_at")
          .eq("user_id", userId)
          .eq("event", "home_alter_insight_presented")
          .order("created_at", { ascending: false })
          .limit(1);

        if (recentInsights && recentInsights.length > 0) {
          lastInsightPresentedAt = new Date(recentInsights[0].created_at);
        } else {
          // マーカーが消えていても、reactions テーブルから最後の提示時刻を推定
          const { data: lastReaction } = await supabase
            .from("stargazer_alter_reactions")
            .select("created_at")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(1);
          if (lastReaction && lastReaction.length > 0) {
            lastInsightPresentedAt = new Date(lastReaction[0].created_at);
          }
        }

        // 直近の deny/ignored 連続数を取得
        const { data: recentReactionRows } = await supabase
          .from("stargazer_alter_reactions")
          .select("reaction")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(5);
        if (recentReactionRows) {
          recentDenyIgnoreStreak = 0;
          for (const r of recentReactionRows) {
            if (r.reaction === "denied" || r.reaction === "ignored") {
              recentDenyIgnoreStreak++;
            } else {
              break; // 連続が途切れたら停止
            }
          }
        }
      } catch {
        // テーブル未作成時等は静かにスキップ
      }

      // ── Life Context v2: 既存コンテキスト取得 ──
      let activeLifeContext: LifeContextEntry[] = [];
      try {
        const { data: contextRows } = await supabase
          .from("stargazer_alter_context")
          .select("id, category, content, source, temporality, confidence, evidence_count, last_confirmed, possibly_stale")
          .eq("user_id", userId)
          .eq("possibly_stale", false)
          .gte("confidence", 0.4)
          .order("confidence", { ascending: false })
          .limit(10);

        if (contextRows && contextRows.length > 0) {
          activeLifeContext = filterActiveContext(contextRows as LifeContextEntry[]);
          p0ContextEntriesLoaded = activeLifeContext.length;
          console.info(`[life-context] ${activeLifeContext.length} active context entries loaded`);
        }

        // 鮮度チェック: 30日以上未確認のエントリにフラグを立てる（fire-and-forget）
        const staleCutoff = new Date();
        staleCutoff.setDate(staleCutoff.getDate() - 30);
        supabase.from("stargazer_alter_context")
          .update({ possibly_stale: true })
          .eq("user_id", userId)
          .eq("possibly_stale", false)
          .lt("last_confirmed", staleCutoff.toISOString())
          .then(({ error }) => {
            if (error) console.warn("[life-context] Staleness update failed (non-fatal):", error.message);
          });
      } catch {
        // テーブル未作成時等は静かにスキップ
      }

      // ── Trust Level（離散値）: 全フェーズで共有 ──
      const discreteTrustLevel = deriveTrustLevel(
        growthState?.trustLevel ?? 0,
        growthState?.sessionsCompleted ?? 0,
      );
      p0DiscreteTrustLevel = discreteTrustLevel;

      // ── 罠スキャン結果の取得（前回の fire-and-forget 結果を参照） ──
      // MI抑制 / Route C抑制 / prompt depth 低減 の判断に使う
      interface TrapScanSummary { should_suppress_mi?: boolean; should_suppress_route_c?: boolean; should_reduce_depth?: boolean }
      let lastTrapScan: TrapScanSummary | null = null;
      try {
        const { data: trapScanRow } = await supabase
          .from("stargazer_analytics")
          .select("metadata")
          .eq("user_id", userId)
          .eq("event", "phase5_trap_scan")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (trapScanRow?.metadata) {
          lastTrapScan = trapScanRow.metadata as TrapScanSummary;
          if (lastTrapScan?.should_suppress_mi || lastTrapScan?.should_suppress_route_c || lastTrapScan?.should_reduce_depth) {
            console.info(`[trap-scan] Previous scan active: suppress_mi=${lastTrapScan.should_suppress_mi}, suppress_route_c=${lastTrapScan.should_suppress_route_c}, reduce_depth=${lastTrapScan.should_reduce_depth}`);
          }
        }
      } catch {
        // 初回時等は静かにスキップ
      }

      // ── Wound Activation Engine: 傷の活性化スコア計算 ──
      // MI 抑制・Route C 回避・ForceBalance protect_pressure 加算に使用
      try {
        // 1. DB から登録済みの傷定義を取得
        let woundDefs: WoundDefinition[] = [];
        const { data: woundRows } = await supabase
          .from("stargazer_analytics")
          .select("metadata")
          .eq("user_id", userId)
          .eq("event", "wound_definition")
          .order("created_at", { ascending: false })
          .limit(10);
        if (woundRows && woundRows.length > 0) {
          woundDefs = woundRows.map(r => {
            const m = r.metadata as any;
            return {
              wound_id: m.wound_id ?? "unknown",
              theme: m.theme ?? "",
              related_persons: m.related_persons ?? [],
              related_keywords: new RegExp(m.related_keywords_pattern ?? "(?!)", "i"),
              depth: m.depth ?? "persistent",
              source: m.source ?? "alter_inferred",
              confidence: m.confidence ?? 0.3,
              last_confirmed: m.last_confirmed ?? new Date().toISOString(),
            } as WoundDefinition;
          });
        }

        // 2. DB に傷が未登録の場合、会話テキストからヒューリスティックに検出
        if (woundDefs.length === 0) {
          const recentTexts = conversationHistory
            .filter(m => m.role === "user")
            .map(m => m.content)
            .slice(-10);
          recentTexts.push(message);
          woundDefs = detectPotentialWounds(recentTexts);
        }

        if (woundDefs.length > 0) {
          // 3. 直近の MI 反応を取得（wound_related フラグ付き）
          const recentMIReactions: WoundActivationInput["recent_mi_reactions"] = [];
          try {
            const { data: miReactionRows } = await supabase
              .from("stargazer_analytics")
              .select("metadata")
              .eq("user_id", userId)
              .eq("event", "home_alter_mi_reaction")
              .order("created_at", { ascending: false })
              .limit(10);
            if (miReactionRows) {
              for (const row of miReactionRows) {
                const m = row.metadata as any;
                recentMIReactions.push({
                  wound_related: m.wound_related ?? false,
                  reaction: m.reaction ?? "ignored",
                });
              }
            }
          } catch {
            // 初回時等は静かにスキップ
          }

          // 4. Wound activation 計算
          const recentUserMessages = conversationHistory
            .filter(m => m.role === "user")
            .map(m => m.content)
            .slice(-10);

          woundActivationResult = computeWoundActivation({
            wounds: woundDefs,
            current_message: message,
            recent_messages: recentUserMessages,
            recent_mi_reactions: recentMIReactions,
            trust_level: discreteTrustLevel,
            user_state: userState,
          });

          if (woundActivationResult.most_active) {
            console.info(`[wound-activation] Most active: "${woundActivationResult.most_active.theme}" (score: ${woundActivationResult.most_active.activation_score.toFixed(2)}, level: ${woundActivationResult.most_active.level})`);
          }
        }
      } catch (e) {
        console.warn("[wound-activation] Error during computation:", e);
        // 傷の活性化計算は失敗しても応答を止めない
      }

      // ── Financial Pressure: 経済的プレッシャーの検出 ──
      // cost_load ブースト・高コスト提案抑制に使用
      try {
        const recentUserMsgs = conversationHistory
          .filter(m => m.role === "user")
          .map(m => m.content)
          .slice(-10);

        // Life Context の経済シグナルを取得
        const lifeContextEconomicSignals = extractLifeContextSignals(message)
          .filter(s => s.category === "environment" && s.content?.includes("経済"));

        // 過去の経済シグナル蓄積数を取得
        let historicalCount = 0;
        try {
          const { count } = await supabase
            .from("stargazer_analytics")
            .select("id", { count: "exact", head: true })
            .eq("user_id", userId)
            .eq("event", "financial_signal_detected");
          historicalCount = count ?? 0;
        } catch {
          // 初回時等は静かにスキップ
        }

        financialPressure = computeFinancialPressure({
          current_message: message,
          recent_user_messages: recentUserMsgs,
          life_context_economic_signals: lifeContextEconomicSignals,
          historical_economic_signal_count: historicalCount,
        });

        if (financialPressure.level !== "none") {
          console.info(`[financial-pressure] Level: ${financialPressure.level} (score: ${financialPressure.score.toFixed(2)}, cost_boost: ${financialPressure.cost_load_boost.toFixed(2)})`);

          // 経済シグナルが検出された場合、analytics に記録（蓄積カウント用）
          if (financialPressure.score >= 0.2) {
            supabase.from("stargazer_analytics").insert({
              user_id: userId,
              event: "financial_signal_detected",
              feature: "home_alter",
              metadata: {
                session_id: sessionId,
                score: Number(financialPressure.score.toFixed(3)),
                level: financialPressure.level,
                signals: financialPressure.signals,
              },
            }).then(({ error }) => {
              if (error) console.warn("[financial-pressure] Analytics save failed:", error.message);
            });
          }
        }
      } catch (e) {
        console.warn("[financial-pressure] Error during computation:", e);
      }

      // ── Micro Insight Engine: シグナル検知 ──
      try {
        // 過去のシグナルを取得（analytics から）
        const { data: prevSignalData } = await supabase
          .from("stargazer_analytics")
          .select("metadata")
          .eq("user_id", userId)
          .eq("event", "home_alter_micro_signal")
          .order("created_at", { ascending: false })
          .limit(20);

        const previousSignals: MicroSignal[] = (prevSignalData ?? [])
          .map(d => d.metadata as MicroSignal)
          .filter(Boolean);

        const newSignals = detectMicroSignals(
          message,
          conversationHistory.map(m => ({ role: m.role, content: m.content })),
          previousSignals,
        );

        // 新シグナルを保存（fire-and-forget: analytics + patterns 両方）
        if (newSignals.length > 0) {
          for (const signal of newSignals) {
            // analytics テーブル（既存: 計測用）
            supabase.from("stargazer_analytics").insert({
              user_id: userId,
              event: "home_alter_micro_signal",
              feature: "micro_insight",
              metadata: signal,
            }).then(({ error }) => {
              if (error) console.warn("[micro-insight] Failed to save signal to analytics:", error.message);
            });

            // patterns テーブル（Phase 2: シグナル蓄積用）
            // pattern_key = シグナルタイプ、pattern_data にシグナル履歴を追記
            supabase.from("stargazer_alter_patterns")
              .upsert({
                user_id: userId,
                pattern_type: "micro_signal",
                pattern_key: signal.type,
                observation_count: 1,
                pattern_data: { latest_signals: [signal] },
                confidence: 0.3,
                last_observed: signal.detected_at,
              }, { onConflict: "user_id,pattern_type,pattern_key" })
              .then(async ({ error }) => {
                if (error) {
                  console.warn("[micro-insight] Failed to save to patterns (non-fatal):", error.message);
                  return;
                }
                try {
                  const { data: existing } = await supabase
                    .from("stargazer_alter_patterns")
                    .select("observation_count, pattern_data")
                    .eq("user_id", userId)
                    .eq("pattern_type", "micro_signal")
                    .eq("pattern_key", signal.type)
                    .single();
                  if (existing) {
                    const existingSignals = (existing.pattern_data as { latest_signals?: MicroSignal[] })?.latest_signals ?? [];
                    const updatedSignals = [...existingSignals, signal].slice(-20);
                    await supabase.from("stargazer_alter_patterns").update({
                      observation_count: (existing.observation_count ?? 0) + 1,
                      pattern_data: { latest_signals: updatedSignals },
                      last_observed: signal.detected_at,
                      confidence: Math.min(0.9, 0.3 + (existing.observation_count ?? 0) * 0.05),
                    })
                    .eq("user_id", userId)
                    .eq("pattern_type", "micro_signal")
                    .eq("pattern_key", signal.type);
                  }
                } catch (innerErr) {
                  console.warn("[micro-insight] Pattern increment failed (non-fatal):", innerErr);
                }
              });
          }
          console.info(`[micro-insight] ${newSignals.length} new signal(s): ${newSignals.map(s => s.type).join(", ")}`);
        }

        // 収束チェック（P5: ベースラインズレ由来シグナルは後から追加再評価）
        const allSignals = [...previousSignals, ...newSignals];
        microInsight = checkSignalConvergence(allSignals, discreteTrustLevel);
        if (microInsight) {
          const cs = microInsight.convergence_score;
          console.info(`[micro-insight] Convergence detected: ${microInsight.presentation_type} (score=${cs?.combined ?? "?"}, sessions=${cs?.session_diversity ?? "?"}) — "${microInsight.suggested_prompt.slice(0, 50)}..."`);
        }
      } catch (e) {
        console.warn("[micro-insight] Signal detection failed (non-fatal):", e);
      }

      // ━━━━ フォローアップ履歴を取得（判断精度の向上に使用） ━━━━
      try {
        const { data: recentFollowups } = await supabase
          .from("stargazer_analytics")
          .select("metadata")
          .eq("user_id", userId)
          .eq("event", "home_alter_followup")
          .order("created_at", { ascending: false })
          .limit(30);

        if (recentFollowups && recentFollowups.length >= 5) {
          // ドメイン別にフィルタ（ドメイン横断の汚染を防ぐ）
          const currentDomain = queryContext?.domain ?? "general";
          const domainFollowups = recentFollowups.filter((f) =>
            (f.metadata?.query_domain ?? "general") === currentDomain
          );
          // ドメイン別が3件未満なら全体を使う（ただし控えめに適用）
          const targetFollowups = domainFollowups.length >= 3 ? domainFollowups : recentFollowups;
          const isDomainSpecific = domainFollowups.length >= 3;

          const executed = targetFollowups.filter((f) => f.metadata?.executed === true);
          const executionRate = executed.length / Math.max(targetFollowups.length, 5);
          const avgSatisfaction = executed.length > 0
            ? executed.reduce((sum, f) => sum + (f.metadata?.satisfaction ?? 3), 0) / executed.length
            : 0;
          const skipReasons = targetFollowups
            .filter((f) => f.metadata?.skip_reason)
            .map((f) => f.metadata.skip_reason as string)
            .slice(0, 3);
          const skipRate = targetFollowups.filter((f) => f.metadata?.skip_reason).length / targetFollowups.length;

          // スキップ率が高い場合を優先（survivorship bias 回避）
          if (skipRate > 0.5) {
            followupInsight = "過去の提案をよく見送っている傾向がある。提案のハードルを下げ、より小さな一歩を提案した方がよい";
          } else if (executionRate < 0.3) {
            followupInsight = "過去の提案の実行率が低い。提案の粒度を細かく、すぐできる行動を提案した方がよい";
          } else if (executionRate > 0.7 && avgSatisfaction >= 4 && isDomainSpecific) {
            followupInsight = "このドメインの提案をよく実行し、満足度も高い。やや挑戦的な提案も受け入れられる傾向がある";
          } else if (avgSatisfaction < 2.5 && executed.length >= 2) {
            followupInsight = "実行後の満足度が低い傾向がある。提案の方向性を見直し、コストや負荷を下げた形で提案した方がよい";
          }
          if (skipReasons.length > 0 && !followupInsight.includes("見送り")) {
            const reasonSummary = skipReasons.join("、");
            followupInsight += followupInsight ? `。見送り理由の傾向: ${reasonSummary}` : `見送り理由の傾向: ${reasonSummary}`;
          }
        }
      } catch {
        // Non-fatal: フォローアップ取得失敗は品質に影響するが処理は続行
      }

      // Clarify ループ防止: 前回の alter 応答が clarify（短い＋質問で終わる）なら
      // ユーザーが回答を返してきた場合は conclude を強制
      // ただし、ユーザーが全く別の質問をしている場合は新規扱い
      // NOTE: lastAlterMsg は上部の会話OS基礎ブロックで取得済み
      const wasPreviousClarify = lastAlterMsg
        && lastAlterMsg.role === "alter"
        && lastAlterMsg.content.length < 200
        && /[？?]/.test(lastAlterMsg.content);
      if (wasPreviousClarify && responseMode === "clarify") {
        // ユーザーの返答が短い（clarifyへの回答らしい）場合は conclude を強制
        // 長い新規質問の場合はそのまま clarify を許可
        const isLikelyAnswer = message.length < 100 && !/[？?]$/.test(message.trim());
        if (isLikelyAnswer) {
          responseMode = "conclude";
          console.info("[home-alter] Clarify loop prevented → forced conclude (answer detected)");
        } else {
          console.info("[home-alter] Previous was clarify but new message looks like a fresh question");
        }
      }

      // ── Layer 1 Context Modifiers: ドメイン別軸スコア調整 ──
      // 蓄積された判断パターンの差異から、このドメインでの実効スコアを調整
      const contextDomains: ContextDomain[] = ["work", "romance", "friend", "family", "self"];
      const contextDomain = contextDomains.includes(queryContext.domain as ContextDomain)
        ? (queryContext.domain as ContextDomain)
        : null;

      if (contextDomain && personality.axisScores) {
        try {
          // 1. DB から蓄積されたモディファイアを取得
          let storedModifiers: AxisContextModifier[] = [];
          const { data: modifierRows } = await supabase
            .from("stargazer_analytics")
            .select("metadata")
            .eq("user_id", userId)
            .eq("event", "axis_context_modifier")
            .order("created_at", { ascending: false })
            .limit(50);
          if (modifierRows) {
            storedModifiers = modifierRows
              .map(r => r.metadata as any)
              .filter(m => m?.axis_id && m?.domain_offsets);
          }

          // 2. ドメイン別と全体の判断分布を取得
          let domainDist: { go_ratio: number; wait_ratio: number; no_ratio: number; total_observations: number } | null = null;
          let globalDist: { go_ratio: number; wait_ratio: number; no_ratio: number; total_observations: number } | null = null;

          const { data: patternData } = await supabase
            .from("stargazer_alter_patterns")
            .select("pattern_key, pattern_data, observation_count")
            .eq("user_id", userId)
            .eq("pattern_type", "decision")
            .in("pattern_key", [`decision_${contextDomain}`, "decision_unknown", "decision_general"])
            .gte("observation_count", 5);

          if (patternData) {
            for (const p of patternData) {
              const pd = p.pattern_data as any;
              const dist = pd?.shape_distribution;
              if (!dist) continue;
              const total = Object.values(dist).reduce((s: number, v: any) => s + (typeof v === "number" ? v : 0), 0);
              if (total < 5) continue;

              const goCount = (dist.full_go ?? 0) + (dist.bounded_go ?? 0) + (dist.trial_then_decide ?? 0);
              const waitCount = (dist.observe_first ?? 0) + (dist.prepare_then_go ?? 0) + (dist.delegate_or_request ?? 0);
              const noCount = (dist.skip ?? 0) + (dist.defer_with_trigger ?? 0);

              const computed = {
                go_ratio: goCount / total,
                wait_ratio: waitCount / total,
                no_ratio: noCount / total,
                total_observations: total,
              };

              if (p.pattern_key === `decision_${contextDomain}`) {
                domainDist = computed;
              } else {
                // general/unknown を全体分布として使う
                if (!globalDist || (p.observation_count ?? 0) > globalDist.total_observations) {
                  globalDist = computed;
                }
              }
            }
          }

          // 3. コンテキストモディファイアを適用
          contextualizedScores = applyContextModifiers({
            base_axis_scores: personality.axisScores,
            domain: contextDomain,
            stored_modifiers: storedModifiers,
            domain_decision_distribution: domainDist,
            global_decision_distribution: globalDist,
          });

          // 4. 修正されたスコアを personality に反映（この先の buildDomainOverlay で使われる）
          if (contextualizedScores.modified_axes.length > 0) {
            personality = {
              ...personality,
              axisScores: { ...personality.axisScores, ...contextualizedScores.scores },
            };
            console.info(`[context-modifier] Applied ${contextualizedScores.modified_axes.length} axis modifier(s) for domain "${contextDomain}": ${contextualizedScores.modified_axes.join(", ")}`);
          }
        } catch (e) {
          console.warn("[context-modifier] Error during computation:", e);
        }
      }

      const domainOverlay = buildDomainOverlay(personality, queryContext.domain);

      // ── Layer 1: 入力理解 + RelationalLens v2 ──
      lensDetailed = enrichRelationalLens(relationalLens, message);
      inputUnderstanding = extractInputUnderstanding(message, queryContext, relationalLens);

      // ── Layer 2: 判断骨格 ──
      const framework = buildJudgmentFramework(personality, rawHomeContext ?? null, message);
      judgmentSkeleton = buildJudgmentSkeleton(
        framework, queryContext, relationalLens, inputUnderstanding, responseMode,
      );

      // ── State Layer → Skeleton 統合 ──
      // State が低いとき、skeleton の action_shape を1段階下げる
      if (stateAdjustment && stateAdjustment.simplify_response && judgmentSkeleton) {
        const SHAPE_DOWNGRADE: Partial<Record<string, string>> = {
          full_go: "bounded_go",
          bounded_go: "trial_then_decide",
          trial_then_decide: "prepare_then_go",
          prepare_then_go: "observe_first",
        };
        const downgraded = SHAPE_DOWNGRADE[judgmentSkeleton.action_shape];
        if (downgraded) {
          console.info(`[home-alter] State-driven shape downgrade: ${judgmentSkeleton.action_shape} → ${downgraded} (capacity=${userState?.psychological_capacity.toFixed(2)})`);
          (judgmentSkeleton as { action_shape: string }).action_shape = downgraded;
        }
      }

      // ── ActionShape Hints: 「試してから」「誰かに頼む」の検出 ──
      const shapeHints = detectActionShapeHints(message);
      if (shapeHints.suggests_trial || shapeHints.suggests_delegation) {
        console.info(`[home-alter] Shape hints: trial=${shapeHints.suggests_trial} delegation=${shapeHints.suggests_delegation}`);
      }

      console.info(`[home-alter] domain=${queryContext.domain}(${queryContext.domain_confidence.toFixed(2)}) ambiguity=${queryContext.ambiguity_score.toFixed(2)} info=${queryContext.information.score.toFixed(2)} mode=${responseMode} reason=${modeDecisionReason} role=${relationalLens?.target_role ?? "?"} purpose=${relationalLens?.interaction_purpose ?? "?"} temp=${relationalLens?.relational_temperature ?? "?"} risk=${relationalLens?.risk_direction ?? "?"} register=${relationalLens?.communication_register ?? "?"} shape=${judgmentSkeleton.action_shape} conf=${judgmentSkeleton.confidence_level} state={cap=${userState?.psychological_capacity.toFixed(2)},load=${userState?.emotional_load.toFixed(2)}} trust=T${discreteTrustLevel} question_type=${questionType} ctx_loaded=${activeLifeContext.length}`);

      // P0: alterSessionCount を homeContext に注入（アーキタイプ重み漸減用）
      // 基準値 = Alter 対話回数（decision pattern の observation_count 合計）
      // ※ Stargazer の total_sessions ではなく、Alter が実際に観測した判断回数を使う
      alterSessionCount = 0;
      try {
        const { data: decisionCounts } = await supabase
          .from("stargazer_alter_patterns")
          .select("observation_count")
          .eq("user_id", userId)
          .eq("pattern_type", "decision");
        if (decisionCounts) {
          alterSessionCount = decisionCounts.reduce((sum, r) => sum + (r.observation_count ?? 0), 0);
        }
      } catch { /* first session — no patterns yet */ }

      // T0 gate: insight/temporalDelta/blindSpot/prophecy は全て過去回答履歴からの推論。
      // T0（sessionsCompleted < 3）ではプロンプトに入れない。天気（当日の状態ラベル）のみ残す。
      const rawCtx = rawHomeContext ?? {};
      const homeContextWithObs = {
        ...rawCtx,
        observationCount: alterSessionCount,
        ...(discreteTrustLevel < 1 ? {
          insight: null,
          temporalDelta: null,
          blindSpot: null,
          prophecy: null,
          prophecyAccuracy: null,
        } : {}),
      } as HomeAlterContextData;

      // P2: stable/strengthening 仮説を facts レイヤーに注入するために事前取得
      let hypothesisFactEntries: HypothesisFactEntry[] | null = null;
      try {
        const { data: stableHypotheses } = await supabase
          .from("stargazer_alter_hypotheses")
          .select("content, hypothesis_type, confidence, status, domains")
          .eq("user_id", userId)
          .in("status", ["stable", "strengthening"])
          .gte("confidence", 0.5)
          .order("confidence", { ascending: false })
          .limit(5);
        if (stableHypotheses && stableHypotheses.length > 0) {
          hypothesisFactEntries = stableHypotheses as HypothesisFactEntry[];
        }
      } catch { /* hypothesis table may not exist yet */ }

      // P3: ベースライン計算 + ズレ検出（LLM不使用、ローカル集約のみ）
      // BaselineDeviation[] を保持し、facts 注入（P3）+ 深掘りプローブ（P4）の両方で使う
      let baselineDeviationEntries: BaselineDeviationEntry[] | null = null;
      baselineDeviationsFull = [];
      try {
        const { data: allPatterns } = await supabase
          .from("stargazer_alter_patterns")
          .select("pattern_type, pattern_key, observation_count, pattern_data, confidence")
          .eq("user_id", userId);

        if (allPatterns && allPatterns.length > 0) {
          const userBaseline = computeUserBaseline(allPatterns);

          if (userBaseline.isReady) {
            const hour = new Date().getHours();
            const currentTimeBlock = hour < 6 ? "night" : hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
            const deviations = detectBaselineDeviations(userBaseline, {
              domain: queryContext?.domain,
              actionShape: undefined, // ActionShape は応答生成後に確定するため、ここでは未知
              emotionalLoad: userState?.emotional_load,
              questionCategory,
              timeBlock: currentTimeBlock,
            });

            if (deviations.length > 0) {
              baselineDeviationsFull = deviations;
              baselineDeviationEntries = deviations.map(d => ({ type: d.type, factText: d.factText, magnitude: d.magnitude }));
              console.info(`[baseline] ${deviations.length} deviation(s) detected: ${deviations.map(d => d.type).join(", ")}`);
            }
          }
        }
      } catch { /* patterns table may be empty */ }

      // P5: ベースラインズレを Micro Signal に変換 → 収束再評価
      try {
        baselineSignals = convertBaselineDeviationsToSignals(baselineDeviationsFull);
        if (baselineSignals.length > 0) {
          console.info(`[micro-insight] P5: ${baselineSignals.length} baseline deviation(s) converted to signals: ${baselineSignals.map(s => s.type).join(", ")}`);
          // microInsight がまだ null の場合のみ再評価（既に収束していればそのまま）
          if (!microInsight) {
            const { data: prevSignalDataForReeval } = await supabase
              .from("stargazer_analytics")
              .select("metadata")
              .eq("user_id", userId)
              .eq("event", "home_alter_micro_signal")
              .order("created_at", { ascending: false })
              .limit(30);
            const prevSignalsForReeval: MicroSignal[] = (prevSignalDataForReeval ?? [])
              .map(d => d.metadata as MicroSignal)
              .filter(Boolean);
            const allSignalsWithBaseline = [...prevSignalsForReeval, ...baselineSignals];
            microInsight = checkSignalConvergence(allSignalsWithBaseline, discreteTrustLevel);
            if (microInsight) {
              console.info(`[micro-insight] P5: Convergence detected after baseline signal injection`);
            }
          }
        }
      } catch (e) {
        console.warn("[micro-insight] P5: Baseline signal conversion failed (non-fatal):", e);
      }

      // ── P6: 関係マップ読み出し ──
      let personMapFactEntries: PersonMapFactEntry[] | null = null;
      try {
        const { data: personMapRows } = await supabase
          .from("stargazer_alter_person_map")
          .select("label, role, sentiment_trend, last_sentiment, influence_score, mention_count")
          .eq("user_id", userId)
          .gte("influence_score", 0.5)
          .gte("mention_count", 2)
          .order("influence_score", { ascending: false })
          .limit(5);
        if (personMapRows && personMapRows.length > 0) {
          personMapFactEntries = personMapRows as PersonMapFactEntry[];
          console.info(`[person-map] P6: ${personMapRows.length} high-influence person(s) loaded: ${personMapRows.map(p => `${p.label}(${p.influence_score.toFixed(2)})`).join(", ")}`);
        }
      } catch { /* person_map table may not exist yet */ }

      // 固有データをカテゴリ別に ranked（P0:漸減 + P1:環境文脈 + P2:仮説 + P3:ベースラインズレ + P6:関係マップ）
      // T0 gate: trust level 0 では過去セッション由来データ（context/hypotheses/baseline/person map）を一切注入しない
      // DBに残っていること自体は問題ないが、T0で prompt に混ぜると「知りすぎている」体験になる
      const t0Gate = discreteTrustLevel >= 1;
      const personalizedFacts = buildPersonalizedFactsWithDomain(
        personality, homeContextWithObs, questionCategory, domainOverlay,
        t0Gate && activeLifeContext.length > 0 ? activeLifeContext : null,
        t0Gate ? hypothesisFactEntries : null,
        t0Gate ? baselineDeviationEntries : null,
        t0Gate ? personMapFactEntries : null,
      );
      const expectedKeywords = extractExpectedKeywords(personalizedFacts);

      // ── Intent Pool: clarify 用の意図選択 ──
      const clarifyType = responseMode === "clarify" ? getClarifyType(modeDecisionReason as ModeDecisionReason) : undefined;
      let clarifyIntentHint: ClarifyIntentHint | null = null;

      if (responseMode === "clarify") {
        // Intent Pool から最適な質問意図を選択
        // recentIntentIds: 直近で使用した意図の履歴（stargazer_analytics から取得）
        const recentIntentIds = new Map<string, Date>();
        try {
          const { data: recentIntentEvents } = await supabase
            .from("stargazer_analytics")
            .select("metadata, created_at")
            .eq("user_id", userId)
            .eq("event", "home_alter_intent_used")
            .order("created_at", { ascending: false })
            .limit(20);
          if (recentIntentEvents) {
            for (const ev of recentIntentEvents) {
              const intentId = (ev.metadata as any)?.intent_id;
              if (intentId && !recentIntentIds.has(intentId)) {
                recentIntentIds.set(intentId, new Date(ev.created_at));
              }
            }
          }
        } catch {
          // 初回時等は静かにスキップ
        }

        selectedClarifyIntent = selectIntent(
          message,
          discreteTrustLevel,
          "clarify",
          activeLifeContext,
          recentIntentIds,
          queryContext?.domain,
        );

        if (selectedClarifyIntent) {
          clarifyIntentHint = {
            intent_description: selectedClarifyIntent.intent.intent_description,
            preferred_forms: selectedClarifyIntent.intent.preferred_forms,
            example_questions: selectedClarifyIntent.intent.example_questions,
            intent_id: selectedClarifyIntent.intent.id,
          };
          console.info(`[intent-pool] clarify intent selected: ${selectedClarifyIntent.intent.id} (${selectedClarifyIntent.intent.name}), priority=${selectedClarifyIntent.effective_priority.toFixed(2)}`);
        }
      }

      // ── Layer 3: 骨格制約付きプロンプト構築 ──
      // P0/P1: homeContextWithObs を使い、observationCount + envContext を反映
      let homeSystemPrompt = buildHomeAlterPromptWithContext(
        personality, homeContextWithObs, questionCategory, message,
        responseMode, queryContext, domainOverlay, userName, relationalLens,
        judgmentSkeleton, clarifyType, clarifyIntentHint,
      );

      // State Layer をプロンプトに注入（LLMが状態を考慮した応答を生成するため）
      // Trust Level 1+ の場合のみ: 初回ユーザーに状態推定を適用しない
      // P0修正: 信頼レベルと会話回数を同列に扱わない。deriveTrustLevel()の離散値を使用
      const hasMinTrust = discreteTrustLevel >= 1;
      if (hasMinTrust && userState && (userState.psychological_capacity < 0.4 || userState.emotional_load > 0.6)) {
        const stateHints: string[] = [];
        if (userState.psychological_capacity < 0.4) {
          stateHints.push("相手の心理的余力は今低い。選択肢はシンプルに、実行のハードルは最小限にすること");
          stateHints.push("→ 文体: 短文優先、「まずこれだけ」で始める。提案は1つだけ");
        }
        if (userState.emotional_load > 0.6) {
          stateHints.push("相手の感情的負荷が高い。まず受け取ること。分析より共感を先に");
          stateHints.push("→ 文体: やさしく短く。「〜だよね」「無理しなくていい」。押さない");
        }
        if (userState.cognitive_fatigue > 0.6) {
          stateHints.push("認知疲労が高い。短く、具体的に。抽象的な問いかけは避ける");
          stateHints.push("→ 文体: 箇条書き禁止（疲れた人にリストは読めない）。1文で次の一手を示す");
        }
        homeSystemPrompt += `\n\n# 今の相手の状態\n${stateHints.join("\n")}\nこれは提示しない。内部的に調整するだけ。相手に「疲れてるんだね」等と言わない。`;
      }

      // 罠スキャン結果による prompt depth 低減
      if (lastTrapScan?.should_reduce_depth) {
        homeSystemPrompt += `\n\n# 応答の粒度調整\n最近の判断の実行率が低い。提案はシンプルに、ハードルは最小限にすること。\n→ trial_then_decide を優先。大きな判断は分割。まず「今日できる小さな一歩」から。`;
      }

      // Wound Activation による慎重化指示をプロンプトに注入
      if (woundActivationResult && woundActivationResult.caution_prompts.length > 0) {
        homeSystemPrompt += `\n\n# 心理的安全性の確保（内部指示・表示禁止）\n${woundActivationResult.caution_prompts.join("\n")}`;
      }

      // Financial Pressure による経済的制約プロンプト注入
      if (financialPressure && financialPressure.prompt_hint) {
        homeSystemPrompt += `\n\n# 経済的配慮（内部指示・表示禁止）\n${financialPressure.prompt_hint}`;
      }

      // Phase 2: Decision Pattern 活用 — 判断傾向をプロンプトに注入
      // observation_count >= 5 のパターンのみ使用（最低観測数制約）
      if (hasMinTrust && responseMode !== "clarify") {
        try {
          const { data: decisionPattern } = await supabase
            .from("stargazer_alter_patterns")
            .select("pattern_data, observation_count, confidence")
            .eq("user_id", userId)
            .eq("pattern_type", "decision")
            .like("pattern_key", "decision_%")
            .gte("observation_count", 5)
            .gte("confidence", 0.3)
            .order("observation_count", { ascending: false })
            .limit(3);

          if (decisionPattern && decisionPattern.length > 0) {
            const tendencyHints: string[] = [];
            for (const p of decisionPattern) {
              const pd = p.pattern_data as any;
              const dist = pd?.shape_distribution;
              if (!dist) continue;
              const total = Object.values(dist).reduce((s: number, v: any) => s + (typeof v === "number" ? v : 0), 0);
              if (total < 5) continue;
              const domain = (pd as any)?.domain ?? "全般";
              const goCount = (dist.full_go ?? 0) + (dist.bounded_go ?? 0) + (dist.trial_then_decide ?? 0);
              const waitCount = (dist.observe_first ?? 0) + (dist.skip ?? 0) + (dist.defer_with_trigger ?? 0);
              const goRatio = goCount / total;
              if (goRatio > 0.6) {
                tendencyHints.push(`${domain}の判断では「動く」寄り（直近${total}回中${goCount}回が go 系）`);
              } else if (goRatio < 0.4) {
                tendencyHints.push(`${domain}の判断では「慎重」寄り（直近${total}回中${waitCount}回が wait 系）`);
              }
            }
            if (tendencyHints.length > 0) {
              homeSystemPrompt += `\n\n# 判断傾向（内部参照のみ）\n${tendencyHints.join("\n")}\nこの傾向を「指摘」するのではなく、提案のトーン・勢いに自然に反映すること。`;
            }
          }
        } catch {
          // パターン未蓄積時は静かにスキップ
        }
      }

      // Phase 3: 段階的開示によるコンテキスト注入
      // Trust Level と情報の性質に応じて、開示レベル（silent/hint/reference/explicit）を決定
      if (hasMinTrust && activeLifeContext.length > 0 && responseMode !== "clarify") {
        const contextTrustLevel = discreteTrustLevel;

        const disclosureInstructions: string[] = [];
        for (const entry of activeLifeContext.slice(0, 5)) {
          const relevant = isContextRelevant(entry, message);
          const level = determineDisclosureLevel(entry, contextTrustLevel, relevant);
          const instruction = formatDisclosureInstruction(entry, level);
          if (instruction) disclosureInstructions.push(instruction);
        }

        if (disclosureInstructions.length > 0) {
          homeSystemPrompt += `\n\n# 背景理解（段階的開示）\n${disclosureInstructions.join("\n")}\n※ 開示レベルに従うこと。「ほのめかし可」は直接言及しない。「参照可」は自然に触れてよい。`;
        }
      }

      // Phase 4: 仮説注入 — 蓄積された仮説をプロンプトに反映
      // 断定ではなく仮説として。「見透かしている感」を避ける。
      if (hasMinTrust && responseMode !== "clarify") {
        try {
          const hypothesisTrustLevel = discreteTrustLevel;

          const { data: activeHypotheses } = await supabase
            .from("stargazer_alter_hypotheses")
            .select("*")
            .eq("user_id", userId)
            .in("status", ["emerging", "strengthening", "stable"])
            .gte("confidence", 0.3)
            .order("confidence", { ascending: false })
            .limit(10);

          if (activeHypotheses && activeHypotheses.length > 0) {
            const currentDomain = queryContext?.domain ?? null;
            const selected = selectHypothesesForPrompt(
              activeHypotheses as AlterHypothesis[],
              hypothesisTrustLevel,
              currentDomain,
            );

            const hypothesisInstructions: string[] = [];
            for (const h of selected) {
              const instruction = formatHypothesisForPrompt(h, hypothesisTrustLevel);
              if (instruction) hypothesisInstructions.push(instruction);
            }

            if (hypothesisInstructions.length > 0) {
              homeSystemPrompt += `\n\n# 仮説的理解（断定禁止）\n${hypothesisInstructions.join("\n\n")}\n\n※ 上記はあくまで仮説。「〜かもしれない」「〜の傾向がありそう」のトーンで。確定情報のように扱わないこと。`;
              hypothesesInjectedCount = selected.length;
              console.info(`[hypothesis] ${selected.length} hypothesis(es) injected for trust=${hypothesisTrustLevel}`);

              // P2: presented_count をインクリメント（提示回数の追跡）
              for (const h of selected) {
                supabase.from("stargazer_alter_hypotheses").update({
                  presented_count: ((h as any).presented_count ?? 0) + 1,
                }).eq("id", h.id).then(({ error }) => {
                  if (error) console.warn("[hypothesis] presented_count update failed:", error.message);
                });
              }
            }
          }
        } catch {
          // 仮説テーブル未作成時等は静かにスキップ
        }
      }

      // Phase 3 + P4: 経路C — 深掘りプローブ優先 → Intent Pool → detectStructuralGaps フォールバック
      // P4: 5トリガー条件の深掘りプローブを先に評価し、理解更新に直結する質問を優先する。
      //     見つからなければ既存の Intent Pool → detectStructuralGaps のフォールバックチェーン。
      if (hasMinTrust && responseMode !== "clarify" && !lastTrapScan?.should_suppress_route_c && !woundActivationResult?.should_avoid_route_c) {
        let routeCInjected = false;

        // P4: 深掘りプローブの評価（narratives + hypotheses + baseline deviations + structural gaps）
        try {
          // narratives を読み戻す（P4 で初めて読み出し側を接続）
          let userNarratives: NarrativeEntry[] = [];
          const { data: narrativeRows } = await supabase
            .from("stargazer_alter_narratives")
            .select("id, theme, content, domain, mention_count")
            .eq("user_id", userId)
            .gte("mention_count", 2)
            .order("mention_count", { ascending: false })
            .limit(10);
          if (narrativeRows) {
            userNarratives = narrativeRows as NarrativeEntry[];
          }

          // 仮説を取得（P2 の injection block と別にここでも読む — emerging 含む）
          let probingHypotheses: AlterHypothesis[] = [];
          const { data: hypoRows } = await supabase
            .from("stargazer_alter_hypotheses")
            .select("*")
            .eq("user_id", userId)
            .in("status", ["emerging", "strengthening", "stable"])
            .limit(10);
          if (hypoRows) {
            probingHypotheses = hypoRows as AlterHypothesis[];
          }

          // structural gap を事前計算
          const structuralGap = activeLifeContext.length > 0
            ? detectStructuralGaps(activeLifeContext, message, discreteTrustLevel)
            : null;

          // 直近で使った probe の dedup_key を取得（cooldown）
          const recentProbeKeys = new Set<string>();
          const { data: recentProbeEvents } = await supabase
            .from("stargazer_analytics")
            .select("metadata")
            .eq("user_id", userId)
            .eq("event", "home_alter_deepening_probe")
            .order("created_at", { ascending: false })
            .limit(10);
          if (recentProbeEvents) {
            for (const ev of recentProbeEvents) {
              const key = (ev.metadata as any)?.dedup_key;
              if (key) recentProbeKeys.add(key);
            }
          }

          const probe = selectDeepeningProbe({
            narratives: userNarratives,
            hypotheses: probingHypotheses,
            baselineDeviations: baselineDeviationsFull,
            structuralGap,
            currentMessage: message,
            currentDomain: queryContext?.domain,
            trustLevel: discreteTrustLevel,
            recentProbeKeys,
          });

          if (probe) {
            const probePrompt = formatDeepeningProbeForPrompt(probe);
            homeSystemPrompt += `\n\n${probePrompt}`;
            routeCInjected = true;
            console.info(`[deepening-probe] ${probe.trigger}: ${probe.dedup_key} (priority=${probe.priority.toFixed(2)})`);

            // probe 使用を analytics に記録（cooldown 用）
            supabase.from("stargazer_analytics").insert({
              user_id: userId,
              event: "home_alter_deepening_probe",
              feature: "deepening_probe",
              metadata: {
                trigger: probe.trigger,
                dedup_key: probe.dedup_key,
                priority: probe.priority,
                domain: probe.domain,
              },
            }).then(({ error }) => {
              if (error) console.warn("[deepening-probe] Analytics save failed:", error.message);
            });
          }
        } catch (probeErr) {
          console.warn("[deepening-probe] Evaluation failed (non-fatal):", probeErr);
        }

        // P4 で注入されなかった場合のみ、既存の Intent Pool → detectStructuralGaps チェーン
        if (!routeCInjected) {
          const routeCRecentIntentIds = new Map<string, Date>();
          try {
            const { data: recentIntentEvents } = await supabase
              .from("stargazer_analytics")
              .select("metadata, created_at")
              .eq("user_id", userId)
              .eq("event", "home_alter_intent_used")
              .order("created_at", { ascending: false })
              .limit(20);
            if (recentIntentEvents) {
              for (const ev of recentIntentEvents) {
                const intentId = (ev.metadata as any)?.intent_id;
                if (intentId && !routeCRecentIntentIds.has(intentId)) {
                  routeCRecentIntentIds.set(intentId, new Date(ev.created_at));
                }
              }
            }
          } catch {
            // 初回時等は静かにスキップ
          }

          selectedRouteCIntent = selectIntent(
            message,
            discreteTrustLevel,
            "route_c",
            activeLifeContext,
            routeCRecentIntentIds,
            queryContext?.domain,
          );

          if (selectedRouteCIntent) {
            const routeCPromptFragment = formatIntentForRouteCPrompt(selectedRouteCIntent);
            homeSystemPrompt += `\n\n# 補完質問（任意・自然に）\n${routeCPromptFragment}`;
            console.info(`[intent-pool] route_c intent selected: ${selectedRouteCIntent.intent.id} (${selectedRouteCIntent.intent.name})`);
          } else {
            // Intent Pool でも見つからなければ旧ロジック（detectStructuralGaps）にフォールバック
            if (activeLifeContext.length > 0) {
              const gap = detectStructuralGaps(activeLifeContext, message, discreteTrustLevel);
              if (gap) {
                homeSystemPrompt += `\n\n# 補完質問（任意・自然に）\n相談に関連して、以下の情報があると判断の精度が上がる。応答の最後に、自然な関心として1文だけ聞いてよい（必須ではない）。\n質問: 「${gap.suggested_question}」\n※ 無理に聞かない。会話の流れに合わない場合は省略すること。`;
              }
            }
          }
        }
      }

      // ── P5: Micro Insight 統合ゲート（evaluateMIGate） ──
      // 既存の時間/ストリーク/罠/傷の suppression → evaluateMIGate に統合
      // evaluateMIGate は既存 suppression をパススルーし、その上にフェイルセーフ + cooldown を積む

      // Step 1: 従来の pre-filter（罠・傷）を先に評価
      let preSuppressReason = "";
      if (lastTrapScan?.should_suppress_mi) {
        preSuppressReason = "trap_scan: surveillance/projection trap detected";
      }
      if (!preSuppressReason && woundActivationResult?.should_suppress_mi) {
        const activeWound = woundActivationResult.most_active;
        preSuppressReason = `wound_activation: "${activeWound?.theme}" (score: ${activeWound?.activation_score.toFixed(2)}, level: ${activeWound?.level})`;
      }

      // Step 2: 既存の時間/ストリーク suppression を評価
      let legacySuppressReason = "";
      if (lastInsightPresentedAt) {
        const hoursSinceLastInsight = (Date.now() - lastInsightPresentedAt.getTime()) / (1000 * 60 * 60);
        if (hoursSinceLastInsight < 1) {
          legacySuppressReason = `最小間隔未達 (${hoursSinceLastInsight.toFixed(1)}h < 1h)`;
        }
      }
      if (!legacySuppressReason && recentDenyIgnoreStreak >= 2) {
        legacySuppressReason = `deny/ignore 連続 ${recentDenyIgnoreStreak} 回 — 一時抑制`;
      }

      // Step 3: evaluateMIGate に統合（reactions 全量 + recentPresentations + alterSessionCount）
      let miGateReactions: Array<{ reaction: string; insight_type: string; signal_types: string[]; created_at: string }> = [];
      let miRecentPresentations: Date[] = [];
      let sessionMIPresentedCount = 0;
      try {
        const { data: allReactions } = await supabase
          .from("stargazer_alter_reactions")
          .select("reaction, insight_type, signal_types, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(50);
        if (allReactions) {
          miGateReactions = allReactions.map(r => ({
            reaction: r.reaction,
            insight_type: r.insight_type ?? "",
            signal_types: (r.signal_types as string[]) ?? [],
            created_at: r.created_at,
          }));
        }

        const { data: presentationEvents } = await supabase
          .from("stargazer_analytics")
          .select("created_at, metadata")
          .eq("user_id", userId)
          .eq("event", "home_alter_insight_presented")
          .order("created_at", { ascending: false })
          .limit(10);
        if (presentationEvents) {
          miRecentPresentations = presentationEvents.map(e => new Date(e.created_at));
          // Fix 1: 同一セッション内の MI 提示回数を集計
          sessionMIPresentedCount = presentationEvents.filter(
            e => (e.metadata as any)?.session_id === sessionId
          ).length;
        }
      } catch {
        // テーブル未作成時は静かにスキップ
      }

      const miGateDecision: MIGateDecision = evaluateMIGate({
        existingSuppressReason: preSuppressReason || legacySuppressReason,
        reactions: miGateReactions,
        recentPresentations: miRecentPresentations,
        alterSessionCount,
        sessionMIPresentedCount,
      });

      insightSuppressedReason = miGateDecision.blockReason;
      if (insightSuppressedReason) {
        console.info(`[micro-insight] Suppressed by MI Gate: ${insightSuppressedReason}${miGateDecision.failsafeActive ? " [FAILSAFE]" : ""}`);
      }

      // Step 4: suppressedTypes フィードバック — microInsight の signal_types が全て抑制対象なら提示しない
      let insightTypesSuppressed = false;
      if (microInsight && miGateDecision.suppressedTypes.length > 0) {
        const allSuppressed = microInsight.signals.every(
          s => miGateDecision.suppressedTypes.includes(s.type)
        );
        if (allSuppressed) {
          insightTypesSuppressed = true;
          insightSuppressedReason = insightSuppressedReason || `suppressedTypes: 全シグナル(${microInsight.signals.map(s => s.type).join(",")})が抑制対象`;
          console.info(`[micro-insight] All signal types suppressed by accuracy feedback`);
        }
      }

      insightPresented = !!(microInsight
        && responseMode !== "clarify"
        && discreteTrustLevel >= microInsight.required_trust
        && (userState?.emotional_load ?? 0) < 0.75 // 感情的に重い時は気づきを差し込まない
        && miGateDecision.allowed  // P5: 統合ゲート通過
        && !insightTypesSuppressed); // P5: suppressedTypes フィードバック

      if (insightPresented && microInsight) {
        // サニタイズ: suggested_prompt は内部生成だが、安全のため長さ制限 + 改行除去
        const sanitizedPrompt = microInsight.suggested_prompt
          .replace(/[\n\r]/g, " ")
          .slice(0, 100);
        const presentationGuide = {
          casual_check: "さりげない確認（「そういえば〜」）",
          observation: "観察の共有（「最近〜が多いね」）",
          gentle_inquiry: "問いとしての気づき（「〜かもしれないけど、何かある？」）",
          connection: "つながりの示唆（「前も似たようなこと…」）",
        }[microInsight.presentation_type] ?? "さりげない確認";
        homeSystemPrompt += `\n\n# Micro Insight（自然に織り込むこと）\n以下の気づきを、応答の最後に「自然な関心」として1文だけ付け加えてよい。断定禁止。分析根拠を見せない。\n気づき: 「${sanitizedPrompt}」\n提示形式: ${presentationGuide}\n重要: 無理に入れなくてよい。文脈に合わない場合は省略すること。\n\n## 禁止表現\n- 「あなたは〇〇しています」（断定）\n- 「3つのシグナルから〜」（分析の暴露）\n- 「パターンが見えます」（メタ分析）\n- 「ストレス状態と推定されます」（診断風）`;

        // Phase 2: Reaction Learning — 提示マーカーを保存（次回メッセージで反応を記録するため）
        supabase.from("stargazer_analytics").insert({
          user_id: userId,
          event: "home_alter_insight_presented",
          feature: "micro_insight",
          metadata: {
            session_id: sessionId, // P5 Fix 1: セッション単位の MI カウント用
            suggested_prompt: sanitizedPrompt,
            presentation_type: microInsight.presentation_type,
            signal_types: microInsight.signals.map(s => s.type),
            convergence_score: microInsight.convergence_score?.combined,
            // P5: MI Gate メタデータ
            mi_gate_accuracy: miGateDecision.accuracy ? {
              total_presented: miGateDecision.accuracy.total_presented,
              accepted_pct: miGateDecision.accuracy.accepted_count / Math.max(1, miGateDecision.accuracy.total_presented),
              denied_pct: miGateDecision.accuracy.denied_count / Math.max(1, miGateDecision.accuracy.total_presented),
            } : null,
            baseline_signals_injected: baselineSignals.length,
          },
        }).then(({ error }) => {
          if (error) console.warn("[reaction-learning] Marker save failed:", error.message);
        });
      }

      // ── Phase A: Gemini読解結果を応答生成プロンプトに注入 ──
      // 内部参照用。ユーザーには直接見せない。
      if (utteranceReading && responseMode !== "clarify") {
        homeSystemPrompt += `\n\n${buildReadingPromptBlock(utteranceReading)}`;
      }

      // ── Phase B: implied_meanings + unspoken_candidates の shadow log ──
      // 理解資産化はしない。analytics にログのみ記録。
      if (utteranceReading && (utteranceReading.implied_meanings.length > 0 || utteranceReading.unspoken_candidates.length > 0)) {
        const shadowPayload = buildShadowLogPayload(utteranceReading);
        supabase.from("stargazer_analytics").insert({
          user_id: userId,
          event: "utterance_reading_shadow",
          feature: "alter_utterance_reading",
          metadata: {
            phase: "B_shadow",
            surface_intent: utteranceReading.surface_intent,
            emotional_temperature: utteranceReading.emotional_temperature,
            energy_direction: utteranceReading.energy_direction,
            relational_target: utteranceReading.relational_context?.target_role ?? null,
            ...shadowPayload,
            reading_latency_ms: utteranceReadingLatencyMs,
          },
        }).then(({ error }) => {
          if (error) console.warn("[utterance-reading] Shadow log save failed:", error.message);
        });
      }

      // ── P0-5: 会話内事実トラッキング — ユーザーが述べた事実をプロンプトに注入 ──
      if (conversationHistory.length > 0) {
        const conversationFacts = extractConversationFacts(
          conversationHistory.map((m) => ({ role: m.role, content: m.content })),
        );
        if (conversationFacts.length > 0) {
          homeSystemPrompt += `\n\n# ユーザーが今回の会話で述べた事実（確定情報として扱うこと）\n${conversationFacts.map((f) => `- ${f}`).join("\n")}\n\nこれらに矛盾する内容を応答に含めないこと。ユーザーが言及していない人物・状況を勝手に作らないこと。`;
        }
      }

      // ── P1-C: リアクション別プロンプト注入 ──
      if (detectedReaction && lastAlterContent) {
        const altSnippet = lastAlterContent.slice(0, 300);
        switch (detectedReaction.type) {
          case "agree":
            homeSystemPrompt += `\n\n# ユーザーの反応: 同意（P1-C）\n前回のALTER応答:「${altSnippet}」\n\nユーザーはこの仮説に同意した。\n- まず同意を受け止める（「そうだよね」「うん、僕もそう思ってた」等）\n- その仮説をさらに一段深める（なぜそうなのか、どんな場面で特に顕著か）\n- 新しい情報や角度を1つだけ付け加える\n- 宿題・行動提案は出さない`;
            break;
          case "disagree":
            if (detectedReaction.disagree_strength === "strong") {
              homeSystemPrompt += `\n\n# ユーザーの反応: 強い否定（P1-C）\n前回のALTER応答:「${altSnippet}」\n\nユーザーはこの仮説を明確に否定した。\n- まず否定を素直に受け止める（「ごめん、そこはズレてた」「確かに違ったかも」）\n- 何がズレていたかをユーザーに聞く（「どのあたりが違う？」）\n- 言い訳・弁解はしない。こちらの読みが外れたことを認める\n- 前回の仮説を繰り返さない`;
            } else {
              homeSystemPrompt += `\n\n# ユーザーの反応: やんわり否定（P1-C）\n前回のALTER応答:「${altSnippet}」\n\nユーザーはこの仮説にしっくりきていない。\n- 否定を柔らかく受け止める（「うーん、ちょっと違ったか」）\n- どこが引っかかるかを優しく確認する（「どのへんがピンとこない？」）\n- 完全否定ではないので、仮説の一部は合っている可能性がある。その余地を残す\n- 押し付けない。ユーザーのペースで修正してもらう`;
            }
            break;
          case "deepen":
            homeSystemPrompt += `\n\n# ユーザーの反応: 深掘り要求（P1-C）\n前回のALTER応答:「${altSnippet}」\n\nユーザーはこの話題をもっと知りたがっている。\n- 前回の話題をそのまま掘り下げる（別の話題に飛ばない）\n- 具体例、背景、パターン、例外ケースなどで展開する\n- 前回と同じ内容を繰り返さない。新しい切り口で深める\n- 「他には？」には別の観点を提示する`;
            break;
          case "redirect":
            if (detectedReaction.redirect_subtype === "correction") {
              homeSystemPrompt += `\n\n# ユーザーの反応: 方向修正（P1-C）\n前回のALTER応答:「${altSnippet}」\n\nユーザーは前回の応答の方向性がずれていると感じている。\n- 方向のズレを認める\n- ユーザーが本当に聞きたいことにフォーカスし直す\n- 前回の応答を繰り返さない`;
            }
            // topic_change はここに来ない（通常パイプラインへフォールスルー済み）
            break;
        }
      } else if (responseMode === "repair" && lastAlterContent) {
        // P1-C以前の既存repair（detectCorrectionSignal由来）
        homeSystemPrompt += `\n\n# 前回のALTERの応答（これが誤解の原因）\n「${lastAlterContent.slice(0, 300)}」\n\nユーザーの今の発言はこの応答への訂正。上記の何がズレていたかを把握した上で応答すること。`;
      }

      // フォローアップ傾向をプロンプトに注入
      if (followupInsight) {
        homeSystemPrompt += `\n\n# 過去の提案に対するフィードバック傾向\n${followupInsight}\nこの傾向を考慮して、提案の粒度・ハードルを調整すること。`;
      }
      // clarify follow-up: 元の質問 + 追加情報を統合してプロンプトに渡す
      let effectiveMessage = message;
      if (wasPreviousClarify && conversationHistory.length >= 2) {
        const originalUserMsg = conversationHistory[conversationHistory.length - 2];
        if (originalUserMsg && originalUserMsg.role === "user") {
          effectiveMessage = `${originalUserMsg.content}（補足: ${message}）`;
          console.info("[home-alter] Clarify follow-up: merged with original question");
        }
      }

      const homeUserPrompt = buildHomeAlterUserPrompt(
        effectiveMessage,
        conversationHistory.length > 0
          ? conversationHistory.map((m) => ({ role: m.role, content: m.content }))
          : undefined,
      );

      // 1回目の生成
      // NOTE: gemini-2.5-flash は thinking tokens が maxOutputTokens に含まれるため、
      // 実際の出力文字数の10倍程度のトークン予算が必要
      let homeResponse = "";
      try {
        const aiResult = await runAI({
          taskType: "stargazer_alter_response",
          prompt: homeUserPrompt,
          systemPrompt: homeSystemPrompt,
          requireJson: false,
          temperature: (responseMode === "clarify" || responseMode === "repair") ? 0.3 : 0.6,
          maxOutputTokens: (responseMode === "clarify" || responseMode === "repair") ? 512 : responseMode === "direct_response" ? 1536 : responseMode === "branch" ? 3072 : 2048,
          userId: userId,
          metadata: makeStargazerRunMetadata({
            feature: "alter",
            mode: "warm",
            turnNumber: conversationHistory.length,
            skipCache: true,
          }),
        });
        if (aiResult.success && aiResult.text?.trim()) {
          if (responseMode === "clarify" || responseMode === "repair" || responseMode === "direct_response") {
            // 軽量モードはメタデータなし、formatHomeAlterResponseで整形のみ
            homeResponse = formatHomeAlterResponse(aiResult.text.trim(), userName);
          } else {
            const { responseText: stripped, metadata: meta } = parseDecisionMetadata(aiResult.text);
            homeResponse = formatHomeAlterResponse(stripped, userName);
            if (meta) homeDecisionMeta = meta;
          }
        }
      } catch (e) {
        console.warn("[home-alter] First attempt failed:", e);
      }

      // ── P1-B: 空レスリトライ（最大1回、同一プロンプト再呼び出し） ──
      // 空判定: 空文字・空白のみ・改行のみ・null/undefined を全て空とみなす
      let emptyRetryAttempted = false;
      let emptyRetrySucceeded = false;
      if (!homeResponse?.trim()) {
        emptyRetryAttempted = true;
        console.warn("[home-alter] Empty response from LLM, retrying once with same prompt");
        try {
          const emptyRetryResult = await runAI({
            taskType: "stargazer_alter_response",
            prompt: homeUserPrompt,
            systemPrompt: homeSystemPrompt,
            requireJson: false,
            temperature: (responseMode === "clarify" || responseMode === "repair") ? 0.3 : 0.6,
            maxOutputTokens: (responseMode === "clarify" || responseMode === "repair") ? 512 : responseMode === "direct_response" ? 1536 : responseMode === "branch" ? 3072 : 2048,
            userId: userId,
            metadata: makeStargazerRunMetadata({
              feature: "alter",
              mode: "warm",
              turnNumber: conversationHistory.length,
              skipCache: true,
              attempt: 1,
            }),
          });
          if (emptyRetryResult.success && emptyRetryResult.text?.trim()) {
            if (responseMode === "clarify" || responseMode === "repair" || responseMode === "direct_response") {
              homeResponse = formatHomeAlterResponse(emptyRetryResult.text.trim(), userName);
            } else {
              const { responseText: stripped, metadata: meta } = parseDecisionMetadata(emptyRetryResult.text);
              homeResponse = formatHomeAlterResponse(stripped, userName);
              if (meta) homeDecisionMeta = meta;
            }
            emptyRetrySucceeded = true;
            console.info("[home-alter] Empty response retry succeeded");
          }
        } catch (retryErr) {
          console.warn("[home-alter] Empty response retry failed:", retryErr);
        }
        // analytics: 空レスリトライの結果を記録
        supabase.from("stargazer_analytics").insert({
          user_id: userId,
          event: "home_alter_empty_retry",
          feature: "alter",
          metadata: {
            attempted: true,
            succeeded: emptyRetrySucceeded,
            response_mode: responseMode,
            question_type: questionType,
          },
        }).then(() => {}, () => {});
      }

      // 検査（モード別バリデーション）
      const validation = homeResponse?.trim()
        ? validateHomeAlterResponseWithMode(homeResponse, message, expectedKeywords, responseMode)
        : { pass: false, failures: ["応答の生成に失敗"] };
      p0ValidationFailures = validation.failures;

      // 不合格なら再生成（facts を明示して再試行）
      // 条件: validation不合格 + 応答が空でない + clarify/repair/direct_responseでない + 空レスリトライ済みでない
      if (!validation.pass && homeResponse?.trim() && responseMode !== "clarify" && responseMode !== "repair" && responseMode !== "direct_response" && !emptyRetryAttempted) {
        console.info("[home-alter] First response failed validation:", validation.failures);
        try {
          const retryPrompt = buildHomeAlterRetryPrompt(
            message,
            homeResponse,
            validation.failures,
            personalizedFacts,
            questionCategory,
            userName,
          );
          const retryResult = await runAI({
            taskType: "stargazer_alter_response",
            prompt: retryPrompt,
            systemPrompt: homeSystemPrompt,
            requireJson: false,
            temperature: 0.4,
            maxOutputTokens: 2048,
            userId: userId,
            metadata: makeStargazerRunMetadata({
              feature: "alter",
              mode: "warm",
              turnNumber: conversationHistory.length,
              skipCache: true,
              attempt: 1,
            }),
          });
          if (retryResult.success && retryResult.text?.trim()) {
            const { responseText: retryStripped, metadata: retryMeta } = parseDecisionMetadata(retryResult.text);
            const retryFormatted = formatHomeAlterResponse(retryStripped, userName);
            const retryValidation = validateHomeAlterResponseWithMode(retryFormatted, message, expectedKeywords, responseMode);
            if (retryValidation.pass) {
              homeResponse = retryFormatted;
              if (retryMeta) homeDecisionMeta = retryMeta;
            } else {
              console.warn("[home-alter] Retry also failed validation:", retryValidation.failures);
              homeResponse = retryFormatted || homeResponse;
              if (retryMeta) homeDecisionMeta = retryMeta;
            }
          }
        } catch (retryError) {
          console.warn("[home-alter] Retry failed:", retryError);
        }
      }

      // ── P0-4: 応答重複チェック — 前回と酷似なら再生成 ──
      if (homeResponse && lastAlterContent) {
        const similarity = computeResponseSimilarity(homeResponse, lastAlterContent);
        if (similarity > 0.70) {
          console.warn(`[home-alter] Response too similar to previous (similarity=${similarity.toFixed(2)}), regenerating`);
          try {
            const dedupPrompt = [
              `ユーザーの質問: 「${message}」`,
              "",
              "## 重要な制約",
              `前回の応答: 「${lastAlterContent.slice(0, 200)}」`,
              "上記と同じ内容を繰り返してはならない。全く異なる切り口・表現で応答すること。",
            ].join("\n");
            const dedupResult = await runAI({
              taskType: "stargazer_alter_response",
              prompt: dedupPrompt,
              systemPrompt: homeSystemPrompt,
              requireJson: false,
              temperature: 0.75,
              maxOutputTokens: 2048,
              userId: userId,
              metadata: makeStargazerRunMetadata({
                feature: "alter",
                mode: "warm",
                turnNumber: conversationHistory.length,
                skipCache: true,
                attempt: 2,
              }),
            });
            if (dedupResult.success && dedupResult.text?.trim()) {
              const dedupFormatted = formatHomeAlterResponse(dedupResult.text.trim(), userName);
              const dedupSimilarity = computeResponseSimilarity(dedupFormatted, lastAlterContent);
              if (dedupSimilarity < similarity) {
                homeResponse = dedupFormatted;
                console.info(`[home-alter] Dedup regeneration succeeded (new similarity=${dedupSimilarity.toFixed(2)})`);
              }
            }
          } catch (e) {
            console.warn("[home-alter] Dedup regeneration failed:", e);
          }
        }
      }

      // フォールバック: LLM 生成が失敗した場合、質問タイプに合わせた安全な応答を生成
      if (!homeResponse?.trim()) {
        const namePrefix = userName ? `${userName}さん、` : "";
        if (questionType === "emotional") {
          homeResponse = `${namePrefix}今は無理に言葉にしなくても大丈夫。ここにいるから、話したくなったらいつでも。`;
        } else {
          try {
            const identity = (framework.identityFit?.split("。")[0] ?? "").trim();
            const growth = (framework.growthVector?.split("。")[0] ?? "").trim();
            if (identity && growth) {
              homeResponse = `${namePrefix}${identity}。${growth}。もう少し話を聞かせてもらえると、精度が上がるはず。`;
            }
          } catch {
            // フォールバック生成失敗 → 下の最終デフォルトへ
          }
        }
      }
      alterResponseText = homeResponse || "もう少し話を聞かせてもらえると、より正確にお伝えできます。";

      // ── Layer 4: 応答品質検証 ──
      if (homeResponse && judgmentSkeleton && relationalLens && inputUnderstanding && responseMode !== "clarify") {
        qualityCheck = validateResponseQuality(
          homeResponse, homeDecisionMeta, judgmentSkeleton, relationalLens, inputUnderstanding, personality,
        );
        if (!qualityCheck.pass) {
          console.warn("[home-alter] Quality check failures:", qualityCheck.failures);
        }
        if (qualityCheck.generic_response_score >= 0.5) {
          console.warn(`[home-alter] Generic response detected: score=${qualityCheck.generic_response_score.toFixed(2)}`);
        }

        // 性格反転フレーズの後処理修正
        if (homeResponse && qualityCheck.failures.some(f => f.startsWith("性格反転"))) {
          const sanitized = sanitizeTraitInversions(homeResponse, personality);
          if (sanitized.corrections.length > 0) {
            console.info("[home-alter] Trait inversion sanitized:", sanitized.corrections);
            homeResponse = sanitized.text;
            alterResponseText = homeResponse;
            // 修正後に再検証
            qualityCheck = validateResponseQuality(
              homeResponse, homeDecisionMeta, judgmentSkeleton, relationalLens, inputUnderstanding, personality,
            );
          }
        }
      }

      // ── Phase 5: 不気味ライン検知 ──
      // 応答が「見透かしている感」を超えていないかチェック
      if (homeResponse && discreteTrustLevel !== undefined) {
        // T0 gate: prompt に注入していないなら contextEntriesUsed も 0
        const contextEntriesForCreepiness = t0Gate ? activeLifeContext.length : 0;
        creepinessCheck = checkCreepinessLine(
          homeResponse,
          discreteTrustLevel,
          hypothesesInjectedCount,
          contextEntriesForCreepiness,
        );
        if (!creepinessCheck.pass) {
          console.warn("[creepiness] Critical violation detected:", creepinessCheck.violations);

          // F: Critical 違反時の応答差し替え — MI/hypothesis を除去して安全側で再生成
          try {
            // プロンプトから Micro Insight と 仮説セクションを除去
            const safeSystemPrompt = homeSystemPrompt
              .replace(/\n\n# Micro Insight（自然に織り込むこと）[\s\S]*?(?=\n\n#|\n\n━|$)/, "")
              .replace(/\n\n# 仮説的理解（断定禁止）[\s\S]*?(?=\n\n#|\n\n━|$)/, "")
              .replace(/\n\n## 禁止表現[\s\S]*?(?=\n\n#|\n\n━|$)/, "");

            const safeResult = await runAI({
              taskType: "stargazer_alter_response",
              prompt: buildHomeAlterUserPrompt(
                effectiveMessage,
                conversationHistory.length > 0
                  ? conversationHistory.map((m) => ({ role: m.role, content: m.content }))
                  : undefined,
              ),
              systemPrompt: safeSystemPrompt + "\n\n# 安全制約\n断定表現を絶対に使わないこと。「あなたは〜だ」「きっと〜」は禁止。全て問いの形か「〜かもしれない」の形で。追跡的な表現（「いつも〜よね」「毎回〜」）も禁止。",
              requireJson: false,
              temperature: 0.3, // 安全側に低温
              maxOutputTokens: 2048,
              userId: userId,
              metadata: makeStargazerRunMetadata({
                feature: "alter",
                mode: "warm",
                turnNumber: conversationHistory.length,
                skipCache: true,
                attempt: 2,
              }),
            });

            if (safeResult.success && safeResult.text?.trim()) {
              const { responseText: safeStripped, metadata: safeMeta } = parseDecisionMetadata(safeResult.text);
              const safeFormatted = formatHomeAlterResponse(safeStripped, userName);

              // 再生成した応答も不気味ラインチェック
              const safeCreepiness = checkCreepinessLine(safeFormatted, discreteTrustLevel, 0, contextEntriesForCreepiness);
              if (safeCreepiness.pass) {
                homeResponse = safeFormatted;
                alterResponseText = homeResponse;
                if (safeMeta) homeDecisionMeta = safeMeta;
                creepinessCheck = safeCreepiness;
                console.info("[creepiness] Safe regeneration succeeded — response replaced");
              } else {
                console.warn("[creepiness] Safe regeneration also failed — falling back to minimal response");
                // 最終フォールバック: 安全な最小応答
                const namePrefix = userName ? `${userName}さん、` : "";
                homeResponse = `${namePrefix}なるほど、そういう状況なんですね。もう少し聞かせてもらえますか？`;
                alterResponseText = homeResponse;
                creepinessCheck = { pass: true, violations: [] };
              }
            } else {
              // LLM 再生成失敗 → 安全フォールバック
              const namePrefix = userName ? `${userName}さん、` : "";
              homeResponse = `${namePrefix}なるほど、そういう状況なんですね。もう少し聞かせてもらえますか？`;
              alterResponseText = homeResponse;
              creepinessCheck = { pass: true, violations: [] };
            }
          } catch (e) {
            console.warn("[creepiness] Safe regeneration failed:", e);
            // 最終フォールバック
            const namePrefix = userName ? `${userName}さん、` : "";
            homeResponse = `${namePrefix}なるほど、そういう状況なんですね。もう少し聞かせてもらえますか？`;
            alterResponseText = homeResponse;
            creepinessCheck = { pass: true, violations: [] };
          }
        } else if (creepinessCheck.violations.length > 0) {
          console.info("[creepiness] Warnings:", creepinessCheck.violations.map(v => v.detail));
        }
      }

      // ── P5 Fix 2: MI 断定表現の出力 lint ──
      // Micro Insight が提示された応答に対して、断定表現が残っていないか post-output で検査
      if (insightPresented && homeResponse) {
        const miLint = lintMIAssertions(homeResponse);
        if (miLint.patched) {
          console.warn(`[mi-lint] 断定表現を検出・パッチ: ${miLint.violations.join(", ")}`);
          homeResponse = miLint.clean;
          alterResponseText = homeResponse;
          // analytics 記録（断定表現漏れの追跡用）
          supabase.from("stargazer_analytics").insert({
            user_id: userId,
            event: "home_alter_mi_assertion_lint",
            feature: "p5_lint",
            metadata: {
              violations: miLint.violations,
              session_id: sessionId,
            },
          }).then(({ error }) => {
            if (error) console.warn("[mi-lint] Analytics save failed:", error.message);
          });
        }
      }

      // ── Layer 5: 監査トレイル構築 ──
      if (inputUnderstanding && lensDetailed && queryContext && judgmentSkeleton) {
        const isFollowup = wasPreviousClarify ?? false;
        auditTrail = buildAuditTrail(
          inputUnderstanding, lensDetailed, queryContext, judgmentSkeleton,
          modeDecisionReason,
          qualityCheck ?? { pass: true, failures: [], generic_response_score: 0 },
          {
            followupInsight: !!followupInsight,
            retryAttempted: !validation.pass && responseMode !== "clarify",
            isFollowup,
            previousSkeleton: null, // 前回 skeleton は stargazer_analytics の home_alter_judgment から取得可能だが、audit trail 用であり判断には不要
          },
        );
      }

      } // end of judgment engine else block

    } else {
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // DEEP ALTER: 既存ロジック（変更なし）
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    // Deep system prompt の構築
    const deepContext: AlterDeepContext = {
      personality,
      mode,
      pastSummaries: pastSummaries.length > 0 ? pastSummaries : undefined,
      behavioralEvidence: behavioralEvidence.length > 0 ? behavioralEvidence : undefined,
      longTermMemory,
      growthState,
      conversationHistory: conversationHistory.length > 0 ? conversationHistory : undefined,
      handoffContext,
    };

    let systemPrompt: string;
    try {
      systemPrompt = await buildDeepAlterPrompt(deepContext);
    } catch (e) {
      console.warn("[alter] Deep prompt build failed, falling back to standard:", e);
      systemPrompt = buildAlterSystemPrompt(
        personality,
        mode,
        pastSummaries.length > 0 ? pastSummaries : undefined,
        behavioralEvidence.length > 0 ? behavioralEvidence : undefined,
        undefined,
        longTermMemory,
      );
    }

    if (contradictionHint) {
      systemPrompt += `\n\n## セッション間の矛盾検出\n${contradictionHint}\nこの過去の発言との矛盾を、好奇心を持って対話に織り込んでください。判断ではなく、好奇心で。`;
    }

    if (conversationHistory.length === 0) {
      // --- 挨拶（初回メッセージ） ---
      try {
        let greetingPrompt =
          "これは対話の最初のメッセージです。相手の深層にある矛盾や内在する葛藤を感じ取り、" +
          "興味を引く挨拶をしてください。「僕」で語り、相手を「君」と呼んでください。" +
          "汎用的な挨拶は禁止。必ずユーザー固有のデータポイントを1つ以上含めること。";

        // Inter-session continuity: 前回のセッションを参照
        if (pastSummaries.length > 0) {
          const lastSession = pastSummaries[0]!;
          greetingPrompt += `\n\n## 前回のセッション（${lastSession.date}）`;
          if (lastSession.followUpHooks.length > 0) {
            greetingPrompt += `\n未回収の伏線: 「${lastSession.followUpHooks[0]}」`;
            greetingPrompt += "\n前回の話の続きから自然に始めること: 「前回、〇〇の話をしていたね。あれから何か変わった？」";
          }
          if (lastSession.deepestMoment) {
            greetingPrompt += `\n前回の最も深い瞬間: 「${lastSession.deepestMoment.slice(0, 80)}」`;
          }
          if (lastSession.resistancePoints.length > 0) {
            greetingPrompt += `\n前回の抵抗点: 「${lastSession.resistancePoints[0]!.slice(0, 80)}」`;
          }
        }

        // Growth state context for greeting
        if (growthState && growthState.unfinishedThreads.length > 0) {
          const thread = growthState.unfinishedThreads[0]!;
          greetingPrompt += `\n\n## 未解決スレッド`;
          greetingPrompt += `\nトピック: 「${thread.topic}」（${thread.reason === "deflected" ? "前回回避された" : "時間切れ"}）`;
          greetingPrompt += "\nこのスレッドを自然に再開すること。";
        }

        // Shadow Whisper からのハンドオフコンテキストがある場合
        if (handoffContext?.whisper) {
          greetingPrompt +=
            `\n\n## 直前の観測コンテキスト\nユーザーは直前の観測で以下のシャドウの一言を受け取り、そこから対話に来ました。` +
            `\nシャドウの一言: 「${truncateString(handoffContext.whisper, 200)}」`;

          if (handoffContext.signal?.extremeAxis) {
            const ea = handoffContext.signal.extremeAxis;
            greetingPrompt += `\n今日の観測で特に極端だった軸: ${ea.label}（スコア: ${ea.score.toFixed(2)}）`;
          }
          if (handoffContext.signal?.repeatingPattern) {
            const rp = handoffContext.signal.repeatingPattern;
            greetingPrompt += `\n繰り返しパターン検出: ${rp.label}が${rp.dayCount}日連続で同じ傾向`;
          }

          greetingPrompt +=
            "\nこの文脈を踏まえて、シャドウの一言の続きとして自然に会話を始めてください。" +
            "一言を繰り返すのではなく、そこから更に深い問いかけや気づきを投げかけてください。";
        }
        const aiResult = await runAI({
          taskType: "stargazer_alter_response",
          prompt: greetingPrompt,
          systemPrompt,
          requireJson: false,
          temperature: 0.85,
          maxOutputTokens: 900,
          userId: userId,
          metadata: makeStargazerRunMetadata({ feature: "alter", mode, turnNumber: 0, skipCache: true }),
        });
        const fallbackGreeting = generateAlterGreeting(
          personality,
          pastSummaries.length > 0 ? pastSummaries : undefined,
          behavioralEvidence.length > 0 ? behavioralEvidence : undefined,
        );
        if (aiResult.success && aiResult.text?.trim()) {
          alterResponseText = truncateString(
            finalizeAlterResponse(aiResult.text, fallbackGreeting),
            MAX_RESPONSE_LENGTH,
          );
        } else {
          alterResponseText = fallbackGreeting;
        }
      } catch (e) {
        console.warn("[alter] AI greeting failed, using template fallback:", e);
        alterResponseText = generateAlterGreeting(
          personality,
          pastSummaries.length > 0 ? pastSummaries : undefined,
          behavioralEvidence.length > 0 ? behavioralEvidence : undefined,
        );
      }
    } else {
      // --- 通常の応答 ---
      try {
        const conversationContext = conversationHistory
          .slice(-10) // 直近10メッセージに制限
          .map(
            (d) =>
              `${d.role === "user" ? "ユーザー" : "シャドウ"}: ${d.content}`,
          )
          .join("\n");
        const prompt = `${conversationContext}\nユーザー: ${message}\nシャドウ:`;

        const fallbackResponse = generateAlterResponse(
          personality,
          message,
          conversationHistory,
          mode,
        );

        // リトライ付きAI呼び出し（最大2回）
        let aiSuccess = false;
        for (let attempt = 0; attempt < 2 && !aiSuccess; attempt++) {
          try {
            const aiResult = await runAI({
              taskType: "stargazer_alter_response",
              prompt,
              systemPrompt,
              requireJson: false,
              temperature: 0.85 + attempt * 0.05, // リトライ時は温度を微調整
              maxOutputTokens: 900,
              userId: userId,
              metadata: makeStargazerRunMetadata({
                feature: "alter",
                mode,
                turnNumber: conversationHistory.length,
                skipCache: true,
                attempt,
              }),
            });
            if (aiResult.success && aiResult.text?.trim()) {
              const finalized = finalizeAlterResponse(aiResult.text, fallbackResponse);
              if (!looksIncompleteAlterResponse(finalized)) {
                alterResponseText = truncateString(finalized, MAX_RESPONSE_LENGTH);
                aiSuccess = true;
              }
            }
          } catch (retryError) {
            console.warn(`[alter] AI attempt ${attempt + 1} failed:`, retryError);
          }
        }

        // 全リトライ失敗時はフォールバック
        if (!aiSuccess) {
          alterResponseText = fallbackResponse;
        }
      } catch (e) {
        console.warn(
          "[alter] AI response failed, using template fallback:",
          e,
        );
        alterResponseText = generateAlterResponse(
          personality,
          message,
          conversationHistory,
          mode,
        );
      }
    }
    } // end Deep Alter branch

    // provocation レベル (1-5)
    const provocationLevel =
      mode === "warm" ? 1 : mode === "provocative" ? 4 : 3;

    // ユーザーメッセージと Alter レスポンスを DB に保存
    const now = new Date().toISOString();
    const [{ error: userMsgError }, { error: alterMsgError }] =
      await Promise.all([
        supabase.from("stargazer_alter_dialogues").insert({
          user_id: userId,
          session_id: sessionId,
          role: "user",
          alter_mode: mode,
          message,
          created_at: now,
        }),
        supabase.from("stargazer_alter_dialogues").insert({
          user_id: userId,
          session_id: sessionId,
          role: "alter",
          alter_mode: mode,
          message: alterResponseText,
          created_at: new Date(Date.now() + 1).toISOString(),
          ...(isHomeAlter ? { emotional_context: { source: "home", question: message, response_mode: responseMode } } : {}),
        }),
      ]);

    if (userMsgError) {
      console.error("Failed to save user message:", userMsgError);
    }
    if (alterMsgError) {
      console.error("Failed to save alter response:", alterMsgError);
    }
    if (userMsgError || alterMsgError) {
      return NextResponse.json(
        { error: "対話の保存に失敗しました" },
        { status: 500 },
      );
    }

    // Home Alter: reasoning basis + decision metadata を追加して返却
    const reasoningBasis = isHomeAlter
      ? extractReasoningBasis(personality, rawHomeContext ?? null, alterResponseText)
      : undefined;

    // Decision metadata: skeleton確定値を正、LLM出力は参考情報
    // action_shape の主権は skeleton にある。LLM の self-reported shape は使わない。
    let decisionMetadata: DecisionMetadata | undefined;
    if (isHomeAlter && responseMode !== "clarify") {
      const framework = buildJudgmentFramework(personality, rawHomeContext ?? null, message);
      // 事前計算値（信頼できるソース）
      const fallbackMeta = computeFallbackDecisionMetadata(framework);
      let rawMeta: DecisionMetadata;
      if (homeDecisionMeta) {
        // LLM出力あり → 構造データは全て事前計算値で上書き
        // (LLMのラベル推定は不安定なため、構造データは事前計算を正とする)
        rawMeta = homeDecisionMeta;
        rawMeta.force_balance = fallbackMeta.force_balance;
        rawMeta.opportunity_value = fallbackMeta.opportunity_value;
        rawMeta.cost_load = fallbackMeta.cost_load;
        rawMeta.relation_value = fallbackMeta.relation_value;
      } else {
        rawMeta = fallbackMeta;
        console.info("[home-alter] Using fallback decision metadata");
      }

      // State Layer の protect/expand デルタを ForceBalance に適用
      // (心理的余力が低い → 守り圧UP / 感情負荷高い → 守り圧UP + 拡張圧DOWN)
      if (stateAdjustment && rawMeta.force_balance) {
        rawMeta.force_balance.protect_pressure = Math.min(1, Math.max(0,
          rawMeta.force_balance.protect_pressure + stateAdjustment.protect_pressure_delta));
        rawMeta.force_balance.expand_pressure = Math.min(1, Math.max(0,
          rawMeta.force_balance.expand_pressure + stateAdjustment.expand_pressure_delta));
      }

      // Wound Activation による protect_pressure ブースト
      // 傷が活性化しているとき、守り圧を引き上げて攻めすぎを防ぐ
      if (woundActivationResult && woundActivationResult.max_protect_boost > 0 && rawMeta.force_balance) {
        const prevProtect = rawMeta.force_balance.protect_pressure;
        rawMeta.force_balance.protect_pressure = Math.min(1,
          rawMeta.force_balance.protect_pressure + woundActivationResult.max_protect_boost);
        console.info(`[wound-activation] protect_pressure boosted: ${prevProtect.toFixed(2)} → ${rawMeta.force_balance.protect_pressure.toFixed(2)} (+${woundActivationResult.max_protect_boost.toFixed(2)})`);
      }

      // Financial Pressure による cost_load ブースト
      // 経済的に厳しい状況では、コスト負荷を引き上げて高コスト提案を抑制
      if (financialPressure && financialPressure.cost_load_boost > 0 && rawMeta.force_balance) {
        const prevCost = rawMeta.force_balance.cost_load;
        rawMeta.force_balance.cost_load = Math.min(1,
          rawMeta.force_balance.cost_load + financialPressure.cost_load_boost);
        console.info(`[financial-pressure] cost_load boosted: ${prevCost.toFixed(2)} → ${rawMeta.force_balance.cost_load.toFixed(2)} (+${financialPressure.cost_load_boost.toFixed(2)})`);
      }

      // action_shape は skeleton 確定値を正とする（LLM の self-reported shape を破棄）
      if (judgmentSkeleton) {
        const llmShape = rawMeta.action_shape;
        rawMeta.action_shape = judgmentSkeleton.action_shape;
        if (llmShape !== judgmentSkeleton.action_shape) {
          console.info(`[home-alter] Shape overridden: LLM=${llmShape} → skeleton=${judgmentSkeleton.action_shape}`);
        }
      }

      // 本文とメタデータの整合性チェック＋再整合（action_shape は変更しない）
      decisionMetadata = reconcileDecisionMetadata(alterResponseText, rawMeta);

      // reconcile 後も skeleton の action_shape を再適用（reconcile が上書きした場合を防ぐ）
      if (judgmentSkeleton && decisionMetadata.action_shape !== judgmentSkeleton.action_shape) {
        console.info(`[home-alter] Shape re-enforced after reconcile: ${decisionMetadata.action_shape} → ${judgmentSkeleton.action_shape}`);
        decisionMetadata.action_shape = judgmentSkeleton.action_shape;
        // stance も skeleton の shape から再導出
        const SHAPE_STANCE_MAP: Record<string, string> = {
          full_go: "go", bounded_go: "go", prepare_then_go: "wait",
          trial_then_decide: "go", observe_first: "wait",
          delegate_or_request: "go", defer_with_trigger: "no", skip: "no",
        };
        decisionMetadata.decision_stance = (SHAPE_STANCE_MAP[judgmentSkeleton.action_shape] ?? "wait") as DecisionMetadata["decision_stance"];
      }

      if (decisionMetadata.decision_stance !== rawMeta.decision_stance) {
        console.info(`[home-alter] Metadata reconciled: ${rawMeta.decision_stance} → ${decisionMetadata.decision_stance}`);
      }
    }

    // Home Alter: decisionMetadata を dialogue に追記 + analytics イベント発火
    if (isHomeAlter && decisionMetadata) {
      // emotional_context に decisionMetadata を追記（非同期、エラー無視）
      supabase
        .from("stargazer_alter_dialogues")
        .update({
          emotional_context: {
            source: "home",
            question: message,
            decision: {
              action_shape: decisionMetadata.action_shape,
              decision_stance: decisionMetadata.decision_stance,
              opportunity_value: decisionMetadata.opportunity_value,
              cost_load: decisionMetadata.cost_load,
              relation_value: decisionMetadata.relation_value,
              force_balance: decisionMetadata.force_balance,
            },
          },
        })
        .eq("user_id", userId)
        .eq("session_id", sessionId)
        .eq("role", "alter")
        .then(({ error }) => {
          if (error) console.warn("[home-alter] Failed to persist decisionMetadata:", error.message);
        });

      // analytics イベント（fire-and-forget）
      supabase
        .from("stargazer_analytics")
        .insert({
          user_id: userId,
          event: "home_alter_judgment",
          feature: "home_alter",
          metadata: {
            session_id: sessionId,
            action_shape: decisionMetadata.action_shape,
            decision_stance: decisionMetadata.decision_stance,
            opportunity_value: decisionMetadata.opportunity_value,
            cost_load: decisionMetadata.cost_load,
            relation_value: decisionMetadata.relation_value,
            growth_vector_override: decisionMetadata.growth_vector_override,
            energy_adjustment: decisionMetadata.energy_adjustment,
            regret_direction: decisionMetadata.regret_direction,
            // Ambiguity Engine metadata
            query_domain: queryContext?.domain,
            ambiguity_score: queryContext?.ambiguity_score,
            information_score: queryContext?.information?.score,
            information_signals: queryContext?.information ? {
              decision_target: queryContext.information.has_decision_target,
              context_reason: queryContext.information.has_context_reason,
              constraint_tradeoff: queryContext.information.has_constraint_or_tradeoff,
              time_signal: queryContext.information.has_time_signal,
              length_bucket: queryContext.information.input_length_bucket,
            } : undefined,
            response_mode: responseMode,
            mode_decision_reason: modeDecisionReason,
            mode_decision_version: "v4",
            // P1-C: リアクション分類結果
            reaction: detectedReaction ? {
              type: detectedReaction.type,
              disagree_strength: detectedReaction.disagree_strength ?? null,
              redirect_subtype: detectedReaction.redirect_subtype ?? null,
              confidence: detectedReaction.confidence,
            } : null,
            // Relational Lens metadata
            relational_lens: relationalLens ? {
              target_role: relationalLens.target_role,
              interaction_purpose: relationalLens.interaction_purpose,
              relational_temperature: relationalLens.relational_temperature,
              risk_direction: relationalLens.risk_direction,
              communication_register: relationalLens.communication_register,
              involves_other: relationalLens.involves_other,
            } : undefined,
            // 学習ループ用: フォローアップ傾向が判断に影響したか
            followup_insight_applied: !!followupInsight,
            question_category: questionCategory,
            // P0観測配線: P2（意味づける知能）のための記録
            p0_observation: {
              trust_level_discrete: p0DiscreteTrustLevel,
              trust_level_continuous: growthState?.trustLevel ?? 0,
              sessions_completed: growthState?.sessionsCompleted ?? 0,
              context_entries_loaded: p0ContextEntriesLoaded,
              question_type: questionType,
              is_emotional: questionType === "emotional",
              is_self_understanding: questionType === "self_understanding",
              validation_failures: p0ValidationFailures,
              used_fallback_metadata: !homeDecisionMeta,
            },
            // Layer 2: 判断骨格
            judgment_skeleton: judgmentSkeleton ? {
              action_shape: judgmentSkeleton.action_shape,
              primary_reason: judgmentSkeleton.primary_reason,
              confidence_level: judgmentSkeleton.confidence_level,
              growth_alignment: judgmentSkeleton.growth_alignment,
            } : undefined,
            // Layer 4: 品質検証結果
            quality_check: qualityCheck ? {
              pass: qualityCheck.pass,
              failures: qualityCheck.failures,
              generic_response_score: qualityCheck.generic_response_score,
            } : undefined,
            // Layer 5: 監査トレイル（完全版）
            audit_trail: auditTrail ?? undefined,
            // Phase 5: 不気味ライン検知結果
            creepiness_check: creepinessCheck ? {
              pass: creepinessCheck.pass,
              violation_count: creepinessCheck.violations.length,
              violations: creepinessCheck.violations.map(v => ({ type: v.type, severity: v.severity })),
            } : undefined,
            // Understanding System metadata
            user_state: userState ? {
              psychological_capacity: userState.psychological_capacity,
              emotional_load: userState.emotional_load,
              cognitive_fatigue: userState.cognitive_fatigue,
              estimation_basis: userState.estimation_basis,
            } : undefined,
            state_adjustment: stateAdjustment ? {
              protect_pressure_delta: stateAdjustment.protect_pressure_delta,
              expand_pressure_delta: stateAdjustment.expand_pressure_delta,
              simplify_response: stateAdjustment.simplify_response,
              prefer_conclude: stateAdjustment.prefer_conclude_over_clarify,
            } : undefined,
            micro_insight: microInsight ? {
              suggested_prompt: microInsight.suggested_prompt,
              presentation: microInsight.presentation_type,
              signal_count: microInsight.signals.length,
              convergence_score: microInsight.convergence_score?.combined,
              session_diversity: microInsight.convergence_score?.session_diversity,
              temporal_spread_days: microInsight.convergence_score?.temporal_spread_days,
              suppressed: insightSuppressedReason || undefined,
              presented: insightPresented,
            } : undefined,
            route_c_intent: selectedRouteCIntent ? {
              intent_id: selectedRouteCIntent.intent.id,
              intent_name: selectedRouteCIntent.intent.name,
              intent_layer: selectedRouteCIntent.intent.layer,
              effective_priority: selectedRouteCIntent.effective_priority,
            } : undefined,
            wound_activation: woundActivationResult?.most_active ? {
              wound_id: woundActivationResult.most_active.wound_id,
              theme: woundActivationResult.most_active.theme,
              score: Number(woundActivationResult.most_active.activation_score.toFixed(3)),
              level: woundActivationResult.most_active.level,
              suppressed_mi: woundActivationResult.should_suppress_mi,
              avoided_route_c: woundActivationResult.should_avoid_route_c,
              protect_boost: Number(woundActivationResult.max_protect_boost.toFixed(3)),
            } : undefined,
            financial_pressure: financialPressure && financialPressure.level !== "none" ? {
              score: Number(financialPressure.score.toFixed(3)),
              level: financialPressure.level,
              cost_load_boost: Number(financialPressure.cost_load_boost.toFixed(3)),
            } : undefined,
            context_modifier: contextualizedScores && contextualizedScores.modified_axes.length > 0 ? {
              domain: contextualizedScores.domain,
              modified_axes: contextualizedScores.modified_axes,
            } : undefined,
            // Phase 0: Gemini一次読解メトリクス
            utterance_reading: utteranceReading ? {
              latency_ms: utteranceReadingLatencyMs,
              surface_intent: utteranceReading.surface_intent.slice(0, 100),
              emotional_temperature: utteranceReading.emotional_temperature,
              energy_direction: utteranceReading.energy_direction,
              relational_target: utteranceReading.relational_context?.target_role ?? null,
              notable_expressions_count: utteranceReading.notable_expressions.length,
              implied_meanings_count: utteranceReading.implied_meanings.length,
              unspoken_candidates_count: utteranceReading.unspoken_candidates.length,
              phase: "A_active",
            } : utteranceReadingLatencyMs > 0 ? {
              latency_ms: utteranceReadingLatencyMs,
              phase: "failed",
            } : undefined,
          },
        })
        .then(({ error }) => {
          if (error) console.warn("[home-alter] Analytics insert failed:", error.message);
        });

      // ── Phase 2: Decision Pattern 蓄積 ──
      // ActionShape の分布をドメイン別に記録
      const domain = queryContext?.domain ?? "unknown";
      const patternKey = `decision_${domain}`;
      supabase.from("stargazer_alter_patterns")
        .select("id, observation_count, pattern_data, confidence")
        .eq("user_id", userId)
        .eq("pattern_type", "decision")
        .eq("pattern_key", patternKey)
        .single()
        .then(async ({ data: existing, error: fetchErr }) => {
          if (fetchErr && fetchErr.code !== "PGRST116") return; // PGRST116 = no rows
          try {
            const shape = decisionMetadata.action_shape;
            if (existing) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const pd = existing.pattern_data as any;
              const dist: Record<string, number> = pd?.shape_distribution ?? {};
              dist[shape] = (dist[shape] ?? 0) + 1;
              await supabase.from("stargazer_alter_patterns").update({
                observation_count: existing.observation_count + 1,
                pattern_data: { shape_distribution: dist },
                confidence: Math.min(0.9, 0.3 + existing.observation_count * 0.03),
                last_observed: new Date().toISOString(),
              }).eq("id", existing.id);
            } else {
              await supabase.from("stargazer_alter_patterns").insert({
                user_id: userId,
                pattern_type: "decision",
                pattern_key: patternKey,
                observation_count: 1,
                pattern_data: { shape_distribution: { [shape]: 1 } },
                confidence: 0.3,
                last_observed: new Date().toISOString(),
              });
            }
          } catch (innerErr) {
            console.warn("[pattern] Decision pattern save failed (non-fatal):", innerErr);
          }
        });

      // ── P5: Post-response ActionShape 偏差検出（P3 Section C の補完） ──
      // ActionShape が確定した後にベースラインとの比較を実行
      // 顕著なズレ（ユーザーの通常パターンと乖離する ActionShape 選択）を analytics に記録
      if (baselineDeviationsFull.length === 0 && alterSessionCount >= 5) {
        // ベースライン未検出 = P3 フェーズで decision_shift を検出できなかった可能性
        // post-response で ActionShape ベースの deviation を直接チェック
        try {
          const currentShape = decisionMetadata.action_shape;
          const { data: shapePatterns } = await supabase
            .from("stargazer_alter_patterns")
            .select("pattern_data, observation_count")
            .eq("user_id", userId)
            .eq("pattern_type", "decision")
            .eq("pattern_key", patternKey)
            .single();
          if (shapePatterns && shapePatterns.observation_count >= 5) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const dist: Record<string, number> = (shapePatterns.pattern_data as any)?.shape_distribution ?? {};
            const total = Object.values(dist).reduce((s, v) => s + v, 0);
            if (total > 0) {
              const currentShapeRatio = (dist[currentShape] ?? 0) / total;
              // このドメインで < 10% の出現率の ActionShape なら偏差と見做す
              if (currentShapeRatio < 0.1) {
                console.info(`[micro-insight] P5 post-response: Unusual ActionShape "${currentShape}" in ${domain} (ratio=${currentShapeRatio.toFixed(2)}, n=${total})`);
                supabase.from("stargazer_analytics").insert({
                  user_id: userId,
                  event: "home_alter_actionshape_deviation",
                  feature: "p5_post_response",
                  metadata: {
                    domain,
                    action_shape: currentShape,
                    usual_ratio: currentShapeRatio,
                    total_observations: total,
                    shape_distribution: dist,
                  },
                }).then(({ error }) => {
                  if (error) console.warn("[micro-insight] P5 ActionShape deviation save failed:", error.message);
                });
              }
            }
          }
        } catch {
          // non-fatal
        }
      }
    }

    // ── Phase 2: State Pattern 蓄積 ──
    // 時間帯別の心理状態平均を記録
    if (isHomeAlter && userState) {
      const hour = new Date().getHours();
      const timeBlock = hour < 6 ? "night" : hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
      supabase.from("stargazer_alter_patterns")
        .select("id, observation_count, pattern_data")
        .eq("user_id", userId)
        .eq("pattern_type", "state")
        .eq("pattern_key", "time_capacity")
        .single()
        .then(async ({ data: existing, error: fetchErr }) => {
          if (fetchErr && fetchErr.code !== "PGRST116") return;
          try {
            const state = userState!;
            if (existing) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const pd = existing.pattern_data as any;
              const blocks: Record<string, { avg_capacity: number; avg_load: number; avg_fatigue: number; sample_count: number }> = pd?.time_blocks ?? {};
              const block = blocks[timeBlock] ?? { avg_capacity: 0.5, avg_load: 0.3, avg_fatigue: 0.3, sample_count: 0 };
              const n = block.sample_count + 1;
              block.avg_capacity = (block.avg_capacity * (n - 1) + state.psychological_capacity) / n;
              block.avg_load = (block.avg_load * (n - 1) + state.emotional_load) / n;
              block.avg_fatigue = (block.avg_fatigue * (n - 1) + state.cognitive_fatigue) / n;
              block.sample_count = n;
              blocks[timeBlock] = block;
              await supabase.from("stargazer_alter_patterns").update({
                observation_count: existing.observation_count + 1,
                pattern_data: { time_blocks: blocks },
                last_observed: new Date().toISOString(),
              }).eq("id", existing.id);
            } else {
              await supabase.from("stargazer_alter_patterns").insert({
                user_id: userId,
                pattern_type: "state",
                pattern_key: "time_capacity",
                observation_count: 1,
                pattern_data: {
                  time_blocks: {
                    [timeBlock]: {
                      avg_capacity: state.psychological_capacity,
                      avg_load: state.emotional_load,
                      avg_fatigue: state.cognitive_fatigue,
                      sample_count: 1,
                    },
                  },
                },
                confidence: 0.3,
                last_observed: new Date().toISOString(),
              });
            }
          } catch (innerErr) {
            console.warn("[pattern] State pattern save failed (non-fatal):", innerErr);
          }
        });
    }

    // ── P3 Prep: emotional_baseline 蓄積 ──
    // ForceBalance の emotional_load を移動平均として記録（P3 ベースライン構築の材料）
    if (isHomeAlter && userState) {
      supabase.from("stargazer_alter_patterns")
        .select("id, observation_count, pattern_data")
        .eq("user_id", userId)
        .eq("pattern_type", "state")
        .eq("pattern_key", "emotional_baseline")
        .single()
        .then(async ({ data: existing, error: fetchErr }) => {
          if (fetchErr && fetchErr.code !== "PGRST116") return;
          try {
            const load = userState!.emotional_load;
            if (existing) {
              const pd = existing.pattern_data as any;
              const n = (pd?.sample_count ?? 0) + 1;
              const oldAvg = pd?.avg_emotional_load ?? 0.3;
              const oldVariance = pd?.variance ?? 0;
              const newAvg = (oldAvg * (n - 1) + load) / n;
              // Welford's online variance
              const delta = load - oldAvg;
              const delta2 = load - newAvg;
              const newVariance = n > 1 ? (oldVariance * (n - 2) + delta * delta2) / (n - 1) : 0;
              await supabase.from("stargazer_alter_patterns").update({
                observation_count: n,
                pattern_data: { avg_emotional_load: newAvg, variance: newVariance, sample_count: n },
                last_observed: new Date().toISOString(),
              }).eq("id", existing.id);
            } else {
              await supabase.from("stargazer_alter_patterns").insert({
                user_id: userId,
                pattern_type: "state",
                pattern_key: "emotional_baseline",
                observation_count: 1,
                pattern_data: { avg_emotional_load: load, variance: 0, sample_count: 1 },
                confidence: 0.2,
                last_observed: new Date().toISOString(),
              });
            }
          } catch { /* non-fatal */ }
        });
    }

    // ── P3 Prep: category_distribution 蓄積 ──
    // ユーザーが何について聞くかの分布（P3 ベースライン構築の材料）
    if (isHomeAlter && questionCategory) {
      supabase.from("stargazer_alter_patterns")
        .select("id, observation_count, pattern_data")
        .eq("user_id", userId)
        .eq("pattern_type", "decision")
        .eq("pattern_key", "category_distribution")
        .single()
        .then(async ({ data: existing, error: fetchErr }) => {
          if (fetchErr && fetchErr.code !== "PGRST116") return;
          try {
            if (existing) {
              const pd = existing.pattern_data as any;
              const dist: Record<string, number> = pd?.category_counts ?? {};
              dist[questionCategory] = (dist[questionCategory] ?? 0) + 1;
              await supabase.from("stargazer_alter_patterns").update({
                observation_count: existing.observation_count + 1,
                pattern_data: { category_counts: dist },
                last_observed: new Date().toISOString(),
              }).eq("id", existing.id);
            } else {
              await supabase.from("stargazer_alter_patterns").insert({
                user_id: userId,
                pattern_type: "decision",
                pattern_key: "category_distribution",
                observation_count: 1,
                pattern_data: { category_counts: { [questionCategory]: 1 } },
                confidence: 0.2,
                last_observed: new Date().toISOString(),
              });
            }
          } catch { /* non-fatal */ }
        });
    }

    // ── Phase 5: 継続的検証 — 精度指標の計測（fire-and-forget） ──
    if (isHomeAlter) {
      // 5-3 + 5-4: Trust 閾値調整 + MI 精度（reaction データから計測）
      supabase.from("stargazer_alter_reactions")
        .select("reaction, insight_type, signal_types")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50)
        .then(({ data: recentReactions }) => {
          if (!recentReactions || recentReactions.length < 5) return;

          try {
            // Trust Gate 閾値調整推奨
            const trustAdj = suggestTrustThresholdAdjustment(recentReactions);
            if (trustAdj.recommendation !== "maintain") {
              console.info(`[phase5-trust] Recommendation: ${trustAdj.recommendation} — ${trustAdj.reason}`);
            }

            // MI 精度指標
            const miMetrics = computeMIAccuracy(recentReactions as Array<{ reaction: string; insight_type: string; signal_types: string[] }>);
            if (miMetrics.signals_to_suppress.length > 0) {
              console.warn(`[phase5-mi] Signals to suppress (denied≥50%): ${miMetrics.signals_to_suppress.join(", ")}`);
            }

            // 精度指標を analytics に記録（定期スナップショット）
            supabase.from("stargazer_analytics").insert({
              user_id: userId,
              event: "phase5_accuracy_snapshot",
              feature: "continuous_verification",
              metadata: {
                trust_adjustment: trustAdj,
                mi_accuracy: {
                  acceptance_rate: miMetrics.acceptance_rate,
                  signals_to_suppress: miMetrics.signals_to_suppress,
                  total_presented: miMetrics.total_presented,
                },
              },
            }).then(({ error }) => {
              if (error) console.warn("[phase5] Accuracy snapshot save failed:", error.message);
            });
          } catch (e) {
            console.warn("[phase5] Accuracy metrics computation failed (non-fatal):", e);
          }
        });

      // 5-1: Judgment 精度（followup データから計測）
      supabase.from("stargazer_analytics")
        .select("metadata")
        .eq("user_id", userId)
        .eq("event", "home_alter_followup")
        .order("created_at", { ascending: false })
        .limit(30)
        .then(({ data: followupRows }) => {
          if (!followupRows || followupRows.length < 5) return;
          try {
            const metrics = computeJudgmentAccuracy(followupRows as Array<{ metadata: any }>);
            if (metrics.regret_rate > 0.3) {
              console.warn(`[phase5-judgment] High regret rate: ${(metrics.regret_rate * 100).toFixed(0)}%`);
            }
            if (metrics.execution_rate < 0.3) {
              console.info(`[phase5-judgment] Low execution rate: ${(metrics.execution_rate * 100).toFixed(0)}% — proposals may not match user needs`);
            }
          } catch (e) {
            console.warn("[phase5] Judgment accuracy computation failed (non-fatal):", e);
          }
        });

      // ── 5-5: 失敗罠の自動検知（fire-and-forget） ──
      // 6つの失敗パターン（監視・負荷・停滞・物語・固定化・投影）を一括スキャン
      // 結果は analytics に保存し、次回リクエストで参照して MI/RouteC/depth を制御
      Promise.all([
        supabase.from("stargazer_alter_reactions")
          .select("reaction, insight_type, signal_types")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase.from("stargazer_analytics")
          .select("metadata")
          .eq("user_id", userId)
          .eq("event", "home_alter_followup")
          .order("created_at", { ascending: false })
          .limit(30),
        supabase.from("stargazer_analytics")
          .select("metadata")
          .eq("user_id", userId)
          .in("event", ["home_alter_clarify", "home_alter_intent_used"])
          .order("created_at", { ascending: false })
          .limit(20),
        supabase.from("stargazer_alter_hypotheses")
          .select("status, confidence, last_observed")
          .eq("user_id", userId)
          .in("status", ["emerging", "strengthening", "stable"])
          .limit(30),
        supabase.from("stargazer_alter_context")
          .select("last_confirmed, possibly_stale, source, temporality")
          .eq("user_id", userId)
          .limit(50),
      ]).then(([reactionsRes, followupsRes, clarifyRes, hypothesesRes, contextRes]) => {
        try {
          const trapInput: TrapScanInput = {
            reactions: (reactionsRes.data ?? []) as TrapScanInput["reactions"],
            recentClarifyEvents: (clarifyRes.data ?? []).map((ev: any) => ({
              has_response: ev.metadata?.has_response !== false,
              clarify_type: ev.metadata?.clarify_type,
              intent_layer: ev.metadata?.intent_layer,
            })),
            followups: (followupsRes.data ?? []).map((ev: any) => ({
              executed: ev.metadata?.executed === true,
              satisfaction: ev.metadata?.satisfaction,
              skip_reason: ev.metadata?.skip_reason,
              domain: ev.metadata?.domain,
            })),
            hypotheses: (hypothesesRes.data ?? []) as TrapScanInput["hypotheses"],
            contextEntries: (contextRes.data ?? []) as TrapScanInput["contextEntries"],
            sessionCount: growthState?.sessionsCompleted ?? 0,
          };

          const trapResult = runTrapScan(trapInput);

          // 検知された罠をログ出力
          for (const trap of trapResult.traps) {
            if (trap.detected) {
              const prefix = trap.severity === "critical" ? "🔴" : "🟡";
              console.warn(`[trap-scan] ${prefix} ${trap.trap_type}: ${trap.severity} — ${trap.recommendation}`);
              for (const ind of trap.indicators.filter(i => i.breached)) {
                console.info(`  [indicator] ${ind.name} = ${ind.value.toFixed(2)} (threshold: ${ind.threshold})`);
              }
            }
          }

          if (trapResult.detected_count > 0) {
            console.info(`[trap-scan] Summary: ${trapResult.detected_count} trap(s) detected, ${trapResult.critical_count} critical`);
            if (trapResult.should_reduce_depth) console.warn("[trap-scan] → Action: reduce prompt depth");
            if (trapResult.should_suppress_mi) console.warn("[trap-scan] → Action: suppress Micro Insight");
            if (trapResult.should_suppress_route_c) console.warn("[trap-scan] → Action: suppress Route C");
          }

          // analytics に保存（次回リクエストで参照）
          supabase.from("stargazer_analytics").insert({
            user_id: userId,
            event: "phase5_trap_scan",
            feature: "continuous_verification",
            metadata: {
              detected_count: trapResult.detected_count,
              critical_count: trapResult.critical_count,
              should_reduce_depth: trapResult.should_reduce_depth,
              should_suppress_mi: trapResult.should_suppress_mi,
              should_suppress_route_c: trapResult.should_suppress_route_c,
              traps: trapResult.traps
                .filter(t => t.detected)
                .map(t => ({
                  type: t.trap_type,
                  severity: t.severity,
                  indicators: t.indicators.filter(i => i.breached).map(i => ({
                    name: i.name,
                    value: Number(i.value.toFixed(3)),
                    threshold: i.threshold,
                  })),
                  recommendation: t.recommendation,
                })),
            },
          }).then(({ error }) => {
            if (error) console.warn("[trap-scan] Analytics save failed:", error.message);
          });
        } catch (e) {
          console.warn("[trap-scan] Scan failed (non-fatal):", e);
        }
      });
    }

    // Wound Activation analytics（fire-and-forget）
    if (isHomeAlter && woundActivationResult && woundActivationResult.most_active) {
      supabase.from("stargazer_analytics").insert({
        user_id: userId,
        event: "wound_activation_scan",
        feature: "home_alter",
        metadata: {
          session_id: sessionId,
          most_active_wound: woundActivationResult.most_active.wound_id,
          most_active_theme: woundActivationResult.most_active.theme,
          most_active_score: Number(woundActivationResult.most_active.activation_score.toFixed(3)),
          most_active_level: woundActivationResult.most_active.level,
          total_activations: woundActivationResult.activations.length,
          suppressed_mi: woundActivationResult.should_suppress_mi,
          avoided_route_c: woundActivationResult.should_avoid_route_c,
          protect_boost: Number(woundActivationResult.max_protect_boost.toFixed(3)),
          signals: woundActivationResult.most_active.signals.map(s => ({
            source: s.source,
            intensity: Number(s.intensity.toFixed(3)),
          })),
        },
      }).then(({ error }) => {
        if (error) console.warn("[wound-activation] Analytics save failed:", error.message);
      });
    }

    // Clarify mode: analytics のみ発火（decisionMetadata は不要）
    if (isHomeAlter && responseMode === "clarify" && queryContext) {
      supabase
        .from("stargazer_analytics")
        .insert({
          user_id: userId,
          event: "home_alter_clarify",
          feature: "home_alter",
          metadata: {
            session_id: sessionId,
            query_domain: queryContext.domain,
            ambiguity_score: queryContext.ambiguity_score,
            information_score: queryContext.information?.score,
            critical_missing: queryContext.critical_missing,
            mode_decision_reason: modeDecisionReason,
            mode_decision_version: "v5",
            clarify_type: responseMode === "clarify" ? getClarifyType(modeDecisionReason as ModeDecisionReason) : undefined,
            // Intent Pool 追跡
            intent_id: selectedClarifyIntent?.intent.id ?? null,
            intent_name: selectedClarifyIntent?.intent.name ?? null,
            intent_layer: selectedClarifyIntent?.intent.layer ?? null,
            intent_priority: selectedClarifyIntent?.effective_priority ?? null,
            relational_lens: relationalLens ? {
              target_role: relationalLens.target_role,
              interaction_purpose: relationalLens.interaction_purpose,
              involves_other: relationalLens.involves_other,
            } : undefined,
            // Layer 5: 監査トレイル
            audit_trail: auditTrail ?? undefined,
          },
        })
        .then(({ error }) => {
          if (error) console.warn("[home-alter] Clarify analytics insert failed:", error.message);
        });

      // Intent Pool 使用履歴を記録（cooldown 制御に使用）
      if (selectedClarifyIntent) {
        supabase.from("stargazer_analytics").insert({
          user_id: userId,
          event: "home_alter_intent_used",
          feature: "intent_pool",
          metadata: {
            intent_id: selectedClarifyIntent.intent.id,
            intent_name: selectedClarifyIntent.intent.name,
            intent_layer: selectedClarifyIntent.intent.layer,
            route: "clarify",
            selection_reason: selectedClarifyIntent.selection_reason,
            effective_priority: selectedClarifyIntent.effective_priority,
          },
        }).then(({ error }) => {
          if (error) console.warn("[intent-pool] Usage tracking failed:", error.message);
        });
      }
    }

    // Route C intent 使用履歴を記録
    if (isHomeAlter && selectedRouteCIntent && responseMode !== "clarify") {
      supabase.from("stargazer_analytics").insert({
        user_id: userId,
        event: "home_alter_intent_used",
        feature: "intent_pool",
        metadata: {
          intent_id: selectedRouteCIntent.intent.id,
          intent_name: selectedRouteCIntent.intent.name,
          intent_layer: selectedRouteCIntent.intent.layer,
          route: "route_c",
          selection_reason: selectedRouteCIntent.selection_reason,
          effective_priority: selectedRouteCIntent.effective_priority,
        },
      }).then(({ error }) => {
        if (error) console.warn("[intent-pool] Route C usage tracking failed:", error.message);
      });
    }

    // Life Context extraction + evidence accumulation（fire-and-forget）
    // Phase 2: analytics 保存 + stargazer_alter_context への照合・蓄積
    if (isHomeAlter) {
      try {
        const lifeSignals = extractLifeContextSignals(message);
        const extendedSignals = extractExtendedContextSignals(message);

        // 既存コンテキストを全件取得（照合用 — lifeSignals/extendedSignals 両方で使用）
        let existingEntries: LifeContextEntry[] = [];
        if (lifeSignals.length > 0 || extendedSignals.length > 0) {
          const { data: existingContext } = await supabase
            .from("stargazer_alter_context")
            .select("id, category, content, source, temporality, confidence, evidence_count, last_confirmed, possibly_stale")
            .eq("user_id", userId);
          existingEntries = (existingContext ?? []) as LifeContextEntry[];
        }

        if (lifeSignals.length > 0) {

          for (const signal of lifeSignals) {
            // analytics テーブル（既存: 計測用）
            supabase.from("stargazer_analytics").insert({
              user_id: userId,
              event: "home_alter_life_context",
              feature: "life_context",
              metadata: { session_id: sessionId, ...signal },
            }).then(({ error }) => {
              if (error) console.warn("[life-context] Failed to save to analytics:", error.message);
            });

            // stargazer_alter_context テーブル（Phase 2: 照合+蓄積）
            if (signal.content) {
              const match = existingEntries.find(e => {
                const result = matchContextEntry(e, signal);
                return result === "update" || result === "contradiction";
              });

              if (match) {
                const matchResult = matchContextEntry(match, signal);
                if (matchResult === "update") {
                  // evidence 蓄積: count++, confidence up, last_confirmed 更新
                  supabase.from("stargazer_alter_context").update({
                    evidence_count: match.evidence_count + 1,
                    confidence: updatedConfidence(match.confidence, match.evidence_count),
                    last_confirmed: new Date().toISOString(),
                    possibly_stale: false,
                  }).eq("id", match.id).then(({ error }) => {
                    if (error) console.warn("[life-context] Evidence update failed:", error.message);
                    else console.info(`[life-context] Evidence accumulated: "${match.content}" (count=${match.evidence_count + 1})`);
                  });
                } else if (matchResult === "contradiction") {
                  // 矛盾: 既存を contradicted に変更 + 新規挿入
                  supabase.from("stargazer_alter_context").update({
                    source: "contradicted",
                  }).eq("id", match.id).then(({ error }) => {
                    if (error) console.warn("[life-context] Contradiction mark failed:", error.message);
                    else console.info(`[life-context] Contradiction detected: "${match.content}" → "${signal.content}"`);
                  });
                  supabase.from("stargazer_alter_context").insert({
                    user_id: userId,
                    category: signal.category ?? "environment",
                    content: signal.content,
                    source: signal.source ?? "user_implied",
                    temporality: signal.temporality ?? "situational",
                    confidence: signal.confidence ?? 0.5,
                    evidence_count: 1,
                    last_confirmed: new Date().toISOString(),
                  }).then(({ error }) => {
                    if (error) console.warn("[life-context] New context insert after contradiction failed:", error.message);
                  });
                  // 矛盾を analytics に記録
                  supabase.from("stargazer_analytics").insert({
                    user_id: userId,
                    event: "life_context_contradiction",
                    feature: "life_context",
                    metadata: {
                      old_content: match.content,
                      new_content: signal.content,
                      category: signal.category,
                    },
                  }).then(({ error }) => {
                    if (error) console.warn("[life-context] Contradiction analytics failed:", error.message);
                  });
                }
              } else {
                // 新規: そのまま挿入
                supabase.from("stargazer_alter_context").insert({
                  user_id: userId,
                  category: signal.category ?? "environment",
                  content: signal.content,
                  source: signal.source ?? "user_implied",
                  temporality: signal.temporality ?? "situational",
                  confidence: signal.confidence ?? 0.5,
                  evidence_count: 1,
                  last_confirmed: new Date().toISOString(),
                }).then(({ error }) => {
                  if (error) console.warn("[life-context] New context insert failed:", error.message);
                });
              }
            }
          }
          console.info(`[life-context] ${lifeSignals.length} signal(s) processed: ${lifeSignals.map(s => s.category ?? "unknown").join(", ")}`);
        }

        // Phase 3: 拡張環境パターンの抽出（仕事・健康・ライフイベント）
        if (extendedSignals.length > 0) {
          for (const signal of extendedSignals) {
            if (!signal.content) continue;
            const match = existingEntries.find(e => {
              const result = matchContextEntry(e, signal);
              return result === "update";
            });
            if (match) {
              supabase.from("stargazer_alter_context").update({
                evidence_count: match.evidence_count + 1,
                confidence: updatedConfidence(match.confidence, match.evidence_count),
                last_confirmed: new Date().toISOString(),
                possibly_stale: false,
              }).eq("id", match.id).then(({ error }) => {
                if (error) console.warn("[life-context-ext] Evidence update failed:", error.message);
              });
            } else {
              supabase.from("stargazer_alter_context").insert({
                user_id: userId,
                category: signal.category ?? "environment",
                content: signal.content,
                source: signal.source ?? "user_implied",
                temporality: signal.temporality ?? "situational",
                confidence: signal.confidence ?? 0.5,
                evidence_count: 1,
                last_confirmed: new Date().toISOString(),
              }).then(({ error }) => {
                if (error) console.warn("[life-context-ext] Insert failed:", error.message);
              });
            }
          }
          console.info(`[life-context-ext] ${extendedSignals.length} extended signal(s): ${extendedSignals.map(s => s.content).join(", ")}`);
        }

        // Phase 3: 人物マップ蓄積
        const personMentions = extractPersonMentions(message);
        if (personMentions.length > 0) {
          for (const mention of personMentions) {
            supabase.from("stargazer_alter_person_map")
              .select("id, mention_count, sentiment_trend, last_sentiment, role")
              .eq("user_id", userId)
              .eq("label", mention.label)
              .single()
              .then(async ({ data: existing, error: fetchErr }) => {
                if (fetchErr && fetchErr.code !== "PGRST116") return;
                try {
                  if (existing) {
                    const newTrend = updateSentimentTrend(
                      (existing.sentiment_trend as "improving" | "stable" | "declining" | null),
                      (existing.last_sentiment as "positive" | "negative" | "mixed" | "neutral" | null),
                      mention.sentiment,
                    );
                    const newInfluence = computeInfluenceScore(
                      existing.mention_count + 1,
                      mention.role,
                      mention.sentiment,
                    );
                    await supabase.from("stargazer_alter_person_map").update({
                      mention_count: existing.mention_count + 1,
                      sentiment_trend: newTrend,
                      last_sentiment: mention.sentiment,
                      influence_score: newInfluence,
                      last_mentioned: new Date().toISOString(),
                    }).eq("id", existing.id);
                  } else {
                    const influence = computeInfluenceScore(1, mention.role, mention.sentiment);
                    await supabase.from("stargazer_alter_person_map").insert({
                      user_id: userId,
                      label: mention.label,
                      role: mention.role,
                      sentiment_trend: "stable",
                      mention_count: 1,
                      influence_score: influence,
                      last_sentiment: mention.sentiment,
                      last_mentioned: new Date().toISOString(),
                    });
                  }
                } catch (innerErr) {
                  console.warn("[person-map] Save failed (non-fatal):", innerErr);
                }
              });
          }
          console.info(`[person-map] ${personMentions.length} person mention(s): ${personMentions.map(m => `${m.label}(${m.sentiment})`).join(", ")}`);
        }

        // Phase 4: user_narrative の抽出・保存
        const narratives = extractUserNarratives(message);
        if (narratives.length > 0) {
          for (const n of narratives) {
            supabase.from("stargazer_alter_narratives")
              .select("id, mention_count")
              .eq("user_id", userId)
              .eq("theme", n.theme)
              .maybeSingle()
              .then(async ({ data: existing }) => {
                try {
                  if (existing) {
                    await supabase.from("stargazer_alter_narratives").update({
                      mention_count: existing.mention_count + 1,
                      last_mentioned: new Date().toISOString(),
                      content: n.content, // 最新の表現で更新
                    }).eq("id", existing.id);
                  } else {
                    await supabase.from("stargazer_alter_narratives").insert({
                      user_id: userId,
                      theme: n.theme,
                      content: n.content,
                      domain: n.domain,
                      mention_count: 1,
                    });
                  }
                } catch (e) {
                  console.warn("[narrative] Save failed (non-fatal):", e);
                }
              });
          }
          console.info(`[narrative] ${narratives.length} narrative(s): ${narratives.map(n => n.theme).join(", ")}`);
        }

        // Phase 4: 仮説導出 + Cross-Context パターン検出 + P2: 反証ループ
        // Decision Pattern が十分蓄積された時点で仮説を生成・更新・弱体化
        supabase.from("stargazer_alter_patterns")
          .select("pattern_key, pattern_data, observation_count, confidence")
          .eq("user_id", userId)
          .eq("pattern_type", "decision")
          .gte("observation_count", 5)
          .then(async ({ data: decisionPatterns }) => {
            try {
              if (!decisionPatterns || decisionPatterns.length === 0) return;

              // 4-3: 反復パターン仮説の導出
              const recurringHypotheses = deriveRecurringPatternHypotheses(decisionPatterns);

              // 4-4: Cross-Context パターン検出 → 仮説化
              const crossPatterns = detectCrossContextPatterns(decisionPatterns);
              const crossHypotheses = crossContextToHypotheses(crossPatterns);

              // P2: growth_signal 仮説の導出（パターン変化検出）
              // 前回のスナップショットを patterns テーブルから取得
              let previousSnapshot: Record<string, { goRatio: number; total: number }> | null = null;
              try {
                const { data: snapshotData } = await supabase
                  .from("stargazer_alter_patterns")
                  .select("pattern_data")
                  .eq("user_id", userId)
                  .eq("pattern_type", "decision")
                  .eq("pattern_key", "growth_snapshot")
                  .single();
                if (snapshotData) {
                  previousSnapshot = (snapshotData.pattern_data as any)?.domain_ratios ?? null;
                }
              } catch { /* no snapshot yet */ }

              const growthHypotheses = deriveGrowthSignalHypotheses(decisionPatterns, previousSnapshot);

              // 現在のスナップショットを保存（次回比較用）
              const currentSnapshot: Record<string, { goRatio: number; total: number }> = {};
              for (const p of decisionPatterns) {
                const dist = (p.pattern_data as any)?.shape_distribution;
                if (!dist) continue;
                const domain = p.pattern_key.replace("decision_", "");
                const goBuckets = ["full_go", "bounded_go", "trial_then_decide"];
                const waitBuckets = ["observe_first", "skip", "defer_with_trigger"];
                const goCount = goBuckets.reduce((s, k) => s + (dist[k] ?? 0), 0);
                const waitCount = waitBuckets.reduce((s, k) => s + (dist[k] ?? 0), 0);
                const total = goCount + waitCount;
                if (total > 0) currentSnapshot[domain] = { goRatio: goCount / total, total };
              }
              if (Object.keys(currentSnapshot).length > 0) {
                supabase.from("stargazer_alter_patterns")
                  .upsert({
                    user_id: userId,
                    pattern_type: "decision",
                    pattern_key: "growth_snapshot",
                    observation_count: 1,
                    pattern_data: { domain_ratios: currentSnapshot },
                    confidence: 0.5,
                    last_observed: new Date().toISOString(),
                  }, { onConflict: "user_id,pattern_type,pattern_key" })
                  .then(({ error }) => {
                    if (error) console.warn("[growth] Snapshot save failed:", error.message);
                  });
              }

              const allNewHypotheses = [...recurringHypotheses, ...crossHypotheses, ...growthHypotheses];
              if (allNewHypotheses.length === 0) return;

              // 既存仮説を取得（全タイプ — P2: contradiction_pattern, growth_signal も含む）
              const { data: existingHypotheses } = await supabase
                .from("stargazer_alter_hypotheses")
                .select("*")
                .eq("user_id", userId);

              for (const newH of allNewHypotheses) {
                const existing = (existingHypotheses ?? []).find(
                  (e: any) => e.hypothesis_type === newH.hypothesis_type && e.content === newH.content
                );

                if (existing) {
                  // 既存仮説を更新（成長段階追跡）
                  const { newStatus, newConfidence, growthSignal } = updateHypothesisStatus(
                    existing as AlterHypothesis,
                    { confidence: newH.confidence, evidence_count: newH.evidence_count },
                  );
                  await supabase.from("stargazer_alter_hypotheses").update({
                    status: newStatus,
                    confidence: newConfidence,
                    evidence_count: (existing as any).evidence_count + newH.evidence_count,
                    evidence_summary: newH.evidence_summary,
                    last_evaluated: new Date().toISOString(),
                  }).eq("id", (existing as any).id);

                  if (growthSignal) {
                    console.info(`[growth] ${growthSignal.type}: ${growthSignal.description}`);
                  }
                } else {
                  // 新規仮説を挿入
                  await supabase.from("stargazer_alter_hypotheses").insert({
                    user_id: userId,
                    ...newH,
                  });
                  console.info(`[hypothesis] New: ${newH.hypothesis_type} — ${newH.content}`);
                }
              }

              // P2: 矛盾ベースの仮説弱体化ループ
              // 生活文脈の矛盾 + メッセージ内容から既存仮説との矛盾を検出
              if (existingHypotheses && existingHypotheses.length > 0) {
                // 矛盾検出: life context contradictions は lifeSignals 処理で発生
                const contextContradictions: Array<{ category: string; old_content: string; new_content: string }> = [];
                for (const signal of lifeSignals) {
                  if (!signal.content) continue;
                  const match = existingEntries.find(e => matchContextEntry(e, signal) === "contradiction");
                  if (match) {
                    contextContradictions.push({
                      category: signal.category ?? "general",
                      old_content: match.content,
                      new_content: signal.content,
                    });
                  }
                }

                const contradicted = detectHypothesisContradictions(
                  existingHypotheses as AlterHypothesis[],
                  message,
                  contextContradictions,
                );

                for (const { hypothesis, reason } of contradicted) {
                  // 仮説を弱体化（confidence を下げ、status を weakening に）
                  const weakenedConfidence = Math.max(0.1, hypothesis.confidence * 0.6);
                  const weakenedStatus = hypothesis.status === "emerging" ? "retired" : "weakening";
                  await supabase.from("stargazer_alter_hypotheses").update({
                    status: weakenedStatus,
                    confidence: weakenedConfidence,
                    last_evaluated: new Date().toISOString(),
                    evidence_summary: `${hypothesis.evidence_summary} [反証: ${reason}]`,
                  }).eq("id", hypothesis.id);
                  console.info(`[hypothesis] Weakened: ${hypothesis.content} (reason: ${reason})`);
                }

                // P2: 矛盾パターン仮説の導出
                if (contextContradictions.length > 0) {
                  const contradictionHypotheses = deriveContradictionHypotheses(
                    contextContradictions.map(c => ({ ...c, domain: c.category })),
                  );
                  for (const ch of contradictionHypotheses) {
                    const existingCH = (existingHypotheses ?? []).find(
                      (e: any) => e.hypothesis_type === "contradiction_pattern" && e.content === ch.content
                    );
                    if (existingCH) {
                      await supabase.from("stargazer_alter_hypotheses").update({
                        evidence_count: (existingCH as any).evidence_count + ch.evidence_count,
                        confidence: Math.min(0.8, (existingCH as any).confidence + 0.1),
                        evidence_summary: ch.evidence_summary,
                        last_evaluated: new Date().toISOString(),
                      }).eq("id", (existingCH as any).id);
                    } else {
                      await supabase.from("stargazer_alter_hypotheses").insert({
                        user_id: userId,
                        ...ch,
                        last_evaluated: new Date().toISOString(),
                      });
                      console.info(`[hypothesis] New contradiction: ${ch.content}`);
                    }
                  }
                }
              }
            } catch (e) {
              console.warn("[hypothesis] Derivation failed (non-fatal):", e);
            }
          });

      } catch { /* Non-fatal */ }
    }

    // response_id: フィードバック紐付け用の一意識別子
    const responseId = `resp-${sessionId}-${Date.now()}`;

    return NextResponse.json({
      ok: true,
      sessionId,
      responseId,
      mode,
      response: alterResponseText,
      personality,
      depth: conversationDepth + 2,
      ...(isBetaTester ? { isBetaTester: true } : {}),
      ...(reasoningBasis ? { reasoningBasis } : {}),
      ...(decisionMetadata ? { decisionMetadata } : {}),
      ...(queryContext ? {
        queryContext: {
          domain: queryContext.domain,
          ambiguity_score: queryContext.ambiguity_score,
          information_score: queryContext.information?.score,
          response_mode: responseMode,
          mode_decision_reason: modeDecisionReason,
          mode_decision_version: "v4",
          reaction: detectedReaction ? { type: detectedReaction.type, disagree_strength: detectedReaction.disagree_strength, redirect_subtype: detectedReaction.redirect_subtype } : undefined,
          relational_lens: relationalLens ?? undefined,
          judgment_skeleton: judgmentSkeleton ? {
            action_shape: judgmentSkeleton.action_shape,
            primary_reason: judgmentSkeleton.primary_reason,
            confidence_level: judgmentSkeleton.confidence_level,
          } : undefined,
          quality_check: qualityCheck ? {
            pass: qualityCheck.pass,
            generic_response_score: qualityCheck.generic_response_score,
          } : undefined,
          creepiness_check: creepinessCheck ? {
            pass: creepinessCheck.pass,
            violation_count: creepinessCheck.violations.length,
          } : undefined,
        },
      } : {}),
      // フィードバック用メタデータ（クライアントがfeedback APIに渡す）
      feedbackMeta: {
        domain: queryContext?.domain ?? null,
        response_mode: responseMode,
        has_mi: insightPresented,
        has_probe: !!(judgmentSkeleton as any)?.deepening_probe,
        has_gemini_reading: !!utteranceReading,
        reading_latency_ms: utteranceReadingLatencyMs > 0 ? utteranceReadingLatencyMs : null,
        safety_summary: {
          creepiness_pass: creepinessCheck?.pass ?? null,
          mi_gate_pass: !insightSuppressedReason,
          quality_pass: qualityCheck?.pass ?? null,
        },
      },
    });
  } catch (error) {
    console.error("Failed to process alter message:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
