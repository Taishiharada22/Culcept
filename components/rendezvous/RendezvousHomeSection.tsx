"use client";

/**
 * RendezvousHomeSection
 * Embedded section for AneurasyncHome page.
 * Fetches from /api/rendezvous/feed on mount.
 *
 * NOTE: HomeSectionは親ページのテーマに合わせる必要がある。
 * AneurasyncHome自体はダークテーマの可能性があるため、
 * このセクションは親テーマに馴染む形で、かつRendezvousの
 * 透明感を維持する中間的なスタイルを採用。
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import type { RendezvousCardDTO, RendezvousFeedResponse } from "@/lib/rendezvous/types";
import RendezvousMainCard from "./RendezvousMainCard";
import RendezvousMiniCard from "./RendezvousMiniCard";
import RendezvousEmptyState from "./RendezvousEmptyState";
import { analyzeMatchEvolution, type MatchEvolutionResult } from "@/lib/rendezvous/livingMatchEvolution";
import { generateConversationHints, type ConversationHint } from "@/lib/rendezvous/conversationGuidance";

/* ---- AneurasyncHome color constants (duplicated for self-contained use) ---- */
export const C = {
  bg: "#060510",
  s1: "#ffffff",
  s2: "#f5f6fa",
  s3: "#ecedf4",
  s4: "#e0e2ee",
  sync: "#4AEAFF",
  neural: "#8B5CF6",
  pulse: "#FF6B9D",
  amber: "#FFB347",
  gold: "#FFD700",
  t1: "#1a1a2e",
  t2: "#4a4a68",
  t3: "#8888a0",
  t4: "#b0b0c4",
  // Rendezvous accent (紫×ピンク = ときめき)
  rv_primary: "#A855F7",
};

/* ---- Tag component matching AneurasyncHome ---- */
export function Tag({
  children,
  color,
  glow,
}: {
  children: React.ReactNode;
  color: string;
  glow?: boolean;
}) {
  return (
    <span
      style={{
        padding: "2px 7px",
        borderRadius: 4,
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: 0.4,
        color: "#fff",
        background: color,
        boxShadow: glow ? `0 0 10px ${color}44` : "none",
      }}
    >
      {children}
    </span>
  );
}

export default function RendezvousHomeSection() {
  const [items, setItems] = useState<RendezvousCardDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [matchEvolution, setMatchEvolution] = useState<MatchEvolutionResult | null>(null);
  const [conversationHints, setConversationHints] = useState<ConversationHint[]>([]);

  useEffect(() => {
    fetch("/api/rendezvous/feed", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: RendezvousFeedResponse | null) => {
        if (data?.items) {
          setItems(data.items);
          // Living Match Evolution + Conversation Guidance
          // RendezvousCardDTOの拡張フィールド（存在する場合のみ処理）
          const topItem = data.items[0] as RendezvousCardDTO & Record<string, unknown>;
          if (topItem?.matchingVector && topItem?.otherMatchingVector) {
            try {
              const mv = topItem.matchingVector as Record<string, number>;
              const omv = topItem.otherMatchingVector as Record<string, number>;
              const cat = ((topItem.category as string) ?? "friendship") as Parameters<typeof analyzeMatchEvolution>[4];
              const evolution = analyzeMatchEvolution(mv as any, omv as any, mv as any, omv as any, cat, (topItem.archetype as string) ?? "bridge");
              setMatchEvolution(evolution);
              const hints = generateConversationHints({
                selfVector: mv as any, otherVector: omv as any,
                messageCount: (topItem.messageCount as number) ?? 0,
                otherLastMessageHour: null, archetype: (topItem.archetype as string) ?? "bridge",
                growthEdgeAxis: null, otherWeather: null,
              });
              setConversationHints(hints);
            } catch {}
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const mainCard = items[0] ?? null;
  const miniCards = items.slice(1, 3);

  return (
    <section
      style={{
        padding: "18px 20px 8px",
        maxWidth: 780,
        margin: "0 auto",
        position: "relative",
      }}
    >
      {/* Ambient glow removed for clean design */}
      {/* Section Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 10,
          position: "relative",
          zIndex: 1,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div
            style={{
              width: 2.5,
              height: 14,
              borderRadius: 2,
              background: C.rv_primary,
            }}
          />
          <span style={{ fontSize: 13, fontWeight: 800, color: "#2D1B69" }}>Rendezvous</span>
          <span
            style={{
              fontSize: 10,
              color: "rgba(74,74,104,0.85)",
              fontWeight: 500,
              marginLeft: 4,
            }}
          >
            あなたの分身が見つけた交差
          </span>
        </div>
        <Link
          href="/rendezvous"
          style={{
            fontSize: 10,
            color: C.rv_primary,
            textDecoration: "none",
            opacity: 0.82,
          }}
        >
          すべて見る →
        </Link>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div
          style={{
            padding: "24px",
            borderRadius: 14,
            background: "#ffffff",
            border: "1px solid rgba(0,0,0,0.06)",
            boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            zIndex: 1,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: C.rv_primary,
                opacity: 0.5,
                animation: "ndot 1.5s ease-in-out infinite",
              }}
            />
            <span
              style={{
                fontSize: 11,
                color: C.t3,
                fontFamily: "'JetBrains Mono','SF Mono',monospace",
              }}
            >
              分身の軌道を確認中...
            </span>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && items.length === 0 && (
        <RendezvousEmptyState context="home" />
      )}

      {/* Content */}
      {!loading && items.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, position: "relative", zIndex: 1 }}>
          {/* Main card */}
          {mainCard && <RendezvousMainCard card={mainCard} />}

          {/* Mini cards */}
          {miniCards.map((card) => (
            <RendezvousMiniCard key={card.candidateId} card={card} />
          ))}

          {/* Summary footer */}
          {items.length > 3 && (
            <Link
              href="/rendezvous"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                padding: "8px 0",
                fontSize: 10,
                color: C.rv_primary,
                textDecoration: "none",
                fontWeight: 600,
                opacity: 0.82,
              }}
            >
              他 {items.length - 3}件の交差を見る →
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
