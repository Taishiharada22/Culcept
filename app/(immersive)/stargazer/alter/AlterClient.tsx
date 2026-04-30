"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  GlassCard,
  GlassButton,
  GlassBadge,
  GlassInput,
  FadeInView,
  Skeleton,
} from "@/components/ui/glassmorphism-design";
import type { AlterMode, AlterPersonality } from "@/lib/stargazer/alter";
import { trackFeatureView, trackAlterTurn } from "@/lib/stargazer/trackClient";
import { PART_PERSONAS, type InnerPart } from "@/lib/stargazer/partsDialogue";
import type { ProtectiveStructure } from "@/lib/stargazer/generativeCore";
import StargazerLoading from "../_shared/StargazerLoading";
import AlterMemoryConfrontation from "../_components/AlterMemoryConfrontation";
// AlterSilence can be used in the chat flow to insert meaningful pauses:
// import AlterSilence from "../_components/AlterSilence";
// Usage: <AlterSilence followUpText="..." onComplete={() => {}} durationMs={3000} />
import {
  generateAfterglow,
  saveAfterglow,
  type SessionSummaryForAfterglow,
} from "@/lib/stargazer/alterAfterglowEngine";
import { updateEngagementField } from "@/lib/stargazer/engagementScore";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * W3 P2: 候補カード描画用の最小 type (lib/alter-morning/search/normalizedPlace の subset).
 * server から送られてくる morningProtocol.candidates をそのまま受ける形で型定義.
 */
interface AlterMorningCandidate {
  placeId: string;
  displayName: string;
  address: string;
  coordinates: { lat: number; lng: number };
  distanceFromAnchor: number | null;
  category: string | null;
  chainToken: string | null;
}

