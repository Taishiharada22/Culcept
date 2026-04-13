"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { HOME_MORE_NAV } from "@/lib/navigation";
import { useCeoCheck } from "@/hooks/useCeoCheck";
import QuickAccessBar from "@/components/home/QuickAccessBar";
import GenomeCardModal from "@/components/genome/GenomeCardModal";
import type { TalkThreadItem } from "@/lib/genome/cardTypes";

const C = {
  bg: "linear-gradient(180deg, #f8f6f3 0%, #f6f3f0 30%, #f4f1ed 60%, #f6f3f0 100%)",
  s1: "#ffffff", s2: "#f5f6fa",
  t1: "#1a1a2e", t2: "#4a4a68", t3: "#8888a0", t4: "#c8c8dc",
  neural: "#8B5CF6", pulse: "#EC4899",
};

/** Talk 用クイックアクセス（トーク→ホームに置換） */
const TALK_QUICK_NAV = [
  { href: "/calendar", label: "コーデ" },
  { href: "/stargazer", label: "観測" },
  { href: "/", label: "ホーム" },
  { href: "/origin", label: "日記" },
  { href: "/rendezvous", label: "出会う" },
];

export default function TalkPageClient() {
  const [threads, setThreads] = useState<TalkThreadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const isCeo = useCeoCheck();

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/genome/talk/threads");
        if (!res.ok) throw new Error("fetch failed");
        const data = await res.json();
        setThreads(data.threads ?? []);
      } catch {
        setThreads([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString("ja-JP", { month: "short", day: "numeric" });
  };

  const moreItems = isCeo
    ? [...HOME_MORE_NAV, { href: "/ceo", label: "CEO", icon: "⚙" }]
    : HOME_MORE_NAV;

  return (
    <div className="min-h-screen pb-24" style={{ background: C.bg }}>
      <main className="max-w-xl mx-auto px-4 pt-6 pb-4 space-y-4">
        <motion.div className="flex items-center justify-between"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div>
            <p style={{ fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase" as const,
              color: C.t4, marginBottom: 4 }}>Talk</p>
            <h1 style={{ fontSize: 20, fontWeight: 300, color: C.t1 }}>
              つながった人たち
            </h1>
          </div>
          {/* Genome Card: 友達追加アイコン（LINE風） */}
          <button
            onClick={() => {
              const event = new CustomEvent("open-genome-card-modal");
              window.dispatchEvent(event);
            }}
            className="flex items-center justify-center w-10 h-10 rounded-2xl transition-all active:scale-90"
            style={{
              background: "rgba(139,92,246,0.08)",
              border: "1px solid rgba(139,92,246,0.15)",
            }}
            aria-label="カード交換"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-1a4 4 0 00-4-4H6a4 4 0 00-4 4v1" />
              <circle cx="9" cy="8" r="3" />
              <line x1="19" y1="8" x2="19" y2="14" />
              <line x1="16" y1="11" x2="22" y2="11" />
            </svg>
          </button>
        </motion.div>

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-2xl p-4" style={{ background: C.s1, border: `1px solid ${C.s2}` }}>
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full animate-pulse" style={{ background: C.s2 }} />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 w-20 rounded animate-pulse" style={{ background: C.s2 }} />
                    <div className="h-2.5 w-40 rounded animate-pulse" style={{ background: C.s2 }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : threads.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl text-center py-16"
            style={{ background: C.s1, border: `1px solid ${C.s2}`, padding: 24 }}
          >
            <div style={{ fontSize: 32, marginBottom: 12, color: C.t4 }}>∞</div>
            <p style={{ fontSize: 13, color: C.t3, lineHeight: 1.8 }}>
              まだ会話相手がいません。<br />
              Genome Card を交換すると、ここに会話が生まれます。
            </p>
            <button
              onClick={() => {
                const event = new CustomEvent("open-genome-card-modal");
                window.dispatchEvent(event);
              }}
              className="inline-block mt-4 px-5 py-2.5 rounded-xl text-sm font-medium"
              style={{ background: `linear-gradient(135deg, ${C.neural}, ${C.pulse})`, color: "white" }}>
              カード交換を始める
            </button>
          </motion.div>
        ) : (
          <div className="space-y-1.5">
            {threads.map((thread, i) => (
              <motion.div key={thread.threadId}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}>
                <Link href={`/talk/${thread.threadId}`}
                  className="flex items-center gap-3 rounded-2xl p-3.5 transition-all active:scale-[0.98]"
                  style={{ background: C.s1, border: `1px solid ${C.s2}` }}>
                  <div className="w-11 h-11 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0"
                    style={{ background: "linear-gradient(135deg, #f0eaf8, #e6e0f4)" }}>
                    {thread.counterpart.avatarUrl ? (
                      <img src={thread.counterpart.avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span style={{ fontSize: 20, color: C.t3 }}>
                        {(thread.counterpart.displayName ?? "?")[0]}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p style={{ fontSize: 13, fontWeight: thread.unreadCount > 0 ? 600 : 500, color: C.t1 }}
                        className="truncate">
                        {thread.counterpart.displayName ?? "ユーザー"}
                      </p>
                      {thread.lastMessage && (
                        <span style={{ fontSize: 9, color: C.t4, flexShrink: 0, marginLeft: 8 }}>
                          {formatTime(thread.lastMessage.createdAt)}
                        </span>
                      )}
                    </div>
                    <p style={{
                      fontSize: 11, marginTop: 2,
                      color: thread.unreadCount > 0 ? C.t2 : C.t3,
                      fontWeight: thread.unreadCount > 0 ? 500 : 400,
                    }} className="truncate">
                      {thread.lastMessage?.body ?? "メッセージはまだありません"}
                    </p>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </main>

      {/* Genome Card 交換モーダル */}
      <GenomeCardModal />

      {/* QuickAccess（トーク→ホームに置換） */}
      <div className="fixed bottom-0 left-0 right-0 z-40">
        <QuickAccessBar items={TALK_QUICK_NAV} moreItems={moreItems} />
      </div>
    </div>
  );
}
