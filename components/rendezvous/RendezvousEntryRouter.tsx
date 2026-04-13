"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { RV_COLORS } from "@/components/ui/rendezvous-design";
import {
  getLastTab,
  saveLastTab,
  TAB_PATH,
  type RendezvousTab,
} from "@/lib/rendezvous/useLastTab";
import {
  trackHubView,
  trackLaneClick,
  type RendezvousLane,
} from "@/lib/rendezvous/trackRendezvous";

// =============================================================================
// Lane definitions for first-time selection
// =============================================================================

type LaneOption = {
  id: RendezvousTab;
  emoji: string;
  title: string;
  description: string;
  color: string;
  colorGlow: string;
};

const LANES: LaneOption[] = [
  {
    id: "connection",
    emoji: "\u{1F91D}",
    title: "つながり",
    description: "アバターが先に出会い、相性を確かめる",
    color: "#7B61FF",
    colorGlow: "rgba(123,97,255,0.15)",
  },
  {
    id: "romance",
    emoji: "\u2764\uFE0F",
    title: "恋愛",
    description: "写真とプロフィールで直感的に出会う",
    color: "#E91E63",
    colorGlow: "rgba(233,30,99,0.15)",
  },
  {
    id: "partner",
    emoji: "\u267E\uFE0F",
    title: "パートナー",
    description: "AIカウンセラーが導く、本気の出会い",
    color: "#D4776B",
    colorGlow: "rgba(212,119,107,0.15)",
  },
];

// =============================================================================
// RendezvousEntryRouter
// =============================================================================

type Props = {
  verificationStatus?:
    | "unverified"
    | "pending"
    | "verified"
    | "rejected"
    | "expired"
    | null;
  isFrozen?: boolean;
};

export default function RendezvousEntryRouter({}: Props) {
  const router = useRouter();
  const [showSelection, setShowSelection] = useState(false);

  // On mount: check localStorage and redirect if last tab exists
  useEffect(() => {
    const lastTab = getLastTab();
    if (lastTab) {
      router.replace(TAB_PATH[lastTab]);
    } else {
      setShowSelection(true);
      trackHubView();
    }
  }, [router]);

  // While checking localStorage, show nothing (avoids flash)
  if (!showSelection) {
    return (
      <div
        className="min-h-screen"
        style={{ background: RV_COLORS.base }}
      />
    );
  }

  // ----- First-time selection screen -----

  function handleSelect(tab: RendezvousTab) {
    saveLastTab(tab);
    trackLaneClick(tab as RendezvousLane);
    router.replace(TAB_PATH[tab]);
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 pb-24"
      style={{
        background: `linear-gradient(180deg, rgba(194,24,91,0.03) 0%, ${RV_COLORS.base} 35%, rgba(255,109,0,0.02) 100%)`,
      }}
    >
      {/* Title */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
        className="text-center mb-10"
      >
        <h1
          style={{
            fontFamily: '"Noto Serif JP", serif',
            color: RV_COLORS.text,
            fontSize: 24,
            fontWeight: 700,
            letterSpacing: "0.08em",
            lineHeight: 1.3,
          }}
        >
          Rendezvousへようこそ
        </h1>
        <p
          className="mt-3"
          style={{
            color: RV_COLORS.textSub,
            fontSize: 14,
            letterSpacing: "0.04em",
            lineHeight: 1.7,
          }}
        >
          あなたに合った出会い方を選んでください
        </p>
      </motion.div>

      {/* Lane cards */}
      <div className="w-full max-w-md flex flex-col gap-4">
        {LANES.map((lane, i) => (
          <motion.button
            key={lane.id}
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              delay: 0.25 + i * 0.12,
              type: "spring",
              stiffness: 260,
              damping: 28,
            }}
            whileTap={{ scale: 0.97 }}
            whileHover={{
              y: -2,
              boxShadow: `0 8px 32px ${RV_COLORS.shadowDeep}`,
            }}
            onClick={() => handleSelect(lane.id)}
            className="w-full text-left rounded-2xl overflow-hidden cursor-pointer"
            style={{
              background: RV_COLORS.surface,
              border: `1px solid ${RV_COLORS.border}`,
              boxShadow: `0 2px 16px ${RV_COLORS.shadow}`,
              padding: 0,
            }}
          >
            {/* Accent left border via inner layout */}
            <div className="flex">
              {/* Left accent bar */}
              <div
                className="flex-shrink-0"
                style={{
                  width: 4,
                  background: `linear-gradient(180deg, ${lane.color}, ${lane.color}60)`,
                  borderRadius: "4px 0 0 4px",
                }}
              />

              {/* Content */}
              <div className="flex items-center gap-4 px-5 py-5 flex-1">
                {/* Emoji circle */}
                <div
                  className="flex-shrink-0 flex items-center justify-center"
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: "50%",
                    background: lane.colorGlow,
                  }}
                >
                  <span style={{ fontSize: 20 }}>{lane.emoji}</span>
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <h3
                    style={{
                      fontFamily: '"Noto Serif JP", serif',
                      color: RV_COLORS.text,
                      fontSize: 17,
                      fontWeight: 700,
                      lineHeight: 1.3,
                    }}
                  >
                    {lane.title}
                  </h3>
                  <p
                    className="mt-1"
                    style={{
                      color: RV_COLORS.textSub,
                      fontSize: 12,
                      lineHeight: 1.6,
                    }}
                  >
                    {lane.description}
                  </p>
                </div>

                {/* Chevron */}
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  className="flex-shrink-0"
                >
                  <path
                    d="M6 3L11 8L6 13"
                    stroke={lane.color}
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </div>
          </motion.button>
        ))}
      </div>

      {/* Footer hint */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8, duration: 0.6 }}
        className="mt-10 text-center"
        style={{
          color: `${RV_COLORS.textMuted}90`,
          fontSize: 11,
          letterSpacing: "0.04em",
          lineHeight: 1.6,
        }}
      >
        いつでも変更できます
      </motion.p>
    </div>
  );
}
