"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { recordObservation } from "@/lib/stargazer/retentionHooks";
import type {
  ObservationTheme,
  ObservationAnswer,
  DayContext,
  ChoiceValue,
  ExtendedObservationRecord,
  MicroStargazerAnswer,
  MicroStargazerProgress,
} from "@/lib/aneurasync/dailyObservation";
import {
  loadObservation,
  saveObservation,
  loadRecentObservations,
} from "@/lib/aneurasync/dailyObservation";
import {
  loadMicroProgress,
  saveMicroAnswer,
  saveMicroProgress,
} from "@/lib/aneurasync/microStargazer";
import type { QuestionVariant } from "@/lib/stargazer/questionVariants";
import {
  getDrillQuestions,
  classifyTendency,
  determineDrillDepth,
  compileDrillResult,
  type DrillQuestion,
  type DrillStep,
} from "@/lib/shared/deepDrill";
import {
  saveToStargazer,
  mergeFreeChatDeltas,
  type BridgeableAnswer,
} from "@/lib/aneurasync/observationBridge";
import {
  isObservationCategory,
  CATEGORY_LABELS,
  getCategoryQuestion,
  type CategoryQuestion,
  type AxisMapping,
  type ConversationCategory,
} from "@/lib/aneurasync/conversationCategories";
import {
  selectNextQuestion,
  createSessionState,
  saveSessionState,
  loadSessionState,
  shouldBridgeToStargazer,
  shouldInsertSummary,
  getTimeAwareGreeting,
  generateSessionSummary,
  type EndlessSessionState,
  type EndlessQuestion,
  type EndlessQuestionKind,
  type ContextSetupQuestion,
} from "@/lib/aneurasync/endlessQuestionEngine";
import {
  recordFootprint,
  captureAnswerFootprints,
  captureSessionFootprints,
  type FootprintSignal,
} from "@/lib/stargazer/footprintCollector";
import {
  footprintsToSignalRows,
  createRevisionSignal,
  createSessionDurationSignal,
  createTimeOfDaySignal,
  syncBehavioralSignals,
  type BehavioralSignalRow,
} from "@/lib/stargazer/behavioralSignalSync";
import {
  generateMetaObservationQuestions,
  interpretMetaObservation,
  predictResonanceCascade,
  type MetaObservationInsight,
} from "@/lib/stargazer/innovativeMechanisms";
import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";
import {
  generateCompletionInsight,
  generateTemporalGreeting,
  type ObservationCompletionInsight,
} from "@/lib/stargazer/dailyInsightEngine";
import {
  recordSessionAnswer,
  clearSessionMemory,
  generateContextualReaction,
  checkMidSessionInsight,
  compareToPast,
  type SessionAnswer,
  type MidSessionInsight,
} from "@/lib/aneurasync/sessionIntelligence";
import {
  generateCrossSessionNarrative,
  getCrossSessionGreetingLine,
  type CrossSessionInsight,
} from "@/lib/aneurasync/crossSessionNarrative";
import {
  getRelationshipStage,
  getStageGreeting,
  getStageClosing,
  getIdleExpression,
  getAnswerExpression,
  getQuestionIntro,
  detectAvoidedCategory,
  type RelationshipStage as RStage,
  type RobotExpression,
} from "@/lib/aneurasync/relationshipStage";
import {
  generateLivingReaction,
  generateEnhancedReaction,
  countConsecutiveSameScore,
  type LivingReaction,
} from "@/lib/aneurasync/livingReactions";
import { getQuestionText } from "@/lib/aneurasync/conversationCategories";
import {
  generateShadowWhisper,
  buildAlterPersonality,
  type AlterPersonality,
  type WhisperSignal,
} from "@/lib/stargazer/alter";
import { resolveArchetype } from "@/lib/stargazer/archetypeResolver";
import { ARCHETYPE_DEFS } from "@/lib/stargazer/archetypeTypes";
import { TRAIT_AXES } from "@/lib/stargazer/traitAxes";
import { trackWhisperShown, trackWhisperClicked } from "@/lib/stargazer/trackClient";
import RobotAvatar from "./RobotAvatar";

/* ═══════════════════════════════════════════════
   Helpers — derive depth level from session count
   ═══════════════════════════════════════════════ */
function deriveDepthLevel(mp: MicroStargazerProgress): number {
  return Math.min(6, Math.floor(mp.totalSessions / 2) + 1);
}

/* ═══════════════════════════════════════════════
   Helpers — derive axis scores from micro progress
   ═══════════════════════════════════════════════ */
function deriveAxisScores(
  mp: MicroStargazerProgress,
): Partial<Record<TraitAxisKey, number>> {
  const scores: Partial<Record<TraitAxisKey, number>> = {};
  for (const [axisId, progress] of Object.entries(mp.axes)) {
    if (!progress || progress.answers.length === 0) continue;
    const avg =
      progress.answers.reduce((sum, a) => sum + a.score, 0) /
      progress.answers.length;
    scores[axisId as TraitAxisKey] = avg;
  }
  return scores;
}

/* phantom choice threshold (ms) */
const PHANTOM_THRESHOLD_MS = 5000;

/* ═══════════════════════════════════════════════
   Design Tokens
   ═══════════════════════════════════════════════ */
const C = {
  s1: "#ffffff",
  s2: "#f0f2fa",
  s3: "#e4e7f3",
  sync: "#3B82F6",
  neural: "#7C3AED",
  pulse: "#EC4899",
  t1: "#1a1a2e",
  t2: "#4a4a68",
  t3: "#6b7094",
  t4: "#9da2b8",
};
const mono = "'JetBrains Mono','SF Mono',monospace";

/* ═══════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════ */
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function defaultDayContext(): DayContext {
  return { hadEvents: false, hadDate: false, hadPeople: false, usedOutfit: true, eventTypes: [], hasOutfitToday: false };
}

/**
 * calendar_outfits テーブルから今日の着用記録を確認し、
 * DayContext.hasOutfitToday を更新する。
 * テーブル未作成やクエリ失敗時は false のままフォールバック。
 */
async function checkOutfitToday(): Promise<boolean> {
  try {
    const { supabaseBrowser } = await import("@/lib/supabase/client");
    const supabase = supabaseBrowser();

    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return false;

    const today = new Date().toISOString().split("T")[0];
    const { data, error } = await supabase
      .from("calendar_outfits")
      .select("id")
      .eq("user_id", auth.user.id)
      .eq("date", today)
      .maybeSingle();

    if (error) {
      // テーブルが存在しない場合等も含め、静かにフォールバック
      return false;
    }
    return !!data;
  } catch {
    return false;
  }
}

/* ═══════════════════════════════════════════════
   Conversation Step Model
   ═══════════════════════════════════════════════ */
type ConversationStep =
  | { type: "robot"; text: string; key: string }
  | { type: "categoryQuestion"; catQ: CategoryQuestion; key: string }
  | { type: "answer"; label: string; key: string }
  | { type: "followUp"; question: string; options: string[]; questionId: string; key: string }
  | { type: "transition"; text: string; key: string }
  | { type: "microQuestion"; variant: QuestionVariant; key: string }
  | { type: "microAnswer"; label: string; key: string }
  | { type: "drillQuestion"; drill: DrillQuestion; questionId: string; key: string }
  | { type: "drillAnswer"; label: string; key: string }
  | { type: "closing"; text: string; key: string }
  | { type: "summary"; text: string; key: string }
  | { type: "stopButton"; key: string }
  | {
      type: "metaObservation";
      prompt: string;
      options: { id: string; label: string; reactionType: MetaObservationInsight["reactionType"] }[];
      targetAxis: TraitAxisKey;
      key: string;
    }
  | { type: "metaInsight"; text: string; key: string }
  | { type: "freeTextInput"; key: string };

/* ═══════════════════════════════════════════════
   AnsweredEntry — 会話履歴の1エントリ
   ═══════════════════════════════════════════════ */
interface AnsweredEntry {
  kind: EndlessQuestionKind;
  robotLine: string;
  answerLabel: string;
  reactionText?: string;
  transitionLine?: string;
  drillAnswerLabels?: string[];
  followUpQuestion?: string;
  followUpOptions?: string[];
  followUpSelection?: string;
  summaryAfter?: string;
  accent: "sync" | "neural";
}

/* ═══════════════════════════════════════════════
   RobotBubble
   ═══════════════════════════════════════════════ */
