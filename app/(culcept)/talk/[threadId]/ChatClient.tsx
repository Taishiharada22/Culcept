"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import type { TalkMessage, GenomeCardData, GenomeReactionType } from "@/lib/genome/cardTypes";
import { generateConversationInsights, type ConversationInsight } from "@/lib/genome/conversationIntelligence";
import { supabaseBrowser } from "@/lib/supabase/client";
import { getCardTheme } from "@/lib/genome/archetypeThemes";
import { useCoAlter } from "@/hooks/useCoAlter";
import CoAlterButton from "@/components/coalter/CoAlterButton";
import CoAlterConsent from "@/components/coalter/CoAlterConsent";
import CoAlterCard from "@/components/coalter/CoAlterCard";
import IntentObservationSheet from "@/components/talk/IntentObservationSheet";

const C = {
  bg: "#f8f6f3", s1: "#ffffff", s2: "#f5f6fa",
  t1: "#1a1a2e", t2: "#4a4a68", t3: "#8888a0", t4: "#c8c8dc",
  neural: "#8B5CF6", pulse: "#EC4899",
};

interface Props { threadId: string }

/* ═══════════════════════════════════════════════
   リンク検出 — URL をクリック可能なリンクに変換
   ═══════════════════════════════════════════════ */
const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/g;

function MessageBody({ text, isMine }: { text: string; isMine: boolean }) {
  // 引用部分のチェック
  if (text.startsWith("> ")) {
    const parts = text.split("\n\n");
    const quote = parts[0].replace(/^> /, "");
    const rest = parts.slice(1).join("\n\n");
    return (
      <>
        <div style={{ padding: "4px 8px", marginBottom: 4, borderRadius: 6,
          borderLeft: `2px solid ${isMine ? "rgba(255,255,255,0.4)" : `${C.neural}40`}`,
          background: isMine ? "rgba(255,255,255,0.1)" : `${C.neural}06`,
          fontSize: 11, color: isMine ? "rgba(255,255,255,0.7)" : C.t3 }}>
          {quote}
        </div>
        <LinkifiedText text={rest} isMine={isMine} />
      </>
    );
  }
  return <LinkifiedText text={text} isMine={isMine} />;
}

function LinkifiedText({ text, isMine }: { text: string; isMine: boolean }) {
  const parts = text.split(URL_REGEX);
  const urls = text.match(URL_REGEX) ?? [];
  if (urls.length === 0) return <>{text}</>;
  const result: React.ReactNode[] = [];
  parts.forEach((part, i) => {
    result.push(part);
    if (urls[i]) {
      const domain = new URL(urls[i]).hostname.replace("www.", "");
      result.push(
        <a key={i} href={urls[i]} target="_blank" rel="noopener noreferrer"
          className="underline underline-offset-2"
          style={{ color: isMine ? "rgba(255,255,255,0.9)" : C.neural, wordBreak: "break-all" }}>
          {domain}↗
        </a>
      );
    }
  });
  return <>{result}</>;
}

/* ═══════════════════════════════════════════════
   Genome リアクション定義
   ═══════════════════════════════════════════════ */
const GENOME_REACTIONS: { type: GenomeReactionType; emoji: string; label: string }[] = [
  { type: "resonance", emoji: "∞", label: "共鳴" },
  { type: "discovery", emoji: "💡", label: "発見" },
  { type: "tell_more", emoji: "👂", label: "もっと" },
  { type: "moved", emoji: "🫀", label: "沁みた" },
];

