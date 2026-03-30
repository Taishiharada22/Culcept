"use client";

/**
 * RendezvousProfileCard
 * 新デザイン: 写真が支配的（60%）、オーバーレイで名前+カテゴリ
 *
 * 写真がない場合はアバターのグラデーション背景にフォールバック。
 * 写真システム(Phase 4-B)が完成したら自動対応。
 */

import Link from "next/link";
import type { RendezvousCardDTO, RendezvousCategory } from "@/lib/rendezvous/types";
import RendezvousSyncRing from "./RendezvousSyncRing";

const CATEGORY_LABEL: Record<RendezvousCategory, string> = {
  romantic: "恋愛",
  friendship: "友人",
  cocreation: "共創",
  community: "コミュニティ",
  partner: "パートナー",
};

const CATEGORY_COLOR: Record<RendezvousCategory, string> = {
  romantic: "#EC4899",
  friendship: "#6366F1",
  cocreation: "#F59E0B",
  community: "#8B5CF6",
  partner: "#D4776B",
};

function getInitials(name: string): string {
  return name.slice(0, 2);
}

type Props = {
  card: RendezvousCardDTO;
  /** コンパクトモード（リスト表示用） */
  compact?: boolean;
};

export default function RendezvousProfileCard({ card, compact = false }: Props) {
  const catColor = CATEGORY_COLOR[card.category] ?? "#6366F1";
  const bestCtxColor = card.contextLens?.bestContext
    ? { friend: "#6366F1", romance: "#EC4899", orbiter: "#8B5CF6", cocreation: "#F59E0B" }[card.contextLens.bestContext] ?? catColor
    : catColor;

  const hasPhoto = !!card.counterpart.avatarUrl;
  const photoHeight = compact ? 160 : 240;

  return (
    <Link
      href={`/rendezvous/${card.candidateId}`}
      style={{ display: "block", textDecoration: "none", color: "inherit" }}
    >
      <div
        style={{
          borderRadius: 20,
          overflow: "hidden",
          background: "rgba(255,255,255,0.9)",
          backdropFilter: "blur(8px)",
          border: "1px solid rgba(99,102,241,0.06)",
          boxShadow: "0 2px 12px rgba(99,102,241,0.06)",
          transition: "box-shadow 0.3s",
        }}
      >
        {/* Photo / Avatar area (60% of card) */}
        <div
          style={{
            position: "relative",
            height: photoHeight,
            background: hasPhoto
              ? `url(${card.counterpart.avatarUrl}) center/cover`
              : `linear-gradient(135deg, ${bestCtxColor}18 0%, ${bestCtxColor}06 50%, rgba(255,255,255,0.9) 100%)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* Avatar fallback (when no photo) */}
          {!hasPhoto && (
            <div
              style={{
                width: compact ? 56 : 72,
                height: compact ? 56 : 72,
                borderRadius: "50%",
                background: `linear-gradient(135deg, ${bestCtxColor}30, ${bestCtxColor}10)`,
                border: `2px solid ${bestCtxColor}25`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: compact ? 22 : 28,
                fontWeight: 800,
                color: bestCtxColor,
              }}
            >
              {getInitials(card.counterpart.displayName)}
            </div>
          )}

          {/* Sync Ring (top-right) */}
          <div style={{ position: "absolute", top: 10, right: 10 }}>
            <RendezvousSyncRing
              percent={card.syncPercent}
              size={compact ? 36 : 44}
              strokeWidth={compact ? 2.5 : 3}
              color={bestCtxColor}
            />
          </div>

          {/* Bottom gradient overlay for text */}
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: 60,
              background: "linear-gradient(transparent, rgba(255,255,255,0.95))",
            }}
          />

          {/* Name + Category (overlaid at bottom) */}
          <div
            style={{
              position: "absolute",
              bottom: 10,
              left: 14,
              right: 14,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span style={{ fontSize: compact ? 15 : 18, fontWeight: 800, color: "#1E1E3C" }}>
              {card.counterpart.displayName}
            </span>
            <span
              style={{
                padding: "2px 7px",
                borderRadius: 5,
                fontSize: 9,
                fontWeight: 700,
                color: catColor,
                background: `${catColor}12`,
              }}
            >
              {CATEGORY_LABEL[card.category]}
            </span>
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: compact ? "8px 14px 12px" : "10px 16px 16px" }}>
          {/* Reason chips (2-3) */}
          {card.reasons.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 6 }}>
              {card.reasons.slice(0, compact ? 2 : 3).map((reason, i) => (
                <span
                  key={i}
                  style={{
                    padding: "3px 8px",
                    borderRadius: 14,
                    fontSize: 10,
                    fontWeight: 600,
                    color: bestCtxColor,
                    background: `${bestCtxColor}06`,
                    border: `1px solid ${bestCtxColor}12`,
                  }}
                >
                  {reason}
                </span>
              ))}
            </div>
          )}

          {/* Public summary (1 line) */}
          {card.counterpart.publicMoodSummary && (
            <p
              style={{
                fontSize: 11,
                color: "rgba(30,30,60,0.45)",
                lineHeight: 1.5,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                margin: 0,
              }}
            >
              {card.counterpart.publicMoodSummary}
            </p>
          )}

          {/* Label (fallback if no summary) */}
          {!card.counterpart.publicMoodSummary && card.label && (
            <p
              style={{
                fontSize: 11,
                color: "rgba(30,30,60,0.4)",
                lineHeight: 1.5,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                margin: 0,
              }}
            >
              {card.label}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}
