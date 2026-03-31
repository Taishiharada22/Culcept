"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import type { AlterMessage } from "@/hooks/useAlterChat";
import type { ActionShape } from "@/lib/stargazer/alterHomeAdapter";
import { AlterFeedback } from "@/components/stargazer/AlterFeedback";

const SUGGESTION_CHIPS = [
  { label: "今日どう動くのがいい？", icon: "⚡" },
  { label: "最近なんでこうなる？", icon: "🔍" },
  { label: "今の仕事の進め方は合ってる？", icon: "💼" },
  { label: "恋愛で今どう動くべき？", icon: "💜" },
  { label: "今日の服どうする？", icon: "👔" },
  { label: "この人に連絡するべき？", icon: "📱" },
];

/** action_shape → 主CTA テキスト（返答の次の1歩をそのまま押せる形で） */
const ACTION_SHAPE_CTA: Record<ActionShape, { label: string; icon: string }> = {
  full_go: { label: "今すぐやる", icon: "⚡" },
  bounded_go: { label: "15分だけやってみる", icon: "⏱" },
  prepare_then_go: { label: "まず下調べする", icon: "📋" },
  trial_then_decide: { label: "小さく試してみる", icon: "🧪" },
  observe_first: { label: "少し様子を見る", icon: "👀" },
  delegate_or_request: { label: "誰かに相談する", icon: "🤝" },
  defer_with_trigger: { label: "条件メモだけ残す", icon: "📌" },
  skip: { label: "今回は見送る", icon: "🛑" },
};

/** ドメイン → 関連機能ブリッジ（1つだけ） */
const DOMAIN_BRIDGE: Record<string, { label: string; href: string; icon: string }> = {
  work: { label: "Originに記録する", href: "/origin", icon: "📓" },
  relationship: { label: "Stargazerで深掘りする", href: "/stargazer", icon: "✦" },
  romance: { label: "Stargazerで深掘りする", href: "/stargazer", icon: "✦" },
  career: { label: "Originで整理する", href: "/origin", icon: "📓" },
  lifestyle: { label: "Calendarを確認する", href: "/calendar", icon: "📅" },
  outfit: { label: "Calendarでコーデを見る", href: "/calendar", icon: "👔" },
  general: { label: "Stargazerで自分を知る", href: "/stargazer", icon: "✦" },
  daily_guidance: { label: "Calendarで予定を確認", href: "/calendar", icon: "📅" },
};

/** デフォルトのブリッジ（ドメイン不明時） */
const DEFAULT_BRIDGE = { label: "Stargazerで自分を知る", href: "/stargazer", icon: "✦" };

/** action_shape → CTA押下時の遷移先（行動系はOrigin、観察系はStargazer） */
const ACTION_SHAPE_DEST: Record<ActionShape, string | null> = {
  full_go: "/origin?from=alter&intent=action",
  bounded_go: "/origin?from=alter&intent=action",
  prepare_then_go: "/origin?from=alter&intent=action",
  trial_then_decide: "/origin?from=alter&intent=action",
  observe_first: "/stargazer?from=alter&tab=observe",
  delegate_or_request: "/origin?from=alter&intent=action",
  defer_with_trigger: "/origin?from=alter&intent=memo",
  skip: null, // 遷移なし
};

/** タイプライター風の例文ローテーション */
const TYPEWRITER_EXAMPLES = [
  "もう一人のあなたが何でも答えるよ",
  "今日どう動くのがベスト？",
  "最近モヤモヤするのはなぜ？",
  "この判断、自分らしい？",
  "今の仕事の進め方で合ってる？",
  "恋愛で今どう動くべき？",
  "今日何を着ればいい？",
];