function ReactionBar({ messageId, threadId, reactions, currentUserId, onReacted }: {
  messageId: string; threadId: string;
  reactions: TalkMessage["reactions"];
  currentUserId: string | null;
  onReacted: () => void;
}) {
  const [busy, setBusy] = useState(false);

  const handleReaction = async (type: GenomeReactionType) => {
    if (busy || !currentUserId) return;
    setBusy(true);
    const myReaction = reactions?.find((r) => r.type === type && r.userId === currentUserId);
    try {
      if (myReaction) {
        await fetch(`/api/talk/threads/${threadId}/messages/${messageId}/reactions?type=${type}`, { method: "DELETE" });
      } else {
        await fetch(`/api/talk/threads/${threadId}/messages/${messageId}/reactions`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type }),
        });
      }
      onReacted();
    } finally { setBusy(false); }
  };

  // リアクション集計
  const counts: Record<string, number> = {};
  const myTypes = new Set<string>();
  for (const r of reactions ?? []) {
    counts[r.type] = (counts[r.type] ?? 0) + 1;
    if (r.userId === currentUserId) myTypes.add(r.type);
  }

  return (
    <div className="flex gap-0.5 mt-1">
      {GENOME_REACTIONS.map((gr) => {
        const count = counts[gr.type] ?? 0;
        const isMine = myTypes.has(gr.type);
        return (
          <button key={gr.type} onClick={() => handleReaction(gr.type)}
            disabled={busy}
            className="rounded-full transition-all"
            style={{
              fontSize: 10, padding: count > 0 ? "1px 6px" : "1px 4px",
              background: isMine ? `${C.neural}15` : count > 0 ? `${C.s2}` : "transparent",
              border: isMine ? `1px solid ${C.neural}30` : count > 0 ? `1px solid ${C.s2}` : "1px solid transparent",
              opacity: count > 0 || isMine ? 1 : 0,
            }}
            aria-label={`${gr.label}リアクション`}
          >
            <span style={{ fontSize: 9 }}>{gr.emoji}</span>
            {count > 0 && <span style={{ fontSize: 8, marginLeft: 2, color: isMine ? C.neural : C.t3 }}>{count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** メッセージ長押し→リアクション + アクションメニュー */
function MessageActionMenu({ onReaction, onReply, onEdit, onDelete, isMine, onClose }: {
  onReaction: (type: GenomeReactionType) => void;
  onReply: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  isMine: boolean;
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8, y: 4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.8, y: 4 }}
      className="rounded-2xl overflow-hidden"
      style={{ background: C.s1, boxShadow: "0 4px 20px rgba(0,0,0,0.12)", border: `1px solid ${C.s2}` }}
    >
      {/* リアクション行 */}
      <div className="flex gap-0.5 px-2 py-1.5">
        {GENOME_REACTIONS.map((gr) => (
          <button key={gr.type} onClick={() => { onReaction(gr.type); onClose(); }}
            className="flex flex-col items-center px-2 py-1 rounded-xl transition-all min-h-[40px] min-w-[40px] justify-center"
            style={{ fontSize: 16 }} aria-label={gr.label}>
            <span>{gr.emoji}</span>
            <span style={{ fontSize: 6, color: C.t4, marginTop: 1 }}>{gr.label}</span>
          </button>
        ))}
      </div>
      {/* アクション行 */}
      <div style={{ borderTop: `1px solid ${C.s2}` }}>
        <button onClick={() => { onReply(); onClose(); }}
          className="w-full text-left px-4 py-2.5 text-xs min-h-[40px]" style={{ color: C.t2 }}>
          ↩ 返信する
        </button>
        {isMine && onEdit && (
          <button onClick={() => { onEdit(); onClose(); }}
            className="w-full text-left px-4 py-2.5 text-xs min-h-[40px]" style={{ color: C.neural }}>
            ✏️ 編集する
          </button>
        )}
        {isMine && onDelete && (
          <button onClick={() => { onDelete(); onClose(); }}
            className="w-full text-left px-4 py-2.5 text-xs min-h-[40px]" style={{ color: "#ef4444" }}>
            🗑 削除する
          </button>
        )}
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════
   🔮 意図チェックパネル — 送信前の伝わり方チェック
   ═══════════════════════════════════════════════ */
function IntentCheckPanel({ result, onClose, onApplyRewrite }: {
  result: {
    misreadRisk: number;
    interventionLevel: string;
    gapDetected: boolean;
    gapType: string | null;
    rewriteSuggestion: string | null;
    senderIntent: { reading: string } | null;
    receiverInterpretations: Array<{ reading: string; probability: number }>;
  };
  onClose: () => void;
  onApplyRewrite: (text: string) => void;
}) {
  const riskPercent = Math.round(result.misreadRisk * 100);
  const isHigh = riskPercent >= 60;
  const isMid = riskPercent >= 30;
  const riskColor = isHigh ? "#ef4444" : isMid ? "#f59e0b" : "#22c55e";
  const riskLabel = isHigh ? "伝わりにくい" : isMid ? "少し注意" : "伝わりやすい";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, height: 0 }}
      animate={{ opacity: 1, y: 0, height: "auto" }}
      exit={{ opacity: 0, y: 8, height: 0 }}
      className="overflow-hidden"
    >
      <div className="mx-3 mb-2 rounded-2xl overflow-hidden" style={{
        background: "rgba(255,255,255,0.92)",
        backdropFilter: "blur(20px) saturate(1.4)",
        boxShadow: "0 2px 16px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.03)",
      }}>
        {/* ── ヘッダー ── */}
        <div className="px-4 py-2.5 flex items-center justify-between" style={{
          borderBottom: "1px solid rgba(0,0,0,0.04)",
        }}>
          <div className="flex items-center gap-2.5">
            {/* リスクインジケーター — 微細なアニメーション付き */}
            <div className="relative flex items-center justify-center" style={{ width: 28, height: 28 }}>
              <svg width="28" height="28" viewBox="0 0 28 28">
                <circle cx="14" cy="14" r="12" fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth="2" />
                <motion.circle
                  cx="14" cy="14" r="12" fill="none"
                  stroke={riskColor} strokeWidth="2" strokeLinecap="round"
                  strokeDasharray={`${(1 - result.misreadRisk) * 75.4} 75.4`}
                  strokeDashoffset="18.85"
                  initial={{ strokeDasharray: "0 75.4" }}
                  animate={{ strokeDasharray: `${(1 - result.misreadRisk) * 75.4} 75.4` }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: riskColor }} />
              </div>
            </div>
            <div>
              <p style={{ fontSize: 12, fontWeight: 600, color: C.t1, lineHeight: 1 }}>{riskLabel}</p>
              {riskPercent > 0 && (
                <p style={{ fontSize: 9, color: C.t4, marginTop: 2 }}>
                  誤読リスク {riskPercent}%
                </p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="rounded-full flex items-center justify-center transition-colors"
            style={{
              width: 26, height: 26,
              background: "rgba(0,0,0,0.04)",
              color: C.t4, fontSize: 10,
            }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M1 1l8 8M9 1l-8 8" />
            </svg>
          </button>
        </div>

        {/* ── 受信者がどう読むか ── */}
        {result.receiverInterpretations.length > 0 && (
          <div className="px-4 py-2.5 space-y-1.5">
            <p style={{ fontSize: 9, color: C.t4, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              相手の読み取り方
            </p>
            {result.receiverInterpretations.slice(0, 2).map((interp, i) => (
              <div key={i} className="flex items-start gap-2.5">
                {/* 確率バー */}
                <div className="flex-shrink-0 mt-1.5" style={{ width: 32 }}>
                  <div style={{ height: 3, borderRadius: 2, background: "rgba(0,0,0,0.04)", overflow: "hidden" }}>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${interp.probability * 100}%` }}
                      transition={{ duration: 0.6, delay: i * 0.15, ease: "easeOut" }}
                      style={{
                        height: "100%", borderRadius: 2,
                        background: i === 0 ? C.neural : C.t4,
                      }}
                    />
                  </div>
                  <p style={{
                    fontSize: 8, color: i === 0 ? C.neural : C.t4, marginTop: 1,
                    fontVariantNumeric: "tabular-nums", textAlign: "center",
                  }}>
                    {Math.round(interp.probability * 100)}%
                  </p>
                </div>
                <p style={{
                  fontSize: 12, color: i === 0 ? C.t1 : C.t3,
                  lineHeight: 1.6, fontWeight: i === 0 ? 500 : 400,
                }}>
                  {interp.reading}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* ── 言い換え提案 ── */}
        {result.rewriteSuggestion && (
          <div className="px-3 pb-3">
            <button
              onClick={() => onApplyRewrite(result.rewriteSuggestion!)}
              className="w-full text-left rounded-xl px-3.5 py-3 transition-all active:scale-[0.99]"
              style={{
                background: `linear-gradient(135deg, ${C.neural}08, ${C.pulse}05)`,
                border: `1px solid ${C.neural}10`,
              }}
            >
              <div className="flex items-center gap-1.5 mb-1.5">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M9 1.5L10.5 3L4.5 9L2 9.5L2.5 7L8.5 1L9 1.5Z" stroke={C.neural} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <p style={{ fontSize: 9, color: C.neural, fontWeight: 600, letterSpacing: "0.05em" }}>
                  言い換え提案
                </p>
                <span style={{ fontSize: 8, color: C.t4, marginLeft: "auto" }}>タップで適用</span>
              </div>
              <p style={{ fontSize: 12, color: C.t1, lineHeight: 1.6 }}>
                {result.rewriteSuggestion}
              </p>
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════
   💭 バブルヒント — 受信メッセージの意図翻訳
   ═══════════════════════════════════════════════ */
function BubbleHint({ hint, onTap }: {
  hint: { hintText: string; confidence: number; misreadRisk: number };
  onTap: () => void;
}) {
  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.95, y: 4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 4 }}
      onClick={onTap}
      className="mt-1.5 text-left rounded-2xl px-3.5 py-2.5 max-w-[90%]"
      style={{
        background: "rgba(255,255,255,0.92)",
        backdropFilter: "blur(8px)",
        border: "1px solid rgba(139,92,246,0.1)",
        boxShadow: "0 2px 12px rgba(30,30,60,0.06)",
      }}
    >
      <div className="flex items-start gap-2">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
          <circle cx="12" cy="12" r="8" stroke={C.neural} strokeWidth="1.5" opacity="0.4" />
          <circle cx="12" cy="12" r="3" fill={C.neural} opacity="0.5" />
        </svg>
        <p style={{ fontSize: 11, color: C.t2, lineHeight: 1.6 }}>
          {hint.hintText}
        </p>
      </div>
    </motion.button>
  );
}

/* ═══════════════════════════════════════════════
   共同Alter 仲介パネル
   ═══════════════════════════════════════════════ */
function MediationPanel({ result, onClose, isSender }: {
  result: {
    forSender: { reframe: string; insight: string; actionHint: string } | null;
    forReceiver: { reframe: string; insight: string; actionHint: string } | null;
    sharedInsight: string | null;
    decision: { shouldMediate: boolean; reason: string; urgency: string };
  };
  onClose: () => void;
  isSender: boolean;
}) {
  const suggestion = isSender ? result.forSender : result.forReceiver;
  if (!result.decision.shouldMediate) {
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
        className="px-4 py-3" style={{ background: "rgba(255,255,255,0.95)", borderTop: `1px solid ${C.s2}` }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span style={{ fontSize: 14 }}>🤝</span>
            <p style={{ fontSize: 11, color: C.t3 }}>会話は安定しています</p>
          </div>
          <button onClick={onClose} style={{ fontSize: 10, color: C.t4, padding: 4 }}>✕</button>
        </div>
      </motion.div>
    );
  }

  const urgencyColor = result.decision.urgency === "high" ? "#ef4444"
    : result.decision.urgency === "medium" ? "#f59e0b" : C.neural;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, height: 0 }}
      animate={{ opacity: 1, y: 0, height: "auto" }}
      exit={{ opacity: 0, y: 8, height: 0 }}
      className="overflow-hidden"
    >
      <div className="px-4 py-3 space-y-2.5" style={{
        background: "rgba(255,255,255,0.95)", borderTop: `1px solid ${C.s2}`,
      }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span style={{ fontSize: 14 }}>🤝</span>
            <span style={{ fontSize: 10, fontWeight: 600, color: urgencyColor }}>共同Alter</span>
          </div>
          <button onClick={onClose} style={{ fontSize: 10, color: C.t4, padding: 4 }}>✕</button>
        </div>

        {/* 共有インサイト */}
        {result.sharedInsight && (
          <p style={{ fontSize: 11, color: C.t2, lineHeight: 1.6, fontStyle: "italic" }}>
            {result.sharedInsight}
          </p>
        )}

        {/* 個別提案 */}
        {suggestion && (
          <div className="space-y-2">
            <div className="rounded-xl px-3 py-2" style={{ background: `${C.neural}06` }}>
              <p style={{ fontSize: 8, color: C.neural, letterSpacing: "0.1em", marginBottom: 3 }}>相手の状態</p>
              <p style={{ fontSize: 11, color: C.t2, lineHeight: 1.5 }}>{suggestion.insight}</p>
            </div>
            <div className="rounded-xl px-3 py-2" style={{ background: `${C.neural}06` }}>
              <p style={{ fontSize: 8, color: C.neural, letterSpacing: "0.1em", marginBottom: 3 }}>こうしてみては</p>
              <p style={{ fontSize: 11, color: C.t2, lineHeight: 1.5 }}>{suggestion.actionHint}</p>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════
   会話インサイトパネル — Aneurasyncだけの武器
   ═══════════════════════════════════════════════ */
function InsightPanel({ insight, onClose }: { insight: ConversationInsight; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8, height: 0 }}
      animate={{ opacity: 1, y: 0, height: "auto" }}
      exit={{ opacity: 0, y: -8, height: 0 }}
      className="overflow-hidden"
      style={{ borderBottom: `1px solid ${C.s2}` }}
    >
      <div className="px-4 py-3 space-y-2" style={{ background: `${C.neural}04` }}>
        {/* 会話スタイル */}
        <div className="flex items-start gap-2">
          <span style={{ fontSize: 12 }}>💡</span>
          <div className="flex-1 min-w-0">
            <p style={{ fontSize: 9, color: C.neural, fontWeight: 600, letterSpacing: "0.08em" }}>
              {insight.communicationStyle.label}
            </p>
            <p style={{ fontSize: 11, color: C.t2, lineHeight: 1.6 }}>
              {insight.communicationStyle.hint}
            </p>
          </div>
          <button onClick={onClose} style={{ fontSize: 10, color: C.t4, padding: 4 }} aria-label="閉じる">✕</button>
        </div>
        {/* 気分予測 */}
        {insight.moodHint && (
          <p style={{ fontSize: 10, color: C.t3, fontStyle: "italic", paddingLeft: 22 }}>
            🌙 {insight.moodHint}
          </p>
        )}
        {/* 地雷（1つだけ控えめに） */}
        {insight.landmines.length > 0 && (
          <p style={{ fontSize: 9, color: `${C.pulse}90`, paddingLeft: 22 }}>
            ⚡ {insight.landmines[0]}
          </p>
        )}
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════
   会話スターター — 初回メッセージ前の話題提案
   ═══════════════════════════════════════════════ */
function ConversationStarters({ counterpartName, archetypeLabel, deepeningTopics, bestCompliment, onSelect }: {
  counterpartName: string;
  archetypeLabel: string | null;
  deepeningTopics: string[];
  bestCompliment: string | null;
  onSelect: (text: string) => void;
}) {
  const starters = useMemo(() => {
    const items: { emoji: string; text: string; label: string }[] = [];
    if (archetypeLabel) {
      items.push({ emoji: "🧬", text: `「${archetypeLabel}」なんだね。自分のタイプ、当たってると思う？`, label: "タイプについて" });
    }
    items.push({ emoji: "✦", text: `${counterpartName}さんのGenome Card、印象に残った。特に共感したのは…`, label: "カードの感想" });
    if (deepeningTopics.length > 0) {
      items.push({ emoji: "🪞", text: "最近、自分について新しく気づいたことってある？", label: "自己発見" });
    }
    items.push({ emoji: "🌙", text: "深夜にふと考えてしまうことって、ある？", label: "深い話" });
    return items.slice(0, 3);
  }, [counterpartName, archetypeLabel, deepeningTopics]);

  return (
    <div className="px-4 py-8 space-y-4">
      <div className="text-center space-y-2">
        <p style={{ fontSize: 28 }}>∞</p>
        <p style={{ fontSize: 12, color: C.t3 }}>
          {counterpartName}さんとつながりました
        </p>
        {bestCompliment && (
          <p style={{ fontSize: 10, color: C.neural, fontStyle: "italic" }}>
            💡 この人の褒め方のコツ: {bestCompliment}
          </p>
        )}
      </div>
      <p style={{ fontSize: 11, color: C.t4, textAlign: "center" }}>
        こんな話題から始めてみませんか？
      </p>
      <div className="space-y-2">
        {starters.map((s, i) => (
          <motion.button
            key={i}
            onClick={() => onSelect(s.text)}
            className="w-full text-left rounded-2xl px-4 py-3"
            style={{ background: "rgba(255,255,255,0.85)", border: `1px solid ${C.s2}`,
              boxShadow: "0 1px 3px rgba(0,0,0,0.03)" }}
            whileTap={{ scale: 0.98 }}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.08 }}
          >
            <div className="flex items-start gap-3">
              <span style={{ fontSize: 16, flexShrink: 0 }}>{s.emoji}</span>
              <div>
                <p style={{ fontSize: 8, color: C.neural, letterSpacing: "0.08em", marginBottom: 2 }}>{s.label}</p>
                <p style={{ fontSize: 12, color: C.t2, lineHeight: 1.6 }}>{s.text}</p>
              </div>
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   メインコンポーネント
   ═══════════════════════════════════════════════ */
export default function ChatClient({ threadId }: Props) {
  const [messages, setMessages] = useState<TalkMessage[]>([]);
  const [input, setInput] = useState("");
  const [mounted, setMounted] = useState(false);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [counterpart, setCounterpart] = useState<{
    userId: string | null; displayName: string | null; avatarUrl: string | null;
    archetypeLabel: string | null; card: GenomeCardData | null;
  }>({ userId: null, displayName: null, avatarUrl: null, archetypeLabel: null, card: null });
  const [myCard, setMyCard] = useState<GenomeCardData | null>(null);
  const [showInsight, setShowInsight] = useState(true);
  const [showThreadInfo, setShowThreadInfo] = useState(false);
  const [replyTo, setReplyTo] = useState<TalkMessage | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pickerMsgId, setPickerMsgId] = useState<string | null>(null);
  const [failedMsgs, setFailedMsgs] = useState<Set<string>>(new Set());
  const [showNewMsgBanner, setShowNewMsgBanner] = useState(false);
  const [isConnected, setIsConnected] = useState(true);
  const [imagePreview, setImagePreview] = useState<{ file: File; url: string } | null>(null);
  // ── 意図翻訳エンジン状態 ──
  const [intentCheck, setIntentCheck] = useState<{
    checking: boolean;
    result: {
      misreadRisk: number;
      interventionLevel: string;
      gapDetected: boolean;
      gapType: string | null;
      rewriteSuggestion: string | null;
      senderIntent: { reading: string } | null;
      receiverInterpretations: Array<{ reading: string; probability: number }>;
    } | null;
    visible: boolean;
  }>({ checking: false, result: null, visible: false });
  const [bubbleHints, setBubbleHints] = useState<Map<string, {
    hintText: string;
    confidence: number;
    misreadRisk: number;
  }>>(new Map());
  const [bubbleFetching, setBubbleFetching] = useState<Set<string>>(new Set());
  const [mediationState, setMediationState] = useState<{
    loading: boolean;
    result: {
      forSender: { reframe: string; insight: string; actionHint: string } | null;
      forReceiver: { reframe: string; insight: string; actionHint: string } | null;
      sharedInsight: string | null;
      decision: { shouldMediate: boolean; reason: string; urgency: string };
    } | null;
    visible: boolean;
  }>({ loading: false, result: null, visible: false });

  // ── ミニ観測ボトムシート ──
  const [observationSheet, setObservationSheet] = useState<{
    open: boolean;
    reason: "self_incomplete" | "counterpart_incomplete";
  }>({ open: false, reason: "self_incomplete" });

  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const prevMsgCountRef = useRef(0);

  // ── CoAlter ──
  const coalter = useCoAlter(threadId);

  // ── mount 検出 + 下書き復元（hydration 完了後） ──
  useEffect(() => {
    setMounted(true);
    try {
      const draft = sessionStorage.getItem(`talk_draft_${threadId}`);
      if (draft) setInput(draft);
    } catch { /* noop */ }
  }, [threadId]);

  // ── 下書き保存（sessionStorage） ──
  useEffect(() => {
    if (!mounted) return;
    const key = `talk_draft_${threadId}`;
    try {
      if (input) { sessionStorage.setItem(key, input); }
      else { sessionStorage.removeItem(key); }
    } catch { /* noop */ }
  }, [input, threadId, mounted]);

  // ── 会話インサイト（Aneurasyncの核心）──
  // Step 1: ルールベースで即座に表示（フォールバック）
  const ruleBasedInsight = useMemo(() => {
    if (!counterpart.card) return null;
    return generateConversationInsights(counterpart.card, myCard);
  }, [counterpart.card, myCard]);
  // Step 2: LLM インサイトを非同期で取得（返ってきたら差し替え）
  const [llmInsight, setLlmInsight] = useState<ConversationInsight | null>(null);
  useEffect(() => {
    if (!counterpart.card) return;
    const cpId = counterpart.card.userId;
    if (!cpId) return;
    fetch(`/api/talk/insight?targetUserId=${cpId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.ok && d.insight) setLlmInsight(d.insight); })
      .catch((err) => { console.warn("[talk/insight] fetch failed:", err); });
  }, [counterpart.card]);
  const insight = llmInsight ?? ruleBasedInsight;

  // ── 会話深度メーター ──
  // メッセージ数 + リアクション数 + 平均メッセージ長から会話の深さを推定
  const conversationDepth = useMemo(() => {
    if (messages.length === 0) return { level: 0, label: "", percent: 0 };
    const msgCount = messages.length;
    const reactionCount = messages.reduce((sum, m) => sum + (m.reactions?.length ?? 0), 0);
    const avgLen = messages.reduce((sum, m) => sum + m.body.length, 0) / msgCount;
    // 深度スコア: メッセージ数(max50) + リアクション密度(max30) + 平均長(max20)
    const msgScore = Math.min(msgCount / 50, 1) * 50;
    const reactScore = Math.min(reactionCount / (msgCount * 0.3), 1) * 30;
    const lenScore = Math.min(avgLen / 100, 1) * 20;
    const total = Math.round(msgScore + reactScore + lenScore);
    if (total >= 80) return { level: 4, label: "深層同期", percent: total };
    if (total >= 50) return { level: 3, label: "共鳴", percent: total };
    if (total >= 25) return { level: 2, label: "共感", percent: total };
    return { level: 1, label: "表層", percent: total };
  }, [messages]);

  // ── タイピングインジケーター（Supabase Realtime Presence）──
  const [isTyping, setIsTyping] = useState(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const typingChannelRef = useRef<ReturnType<typeof supabaseBrowser>["channel"] extends (name: string) => infer R ? R : never>(undefined);

  const notifyTyping = useCallback(() => {
    // Presence trackでタイピング状態を通知
    (typingChannelRef.current as any)?.track?.({ typing: true })?.catch?.(() => {});
    // 3秒後に自動解除
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      (typingChannelRef.current as any)?.track?.({ typing: false })?.catch?.(() => {});
    }, 3000);
  }, []);

  useEffect(() => {
    if (!currentUserId) return;
    const sb = supabaseBrowser();
    const channel = sb.channel(`typing:${threadId}`, { config: { presence: { key: currentUserId } } });
    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState();
      const others = Object.entries(state)
        .filter(([key]) => key !== currentUserId)
        .some(([, presences]) => (presences as Array<{ typing?: boolean }>).some((p) => p.typing));
      setIsTyping(others);
    });
    channel.subscribe();
    typingChannelRef.current = channel;
    return () => { channel.unsubscribe(); };
  }, [threadId, currentUserId]);

  // ── メッセージ編集 ──
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const handleEditMessage = async (messageId: string) => {
    if (!editText.trim()) return;
    try {
      const res = await fetch(`/api/talk/threads/${threadId}/messages/${messageId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: editText.trim() }),
      });
      if (res.ok) { setEditingMsgId(null); setEditText(""); await fetchMessages(); }
    } catch { /* silent */ }
  };

  // ── Genome-Tintedテーマ（2人のカラーをブレンド）──
  const chatTheme = useMemo(() => {
    const myTheme = myCard?.archetypeLabel ? getCardTheme(myCard.archetypeLabel) : null;
    const theirTheme = counterpart.card?.archetypeLabel ? getCardTheme(counterpart.card.archetypeLabel) : null;
    const myAccent = myTheme?.accentHex ?? C.neural;
    const theirAccent = theirTheme?.accentHex ?? C.pulse;
    return {
      sentBubble: `linear-gradient(135deg, ${myAccent}, ${theirAccent})`,
      receivedBubble: "rgba(255,255,255,0.92)",
      accent: myAccent,
    };
  }, [myCard?.archetypeLabel, counterpart.card?.archetypeLabel]);

  // ── データフェッチ ──
  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/talk/threads/${threadId}/messages`);
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      if (data?.ok) {
        setMessages(data.messages);
        setHasMore(data.hasMore ?? false);
      }
    } catch { /* silent */ }
  }, [threadId]);

  const loadOlderMessages = useCallback(async () => {
    if (loadingMore || messages.length === 0) return;
    setLoadingMore(true);
    try {
      const oldest = messages[0]?.createdAt;
      const res = await fetch(`/api/talk/threads/${threadId}/messages?before=${oldest}`);
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      if (data?.ok && data.messages.length > 0) {
        setMessages((prev) => [...data.messages, ...prev]);
        setHasMore(data.hasMore ?? false);
      } else {
        setHasMore(false);
      }
    } finally { setLoadingMore(false); }
  }, [threadId, messages, loadingMore]);

  const markRead = useCallback(async () => {
    try { await fetch(`/api/talk/threads/${threadId}/read`, { method: "POST" }); } catch { /* silent */ }
  }, [threadId]);

  useEffect(() => {
    (async () => {
      try {
        const [cardRes, threadsRes] = await Promise.all([
          fetch("/api/genome-card"),
          fetch("/api/talk/threads"),
        ]);
        const cardData = await cardRes.json().catch(() => null);
        if (cardData?.ok) {
          setCurrentUserId(cardData.card.userId);
          setMyCard(cardData.card);
        }
        const threadsData = await threadsRes.json().catch(() => null);
        if (threadsData?.ok) {
          const thread = threadsData.threads.find((t: { threadId: string }) => t.threadId === threadId);
          if (thread) {
            // 相手のカードデータを取得（インサイト生成用）
            const cpId = thread.counterpart.userId;
            const cpCardRes = await fetch(`/api/genome-card/${cpId}`).catch(() => null);
            const cpCardData = cpCardRes ? await cpCardRes.json().catch(() => null) : null;
            setCounterpart({
              userId: cpId,
              displayName: thread.counterpart.displayName,
              avatarUrl: thread.counterpart.avatarUrl,
              archetypeLabel: cpCardData?.ok ? cpCardData.card?.archetypeLabel : null,
              card: cpCardData?.ok ? cpCardData.card : null,
            });
          }
        }
      } catch { /* silent */ }
    })();
    fetchMessages().then(() => { setLoading(false); markRead(); });
    // Supabase Realtime購読（ポーリングの補完）
    try {
      const sb = supabaseBrowser();
      const channel = sb.channel(`talk:${threadId}`)
        .on("postgres_changes", {
          event: "INSERT", schema: "public", table: "talk_messages",
          filter: `thread_id=eq.${threadId}`,
        }, () => { fetchMessages(); markRead(); })
        .on("postgres_changes", {
          event: "UPDATE", schema: "public", table: "talk_messages",
          filter: `thread_id=eq.${threadId}`,
        }, () => { fetchMessages(); })
        .subscribe();
      // フォールバック: 5秒ポーリング（Realtime接続失敗時の保険）
      pollRef.current = setInterval(() => { fetchMessages(); markRead(); }, 5000);
      return () => { channel.unsubscribe(); if (pollRef.current) clearInterval(pollRef.current); };
    } catch {
      // Realtime接続失敗 → 2秒ポーリングにフォールバック
      pollRef.current = setInterval(() => { fetchMessages(); markRead(); }, 2000);
      return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }
  }, [fetchMessages, markRead, threadId]);

  // スクロール位置に応じて新着バナーを表示
  useEffect(() => {
    if (messages.length > prevMsgCountRef.current && prevMsgCountRef.current > 0) {
      const container = scrollContainerRef.current;
      if (container) {
        const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
        if (isNearBottom) {
          bottomRef.current?.scrollIntoView({ behavior: "smooth" });
        } else {
          setShowNewMsgBanner(true);
        }
      } else {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      }
    }
    prevMsgCountRef.current = messages.length;
  }, [messages]);

  // ── 送信 ──
  const lastSendRef = useRef(0);
  const handleSend = async () => {
    if (!input.trim() || sending) return;
    // レート制限: 1秒に1回
    const now = Date.now();
    if (now - lastSendRef.current < 1000) return;
    lastSendRef.current = now;
    const rawBody = input.trim();
    // 引用付きの場合、メッセージの先頭に引用テキストを含める
    const body = replyTo
      ? `> ${replyTo.body.slice(0, 60)}${replyTo.body.length > 60 ? "..." : ""}\n\n${rawBody}`
      : rawBody;
    setSending(true); setInput(""); setReplyTo(null);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    const optimisticMsg: TalkMessage = {
      id: `optimistic-${Date.now()}`, threadId,
      senderId: currentUserId ?? "", body,
      createdAt: new Date().toISOString(), readAt: null,
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    try {
      const res = await fetch(`/api/talk/threads/${threadId}/messages`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (res.ok) {
        setIsConnected(true);
        await fetchMessages();
      } else {
        setFailedMsgs((prev) => new Set(prev).add(optimisticMsg.id));
      }
    } catch {
      setFailedMsgs((prev) => new Set(prev).add(optimisticMsg.id));
      setIsConnected(false);
    } finally { setSending(false); }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  // ── 入力欄自動リサイズ + タイピング通知 ──
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    // タイピング通知（デバウンス: 2秒に1回）
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(notifyTyping, 300);
  };

  // ── 送信リトライ ──
  const handleRetry = async (failedMsg: TalkMessage) => {
    setFailedMsgs((prev) => { const n = new Set(prev); n.delete(failedMsg.id); return n; });
    setMessages((prev) => prev.filter((m) => m.id !== failedMsg.id));
    setInput(failedMsg.body);
    textareaRef.current?.focus();
  };

  // ── 🔮 意図チェック（送信前） ──
  const handleIntentCheck = useCallback(async () => {
    if (!input.trim() || intentCheck.checking) return;
    if (!counterpart.userId) {
      console.warn("[intent-check] counterpart.userId is missing — skipping");
      return;
    }
    setIntentCheck(prev => ({ ...prev, checking: true, visible: true }));
    try {
      const res = await fetch("/api/talk/intent-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, message: input.trim(), receiverUserId: counterpart.userId }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        console.warn(`[intent-check] ${res.status}`, data);
        setIntentCheck(prev => ({ ...prev, checking: false, visible: false }));
        return;
      }
      // skipped = プロファイル不足 → ミニ観測ボトムシートを表示
      if (data.skipped) {
        console.info("[intent-check] skipped:", data.skipReason);
        setIntentCheck(prev => ({ ...prev, checking: false, visible: false }));
        if (data.skipReason === "profile_incomplete") {
          const selfOk = data.selfHasProfile === true;
          const reason = !selfOk
            ? "self_incomplete" as const
            : "counterpart_incomplete" as const;
          setObservationSheet({ open: true, reason });
        }
        return;
      }
      setIntentCheck({ checking: false, result: data, visible: true });
    } catch (e) {
      console.warn("[intent-check] fetch error", e);
      setIntentCheck(prev => ({ ...prev, checking: false }));
    }
  }, [input, threadId, intentCheck.checking, counterpart.userId]);

  // ── 💭 バブルヒント（受信メッセージ） ──
  const fetchBubbleHint = useCallback(async (messageId: string) => {
    if (bubbleHints.has(messageId) || bubbleFetching.has(messageId)) return;
    if (!counterpart.userId) {
      console.warn("[intent-translate] counterpart.userId is missing — skipping", { messageId });
      return;
    }
    setBubbleFetching(prev => new Set(prev).add(messageId));
    try {
      const res = await fetch("/api/talk/intent-translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, messageId, senderUserId: counterpart.userId }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        console.warn(`[intent-translate] ${res.status}`, data);
      } else if (data.skipped) {
        console.info("[intent-translate] skipped:", data.skipReason);
        // プロファイル不足 → ミニ観測ボトムシートを表示
        if (data.skipReason === "profile_incomplete") {
          const selfOk = data.selfHasProfile === true;
          const reason = !selfOk
            ? "self_incomplete" as const
            : "counterpart_incomplete" as const;
          setObservationSheet({ open: true, reason });
        }
      } else if (data.bubbleHint?.show) {
        setBubbleHints(prev => new Map(prev).set(messageId, {
          hintText: data.bubbleHint.hintText,
          confidence: data.bubbleHint.confidence,
          misreadRisk: data.bubbleHint.misreadRisk,
        }));
      } else {
        // show=false でも primaryIntent があれば表示する（ユーザーが明示的にタップした）
        const reading = data.primaryIntent?.reading;
        if (reading && typeof reading === "string") {
          setBubbleHints(prev => new Map(prev).set(messageId, {
            hintText: reading,
            confidence: data.primaryIntent?.confidence ?? data.confidence ?? 0.5,
            misreadRisk: 0,
          }));
        }
      }
    } catch (e) {
      console.warn("[intent-translate] fetch error", e);
    }
    setBubbleFetching(prev => { const n = new Set(prev); n.delete(messageId); return n; });
  }, [threadId, bubbleHints, bubbleFetching, counterpart.userId]);

  // ── 共同Alter 仲介リクエスト ──
  const requestMediation = useCallback(async (messageId?: string) => {
    setMediationState(prev => ({ ...prev, loading: true, visible: true }));
    try {
      const res = await fetch("/api/talk/mediate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, messageId }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.ok) {
          setMediationState({ loading: false, result: data, visible: true });
          return;
        }
      }
      setMediationState(prev => ({ ...prev, loading: false }));
    } catch {
      setMediationState(prev => ({ ...prev, loading: false }));
    }
  }, [threadId]);

  // ── 検索 ──
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const filteredMessages = useMemo(() => {
    if (!searchQuery.trim()) return null;
    return messages.filter((m) => m.body.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [messages, searchQuery]);

  // ── メッセージ削除 ──
  const handleDeleteMessage = async (messageId: string) => {
    try {
      const res = await fetch(`/api/talk/threads/${threadId}/messages/${messageId}`, { method: "DELETE" });
      if (res.ok) await fetchMessages();
    } catch { /* silent */ }
  };

  const handleReactionFromPicker = async (type: GenomeReactionType) => {
    if (!pickerMsgId || !currentUserId) return;
    try {
      await fetch(`/api/talk/threads/${threadId}/messages/${pickerMsgId}/reactions`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      await fetchMessages();
    } catch { /* silent */ }
    setPickerMsgId(null);
  };

  const handleStarterSelect = (text: string) => {
    setInput(text);
    textareaRef.current?.focus();
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      requestAnimationFrame(() => {
        if (textareaRef.current) textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
      });
    }
  };

  // ── 時間フォーマット ──
  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  };
  const formatDateSep = (iso: string) => {
    const d = new Date(iso);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return "今日";
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return "昨日";
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  // ── メッセージグルーピング ──
  const groupedMessages = useMemo(() => {
    type Group = { messages: TalkMessage[]; isMine: boolean; date: string } | { dateSep: string };
    const groups: Group[] = [];
    let lastDate = "";
    let currentGroup: TalkMessage[] = [];
    let currentSender = "";

    for (const msg of messages) {
      const dateStr = formatDateSep(msg.createdAt);
      const sameSender = msg.senderId === currentSender;
      const timeDiff = currentGroup.length > 0
        ? (new Date(msg.createdAt).getTime() - new Date(currentGroup[currentGroup.length - 1].createdAt).getTime()) / 60000
        : Infinity;

      if (dateStr !== lastDate) {
        if (currentGroup.length > 0) {
          groups.push({ messages: currentGroup, isMine: currentSender === currentUserId, date: lastDate });
        }
        groups.push({ dateSep: dateStr });
        currentGroup = [msg]; currentSender = msg.senderId;
      } else if (!sameSender || timeDiff > 2) {
        if (currentGroup.length > 0) {
          groups.push({ messages: currentGroup, isMine: currentSender === currentUserId, date: lastDate });
        }
        currentGroup = [msg]; currentSender = msg.senderId;
      } else {
        currentGroup.push(msg);
      }
      lastDate = dateStr;
    }
    if (currentGroup.length > 0) {
      groups.push({ messages: currentGroup, isMine: currentSender === currentUserId, date: lastDate });
    }
    return groups;
  }, [messages, currentUserId]);

  const cpName = counterpart.displayName ?? "ユーザー";

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: C.bg }}>
      {/* ═══ ヘッダー ═══ */}
      <div className="sticky top-0 z-20" style={{
        background: "rgba(248,246,243,0.88)", backdropFilter: "blur(16px) saturate(1.5)",
        borderBottom: `1px solid ${C.s2}`,
      }}>
        <div className="max-w-lg mx-auto px-4 py-2.5 flex items-center gap-3">
          <Link href="/talk?tab=talk" className="flex items-center justify-center w-9 h-9 rounded-full min-h-[44px] min-w-[44px]"
            style={{ background: C.s2 }} aria-label="戻る">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4a4a68" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </Link>
          <button className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
            onClick={() => setShowThreadInfo(true)} aria-label="スレッド情報を表示">
            {counterpart.avatarUrl ? (
              <img src={counterpart.avatarUrl} alt={`${cpName}のアバター`}
                className="w-9 h-9 rounded-full object-cover" />
            ) : (
              <div className="w-9 h-9 rounded-full flex items-center justify-center"
                style={{ background: `linear-gradient(135deg, ${C.neural}20, ${C.pulse}20)`, fontSize: 13, color: C.t2 }}>
                {cpName[0]}
              </div>
            )}
            <div className="min-w-0">
              <p style={{ fontSize: 14, fontWeight: 600, color: C.t1 }} className="truncate">{cpName}</p>
              <div className="flex items-center gap-1.5">
                {counterpart.archetypeLabel && (
                  <span style={{ fontSize: 9, color: C.neural }}>{counterpart.archetypeLabel}</span>
                )}
                {conversationDepth.level > 0 && (
                  <span style={{ fontSize: 7, color: C.t4, padding: "0 4px", borderRadius: 4, background: C.s2 }}>
                    {conversationDepth.label}
                  </span>
                )}
              </div>
            </div>
          </button>
          {/* 検索ボタン */}
          <button
            onClick={() => { setShowSearch(!showSearch); setSearchQuery(""); }}
            className="w-9 h-9 rounded-full flex items-center justify-center min-h-[44px]"
            style={{ background: showSearch ? `${C.neural}12` : C.s2 }}
            aria-label="メッセージを検索"
          >
            <span style={{ fontSize: 14 }}>🔍</span>
          </button>
          {/* 共同Alter */}
          <button
            onClick={() => requestMediation()}
            className="w-9 h-9 rounded-full flex items-center justify-center min-h-[44px]"
            style={{ background: mediationState.visible ? `${C.neural}12` : C.s2 }}
            aria-label="共同Alter（すれ違い翻訳）"
          >
            <span style={{ fontSize: 14 }}>🤝</span>
          </button>
          {/* インサイトトグル */}
          {insight && (
            <button
              onClick={() => setShowInsight(!showInsight)}
              className="w-9 h-9 rounded-full flex items-center justify-center min-h-[44px]"
              style={{ background: showInsight ? `${C.neural}12` : C.s2 }}
              aria-label="会話インサイトを表示"
            >
              <span style={{ fontSize: 14 }}>💡</span>
            </button>
          )}
          <Link href={counterpart.card ? `/genome-card/${counterpart.card.userId}` : "/genome-card"}
            className="w-9 h-9 rounded-full flex items-center justify-center min-h-[44px]"
            style={{ background: C.s2 }} aria-label="相手のGenome Card">
            <span style={{ fontSize: 14 }}>🧬</span>
          </Link>
        </div>

        {/* インサイトパネル */}
        <AnimatePresence>
          {showInsight && insight && messages.length > 0 && (
            <InsightPanel insight={insight} onClose={() => setShowInsight(false)} />
          )}
        </AnimatePresence>
      </div>

      {/* ═══ 検索バー ═══ */}
      <AnimatePresence>
        {showSearch && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden" style={{ borderBottom: `1px solid ${C.s2}` }}
          >
            <div className="max-w-lg mx-auto px-4 py-2">
              <input
                type="text" value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="メッセージを検索..."
                aria-label="メッセージ検索"
                className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                style={{ background: C.s2, color: C.t1, border: `1px solid ${C.s2}` }}
                autoFocus
              />
              {filteredMessages && (
                <p style={{ fontSize: 9, color: C.t4, marginTop: 4 }}>
                  {filteredMessages.length}件見つかりました
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ スレッド情報ドロワー ═══ */}
      <AnimatePresence>
        {showThreadInfo && (
          <motion.div className="fixed inset-0 z-30" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/20" onClick={() => setShowThreadInfo(false)} />
            <motion.div
              className="absolute right-0 top-0 bottom-0 w-[85%] max-w-sm overflow-y-auto"
              initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              style={{ background: C.bg, borderLeft: `1px solid ${C.s2}` }}
            >
              <div className="px-5 py-6 space-y-6">
                <button onClick={() => setShowThreadInfo(false)} className="text-sm" style={{ color: C.t3 }}>← 戻る</button>

                {/* 相手のプロフィール */}
                <div className="text-center space-y-3">
                  {counterpart.avatarUrl ? (
                    <img src={counterpart.avatarUrl} alt="" className="w-16 h-16 rounded-full object-cover mx-auto" />
                  ) : (
                    <div className="w-16 h-16 rounded-full mx-auto flex items-center justify-center"
                      style={{ background: `linear-gradient(135deg, ${C.neural}20, ${C.pulse}20)`, fontSize: 24, color: C.t2 }}>
                      {cpName[0]}
                    </div>
                  )}
                  <div>
                    <p style={{ fontSize: 18, fontWeight: 600, color: C.t1 }}>{cpName}</p>
                    {counterpart.archetypeLabel && (
                      <p style={{ fontSize: 11, color: C.neural, marginTop: 2 }}>{counterpart.archetypeLabel}</p>
                    )}
                  </div>
                </div>

                {/* 会話深度 */}
                <div className="rounded-2xl p-4" style={{ background: C.s1, border: `1px solid ${C.s2}` }}>
                  <p style={{ fontSize: 9, color: C.t4, letterSpacing: "0.12em", marginBottom: 8 }}>会話の深度</p>
                  <div className="flex items-center gap-3">
                    <div style={{ flex: 1, height: 4, borderRadius: 2, background: C.s2, overflow: "hidden" }}>
                      <div style={{ width: `${conversationDepth.percent}%`, height: "100%", borderRadius: 2,
                        background: `linear-gradient(90deg, ${C.neural}, ${C.pulse})`, transition: "width 0.5s" }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: C.neural, whiteSpace: "nowrap" }}>
                      {conversationDepth.label}
                    </span>
                  </div>
                  <div className="flex justify-between mt-2">
                    {["表層", "共感", "共鳴", "深層同期"].map((l, i) => (
                      <span key={l} style={{ fontSize: 7, color: conversationDepth.level > i ? C.neural : C.t4 }}>{l}</span>
                    ))}
                  </div>
                </div>

                {/* 共鳴ポイント */}
                {insight && insight.resonancePoints.length > 0 && (
                  <div className="rounded-2xl p-4" style={{ background: C.s1, border: `1px solid ${C.s2}` }}>
                    <p style={{ fontSize: 9, color: C.t4, letterSpacing: "0.12em", marginBottom: 8 }}>ふたりの共通点</p>
                    <div className="space-y-1.5">
                      {insight.resonancePoints.map((p, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span style={{ fontSize: 12 }}>∞</span>
                          <span style={{ fontSize: 11, color: C.t2 }}>{p}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 会話を深めるヒント */}
                {insight && insight.deepeningTopics.length > 0 && (
                  <div className="rounded-2xl p-4" style={{ background: C.s1, border: `1px solid ${C.s2}` }}>
                    <p style={{ fontSize: 9, color: C.t4, letterSpacing: "0.12em", marginBottom: 8 }}>会話を深めるには</p>
                    <div className="space-y-2">
                      {insight.deepeningTopics.map((t, i) => (
                        <p key={i} style={{ fontSize: 11, color: C.t2, lineHeight: 1.6 }}>💡 {t}</p>
                      ))}
                    </div>
                  </div>
                )}

                {/* 褒め方のコツ */}
                {insight?.bestCompliment && (
                  <div className="rounded-2xl p-4" style={{ background: `${C.neural}06`, border: `1px solid ${C.neural}12` }}>
                    <p style={{ fontSize: 9, color: C.neural, letterSpacing: "0.12em", marginBottom: 6 }}>この人の褒め方</p>
                    <p style={{ fontSize: 11, color: C.t2, lineHeight: 1.6 }}>{insight.bestCompliment}</p>
                  </div>
                )}

                {/* カードを見る */}
                {counterpart.card && (
                  <Link href={`/genome-card/${counterpart.card.userId}`}
                    onClick={() => setShowThreadInfo(false)}
                    className="block rounded-2xl p-4 text-center"
                    style={{ background: `linear-gradient(135deg, ${C.neural}, ${C.pulse})`, color: "white" }}>
                    <span style={{ fontSize: 12, fontWeight: 500 }}>🧬 Genome Card を見る</span>
                  </Link>
                )}

                {/* 会話統計 */}
                <div className="rounded-2xl p-4" style={{ background: C.s1, border: `1px solid ${C.s2}` }}>
                  <p style={{ fontSize: 9, color: C.t4, letterSpacing: "0.12em", marginBottom: 8 }}>会話の記録</p>
                  <div className="flex gap-4 justify-center">
                    <div className="text-center">
                      <p style={{ fontSize: 18, fontWeight: 200, color: C.t1, fontFamily: "monospace" }}>{messages.length}</p>
                      <p style={{ fontSize: 7, color: C.t4 }}>メッセージ</p>
                    </div>
                    <div className="text-center">
                      <p style={{ fontSize: 18, fontWeight: 200, color: C.t1, fontFamily: "monospace" }}>
                        {messages.reduce((s, m) => s + (m.reactions?.length ?? 0), 0)}
                      </p>
                      <p style={{ fontSize: 7, color: C.t4 }}>リアクション</p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 接続状態インジケーター */}
      <AnimatePresence>
        {!isConnected && (
          <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }}
            className="text-center py-1.5 overflow-hidden"
            style={{ background: "#fef2f2", borderBottom: "1px solid #fecaca" }}>
            <p style={{ fontSize: 10, color: "#dc2626" }}>接続が不安定です。再接続中...</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ メッセージエリア ═══ */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto max-w-lg mx-auto w-full relative" role="log" aria-label="メッセージ履歴" aria-live="polite">
        {/* 新着メッセージバナー */}
        <AnimatePresence>
          {showNewMsgBanner && (
            <motion.button
              initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              className="sticky top-2 left-1/2 -translate-x-1/2 z-10 px-4 py-2 rounded-full text-xs"
              style={{ background: `linear-gradient(135deg, ${C.neural}, ${C.pulse})`, color: "white",
                boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }}
              onClick={() => {
                bottomRef.current?.scrollIntoView({ behavior: "smooth" });
                setShowNewMsgBanner(false);
              }}
            >
              ↓ 新しいメッセージ
            </motion.button>
          )}
        </AnimatePresence>
        <div className="px-4 py-3">
          {loading ? (
            <div className="space-y-3 pt-8">
              {[1, 2, 3].map((i) => (
                <div key={i} className={`flex ${i % 2 === 0 ? "justify-end" : ""}`}>
                  <div className="animate-pulse h-10 rounded-2xl w-2/3" style={{ background: C.s2 }} />
                </div>
              ))}
            </div>
          ) : messages.length === 0 && !loading ? (
            <ConversationStarters
              counterpartName={cpName}
              archetypeLabel={counterpart.archetypeLabel}
              deepeningTopics={insight?.deepeningTopics ?? []}
              bestCompliment={insight?.bestCompliment ?? null}
              onSelect={handleStarterSelect}
            />
          ) : (
            <>
            {/* ページネーション: もっと見る */}
            {hasMore && (
              <div className="text-center py-3">
                <button onClick={loadOlderMessages} disabled={loadingMore}
                  className="px-4 py-2 rounded-full text-xs min-h-[36px]"
                  style={{ background: C.s2, color: C.t3, opacity: loadingMore ? 0.5 : 1 }}>
                  {loadingMore ? "読み込み中..." : "↑ 過去のメッセージを見る"}
                </button>
              </div>
            )}
            {groupedMessages.map((group, gi) => {
              if ("dateSep" in group) {
                return (
                  <div key={`sep-${gi}`} className="text-center py-3">
                    <span style={{ fontSize: 10, color: C.t4, background: C.s2,
                      padding: "3px 14px", borderRadius: 20 }}>{group.dateSep}</span>
                  </div>
                );
              }
              return (
                <div key={`g-${gi}`} className={`flex flex-col ${group.isMine ? "items-end" : "items-start"}`}
                  style={{ marginBottom: 6 }}>
                  {group.messages.map((msg, mi) => {
                    const isFirst = mi === 0;
                    const isLast = mi === group.messages.length - 1;
                    const isOptimistic = msg.id.startsWith("optimistic");
                    return (
                      <div key={msg.id} className="relative" style={{ maxWidth: "78%", marginTop: isFirst ? 0 : 2 }}
                        onContextMenu={(e) => { e.preventDefault(); setPickerMsgId(pickerMsgId === msg.id ? null : msg.id); }}
                        onDoubleClick={() => { setReplyTo(msg); textareaRef.current?.focus(); }}>
                        <div style={{
                          padding: "9px 14px", fontSize: 14, lineHeight: 1.65,
                          wordBreak: "break-word", whiteSpace: "pre-wrap",
                          color: group.isMine ? "white" : C.t1,
                          background: group.isMine
                            ? chatTheme.sentBubble
                            : chatTheme.receivedBubble,
                          boxShadow: group.isMine ? "none" : "0 1px 2px rgba(0,0,0,0.04)",
                          opacity: isOptimistic ? 0.7 : 1,
                          // バブルテール: グループ内の位置で角丸を変える
                          borderRadius: group.isMine
                            ? `${isFirst ? 20 : 6}px 20px 20px ${isLast ? 20 : 6}px`
                            : `20px ${isFirst ? 20 : 6}px ${isLast ? 20 : 6}px 20px`,
                        }}>
                          {/* 画像 */}
                          {msg.mediaUrl && (
                            <a href={msg.mediaUrl} target="_blank" rel="noopener noreferrer">
                              <img src={msg.mediaUrl} alt="共有画像"
                                className="rounded-lg max-w-full"
                                style={{ maxHeight: 240, objectFit: "cover", marginBottom: msg.body ? 6 : 0 }}
                                loading="lazy" />
                            </a>
                          )}
                          {editingMsgId === msg.id ? (
                            <div className="space-y-1.5">
                              <textarea value={editText} onChange={(e) => setEditText(e.target.value)}
                                className="w-full resize-none rounded-lg px-2 py-1 text-sm outline-none"
                                style={{ background: "rgba(0,0,0,0.1)", color: "white", minHeight: 36 }}
                                autoFocus />
                              <div className="flex gap-1 justify-end">
                                <button onClick={() => setEditingMsgId(null)}
                                  style={{ fontSize: 9, color: "rgba(255,255,255,0.6)", padding: "2px 8px" }}>取消</button>
                                <button onClick={() => handleEditMessage(msg.id)}
                                  style={{ fontSize: 9, color: "white", background: "rgba(255,255,255,0.2)",
                                    padding: "2px 8px", borderRadius: 6 }}>保存</button>
                              </div>
                            </div>
                          ) : (
                            <MessageBody text={msg.body} isMine={group.isMine} />
                          )}
                        </div>
                        {/* リアクション表示 */}
                        {msg.reactions && msg.reactions.length > 0 && (
                          <ReactionBar
                            messageId={msg.id} threadId={threadId}
                            reactions={msg.reactions} currentUserId={currentUserId}
                            onReacted={fetchMessages}
                          />
                        )}
                        {/* 💭 バブルヒント（相手のメッセージにのみ） */}
                        {!group.isMine && isLast && !isOptimistic && (
                          <AnimatePresence>
                            {bubbleHints.has(msg.id) ? (
                              <BubbleHint
                                hint={bubbleHints.get(msg.id)!}
                                onTap={() => setBubbleHints(prev => { const n = new Map(prev); n.delete(msg.id); return n; })}
                              />
                            ) : !bubbleFetching.has(msg.id) && (
                              <motion.button
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 0.5 }}
                                onClick={() => fetchBubbleHint(msg.id)}
                                className="mt-1 flex items-center gap-1 px-2 py-1 rounded-lg"
                                style={{ background: "transparent" }}
                                aria-label="意図を翻訳"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.5 }}>
                                  <circle cx="12" cy="12" r="8" stroke={C.neural} strokeWidth="1.5" />
                                  <circle cx="12" cy="12" r="3" fill={C.neural} opacity="0.5" />
                                </svg>
                                <span style={{ fontSize: 9, color: C.t4 }}>意図を見る</span>
                              </motion.button>
                            )}
                          </AnimatePresence>
                        )}
                        {/* 長押しアクションメニュー */}
                        <AnimatePresence>
                          {pickerMsgId === msg.id && (
                            <div className={`absolute ${group.isMine ? "right-0" : "left-0"} -top-24 z-30`}>
                              <MessageActionMenu
                                onReaction={handleReactionFromPicker}
                                onReply={() => { setReplyTo(msg); textareaRef.current?.focus(); }}
                                onEdit={group.isMine && !isOptimistic && (Date.now() - new Date(msg.createdAt).getTime() < 5 * 60 * 1000)
                                  ? () => { setEditingMsgId(msg.id); setEditText(msg.body); }
                                  : undefined}
                                onDelete={group.isMine && !isOptimistic ? () => handleDeleteMessage(msg.id) : undefined}
                                isMine={group.isMine}
                                onClose={() => setPickerMsgId(null)}
                              />
                            </div>
                          )}
                        </AnimatePresence>
                        {isLast && (
                          <p style={{
                            fontSize: 9, color: C.t4, marginTop: 3,
                            textAlign: group.isMine ? "right" : "left",
                            paddingLeft: group.isMine ? 0 : 4,
                            paddingRight: group.isMine ? 4 : 0,
                          }}>
                            {formatTime(msg.createdAt)}
                            {group.isMine && (
                              <span style={{ marginLeft: 4, fontSize: 8 }}>
                                {failedMsgs.has(msg.id) ? (
                                  <button onClick={() => handleRetry(msg)}
                                    style={{ color: "#ef4444", fontWeight: 600, fontSize: 9 }}>
                                    送信失敗 ↻再送
                                  </button>
                                ) : isOptimistic ? "···" : msg.readAt ? "既読" : "✓✓"}
                              </span>
                            )}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </>
          )}
          {/* ── CoAlter 同意カード ── */}
          <AnimatePresence>
            {coalter.isPending && (
              <motion.div className="py-3 px-2"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <CoAlterConsent
                  requesterName={cpName ?? "相手"}
                  onAccept={coalter.accept}
                  onDecline={() => coalter.end("opt_out")}
                  loading={coalter.loading}
                />
              </motion.div>
            )}
          </AnimatePresence>
          {/* ── CoAlter 提案カード ── */}
          <AnimatePresence>
            {coalter.hasProposal && coalter.currentProposal && (
              <motion.div className="py-3 px-2"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <CoAlterCard
                  proposal={coalter.currentProposal}
                  onDismiss={coalter.dismissProposal}
                />
              </motion.div>
            )}
          </AnimatePresence>
          {/* タイピングインジケーター */}
          <AnimatePresence>
            {isTyping && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                className="flex items-center gap-2 py-1 px-1"
              >
                <div className="flex gap-0.5">
                  {[0, 1, 2].map((i) => (
                    <motion.div key={i} className="w-1.5 h-1.5 rounded-full"
                      style={{ background: C.t4 }}
                      animate={{ y: [0, -4, 0] }}
                      transition={{ duration: 0.6, delay: i * 0.15, repeat: Infinity }} />
                  ))}
                </div>
                <span style={{ fontSize: 9, color: C.t4 }}>{cpName}が入力中...</span>
              </motion.div>
            )}
          </AnimatePresence>
          <div ref={bottomRef} />
        </div>
      </div>

      {/* ═══ 画像プレビュー確認 ═══ */}
      <AnimatePresence>
        {imagePreview && (
          <motion.div className="fixed inset-0 z-40 flex items-center justify-center px-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/50" onClick={() => { URL.revokeObjectURL(imagePreview.url); setImagePreview(null); }} />
            <motion.div className="relative rounded-2xl overflow-hidden max-w-sm w-full"
              initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
              style={{ background: C.s1 }}>
              <img src={imagePreview.url} alt="プレビュー" className="w-full max-h-[60vh] object-contain" />
              <div className="p-4 flex gap-2">
                <button onClick={() => { URL.revokeObjectURL(imagePreview.url); setImagePreview(null); }}
                  className="flex-1 py-3 rounded-xl text-sm min-h-[44px]" style={{ background: C.s2, color: C.t3 }}>キャンセル</button>
                <button onClick={async () => {
                  const { file } = imagePreview;
                  URL.revokeObjectURL(imagePreview.url); setImagePreview(null);
                  const fd = new FormData(); fd.append("file", file); fd.append("threadId", threadId);
                  try {
                    const r = await fetch("/api/talk/upload", { method: "POST", body: fd });
                    const d = await r.json();
                    if (d.ok && d.url) {
                      await fetch(`/api/talk/threads/${threadId}/messages`, {
                        method: "POST", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ body: "", mediaUrl: d.url }),
                      });
                      await fetchMessages();
                    }
                  } catch { /* silent */ }
                }} className="flex-1 py-3 rounded-xl text-sm min-h-[44px]"
                  style={{ background: `linear-gradient(135deg, ${C.neural}, ${C.pulse})`, color: "white" }}>送信</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ 引用プレビュー + 入力バー ═══ */}
      <div className="sticky bottom-0 z-20" style={{
        background: "rgba(248,246,243,0.88)", backdropFilter: "blur(16px) saturate(1.5)",
        borderTop: `1px solid ${C.s2}`,
      }}>
        <div className="max-w-lg mx-auto px-4 py-2.5">
          {/* ── CoAlter ボタン ── */}
          <div className="flex justify-end mb-1.5">
            <CoAlterButton
              pairState={coalter.pairState}
              sessionState={coalter.sessionState}
              loading={coalter.loading}
              error={coalter.error}
              onActivate={coalter.activate}
              onInvoke={() => coalter.invoke(null)}
            />
          </div>
          {/* 引用返信プレビュー */}
          <AnimatePresence>
            {replyTo && (
              <motion.div
                initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                className="flex items-center gap-2 mb-2 overflow-hidden"
              >
                <div className="flex-1 rounded-lg px-3 py-2" style={{ background: C.s2, borderLeft: `2px solid ${C.neural}` }}>
                  <p style={{ fontSize: 9, color: C.neural, fontWeight: 500 }}>
                    {replyTo.senderId === currentUserId ? "自分" : cpName}
                  </p>
                  <p style={{ fontSize: 11, color: C.t3 }} className="truncate">{replyTo.body}</p>
                </div>
                <button onClick={() => setReplyTo(null)} style={{ fontSize: 12, color: C.t4, padding: 4 }} aria-label="引用を取り消し">✕</button>
              </motion.div>
            )}
          </AnimatePresence>
          {/* 🔮 意図チェック結果パネル */}
          <AnimatePresence>
            {intentCheck.visible && intentCheck.result && (
              <IntentCheckPanel
                result={intentCheck.result}
                onClose={() => setIntentCheck(prev => ({ ...prev, visible: false }))}
                onApplyRewrite={(text) => {
                  setInput(text);
                  setIntentCheck(prev => ({ ...prev, visible: false }));
                  textareaRef.current?.focus();
                }}
              />
            )}
          </AnimatePresence>
          {/* 🤝 仲介パネル */}
          <AnimatePresence>
            {mediationState.visible && mediationState.result && (
              <MediationPanel
                result={mediationState.result}
                onClose={() => setMediationState(prev => ({ ...prev, visible: false }))}
                isSender={true}
              />
            )}
          </AnimatePresence>
          <div className="flex items-end gap-2">
            {/* 画像添付ボタン */}
            <label className="w-10 h-10 rounded-full flex items-center justify-center cursor-pointer min-h-[44px] flex-shrink-0"
              style={{ background: C.s2 }} aria-label="画像を送信">
              <span style={{ fontSize: 16 }}>📷</span>
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden" onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setImagePreview({ file, url: URL.createObjectURL(file) });
                  e.target.value = "";
                }} />
            </label>
            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="メッセージを入力..."
                rows={1}
                maxLength={2000}
                aria-label="メッセージ入力"
                className="w-full resize-none rounded-2xl px-4 py-2.5 text-sm outline-none transition-all"
                style={{
                  background: "rgba(255,255,255,0.92)", border: `1px solid ${C.s2}`,
                  color: C.t1, lineHeight: 1.5,
                }}
              />
              {input.length > 1500 && (
                <span style={{ position: "absolute", right: 12, bottom: 6, fontSize: 8,
                  color: input.length > 1900 ? C.pulse : C.t4 }}>
                  {input.length}/2000
                </span>
              )}
            </div>
            {/* 🔮 意図チェックボタン */}
            {(() => {
              const hasText = mounted && !!input.trim();
              return (
                <button
                  onClick={handleIntentCheck}
                  disabled={!hasText || intentCheck.checking}
                  aria-label="伝わり方チェック"
                  className="w-10 h-10 rounded-full flex items-center justify-center transition-all min-h-[44px] flex-shrink-0"
                  style={{
                    background: intentCheck.checking ? `${C.neural}20` : hasText ? `${C.neural}10` : "transparent",
                    opacity: hasText ? 1 : 0.3,
                  }}
                >
                  {intentCheck.checking ? (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="9" stroke={C.neural} strokeWidth="2" strokeDasharray="20 40" strokeLinecap="round" />
                      </svg>
                    </motion.div>
                  ) : (
                    /* 2つの吹き出しが重なるアイコン — 「伝わり方」を表現 */
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      {/* 送信側吹き出し */}
                      <path d="M4 4h10c1.1 0 2 .9 2 2v5c0 1.1-.9 2-2 2H8l-3 2.5V13H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"
                        stroke={hasText ? C.neural : C.t4} strokeWidth="1.5" strokeLinejoin="round"
                        fill={hasText ? `${C.neural}10` : "none"} opacity={hasText ? 1 : 0.4} />
                      {/* 受信側吹き出し（少しずらして重ねる） */}
                      <path d="M10 9h10c1.1 0 2 .9 2 2v5c0 1.1-.9 2-2 2h-1v2.5L16 18h-6c-1.1 0-2-.9-2-2v-5c0-1.1.9-2 2-2z"
                        stroke={hasText ? C.pulse : C.t4} strokeWidth="1.5" strokeLinejoin="round"
                        fill={hasText ? `${C.pulse}08` : "none"} opacity={hasText ? 0.8 : 0.3} />
                      {/* 中央のリンクドット — 通じ合いを表現 */}
                      <circle cx="12" cy="12.5" r="1.5" fill={hasText ? C.neural : C.t4} opacity={hasText ? 0.7 : 0.2} />
                    </svg>
                  )}
                </button>
              );
            })()}
            {(() => {
              const hasText = mounted && !!input.trim();
              return (
                <button
                  onClick={handleSend}
                  disabled={!hasText || sending}
                  aria-label="送信"
                  className="w-10 h-10 rounded-full flex items-center justify-center transition-all min-h-[44px]"
                  style={{
                    background: hasText ? `linear-gradient(135deg, ${C.neural}, ${C.pulse})` : C.s2,
                    color: hasText ? "white" : C.t4,
                    opacity: sending ? 0.5 : 1,
                    transform: hasText ? "scale(1)" : "scale(0.95)",
                  }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                    <path d="M3.105 2.289a.75.75 0 00-.826.95l1.414 4.925A1.5 1.5 0 005.135 9.25h6.115a.75.75 0 010 1.5H5.135a1.5 1.5 0 00-1.442 1.086l-1.414 4.926a.75.75 0 00.826.95 28.896 28.896 0 0015.293-7.154.75.75 0 000-1.115A28.897 28.897 0 003.105 2.289z" />
                  </svg>
                </button>
              );
            })()}
          </div>
        </div>
      </div>

      {/* ── ミニ観測ボトムシート ── */}
      <IntentObservationSheet
        open={observationSheet.open}
        reason={observationSheet.reason}
        onClose={() => setObservationSheet(prev => ({ ...prev, open: false }))}
        onComplete={() => {
          setObservationSheet(prev => ({ ...prev, open: false }));
          // 観測完了 → intent-check を自動リトライ
          console.info("[observation] complete — intent features should now be available");
        }}
      />
    </div>
  );
}
