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
} from "@/lib/stargazer/alterHomeAdapter";
import { runAI } from "@/lib/ai";
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

    // ━━━━ Daily rally limit (3 per day, JST reset) ━━━━
    if (isHomeAlter) {
      const jstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
      const todayJST = jstNow.toISOString().slice(0, 10); // "YYYY-MM-DD"
      // JST 0:00 = UTC 15:00 previous day
      const jstDayStartUTC = new Date(`${todayJST}T00:00:00+09:00`).toISOString();

      const { count: todayAlterCount, error: countErr } = await supabase
        .from("stargazer_alter_dialogues")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("role", "alter")
        .gte("created_at", jstDayStartUTC);

      if (!countErr && (todayAlterCount ?? 0) >= 3) {
        return NextResponse.json(
          { error: "daily_limit_reached", remaining: 0 },
          { status: 429 },
        );
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
    const personality = buildAlterPersonality(alterInput);

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
    let questionCategory: QuestionCategory | null = null;
    let followupInsight = "";
    // 5層品質防御
    let lensDetailed: RelationalLensDetailed | null = null;
    let inputUnderstanding: InputUnderstanding | null = null;
    let judgmentSkeleton: JudgmentSkeleton | null = null;
    let qualityCheck: ConsistencyCheck | null = null;
    let auditTrail: AuditTrail | null = null;

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
            "あなたは Alter（ユーザーの内側にいるもう一人の自分）です。",
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

      relationalLens = extractRelationalLens(message);
      const modeDecision = selectResponseModeWithReason(queryContext, relationalLens);
      responseMode = modeDecision.mode;
      modeDecisionReason = modeDecision.reason;

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
      const lastAlterMsg = conversationHistory.length > 0
        ? conversationHistory[conversationHistory.length - 1]
        : null;
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

      const domainOverlay = buildDomainOverlay(personality, queryContext.domain);

      // ── Layer 1: 入力理解 + RelationalLens v2 ──
      lensDetailed = enrichRelationalLens(relationalLens, message);
      inputUnderstanding = extractInputUnderstanding(message, queryContext, relationalLens);

      // ── Layer 2: 判断骨格 ──
      const framework = buildJudgmentFramework(personality, rawHomeContext ?? null, message);
      judgmentSkeleton = buildJudgmentSkeleton(
        framework, queryContext, relationalLens, inputUnderstanding, responseMode,
      );

      console.info(`[home-alter] domain=${queryContext.domain}(${queryContext.domain_confidence.toFixed(2)}) ambiguity=${queryContext.ambiguity_score.toFixed(2)} info=${queryContext.information.score.toFixed(2)} mode=${responseMode} reason=${modeDecisionReason} role=${relationalLens?.target_role ?? "?"} purpose=${relationalLens?.interaction_purpose ?? "?"} temp=${relationalLens?.relational_temperature ?? "?"} risk=${relationalLens?.risk_direction ?? "?"} register=${relationalLens?.communication_register ?? "?"} shape=${judgmentSkeleton.action_shape} conf=${judgmentSkeleton.confidence_level}`);

      // 固有データをカテゴリ別に ranked（ドメインオーバーレイ統合版）
      const personalizedFacts = buildPersonalizedFactsWithDomain(
        personality, rawHomeContext ?? null, questionCategory, domainOverlay,
      );
      const expectedKeywords = extractExpectedKeywords(personalizedFacts);

      // ── Layer 3: 骨格制約付きプロンプト構築 ──
      let homeSystemPrompt = buildHomeAlterPromptWithContext(
        personality, rawHomeContext ?? null, questionCategory, message,
        responseMode, queryContext, domainOverlay, userName, relationalLens,
        judgmentSkeleton,
      );

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
          temperature: responseMode === "clarify" ? 0.3 : 0.6,
          maxOutputTokens: responseMode === "clarify" ? 512 : responseMode === "branch" ? 3072 : 2048,
          userId: userId,
          metadata: makeStargazerRunMetadata({
            feature: "alter",
            mode: "warm",
            turnNumber: conversationHistory.length,
            skipCache: true,
          }),
        });
        if (aiResult.success && aiResult.text?.trim()) {
          if (responseMode === "clarify") {
            // clarify モードはメタデータなし
            homeResponse = aiResult.text.trim();
          } else {
            const { responseText: stripped, metadata: meta } = parseDecisionMetadata(aiResult.text);
            homeResponse = formatHomeAlterResponse(stripped, userName);
            if (meta) homeDecisionMeta = meta;
          }
        }
      } catch (e) {
        console.warn("[home-alter] First attempt failed:", e);
      }

      // 検査（モード別バリデーション）
      const validation = homeResponse
        ? validateHomeAlterResponseWithMode(homeResponse, message, expectedKeywords, responseMode)
        : { pass: false, failures: ["応答の生成に失敗"] };

      // 不合格なら再生成（facts を明示して再試行）— clarify は再生成しない
      if (!validation.pass && homeResponse && responseMode !== "clarify") {
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

      // フォールバック: LLM 生成が失敗した場合、JudgmentFramework から文脈を活かす
      if (!homeResponse) {
        try {
          const identity = framework.identityFit.split("。")[0] ?? "";
          const growth = framework.growthVector.split("。")[0] ?? "";
          const namePrefix = userName ? `${userName}さん、` : "";
          homeResponse = `${namePrefix}${identity}。${growth}。\n次の一手: その方向で、今日ひとつだけ小さく試してみるのがよさそうです。`;
        } catch {
          // フォールバック生成も失敗した場合はデフォルトメッセージ
        }
      }
      alterResponseText = homeResponse || "判断に必要なデータを確認中です。もう少し観測を重ねると精度が上がります。";

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
            previousSkeleton: null, // TODO: 前回セッションの skeleton を取得する場合はここに渡す
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
          ...(isHomeAlter ? { emotional_context: { source: "home", question: message } } : {}),
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
          observe_first: "wait", defer_with_trigger: "no", skip: "no",
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
          },
        })
        .then(({ error }) => {
          if (error) console.warn("[home-alter] Analytics insert failed:", error.message);
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
            mode_decision_version: "v4",
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
    }

    return NextResponse.json({
      ok: true,
      sessionId,
      mode,
      response: alterResponseText,
      personality,
      depth: conversationDepth + 2,
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
        },
      } : {}),
    });
  } catch (error) {
    console.error("Failed to process alter message:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