interface ChatMessage {
  id: string;
  role: "alter" | "user" | "system";
  content: string;
  mode: AlterMode;
  timestamp: string;
  isInsight?: boolean;
  /** W3 P2: 朝予定の候補地リスト (search_candidates_presented 状態で server から bridge) */
  candidates?: AlterMorningCandidate[];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Handoff from Shadow Whisper
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface AlterHandoff {
  date: string;
  whisper: string;
  signal: {
    extremeAxis?: { axis: string; label: string; score: number } | null;
    repeatingPattern?: { axis: string; label: string; dayCount: number } | null;
  };
  axisScores: Record<string, number>;
  savedAt: string;
}

const HANDOFF_KEY = "culcept_alter_handoff_v1";
const HANDOFF_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes
const SESSION_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function createSessionId(): string {
  if (
    typeof globalThis !== "undefined" &&
    "crypto" in globalThis &&
    typeof globalThis.crypto?.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }
  return `00000000-0000-4000-8000-${Date.now().toString().padStart(12, "0").slice(-12)}`;
}

function isUuidSessionId(value: unknown): value is string {
  return typeof value === "string" && SESSION_ID_RE.test(value);
}

function looksBrokenLoadedAlterMessage(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  const openingQuotes = (trimmed.match(/[「『（【]/g) ?? []).length;
  const closingQuotes = (trimmed.match(/[」』）】]/g) ?? []).length;
  if (openingQuotes > closingQuotes) return true;
  if (/[。！？?…」』】]$/.test(trimmed)) return false;
  return trimmed.length < 120;
}

function readAndConsumeHandoff(): AlterHandoff | null {
  try {
    const raw = localStorage.getItem(HANDOFF_KEY);
    if (!raw) return null;
    localStorage.removeItem(HANDOFF_KEY);

    const data: AlterHandoff = JSON.parse(raw);

    // Validate date is today
    const today = new Date().toISOString().slice(0, 10);
    if (data.date !== today) return null;

    // Validate savedAt is within 30 minutes
    const savedAt = new Date(data.savedAt).getTime();
    if (Date.now() - savedAt > HANDOFF_MAX_AGE_MS) return null;

    if (!data.whisper) return null;

    return data;
  } catch {
    return null;
  }
}

const MODE_CONFIG: Record<
  AlterMode,
  { label: string; accent: string; borderColor: string; bgTint: string; textStyle: string }
> = {
  warm: {
    label: "温かい",
    accent: "text-amber-600",
    borderColor: "border-amber-200/60",
    bgTint: "from-amber-50/80 to-orange-50/40",
    textStyle: "",
  },
  provocative: {
    label: "挑発的",
    accent: "text-rose-600",
    borderColor: "border-rose-200/60",
    bgTint: "from-rose-50/80 to-purple-50/40",
    textStyle: "italic",
  },
  analytical: {
    label: "分析的",
    accent: "text-blue-600",
    borderColor: "border-blue-200/60",
    bgTint: "from-blue-50/80 to-indigo-50/40",
    textStyle: "font-mono-sg",
  },
  parts: {
    label: "パーツ",
    accent: "text-purple-600",
    borderColor: "border-purple-200/60",
    bgTint: "from-purple-50/80 to-violet-50/40",
    textStyle: "",
  },
};

// Parts mode: mapping from PART_PERSONAS keys to display order
const PARTS_LIST = Object.entries(PART_PERSONAS) as [
  ProtectiveStructure["patternType"],
  InnerPart,
][];

// Layer1 archetype → 推定活性パーツのマッピング
// P (Proof) → overcompensation, mask
// B (Bond) → avoidance, withdrawal
// H (Haven) → control, avoidance
const LAYER1_TO_ACTIVE_PARTS: Record<string, ProtectiveStructure["patternType"][]> = {
  P: ["overcompensation", "mask"],
  B: ["avoidance", "withdrawal"],
  H: ["control", "avoidance"],
};

/**
 * localStorage のアーキタイプコードから推定活性パーツを取得する。
 * コード形式: "P-xxx-xxx" のように Layer1 が先頭1文字。
 */
function getEstimatedActiveParts(): Set<ProtectiveStructure["patternType"]> {
  try {
    const code = localStorage.getItem("stargazer_archetype_v1");
    if (!code) return new Set();
    const layer1 = code.charAt(0); // P, B, or H
    const parts = LAYER1_TO_ACTIVE_PARTS[layer1];
    return parts ? new Set(parts) : new Set();
  } catch {
    return new Set();
  }
}

/**
 * パーツリストを推定活性パーツ優先でソートして返す
 */
function getSortedPartsList(): {
  list: [ProtectiveStructure["patternType"], InnerPart][];
  activeParts: Set<ProtectiveStructure["patternType"]>;
} {
  const activeParts = getEstimatedActiveParts();
  if (activeParts.size === 0) return { list: PARTS_LIST, activeParts };

  const sorted = [...PARTS_LIST].sort((a, b) => {
    const aActive = activeParts.has(a[0]) ? 0 : 1;
    const bActive = activeParts.has(b[0]) ? 0 : 1;
    return aActive - bActive;
  });
  return { list: sorted, activeParts };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Candidate Card List (W3 P2)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// CEO 不変条件:
//   - search_candidates_presented 状態で server が bridge した候補を表示するのみ
//   - 候補選択は P2 では仕様外 (UI 表示のみ、tap で何も起きない)
//   - phase / plan / persistedEvents を変更する操作は含めない
//   - 0 件の時は親側で render しないため、ここでは empty state を持たない

function CandidateCardList({
  candidates,
}: {
  candidates: AlterMorningCandidate[];
}) {
  return (
    <div className="mt-3 space-y-2">
      <p className="text-[11px] font-medium text-slate-500">
        候補がいくつか見つかりました
      </p>
      {candidates.map((c) => (
        <div
          key={c.placeId}
          className="rounded-xl border border-slate-200/60 bg-white/60 backdrop-blur-sm px-3 py-2 shadow-sm"
        >
          <p className="text-[13px] font-semibold text-slate-800 leading-tight">
            {c.displayName}
          </p>
          {c.address && (
            <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
              {c.address}
            </p>
          )}
          {c.distanceFromAnchor != null && (
            <p className="text-[10px] text-slate-400 mt-0.5">
              アンカーから {Math.round(c.distanceFromAnchor)}m
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Message Bubble
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function AlterBubble({
  message,
  isLatest,
}: {
  message: ChatMessage;
  isLatest: boolean;
}) {
  const modeConfig = MODE_CONFIG[message.mode];

  // Mode-specific entrance animations
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const modeAnimations: Record<AlterMode, { initial: any; animate: any; transition: any }> = {
    warm: {
      // Gentle fade up - like a warm presence arriving
      initial: { opacity: 0, y: 12, scale: 0.98 },
      animate: { opacity: 1, y: 0, scale: 1 },
      transition: {
        opacity: { duration: 0.2 },
        y: { duration: 0.25, ease: "easeOut" },
        scale: { duration: 0.2, ease: "easeOut" },
      },
    },
    provocative: {
      // Shake entry - like a jolt of honesty
      initial: { opacity: 0, x: -16, rotate: 0 },
      animate: {
        opacity: 1,
        x: 0,
        rotate: isLatest ? [0, -1.5, 1.5, -0.8, 0.4, 0] : 0,
      },
      transition: {
        opacity: { duration: 0.25 },
        x: { duration: 0.18, ease: "easeOut" },
        rotate: { duration: 0.25, delay: 0.2, ease: "easeOut" },
      },
    },
    analytical: {
      // Crisp slide from left - precise and clinical
      initial: { opacity: 0, x: -24, scaleX: 0.95 },
      animate: { opacity: 1, x: 0, scaleX: 1 },
      transition: {
        opacity: { duration: 0.2 },
        x: { duration: 0.2, ease: [0.23, 1, 0.32, 1] },
        scaleX: { duration: 0.18, ease: [0.23, 1, 0.32, 1] },
      },
    },
    parts: {
      // Soft pulse from center - a part emerging from within
      initial: { opacity: 0, scale: 0.94, y: 8 },
      animate: { opacity: 1, scale: 1, y: 0 },
      transition: {
        opacity: { duration: 0.2 },
        scale: { duration: 0.22, ease: [0.34, 1.56, 0.64, 1] },
        y: { duration: 0.2, ease: "easeOut" },
      },
    },
  };

  const anim = modeAnimations[message.mode];

  return (
    <motion.div
      initial={anim.initial}
      animate={anim.animate}
      transition={anim.transition}
      className="flex justify-start max-w-[85%]"
    >
      <div
        className={`
          rounded-2xl rounded-tl-md px-4 py-3
          backdrop-blur-lg border shadow-sm
          bg-gradient-to-br ${modeConfig.bgTint} ${modeConfig.borderColor}
        `}
      >
        {/* Mode indicator */}
        <div className="flex items-center gap-1.5 mb-1.5">
          <div
            className={`w-1.5 h-1.5 rounded-full ${message.mode === "warm"
                ? "bg-amber-400"
                : message.mode === "provocative"
                  ? "bg-rose-400"
                  : message.mode === "parts"
                    ? "bg-purple-400"
                    : "bg-blue-400"
              }`}
          />
          <span className={`text-[10px] font-medium ${modeConfig.accent}`}>
            {modeConfig.label}
          </span>
        </div>

        {/* Content */}
        <p
          className={`text-sm leading-relaxed text-slate-800 whitespace-pre-line ${modeConfig.textStyle}`}
        >
          {message.content}
        </p>

        {/* W3 P2: 朝予定の候補カード list (activePresentation.candidates が存在する場合のみ) */}
        {message.candidates && message.candidates.length > 0 && (
          <CandidateCardList candidates={message.candidates} />
        )}

        {/* Insight highlight */}
        {message.isInsight && (
          <div className="mt-2 px-2 py-1 rounded-lg bg-gradient-to-r from-purple-100/80 to-indigo-100/80 border border-purple-200/50">
            <p className="text-[10px] font-semibold text-purple-700">
              洞察が生成されました
            </p>
          </div>
        )}

        {/* Timestamp */}
        <p className="text-[10px] text-slate-400 mt-1.5 text-right">
          {new Date(message.timestamp).toLocaleTimeString("ja-JP", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>
    </motion.div>
  );
}

function UserBubble({ message }: { message: ChatMessage }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.18 }}
      className="flex justify-end max-w-[85%] ml-auto"
    >
      <div className="rounded-2xl rounded-tr-md px-4 py-3 bg-white/70 backdrop-blur-lg border border-slate-200/60 shadow-sm">
        <p className="text-sm leading-relaxed text-slate-800 whitespace-pre-line">
          {message.content}
        </p>
        <p className="text-[10px] text-slate-400 mt-1.5 text-right">
          {new Date(message.timestamp).toLocaleTimeString("ja-JP", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>
    </motion.div>
  );
}

function SystemBubble({ message }: { message: ChatMessage }) {
  const modeConfig = MODE_CONFIG[message.mode];
  const modeColor = message.mode === "warm"
    ? "rgba(217,119,6,0.15)"
    : message.mode === "provocative"
      ? "rgba(225,29,72,0.12)"
      : message.mode === "parts"
        ? "rgba(168,85,247,0.12)"
        : "rgba(59,130,246,0.12)";
  const borderColor = message.mode === "warm"
    ? "rgba(217,119,6,0.2)"
    : message.mode === "provocative"
      ? "rgba(225,29,72,0.15)"
      : message.mode === "parts"
        ? "rgba(168,85,247,0.18)"
        : "rgba(59,130,246,0.15)";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className="flex justify-center my-2"
    >
      <div
        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full backdrop-blur-sm"
        style={{
          background: modeColor,
          border: `1px solid ${borderColor}`,
        }}
      >
        <motion.div
          className={`w-1.5 h-1.5 rounded-full ${message.mode === "warm"
              ? "bg-amber-400"
              : message.mode === "provocative"
                ? "bg-rose-400"
                : message.mode === "parts"
                  ? "bg-purple-400"
                  : "bg-blue-400"
            }`}
          animate={{ scale: [1, 1.4, 1] }}
          transition={{ duration: 1, repeat: 2 }}
        />
        <p className="text-[11px] text-slate-500 font-medium">
          {message.content}
        </p>
      </div>
    </motion.div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Typing Indicator
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const THINKING_PHRASES = [
  "うーん...",
  "そうだなあ...",
  "そうですね...",
  "考えますね...",
  "ちょっと待って...",
  "なるほど..!.",
  "ふむふむ...",
  "えっとー...",
  "ちょっと考えさせて下さい...",
  "そうだなあ...",
];

function TypingIndicator({ mode }: { mode: AlterMode }) {
  const modeConfig = MODE_CONFIG[mode];
  const [text, setText] = useState("");
  const phraseIdxRef = useRef(Math.floor(Math.random() * THINKING_PHRASES.length));

  useEffect(() => {
    let charIdx = 0;
    let currentPhraseIdx = phraseIdxRef.current;
    let phrase = THINKING_PHRASES[currentPhraseIdx];
    let phase: "typing" | "pause" | "erasing" = "typing";
    let cancelled = false;

    function tick() {
      if (cancelled) return;
      if (phase === "typing") {
        if (charIdx <= phrase.length) {
          setText(phrase.slice(0, charIdx));
          charIdx++;
          setTimeout(tick, 80 + Math.random() * 60);
        } else {
          phase = "pause";
          setTimeout(tick, 1200 + Math.random() * 600);
        }
      } else if (phase === "pause") {
        phase = "erasing";
        setTimeout(tick, 40);
      } else if (phase === "erasing") {
        if (charIdx > 0) {
          charIdx--;
          setText(phrase.slice(0, charIdx));
          setTimeout(tick, 30);
        } else {
          currentPhraseIdx = (currentPhraseIdx + 1) % THINKING_PHRASES.length;
          phrase = THINKING_PHRASES[currentPhraseIdx];
          phase = "typing";
          setTimeout(tick, 300);
        }
      }
    }

    tick();
    return () => { cancelled = true; };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex justify-start max-w-[85%]"
    >
      <div
        className={`
          rounded-2xl rounded-tl-md px-4 py-3
          backdrop-blur-lg border shadow-sm
          bg-gradient-to-br ${modeConfig.bgTint} ${modeConfig.borderColor}
        `}
      >
        <span className={`text-sm ${modeConfig.accent}`}>
          {text}
          <motion.span
            className="inline-block w-[2px] h-[14px] ml-[1px] align-middle"
            style={{ background: "currentColor" }}
            animate={{ opacity: [1, 0, 1] }}
            transition={{ duration: 0.8, repeat: Infinity }}
          />
        </span>
      </div>
    </motion.div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Loading Skeleton
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function LoadingSkeleton() {
  return <StargazerLoading variant="alter" />;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function AlterClient() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [personality, setPersonality] = useState<AlterPersonality | null>(null);
  const [currentMode, setCurrentMode] = useState<AlterMode>("warm");
  const [sessionId, setSessionId] = useState<string>("");
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [typing, setTyping] = useState(false);
  const [noData, setNoData] = useState(false);
  const [showConfrontation, setShowConfrontation] = useState(false);
  const [confrontationData, setConfrontationData] = useState<{
    pastRevelation?: { quote: string; date: string; emotion: string };
    contradiction?: { statement1: string; statement2: string; date1: string; date2: string };
    avoidedTopic?: string;
    trustLevel: number;
  } | null>(null);
  const [confrontationDismissed, setConfrontationDismissed] = useState(false);
  const [growthInfo, setGrowthInfo] = useState<{
    sessionsCompleted: number;
    trustLevel: number;
    coreWoundConfidence: number;
  } | null>(null);
  const [selfReport, setSelfReport] = useState<string | null>(null);
  const [showPartsSelector, setShowPartsSelector] = useState(false);
  const [activePartKey, setActivePartKey] = useState<ProtectiveStructure["patternType"] | null>(null);
  const sessionStartRef = useRef<number>(Date.now());
  const chatEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // Analytics: track page view
  useEffect(() => { trackFeatureView("alter"); }, []);

  // Fetch Alter data on mount
  useEffect(() => {
    const fetchAlter = async () => {
      try {
        const res = await fetch("/api/stargazer/alter");
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData?.message || "Failed to fetch");
        }

        const data = await res.json();

        if (!data.personality) {
          setNoData(true);
          setLoading(false);
          return;
        }

        setPersonality(data.personality);

        // Store growth info for display
        if (data.growthInfo) {
          setGrowthInfo(data.growthInfo);
        }

        const recentSessions = Array.isArray(data.recentSessions)
          ? data.recentSessions
          : [];
        const loadedSessions = recentSessions
          .filter((session: any) => isUuidSessionId(session?.sessionId))
          .map((session: any) => {
            const loadedMessages: ChatMessage[] = (session.messages ?? [])
              .sort(
                (a: { created_at: string }, b: { created_at: string }) =>
                  a.created_at.localeCompare(b.created_at)
              )
              .map(
                (m: {
                  id?: string;
                  role: string;
                  content?: string;
                  message?: string;
                  mode?: string;
                  alter_mode?: string | null;
                  created_at: string;
                  insight_generated?: string | null;
                }) => ({
                  id: m.id ?? `${m.created_at}_${m.role}`,
                  role: m.role as "alter" | "user",
                  content: m.content ?? m.message ?? "",
                  mode: (m.mode as AlterMode) ?? (m.alter_mode as AlterMode) ?? "warm",
                  timestamp: m.created_at,
                  isInsight: !!m.insight_generated,
                })
              )
              .filter((m: ChatMessage) => m.content.trim().length > 0);

            const hasBrokenAlterMessage = loadedMessages.some(
              (m) => m.role === "alter" && looksBrokenLoadedAlterMessage(m.content)
            );

            return {
              sessionId: session.sessionId as string,
              summary: session.summary,
              messages: loadedMessages.filter(
                (m) =>
                  m.role !== "alter" ||
                  !looksBrokenLoadedAlterMessage(m.content)
              ),
              hasBrokenAlterMessage,
            };
          });
        const recent = loadedSessions.find(
          (session: any) =>
            !session.hasBrokenAlterMessage &&
            session.messages.some((message: any) => message.role === "alter")
        );

        // Load recent session messages if available and continuable
        if (recent) {
          if (recent.messages.length > 0) {
            setSessionId(recent.sessionId);
            setMessages(recent.messages);
            const lastAlterMsg = [...recent.messages]
              .reverse()
              .find((m) => m.role === "alter");
            if (lastAlterMsg) {
              setCurrentMode(lastAlterMsg.mode);
            }
          } else {
            setSessionId(createSessionId());
          }
        } else {
          setSessionId(createSessionId());
        }

        // Check for past session data to show Memory Confrontation
        if (loadedSessions.length > 1 || recent?.summary) {
          const pastSession = loadedSessions.length > 1
            ? loadedSessions[1]
            : recent;
          if (pastSession) {
            const cData: typeof confrontationData = {
              trustLevel: (data.personality?.trustLevel as number | undefined) ?? 0.3,
            };
            if (pastSession.summary?.quote) {
              cData.pastRevelation = {
                quote: pastSession.summary.quote,
                date: pastSession.summary.date ?? "",
                emotion: pastSession.summary.emotion ?? "",
              };
            }
            if (pastSession.summary?.contradiction) {
              cData.contradiction = pastSession.summary.contradiction;
            }
            if (pastSession.summary?.avoidedTopic) {
              cData.avoidedTopic = pastSession.summary.avoidedTopic;
            }
            // Only show if we have at least one piece of data
            if (cData.pastRevelation || cData.contradiction || cData.avoidedTopic) {
              setConfrontationData(cData);
              setShowConfrontation(true);
            }
          }
        }
      } catch {
        setNoData(true);
      } finally {
        setLoading(false);
      }
    };

    fetchAlter();
  }, []);

  // Scroll to bottom on new messages
  useEffect(() => {
    scrollToBottom();
  }, [messages, typing, scrollToBottom]);

  // Send greeting on first visit (no existing messages)
  useEffect(() => {
    if (personality && sessionId && messages.length === 0 && !loading) {
      // Check for handoff context from Shadow Whisper
      const handoff = readAndConsumeHandoff();
      sendMessage("...", true, handoff ?? undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personality, sessionId, messages.length, loading]);

  const sendMessage = async (text: string, isGreeting = false, handoff?: AlterHandoff) => {
    if (sending || !text.trim() || !sessionId) return;

    const userMsg: ChatMessage = {
      id: `user_${Date.now()}`,
      role: "user",
      content: text.trim(),
      mode: currentMode,
      timestamp: new Date().toISOString(),
    };

    // Don't show user message for initial greeting trigger
    if (!isGreeting) {
      setMessages((prev) => [...prev, userMsg]);
    }

    setInputValue("");
    setSending(true);
    setTyping(true);

    // Simulated typing delay
    const typingDelay = 800 + Math.random() * 1200;

    try {
      const postBody: Record<string, unknown> = {
        sessionId,
        message: text.trim(),
        mode: currentMode,
      };
      if (handoff) {
        postBody.handoffContext = {
          whisper: handoff.whisper,
          signal: handoff.signal,
          axisScores: handoff.axisScores,
        };
      }
      const res = await fetch("/api/stargazer/alter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(postBody),
      });

      // レスポンスステータスチェック
      if (!res.ok) {
        await new Promise((resolve) => setTimeout(resolve, typingDelay));
        setTyping(false);
        const errorMsg: ChatMessage = {
          id: `err_${Date.now()}`,
          role: "system" as const,
          content: res.status === 401 ? "セッションが切れました。ページを更新してください。"
            : res.status === 400 ? "観測データが不足しています。先に観測を行ってください。"
              : "サーバーエラーが発生しました。もう一度お試しください。",
          mode: currentMode,
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, errorMsg]);
        setSending(false);
        return;
      }

      const data = await res.json();

      // Wait for typing indicator
      await new Promise((resolve) => setTimeout(resolve, typingDelay));
      setTyping(false);

      if (data.ok) {
        const newMode = data.mode as AlterMode;

        // Mode change system message
        if (newMode !== currentMode) {
          const systemMsg: ChatMessage = {
            id: `sys_${Date.now()}`,
            role: "system",
            content: `対話モードが「${MODE_CONFIG[newMode].label}」に変化しました`,
            mode: newMode,
            timestamp: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, systemMsg]);
          setCurrentMode(newMode);
        }

        // W3 P2: 朝予定の候補カードを bridge から取得
        // server (route.ts) で activePresentation.candidates が
        // morningProtocol.candidates に spread されている (search_candidates_presented 状態のみ)
        const candidatesFromServer:
          | AlterMorningCandidate[]
          | undefined = Array.isArray(data?.morningProtocol?.candidates)
          ? (data.morningProtocol.candidates as AlterMorningCandidate[])
          : undefined;

        const alterMsg: ChatMessage = {
          id: `alter_${Date.now()}`,
          role: "alter",
          content: data.response,
          mode: newMode,
          timestamp: new Date().toISOString(),
          ...(candidatesFromServer && candidatesFromServer.length > 0
            ? { candidates: candidatesFromServer }
            : {}),
        };

        setMessages((prev) => {
          const updated = [...prev, alterMsg];
          const turnCount = updated.filter((m) => m.role !== "system").length;
          trackAlterTurn(sessionId, newMode, turnCount);
          return updated;
        });

        if (data.personality) {
          setPersonality(data.personality);
        }
        if (data.sessionId) {
          setSessionId(data.sessionId);
        }
      } else {
        const errorMsg: ChatMessage = {
          id: `err_${Date.now()}`,
          role: "system",
          content: "応答の取得に失敗しました。もう一度お試しください。",
          mode: currentMode,
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, errorMsg]);
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, typingDelay));
      setTyping(false);
      const errorMsg: ChatMessage = {
        id: `err_${Date.now()}`,
        role: "system",
        content: "通信エラーが発生しました。",
        mode: currentMode,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setSending(false);
    }
  };

  // ── Session ending detection ──
  const CLOSING_PATTERNS = /ありがとう|じゃあ|おやすみ|また[ね]?$|バイバイ|さよなら|終わり/;

  const endSession = useCallback(async () => {
    if (!sessionId) return;
    try {
      const res = await fetch("/api/stargazer/alter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, action: "end_session" }),
      });
      const data = await res.json();
      if (data.ok && data.summarized) {
        const systemMsg: ChatMessage = {
          id: `sys_end_${Date.now()}`,
          role: "system",
          content: "セッションの記録が保存されました",
          mode: currentMode,
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, systemMsg]);
      }

      // Display self-report if returned (generated every 5 sessions)
      if (data.selfReport) {
        setSelfReport(data.selfReport);
      }

      // Generate and save afterglow message for later display
      try {
        const userMessages = messages.filter((m) => m.role === "user");
        const alterMessages = messages.filter((m) => m.role === "alter");
        const sessionSummary: SessionSummaryForAfterglow = {
          keyTopics: alterMessages
            .filter((m) => m.isInsight)
            .map((m) => m.content.slice(0, 100))
            .slice(0, 3),
          emotionalPeak: alterMessages
            .find((m) => m.isInsight)?.content?.slice(0, 100) ?? "",
          unfinishedThread: undefined,
          userQuotes: userMessages
            .map((m) => m.content.slice(0, 80))
            .slice(-3),
        };
        // Fall back to last user messages as key topics if no insights
        if (sessionSummary.keyTopics.length === 0) {
          sessionSummary.keyTopics = userMessages
            .map((m) => m.content.slice(0, 60))
            .slice(-2);
        }
        const sessionDuration = Math.floor(
          (Date.now() - sessionStartRef.current) / 1000,
        );
        const afterglow = generateAfterglow({
          sessionSummary,
          trustLevel: 0.3,
          sessionDuration,
          mode: currentMode === "parts" ? "warm" : currentMode as "warm" | "provocative" | "analytical",
        });
        saveAfterglow(afterglow);
      } catch {
        // Non-fatal: afterglow generation is best-effort
      }
    } catch {
      // Non-fatal: session end summary is best-effort
    }
  }, [sessionId, currentMode, messages, personality]);

  const handleSelectPart = (partKey: ProtectiveStructure["patternType"]) => {
    const part = PART_PERSONAS[partKey];
    setActivePartKey(partKey);
    setCurrentMode("parts");
    setShowPartsSelector(false);

    // Inject system message so the backend knows which part is active
    const sysMsg: ChatMessage = {
      id: `sys_parts_${Date.now()}`,
      role: "system",
      content: `パーツモード開始 — 「${part.name}」と話しています`,
      mode: "parts",
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, sysMsg]);

    // Send a trigger message that includes the part name for the backend IFS prompt
    sendMessage(`[パーツ: ${part.name}] こんにちは。あなたに話を聞いてみたい。`, false);
  };

  const handleSend = () => {
    if (inputValue.trim() && sessionId) {
      const text = inputValue.trim();

      // XP: Alter対話 +25pt
      updateEngagementField("alterConversation", true);

      // Detect closing message and trigger session end after response
      if (CLOSING_PATTERNS.test(text)) {
        sendMessage(text).then(() => {
          // Brief delay before ending session to let closing message settle
          setTimeout(() => {
            // Add parting message from Alter
            const partingMsg: ChatMessage = {
              id: `alter_parting_${Date.now()}`,
              role: "alter",
              content: "...また来なよ。次は、もう少し深い話をしよう。",
              mode: currentMode,
              timestamp: new Date().toISOString(),
            };
            setMessages((prev) => [...prev, partingMsg]);
            endSession();
          }, 1500);
        });
      } else {
        sendMessage(text);
      }
    }
  };

  if (loading) return <LoadingSkeleton />;

  // No observation data state
  if (noData) {
    return (
      <div className="min-h-screen flex flex-col">
        <div className="sticky top-0 z-30 backdrop-blur-xl bg-white/10 border-b border-white/10">
          <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
            <Link
              href="/stargazer"
              className="w-9 h-9 rounded-xl bg-white/60 backdrop-blur-lg border border-slate-200/50 flex items-center justify-center text-slate-600 hover:bg-white/80 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <h1 className="text-lg font-bold text-slate-900 font-display">
              もうひとりの自分
            </h1>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center px-4">
          <FadeInView>
            <GlassCard variant="gradient" padding="lg" className="max-w-sm text-center">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-400 to-indigo-500 mx-auto mb-4 flex items-center justify-center">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-slate-900 mb-2">
                もうひとりの自分はまだ目覚めていない
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed mb-4">
                対話を始めるには、まず観測を通じてあなた自身のデータを蓄積する必要があります。
                観測を重ねることで、もうひとりの自分が形を成していきます。
              </p>
              <GlassButton variant="primary" href="/stargazer">
                観測を始める
              </GlassButton>
            </GlassCard>
          </FadeInView>
        </div>
      </div>
    );
  }

  const modeConfig = MODE_CONFIG[currentMode];

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-30 backdrop-blur-xl bg-white/10 border-b border-white/10">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <Link
            href="/stargazer"
            className="w-9 h-9 rounded-xl bg-white/60 backdrop-blur-lg border border-slate-200/50 flex items-center justify-center text-slate-600 hover:bg-white/80 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>

          {/* Alter avatar + name */}
          <div className="flex items-center gap-3 flex-1">
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              </div>
              <motion.div
                className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white ${currentMode === "warm"
                    ? "bg-amber-400"
                    : currentMode === "provocative"
                      ? "bg-rose-400"
                      : currentMode === "parts"
                        ? "bg-purple-400"
                        : "bg-blue-400"
                  }`}
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900 font-display">
                Alter
              </h1>
              <div className="flex items-center gap-1.5">
                <div
                  className={`w-1.5 h-1.5 rounded-full ${currentMode === "warm"
                      ? "bg-amber-400"
                      : currentMode === "provocative"
                        ? "bg-rose-400"
                        : currentMode === "parts"
                          ? "bg-purple-400"
                          : "bg-blue-400"
                    }`}
                />
                <span className={`text-xs ${modeConfig.accent}`}>
                  {currentMode === "parts" && activePartKey
                    ? PART_PERSONAS[activePartKey].name
                    : `${modeConfig.label}モード`}
                </span>
              </div>
            </div>
          </div>

          {/* Session info */}
          <div className="flex items-center gap-1.5">
            {growthInfo && growthInfo.sessionsCompleted > 0 && (
              <GlassBadge size="sm" variant="default">
                信頼 {Math.round(growthInfo.trustLevel * 100)}%
              </GlassBadge>
            )}
            <GlassBadge size="sm" variant="default">
              {messages.filter((m) => m.role !== "system").length} ターン
            </GlassBadge>
          </div>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-4 max-w-lg mx-auto w-full">
        {/* Memory Confrontation — shown at session start if past data exists */}
        {showConfrontation && !confrontationDismissed && confrontationData && (
          <AlterMemoryConfrontation
            pastRevelation={confrontationData.pastRevelation}
            contradiction={confrontationData.contradiction}
            avoidedTopic={confrontationData.avoidedTopic}
            trustLevel={confrontationData.trustLevel}
            onDismiss={() => {
              setConfrontationDismissed(true);
              setShowConfrontation(false);
            }}
            onEngage={() => {
              setConfrontationDismissed(true);
              setShowConfrontation(false);
              // Use the confrontation topic as context for the first message
              const topic =
                confrontationData.avoidedTopic ??
                confrontationData.contradiction?.statement1 ??
                confrontationData.pastRevelation?.quote ??
                "";
              if (topic) {
                sendMessage(topic, false);
              }
            }}
          />
        )}

        {/* Personality intro (when messages are few) */}
        {messages.length <= 2 && personality && (
          <FadeInView delay={0.1}>
            <div className="text-center mb-6 px-4">
              <motion.div
                className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-400 via-indigo-500 to-blue-500 mx-auto mb-3 flex items-center justify-center shadow-lg shadow-purple-300/30"
                animate={{
                  boxShadow: [
                    "0 10px 25px rgba(168,85,247,0.2)",
                    "0 10px 40px rgba(168,85,247,0.35)",
                    "0 10px 25px rgba(168,85,247,0.2)",
                  ]
                }}
                transition={{ duration: 3, repeat: Infinity }}
              >
                <svg className="w-10 h-10 text-white/90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              </motion.div>
              <p className="text-sm text-slate-500 font-body leading-relaxed">
                もうひとりの自分との対話。<br />
                ここでの会話は、あなた自身の深層に触れる旅です。
              </p>
              {growthInfo && growthInfo.sessionsCompleted > 0 && (
                <div className="mt-3 flex items-center justify-center gap-3">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/50 backdrop-blur-sm border border-slate-200/40">
                    <span className="text-[10px] text-slate-500">
                      {growthInfo.sessionsCompleted}回の対話
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/50 backdrop-blur-sm border border-slate-200/40">
                    <div
                      className="w-1.5 h-1.5 rounded-full"
                      style={{
                        backgroundColor: `hsl(${growthInfo.trustLevel * 120}, 70%, 50%)`,
                      }}
                    />
                    <span className="text-[10px] text-slate-500">
                      信頼 {Math.round(growthInfo.trustLevel * 100)}%
                    </span>
                  </div>
                  {growthInfo.coreWoundConfidence > 0 && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/50 backdrop-blur-sm border border-slate-200/40">
                      <span className="text-[10px] text-slate-500">
                        理解度 {Math.round(growthInfo.coreWoundConfidence * 100)}%
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </FadeInView>
        )}

        {/* Messages */}
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {messages.map((msg, i) => {
              if (msg.role === "system") {
                return <SystemBubble key={msg.id} message={msg} />;
              }
              if (msg.role === "alter") {
                return (
                  <AlterBubble
                    key={msg.id}
                    message={msg}
                    isLatest={i === messages.length - 1}
                  />
                );
              }
              return <UserBubble key={msg.id} message={msg} />;
            })}
          </AnimatePresence>

          {/* Typing indicator */}
          <AnimatePresence>
            {typing && <TypingIndicator mode={currentMode} />}
          </AnimatePresence>
        </div>

        {/* Alter Self-Report Card (shown after every 5th session) */}
        <AnimatePresence>
          {selfReport && (
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="mt-4"
            >
              <GlassCard variant="gradient" padding="lg">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      Alterからの報告書
                    </h3>
                    {growthInfo && (
                      <p className="text-[10px] text-slate-500">
                        {growthInfo.sessionsCompleted}回の対話を経て
                      </p>
                    )}
                  </div>
                </div>
                <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                  {selfReport}
                </div>
                <div className="mt-3 flex justify-end">
                  <GlassButton
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelfReport(null)}
                  >
                    閉じる
                  </GlassButton>
                </div>
              </GlassCard>
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={chatEndRef} />
      </div>

      {/* Input Area */}
      <div className="sticky bottom-0 z-20 backdrop-blur-xl bg-white/40 border-t border-white/20">
        <div className="max-w-lg mx-auto px-4 py-3">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <GlassInput
                placeholder="影に話しかける..."
                value={inputValue}
                onChange={setInputValue}
                onSubmit={handleSend}
                disabled={sending}
                size="md"
              />
            </div>
            <GlassButton
              variant="gradient"
              size="md"
              onClick={handleSend}
              disabled={sending || !inputValue.trim()}
              loading={sending}
              className="shrink-0"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19V5m0 0l-7 7m7-7l7 7" />
              </svg>
            </GlassButton>
          </div>

          {/* Mode indicator + Parts trigger below input */}
          <div className="flex items-center justify-center gap-2 mt-2 flex-wrap">
            {(["warm", "provocative", "analytical"] as AlterMode[]).map((mode) => {
              const cfg = MODE_CONFIG[mode];
              const isActive = mode === currentMode;
              return (
                <div
                  key={mode}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] transition-all ${isActive
                      ? `bg-white/60 border border-slate-200/50 font-semibold ${cfg.accent}`
                      : "text-slate-400"
                    }`}
                >
                  <div
                    className={`w-1.5 h-1.5 rounded-full transition-all ${isActive
                        ? mode === "warm"
                          ? "bg-amber-400"
                          : mode === "provocative"
                            ? "bg-rose-400"
                            : "bg-blue-400"
                        : "bg-slate-300"
                      }`}
                  />
                  {cfg.label}
                </div>
              );
            })}

            {/* Parts mode chip — visible after 3+ sessions */}
            {growthInfo && growthInfo.sessionsCompleted >= 3 && (
              <motion.button
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.22 }}
                onClick={() => setShowPartsSelector((v) => !v)}
                className={`flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] transition-all border ${currentMode === "parts"
                    ? "bg-purple-100/80 border-purple-300/60 font-semibold text-purple-600"
                    : "bg-white/50 border-purple-200/40 text-purple-500 hover:bg-purple-50/60"
                  }`}
              >
                <span>🎭</span>
                <span>{activePartKey ? PART_PERSONAS[activePartKey].name : "パーツと話す"}</span>
              </motion.button>
            )}
          </div>

