"use client";

/**
 * GenomeCardPreview
 * Rendezvous詳細画面で相手のGenome Cardプレビューを表示
 * - アーキタイプ、PCシーズン、トップ特性、印象タイプ
 * - カード交換ボタン / フルカードリンク
 */

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { FadeInView } from "@/components/ui/glassmorphism-design";

type GenomePreview = {
  archetypeLabel: string | null;
  pcSeason: string | null;
  topTraits: Array<{ id: string; label: string; score: number }> | null;
  summaryLine: string | null;
  completeness: number;
  displayName: string | null;
  avatarUrl: string | null;
};

type ExchangeStatus = {
  exchanged: boolean;
  exchangedAt?: string;
};

type Props = {
  /** 相手のユーザーID */
  userId: string;
  /** コンパクト表示モード */
  compact?: boolean;
};

const PC_SEASON_LABELS: Record<string, string> = {
  spring: "スプリング",
  summer: "サマー",
  autumn: "オータム",
  winter: "ウィンター",
};

const PC_SEASON_COLORS: Record<string, string> = {
  spring: "#F59E0B",
  summer: "#6366F1",
  autumn: "#D97706",
  winter: "#3B82F6",
};

export default function GenomeCardPreview({ userId, compact = false }: Props) {
  const [card, setCard] = useState<GenomePreview | null>(null);
  const [exchange, setExchange] = useState<ExchangeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [exchanging, setExchanging] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Fetch genome card preview data
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        // Fetch card preview (public-level data via share endpoint)
        const cardRes = await fetch(`/api/genome-card/preview?userId=${userId}`, {
          credentials: "include",
        });
        if (cardRes.ok) {
          const cardData = await cardRes.json();
          if (!cancelled && cardData.card) {
            setCard(cardData.card);
          }
        }

        // Check exchange status
        const exchangeRes = await fetch(
          `/api/genome-card/exchange?targetUserId=${userId}`,
          { credentials: "include" },
        );
        if (exchangeRes.ok) {
          const exchangeData = await exchangeRes.json();
          if (!cancelled) {
            setExchange(exchangeData);
          }
        }
      } catch {
        // Silently fail — optional enhancement
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const handleExchange = useCallback(async () => {
    setExchanging(true);
    try {
      const res = await fetch("/api/genome-card/exchange", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: userId }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.ok) {
          setExchange({ exchanged: true, exchangedAt: new Date().toISOString() });
        }
      }
    } catch {
      // Silently fail
    } finally {
      setExchanging(false);
    }
  }, [userId]);

  if (loading) {
    return (
      <div
        style={{
          padding: compact ? "12px" : "16px",
          borderRadius: 14,
          background: "rgba(255,255,255,0.6)",
          border: "1px solid rgba(99,102,241,0.06)",
          marginBottom: 12,
        }}
      >
        <div
          style={{
            height: 20,
            width: 120,
            borderRadius: 6,
            background: "rgba(99,102,241,0.06)",
            animation: "pulse 1.5s ease-in-out infinite",
          }}
        />
      </div>
    );
  }

  if (!card) return null;

  return (
    <FadeInView delay={0.1}>
      <div
        style={{
          padding: compact ? "14px" : "18px",
          borderRadius: 16,
          background: "rgba(255,255,255,0.8)",
          border: "1px solid rgba(139,92,246,0.08)",
          marginBottom: 12,
          backdropFilter: "blur(8px)",
        }}
      >
        {/* Header — collapsible */}
        <button
          onClick={() => setCollapsed((v) => !v)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginBottom: collapsed ? 0 : 14,
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
            width: "100%",
          }}
        >
          <div
            style={{
              width: 2.5,
              height: 12,
              borderRadius: 2,
              background: "#8B5CF6",
            }}
          />
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "rgba(30,30,60,0.7)",
              letterSpacing: 0.5,
            }}
          >
            Genome Card
          </span>
          <span
            style={{
              fontSize: 9,
              color: "rgba(30,30,60,0.25)",
              fontFamily: "'JetBrains Mono','SF Mono',monospace",
              marginLeft: "auto",
              letterSpacing: 1,
            }}
          >
            {collapsed ? "+" : "-"}
          </span>
        </button>

        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              style={{ overflow: "hidden" }}
            >
              {/* Constellation type */}
              {card.archetypeLabel && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 10,
                  }}
                >
                  <span
                    style={{
                      fontSize: 18,
                      lineHeight: 1,
                    }}
                  >
                    &#x2726;
                  </span>
                  <div>
                    <div
                      style={{
                        fontSize: 9,
                        fontWeight: 600,
                        color: "rgba(30,30,60,0.35)",
                        letterSpacing: 1,
                        textTransform: "uppercase",
                      }}
                    >
                      CONSTELLATION
                    </div>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: "#1E1E3C",
                        marginTop: 1,
                      }}
                    >
                      {card.archetypeLabel}
                    </div>
                  </div>
                </div>
              )}

              {/* PC Season + Traits row */}
              <div
                style={{
                  display: "flex",
                  gap: 6,
                  flexWrap: "wrap",
                  marginBottom: 10,
                }}
              >
                {card.pcSeason && (
                  <span
                    style={{
                      padding: "3px 8px",
                      borderRadius: 6,
                      fontSize: 10,
                      fontWeight: 700,
                      color: PC_SEASON_COLORS[card.pcSeason] ?? "#6366F1",
                      background: `${PC_SEASON_COLORS[card.pcSeason] ?? "#6366F1"}10`,
                      border: `1px solid ${PC_SEASON_COLORS[card.pcSeason] ?? "#6366F1"}15`,
                    }}
                  >
                    {PC_SEASON_LABELS[card.pcSeason] ?? card.pcSeason}
                  </span>
                )}
                {card.topTraits?.slice(0, 3).map((trait) => (
                  <span
                    key={trait.id}
                    style={{
                      padding: "3px 8px",
                      borderRadius: 6,
                      fontSize: 10,
                      fontWeight: 600,
                      color: "rgba(30,30,60,0.55)",
                      background: "rgba(99,102,241,0.05)",
                      border: "1px solid rgba(99,102,241,0.08)",
                    }}
                  >
                    {trait.label}
                  </span>
                ))}
              </div>

              {/* Summary line */}
              {card.summaryLine && (
                <p
                  style={{
                    fontSize: 12,
                    lineHeight: 1.7,
                    color: "rgba(30,30,60,0.55)",
                    margin: "0 0 12px 0",
                  }}
                >
                  {card.summaryLine}
                </p>
              )}

              {/* Completeness bar */}
              <div style={{ marginBottom: 14 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: 4,
                  }}
                >
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 600,
                      color: "rgba(30,30,60,0.35)",
                      letterSpacing: 0.5,
                    }}
                  >
                    カード完成度
                  </span>
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      color: "#8B5CF6",
                      fontFamily: "'JetBrains Mono','SF Mono',monospace",
                    }}
                  >
                    {card.completeness}%
                  </span>
                </div>
                <div
                  style={{
                    height: 3,
                    borderRadius: 2,
                    background: "rgba(99,102,241,0.06)",
                    overflow: "hidden",
                  }}
                >
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${card.completeness}%` }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                    style={{
                      height: "100%",
                      borderRadius: 2,
                      background: "linear-gradient(90deg, #8B5CF6, #6366F1)",
                    }}
                  />
                </div>
              </div>

              {/* Action buttons */}
              <div style={{ display: "flex", gap: 8 }}>
                {exchange?.exchanged ? (
                  <Link
                    href={`/genome-card/${userId}`}
                    style={{
                      flex: 1,
                      display: "block",
                      padding: "10px 0",
                      borderRadius: 10,
                      textAlign: "center",
                      textDecoration: "none",
                      fontSize: 12,
                      fontWeight: 700,
                      color: "#fff",
                      background: "linear-gradient(135deg, #8B5CF6, #6366F1)",
                      boxShadow: "0 2px 8px rgba(139,92,246,0.15)",
                    }}
                  >
                    フルカードを見る
                  </Link>
                ) : (
                  <button
                    onClick={handleExchange}
                    disabled={exchanging}
                    style={{
                      flex: 1,
                      padding: "10px 0",
                      borderRadius: 10,
                      border: "1px solid rgba(139,92,246,0.15)",
                      cursor: exchanging ? "not-allowed" : "pointer",
                      fontSize: 12,
                      fontWeight: 700,
                      color: "#8B5CF6",
                      background: "rgba(139,92,246,0.04)",
                      opacity: exchanging ? 0.5 : 1,
                      transition: "opacity 0.2s",
                    }}
                  >
                    {exchanging ? "交換中..." : "カードを交換する"}
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </FadeInView>
  );
}
