"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import type { AlterMessage } from "@/hooks/useAlterChat";
import type { ActionShape } from "@/lib/stargazer/alterHomeAdapter";
import type { MorningPlan, MorningPhase } from "@/lib/alter-morning/types";
import { AlterFeedback } from "@/components/stargazer/AlterFeedback";
import MorningPlanCard from "@/components/home/morning/MorningPlanCard";
import MorningOutfitCard from "@/components/home/morning/MorningOutfitCard";
import FollowUpChip from "@/components/home/morning/FollowUpChip";
import JournalPromptChip from "@/components/home/morning/JournalPromptChip";
import MorningInsightChip from "@/components/home/morning/MorningInsightChip";
import { CandidateCardList } from "@/components/alter-morning/CandidateCardList";
import AneurasyncLogo from "@/components/ui/AneurasyncLogo";

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
  skip: null,
};

/** 状態ベースのコンテキストナッジ（優先度順） */
type NudgeInput = {
  stargazerDoneToday?: boolean;
  innerWeatherRecorded?: boolean;
  originTodoDone?: boolean;
  calendarCheckedToday?: boolean;
  originJournalDone?: boolean;
};

function deriveNudges(input: NudgeInput): { text: string; href: string }[] {
  const hour = new Date().getHours();
  const list: { text: string; href: string }[] = [];
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
  observationCount?: number;
  alterMessages?: AlterMessage[];
  alterLoading?: boolean;
  alterError?: string | null;
  alterRoundCount?: number;
  alterLimitReached?: boolean;
  alterRemainingRounds?: number;
  alterSessionId?: string | null;
  alterActionShape?: ActionShape | null;
  alterDomain?: string | null;
  alterIsEmotional?: boolean;
  alterResponseId?: string | null;
  alterFeedbackMeta?: Record<string, unknown> | null;
  alterCounselorSoftLink?: {
    show: boolean;
    message: string;
    destination: string;
  } | null;
  /** Morning Protocol: プランデータ */
  morningPlan?: MorningPlan | null;
  /** Morning Protocol: 現在フェーズ */
  morningPhase?: MorningPhase | null;
  /** Morning Protocol: パーソナライズヒント */
  morningPersonalizeHints?: string[];
  /** Morning Protocol: プラン確定コールバック */
  onMorningPlanConfirm?: (plan: MorningPlan) => void;
  /** Morning Protocol: 変更リクエストコールバック */
  onMorningPlanChange?: () => void;
  /** Morning Protocol: 天気データ（コーデ提案用） */
  morningWeather?: {
    tempMax: number | null;
    tempMin: number | null;
    condition: "sunny" | "cloudy" | "rain" | "snow";
    pop: number | null;
  } | null;
  /** Follow-up: フォロー対象 */
  followUp?: { targetItem: import("@/lib/alter-morning/types").PlanItem; message: string } | null;
  /** Follow-up: 応答コールバック */
  onFollowUpRespond?: (itemId: string, status: "done" | "partial" | "skipped") => void;
  /** Follow-up: 閉じたコールバック */
  onFollowUpDismiss?: () => void;
  /** Journal: 誘導メッセージ */
  journalPrompt?: { message: string } | null;
  /** Journal: 閉じたコールバック */
  onJournalDismiss?: () => void;
  /** Proactive Insight: Alterの観測（Phase 4） */
  morningInsight?: import("@/lib/alter-morning/types").ProactiveInsight | null;
  /** Proactive Insight: 閉じたコールバック */
  onInsightDismiss?: () => void;
  nudge?: NudgeInput;
  /** 親のcomposerがフォーカス中か（体験接続の静音化用） */
  composerFocused?: boolean;
  /** 親のスクロールコンテナへの参照（自動スクロール用） */
  scrollRef?: React.RefObject<HTMLDivElement | null>;
  /** コーデ確定後のコールバック — カードをAlterエリアから退避 */
  onOutfitCommit?: () => void;
  /** プラン＆コーデカードが退避済みか */
  morningCardsDismissed?: boolean;
};

const THINKING_PHRASES = [
  "うーん...",
  "そうだなあ...",
  "そうですね...",
  "考えますね...",
  "ちょっと待って...",
  "なるほど...",
  "ふむふむ...",
  "えっとー...",
  "ちょっと考えさせて下さい...",
  "そうだなあ...",
];

function AlterThinkingText() {
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
          // Next phrase
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
    <div className="flex items-center gap-2 py-1">
      <AneurasyncLogo size={16} color="#6366F1" animate />
      <span className="text-[13px] font-medium" style={{ color: "#6366F1", opacity: 0.7 }}>
        {text}
        <motion.span
          className="inline-block w-[2px] h-[13px] ml-[1px] align-middle"
          style={{ background: "#6366F1" }}
          animate={{ opacity: [1, 0, 1] }}
          transition={{ duration: 0.8, repeat: Infinity }}
        />
      </span>
    </div>
  );
}