function useTypewriter(examples: string[], enabled: boolean, options?: { loop?: boolean }) {
  const loop = options?.loop ?? true;
  const [display, setDisplay] = useState("");
  const [exIdx, setExIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const [phase, setPhase] = useState<"typing" | "pause" | "erasing" | "done">("typing");

  useEffect(() => {
    if (!enabled) { setDisplay(""); setCharIdx(0); setPhase("typing"); return; }
    const text = examples[exIdx];

    if (phase === "typing") {
      if (charIdx <= text.length) {
        const t = setTimeout(() => {
          setDisplay(text.slice(0, charIdx));
          setCharIdx((c) => c + 1);
        }, 60 + Math.random() * 40); // 人間っぽいランダム速度
        return () => clearTimeout(t);
      }
      // 打ち終わり: loop=false なら done（カーソル点滅のみ）、loop=true なら pause→erase
      setPhase(loop ? "pause" : "done");
    } else if (phase === "pause") {
      const t = setTimeout(() => setPhase("erasing"), 2000);
      return () => clearTimeout(t);
    } else if (phase === "erasing") {
      if (charIdx > 0) {
        const t = setTimeout(() => {
          setCharIdx((c) => c - 1);
          setDisplay(text.slice(0, charIdx - 1));
        }, 25);
        return () => clearTimeout(t);
      }
      // 次の例文へ
      setExIdx((i) => (i + 1) % examples.length);
      setPhase("typing");
    }
    // phase === "done" → 何もしない（カーソル点滅のみ）
  }, [enabled, exIdx, charIdx, phase, examples, loop]);

  return display;
}

/** 状態ベースのコンテキストナッジ（優先度順） */
type NudgeInput = {
  /** 今日のStargazer観測が完了しているか */
  stargazerDoneToday?: boolean;
  /** 内面天気が記録済みか */
  innerWeatherRecorded?: boolean;
  /** Originに今日のToDoが追加されているか */
  originTodoDone?: boolean;
  /** Calendarを今日確認したか */
  calendarCheckedToday?: boolean;
  /** Originの日記が今日書かれたか */
  originJournalDone?: boolean;
};

function deriveNudges(input: NudgeInput): { text: string; href: string }[] {
  const hour = new Date().getHours();
  const list: { text: string; href: string }[] = [];

  // 優先度順: ALTER思考に直結するものが先
  if (!input.stargazerDoneToday) {
    list.push({ text: "もっとあなたのことを聞かせて？", href: "/stargazer" });
  }
  if (!input.innerWeatherRecorded) {
    list.push({ text: "今の気分はどう？", href: "/stargazer/weather" });
  }
  if (hour < 18 && !input.originTodoDone) {
    list.push({ text: "今日の予定は？", href: "/origin" });
  }
  if (!input.calendarCheckedToday) {
    list.push({ text: "今日のコーデはどうする？", href: "/calendar" });
  }
  if (hour >= 18 && !input.originJournalDone) {
    list.push({ text: "今日はどんな1日だった？", href: "/origin" });
  }
  return list;
}

/** ナッジ自動ローテーション（優先度順に回す） */
function useNudgeRotation(nudges: { text: string; href: string }[], intervalMs = 8000) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (nudges.length <= 1) return;
    const timer = setInterval(() => {
      setIdx((i) => (i + 1) % nudges.length);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [nudges.length, intervalMs]);
  return nudges.length > 0 ? nudges[idx % nudges.length] : null;
}

type Props = {
  syncPercent?: number;
  greeting?: string;
  observationCount?: number;
  /** Alter 会話状態 */
  alterMessages?: AlterMessage[];
  alterLoading?: boolean;
  alterError?: string | null;
  alterRoundCount?: number;
  alterLimitReached?: boolean;
  alterRemainingRounds?: number;
  alterSessionId?: string | null;
  onAsk?: (query: string) => void;
  /** 直近の action_shape（体験接続CTA用） */
  alterActionShape?: ActionShape | null;
  /** 直近の質問ドメイン（機能ブリッジ用） */
  alterDomain?: string | null;
  /** 直近の質問が感情質問だったか */
  alterIsEmotional?: boolean;
  /** 直近のresponse_id（フィードバック紐付け用） */
  alterResponseId?: string | null;
  /** 直近のフィードバック用メタデータ */
  alterFeedbackMeta?: Record<string, unknown> | null;
  /** コンテキストナッジ用の状態 */
  nudge?: NudgeInput;
  /** true なら挨拶を非表示（親コンポーネントで表示する場合） */
  hideGreeting?: boolean;
  /** true なら context whisper を非表示（親で別途表示する場合） */
  hideContextWhisper?: boolean;
};

export default function AskHero({
  syncPercent = 0,
  greeting,
  observationCount = 0,
  alterMessages = [],
  alterLoading = false,
  alterError = null,
  alterRoundCount = 0,
  alterLimitReached = false,
  alterRemainingRounds = 3,
  alterSessionId,
  onAsk,
  alterActionShape,
  alterDomain,
  alterIsEmotional = false,
  alterResponseId,
  alterFeedbackMeta,
  nudge: nudgeInput,
  hideGreeting = false,
  hideContextWhisper = false,
}: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [ctaDismissed, setCtaDismissed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const hasConversation = alterMessages.length > 0;
  const showTypewriter = !hasConversation && !focused && !query;
  const typewriterText = useTypewriter(TYPEWRITER_EXAMPLES, showTypewriter);
  // フォローアップ時のタイプライター（会話中 + 未フォーカス + 未入力時）
  const showFollowupTypewriter = hasConversation && !focused && !query && !alterLoading;
  const followupTypewriterText = useTypewriter(["フォローアップ..."], showFollowupTypewriter, { loop: false });
  const nudges = nudgeInput ? deriveNudges(nudgeInput) : [];
  const nudge = useNudgeRotation(nudges);

  const handleSubmit = (text?: string) => {
    const q = (text ?? query).trim();
    if (!q || alterLoading || alterLimitReached) return;
    onAsk?.(q);
    setQuery("");
  };

  const contextWhisper = observationCount >= 50
    ? `${observationCount}回の観測に基づく、あなた専用の判断AI`
    : observationCount > 0
      ? `${observationCount}回の観測データを踏まえて、もうひとりのあなたが答えます`
      : "観測データを踏まえて、もうひとりのあなた（Alter）が答えます";

  return (
    <section className="px-4 pt-4 pb-5">
      {/* Greeting + Sync badge (hidden when parent renders them) */}
      {!hideGreeting && (
        <div className="flex items-center gap-2.5 mb-4">
          {greeting && (
            <h2 className="text-xl font-bold text-text1">{greeting}</h2>
          )}
          {syncPercent > 0 && (
            <span
              className="text-[9px] font-mono px-2 py-0.5 rounded-full"
              style={{
                background: "rgba(99,102,241,0.08)",
                color: "#6366F1",
                border: "1px solid rgba(99,102,241,0.12)",
              }}
            >
              Sync {syncPercent}%
            </span>
          )}
        </div>
      )}

      {/* Alter area — Home の主役 */}
      <motion.div
        layout
        className="relative rounded-2xl transition-all duration-300 overflow-hidden"
        style={{
          background: focused
            ? "rgba(255,255,255,0.98)"
            : hasConversation
              ? "linear-gradient(155deg, rgba(99,102,241,0.07), rgba(245,243,255,0.96))"
              : "linear-gradient(155deg, rgba(30,27,75,0.07), rgba(99,102,241,0.16), rgba(139,92,246,0.10), rgba(245,243,255,0.96))",
          border: focused
            ? "2px solid rgba(99,102,241,0.45)"
            : "2px solid rgba(99,102,241,0.30)",
          boxShadow: focused
            ? "0 12px 48px rgba(99,102,241,0.25), 0 4px 12px rgba(0,0,0,0.08)"
            : "0 8px 40px rgba(99,102,241,0.18), 0 4px 16px rgba(139,92,246,0.10), 0 1px 6px rgba(0,0,0,0.04)",
        }}
      >
        {/* Ambient glow — ALTER のオーラ */}
        {!hasConversation && (
          <div
            className="absolute -top-8 -left-8 w-56 h-56 rounded-full pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(99,102,241,0.12), transparent 70%)" }}
          />
        )}
        {!hasConversation && (
          <div
            className="absolute -bottom-10 -right-10 w-44 h-44 rounded-full pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(139,92,246,0.08), transparent 70%)" }}
          />
        )}

        {/* Alter label */}
        <div className="flex items-center gap-2 px-5 pt-5 pb-1 relative z-[1]">
          <div
            className="w-[4px] h-6 rounded-full"
            style={{ background: "linear-gradient(180deg, #6366F1, #8B5CF6)" }}
          />
          <span
            className="text-[18px] font-black tracking-[0.15em]"
            style={{ color: "#4338CA" }}
          >
            ALTER
          </span>
          {hasConversation ? (
            <span className="text-[8px] font-mono ml-auto" style={{ color: "#6366F1", opacity: 0.35 }}>
              あと{alterRemainingRounds}回
            </span>
          ) : nudge ? (
            <AnimatePresence mode="wait">
              <motion.div
                key={nudge.text}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.3 }}
                className="ml-auto flex-shrink-0"
              >
                <Link
                  href={nudge.href}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full transition-opacity active:opacity-60"
                  style={{
                    textDecoration: "none",
                    background: "rgba(99,102,241,0.06)",
                    border: "1px solid rgba(99,102,241,0.18)",
                  }}
                >
                  <span
                    className="text-[10px]"
                    style={{ color: "#6366F1", opacity: 0.7 }}
                  >
                    {nudge.text}
                  </span>
                  <span className="text-[8px]" style={{ color: "#6366F1", opacity: 0.4 }}>→</span>
                </Link>
              </motion.div>
            </AnimatePresence>
          ) : (
            <span
              className="text-[10px] font-medium"
              style={{ color: "#6366F1", opacity: 0.5 }}
            >
              — あなたの影
            </span>
          )}
        </div>

        {/* Conversation thread — max-h でスクロール制限 */}
        {hasConversation && (
          <div className="px-5 pt-3 pb-1 space-y-3 max-h-[50vh] overflow-y-auto scroll-smooth">
            {alterMessages.map((msg) => (
              <div key={msg.id}>
                {msg.role === "user" ? (
                  <div className="flex items-start gap-2">
                    <span className="text-[9px] font-mono mt-0.5" style={{ color: "#8888a0" }}>You</span>
                    <p className="text-[13px] text-text1 leading-relaxed flex-1">{msg.content}</p>
                  </div>
                ) : (
                  <div className="pl-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-[10px]" style={{ color: "#6366F1" }}>✦</span>
                      <span className="text-[9px] font-mono" style={{ color: "#6366F1", opacity: 0.5 }}>Alter</span>
                    </div>
                    <p className="text-[14px] text-text1 leading-[1.8] font-medium">
                      {msg.content}
                    </p>
                    {/* フィードバック: 最後のAlterメッセージにのみ表示 */}
                    {msg === alterMessages[alterMessages.length - 1] && !alterLoading && alterSessionId && alterResponseId && (
                      <AlterFeedback
                        sessionId={alterSessionId}
                        responseId={alterResponseId}
                        feedbackMeta={alterFeedbackMeta ?? {}}
                      />
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* Loading */}
            {alterLoading && (
              <div className="flex items-center gap-2 py-1">
                <span className="text-[10px]" style={{ color: "#6366F1" }}>✦</span>
                <motion.div
                  className="flex gap-1"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  {[0, 1, 2].map((i) => (
                    <motion.span
                      key={i}
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: "#6366F1" }}
                      animate={{ opacity: [0.2, 0.7, 0.2] }}
                      transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                    />
                  ))}
                </motion.div>
              </div>
            )}

            {/* Error */}
            {alterError && (
              <p className="text-[10px] text-red-400 py-1">{alterError}</p>
            )}

            {/* ─── 体験接続: 返答直後の3要素 ─── */}
            {!alterLoading && !alterLimitReached && alterMessages.length > 0 &&
              alterMessages[alterMessages.length - 1]?.role === "alter" && alterActionShape && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.4 }}
                className="space-y-2 mt-2 mb-1"
              >
                {/* 1. action_shape ベースの主CTA — 返答を邪魔しない控えめさ */}
                {!ctaDismissed && (() => {
                  const cta = alterIsEmotional
                    ? { label: "今は何もしなくていい", icon: "🫂" }
                    : ACTION_SHAPE_CTA[alterActionShape];
                  const dest = alterIsEmotional ? null : ACTION_SHAPE_DEST[alterActionShape];
                  return (
                    <button
                      onClick={() => {
                        if (dest) {
                          router.push(dest);
                        } else {
                          // skip / emotional → CTA を静かに消す
                          setCtaDismissed(true);
                        }
                      }}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg transition-all active:scale-[0.97]"
                      style={{
                        background: "rgba(99,102,241,0.05)",
                        border: "1px solid rgba(99,102,241,0.12)",
                      }}
                    >
                      <span className="text-xs">{cta.icon}</span>
                      <span className="text-[11px] font-medium" style={{ color: "#4338CA", opacity: 0.8 }}>
                        {cta.label}
                      </span>
                    </button>
                  );
                })()}

                {/* 2. 関連機能ブリッジ 1つだけ（感情質問時は非表示） */}
                {!alterIsEmotional && (() => {
                  const bridge = (alterDomain && DOMAIN_BRIDGE[alterDomain]) || DEFAULT_BRIDGE;
                  const bridgeHref = bridge.href.includes("?")
                    ? `${bridge.href}&from=alter`
                    : `${bridge.href}?from=alter`;
                  return (
                    <Link
                      href={bridgeHref}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg transition-all active:opacity-70"
                      style={{
                        background: "rgba(99,102,241,0.04)",
                        border: "1px solid rgba(99,102,241,0.10)",
                      }}
                    >
                      <span className="text-xs">{bridge.icon}</span>
                      <span className="text-[11px] font-medium flex-1" style={{ color: "#4338CA", opacity: 0.7 }}>
                        {bridge.label}
                      </span>
                      <span className="text-[9px]" style={{ color: "#6366F1", opacity: 0.4 }}>→</span>
                    </Link>
                  );
                })()}

                {/* 3. followup予告 1行 */}
                <p className="text-[10px] text-center py-0.5" style={{ color: "#6366F1", opacity: 0.45 }}>
                  {alterIsEmotional ? "そばにいるよ" : "明日、やったか聞くね"}
                </p>
              </motion.div>
            )}

            {/* Limit reached → Deep Alter CTA */}
            {alterLimitReached && (
              <Link
                href={`/stargazer/alter${alterSessionId ? `?session=${alterSessionId}` : ""}`}
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl mt-1 transition-all active:scale-[0.97]"
                style={{
                  background: "rgba(99,102,241,0.08)",
                  border: "1px solid rgba(99,102,241,0.15)",
                }}
              >
                <span className="text-sm">✦</span>
                <span className="text-[11px] font-medium flex-1" style={{ color: "#4338CA" }}>
                  ここから深く話す
                </span>
                <span className="text-[11px]" style={{ color: "#6366F1", opacity: 0.5 }}>→</span>
              </Link>
            )}
          </div>
        )}

        {/* Input row */}
        {!alterLimitReached && (
          <div
            className={`flex items-center gap-3 ${hasConversation ? "px-5 py-2.5 border-t border-indigo-500/[0.06]" : "mx-5 my-3 px-4 py-3.5 rounded-xl"}`}
            style={!hasConversation ? {
              background: "rgba(255,255,255,0.5)",
              border: focused ? "1.5px solid rgba(99,102,241,0.35)" : "1.5px solid rgba(99,102,241,0.15)",
              boxShadow: focused ? "0 2px 12px rgba(99,102,241,0.10)" : "none",
              transition: "border-color 0.2s, box-shadow 0.2s",
            } : undefined}
          >
            <motion.span
              className={hasConversation ? "text-base" : "text-2xl"}
              animate={{ opacity: focused ? 0.9 : 0.5 }}
              style={{ color: "#6366F1" }}
            >
              ✦
            </motion.span>
            <div className="flex-1 relative min-w-0">
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setTimeout(() => setFocused(false), 200)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                placeholder=""
                aria-label="Alterに質問する"
                className={`w-full bg-transparent text-text1 placeholder:text-text4 outline-none relative z-[1] ${hasConversation ? "text-[13px]" : "text-[16px]"}`}
                disabled={alterLoading}
              />
              {/* Typewriter overlay — 初期状態 */}
              {showTypewriter && (
                <div
                  className="absolute inset-0 flex items-center pointer-events-none text-[16px]"
                  style={{ color: "#8888a0" }}
                >
                  {typewriterText}
                  <span
                    className="inline-block w-[2px] h-[18px] ml-[1px]"
                    style={{
                      background: "#6366F1",
                      animation: "alter-cursor-blink 1s step-end infinite",
                    }}
                  />
                </div>
              )}
              {/* Typewriter overlay — フォローアップ時 */}
              {showFollowupTypewriter && (
                <div
                  className="absolute inset-0 flex items-center pointer-events-none text-[13px]"
                  style={{ color: "#8888a0" }}
                >
                  {followupTypewriterText}
                  <span
                    className="inline-block w-[1.5px] h-[15px] ml-[1px]"
                    style={{
                      background: "#6366F1",
                      animation: "alter-cursor-blink 1s step-end infinite",
                    }}
                  />
                </div>
              )}
            </div>
            <AnimatePresence>
              {query.trim() && !alterLoading && (
                <motion.button
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  onClick={() => handleSubmit()}
                  className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs"
                  style={{ background: "linear-gradient(135deg, #6366F1, #8B5CF6)" }}
                >
                  →
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Context whisper (only before conversation, hidden when parent renders it) */}
        {!hasConversation && !hideContextWhisper && (
          <div className="px-5 pb-3.5 relative z-[1]">
            <p className="text-[12px] leading-relaxed" style={{ color: "#4338CA", opacity: 0.6 }}>
              {contextWhisper}
            </p>
          </div>
        )}
      </motion.div>

      {/* Suggestion chips (only before conversation) */}
      {!hasConversation && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {SUGGESTION_CHIPS.map((chip) => (
            <button
              key={chip.label}
              onClick={() => handleSubmit(chip.label)}
              className="flex items-center gap-1 px-3 py-2 rounded-full text-[11px] font-medium transition-all duration-150 active:scale-95"
              style={{
                background: "rgba(99,102,241,0.08)",
                border: "1px solid rgba(99,102,241,0.18)",
                color: "#3730A3",
              }}
            >
              <span className="text-xs">{chip.icon}</span>
              {chip.label}
            </button>
          ))}
        </div>
      )}

      {/* Deep Alter link (always available when conversation exists but not at limit) */}
      {hasConversation && !alterLimitReached && !alterLoading && (
        <div className="mt-2 flex justify-end">
          <Link
            href={`/stargazer/alter${alterSessionId ? `?session=${alterSessionId}` : ""}`}
            className="text-[10px] font-medium px-2 py-1 rounded-lg transition-colors"
            style={{ color: "#6366F1", opacity: 0.5 }}
          >
            もっと深く聞く →
          </Link>
        </div>
      )}
    </section>
  );
}
