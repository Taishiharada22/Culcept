"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { FloatingNavLight } from "@/components/ui/glassmorphism-design";
import { MAIN_NAV } from "@/lib/navigation";
import type { TalkThreadItem } from "@/lib/genome/cardTypes";

const C = {
  bg: "linear-gradient(180deg, #f8f6f3 0%, #f6f3f0 30%, #f4f1ed 60%, #f6f3f0 100%)",
  s1: "#ffffff", s2: "#f5f6fa",
  t1: "#1a1a2e", t2: "#4a4a68", t3: "#8888a0", t4: "#c8c8dc",
  neural: "#8B5CF6", pulse: "#EC4899",
};

export default function TalkPageClient() {
  const [threads, setThreads] = useState<TalkThreadItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchThreads = async () => {
      try {
        const res = await fetch("/api/talk/threads");
        if (!res.ok) return;
        const data = await res.json().catch(() => null);
        if (data?.ok) setThreads(data.threads);
      } catch { /* ignore */ } finally {
        setLoading(false);
      }
    };
    fetchThreads();
    // 10秒ごとにスレッドリスト更新（新メッセージ検出）
    const interval = setInterval(fetchThreads, 10000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return "たった今";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}時間前`;
    if (d.toDateString() === new Date(now.getTime() - 86400000).toDateString()) return "昨日";
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  return (
    <div className="min-h-screen relative" style={{ background: C.bg }}>
      <main className="relative z-10 max-w-lg mx-auto px-4 pt-8 pb-32">
        {/* ヘッダー */}
        <motion.div
          className="flex items-baseline justify-between mb-6"
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
          <Link href="/genome-card" style={{ fontSize: 10, color: C.neural }}>
            カード交換 →
          </Link>
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
            <Link href="/genome-card"
              className="inline-block mt-4 px-5 py-2.5 rounded-xl text-sm font-medium"
              style={{ background: `linear-gradient(135deg, ${C.neural}, ${C.pulse})`, color: "white" }}>
              カード交換を始める
            </Link>
          </motion.div>
        ) : (
          <div className="space-y-1.5">
            {threads.map((thread, i) => (
              <motion.div key={thread.threadId}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}>
                <Link href={`/talk/${thread.threadId}`}
                  className="flex items-center gap-3 rounded-2xl p-3.5 transition-all"
                  style={{
                    background: thread.unreadCount > 0 ? "rgba(255,255,255,0.95)" : C.s1,
                    border: `1px solid ${thread.unreadCount > 0 ? `${C.neural}15` : C.s2}`,
                    boxShadow: thread.unreadCount > 0 ? `0 2px 8px ${C.neural}08` : "none",
                  }}>
                  {/* アバター */}
                  <div className="relative flex-shrink-0">
                    {thread.counterpart.avatarUrl ? (
                      <img src={thread.counterpart.avatarUrl}
                        alt={`${thread.counterpart.displayName ?? "ユーザー"}のアバター`}
                        className="w-11 h-11 rounded-full object-cover" />
                    ) : (
                      <div className="w-11 h-11 rounded-full flex items-center justify-center"
                        style={{ background: `linear-gradient(135deg, ${C.neural}20, ${C.pulse}20)`,
                          fontSize: 14, fontWeight: 600, color: C.t2 }}>
                        {thread.counterpart.displayName?.[0] ?? "?"}
                      </div>
                    )}
                    {/* オンラインっぽいインジケーター（未読があればアクセントで光る） */}
                    {thread.unreadCount > 0 && (
                      <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center"
                        style={{ background: `linear-gradient(135deg, ${C.neural}, ${C.pulse})`,
                          border: "2px solid white", fontSize: 7, fontWeight: 700, color: "white" }}>
                        {thread.unreadCount > 9 ? "9+" : thread.unreadCount}
                      </div>
                    )}
                  </div>

                  {/* テキスト */}
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

      <FloatingNavLight items={MAIN_NAV} activeHref="/talk" />
    </div>
  );
}
