"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { getCardTheme } from "@/lib/genome/archetypeThemes";

const C = {
  s1: "#ffffff", s2: "#f5f6fa",
  t1: "#1a1a2e", t2: "#4a4a68", t3: "#8888a0", t4: "#c8c8dc",
  neural: "#8B5CF6", pulse: "#EC4899",
};

/* ── 季節カラー ── */
const SEASON_GRADIENTS: Record<string, { bg: string[]; accent: string }> = {
  spring: { bg: ["#FDF6E3", "#FDEBD0", "#FFF5E1", "#FFF8E7"], accent: "#D4A017" },
  summer: { bg: ["#F0EEF6", "#E8E3F0", "#DDD8EC", "#F5F2FA"], accent: "#8B7CB8" },
  autumn: { bg: ["#FBF0E4", "#F5E0C4", "#EDD5B3", "#FFF2E3"], accent: "#C67B30" },
  winter: { bg: ["#E8EFF8", "#DCE8F5", "#D0E0F0", "#EBF2FA"], accent: "#4B7BB5" },
};

function normalizeSeason(season: string | null | undefined): string {
  if (!season) return "spring";
  const s = season.toLowerCase();
  if (s.includes("spring") || s.includes("スプリング") || s.includes("春")) return "spring";
  if (s.includes("summer") || s.includes("サマー") || s.includes("夏")) return "summer";
  if (s.includes("autumn") || s.includes("fall") || s.includes("オータム") || s.includes("秋")) return "autumn";
  if (s.includes("winter") || s.includes("ウィンター") || s.includes("冬")) return "winter";
  return "spring";
}

interface PublicCard {
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
  archetypeLabel: string | null;
  archetypeCode: string | null;
  pcSeason: string | null;
  topTraits: Array<{ id: string; label: string; score: number }>;
  topStyleLanes: string[];
  completeness: number;
  summaryLine: string | null;
}

