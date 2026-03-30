"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { FloatingNavLight } from "@/components/ui/glassmorphism-design";
import { MAIN_NAV } from "@/lib/navigation";
import GenomeCardLiving from "../_components/GenomeCardLiving";
import CompareRadar from "../_components/CompareRadar";
import type { GenomeCardData, VisibilityLevel } from "@/lib/genome/cardTypes";

const C = { bg: "linear-gradient(180deg, #f8f6f3 0%, #f6f3f0 30%, #f4f1ed 60%, #f6f3f0 100%)", s1: "#ffffff", s2: "#f5f6fa", t1: "#1a1a2e", t2: "#4a4a68", t3: "#8888a0", t4: "#c8c8dc", neural: "#8B5CF6", pulse: "#EC4899" };

export default function CardViewClient({ userId }: { userId: string }) {
  const [card, setCard] = useState<GenomeCardData | null>(null);
  const [myCard, setMyCard] = useState<GenomeCardData | null>(null);
  const [visibilityLevel, setVisibilityLevel] = useState<VisibilityLevel>(1);
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [targetRes, myRes] = await Promise.all([
          fetch(`/api/genome-card/${userId}`),
          fetch("/api/genome-card"),
        ]);
        const targetData = await targetRes.json();
        const myData = await myRes.json();

        if (!targetRes.ok) { setError(targetData.error || "カードを取得できません"); return; }
        setCard(targetData.card);
        setVisibilityLevel(targetData.visibilityLevel);
        setConnectionId(targetData.connectionId);

        if (myData.ok) setMyCard(myData.card);
      } catch { setError("ネットワークエラー"); } finally { setLoading(false); }
    })();
  }, [userId]);

  const canCompare = card?.cardBack?.radarAxes && myCard?.cardBack?.radarAxes;

  return (
    <div className="min-h-screen" style={{ background: C.bg }}>
      <main className="max-w-lg mx-auto px-4 pt-8 pb-32 space-y-6">
        <Link href="/genome-card" style={{ fontSize: 12, color: C.neural }}>← Genome Card</Link>

        {loading ? (
          <div className="rounded-2xl" style={{ background: C.s1, border: `1px solid ${C.s2}`, padding: 24, minHeight: 420 }}>
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-xl animate-pulse" style={{ background: C.s2 }} />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-24 rounded animate-pulse" style={{ background: C.s2 }} />
                </div>
              </div>
              <div className="h-64 rounded-xl animate-pulse" style={{ background: C.s2 }} />
            </div>
          </div>
        ) : error ? (
          <div className="rounded-2xl text-center py-12" style={{ background: C.s1, border: `1px solid ${C.s2}`, padding: 24 }}>
            <div style={{ fontSize: 36, color: C.t4, marginBottom: 16 }}>◇</div>
            <p style={{ fontSize: 13, color: C.t3 }}>{error}</p>
            <Link href="/genome-card" className="inline-block mt-4 px-6 py-2.5 rounded-xl text-sm font-medium"
              style={{ background: C.s2, color: C.t2 }}>戻る</Link>
          </div>
        ) : card ? (
          <>
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
              <GenomeCardLiving card={card} />
            </motion.div>

            {/* 比較レーダー (Phase5-3) */}
            {canCompare && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                className="rounded-2xl" style={{ background: C.s1, border: `1px solid ${C.s2}`, padding: "20px 16px" }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: C.t1, textAlign: "center", marginBottom: 12 }}>
                  ふたりの比較
                </p>
                <CompareRadar
                  mine={myCard!.cardBack!.radarAxes!}
                  theirs={card.cardBack!.radarAxes!}
                  myName={myCard?.displayName ?? "あなた"}
                  theirName={card.displayName ?? "相手"}
                />
              </motion.div>
            )}

            {/* 公開レベル */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
              className="rounded-2xl text-center" style={{ background: C.s1, border: `1px solid ${C.s2}`, padding: "12px 16px" }}>
              <p style={{ fontSize: 11, color: C.t3 }}>
                公開レベル: <strong style={{ color: C.neural }}>Lv.{visibilityLevel}</strong>
                {visibilityLevel < 3 && " — 相手が公開レベルを上げるとより深い情報が見られます"}
              </p>
            </motion.div>

            {/* アクション */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="flex gap-2">
              {connectionId && (
                <Link href={`/talk/${connectionId}`} className="flex-1 py-3 rounded-xl text-sm font-medium text-center"
                  style={{ background: `linear-gradient(135deg, ${C.neural}, ${C.pulse})`, color: "white" }}>トークする</Link>
              )}
              <Link href="/genome-card" className="flex-1 py-3 rounded-xl text-sm font-medium text-center"
                style={{ background: C.s2, color: C.t2 }}>カード一覧</Link>
            </motion.div>
          </>
        ) : null}
      </main>
      <FloatingNavLight items={MAIN_NAV} activeHref="/genome-card" />
    </div>
  );
}
