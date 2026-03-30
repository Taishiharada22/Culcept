"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { FloatingNavLight } from "@/components/ui/glassmorphism-design";
import { MAIN_NAV } from "@/lib/navigation";
import GenomeCardLiving from "./_components/GenomeCardLiving";
import VisibilityControl from "./_components/VisibilityControl";
import SendRequestModal from "./_components/SendRequestModal";
import ShareMyCardModal from "./_components/ShareMyCardModal";
import type { GenomeCardData, GenomeConnection } from "@/lib/genome/cardTypes";
import CardErrorBoundary from "./_components/CardErrorBoundary";
import { generateNarrative } from "@/lib/genome/narrativeEngine";
import ConnectionEstablishedModal from "./_components/ConnectionEstablishedModal";
import FeatureIntroduction from "@/components/ui/FeatureIntroduction";
import { GENOME_CARD_INTRO } from "@/lib/ui/featureIntroConfigs";

/* ── Home統一カラー ── */
const C = {
  bg: "linear-gradient(180deg, #f8f6f3 0%, #f6f3f0 30%, #f4f1ed 60%, #f6f3f0 100%)",
  s1: "#ffffff",
  s2: "#f5f6fa",
  t1: "#1a1a2e",
  t2: "#4a4a68",
  t3: "#8888a0",
  t4: "#c8c8dc",
  neural: "#8B5CF6",
  pulse: "#EC4899",
};

type Tab = "overview" | "card" | "connections";

const TABS: { key: Tab; label: string; sublabel: string }[] = [
  { key: "overview", label: "概要", sublabel: "Overview" },
  { key: "card", label: "カード", sublabel: "Card" },
  { key: "connections", label: "つながり", sublabel: "Connect" },
];

