"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { HOME_MORE_NAV } from "@/lib/navigation";
import { useCeoCheck } from "@/hooks/useCeoCheck";
import QuickAccessBar from "@/components/home/QuickAccessBar";
import GenomeCardModal from "@/components/genome/GenomeCardModal";
import type { TalkThreadItem, GenomeConnection } from "@/lib/genome/cardTypes";

const C = {
  bg: "linear-gradient(180deg, #f8f6f3 0%, #f6f3f0 30%, #f4f1ed 60%, #f6f3f0 100%)",
  s1: "#ffffff", s2: "#f5f6fa",
  t1: "#1a1a2e", t2: "#4a4a68", t3: "#8888a0", t4: "#c8c8dc",
  neural: "#8B5CF6", pulse: "#EC4899",
};

const TALK_QUICK_NAV = [
  { href: "/calendar", label: "コーデ" },
  { href: "/stargazer", label: "観測" },
  { href: "/", label: "ホーム" },
  { href: "/origin", label: "日記" },
  { href: "/rendezvous", label: "出会う" },
];

type TopTab = "home" | "talk" | "add";

/* ── SVG Icons (QuickAccessBar と同じスタイル) ── */
const TabIcon = ({ tab, active }: { tab: TopTab; active: boolean }) => {
  const color = active ? C.neural : C.t3;
  if (tab === "home") return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" />
      <path d="M9 21V12h6v9" />
    </svg>
  );
  if (tab === "talk") return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
    </svg>
  );
  // add
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-1a4 4 0 00-4-4H6a4 4 0 00-4 4v1" />
      <circle cx="9" cy="8" r="3" />
      <line x1="19" y1="8" x2="19" y2="14" />
      <line x1="16" y1="11" x2="22" y2="11" />
    </svg>
  );
};

