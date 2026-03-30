"use client";

/**
 * RendezvousMainCard
 * 交差報告カード (Crossing Report Card)
 *
 * 単なるプロフィールカードではなく、
 * 「分身が先に見つけてきた接続の報告」として見せる。
 *
 * 光のある宇宙 / 透明感 / 静かな接続観測所
 */

import Link from "next/link";
import type {
  RendezvousCardDTO,
  RendezvousCategory,
} from "@/lib/rendezvous/types";
import { CONTEXT_COLORS } from "@/lib/rendezvous/questions/types";
import { AVATAR_JUDGMENT_LABELS, AVATAR_JUDGMENT_COLORS } from "@/lib/rendezvous/questions/constants";
import RendezvousSyncRing from "./RendezvousSyncRing";
import RendezvousStateBadge from "./RendezvousStateBadge";
import RendezvousContextBadge from "./RendezvousContextBadge";
import AvatarEmotionIndicator from "./AvatarEmotionIndicator";
import type { AvatarEmotion } from "@/lib/rendezvous/avatarVitality";

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

const CTA_TEXT: Record<string, string> = {
  unseen: "軌道を見る",
  seen: "応答する",
  liked: "応答待ち",
  mutual_liked: "会話へ",
  chat_opened: "会話へ",
  saved: "続きを見る",
  passed: "再確認",
  expired: "期限切れ",
  muted: "ミュート中",
};

function getInitials(name: string): string {
  return name.slice(0, 2);
}

type Props = {
  card: RendezvousCardDTO;
};