export default function GenomeCardPageClient() {
  const [card, setCard] = useState<GenomeCardData | null>(null);
  const [connections, setConnections] = useState<GenomeConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSendModal, setShowSendModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [celebration, setCelebration] = useState<string | null>(null);
  const [establishedConn, setEstablishedConn] = useState<{
    counterpart: { userId: string; displayName: string | null; avatarUrl: string | null };
    threadId: string | null;
    theirArchetype: string | null;
    theirRadar: { analytical: number; cautious: number; social: number; expressive: number; independent: number } | null;
  } | null>(null);
  const tabBarRef = useRef<HTMLDivElement>(null);

  const fetchData = async () => {
    try {
      const [cardRes, connRes] = await Promise.all([
        fetch("/api/genome-card"),
        fetch("/api/genome-connections"),
      ]);
      if (cardRes.ok) {
        const cardData = await cardRes.json().catch(() => null);
        if (cardData?.ok) {
          const newCard = cardData.card;
          // sessionStorage を使い、セッション内でのみマイルストーン比較
          // （localStorage の stale 値がタブ間で不整合を起こす問題を解消）
          const prevComp = Number(sessionStorage.getItem("genome_completeness") ?? "0");
          if (newCard.completeness > prevComp && prevComp > 0) {
            const milestones = [25, 50, 75, 100];
            const crossedMilestone = milestones.find((m) => newCard.completeness >= m && prevComp < m);
            if (crossedMilestone) {
              setCelebration(`Genome完成度が${crossedMilestone}%に到達しました`);
            } else {
              setCelebration("Genomeが更新されました");
            }
            setTimeout(() => setCelebration(null), 4000);
          }
          sessionStorage.setItem("genome_completeness", String(newCard.completeness));
          setCard(newCard);
        }
      }
      if (connRes.ok) {
        const connData = await connRes.json().catch(() => null);
        if (connData?.ok) setConnections(connData.connections);
      }
    } catch {
      // ネットワークエラー — 静かに失敗（ページは空状態表示）
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const pending = connections.filter((c) => c.status === "pending");
  const accepted = connections.filter((c) => c.status === "accepted");

  const handleAccept = async (id: string) => {
    const conn = connections.find((c) => c.id === id);
    const res = await fetch(`/api/genome-connections/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "accept" }),
    });
    if (res.ok) {
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate([50, 30, 100]);
      }
      await fetchData();
      // 相手のカードデータを取得してウェルカムモーダル表示
      if (conn) {
        try {
          const theirRes = await fetch(`/api/genome-card/${conn.counterpart.userId}`);
          const theirData = await theirRes.json();
          const acceptRes = await res.json().catch(() => null);
          setEstablishedConn({
            counterpart: conn.counterpart,
            threadId: acceptRes?.threadId ?? null,
            theirArchetype: theirData.ok ? theirData.card?.archetypeLabel : null,
            theirRadar: theirData.ok ? theirData.card?.cardBack?.radarAxes : null,
          });
        } catch {
          // フォールバック: 基本情報のみ表示
          setEstablishedConn({
            counterpart: conn.counterpart,
            threadId: null,
            theirArchetype: null,
            theirRadar: null,
          });
        }
      }
    }
  };

  const handleDecline = async (id: string) => {
    const res = await fetch(`/api/genome-connections/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "decline" }),
    });
    if (res.ok) fetchData();
  };

  return (
    <div className="min-h-screen relative" style={{ background: C.bg }}>
      <main className="relative z-10 max-w-lg mx-auto px-4 pt-8 pb-32 space-y-6">
        {/* ═══ ヘッダー ═══ */}
        <motion.div
          className="text-center"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <p style={{ fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase" as const,
            color: C.t4, marginBottom: 6 }}>
            Genome Card
          </p>
          <h1 style={{
            fontSize: 20, fontWeight: 300, letterSpacing: "0.02em", color: C.t1, lineHeight: 1.6,
          }}>
            {card?.archetypeLabel && card.archetypeLabel !== "タイプ形成中"
              ? `あなたは、${card.archetypeLabel}。`
              : "あなたは、まだ名前を持たない。"}
          </h1>
        </motion.div>

        {/* ═══ 成長お祝い (EF-2) ═══ */}
        <AnimatePresence>
          {celebration && (
            <motion.div
              initial={{ opacity: 0, y: -12, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.95 }}
              className="rounded-xl text-center py-3 px-4"
              style={{
                background: `linear-gradient(135deg, ${C.neural}15, ${C.pulse}15)`,
                border: `1px solid ${C.neural}25`,
              }}
              onClick={() => setCelebration(null)}
            >
              <p style={{ fontSize: 12, fontWeight: 600, color: C.neural }}>{celebration}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ═══ タブバー ═══ */}
        <div
          ref={tabBarRef}
          className="flex gap-1 p-1 rounded-xl"
          style={{ background: C.s2, border: `1px solid ${C.t4}30` }}
        >
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="relative flex-1 py-2.5 px-3 rounded-lg transition-all"
              style={{
                background: activeTab === tab.key ? C.s1 : "transparent",
                boxShadow: activeTab === tab.key ? "0 2px 8px rgba(0,0,0,0.06)" : "none",
              }}
            >
              <span style={{
                fontSize: 12, fontWeight: activeTab === tab.key ? 600 : 400,
                color: activeTab === tab.key ? C.t1 : C.t3,
                display: "block",
              }}>
                {tab.label}
              </span>
              <span style={{
                fontSize: 8, letterSpacing: "0.1em", textTransform: "uppercase" as const,
                color: activeTab === tab.key ? C.t3 : C.t4,
                display: "block", marginTop: 2,
              }}>
                {tab.sublabel}
              </span>
              {tab.key === "connections" && pending.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center"
                  style={{
                    fontSize: 9, fontWeight: 700, color: "white",
                    background: `linear-gradient(135deg, #ef4444, ${C.pulse})`,
                  }}>
                  {pending.length}
                </span>
              )}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {/* ═══ 概要タブ ═══ */}
          {activeTab === "overview" && (
            <motion.div
              key="overview"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.35 }}
              className="space-y-5"
            >
              {loading ? (
                <div className="space-y-4">
                  {/* カードスケルトン */}
                  <div className="rounded-2xl overflow-hidden" style={{
                    background: "linear-gradient(135deg, #1a1040 0%, #0f0a1e 100%)",
                    padding: 20, minHeight: 240,
                  }}>
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-12 h-12 rounded-xl animate-pulse" style={{ background: "rgba(255,255,255,0.05)" }} />
                      <div className="space-y-2">
                        <div className="h-4 w-28 rounded animate-pulse" style={{ background: "rgba(255,255,255,0.06)" }} />
                        <div className="h-2.5 w-16 rounded animate-pulse" style={{ background: "rgba(255,255,255,0.04)" }} />
                      </div>
                    </div>
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-5 w-48 rounded animate-pulse" style={{ background: "rgba(255,255,255,0.05)" }} />
                      <div className="h-3 w-36 rounded animate-pulse" style={{ background: "rgba(255,255,255,0.03)" }} />
                    </div>
                  </div>
                  {/* ストーリースケルトン */}
                  <div className="rounded-2xl" style={{ background: C.s1, border: `1px solid ${C.s2}`, padding: "16px 20px" }}>
                    <div className="space-y-2">
                      <div className="h-3 w-full rounded animate-pulse" style={{ background: C.s2 }} />
                      <div className="h-3 w-4/5 rounded animate-pulse" style={{ background: C.s2 }} />
                    </div>
                  </div>
                </div>
              ) : card ? (
                <div className="space-y-4">
                  {/* メインカード — ダークプレミアム表示 */}
                  <CardErrorBoundary>
                    <GenomeCardLiving card={card} compact />
                  </CardErrorBoundary>

                  {/* ナラティブストーリー */}
                  {(() => {
                    const n = generateNarrative(card);
                    return n.story && card.journeyStats && card.journeyStats.totalObservations > 0 ? (
                      <motion.div
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.08 }}
                        className="rounded-2xl text-center"
                        style={{ background: C.s1, border: `1px solid ${C.s2}`, padding: "16px 20px" }}
                      >
                        <p style={{ fontSize: 12, color: C.t2, lineHeight: 1.8 }}>
                          {n.story}
                        </p>
                      </motion.div>
                    ) : null;
                  })()}

                  {/* あなたの発見 + 禁断の問い */}
                  {(() => {
                    const n = generateNarrative(card);
                    const pi = card.personalInsights;
                    const hasContent = n.heroTrait || n.temporalInsight || (pi && pi.length > 0);
                    if (!hasContent) return null;
                    return (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="rounded-2xl space-y-4"
                        style={{ background: C.s1, border: `1px solid ${C.s2}`, padding: "16px 20px" }}
                      >
                        {/* ヒーロートレイト */}
                        {n.heroTrait && (
                          <div>
                            <p style={{ fontSize: 9, color: C.t4, letterSpacing: "0.12em", marginBottom: 6,
                              textTransform: "uppercase" as const }}>あなたの発見</p>
                            <div className="flex items-start gap-3">
                              <div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
                                style={{ background: `${C.neural}12` }}>
                                <span style={{ fontSize: 14 }}>✦</span>
                              </div>
                              <div>
                                <p style={{ fontSize: 12, fontWeight: 600, color: C.t1 }}>
                                  {n.heroTrait.label}
                                </p>
                                <p style={{ fontSize: 11, color: C.t3, lineHeight: 1.6, marginTop: 2 }}>
                                  {n.heroTrait.description}
                                </p>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* パーソナル洞察 — あなただけの矛盾 */}
                        {pi && pi.length > 0 && (
                          <div>
                            <p style={{ fontSize: 9, color: C.t4, letterSpacing: "0.12em", marginBottom: 6,
                              textTransform: "uppercase" as const }}>あなただけの矛盾</p>
                            <div className="space-y-2">
                              {pi.map((item, i) => (
                                <div key={i} style={{ padding: "10px 12px", borderRadius: 10,
                                  background: i === 0 ? `${C.pulse}06` : `${C.neural}04`,
                                  borderLeft: `2px solid ${i === 0 ? C.pulse : C.neural}20` }}>
                                  <p style={{ fontSize: 11, color: C.t2, lineHeight: 1.7 }}>
                                    {item.insight}
                                  </p>
                                  <p style={{ fontSize: 10, color: C.pulse, marginTop: 6, fontWeight: 500 }}>
                                    {item.question}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* テンポラルインサイト */}
                        {n.temporalInsight && (
                          <div style={{ padding: "10px 12px", borderRadius: 10,
                            background: `${C.neural}06`, border: `1px solid ${C.neural}10` }}>
                            <p style={{ fontSize: 10, color: C.t2, lineHeight: 1.7, fontStyle: "italic" }}>
                              {n.temporalInsight}
                            </p>
                          </div>
                        )}
                      </motion.div>
                    );
                  })()}

                </div>
              ) : (
                <div className="rounded-2xl text-center py-12 space-y-4 relative overflow-hidden" style={{
                  background: C.s1, border: `1px solid ${C.s2}`, padding: 24,
                }}>
                  {/* タイプが形成されるアニメーション */}
                  <div className="relative mx-auto" style={{ width: 120, height: 120 }}>
                    <svg viewBox="0 0 120 120" className="w-full h-full">
                      {/* 星が徐々に現れる */}
                      {[
                        { cx: 60, cy: 20, delay: 0 },
                        { cx: 95, cy: 45, delay: 0.3 },
                        { cx: 85, cy: 85, delay: 0.6 },
                        { cx: 35, cy: 85, delay: 0.9 },
                        { cx: 25, cy: 45, delay: 1.2 },
                      ].map((s, i) => (
                        <motion.circle key={i} cx={s.cx} cy={s.cy} r="2.5"
                          fill={C.neural}
                          initial={{ opacity: 0, scale: 0 }}
                          animate={{ opacity: [0, 0.8, 0.4, 0.8], scale: [0, 1.2, 0.8, 1] }}
                          transition={{ delay: s.delay, duration: 2, repeat: Infinity, repeatDelay: 3 }}
                        />
                      ))}
                      {/* 星をつなぐ線 */}
                      {[
                        { x1: 60, y1: 20, x2: 95, y2: 45, delay: 0.5 },
                        { x1: 95, y1: 45, x2: 85, y2: 85, delay: 0.8 },
                        { x1: 85, y1: 85, x2: 35, y2: 85, delay: 1.1 },
                        { x1: 35, y1: 85, x2: 25, y2: 45, delay: 1.4 },
                        { x1: 25, y1: 45, x2: 60, y2: 20, delay: 1.7 },
                      ].map((l, i) => (
                        <motion.line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
                          stroke={C.neural} strokeWidth="0.5" strokeOpacity="0.3"
                          initial={{ pathLength: 0, opacity: 0 }}
                          animate={{ pathLength: 1, opacity: [0, 0.3, 0.15, 0.3] }}
                          transition={{ delay: l.delay, duration: 1.5, repeat: Infinity, repeatDelay: 3 }}
                        />
                      ))}
                    </svg>
                  </div>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 600, color: C.t1 }}>
                      あなたのタイプは、まだ見えていない
                    </p>
                    <p style={{ fontSize: 12, color: C.t3, marginTop: 6, lineHeight: 1.8 }}>
                      観測を始めると、ここにあなただけの<br />
                      Genome Card が生まれます
                    </p>
                  </div>
                  <Link href="/stargazer"
                    className="inline-block px-6 py-2.5 rounded-xl text-sm font-medium"
                    style={{
                      background: `linear-gradient(135deg, ${C.neural}, ${C.pulse})`,
                      color: "white",
                    }}>
                    最初の観測を始める
                  </Link>
                </div>
              )}

              {/* あなたの旅路 */}
              {card && card.journeyStats && card.journeyStats.totalObservations > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                  className="rounded-2xl"
                  style={{ background: C.s1, border: `1px solid ${C.s2}`, padding: "16px 20px" }}
                >
                  <div className="flex items-baseline justify-between mb-2">
                    <span style={{ fontSize: 9, fontWeight: 400, color: C.t4, letterSpacing: "0.12em", textTransform: "uppercase" as const }}>
                      あなたの旅路
                    </span>
                    <span style={{ fontSize: 10, color: C.t4 }}>
                      Lv.{card.journeyStats.cardLevel} {card.journeyStats.cardLevelLabel}
                    </span>
                  </div>
                  {/* 進捗バー — 次レベルまで */}
                  <div style={{ height: 2, borderRadius: 1, background: C.s2, overflow: "hidden", marginBottom: 12 }}>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${card.completeness}%` }}
                      transition={{ duration: 1, ease: "easeOut", delay: 0.2 }}
                      style={{ height: "100%", borderRadius: 1,
                        background: `linear-gradient(90deg, ${C.neural}, ${C.pulse})` }}
                    />
                  </div>
                  <div className="flex gap-6 justify-center">
                    <div className="text-center">
                      <p style={{ fontSize: 20, fontWeight: 200, color: C.t1, fontFamily: "monospace" }}>
                        {card.journeyStats.totalObservations}
                      </p>
                      <p style={{ fontSize: 7, color: C.t4, letterSpacing: "0.1em" }}>回の問い</p>
                    </div>
                    {card.journeyStats.daysSinceFirst > 0 && (
                      <div className="text-center">
                        <p style={{ fontSize: 20, fontWeight: 200, color: C.t1, fontFamily: "monospace" }}>
                          {card.journeyStats.daysSinceFirst}
                        </p>
                        <p style={{ fontSize: 7, color: C.t4, letterSpacing: "0.1em" }}>日の旅路</p>
                      </div>
                    )}
                    <div className="text-center">
                      <p style={{ fontSize: 20, fontWeight: 200, color: C.t1, fontFamily: "monospace" }}>
                        {card.journeyStats.stability}%
                      </p>
                      <p style={{ fontSize: 7, color: C.t4, letterSpacing: "0.1em" }}>安定度</p>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* アクションボタン */}
              <motion.div
                className="flex gap-2"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <button
                  className="flex-1 py-3 rounded-xl text-sm font-medium transition-all"
                  onClick={() => setShowSendModal(true)}
                  style={{
                    background: `linear-gradient(135deg, ${C.neural}, ${C.pulse})`,
                    color: "white",
                  }}
                >
                  交換リクエスト
                </button>
                {card && (
                  <button
                    className="py-3 px-4 rounded-xl text-sm font-medium transition-all"
                    onClick={() => setShowShareModal(true)}
                    aria-label="カードをシェア"
                    style={{ background: C.s1, border: `1px solid ${C.s2}`, color: C.t2 }}
                  >
                    📤
                  </button>
                )}
                <button
                  className="flex-1 py-3 rounded-xl text-sm font-medium transition-all"
                  onClick={() => setActiveTab("connections")}
                  style={{ background: C.s1, border: `1px solid ${C.s2}`, color: C.t2 }}
                >
                  つながり
                </button>
              </motion.div>
            </motion.div>
          )}

          {/* ═══ カードタブ ═══ */}
          {activeTab === "card" && (
            <motion.div
              key="card"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.35 }}
              className="space-y-6"
            >
              {loading ? (
                <div className="rounded-2xl" style={{
                  background: C.s1, border: `1px solid ${C.s2}`, padding: 24, height: 420,
                }}>
                  <div className="w-full h-full rounded-xl animate-pulse" style={{ background: C.s2 }} />
                </div>
              ) : card ? (
                <>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-center space-y-1"
                    style={{ paddingTop: 8, paddingBottom: 4 }}
                  >
                    <p style={{ fontSize: 11, color: C.t3, fontWeight: 300 }}>
                      あなたのカード
                    </p>
                    <p style={{ fontSize: 8, color: C.t4, letterSpacing: "0.06em" }}>
                      タップで裏返す ・ 傾けるとホログラムが揺れる
                    </p>
                  </motion.div>
                  <CardErrorBoundary>
                    <GenomeCardLiving card={card} />
                  </CardErrorBoundary>

                  {/* カード構成要素 */}
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="rounded-2xl"
                    style={{ background: C.s1, border: `1px solid ${C.s2}`, padding: "16px 20px" }}
                  >
                    <p style={{ fontSize: 11, fontWeight: 500, color: C.t2, marginBottom: 12 }}>
                      カードの構成要素
                    </p>
                    <div className="space-y-2">
                      {[
                        { label: "アーキタイプ", source: "深層観測", filled: !!card.archetypeLabel },
                        { label: "大切にしていること", source: "星の観測", filled: !!card.cardFront?.coreValue },
                        { label: "迷うとき", source: "星の観測", filled: !!card.cardFront?.dilemma },
                        { label: "本当の願い", source: "星の観測", filled: !!card.cardFront?.secretDesire },
                        { label: "今の関心", source: "日々の記録", filled: !!card.cardFront?.currentCuriosity },
                        { label: "5軸レーダー", source: "星の観測", filled: !!card.cardBack?.radarAxes },
                        { label: "強み", source: "星の観測", filled: !!(card.cardBack?.strengths?.length) },
                        { label: "恋愛パターン", source: "星の観測", filled: !!card.cardBack?.lovePattern },
                        { label: "深夜の独白", source: "星の観測", filled: !!card.cardBack?.midnightThought },
                        { label: "名言", source: "星の観測", filled: !!card.cardBack?.quote },
                        { label: "パーソナルカラー", source: "身体の特徴", filled: !!card.pcSeason },
                        { label: "身体特性", source: "身体の特徴", filled: !!card.cardBack?.bodyTraits },
                      ].map((item) => (
                        <div key={item.label} className="flex items-center gap-2.5">
                          <div className="w-4 h-4 rounded-full flex items-center justify-center" style={{
                            background: item.filled ? "rgba(52,211,153,0.12)" : C.s2,
                          }}>
                            <span style={{
                              fontSize: 9,
                              color: item.filled ? "rgb(16,185,129)" : C.t4,
                            }}>
                              {item.filled ? "✓" : "−"}
                            </span>
                          </div>
                          <span style={{ fontSize: 11, color: item.filled ? C.t1 : C.t3, flex: 1 }}>
                            {item.label}
                          </span>
                          <span style={{ fontSize: 9, color: C.t4 }}>{item.source}</span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                </>
              ) : (
                <div className="rounded-2xl text-center py-12" style={{
                  background: C.s1, border: `1px solid ${C.s2}`, padding: 24,
                }}>
                  <div style={{ fontSize: 48, marginBottom: 16 }}>✦</div>
                  <p style={{ fontSize: 13, color: C.t3, lineHeight: 1.8 }}>
                    まだカードがありません。<br />
                    Stargazer で観測するとカードが生まれます。
                  </p>
                  <Link href="/stargazer"
                    className="inline-block mt-4 px-6 py-2.5 rounded-xl text-sm font-medium"
                    style={{
                      background: `linear-gradient(135deg, ${C.neural}, ${C.pulse})`,
                      color: "white",
                    }}>
                    観測を始める
                  </Link>
                </div>
              )}
            </motion.div>
          )}

          {/* ═══ つながりタブ ═══ */}
          {activeTab === "connections" && (
            <motion.div
              key="connections"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.35 }}
              className="space-y-5"
            >
              <div className="flex gap-2">
                <button
                  className="flex-1 py-3 rounded-xl text-sm font-medium"
                  onClick={() => setShowSendModal(true)}
                  style={{ background: `linear-gradient(135deg, ${C.neural}, ${C.pulse})`, color: "white" }}
                >
                  カード交換をリクエスト
                </button>
                <Link href="/genome-card/exchange"
                  className="flex-1 py-3 rounded-xl text-sm font-medium text-center"
                  style={{ background: C.s1, border: `1px solid ${C.s2}`, color: C.t2 }}
                >
                  リクエスト管理
                </Link>
              </div>

              {/* 受信リクエスト */}
              {pending.length > 0 && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                  <h2 className="flex items-center gap-2" style={{ fontSize: 12, fontWeight: 600, color: C.t1 }}>
                    受信リクエスト
                    <span className="w-5 h-5 rounded-full flex items-center justify-center"
                      style={{ fontSize: 9, fontWeight: 700, color: "white", background: `linear-gradient(135deg, #ef4444, ${C.pulse})` }}>
                      {pending.length}
                    </span>
                  </h2>
                  {pending.map((conn) => (
                    <div key={conn.id} className="rounded-2xl flex items-center justify-between" style={{
                      background: C.s1, border: `1px solid ${C.s2}`, padding: "12px 16px",
                    }}>
                      <div className="flex items-center gap-3">
                        {conn.counterpart.avatarUrl ? (
                          <img src={conn.counterpart.avatarUrl} alt={`${conn.counterpart.displayName ?? "ユーザー"}のアバター`} className="w-10 h-10 rounded-xl object-cover" />
                        ) : (
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                            style={{ background: `linear-gradient(135deg, ${C.neural}20, ${C.pulse}20)`, fontSize: 14, color: C.t2 }}>
                            {conn.counterpart.displayName?.[0] ?? "?"}
                          </div>
                        )}
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 500, color: C.t1 }}>
                            {conn.counterpart.displayName ?? "ユーザー"}
                          </p>
                          <p style={{ fontSize: 10, color: C.t4 }}>
                            {conn.visibilityRequester === 3 ? "🔓 信頼レベルで送ってくれました"
                              : conn.visibilityRequester === 2 ? "💬 会話レベルで交換リクエスト"
                              : "🤝 名刺レベルで交換リクエスト"}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-1.5">
                        <button onClick={() => handleAccept(conn.id)}
                          aria-label={`${conn.counterpart.displayName ?? "ユーザー"}のリクエストを承認`}
                          className="px-4 py-2 rounded-lg text-xs font-medium min-h-[44px]"
                          style={{ background: `linear-gradient(135deg, ${C.neural}, ${C.pulse})`, color: "white" }}>
                          承認
                        </button>
                        <button onClick={() => handleDecline(conn.id)}
                          aria-label={`${conn.counterpart.displayName ?? "ユーザー"}のリクエストを拒否`}
                          className="px-4 py-2 rounded-lg text-xs font-medium min-h-[44px]"
                          style={{ background: C.s2, color: C.t3 }}>
                          拒否
                        </button>
                      </div>
                    </div>
                  ))}
                </motion.div>
              )}

              {/* 接続済み */}
              {accepted.length > 0 && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="space-y-3">
                  <h2 style={{ fontSize: 12, fontWeight: 600, color: C.t1 }}>カード交換済み</h2>
                  {accepted.map((conn) => {
                    const myVisibility = conn.requesterId === card?.userId
                      ? conn.visibilityRequester : conn.visibilityTarget;
                    return (
                      <div key={conn.id} className="rounded-2xl" style={{
                        background: C.s1, border: `1px solid ${C.s2}`, padding: "14px 16px",
                      }}>
                        <div className="flex items-center gap-3">
                          {conn.counterpart.avatarUrl ? (
                            <img src={conn.counterpart.avatarUrl} alt={`${conn.counterpart.displayName ?? "ユーザー"}のアバター`} className="w-10 h-10 rounded-xl object-cover" />
                          ) : (
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                              style={{ background: `linear-gradient(135deg, ${C.neural}20, ${C.pulse}20)`, fontSize: 14, color: C.t2 }}>
                              {conn.counterpart.displayName?.[0] ?? "?"}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p style={{ fontSize: 13, fontWeight: 600, color: C.t1 }} className="truncate">
                              {conn.counterpart.displayName ?? "ユーザー"}
                            </p>
                            <div className="flex gap-2 mt-1.5">
                              <Link href={`/genome-card/${conn.counterpart.userId}`}
                                className="px-2.5 py-1 rounded-lg text-center"
                                style={{ fontSize: 10, fontWeight: 500, color: "white",
                                  background: `linear-gradient(135deg, ${C.neural}, ${C.pulse})` }}>
                                カードを見る
                              </Link>
                              {conn.threadId && (
                                <Link href={`/talk/${conn.threadId}`}
                                  className="px-2.5 py-1 rounded-lg text-center"
                                  style={{ fontSize: 10, fontWeight: 500, color: C.pulse,
                                    background: `${C.pulse}10`, border: `1px solid ${C.pulse}20` }}>
                                  トークする
                                </Link>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="mt-3">
                          <VisibilityControl connectionId={conn.id} currentLevel={myVisibility as 1 | 2 | 3} />
                        </div>
                      </div>
                    );
                  })}
                </motion.div>
              )}

              {/* 空状態 */}
              {!loading && accepted.length === 0 && pending.length === 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl text-center py-10"
                  style={{ background: C.s1, border: `1px solid ${C.s2}`, padding: 24 }}
                >
                  <div style={{ fontSize: 36, marginBottom: 12, color: C.t4 }}>∞</div>
                  <p style={{ fontSize: 13, color: C.t3, lineHeight: 1.8 }}>
                    まだ交換相手がいません。<br />
                    友達にリクエストを送ってみましょう。
                  </p>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <SendRequestModal
          isOpen={showSendModal}
          onClose={() => setShowSendModal(false)}
          onSent={fetchData}
          myCard={card}
        />

        {card && (
          <ShareMyCardModal
            isOpen={showShareModal}
            onClose={() => setShowShareModal(false)}
            card={card}
          />
        )}

        <ConnectionEstablishedModal
          isOpen={!!establishedConn}
          onClose={() => setEstablishedConn(null)}
          counterpart={establishedConn?.counterpart ?? { userId: "", displayName: null, avatarUrl: null }}
          myRadar={card?.cardBack?.radarAxes ?? null}
          theirRadar={establishedConn?.theirRadar ?? null}
          threadId={establishedConn?.threadId ?? null}
          theirArchetype={establishedConn?.theirArchetype ?? null}
        />
      </main>

      <FloatingNavLight items={MAIN_NAV} activeHref="/genome-card" />

      <FeatureIntroduction
        {...GENOME_CARD_INTRO}
        tabBarRef={tabBarRef}
        onComplete={(tab) => {
          if (tab) setActiveTab(tab as Tab);
        }}
      />
    </div>
  );
}
