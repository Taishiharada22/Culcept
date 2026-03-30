"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import type { ResolvedType } from "@/types/stargazer";
import ContextFacesPanel from "../../_components/ContextFacesPanel";

interface Props {
  resolvedType: ResolvedType | null;
}

const CONTEXT_COLORS = {
  romance: {
    bg: "rgba(244, 114, 182, 0.08)",
    border: "rgba(244, 114, 182, 0.2)",
    accent: "#f472b6",
    activeBg: "rgba(244, 114, 182, 0.12)",
  },
  work: {
    bg: "rgba(96, 165, 250, 0.08)",
    border: "rgba(96, 165, 250, 0.2)",
    accent: "#60a5fa",
    activeBg: "rgba(96, 165, 250, 0.12)",
  },
  friends: {
    bg: "rgba(251, 191, 36, 0.08)",
    border: "rgba(251, 191, 36, 0.2)",
    accent: "#fbbf24",
    activeBg: "rgba(251, 191, 36, 0.12)",
  },
};

type ContextKey = keyof typeof CONTEXT_COLORS;

const CONTEXT_TABS = [
  { key: "romance" as ContextKey, emoji: "💕", label: "恋愛" },
  { key: "work" as ContextKey, emoji: "💼", label: "仕事" },
  { key: "friends" as ContextKey, emoji: "🧩", label: "友達" },
];

export default function ContextTab({ resolvedType }: Props) {
  const hasContextFaces = resolvedType?.contextFaces;
  const [activeContext, setActiveContext] = useState<ContextKey>("romance");
  const colors = CONTEXT_COLORS[activeContext];

  return (
    <div className="space-y-8 max-w-[720px] mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <p className="font-body text-base text-white/60 leading-relaxed">
          同じ人格が、文脈によってどう輝くか
        </p>
      </motion.div>

      {/* 文脈切替タブ — 色分け付き */}
      <div className="flex gap-2">
        {CONTEXT_TABS.map((tab) => {
          const isActive = activeContext === tab.key;
          const tabColors = CONTEXT_COLORS[tab.key];
          return (
            <button
              key={tab.key}
              onClick={() => setActiveContext(tab.key)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200"
              style={
                isActive
                  ? {
                      background: tabColors.activeBg,
                      border: `1px solid ${tabColors.border}`,
                      color: tabColors.accent,
                    }
                  : {
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.06)",
                      color: "rgba(255,255,255,0.4)",
                    }
              }
            >
              <span>{tab.emoji}</span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {hasContextFaces && (
        <motion.div
          key={activeContext}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
          className="card-instrument"
          style={{ borderColor: colors.border }}
        >
          <ContextFacesPanel
            contextFaces={resolvedType!.contextFaces}
            visual={resolvedType!.visual}
          />
        </motion.div>
      )}
    </div>
  );
}