export default function AskHero({
  observationCount = 0,
  alterMessages = [],
  alterLoading = false,
  alterError = null,
  alterRoundCount = 0,
  alterLimitReached = false,
  alterRemainingRounds = 3,
  alterSessionId,
  alterActionShape,
  alterDomain,
  alterIsEmotional = false,
  alterResponseId,
  alterFeedbackMeta,
  alterCounselorSoftLink,
  morningPlan,
  morningPhase,
  morningPersonalizeHints,
  onMorningPlanConfirm,
  onMorningPlanChange,
  morningWeather,
  followUp,
  onFollowUpRespond,
  onFollowUpDismiss,
  journalPrompt,
  onJournalDismiss,
  morningInsight,
  onInsightDismiss,
  nudge: nudgeInput,
  composerFocused = false,
  scrollRef,
  onOutfitCommit,
  morningCardsDismissed = false,
}: Props) {
  const router = useRouter();
  const [ctaDismissed, setCtaDismissed] = useState(false);

  // ─── Hydration safety ───
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const hasConversation = mounted && alterMessages.length > 0;
  const isLimitReached = mounted && alterLimitReached;

  // ─── Nudges: mount後のみ ───
  const nudges = (mounted && nudgeInput) ? deriveNudges(nudgeInput) : [];
  const nudge = useNudgeRotation(nudges);

  // ─── 自動スクロール: 親のscrollRefを使う ───
  const prevMessageCount = useRef(alterMessages.length);
  const prevLoading = useRef(alterLoading);

  useEffect(() => {
    const el = scrollRef?.current;
    if (!el) return;

    const msgCountChanged = alterMessages.length !== prevMessageCount.current;
    const loadingStarted = alterLoading && !prevLoading.current;
    const loadingEnded = !alterLoading && prevLoading.current;

    if (msgCountChanged || loadingStarted || loadingEnded) {
      requestAnimationFrame(() => {
        el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      });
    }

    prevMessageCount.current = alterMessages.length;
    prevLoading.current = alterLoading;
  }, [alterMessages.length, alterLoading, scrollRef]);

  return (
    <div>
      {/* ═══ Conversation transcript ═══ */}
      <div
        className="px-5 space-y-3 transition-all duration-300"
        style={{
          opacity: hasConversation ? 1 : 0,
          maxHeight: hasConversation ? "none" : 0,
          overflow: hasConversation ? "visible" : "hidden",
        }}
      >
        {alterMessages.map((msg) => (
          <div key={msg.id}>
            {msg.role === "user" ? (
              <div className="flex items-start gap-2 justify-end">
                <p className="text-[13px] text-text1 leading-relaxed text-right">{msg.content}</p>
                <span className="text-[9px] font-mono mt-0.5 shrink-0" style={{ color: "#8888a0" }}>You</span>
              </div>
            ) : (
              <div className="pl-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <AneurasyncLogo size={16} color="#6366F1" animate />
                  <span className="text-[9px] font-mono" style={{ color: "#6366F1", opacity: 0.5 }}>Alter</span>
                </div>
                <p className="text-[14px] text-text1 leading-[1.8] font-medium whitespace-pre-wrap">
                  {msg.content}
                </p>
                {/* W3 P2: 朝予定の候補カード (search_candidates_presented で server から bridge) */}
                {msg.candidates && msg.candidates.length > 0 && (
                  <CandidateCardList candidates={msg.candidates} />
                )}
                {/* PE出典（視点）— 目立たなく小さく */}
                {msg.perspectiveSources && msg.perspectiveSources.length > 0 && (
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1.5 mb-0.5">
                    <span className="text-[9px] font-mono" style={{ color: "#6366F1", opacity: 0.3 }}>視点</span>
                    {msg.perspectiveSources.map((src, i) => (
                      <a
                        key={i}
                        href={src.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[9px] font-mono truncate max-w-[180px] hover:underline"
                        style={{ color: "#8888a0", opacity: 0.5 }}
                        title={src.title}
                      >
                        {src.title || new URL(src.url).hostname}
                      </a>
                    ))}
                  </div>
                )}
                {msg === alterMessages[alterMessages.length - 1] && !alterLoading && alterSessionId && alterResponseId && (
                  <AlterFeedback
                    sessionId={alterSessionId}
                    responseId={alterResponseId}
                    feedbackMeta={alterFeedbackMeta ?? {}}
                  />
                )}
                {/* Alter→Counselor ソフト導線（恋愛ドメイン時） */}
                {msg === alterMessages[alterMessages.length - 1] && !alterLoading && alterCounselorSoftLink?.show && (
                  <Link
                    href={`${alterCounselorSoftLink.destination}?from=alter`}
                    className="flex items-center gap-2 mt-2 px-3 py-2 rounded-lg transition-all active:scale-[0.97]"
                    style={{
                      background: "rgba(5,150,105,0.06)",
                      border: "1px solid rgba(5,150,105,0.15)",
                    }}
                  >
                    <span className="text-xs">◆</span>
                    <span className="text-[11px] font-medium flex-1" style={{ color: "#059669", opacity: 0.85 }}>
                      {alterCounselorSoftLink.message}
                    </span>
                    <span className="text-[9px]" style={{ color: "#059669", opacity: 0.4 }}>→</span>
                  </Link>
                )}
              </div>
            )}
          </div>
        ))}

        {/* Morning Protocol: プランカード（会話内にインライン表示） */}
        {/* CEO方針: コーデ確定後はAlterエリアから退避 → 📅 で確認 */}
        {!morningCardsDismissed && morningPlan && (morningPhase === "plan_presented" || morningPhase === "plan_confirmed" || morningPhase === "outfit_offered" || morningPhase === "outfit_clarifying" || morningPhase === "completed") && (
          <MorningPlanCard
            plan={morningPlan}
            personalizeHints={morningPersonalizeHints}
            onConfirm={onMorningPlanConfirm ?? (() => {})}
            onRequestChange={onMorningPlanChange ?? (() => {})}
          />
        )}

        {/* Morning Protocol: コーデ提案カード（ユーザーが「見る」と応答後に表示） */}
        {!morningCardsDismissed && morningPlan && (morningPhase === "outfit_presented" || morningPhase === "completed") && (
          <MorningOutfitCard
            plan={morningPlan}
            weather={morningWeather ?? undefined}
            onCommit={onOutfitCommit}
          />
        )}

        {/* Proactive Insight: Alterの観測（Phase 4） */}
        {morningInsight && onInsightDismiss && (
          <MorningInsightChip
            insight={morningInsight}
            onDismiss={onInsightDismiss}
          />
        )}

        {/* Follow-up: 日中フォロー */}
        {followUp && onFollowUpRespond && onFollowUpDismiss && (
          <FollowUpChip
            targetItem={followUp.targetItem}
            message={followUp.message}
            onRespond={onFollowUpRespond}
            onDismiss={onFollowUpDismiss}
          />
        )}

        {/* Journal Prompt: 夜ジャーナル誘導 */}
        {journalPrompt && onJournalDismiss && (
          <JournalPromptChip
            message={journalPrompt.message}
            onDismiss={onJournalDismiss}
          />
        )}

        {/* Loading */}
        {alterLoading && (
          <AlterThinkingText />
        )}

        {/* Error */}
        {alterError && (
          <p className="text-[10px] text-red-400 py-1">{alterError}</p>
        )}

        {/* ─── 体験接続: 返答直後の3要素 ─── */}
        {!alterLoading && !isLimitReached && alterMessages.length > 0 &&
          alterMessages[alterMessages.length - 1]?.role === "alter" && alterActionShape && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: composerFocused ? 0.3 : 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.4 }}
              className="space-y-2 mt-2 mb-1"
              style={{ pointerEvents: composerFocused ? "none" : "auto" }}
            >
              {!ctaDismissed && (() => {
                const cta = alterIsEmotional
                  ? { label: "今は何もしなくていい", icon: "🫂" }
                  : ACTION_SHAPE_CTA[alterActionShape];
                const dest = alterIsEmotional ? null : ACTION_SHAPE_DEST[alterActionShape];
                return (
                  <button
                    onClick={() => {
                      if (dest) { router.push(dest); } else { setCtaDismissed(true); }
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

              <p className="text-[10px] text-center py-0.5" style={{ color: "#6366F1", opacity: 0.45 }}>
                {alterIsEmotional ? "そばにいるよ" : "明日、やったか聞くね"}
              </p>
            </motion.div>
          )}

        {/* Limit reached → Deep Alter CTA */}
        {isLimitReached && (
          <Link
            href={`/stargazer/alter${alterSessionId ? `?session=${alterSessionId}` : ""}`}
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl mt-1 transition-all active:scale-[0.97]"
            style={{
              background: "rgba(99,102,241,0.08)",
              border: "1px solid rgba(99,102,241,0.15)",
            }}
          >
            <AneurasyncLogo size={18} color="#4338CA" />
            <span className="text-[11px] font-medium flex-1" style={{ color: "#4338CA" }}>
              ここから深く話す
            </span>
            <span className="text-[11px]" style={{ color: "#6366F1", opacity: 0.5 }}>→</span>
          </Link>
        )}
      </div>

      {/* Remaining rounds indicator — 会話中のみ */}
      {hasConversation && !isLimitReached && !alterLoading && (
        <div className="flex justify-end px-5 pt-1">
          <Link
            href={`/stargazer/alter${alterSessionId ? `?session=${alterSessionId}` : ""}`}
            className="text-[9px] font-mono transition-colors"
            style={{ color: "#6366F1", opacity: 0.4 }}
          >
            あと{alterRemainingRounds}回 · もっと深く聞く →
          </Link>
        </div>
      )}
    </div>
  );
}
