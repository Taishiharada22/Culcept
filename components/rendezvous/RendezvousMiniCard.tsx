"use client";

/**
 * RendezvousMiniCard
 * Compact horizontal card: avatar, name, category, SYNC%, one-line label.
 * Light-mode: 透明感のある淡い色
 */

import Link from "next/link";
import type { RendezvousCardDTO, RendezvousCategory } from "@/lib/rendezvous/types";
import { CONTEXT_COLORS } from "@/lib/rendezvous/questions/types";
import RendezvousSyncRing from "./RendezvousSyncRing";
import RendezvousStateBadge from "./RendezvousStateBadge";
import RendezvousContextBadge from "./RendezvousContextBadge";

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
};

export default function RendezvousMiniCard({ card }: Props) {
  const catColor = CATEGORY_COLOR[card.category] ?? "#6366F1";
  const bestCtx = card.contextLens?.bestContext;
  const bestCtxColor = bestCtx ? CONTEXT_COLORS[bestCtx] : catColor;

  return (
    <Link
      href={`/rendezvous/${card.candidateId}`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 12px",
        borderRadius: 12,
        background: `linear-gradient(145deg, rgba(255,245,242,0.99) 0%, rgba(255,255,255,0.995) 54%, ${bestCtxColor}24 100%)`,
        border: `1px solid ${bestCtxColor}36`,
        textDecoration: "none",
        color: "inherit",
        transition: "background 0.2s",
        boxShadow: `0 10px 22px ${bestCtxColor}16, 0 3px 10px rgba(36,30,68,0.08), inset 0 1px 0 rgba(255,255,255,0.8)`,
        backdropFilter: "blur(1px)",
      }}
    >
      {/* Avatar */}
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: "50%",
          background: card.counterpart.avatarUrl
            ? `url(${card.counterpart.avatarUrl}) center/cover`
            : `linear-gradient(135deg, ${bestCtxColor}34, ${bestCtxColor}14)`,
          border: `1.5px solid ${bestCtxColor}4c`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          fontSize: 12,
          fontWeight: 700,
          color: bestCtxColor,
        }}
      >
        {!card.counterpart.avatarUrl && getInitials(card.counterpart.displayName)}
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 2,
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 700, color: "#1E1E3C" }}>
            {card.counterpart.displayName}
          </span>
          <RendezvousStateBadge state={card.state} />
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: 10,
            color: "rgba(30,30,60,0.48)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          <span
            style={{
              color: catColor,
              fontWeight: 600,
            }}
          >
            {CATEGORY_LABEL[card.category]}
          </span>
          {bestCtx && (
            <RendezvousContextBadge context={bestCtx} size="sm" />
          )}
          <span>{card.label}</span>
        </div>
      </div>

      {/* Sync Ring */}
      <RendezvousSyncRing
        percent={card.syncPercent}
        size={32}
        strokeWidth={2.5}
        color={bestCtxColor}
      />
    </Link>
  );
}