function RobotBubble({ text, animate }: {
  text: string; animate?: boolean;
}) {
  return (
    <div style={{
      opacity: animate ? 0 : 1,
      animation: animate ? "bubbleIn 0.35s ease forwards" : undefined,
    }}>
      <div style={{
        padding: "8px 12px", borderRadius: "4px 14px 14px 14px",
        background: `linear-gradient(135deg,#e8ecf8,#dde2f2)`,
        border: "1px solid rgba(99,102,241,0.12)",
        maxWidth: "85%",
      }}>
        <p style={{ fontSize: 12.5, color: C.t1, lineHeight: 1.65, margin: 0 }}>{text}</p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   TransitionBubble — レイヤー切替の接続文
   ═══════════════════════════════════════════════ */
function TransitionBubble({ text }: { text: string }) {
  return (
    <div style={{ marginLeft: 12, padding: "6px 0", animation: "bubbleIn 0.4s ease forwards" }}>
      <p style={{
        fontSize: 11.5, color: C.neural, fontStyle: "italic",
        lineHeight: 1.6, margin: 0, opacity: 0.85,
      }}>
        {text}
      </p>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   ChoiceChips — カテゴリ質問用（1-5 ChoiceValue）
   ═══════════════════════════════════════════════ */
function ChoiceChips({
  question, onSelect, animate,
}: {
  question: { choices: { value: ChoiceValue; label: string }[] };
  onSelect: (value: ChoiceValue) => void;
  animate?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{
      marginLeft: 12, opacity: animate ? 0 : 1,
      animation: animate ? "bubbleIn 0.3s ease 0.15s forwards" : undefined,
    }}>
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} style={{
          padding: "7px 14px", borderRadius: 16,
          border: `1px solid ${C.sync}30`,
          background: `linear-gradient(135deg,${C.sync}08,${C.neural}06)`,
          color: C.sync, fontSize: 11.5, fontWeight: 600,
          cursor: "pointer", transition: "all 0.2s",
        }}>
          タップして答える
        </button>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, animation: "bubbleIn 0.25s ease forwards" }}>
          {question.choices.map((ch) => (
            <button key={ch.value} type="button" onClick={() => onSelect(ch.value)} style={{
              padding: "6px 12px", borderRadius: 14,
              border: "1px solid rgba(99,102,241,0.15)",
              background: "rgba(99,102,241,0.08)",
              color: C.t2, fontSize: 11.5, fontWeight: 500,
              cursor: "pointer", transition: "all 0.2s",
            }}>
              {ch.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   MicroChoiceChips — Micro Stargazer用（score ベース）
   ═══════════════════════════════════════════════ */
function MicroChoiceChips({
  variant, onSelect, animate,
}: {
  variant: QuestionVariant;
  onSelect: (optionId: string, score: number) => void;
  animate?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{
      marginLeft: 12, opacity: animate ? 0 : 1,
      animation: animate ? "bubbleIn 0.3s ease 0.15s forwards" : undefined,
    }}>
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} style={{
          padding: "7px 14px", borderRadius: 16,
          border: `1px solid ${C.neural}30`,
          background: `linear-gradient(135deg,${C.neural}08,${C.sync}04)`,
          color: C.neural, fontSize: 11.5, fontWeight: 600,
          cursor: "pointer", transition: "all 0.2s",
        }}>
          タップして答える
        </button>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, animation: "bubbleIn 0.25s ease forwards" }}>
          {variant.options.map((opt) => (
            <button key={opt.id} type="button" onClick={() => onSelect(opt.id, opt.score)} style={{
              padding: "6px 12px", borderRadius: 14,
              border: `1px solid ${C.neural}15`,
              background: `${C.neural}06`,
              color: C.t2, fontSize: 11.5, fontWeight: 500,
              cursor: "pointer", transition: "all 0.2s",
            }}>
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   AnswerBubble — ユーザー回答（右寄せ）
   ═══════════════════════════════════════════════ */
function AnswerBubble({ label, accent = "sync" }: { label: string; accent?: "sync" | "neural" }) {
  const color = accent === "neural" ? C.neural : C.sync;
  return (
    <div style={{ display: "flex", justifyContent: "flex-end" }}>
      <div style={{
        padding: "6px 12px", borderRadius: "14px 4px 14px 14px",
        background: accent === "neural"
          ? `linear-gradient(135deg,${C.neural}18,${C.sync}08)`
          : `linear-gradient(135deg,${C.sync}18,${C.neural}12)`,
        border: `1px solid ${color}25`,
        animation: "bubbleIn 0.25s ease forwards",
      }}>
        <span style={{ fontSize: 11.5, color, fontWeight: 600 }}>{label}</span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   FollowUpInline
   ═══════════════════════════════════════════════ */
function FollowUpInline({ question, options, onSelect }: {
  question: string; options: string[]; onSelect: (v: string) => void;
}) {
  return (
    <div style={{ marginLeft: 12, animation: "bubbleIn 0.3s ease forwards" }}>
      <p style={{ fontSize: 10.5, color: C.t3, marginBottom: 6, fontFamily: mono }}>{question}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
        {options.map((opt) => (
          <button key={opt} type="button" onClick={() => onSelect(opt)} style={{
            padding: "4px 10px", borderRadius: 12,
            border: "1px solid rgba(99,102,241,0.12)",
            background: "rgba(99,102,241,0.06)",
            color: C.t3, fontSize: 10.5, cursor: "pointer", transition: "all 0.2s",
          }}>
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   DrillChips — 深掘り質問用（pulse アクセント）
   ═══════════════════════════════════════════════ */
function DrillChips({ drill, onSelect }: {
  drill: DrillQuestion;
  onSelect: (optionId: string, optionText: string) => void;
}) {
  return (
    <div style={{ marginLeft: 12, animation: "bubbleIn 0.3s ease forwards" }}>
      <p style={{ fontSize: 10.5, color: C.t3, marginBottom: 6, fontFamily: mono }}>
        {drill.prompt}
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
        {drill.options.map((opt) => (
          <button key={opt.id} type="button" onClick={() => onSelect(opt.id, opt.text)} style={{
            padding: "4px 10px", borderRadius: 12,
            border: `1px solid ${C.pulse}15`,
            background: `${C.pulse}06`,
            color: C.t3, fontSize: 10.5, cursor: "pointer", transition: "all 0.2s",
          }}>
            {opt.text}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   SummaryBubble — まとめ表示
   ═══════════════════════════════════════════════ */
function SummaryBubble({ text }: { text: string }) {
  return (
    <div style={{
      margin: "4px 0", padding: "8px 14px", borderRadius: 14,
      background: `linear-gradient(135deg,${C.sync}06,${C.neural}04)`,
      border: `1px dashed ${C.sync}20`,
      animation: "bubbleIn 0.4s ease forwards",
    }}>
      <p style={{ fontSize: 11, color: C.t2, lineHeight: 1.6, margin: 0, fontStyle: "italic" }}>
        {text}
      </p>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   ProgressBar — セッション進捗
   ═══════════════════════════════════════════════ */
function ProgressBar({ answered }: { answered: number }) {
  const segments = Math.min(answered, 20);
  return (
    <div style={{ display: "flex", gap: 2, padding: "0 4px" }}>
      {Array.from({ length: segments }).map((_, i) => (
        <div key={i} style={{
          flex: 1, height: 2, borderRadius: 1, maxWidth: 12,
          background: i % 4 === 3 ? C.neural : `${C.sync}50`,
          opacity: 0.6 + (i / segments) * 0.4,
        }} />
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   RobotCheckinCard（メイン）
   エンドレス質問ループ
   ═══════════════════════════════════════════════ */
export default function RobotCheckinCard() {
  const date = todayStr();
  const [ctx, setCtx] = useState<DayContext>(defaultDayContext);
  const scrollRef = useRef<HTMLDivElement>(null);

  /* ── State ── */
  const [loaded, setLoaded] = useState(false);
  const [session, setSession] = useState<EndlessSessionState>(() => createSessionState(date));
  const [currentQuestion, setCurrentQuestion] = useState<EndlessQuestion | null>(null);
  const [answeredHistory, setAnsweredHistory] = useState<AnsweredEntry[]>([]);
  const [phase, setPhase] = useState<
    "question" | "reacting" | "followUp" | "drill" | "transition" | "summary" | "stopped" | "meta_observation" | "meta_insight" | "free_text_input"
  >("question");
  const [greeting, setGreeting] = useState("");
  const [subGreeting, setSubGreeting] = useState("");
  const [observationIntent, setObservationIntent] = useState("");
  const [resumeMessage, setResumeMessage] = useState<string | null>(null);
  const [reactionText, setReactionText] = useState("");
  const [microProgress, setMicroProgress] = useState<MicroStargazerProgress>({
    axes: {}, totalSessions: 0, lastAxisId: null, lastAxisDate: null,
  });
  const [record, setRecord] = useState<ExtendedObservationRecord | null>(null);

  // Drill state
  const [pendingDrill, setPendingDrill] = useState<{
    drill: DrillQuestion;
    catQ: CategoryQuestion;
  } | null>(null);
  const [pendingDrillQueue, setPendingDrillQueue] = useState<DrillQuestion[]>([]);
  const [currentDrillLabels, setCurrentDrillLabels] = useState<string[]>([]);
  const [currentDrillSelections, setCurrentDrillSelections] = useState<
    { step: string; selectedId: string; text: string }[]
  >([]);

  // FollowUp
  const [pendingFollowUp, setPendingFollowUp] = useState<CategoryQuestion | null>(null);

  // Meta-observation state
  const [metaQuestion, setMetaQuestion] = useState<{
    prompt: string;
    options: { id: string; label: string; reactionType: MetaObservationInsight["reactionType"] }[];
    targetAxis: TraitAxisKey;
  } | null>(null);
  const [metaInsightText, setMetaInsightText] = useState<string>("");
  const [metaAnswered, setMetaAnswered] = useState(false);

  // Phantom choice tracking — records per-question response times
  const [phantomSignals, setPhantomSignals] = useState<
    { questionId: string; responseTimeMs: number }[]
  >([]);

  // Completion insight (shown in stopped phase)
  const [completionInsight, setCompletionInsight] = useState<ObservationCompletionInsight | null>(null);
  const [resonancePredictions, setResonancePredictions] = useState<{axis: string; label: string; confidence: number}[]>([]);
  const [observedCategories, setObservedCategories] = useState<ConversationCategory[]>([]);
  const [streakCount, setStreakCount] = useState(0);
  const [crossSessionInsights, setCrossSessionInsights] = useState<CrossSessionInsight[]>([]);
  const [shadowWhisper, setShadowWhisper] = useState<string | null>(null);
  const shadowWhisperSignalRef = useRef<WhisperSignal | null>(null);
  const shadowWhisperAxisScoresRef = useRef<Record<string, number> | null>(null);
  const [robotExpression, setRobotExpression] = useState<RobotExpression>("neutral");
  const [relationshipStage, setRelationshipStage] = useState<RStage>(1);

  // Free text input state
  const [freeText, setFreeText] = useState("");
  const [freeTextSubmitted, setFreeTextSubmitted] = useState(false);

  // Revision tracking — records answer changes before confirmation
  const revisionSignals = useRef<BehavioralSignalRow[]>([]);
  // Track first answer per question for revision detection
  const firstAnswerPerQuestion = useRef<Map<string, number>>(new Map());

  // Footprint tracking
  const questionShownAt = useRef<number>(0);
  const sessionStartTime = useRef<string>("");

  // Bridge tracking
  const bridgeQueue = useRef<BridgeableAnswer[]>([]);
  const bridgeInFlight = useRef(false);

  useEffect(() => {
    questionShownAt.current = Date.now();
    sessionStartTime.current = new Date().toISOString();
  }, []);

  // 今日の着用記録を確認し DayContext を更新
  useEffect(() => {
    checkOutfitToday().then((hasOutfit) => {
      if (hasOutfit) {
        setCtx((prev) => ({ ...prev, hasOutfitToday: true }));
      }
    });
  }, []);

  /* ── Pick next question ── */
  const pickNext = useCallback((s: EndlessSessionState, mp: MicroStargazerProgress) => {
    const next = selectNextQuestion(s, ctx, mp, deriveDepthLevel(mp));
    if (!next) {
      setPhase("stopped");
      setCurrentQuestion(null);
      return;
    }

    // Handle context-setup question: show directly, no special processing needed
    if (next.kind === "context_setup" && next.contextSetup) {
      setCurrentQuestion(next);
      questionShownAt.current = Date.now();
      setPhase("question");
      return;
    }

    // Handle AI-pending questions: fetch from API, fallback to next static question
    if (next.kind === "ai_pending" && next.aiContext) {
      setPhase("transition");
      if (next.transitionLine) {
        setReactionText(next.transitionLine);
      }

      fetch("/api/aneurasync/ai-question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          category: next.aiContext.category,
          stage: relationshipStage,
          timeOfDay: next.aiContext.timeOfDay,
          lastAnswerCategory: next.aiContext.lastAnswerCategory,
          lastAnswerValue: next.aiContext.lastAnswerValue,
          observationCount: s.totalAnswered,
        }),
      })
        .then((r) => r.ok ? r.json() : null)
        .then((data) => {
          if (data?.ok && data.question) {
            const aiQ: CategoryQuestion = {
              id: data.question.id ?? `ai_${Date.now()}`,
              category: data.question.category ?? next.aiContext!.category,
              questionKind: "ai_generated" as any,
              robotLine: data.question.robotLine,
              choices: data.question.choices,
              reactions: {},
              isObservation: true,
              timePreference: ["morning", "afternoon", "night"],
            };
            setCurrentQuestion({ kind: "category", categoryQuestion: aiQ });
            questionShownAt.current = Date.now();
            setPhase("question");
          } else {
            // Fallback: pick a regular question
            const fallbackNext = selectNextQuestion(s, ctx, mp, deriveDepthLevel(mp));
            if (fallbackNext && fallbackNext.kind !== "ai_pending") {
              setCurrentQuestion(fallbackNext);
              questionShownAt.current = Date.now();
              setPhase("question");
            } else {
              setPhase("stopped");
            }
          }
        })
        .catch(() => {
          // AI failed, pick regular question
          const fallbackNext = selectNextQuestion(s, ctx, mp, deriveDepthLevel(mp));
          if (fallbackNext && fallbackNext.kind !== "ai_pending") {
            setCurrentQuestion(fallbackNext);
            questionShownAt.current = Date.now();
            setPhase("question");
          } else {
            setPhase("stopped");
          }
        });
      return;
    }

    setCurrentQuestion(next);
    // Reset timestamp for accurate response time measurement
    questionShownAt.current = Date.now();
    if (next.transitionLine) {
      setPhase("transition");
      setTimeout(() => {
        questionShownAt.current = Date.now();
        setPhase("question");
      }, 1200);
    } else {
      setPhase("question");
    }
  }, [ctx, relationshipStage]);

  /* ── Advance after answer (handles summary + bridge + next) ── */
  const advanceAfterAnswer = useCallback((
    entry: AnsweredEntry,
    updatedSession: EndlessSessionState,
    mp: MicroStargazerProgress,
  ) => {
    // Check summary break
    if (shouldInsertSummary(updatedSession.totalAnswered)) {
      const summaryText = generateSessionSummary(
        updatedSession.totalAnswered,
        record?.answers.map((a) => ({ questionId: a.theme, value: a.value })) ?? [],
      );
      entry.summaryAfter = summaryText;
    }

    // Check for mid-session insight (contradiction, pattern, energy shift)
    const midInsight = checkMidSessionInsight(updatedSession.totalAnswered);
    if (midInsight && !entry.summaryAfter) {
      entry.summaryAfter = midInsight.text;
    }

    // Add to history
    setAnsweredHistory((prev) => [...prev, entry]);

    // Check Stargazer bridge
    if (shouldBridgeToStargazer(updatedSession) && !bridgeInFlight.current) {
      bridgeInFlight.current = true;
      const toSend = [...bridgeQueue.current];
      bridgeQueue.current = [];
      updatedSession = { ...updatedSession, lastBridgeIndex: updatedSession.totalAnswered };
      setSession(updatedSession);
      saveSessionState(updatedSession);

      if (toSend.length > 0) {
        saveToStargazer(toSend).then((result) => {
          bridgeInFlight.current = false;
          if (result.ok) {
            console.log(`[RobotCheckin] Bridged ${result.savedCount} to Stargazer`);
          }
        }).catch(() => { bridgeInFlight.current = false; });
      } else {
        bridgeInFlight.current = false;
      }
    }

    // If summary was added, show it briefly then pick next
    if (entry.summaryAfter) {
      setPhase("summary");
      setTimeout(() => pickNext(updatedSession, mp), 2000);
    } else {
      pickNext(updatedSession, mp);
    }
  }, [record, pickNext]);

  /* ── Handle category answer ── */
  const handleCategoryAnswer = useCallback(
    (catQ: CategoryQuestion, value: ChoiceValue) => {
      // ── コンテキスト質問の回答処理 ──
      // context_setup 質問の回答は DayContext を更新するだけで observation に保存しない
      if (catQ.id === "context_setup" && currentQuestion?.kind === "context_setup" && currentQuestion.contextSetup) {
        const choice = currentQuestion.contextSetup.choices.find((c) => c.value === value);
        const updatedCtx = choice?.contextUpdate
          ? { ...ctx, ...choice.contextUpdate }
          : ctx;
        setCtx(updatedCtx);
        // セッション状態を更新（contextSetupDone = true）、totalAnswered はカウントしない
        const newSession: EndlessSessionState = {
          ...session,
          contextSetupDone: true,
        };
        setSession(newSession);
        saveSessionState(newSession);
        // リアクションを表示して次の質問へ
        const greetings = ["了解！", "なるほどね。", "ありがとう。", "オッケー。"];
        setReactionText(greetings[value % greetings.length] + " じゃあ聞いていくね。");
        setPhase("reacting");
        // pickNext を直接呼ぶのではなく、ctx が更新された後に次の質問を選択
        // selectNextQuestion を直接呼んで updatedCtx を渡す
        setTimeout(() => {
          const mp = loadMicroProgress();
          const next = selectNextQuestion(newSession, updatedCtx, mp, deriveDepthLevel(mp));
          if (next) {
            setCurrentQuestion(next);
            questionShownAt.current = Date.now();
            setPhase("question");
          } else {
            setPhase("stopped");
          }
        }, 1200);
        return;
      }

      const now = new Date().toISOString();
      const responseTimeMs = Date.now() - questionShownAt.current;
      const prev: ExtendedObservationRecord = record ?? { date, answers: [], savedAt: now };

      // Track answer revisions — detect if this question was previously answered
      const prevAnswer = firstAnswerPerQuestion.current.get(catQ.id);
      if (prevAnswer !== undefined && prevAnswer !== value) {
        revisionSignals.current.push(createRevisionSignal(
          catQ.id, prevAnswer, value, responseTimeMs, date,
        ));
      }
      if (prevAnswer === undefined) {
        firstAnswerPerQuestion.current.set(catQ.id, value);
      }

      // Record footprints for response speed
      const footprints = captureAnswerFootprints({
        responseTimeMs,
        didChange: prevAnswer !== undefined && prevAnswer !== value,
        didSkip: false,
        questionId: catQ.id,
        timestamp: now,
      });
      for (const fp of footprints) recordFootprint(fp);

      // Save to observation record
      const theme = (catQ.legacyTheme ?? catQ.id) as ObservationTheme;
      const existing = prev.answers.filter((a) => a.theme !== theme);
      const newAnswer: ObservationAnswer = { theme, value, answeredAt: now };
      const updated: ExtendedObservationRecord = {
        ...prev, answers: [...existing, newAnswer], savedAt: now,
      };
      setRecord(updated);
      saveObservation(updated);

      // Update session state
      const newSession: EndlessSessionState = {
        ...session,
        answeredIds: [...session.answeredIds, catQ.id],
        answeredCategoryIds: [...session.answeredCategoryIds, catQ.id],
        totalAnswered: session.totalAnswered + 1,
        lastAnswerCategory: catQ.category,
        lastAnswerValue: value,
      };
      setSession(newSession);
      saveSessionState(newSession);

      // Update day context based on partner interaction answers
      if (catQ.category === "partner" && value >= 3) {
        setCtx((prev) => ({ ...prev, hadPeople: true }));
      }
      if (catQ.category === "partner" && catQ.id.includes("date") && value >= 3) {
        setCtx((prev) => ({ ...prev, hadDate: true }));
      }

      // Record to session intelligence
      const sessionAns: SessionAnswer = {
        questionId: catQ.id,
        category: catQ.category,
        robotLine: getQuestionText(catQ),
        answerLabel: catQ.choices.find(c => c.value === value)?.label ?? "",
        value,
        responseTimeMs,
      };
      recordSessionAnswer(sessionAns);

      // Track phantom signals
      if (responseTimeMs > PHANTOM_THRESHOLD_MS) {
        setPhantomSignals((prev) => [...prev, { questionId: catQ.id, responseTimeMs }]);
      }

      // Compare to past observations for context
      const pastObs = loadRecentObservations(14);
      const pastComp = compareToPast(sessionAns, pastObs.map(r => ({
        date: r.date,
        answers: r.answers.map(a => ({ theme: a.theme, value: a.value })),
      })));

      // Determine time of day
      const hour = new Date().getHours();
      const timeOfDayCat: "late_night" | "morning" | "afternoon" | "evening" =
        hour < 5 ? "late_night" : hour < 12 ? "morning" : hour < 18 ? "afternoon" : hour < 23 ? "evening" : "late_night";

      // Generate living reaction (hybrid: rule-based immediate + AI async enhancement)
      const reactionInput = {
        value,
        category: catQ.category,
        questionText: getQuestionText(catQ),
        answerLabel: catQ.choices.find(c => c.value === value)?.label ?? "",
        responseTimeMs,
        stage: relationshipStage,
        totalAnsweredToday: newSession.totalAnswered,
        consecutiveSameScore: countConsecutiveSameScore(value),
        previousValue: answeredHistory.length > 0
          ? (record?.answers[record.answers.length - 1]?.value)
          : undefined,
        pastSameQuestionValue: pastComp?.pastValue,
        pastDaysDiff: pastComp?.daysDiff,
        isContradiction: false, // Will be enriched by session intelligence
        streakDays: undefined, // Already factored in greeting
        timeOfDay: timeOfDayCat,
      };
      const { immediate: livingReaction, aiPromise } = generateEnhancedReaction(reactionInput);

      // Also try session intelligence contextual override
      const templateReaction = livingReaction.text;
      const contextOverride = generateContextualReaction(sessionAns, templateReaction);
      const reaction = contextOverride ? contextOverride.reaction : templateReaction;

      setReactionText(reaction);
      setRobotExpression(livingReaction.expression);
      setPhase("reacting");

      // Async AI enhancement — replace reaction text when AI responds
      aiPromise.then((aiResult) => {
        if (aiResult?.reaction) {
          setReactionText(aiResult.reaction);
        }
      }).catch(() => { /* keep rule-based reaction */ });

      const answerLabel = catQ.choices.find((c) => c.value === value)?.label ?? "";

      // Use living reaction pause (stage-aware timing)
      const reactionPause = Math.max(800, livingReaction.pauseMs);
      setTimeout(() => {
        // Reset to idle expression after reaction
        setRobotExpression(getIdleExpression(relationshipStage));

        // Check drill for observation questions (AI-enhanced + static fallback)
        if (catQ.isObservation && isObservationCategory(catQ.category)) {
          const tendency = classifyTendency(value);
          const drillDepth = determineDrillDepth(tendency);
          const drillCategory = catQ.id.startsWith("cat_partner_solo_")
            ? "partner_solo"
            : catQ.category;

          // Try AI drill generation first, fall back to static
          const staticDrills = getDrillQuestions(drillCategory, tendency, drillDepth, true);

          // Fire AI drill request in parallel
          fetch("/api/aneurasync/ai-drill", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              category: drillCategory,
              value,
              questionText: getQuestionText(catQ),
              answerLabel: catQ.choices.find(c => c.value === value)?.label ?? "",
              stage: relationshipStage,
              previousAnswers: answeredHistory.slice(-5).map(h => ({
                category: h.accent ?? "",
                value: 3,
                label: h.answerLabel ?? "",
              })),
            }),
          })
            .then(r => r.ok ? r.json() : null)
            .then(data => {
              if (data?.ok && data.drills?.length > 0) {
                // Convert AI drills to DrillStep format
                const aiDrills: DrillQuestion[] = data.drills.map((d: { question: string; options: string[] }) => ({
                  step: "specific" as DrillStep,
                  prompt: d.question,
                  options: d.options.map((text: string, j: number) => ({
                    id: `ai-${j}`,
                    text,
                  })),
                }));
                // If still in drill phase, update with AI-generated drills
                setPendingDrillQueue(prev => {
                  if (prev.length > 0 && aiDrills.length > 1) {
                    return aiDrills.slice(1);
                  }
                  return prev;
                });
              }
            })
            .catch(() => { /* keep static drills */ });

          if (staticDrills.length > 0) {
            setPendingDrillQueue(staticDrills.slice(1));
            setPendingDrill({ drill: staticDrills[0], catQ });
            setCurrentDrillLabels([]);
            setCurrentDrillSelections([]);
            setPhase("drill");
            return;
          }
        }

        // Check followUp
        if (catQ.followUp) {
          setPendingFollowUp(catQ);
          setPhase("followUp");
          return;
        }

        // Build bridge data
        if (catQ.isObservation) {
          bridgeQueue.current.push({
            questionId: catQ.id,
            category: catQ.category,
            choiceValue: value,
            responseTimeMs,
            question: catQ,
          });
        }

        // Advance
        const entry: AnsweredEntry = {
          kind: "category",
          robotLine: getQuestionText(catQ),
          answerLabel,
          reactionText: reaction,
          transitionLine: currentQuestion?.transitionLine,
          accent: "sync",
        };
        advanceAfterAnswer(entry, newSession, microProgress);
      }, reactionPause);
    },
    [record, date, session, microProgress, currentQuestion, advanceAfterAnswer, relationshipStage, answeredHistory],
  );

  /* ── Handle micro stargazer answer ── */
  const handleMicroAnswer = useCallback(
    (variant: QuestionVariant, optionId: string, score: number) => {
      const now = new Date().toISOString();
      const responseTimeMs = Date.now() - questionShownAt.current;
      const prev: ExtendedObservationRecord = record ?? { date, answers: [], savedAt: now };

      // Track answer revisions for micro questions
      const normalizedScore = score > 0 ? 4 : score < 0 ? 2 : 3;
      const prevMicroAnswer = firstAnswerPerQuestion.current.get(variant.id);
      if (prevMicroAnswer !== undefined && prevMicroAnswer !== normalizedScore) {
        revisionSignals.current.push(createRevisionSignal(
          variant.id, prevMicroAnswer, normalizedScore, responseTimeMs, date,
        ));
      }
      if (prevMicroAnswer === undefined) {
        firstAnswerPerQuestion.current.set(variant.id, normalizedScore);
      }

      // Record footprints for response speed
      const footprints = captureAnswerFootprints({
        responseTimeMs,
        didChange: prevMicroAnswer !== undefined && prevMicroAnswer !== normalizedScore,
        didSkip: false,
        questionId: variant.id,
        timestamp: now,
      });
      for (const fp of footprints) recordFootprint(fp);

      // Record to session intelligence
      const microSessionAns: SessionAnswer = {
        questionId: variant.id,
        category: "micro_stargazer",
        robotLine: variant.prompt,
        answerLabel: variant.options.find(o => o.id === optionId)?.label ?? "",
        value: score > 0 ? 4 : score < 0 ? 2 : 3,
        responseTimeMs,
      };
      recordSessionAnswer(microSessionAns);

      const microAnswer: MicroStargazerAnswer = {
        variantId: variant.id, axisId: variant.axisId,
        selectedId: optionId, score, date, answeredAt: now,
      };

      // Save to micro progress
      const updatedMP = saveMicroAnswer(microProgress, microAnswer);
      setMicroProgress(updatedMP);

      // Save to observation record
      const existingMicro = (prev.microAnswers ?? []).filter((a) => a.variantId !== variant.id);
      const updated: ExtendedObservationRecord = {
        ...prev, microAnswers: [...existingMicro, microAnswer], savedAt: now,
      };
      setRecord(updated);
      saveObservation(updated);

      // Update session state
      const newSession: EndlessSessionState = {
        ...session,
        answeredIds: [...session.answeredIds, variant.id],
        answeredMicroIds: [...session.answeredMicroIds, variant.id],
        totalAnswered: session.totalAnswered + 1,
      };
      setSession(newSession);
      saveSessionState(newSession);

      // Track phantom signals
      if (responseTimeMs > PHANTOM_THRESHOLD_MS) {
        setPhantomSignals((prev) => [...prev, { questionId: variant.id, responseTimeMs }]);
      }

      // Normalize score to 1-5 range for living reaction
      const normalizedValue = score > 0 ? 4 : score < 0 ? 2 : 3;

      // Determine time of day
      const hourMicro = new Date().getHours();
      const timeOfDayMicro: "late_night" | "morning" | "afternoon" | "evening" =
        hourMicro < 5 ? "late_night" : hourMicro < 12 ? "morning" : hourMicro < 18 ? "afternoon" : hourMicro < 23 ? "evening" : "late_night";

      // Generate living reaction (hybrid: rule-based + AI)
      const microReactionInput = {
        value: normalizedValue,
        category: "micro_stargazer",
        questionText: variant.prompt,
        answerLabel: variant.options.find(o => o.id === optionId)?.label ?? "",
        responseTimeMs,
        stage: relationshipStage,
        totalAnsweredToday: newSession.totalAnswered,
        consecutiveSameScore: countConsecutiveSameScore(normalizedValue),
        previousValue: answeredHistory.length > 0
          ? (answeredHistory[answeredHistory.length - 1].accent === "neural" ? 3 : undefined)
          : undefined,
        timeOfDay: timeOfDayMicro,
      };
      const { immediate: livingReactionMicro, aiPromise: aiPromiseMicro } = generateEnhancedReaction(microReactionInput);

      // Also try session intelligence contextual override
      const templateMicro = livingReactionMicro.text;
      const contextOverrideMicro = generateContextualReaction(microSessionAns, templateMicro);
      const reaction = contextOverrideMicro ? contextOverrideMicro.reaction : templateMicro;

      // Async AI enhancement for micro reactions
      aiPromiseMicro.then((aiResult) => {
        if (aiResult?.reaction) setReactionText(aiResult.reaction);
      }).catch(() => {});

      setReactionText(reaction);
      setRobotExpression(livingReactionMicro.expression);
      setPhase("reacting");

      const answerLabel = variant.options.find((o) => o.id === optionId)?.label ?? "";

      // Use living reaction pause (stage-aware timing)
      const reactionPauseMicro = Math.max(800, livingReactionMicro.pauseMs);
      setTimeout(() => {
        setRobotExpression(getIdleExpression(relationshipStage));
        const entry: AnsweredEntry = {
          kind: "micro_stargazer",
          robotLine: variant.prompt,
          answerLabel,
          reactionText: reaction,
          transitionLine: currentQuestion?.transitionLine,
          accent: "neural",
        };
        advanceAfterAnswer(entry, newSession, updatedMP);
      }, reactionPauseMicro);
    },
    [record, date, session, microProgress, currentQuestion, advanceAfterAnswer, relationshipStage, answeredHistory],
  );

  /* ── Handle follow-up selection ── */
  const handleFollowUp = useCallback(
    (catQ: CategoryQuestion, selection: string) => {
      if (!record) return;
      const theme = (catQ.legacyTheme ?? catQ.id) as ObservationTheme;
      const answers = record.answers.map((a) =>
        a.theme === theme ? { ...a, followUpSelection: selection } : a,
      );
      const updated: ExtendedObservationRecord = {
        ...record, answers, savedAt: new Date().toISOString(),
      };
      setRecord(updated);
      saveObservation(updated);
      setPendingFollowUp(null);

      // Build bridge data
      const answerVal = record.answers.find((a) => a.theme === theme)?.value;
      if (catQ.isObservation && answerVal) {
        bridgeQueue.current.push({
          questionId: catQ.id,
          category: catQ.category,
          choiceValue: answerVal,
          responseTimeMs: 3000,
          question: catQ,
        });
      }

      // Build entry
      const answerLabel = catQ.choices.find((c) => c.value === answerVal)?.label ?? "";
      const reaction = answerVal ? catQ.reactions[answerVal] : undefined;
      const entry: AnsweredEntry = {
        kind: "category",
        robotLine: getQuestionText(catQ),
        answerLabel,
        reactionText: reaction,
        transitionLine: currentQuestion?.transitionLine,
        followUpQuestion: catQ.followUp?.question,
        followUpOptions: catQ.followUp?.options,
        followUpSelection: selection,
        drillAnswerLabels: currentDrillLabels.length > 0 ? [...currentDrillLabels] : undefined,
        accent: "sync",
      };

      setTimeout(() => advanceAfterAnswer(entry, session, microProgress), 600);
    },
    [record, session, microProgress, currentQuestion, currentDrillLabels, advanceAfterAnswer],
  );

  /* ── Handle drill answer (multi-step) ── */
  const handleDrillAnswer = useCallback(
    (optionId: string, optionText: string) => {
      if (!pendingDrill) return;
      const { drill, catQ } = pendingDrill;

      setCurrentDrillLabels((prev) => [...prev, optionText]);
      setCurrentDrillSelections((prev) => [
        ...prev,
        { step: drill.step, selectedId: optionId, text: optionText },
      ]);

      // More drill steps?
      if (pendingDrillQueue.length > 0) {
        const [nextDrill, ...rest] = pendingDrillQueue;
        setPendingDrill({ drill: nextDrill, catQ });
        setPendingDrillQueue(rest);
        return;
      }

      // Queue exhausted
      setPendingDrill(null);
      setPendingDrillQueue([]);

      setTimeout(() => {
        // Build drill result for bridge
        const theme = (catQ.legacyTheme ?? catQ.id) as ObservationTheme;
        const answerVal = record?.answers.find((a) => a.theme === theme)?.value;
        const allDrillSels = [
          ...currentDrillSelections,
          { step: drill.step, selectedId: optionId, text: optionText },
        ];

        if (catQ.isObservation && answerVal) {
          const drillResult = compileDrillResult(
            String(answerVal),
            catQ.category,
            allDrillSels.map((ds) => ({ step: ds.step as DrillStep, selectedId: ds.selectedId })),
          );
          bridgeQueue.current.push({
            questionId: catQ.id,
            category: catQ.category,
            choiceValue: answerVal,
            drillResult,
            responseTimeMs: 3000,
            question: catQ,
          });
        }

        if (catQ.followUp) {
          setPendingFollowUp(catQ);
          setPhase("followUp");
        } else {
          const answerLabel = catQ.choices.find((c) => c.value === answerVal)?.label ?? "";
          const reaction = answerVal ? catQ.reactions[answerVal] : undefined;
          const entry: AnsweredEntry = {
            kind: "category",
            robotLine: getQuestionText(catQ),
            answerLabel,
            reactionText: reaction,
            transitionLine: currentQuestion?.transitionLine,
            drillAnswerLabels: [
              ...currentDrillLabels,
              optionText,
            ],
            accent: "sync",
          };
          advanceAfterAnswer(entry, session, microProgress);
        }
      }, 400);
    },
    [pendingDrill, pendingDrillQueue, record, session, microProgress,
      currentQuestion, currentDrillLabels, currentDrillSelections, advanceAfterAnswer],
  );

  /* ── Finalize session — shared by direct stop and post-meta-observation ── */
  const finalizeSession = useCallback(() => {
    // Record observation for retention streak tracking
    recordObservation();

    // Record session footprints (timing + duration)
    const sessionDurationSeconds = Math.round(
      (Date.now() - new Date(sessionStartTime.current).getTime()) / 1000,
    );
    const sessionFootprints = captureSessionFootprints({
      startTime: sessionStartTime.current,
      durationSeconds: sessionDurationSeconds,
    });
    for (const fp of sessionFootprints) recordFootprint(fp);

    // ── Behavioral signal batch sync ──
    const sessionDate = date;
    const allSignals: BehavioralSignalRow[] = [];

    // 1. Convert existing footprint signals to rows
    try {
      const raw = localStorage.getItem("culcept_sg_footprints_v1");
      if (raw) {
        const storedFootprints = JSON.parse(raw) as FootprintSignal[];
        allSignals.push(...footprintsToSignalRows(storedFootprints));
      }
    } catch { /* ignore */ }

    // 2. Add revision signals
    allSignals.push(...revisionSignals.current);

    // 3. Add session duration signal
    allSignals.push(createSessionDurationSignal(
      sessionDurationSeconds,
      session.totalAnswered,
      sessionDate,
    ));

    // 4. Add time-of-day signal
    const nowHour = new Date().getHours();
    allSignals.push(createTimeOfDaySignal(nowHour, sessionDate));

    // 5. Add hesitation signals — flag questions with >2x average response time
    const responseTimes = phantomSignals.map((ps) => ps.responseTimeMs);
    if (responseTimes.length >= 2) {
      const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      const hesitationThreshold = avgResponseTime * 2;
      for (const ps of phantomSignals) {
        if (ps.responseTimeMs > hesitationThreshold) {
          allSignals.push({
            signal_type: "hesitation",
            value: ps.responseTimeMs,
            context: `avg:${Math.round(avgResponseTime)},threshold:${Math.round(hesitationThreshold)}`,
            question_id: ps.questionId,
            original_choice: null,
            final_choice: null,
            session_date: sessionDate,
          });
        }
      }
    }

    // Fire-and-forget behavioral signal sync
    if (allSignals.length > 0) {
      syncBehavioralSignals(allSignals).catch(() => { /* ignore sync failure */ });
    }

    // Fire remaining bridge data
    if (bridgeQueue.current.length > 0 && !bridgeInFlight.current) {
      bridgeInFlight.current = true;
      const toSend = [...bridgeQueue.current];
      bridgeQueue.current = [];
      saveToStargazer(toSend).then(() => {
        bridgeInFlight.current = false;
      }).catch(() => { bridgeInFlight.current = false; });
    }

    // Increment micro totalSessions if any micro answers
    if ((record?.microAnswers?.length ?? 0) > 0) {
      const latestMP = loadMicroProgress();
      const updatedMP = { ...latestMP, totalSessions: latestMP.totalSessions + 1 };
      setMicroProgress(updatedMP);
      saveMicroProgress(updatedMP);
    }

    // Save session with pause marker
    const pausedSession = { ...session, pausedAt: new Date().toISOString() };
    setSession(pausedSession);
    saveSessionState(pausedSession);

    // Compute completion insight
    const completionAxisScores = deriveAxisScores(microProgress);
    const insightAnswers = phantomSignals.map((ps) => ({
      questionId: ps.questionId,
      optionId: ps.questionId,
      responseTimeMs: ps.responseTimeMs,
    }));
    const totalObs = loadRecentObservations(30).length;
    const insight = generateCompletionInsight(insightAnswers, completionAxisScores, totalObs, null);
    setCompletionInsight(insight);

    // Resonance cascade — predict unobserved axes
    const observedAxes = new Set(Object.keys(completionAxisScores) as TraitAxisKey[]);
    const predictions = predictResonanceCascade(completionAxisScores, observedAxes);
    if (predictions.length > 0) {
      setResonancePredictions(
        predictions.slice(0, 2).map((p) => ({
          axis: p.predictedAxis,
          label: p.resonanceSource,
          confidence: p.confidence,
        }))
      );
    }

    // Cross-session narrative — detect multi-day patterns for completion screen
    const recentForNarrative = loadRecentObservations(14);
    const pastDaysForNarrative = recentForNarrative.map((r) => ({
      date: r.date,
      answers: r.answers.map((a) => ({ theme: a.theme, value: a.value })),
    }));
    const crossInsights = generateCrossSessionNarrative(pastDaysForNarrative, microProgress);
    setCrossSessionInsights(crossInsights);

    // Shadow Whisper — もうひとりの一言を生成
    try {
      const whisperAxisScores = deriveAxisScores(microProgress);
      const axisEntries = Object.entries(whisperAxisScores) as [TraitAxisKey, number][];

      // ヘルパー: 軸IDからラベルを取得
      const getAxisLabel = (axisId: string): string => {
        const def = TRAIT_AXES.find((a) => a.id === axisId);
        return def ? `${def.labelLeft}/${def.labelRight}` : axisId;
      };

      // シグナル検出: 極端な軸
      let extremeAxis: WhisperSignal["extremeAxis"] | undefined;
      for (const [axis, score] of axisEntries) {
        if (Math.abs(score) > 0.6) {
          extremeAxis = { axis, label: getAxisLabel(axis), score };
          break;
        }
      }

      // シグナル検出: 繰り返しパターン（過去3日同じ方向）
      let repeatingPattern: WhisperSignal["repeatingPattern"] | undefined;
      const recentObs = loadRecentObservations(7);
      if (recentObs.length >= 3) {
        for (const [axis, score] of axisEntries) {
          const direction = score > 0 ? "positive" : "negative";
          let consecutiveDays = 1;
          for (const obs of recentObs.slice(-3)) {
            const pastAnswer = obs.answers.find((a) => (a.theme as string) === axis);
            if (pastAnswer) {
              const pastDirection = pastAnswer.value >= 3 ? "positive" : "negative";
              if (pastDirection === direction) consecutiveDays++;
            }
          }
          if (consecutiveDays >= 3) {
            repeatingPattern = { axis, label: getAxisLabel(axis), dayCount: consecutiveDays };
            break;
          }
        }
      }

      // シグナル検出: 矛盾（今日の回答方向 vs 過去の傾向が逆）
      let contradictionDetected: WhisperSignal["contradictionDetected"] | undefined;
      if (recentObs.length >= 2) {
        for (const [axis, todayScore] of axisEntries) {
          const todayDir = todayScore > 0 ? 1 : -1;
          // 過去の同軸スコアの平均方向を算出
          let pastSum = 0;
          let pastCount = 0;
          for (const obs of recentObs) {
            const pastAnswer = obs.answers.find((a) => (a.theme as string) === axis);
            if (pastAnswer) {
              // value: 1-5 scale → -1 to +1 に正規化
              pastSum += (pastAnswer.value - 3) / 2;
              pastCount++;
            }
          }
          if (pastCount >= 2) {
            const pastAvgDir = pastSum / pastCount > 0 ? 1 : -1;
            // 今日と過去で方向が逆 & 両方ともある程度の強さがある
            if (todayDir !== pastAvgDir && Math.abs(todayScore) > 0.2 && Math.abs(pastSum / pastCount) > 0.15) {
              contradictionDetected = { axis, label: getAxisLabel(axis) };
              break;
            }
          }
        }
      }

      // シグナル検出: 回避領域
      const avoidedCat = detectAvoidedCategory(
        recentObs.flatMap((r) => r.answers)
      );

      const whisperSignal: WhisperSignal = {
        contradictionDetected,
        extremeAxis,
        repeatingPattern,
        avoidedArea: avoidedCat ?? undefined,
      };

      // パーソナリティ構築を試みる（十分な軸スコアがあれば）
      let whisperPersonality: AlterPersonality | null = null;
      if (axisEntries.length >= 5) {
        try {
          const archetype = resolveArchetype(whisperAxisScores);
          const shadowCode = ARCHETYPE_DEFS.find((d) => d.code === archetype.code)?.shadowCode;
          if (shadowCode) {
            whisperPersonality = buildAlterPersonality({
              archetypeCode: archetype.code,
              shadowCode,
              axisScores: whisperAxisScores,
              observationDepth: Math.min(100, microProgress.totalSessions * 5),
            });
          }
        } catch { /* パーソナリティ構築失敗は無視 */ }
      }

      const whisper = generateShadowWhisper(
        whisperPersonality,
        whisperSignal,
        microProgress.totalSessions,
      );
      setShadowWhisper(whisper);
      shadowWhisperSignalRef.current = whisperSignal;
      shadowWhisperAxisScoresRef.current = whisperAxisScores;
      if (whisper) trackWhisperShown();
    } catch {
      // Shadow Whisper 生成失敗は完了画面に影響させない
    }

    // Derive observed categories from answered category IDs
    const catSet = new Set<ConversationCategory>();
    for (const id of pausedSession.answeredCategoryIds) {
      const q = getCategoryQuestion(id);
      if (q && CATEGORY_LABELS[q.category]) catSet.add(q.category);
    }
    setObservedCategories(Array.from(catSet));

    // Compute streak from recent observations
    const recent = loadRecentObservations(14);
    let streak = 1; // today counts
    const today = new Date();
    for (let i = 1; i <= 13; i++) {
      const checkDate = new Date(today);
      checkDate.setDate(checkDate.getDate() - i);
      const checkStr = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, "0")}-${String(checkDate.getDate()).padStart(2, "0")}`;
      if (recent.some((r) => r.date === checkStr)) {
        streak++;
      } else {
        break;
      }
    }
    setStreakCount(streak);

    // Set closing expression
    const closingExpr = getStageClosing(relationshipStage, session.totalAnswered).expression;
    setRobotExpression(closingExpr);

    setPhase("stopped");
    setCurrentQuestion(null);
  }, [session, record, microProgress, phantomSignals, relationshipStage]);

  /* ── Proceed after free text — check meta-observation then finalize ── */
  const proceedAfterFreeText = useCallback(() => {
    // Check if meta-observation should be triggered
    const axisScores = deriveAxisScores(microProgress);
    const hasScores = Object.keys(axisScores).length > 0;

    if (microProgress.totalSessions >= 3 && hasScores && !metaAnswered) {
      const metaQs = generateMetaObservationQuestions(axisScores);
      if (metaQs.length > 0) {
        const q = metaQs[0];
        setMetaQuestion({
          prompt: q.prompt,
          options: q.options,
          targetAxis: q.targetAxis,
        });
        setPhase("meta_observation");
        setCurrentQuestion(null);
        return;
      }
    }

    finalizeSession();
  }, [microProgress, metaAnswered, finalizeSession]);

  /* ── Handle free text submit ── */
  const handleFreeTextSubmit = useCallback(() => {
    setFreeTextSubmitted(true);

    // Save free_text to daily state via API (fire-and-forget)
    const textToSave = freeText.trim();
    if (textToSave) {
      fetch("/api/stargazer/daily-observation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          answers: record?.microAnswers?.map((a) => ({
            variantId: a.variantId,
            score: a.score,
          })) ?? [{ variantId: "_free_text_only", score: 0 }],
          observationDate: date,
          isPartial: true,
          freeText: textToSave,
        }),
      }).catch(() => { /* fire-and-forget */ });
    }

    proceedAfterFreeText();
  }, [freeText, record, date, proceedAfterFreeText]);

  /* ── Handle free text skip ── */
  const handleFreeTextSkip = useCallback(() => {
    setFreeTextSubmitted(true);
    proceedAfterFreeText();
  }, [proceedAfterFreeText]);

  /* ── Stop session ── */
  const handleStop = useCallback(() => {
    // Show free text input phase before meta-observation/finalize
    if (!freeTextSubmitted) {
      setPhase("free_text_input");
      setCurrentQuestion(null);
      return;
    }

    // Already submitted free text, proceed directly
    proceedAfterFreeText();
  }, [freeTextSubmitted, proceedAfterFreeText]);

  /* ── Handle meta-observation answer ── */
  const handleMetaObservationAnswer = useCallback(
    (reactionType: MetaObservationInsight["reactionType"]) => {
      if (!metaQuestion) return;
      const metaAxisScores = deriveAxisScores(microProgress);
      const currentScore = metaAxisScores[metaQuestion.targetAxis] ?? 0;
      const insight = interpretMetaObservation(reactionType, metaQuestion.targetAxis, currentScore);

      setMetaInsightText(insight.deeperImplication);
      setMetaAnswered(true);
      setPhase("meta_insight");

      // Save meta-observation to record
      if (record) {
        const updated: ExtendedObservationRecord = {
          ...record,
          metaObservation: {
            targetAxis: metaQuestion.targetAxis,
            reactionType,
            insight: insight.insight,
            deeperImplication: insight.deeperImplication,
            answeredAt: new Date().toISOString(),
          },
          savedAt: new Date().toISOString(),
        };
        setRecord(updated);
        saveObservation(updated);
      }

      // Show insight briefly, then finalize session
      setTimeout(() => {
        finalizeSession();
      }, 3000);
    },
    [metaQuestion, microProgress, record, finalizeSession],
  );

  /* ── Load on mount ── */
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- mount-time hydration from localStorage */
    clearSessionMemory();

    // Cleanup old localStorage entries
    try {
      const recentDates = new Set<string>();
      for (let i = 0; i < 7; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        recentDates.add(
          `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
        );
      }
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith("culcept_daily_obs_v1_")) {
          const datePart = k.slice("culcept_daily_obs_v1_".length);
          if (!recentDates.has(datePart)) keysToRemove.push(k);
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
    } catch { /* ignore */ }

    const mp = loadMicroProgress();
    setMicroProgress(mp);

    const existing = loadObservation(date) as ExtendedObservationRecord | null;
    setRecord(existing);

    // ── Relationship Stage ──
    const stage = getRelationshipStage(mp.totalSessions);
    setRelationshipStage(stage);
    setRobotExpression(getIdleExpression(stage));

    // ── Stage-Aware Greeting ──
    const recent = loadRecentObservations(14);
    const lastRecord = recent.length > 0 ? recent[recent.length - 1] : null;
    const lastMoodScore = lastRecord?.answers.find(a => a.theme === "mood")?.value;
    const lastSelfScore = lastRecord?.answers.find(a => a.theme === "selfMatch")?.value;
    const lastDate = lastRecord?.date ?? null;

    // Compute streak
    let streakDays = 0;
    const todayDate = new Date();
    for (let i = 0; i <= 13; i++) {
      const checkDate = new Date(todayDate);
      checkDate.setDate(checkDate.getDate() - i);
      const checkStr = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, "0")}-${String(checkDate.getDate()).padStart(2, "0")}`;
      if (i === 0 || recent.some(r => r.date === checkStr)) {
        streakDays++;
      } else break;
    }

    // Detect avoided category
    const allRecentAnswers = recent.flatMap(r => r.answers);
    const avoidedCat = detectAvoidedCategory(allRecentAnswers);

    // Find last notable answer text for "ずっと考えてた" greeting
    const lastAnswerText = lastRecord?.answers
      .filter(a => a.value <= 2 || a.value >= 4)
      .map(a => {
        const q = a.theme.startsWith("cat_") ? getCategoryQuestion(a.theme) : null;
        return q?.choices.find(c => c.value === a.value)?.label;
      })
      .filter(Boolean)[0] ?? undefined;

    const daysSince = lastDate
      ? Math.round((todayDate.getTime() - new Date(lastDate).getTime()) / 86400000)
      : 999;

    const stageGreeting = getStageGreeting(stage, {
      lastMoodScore,
      lastSelfMatchScore: lastSelfScore,
      daysSinceLastSession: daysSince,
      totalSessions: mp.totalSessions,
      lastAnswerText,
      streakDays,
      avoidedCategory: avoidedCat ?? undefined,
    });

    setGreeting(stageGreeting.line);
    setRobotExpression(stageGreeting.expression);

    // Sub-greeting: cross-session narrative or stage sub-line
    const pastDays = recent.map(r => ({
      date: r.date,
      answers: r.answers.map(a => ({ theme: a.theme, value: a.value })),
    }));
    const crossNarrative = getCrossSessionGreetingLine(pastDays, mp);
    setSubGreeting(crossNarrative ?? stageGreeting.subLine ?? "");

    // Observation intent — stage-aware
    if (stage <= 2) {
      const intro = getQuestionIntro(stage, 0, "");
      setObservationIntent(intro ?? "");
    } else if (stage >= 4) {
      setObservationIntent(""); // Stage 4-5: no preamble
    } else {
      setObservationIntent("今日、確かめたいことがある。");
    }

    // Try to restore session
    const savedSession = loadSessionState();
    if (savedSession && savedSession.totalAnswered > 0) {
      setSession(savedSession);
      setResumeMessage(
        `前回${savedSession.totalAnswered}問答えてくれたね。続きからいこう。`,
      );
      // Pick next question from restored session
      const next = selectNextQuestion(savedSession, ctx, mp, deriveDepthLevel(mp));
      if (next) {
        setCurrentQuestion(next);
        if (next.transitionLine) {
          setPhase("transition");
          setTimeout(() => setPhase("question"), 1200);
        } else {
          setPhase("question");
        }
      } else {
        setPhase("stopped");
      }
    } else {
      // Fresh session
      const fresh = createSessionState(date);
      setSession(fresh);
      const next = selectNextQuestion(fresh, ctx, mp, deriveDepthLevel(mp));
      setCurrentQuestion(next);
    }

    setLoaded(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [date]);

  /* ── Auto-scroll ── */
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [answeredHistory.length, phase, reactionText, pendingDrill, metaQuestion, metaInsightText, freeText]);

  /* ── Send remaining deltas on unmount ── */
  useEffect(() => {
    return () => {
      mergeFreeChatDeltas().catch(() => {});
    };
  }, []);

  if (!loaded) return null;

  /* ═══════════════════════════════════════════════
     Build conversation steps
     ═══════════════════════════════════════════════ */
  const steps: ConversationStep[] = [];

  // Greeting
  steps.push({ type: "robot", text: greeting, key: "greeting" });

  // Sub-greeting (temporal context)
  if (subGreeting) {
    steps.push({ type: "robot", text: subGreeting, key: "sub-greeting" });
  }

  // Observation intent (opening ceremony)
  if (observationIntent) {
    steps.push({ type: "robot", text: observationIntent, key: "obs-intent" });
  }

  // Resume message
  if (resumeMessage) {
    steps.push({ type: "robot", text: resumeMessage, key: "resume" });
  }

  // Answered history
  for (let i = 0; i < answeredHistory.length; i++) {
    const entry = answeredHistory[i];

    // Transition line
    if (entry.transitionLine) {
      steps.push({ type: "transition", text: entry.transitionLine, key: `trans-${i}` });
    }

    // Robot question + answer + reaction
    steps.push({ type: "robot", text: entry.robotLine, key: `q-${i}` });
    steps.push({
      type: entry.accent === "neural" ? "microAnswer" : "answer",
      label: entry.answerLabel,
      key: `a-${i}`,
    });
    if (entry.reactionText) {
      steps.push({ type: "robot", text: entry.reactionText, key: `r-${i}` });
    }

    // Drill answers
    if (entry.drillAnswerLabels) {
      for (let di = 0; di < entry.drillAnswerLabels.length; di++) {
        steps.push({ type: "drillAnswer", label: entry.drillAnswerLabels[di], key: `da-${i}-${di}` });
      }
    }

    // FollowUp selection
    if (entry.followUpSelection) {
      steps.push({ type: "answer", label: entry.followUpSelection, key: `fu-${i}` });
    }

    // Summary after this entry
    if (entry.summaryAfter) {
      steps.push({ type: "summary", text: entry.summaryAfter, key: `sum-${i}` });
    }
  }

  // Current reaction text
  if (phase === "reacting" && reactionText) {
    if (currentQuestion?.kind === "category" && currentQuestion.categoryQuestion) {
      steps.push({ type: "robot", text: getQuestionText(currentQuestion.categoryQuestion), key: "cur-q" });
      const val = record?.answers.find(
        (a) => a.theme === ((currentQuestion.categoryQuestion!.legacyTheme ?? currentQuestion.categoryQuestion!.id) as ObservationTheme),
      )?.value;
      if (val) {
        const label = currentQuestion.categoryQuestion.choices.find((c) => c.value === val)?.label ?? "";
        steps.push({ type: "answer", label, key: "cur-a" });
      }
    } else if (currentQuestion?.kind === "micro_stargazer" && currentQuestion.variant) {
      steps.push({ type: "robot", text: currentQuestion.variant.prompt, key: "cur-q" });
      const micro = record?.microAnswers?.find((a) => a.variantId === currentQuestion.variant!.id);
      if (micro) {
        const label = currentQuestion.variant.options.find((o) => o.id === micro.selectedId)?.label ?? "";
        steps.push({ type: "microAnswer", label, key: "cur-a" });
      }
    }
    steps.push({ type: "robot", text: reactionText, key: "cur-react" });
  }

  // Transition
  if (phase === "transition" && currentQuestion?.transitionLine) {
    steps.push({ type: "transition", text: currentQuestion.transitionLine, key: "cur-trans" });
  }

  // Active question
  if (phase === "question" && currentQuestion) {
    if (currentQuestion.transitionLine) {
      steps.push({ type: "transition", text: currentQuestion.transitionLine, key: "cur-trans" });
    }
    if (currentQuestion.kind === "context_setup" && currentQuestion.contextSetup) {
      // コンテキスト質問を categoryQuestion 形式に変換して表示
      const contextAsCategory: CategoryQuestion = {
        id: "context_setup",
        category: "impression" as any,
        robotLine: currentQuestion.contextSetup.robotLine,
        choices: currentQuestion.contextSetup.choices.map((c) => ({
          value: c.value as any,
          label: c.label,
        })),
        reactions: {},
        isObservation: false,
        timePreference: ["morning", "afternoon", "night"],
      };
      steps.push({
        type: "categoryQuestion",
        catQ: contextAsCategory,
        key: `active-context`,
      });
    } else if (currentQuestion.kind === "category" && currentQuestion.categoryQuestion) {
      steps.push({
        type: "categoryQuestion",
        catQ: currentQuestion.categoryQuestion,
        key: `active-cat`,
      });
    } else if (currentQuestion.kind === "micro_stargazer" && currentQuestion.variant) {
      steps.push({
        type: "microQuestion",
        variant: currentQuestion.variant,
        key: `active-micro`,
      });
    }
  }

  // Active drill
  if (phase === "drill" && pendingDrill) {
    // Show drill labels so far
    for (let di = 0; di < currentDrillLabels.length; di++) {
      steps.push({ type: "drillAnswer", label: currentDrillLabels[di], key: `curDa-${di}` });
    }
    steps.push({
      type: "drillQuestion",
      drill: pendingDrill.drill,
      questionId: pendingDrill.catQ.id,
      key: `drillActive`,
    });
  }

  // Active followUp
  if (phase === "followUp" && pendingFollowUp?.followUp) {
    steps.push({
      type: "followUp",
      question: pendingFollowUp.followUp.question,
      options: pendingFollowUp.followUp.options,
      questionId: pendingFollowUp.id,
      key: `fuActive`,
    });
  }

  // Summary phase
  if (phase === "summary") {
    // Already shown in answeredHistory's summaryAfter
  }

  // Meta-observation phase
  if (phase === "meta_observation" && metaQuestion) {
    steps.push({
      type: "metaObservation",
      prompt: metaQuestion.prompt,
      options: metaQuestion.options,
      targetAxis: metaQuestion.targetAxis,
      key: "meta-obs",
    });
  }

  // Meta-insight phase (showing interpretation briefly)
  if (phase === "meta_insight" && metaInsightText) {
    steps.push({ type: "metaInsight", text: metaInsightText, key: "meta-insight" });
  }

  // Free text input phase
  if (phase === "free_text_input") {
    steps.push({ type: "freeTextInput", key: "free-text" });
  }

  // Stopped / closing — stage-aware
  if (phase === "stopped") {
    const stageClosing = getStageClosing(relationshipStage, session.totalAnswered);
    steps.push({ type: "closing", text: stageClosing.line, key: "closing" });
  }

  // Stop button (shown during question phase when at least 1 answer exists)
  const showStopBtn = phase === "question" && session.totalAnswered > 0;

  const hasMicroAnswers = (record?.microAnswers?.length ?? 0) > 0;

  /* ═══════════════════════════════════════════════
     Render
     ═══════════════════════════════════════════════ */
  return (
    <section style={{ padding: "8px 0 12px", maxWidth: 780, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 12 }}>
        <span style={{ fontSize: 9, color: "#3B82F6", letterSpacing: 5, fontFamily: mono, fontWeight: 700 }}>
          DAILY OBSERVATION
        </span>
        {session.totalAnswered > 0 && (
          <div style={{ marginTop: 4 }}>
            <ProgressBar answered={session.totalAnswered} />
          </div>
        )}
      </div>

      <div style={{
        borderRadius: 18,
        background: `linear-gradient(165deg, #ffffff, #f0f4ff)`,
        border: "none",
        overflow: "hidden", position: "relative",
      }}>
        {/* Sync glow */}
        <div style={{
          position: "absolute", top: -30, right: -15, width: 100, height: 100,
          background: `radial-gradient(circle,${C.sync}20,transparent 70%)`,
          filter: "blur(25px)", pointerEvents: "none",
        }} />
        {hasMicroAnswers && (
          <div style={{
            position: "absolute", bottom: -20, left: -10, width: 80, height: 80,
            background: `radial-gradient(circle,${C.neural}18,transparent 70%)`,
            filter: "blur(20px)", pointerEvents: "none",
          }} />
        )}

        {/* Persistent Robot Avatar — always visible at top */}
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          padding: "22px 14px 10px",
          position: "relative",
          background: "radial-gradient(circle at 50% 28%, rgba(74,234,255,0.16), rgba(255,255,255,0.94) 40%, rgba(255,255,255,0) 70%)",
        }}>
          <RobotAvatar
            expression={robotExpression}
            stage={relationshipStage}
            size={136}
            breathingSpeed={phase === "reacting" ? 0.7 : 1}
          />
          {/* Thinking indicator — visible during reaction pause */}
          <div style={{
            height: 20, display: "flex", alignItems: "center", justifyContent: "center",
            marginTop: 4,
          }}>
            {phase === "reacting" ? (
              <div style={{
                display: "flex", gap: 4, alignItems: "center",
                animation: "bubbleIn 0.3s ease forwards",
              }}>
                {[0, 1, 2].map((i) => (
                  <div key={i} style={{
                    width: 4, height: 4, borderRadius: "50%",
                    background: C.sync,
                    opacity: 0.5,
                    animation: `thinkingDot 1.2s ease-in-out ${i * 0.2}s infinite`,
                  }} />
                ))}
              </div>
            ) : (
              <span style={{
                fontSize: 9, color: C.t4, fontFamily: mono,
                letterSpacing: 2, textTransform: "uppercase",
              }}>
                {relationshipStage <= 2 ? "OBSERVING" : relationshipStage <= 4 ? "LISTENING" : "…"}
              </span>
            )}
          </div>
        </div>

        {/* Conversation area */}
        <div ref={scrollRef} style={{
          padding: "4px 14px 12px",
          display: "flex", flexDirection: "column", gap: 10,
          maxHeight: 420, overflowY: "auto",
        }}>
          {steps.map((step) => {
            switch (step.type) {
              case "robot":
                return <RobotBubble key={step.key} text={step.text}
                  />;
              case "transition":
                return <TransitionBubble key={step.key} text={step.text} />;
              case "categoryQuestion":
                return (
                  <div key={step.key}>
                    <RobotBubble text={getQuestionText(step.catQ)} animate
                      />
                    <div style={{ marginTop: 8 }}>
                      <ChoiceChips
                        question={step.catQ}
                        onSelect={(v) => handleCategoryAnswer(step.catQ, v)}
                        animate
                      />
                    </div>
                  </div>
                );
              case "microQuestion":
                return (
                  <div key={step.key}>
                    <RobotBubble text={step.variant.prompt} animate
                      />
                    <div style={{ marginTop: 8 }}>
                      <MicroChoiceChips
                        variant={step.variant}
                        onSelect={(id, sc) => handleMicroAnswer(step.variant, id, sc)}
                        animate
                      />
                    </div>
                  </div>
                );
              case "answer":
                return <AnswerBubble key={step.key} label={step.label} />;
              case "microAnswer":
                return <AnswerBubble key={step.key} label={step.label} accent="neural" />;
              case "drillQuestion":
                return (
                  <DrillChips
                    key={step.key}
                    drill={step.drill}
                    onSelect={(id, text) => handleDrillAnswer(id, text)}
                  />
                );
              case "drillAnswer":
                return <AnswerBubble key={step.key} label={step.label} accent="neural" />;
              case "followUp":
                return (
                  <FollowUpInline
                    key={step.key}
                    question={step.question}
                    options={step.options}
                    onSelect={(v) => {
                      if (pendingFollowUp) handleFollowUp(pendingFollowUp, v);
                    }}
                  />
                );
              case "summary":
                return <SummaryBubble key={step.key} text={step.text} />;
              case "closing":
                return <RobotBubble key={step.key} text={step.text} />;
              case "metaObservation":
                return (
                  <div key={step.key} style={{ animation: "bubbleIn 0.5s ease forwards" }}>
                    <div style={{
                      marginBottom: 10, padding: "4px 0",
                      borderBottom: `1px solid ${C.neural}15`,
                    }}>
                      <span style={{
                        fontSize: 8, color: C.neural, fontFamily: mono,
                        letterSpacing: 3, textTransform: "uppercase",
                      }}>
                        META OBSERVATION
                      </span>
                    </div>
                    <RobotBubble text={step.prompt} animate />
                    <div style={{
                      marginLeft: 12, marginTop: 8,
                      display: "flex", flexWrap: "wrap", gap: 6,
                      animation: "bubbleIn 0.3s ease 0.3s forwards",
                      opacity: 0,
                    }}>
                      {step.options.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => handleMetaObservationAnswer(opt.reactionType)}
                          style={{
                            padding: "6px 12px", borderRadius: 14,
                            border: `1px solid ${C.neural}20`,
                            background: `linear-gradient(135deg,${C.neural}08,${C.sync}04)`,
                            color: C.t2, fontSize: 11, fontWeight: 500,
                            cursor: "pointer", transition: "all 0.2s",
                          }}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              case "metaInsight":
                return (
                  <div key={step.key} style={{
                    margin: "6px 0", padding: "10px 14px", borderRadius: 14,
                    background: `linear-gradient(145deg,${C.neural}10,${C.sync}06)`,
                    border: `1px solid ${C.neural}20`,
                    animation: "bubbleIn 0.5s ease forwards",
                  }}>
                    <p style={{
                      fontSize: 11.5, color: C.t1, lineHeight: 1.7, margin: 0,
                      fontStyle: "italic",
                    }}>
                      {step.text}
                    </p>
                  </div>
                );
              case "freeTextInput":
                return (
                  <div key={step.key} style={{
                    animation: "bubbleIn 0.5s ease forwards",
                    opacity: 0,
                  }}>
                    <div style={{
                      marginBottom: 8, padding: "4px 0",
                      borderBottom: `1px solid ${C.sync}15`,
                    }}>
                      <span style={{
                        fontSize: 8, color: C.sync, fontFamily: mono,
                        letterSpacing: 3, textTransform: "uppercase",
                      }}>
                        FREE NOTE
                      </span>
                    </div>
                    <RobotBubble text="おつかれさま。今日、一言あれば聞かせて。なくても大丈夫。" animate />
                    <div style={{
                      marginTop: 10, padding: "12px 14px", borderRadius: 14,
                      background: "rgba(255,255,255,0.6)",
                      backdropFilter: "blur(12px)",
                      WebkitBackdropFilter: "blur(12px)",
                      border: `1px solid ${C.sync}18`,
                      animation: "bubbleIn 0.4s ease 0.3s forwards",
                      opacity: 0,
                    }}>
                      <textarea
                        value={freeText}
                        onChange={(e) => {
                          if (e.target.value.length <= 200) setFreeText(e.target.value);
                        }}
                        placeholder="今日、一言あれば"
                        rows={3}
                        style={{
                          width: "100%", resize: "none", border: "none",
                          background: "transparent", outline: "none",
                          fontSize: 12.5, color: C.t1, lineHeight: 1.7,
                          fontFamily: "inherit",
                        }}
                      />
                      <div style={{
                        display: "flex", justifyContent: "space-between",
                        alignItems: "center", marginTop: 6,
                      }}>
                        <span style={{
                          fontSize: 9.5, color: freeText.length >= 180 ? C.pulse : C.t4,
                          fontFamily: mono, transition: "color 0.2s",
                        }}>
                          {freeText.length}/200
                        </span>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            type="button"
                            onClick={handleFreeTextSkip}
                            style={{
                              padding: "5px 14px", borderRadius: 12,
                              border: `1px solid ${C.t4}30`,
                              background: "transparent",
                              color: C.t3, fontSize: 11, fontWeight: 500,
                              cursor: "pointer", transition: "all 0.2s",
                            }}
                          >
                            スキップ
                          </button>
                          <button
                            type="button"
                            onClick={handleFreeTextSubmit}
                            disabled={freeText.trim().length === 0}
                            style={{
                              padding: "5px 14px", borderRadius: 12,
                              border: `1px solid ${C.sync}30`,
                              background: freeText.trim().length > 0
                                ? `linear-gradient(135deg,${C.sync}15,${C.neural}10)`
                                : "transparent",
                              color: freeText.trim().length > 0 ? C.sync : C.t4,
                              fontSize: 11, fontWeight: 600,
                              cursor: freeText.trim().length > 0 ? "pointer" : "default",
                              transition: "all 0.2s",
                              opacity: freeText.trim().length > 0 ? 1 : 0.5,
                            }}
                          >
                            送る
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              default:
                return null;
            }
          })}
        </div>

        {/* Footer: stop button or completion status */}
        <div style={{ padding: "0 14px 10px" }}>
          {showStopBtn && (
            <button
              type="button"
              onClick={handleStop}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "6px 14px", borderRadius: 14,
                background: "rgba(99,102,241,0.08)",
                border: "1px solid rgba(99,102,241,0.15)",
                color: C.t3, fontSize: 10.5, fontWeight: 500,
                cursor: "pointer", transition: "all 0.2s",
                margin: "0 auto",
              }}
            >
              今日はここまで
            </button>
          )}

          {phase === "stopped" && (
            <div style={{ position: "relative" }}>
              {/* Subtle pulsing glow behind insight card */}
              <div style={{
                position: "absolute", top: "50%", left: "50%",
                transform: "translate(-50%, -50%)",
                width: "80%", height: "80%",
                background: `radial-gradient(ellipse, ${C.sync}0A, ${C.neural}06, transparent 70%)`,
                filter: "blur(30px)", pointerEvents: "none",
                animation: "insightGlow 3s ease-in-out infinite",
              }} />

              {/* Checkmark animation */}
              <div style={{
                display: "flex", alignItems: "center", gap: 6,
                marginBottom: 14,
                opacity: 0, animation: "insightFadeUp 0.5s ease forwards",
              }}>
                <div style={{
                  width: 18, height: 18, borderRadius: 9,
                  background: hasMicroAnswers ? `${C.neural}20` : `${C.sync}20`,
                  border: `1px solid ${hasMicroAnswers ? C.neural : C.sync}35`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 10, color: hasMicroAnswers ? C.neural : C.sync,
                  animation: "checkPop 0.4s ease 0.2s forwards",
                  transform: "scale(0.5)", opacity: 0,
                }}>
                  ✓
                </div>
                <span style={{ fontSize: 9, color: C.t4, fontFamily: mono, letterSpacing: 1 }}>
                  {hasMicroAnswers ? "DEEP OBSERVED" : "OBSERVED"}
                  {` · ${session.totalAnswered}Q`}
                </span>
              </div>

              {/* Layer 1: 今日の観測結果 (immediate) */}
              <div style={{
                opacity: 0, animation: "insightFadeUp 0.6s ease 0.3s forwards",
                marginBottom: 12,
              }}>
                <p style={{
                  fontSize: 9, color: C.sync, fontFamily: mono,
                  letterSpacing: 3, marginBottom: 8, textTransform: "uppercase",
                }}>
                  今日の観測結果
                </p>
                <div style={{
                  padding: "10px 12px", borderRadius: 12,
                  background: `linear-gradient(135deg,#e8ecf8,#dde2f2)`,
                  border: `1px solid ${C.sync}12`,
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontSize: 11, color: C.t2, fontWeight: 500 }}>
                      回答数: <span style={{ color: C.sync, fontWeight: 700 }}>{session.totalAnswered}</span>問
                    </span>
                    {streakCount > 1 && (
                      <span style={{
                        fontSize: 10, color: C.pulse, fontWeight: 600,
                        padding: "2px 8px", borderRadius: 10,
                        background: `${C.pulse}12`,
                        border: `1px solid ${C.pulse}20`,
                      }}>
                        {streakCount}日連続
                      </span>
                    )}
                  </div>
                  {observedCategories.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {observedCategories.map((cat) => {
                        const catColors: Record<string, string> = {
                          partner: "#FF6B9D",
                          outfit: "#4AEAFF",
                          care: "#34D399",
                          preparation: "#FBBF24",
                          impression: "#8B5CF6",
                        };
                        const color = catColors[cat] ?? C.t3;
                        return (
                          <span key={cat} style={{
                            fontSize: 9.5, fontWeight: 500,
                            padding: "2px 8px", borderRadius: 8,
                            background: `${color}12`,
                            border: `1px solid ${color}20`,
                            color,
                          }}>
                            {CATEGORY_LABELS[cat]}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Layer 2: 見えてきたこと (1s delay) */}
              {completionInsight && (
                <div style={{
                  opacity: 0, animation: "insightFadeUp 0.7s ease 1s forwards",
                  marginBottom: 12,
                }}>
                  <p style={{
                    fontSize: 9, color: C.neural, fontFamily: mono,
                    letterSpacing: 3, marginBottom: 8,
                  }}>
                    見えてきたこと
                  </p>
                  <div style={{
                    padding: "12px 14px", borderRadius: 12,
                    background: `linear-gradient(145deg,${C.neural}08,${C.sync}04)`,
                    border: `1px solid ${C.neural}15`,
                    display: "flex", flexDirection: "column", gap: 10,
                  }}>
                    {/* Primary insight */}
                    <p style={{
                      fontSize: 12, color: C.t1, lineHeight: 1.7, margin: 0,
                      fontWeight: 500,
                    }}>
                      {completionInsight.primary}
                    </p>

                    {/* Revealed */}
                    {completionInsight.revealed && (
                      <div style={{
                        paddingLeft: 10,
                        borderLeft: `2px solid ${C.sync}30`,
                      }}>
                        <p style={{
                          fontSize: 11, color: C.t2, lineHeight: 1.65, margin: 0,
                        }}>
                          {completionInsight.revealed}
                        </p>
                      </div>
                    )}

                    {/* Mystery */}
                    {completionInsight.mystery && (
                      <div style={{
                        paddingLeft: 10,
                        borderLeft: `2px solid ${C.neural}25`,
                      }}>
                        <p style={{
                          fontSize: 11, color: C.t3, lineHeight: 1.65, margin: 0,
                          fontStyle: "italic",
                        }}>
                          {completionInsight.mystery}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Layer 3: 明日への問い (2s delay) */}
              {completionInsight?.returnPrompt && (
                <div style={{
                  opacity: 0, animation: "insightFadeUp 0.7s ease 2s forwards",
                  marginBottom: 8,
                }}>
                  <p style={{
                    fontSize: 9, color: C.pulse, fontFamily: mono,
                    letterSpacing: 3, marginBottom: 8,
                  }}>
                    明日への問い
                  </p>
                  <div style={{
                    padding: "10px 14px", borderRadius: 12,
                    background: `linear-gradient(135deg,${C.pulse}06,${C.neural}04)`,
                    border: `1px solid ${C.pulse}12`,
                  }}>
                    <p style={{
                      fontSize: 11.5, color: C.t2, lineHeight: 1.7, margin: 0,
                    }}>
                      {completionInsight.returnPrompt}
                    </p>
                  </div>
                </div>
              )}

              {/* Layer 4: 予測された傾向 (2.5s delay) */}
              {resonancePredictions.length > 0 && (
                <div style={{
                  opacity: 0, animation: "insightFadeUp 0.7s ease 2.5s forwards",
                  marginBottom: 8,
                }}>
                  <p style={{
                    fontSize: 9, color: C.t4, fontFamily: mono,
                    letterSpacing: 3, marginBottom: 8,
                  }}>
                    予測された傾向
                  </p>
                  <div style={{
                    padding: "10px 14px", borderRadius: 12,
                    background: `linear-gradient(135deg,#e8ecf8,#dde2f2)`,
                    border: `1px solid ${C.t4}10`,
                  }}>
                    {resonancePredictions.map((p, i) => (
                      <p key={i} style={{
                        fontSize: 10.5, color: C.t3, lineHeight: 1.65, margin: i > 0 ? "6px 0 0" : 0,
                      }}>
                        {p.label}
                        <span style={{ fontSize: 9, color: C.t4, marginLeft: 6 }}>
                          (確信度 {Math.round(p.confidence * 100)}%)
                        </span>
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {/* Layer 5: セッション横断ナラティブ (3s delay) */}
              {crossSessionInsights.length > 0 && (
                <div style={{
                  opacity: 0, animation: "insightFadeUp 0.7s ease 3s forwards",
                  marginBottom: 8,
                }}>
                  <p style={{
                    fontSize: 9, color: "#34D399", fontFamily: mono,
                    letterSpacing: 3, marginBottom: 8,
                  }}>
                    日々の流れ
                  </p>
                  <div style={{
                    padding: "12px 14px", borderRadius: 12,
                    background: `linear-gradient(145deg, rgba(52,211,153,0.06), ${C.neural}04)`,
                    border: "1px solid rgba(52,211,153,0.12)",
                    display: "flex", flexDirection: "column", gap: 10,
                  }}>
                    {crossSessionInsights.map((ins, i) => (
                      <div key={i} style={{
                        paddingLeft: i > 0 ? 10 : 0,
                        borderLeft: i > 0 ? "2px solid rgba(52,211,153,0.2)" : undefined,
                      }}>
                        <p style={{
                          fontSize: i === 0 ? 12 : 11, color: i === 0 ? C.t1 : C.t2,
                          lineHeight: 1.7, margin: 0,
                          fontWeight: i === 0 ? 500 : 400,
                        }}>
                          {ins.text}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Layer 6: シャドウの一言 (3.5s delay) */}
              {shadowWhisper && (
                <div style={{
                  opacity: 0, animation: "insightFadeUp 0.8s ease 3.5s forwards",
                  marginBottom: 8,
                }}>
                  <p style={{
                    fontSize: 9, color: "#A78BFA", fontFamily: mono,
                    letterSpacing: 3, marginBottom: 8,
                  }}>
                    もうひとりの一言
                  </p>
                  <div style={{
                    padding: "14px 16px", borderRadius: 14,
                    background: "linear-gradient(145deg, rgba(167,139,250,0.08), rgba(139,92,246,0.04))",
                    border: "1px solid rgba(167,139,250,0.18)",
                    position: "relative",
                    overflow: "hidden",
                  }}>
                    {/* Subtle shadow aura */}
                    <div style={{
                      position: "absolute", top: -20, right: -20,
                      width: 60, height: 60, borderRadius: "50%",
                      background: "radial-gradient(circle, rgba(139,92,246,0.12), transparent 70%)",
                      pointerEvents: "none",
                    }} />
                    <p style={{
                      fontSize: 12, color: C.t1, lineHeight: 1.75, margin: 0,
                      fontStyle: "italic", position: "relative",
                    }}>
                      {shadowWhisper}
                    </p>
                    <a
                      href="/stargazer/alter"
                      onClick={(e) => {
                        e.preventDefault();
                        trackWhisperClicked();
                        try {
                          const handoff = {
                            date: new Date().toISOString().slice(0, 10),
                            whisper: shadowWhisper,
                            signal: {
                              contradictionDetected: shadowWhisperSignalRef.current?.contradictionDetected ?? null,
                              extremeAxis: shadowWhisperSignalRef.current?.extremeAxis ?? null,
                              repeatingPattern: shadowWhisperSignalRef.current?.repeatingPattern ?? null,
                            },
                            axisScores: shadowWhisperAxisScoresRef.current ?? {},
                            savedAt: new Date().toISOString(),
                          };
                          localStorage.setItem(
                            "culcept_alter_handoff_v1",
                            JSON.stringify(handoff),
                          );
                        } catch { /* localStorage 書き込み失敗は無視 */ }
                        window.location.href = "/stargazer/alter";
                      }}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 4,
                        marginTop: 10, padding: "5px 12px", borderRadius: 12,
                        background: "rgba(139,92,246,0.08)",
                        border: "1px solid rgba(139,92,246,0.15)",
                        color: "#A78BFA", fontSize: 10, fontWeight: 500,
                        textDecoration: "none", transition: "all 0.2s",
                        position: "relative", cursor: "pointer",
                      }}
                    >
                      <span style={{ fontSize: 12 }}>👤</span>
                      話す？
                    </a>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes robotFloat {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-3px); }
        }
        @keyframes bubbleIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes insightFadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes insightGlow {
          0%, 100% { opacity: 0.4; transform: translate(-50%, -50%) scale(1); }
          50% { opacity: 0.7; transform: translate(-50%, -50%) scale(1.05); }
        }
        @keyframes checkPop {
          0% { transform: scale(0.5); opacity: 0; }
          60% { transform: scale(1.15); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes thinkingDot {
          0%, 100% { opacity: 0.3; transform: translateY(0); }
          50% { opacity: 1; transform: translateY(-3px); }
        }
      `}</style>
    </section>
  );
}