export default function SharePageClient({ shareId }: { shareId: string }) {
  const [card, setCard] = useState<PublicCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/genome-card/share", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shareId }),
        });
        const data = await res.json();
        if (data.ok && data.card) {
          setCard(data.card);
        } else {
          setError("カードが見つかりませんでした");
        }
      } catch {
        setError("読み込みに失敗しました");
      } finally {
        setLoading(false);
      }
    })();
  }, [shareId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: C.s1 }}>
        <motion.div
          className="w-10 h-10 rounded-full"
          style={{ border: `3px solid ${C.neural}30`, borderTopColor: C.neural }}
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        />
      </div>
    );
  }

  if (error || !card) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: C.s1 }}>
        <p style={{ fontSize: 16, color: C.t2 }}>{error ?? "カードが見つかりませんでした"}</p>
        <Link
          href="/"
          className="px-6 py-3 rounded-xl text-sm font-medium"
          style={{ background: `linear-gradient(135deg, ${C.neural}, ${C.pulse})`, color: "white" }}
        >
          Aneurasyncを始める
        </Link>
      </div>
    );
  }

  const theme = getCardTheme(card.archetypeLabel);
  const season = normalizeSeason(card.pcSeason);
  const palette = SEASON_GRADIENTS[season] ?? SEASON_GRADIENTS.spring;

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-8"
      style={{
        background: `linear-gradient(135deg, ${palette.bg[0]}, ${palette.bg[1]}, ${palette.bg[2]}, ${palette.bg[3]})`,
      }}
    >
      {/* ブランドロゴ */}
      <motion.p
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        style={{ fontSize: 12, color: `${palette.accent}60`, fontFamily: "monospace", marginBottom: 24 }}
      >
        Aneurasync
      </motion.p>

      {/* メインカード */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="w-full max-w-sm rounded-3xl overflow-hidden"
        style={{
          background: C.s1,
          border: `1px solid ${palette.accent}20`,
          boxShadow: `0 20px 60px ${palette.accent}15, 0 8px 24px rgba(0,0,0,0.06)`,
        }}
      >
        <div className="p-8 space-y-6">
          {/* アバター + 名前 */}
          <div className="text-center space-y-3">
            {card.avatarUrl ? (
              <img
                src={card.avatarUrl}
                alt=""
                className="w-20 h-20 rounded-2xl object-cover mx-auto"
                style={{ border: `2px solid ${palette.accent}20` }}
              />
            ) : (
              <div
                className="w-20 h-20 rounded-2xl mx-auto flex items-center justify-center"
                style={{
                  background: `linear-gradient(135deg, ${palette.accent}15, ${palette.accent}08)`,
                  fontSize: 32,
                }}
              >
                {theme.symbol}
              </div>
            )}
            {card.displayName && (
              <p style={{ fontSize: 18, fontWeight: 600, color: C.t1 }}>{card.displayName}</p>
            )}
          </div>

          {/* コンステレーション */}
          {card.archetypeLabel && (
            <div className="text-center space-y-1">
              <p style={{
                fontSize: 22, fontWeight: 700,
                background: `linear-gradient(135deg, ${theme.accentHex}, ${palette.accent})`,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}>
                {theme.symbol} {card.archetypeLabel}
              </p>
              <p style={{ fontSize: 12, color: C.t3, fontFamily: "monospace" }}>{theme.english}</p>
            </div>
          )}

          {/* パーソナルカラー */}
          {card.pcSeason && (
            <div className="flex justify-center">
              <span style={{
                fontSize: 12, padding: "4px 14px", borderRadius: 16,
                background: `${palette.accent}12`, color: palette.accent,
                border: `1px solid ${palette.accent}25`, fontWeight: 500,
              }}>
                {card.pcSeason}
              </span>
            </div>
          )}

          {/* 性格特性 */}
          {card.topTraits.length > 0 && (
            <div className="space-y-3">
              <p style={{ fontSize: 10, color: C.t4, letterSpacing: "0.1em", textAlign: "center" }}>
                PERSONALITY TRAITS
              </p>
              {card.topTraits.map((trait) => (
                <div key={trait.id} className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span style={{ fontSize: 13, fontWeight: 500, color: C.t1 }}>{trait.label}</span>
                    <span style={{ fontSize: 11, color: C.t3, fontFamily: "monospace" }}>{trait.score}</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: `${C.t4}25`, overflow: "hidden" }}>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${trait.score}%` }}
                      transition={{ duration: 0.8, delay: 0.3, ease: "easeOut" }}
                      style={{ height: "100%", borderRadius: 3, background: palette.accent, opacity: 0.7 }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* スタイルレーン */}
          {card.topStyleLanes.length > 0 && (
            <div className="text-center space-y-2">
              <p style={{ fontSize: 10, color: C.t4, letterSpacing: "0.1em" }}>STYLE DNA</p>
              <div className="flex justify-center gap-2 flex-wrap">
                {card.topStyleLanes.map((lane) => (
                  <span key={lane} style={{
                    fontSize: 11, padding: "3px 10px", borderRadius: 12,
                    background: C.s2, color: C.t2,
                  }}>{lane}</span>
                ))}
              </div>
            </div>
          )}

          {/* 完成度 */}
          <div className="text-center">
            <p style={{ fontSize: 10, color: C.t4 }}>
              観測完了度 {card.completeness}%
            </p>
          </div>
        </div>
      </motion.div>

      {/* CTA */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="mt-8 text-center space-y-4"
      >
        <p style={{ fontSize: 14, color: C.t2 }}>
          あなたの深層も見てみませんか？
        </p>
        <Link
          href="/"
          className="inline-block px-8 py-3.5 rounded-xl text-sm font-medium transition-all hover:scale-105"
          style={{
            background: `linear-gradient(135deg, ${C.neural}, ${C.pulse})`,
            color: "white",
            boxShadow: `0 4px 20px ${C.neural}40`,
          }}
        >
          自分のカードを作る
        </Link>
        <p style={{ fontSize: 10, color: C.t4, marginTop: 8 }}>
          Aneurasync -- あなたの第二の自己
        </p>
      </motion.div>
    </div>
  );
}