export default function RendezvousMainCard({ card }: Props) {
  const catColor = CATEGORY_COLOR[card.category] ?? "#6366F1";
  const ctaLabel = CTA_TEXT[card.state] ?? "軌道を見る";
  const isDisabled = card.state === "expired" || card.state === "muted";
  const hasLens = !!card.contextLens;
  const bestCtx = card.contextLens?.bestContext;
  const bestCtxColor = bestCtx ? CONTEXT_COLORS[bestCtx] : catColor;
  const judgment = card.contextLens?.avatarJudgment;

  return (
    <Link
      href={`/rendezvous/${card.candidateId}`}
      style={{
        display: "block",
        padding: "18px",
        borderRadius: 16,
        background: `linear-gradient(145deg, rgba(255,245,242,0.995) 0%, rgba(255,255,255,1) 48%, ${bestCtxColor}2C 100%)`,
        border: `1px solid ${bestCtxColor}48`,
        textDecoration: "none",
        color: "inherit",
        transition: "border-color 0.3s, box-shadow 0.3s",
        boxShadow: `0 12px 28px ${bestCtxColor}22, 0 4px 12px rgba(36,30,68,0.1), inset 0 1px 0 rgba(255,255,255,0.86)`,
        backdropFilter: "blur(3px)",
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 14,
        }}
      >
        {/* Avatar */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <div
            style={{
              width: 50,
              height: 50,
              borderRadius: "50%",
                background: card.counterpart.avatarUrl
                  ? `url(${card.counterpart.avatarUrl}) center/cover`
                  : `linear-gradient(135deg, ${bestCtxColor}38, ${bestCtxColor}18)`,
                border: `2px solid ${bestCtxColor}52`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 17,
              fontWeight: 700,
              color: bestCtxColor,
            }}
          >
            {!card.counterpart.avatarUrl &&
              getInitials(card.counterpart.displayName)}
          </div>
          {/* 分身の感情状態インジケーター */}
          {(card as any).avatarEmotion && (
            <div style={{ position: "absolute", bottom: -6, right: -6 }}>
              <AvatarEmotionIndicator
                emotion={(card as any).avatarEmotion as AvatarEmotion}
                pulse={(card as any).avatarPulse ?? 0.5}
              />
            </div>
          )}
        </div>

        {/* Name + badges */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginBottom: 4,
            }}
          >
            <span
              style={{ fontSize: 15, fontWeight: 800, color: "#1E1E3C" }}
            >
              {card.counterpart.displayName}
            </span>
            <RendezvousStateBadge state={card.state} />
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                padding: "1px 6px",
                borderRadius: 4,
                fontSize: 9,
                fontWeight: 700,
                color: catColor,
                background: `${catColor}24`,
                letterSpacing: 0.3,
              }}
            >
              {CATEGORY_LABEL[card.category]}
            </span>
            {hasLens && bestCtx && (
              <RendezvousContextBadge context={bestCtx} />
            )}
            {judgment && (
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  color: AVATAR_JUDGMENT_COLORS[judgment],
                  padding: "1px 5px",
                  borderRadius: 3,
                  background: `${AVATAR_JUDGMENT_COLORS[judgment]}28`,
                }}
              >
                {AVATAR_JUDGMENT_LABELS[judgment]}
              </span>
            )}
            <span style={{ fontSize: 10, color: "rgba(30,30,60,0.48)" }}>
              {card.label}
            </span>
          </div>
        </div>

        {/* Sync Ring (with Living Score trajectory) */}
        <RendezvousSyncRing
          percent={card.syncPercent}
          size={46}
          strokeWidth={3}
          color={bestCtxColor}
          trajectory={card.trajectory ? {
            direction: card.trajectory.direction,
            livingScore: card.trajectory.livingScore,
          } : undefined}
        />
      </div>

      {/* 文脈スコアバー (追加レンズがある場合) */}
      {hasLens && card.contextLens && (
        <div
          style={{
            display: "flex",
            gap: 8,
            marginBottom: 12,
            padding: "8px 10px",
            borderRadius: 10,
            background: "rgba(99,102,241,0.12)",
          }}
        >
          {(["friend", "romance", "orbiter", "cocreation"] as const).map((ctx) => {
            const score = card.contextLens?.contextScores[ctx] ?? 0;
            const color = CONTEXT_COLORS[ctx];
            const isBest = ctx === bestCtx;
            return (
              <div
                key={ctx}
                style={{
                  flex: 1,
                  textAlign: "center",
                  opacity: isBest ? 1 : 0.6,
                }}
              >
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 800,
                    color: isBest ? color : "rgba(30,30,60,0.4)",
                    fontFamily: "'JetBrains Mono','SF Mono',monospace",
                  }}
                >
                  {score}
                </div>
                <div
                  style={{
                    fontSize: 9,
                    fontWeight: 600,
                    color: isBest ? color : "rgba(30,30,60,0.3)",
                    marginTop: 1,
                  }}
                >
                  {ctx === "friend"
                    ? "友達"
                    : ctx === "romance"
                      ? "恋愛"
                      : ctx === "orbiter"
                        ? "Orbiter"
                        : "共創"}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* アバター判断テキスト */}
      {card.contextLens?.avatarJudgmentText && (
        <p
          style={{
            fontSize: 12,
            color: "rgba(30,30,60,0.68)",
            lineHeight: 1.6,
            marginBottom: 10,
            padding: "6px 8px",
            borderRadius: 8,
            background: "rgba(99,102,241,0.12)",
            borderLeft: `2px solid ${bestCtxColor}5e`,
          }}
        >
          {card.contextLens.avatarJudgmentText}
        </p>
      )}

      {/* Alignment Points / Reasons */}
      {(card.contextLens?.alignmentPoints ?? card.reasons).length > 0 && (
        <div style={{ marginBottom: 8 }}>
          {(card.contextLens?.alignmentPoints ?? card.reasons)
            .slice(0, 2)
            .map((point, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 6,
                  padding: "3px 0",
                }}
              >
                <span
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: "50%",
                    background: bestCtxColor,
                    flexShrink: 0,
                    marginTop: 5,
                    opacity: 0.6,
                  }}
                />
                <span
                  style={{
                    fontSize: 11,
                    color: "rgba(30,30,60,0.68)",
                    lineHeight: 1.5,
                  }}
                >
                  {point}
                </span>
              </div>
            ))}
        </div>
      )}

      {/* Caution */}
      {(card.contextLens?.cautionPoints?.[0] ?? card.caution) && (
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 6,
            padding: "4px 8px",
            borderRadius: 6,
            background: "rgba(251,191,36,0.1)",
            border: "1px solid rgba(251,191,36,0.16)",
            marginBottom: 10,
          }}
        >
          <span
            style={{
              fontSize: 10,
              color: "#D97706",
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            !
          </span>
          <span
              style={{
                fontSize: 10,
                color: "rgba(30,30,60,0.58)",
                lineHeight: 1.5,
              }}
            >
            {card.contextLens?.cautionPoints?.[0] ?? card.caution}
          </span>
        </div>
      )}

      {/* CTA */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
        <span
          style={{
            padding: "7px 18px",
            borderRadius: 8,
            fontSize: 11,
            fontWeight: 700,
            color: isDisabled ? "rgba(30,30,60,0.25)" : "#fff",
            background: isDisabled
              ? "rgba(30,30,60,0.05)"
              : `linear-gradient(135deg, ${bestCtxColor}, ${bestCtxColor}CC)`,
            boxShadow: isDisabled
              ? "none"
              : `0 2px 8px ${bestCtxColor}25`,
            letterSpacing: 0.3,
          }}
        >
          {ctaLabel}
        </span>
      </div>
    </Link>
  );
}