export default function TalkPageClient() {
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") === "talk" ? "talk" : "home") as TopTab;
  const [threads, setThreads] = useState<TalkThreadItem[]>([]);
  const [connections, setConnections] = useState<GenomeConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [topTab, setTopTab] = useState<TopTab>(initialTab);
  const [expandedFriend, setExpandedFriend] = useState<string | null>(null);
  const isCeo = useCeoCheck();

  const fetchData = async () => {
    try {
      const [threadRes, connRes] = await Promise.all([
        fetch("/api/talk/threads"),
        fetch("/api/genome-connections"),
      ]);
      if (threadRes.ok) {
        const data = await threadRes.json();
        setThreads(data.threads ?? []);
      }
      if (connRes.ok) {
        const data = await connRes.json();
        if (data.ok) setConnections(data.connections ?? []);
      }
    } catch {
      setThreads([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // 5秒ポーリングでスレッドリストを更新
    const poll = setInterval(fetchData, 5000);
    return () => clearInterval(poll);
  }, []);

  const pending = connections.filter((c) => c.status === "pending");
  const accepted = connections.filter((c) => c.status === "accepted");

  const handleAccept = async (id: string) => {
    const res = await fetch(`/api/genome-connections/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "accept" }),
    });
    if (res.ok) {
      // リロード
      const connRes = await fetch("/api/genome-connections");
      if (connRes.ok) {
        const data = await connRes.json();
        if (data.ok) setConnections(data.connections ?? []);
      }
      const threadRes = await fetch("/api/talk/threads");
      if (threadRes.ok) {
        const data = await threadRes.json();
        setThreads(data.threads ?? []);
      }
    }
  };

  const handleDecline = async (id: string) => {
    const res = await fetch(`/api/genome-connections/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "decline" }),
    });
    if (res.ok) {
      const connRes = await fetch("/api/genome-connections");
      if (connRes.ok) {
        const data = await connRes.json();
        if (data.ok) setConnections(data.connections ?? []);
      }
    }
  };

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
      {/* ═══ トップナビ（固定） ═══ */}
      <div className="sticky top-0 z-30" style={{
        background: "rgba(248,246,243,0.92)",
        backdropFilter: "blur(16px) saturate(1.5)",
        paddingTop: "calc(12px + env(safe-area-inset-top))",
      }}>
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-xl mx-auto px-4 pb-3"
        >
          <div className="flex gap-1 p-1 rounded-xl" style={{ background: C.s2, border: `1px solid ${C.t4}20` }}>
            {([
              { key: "home" as const, label: "ホーム" },
              { key: "talk" as const, label: "トーク" },
              { key: "add" as const, label: "友だち追加" },
            ]).map((tab) => (
              <button
                key={tab.key}
                onClick={() => {
                  if (tab.key === "add") {
                    window.dispatchEvent(new CustomEvent("open-genome-card-modal"));
                  } else {
                    setTopTab(tab.key);
                  }
                }}
                className="relative flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg transition-all"
                style={{
                  background: topTab === tab.key && tab.key !== "add" ? C.s1 : "transparent",
                  boxShadow: topTab === tab.key && tab.key !== "add" ? "0 1px 6px rgba(0,0,0,0.06)" : "none",
                }}
              >
                <TabIcon tab={tab.key} active={topTab === tab.key && tab.key !== "add"} />
                <span style={{
                  fontSize: 11,
                  fontWeight: topTab === tab.key && tab.key !== "add" ? 600 : 400,
                  color: topTab === tab.key && tab.key !== "add" ? C.t1 : C.t3,
                }}>
                  {tab.label}
                </span>
                {/* リクエストバッジ（ホームタブ） */}
                {tab.key === "home" && pending.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center"
                    style={{ fontSize: 8, fontWeight: 700, color: "white",
                      background: `linear-gradient(135deg, #ef4444, ${C.pulse})` }}>
                    {pending.length}
                  </span>
                )}
              </button>
            ))}
          </div>
        </motion.div>
      </div>

      <main className="max-w-xl mx-auto px-4 pb-4 pt-3">
        <AnimatePresence mode="wait">
          {/* ═══ ホームタブ: 友だちリスト + リクエスト ═══ */}
          {topTab === "home" && (
            <motion.div
              key="home"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
              className="space-y-4"
            >
              {/* 友だちリスト */}
              {accepted.length > 0 ? (
                <div className="space-y-1.5">
                  {accepted.map((conn, i) => (
                    <motion.div key={conn.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                    >
                      <button
                        onClick={() => setExpandedFriend(expandedFriend === conn.id ? null : conn.id)}
                        className="w-full flex items-center gap-3 rounded-2xl p-3.5 text-left transition-all active:scale-[0.98]"
                        style={{ background: C.s1, border: `1px solid ${expandedFriend === conn.id ? `${C.neural}30` : C.s2}` }}
                      >
                        <div className="w-11 h-11 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0"
                          style={{ background: "linear-gradient(135deg, #f0eaf8, #e6e0f4)" }}>
                          {conn.counterpart.avatarUrl ? (
                            <img src={conn.counterpart.avatarUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span style={{ fontSize: 18, color: C.t3 }}>
                              {(conn.counterpart.displayName ?? "?")[0]}
                            </span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p style={{ fontSize: 13, fontWeight: 500, color: C.t1 }} className="truncate">
                            {conn.counterpart.displayName ?? "ユーザー"}
                          </p>
                        </div>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.t4} strokeWidth={2} strokeLinecap="round"
                          style={{ transform: expandedFriend === conn.id ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </button>

                      {/* 展開コンテンツ */}
                      <AnimatePresence>
                        {expandedFriend === conn.id && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className="flex gap-2 px-3 pt-2 pb-1">
                              <Link href={`/talk/${conn.threadId ?? conn.id}?from=home`}
                                className="flex-1 py-2.5 rounded-xl text-center text-xs font-medium transition-all active:scale-95"
                                style={{ background: `${C.neural}10`, color: C.neural, border: `1px solid ${C.neural}20` }}>
                                トーク
                              </Link>
                              <Link href={`/genome-card/${conn.counterpart.userId}`}
                                className="flex-1 py-2.5 rounded-xl text-center text-xs font-medium transition-all active:scale-95"
                                style={{ background: C.s2, color: C.t2 }}>
                                プロフィールを見る
                              </Link>
                              <Link href={`/genome-card/compatibility/${conn.counterpart.userId}`}
                                className="flex-1 py-2.5 rounded-xl text-center text-xs font-medium transition-all active:scale-95"
                                style={{ background: `linear-gradient(135deg, ${C.neural}, ${C.pulse})`, color: "white" }}>
                                相性を見る
                              </Link>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  ))}
                </div>
              ) : !loading ? (
                <div className="rounded-2xl text-center py-12"
                  style={{ background: C.s1, border: `1px solid ${C.s2}`, padding: 24 }}>
                  <div style={{ fontSize: 32, marginBottom: 12, color: C.t4 }}>∞</div>
                  <p style={{ fontSize: 13, color: C.t3, lineHeight: 1.8 }}>
                    まだ友だちがいません。<br />
                    カード交換で友だちを追加しましょう。
                  </p>
                </div>
              ) : null}

              {/* リクエスト */}
              {pending.length > 0 && (
                <div className="space-y-2">
                  <h2 className="flex items-center gap-2" style={{ fontSize: 12, fontWeight: 600, color: C.t1 }}>
                    リクエスト
                    <span className="w-5 h-5 rounded-full flex items-center justify-center"
                      style={{ fontSize: 9, fontWeight: 700, color: "white",
                        background: `linear-gradient(135deg, #ef4444, ${C.pulse})` }}>
                      {pending.length}
                    </span>
                  </h2>
                  {pending.map((conn) => (
                    <div key={conn.id} className="rounded-2xl flex items-center justify-between"
                      style={{ background: C.s1, border: `1px solid ${C.s2}`, padding: "12px 16px" }}>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center"
                          style={{ background: "linear-gradient(135deg, #f0eaf8, #e6e0f4)", fontSize: 14, color: C.t3 }}>
                          {(conn.counterpart.displayName ?? "?")[0]}
                        </div>
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 500, color: C.t1 }}>
                            {conn.counterpart.displayName ?? "ユーザー"}
                          </p>
                          <p style={{ fontSize: 10, color: C.t4 }}>カード交換リクエスト</p>
                        </div>
                      </div>
                      <div className="flex gap-1.5">
                        <button onClick={() => handleAccept(conn.id)}
                          className="px-3.5 py-2 rounded-lg text-xs font-medium min-h-[40px]"
                          style={{ background: `linear-gradient(135deg, ${C.neural}, ${C.pulse})`, color: "white" }}>
                          承認
                        </button>
                        <button onClick={() => handleDecline(conn.id)}
                          className="px-3.5 py-2 rounded-lg text-xs font-medium min-h-[40px]"
                          style={{ background: C.s2, color: C.t3 }}>
                          拒否
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ローディング */}
              {loading && (
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
              )}
            </motion.div>
          )}

          {/* ═══ トークタブ: 会話一覧 ═══ */}
          {topTab === "talk" && (
            <motion.div
              key="talk"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
            >
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
                <div className="rounded-2xl text-center py-16"
                  style={{ background: C.s1, border: `1px solid ${C.s2}`, padding: 24 }}>
                  <div style={{ fontSize: 32, marginBottom: 12, color: C.t4 }}>∞</div>
                  <p style={{ fontSize: 13, color: C.t3, lineHeight: 1.8 }}>
                    まだ会話がありません。<br />
                    友だちを追加するとトークできます。
                  </p>
                </div>
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
                        {thread.unreadCount > 0 && (
                          <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center"
                            style={{ fontSize: 9, fontWeight: 700, color: "white",
                              background: `linear-gradient(135deg, ${C.neural}, ${C.pulse})` }}>
                            {thread.unreadCount}
                          </span>
                        )}
                      </Link>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <GenomeCardModal />

      <div className="fixed bottom-0 left-0 right-0 z-40">
        <QuickAccessBar items={TALK_QUICK_NAV} moreItems={moreItems} />
      </div>
    </div>
  );
}