          {/* Parts sub-selector */}
          <AnimatePresence>
            {showPartsSelector && (
              <motion.div
                initial={{ opacity: 0, y: 8, height: 0 }}
                animate={{ opacity: 1, y: 0, height: "auto" }}
                exit={{ opacity: 0, y: 8, height: 0 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="overflow-hidden mt-2"
              >
                <div className="rounded-2xl border border-purple-200/50 bg-white/60 backdrop-blur-lg p-3">
                  <p className="text-[10px] text-purple-500 font-semibold mb-2 text-center tracking-wide">
                    どのパーツと話しますか？
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {(() => {
                      const { list, activeParts } = getSortedPartsList();
                      return list.map(([key, part]) => (
                        <button
                          key={key}
                          onClick={() => handleSelectPart(key)}
                          className={`flex items-start gap-2.5 px-3 py-2 rounded-xl text-left transition-all hover:bg-purple-50/80 active:scale-[0.98] ${activePartKey === key
                              ? "bg-purple-50/80 border border-purple-200/60"
                              : "border border-transparent"
                            }`}
                        >
                          <div
                            className="w-2.5 h-2.5 rounded-full mt-0.5 shrink-0"
                            style={{ backgroundColor: part.color }}
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="text-xs font-semibold text-slate-800 leading-tight">
                                {part.name}
                              </p>
                              {activeParts.has(key) && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-purple-100/80 text-purple-600 font-medium shrink-0">
                                  推定活性
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-slate-500 leading-tight mt-0.5 line-clamp-1">
                              {part.coreMessage}
                            </p>
                          </div>
                        </button>
                      ));
                    })()}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
