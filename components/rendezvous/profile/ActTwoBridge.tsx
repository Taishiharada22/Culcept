"use client";

import { motion } from "framer-motion";
import { GlassCard, FadeInView } from "@/components/ui/glassmorphism-design";
import type { MatchingVector } from "@/lib/rendezvous/types";
import {
  generateBridgeNarrative,
  computeChemistrySegments,
} from "@/lib/rendezvous/bridgeNarrative";

type Props = {
  myVector: Partial<MatchingVector>;
  theirVector: Partial<MatchingVector>;
  avatarMessages?: { role: "avatar" | "their_avatar"; text: string }[];
  prediction?: string;
  detail?: string;
  chemistryMap?: {
    resonance: number;
    complement: number;
    friction: number;
    unknown: number;
  };
};

const CHEMISTRY_COLORS = {
  resonance: "#8B5CF6",
  complement: "#06B6D4",
  friction: "#F97316",
  unknown: "#E2E8F0",
};

const CHEMISTRY_LABELS: Record<string, string> = {
  resonance: "共鳴",
  complement: "補完",
  friction: "摩擦",
  unknown: "未知",
};

export default function ActTwoBridge({
  myVector,
  theirVector,
  avatarMessages,
  prediction: predictionProp,
  detail: detailProp,
  chemistryMap: chemistryProp,
}: Props) {
  // Compute bridge narrative if not provided
  const computed = !predictionProp
    ? generateBridgeNarrative(myVector, theirVector, chemistryProp)
    : null;
  const prediction = predictionProp ?? computed?.prediction ?? "";
  const detail = detailProp ?? computed?.detail ?? "";

  // Compute chemistry segments if not provided
  const chemistry =
    chemistryProp ?? computeChemistrySegments(myVector, theirVector);
  const totalChemistry =
    chemistry.resonance +
    chemistry.complement +
    chemistry.friction +
    chemistry.unknown;

  return (
    <div className="px-5 pb-8">
      {/* Header */}
      <FadeInView>
        <h3 className="text-base font-bold text-slate-800 mb-5">
          あなたとの間に見えるもの
        </h3>
      </FadeInView>

      {/* Avatar conversation highlight */}
      {avatarMessages && avatarMessages.length > 0 && (
        <FadeInView delay={0.1}>
          <GlassCard className="mb-5" padding="md">
            <div className="space-y-3">
              {avatarMessages.slice(0, 3).map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 + i * 0.15 }}
                  className={`flex ${msg.role === "avatar" ? "justify-start" : "justify-end"}`}
                >
                  <div
                    className={`
                      max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed
                      ${
                        msg.role === "avatar"
                          ? "bg-violet-50 text-violet-900 rounded-bl-md"
                          : "bg-slate-100 text-slate-700 rounded-br-md"
                      }
                    `}
                  >
                    <p className="text-[10px] font-semibold mb-0.5 opacity-50">
                      {msg.role === "avatar" ? "あなたの分身" : "相手の分身"}
                    </p>
                    {msg.text}
                  </div>
                </motion.div>
              ))}
            </div>
          </GlassCard>
        </FadeInView>
      )}

      {/* Chemistry bar */}
      <FadeInView delay={0.2}>
        <div className="mb-5">
          <div className="flex items-center gap-0.5 h-3 rounded-full overflow-hidden mb-2">
            {(["resonance", "complement", "friction", "unknown"] as const).map(
              (key) => {
                const value = chemistry[key];
                if (value <= 0) return null;
                return (
                  <motion.div
                    key={key}
                    className="h-full first:rounded-l-full last:rounded-r-full"
                    style={{
                      backgroundColor:
                        CHEMISTRY_COLORS[key],
                    }}
                    initial={{ width: 0 }}
                    animate={{
                      width: `${totalChemistry > 0 ? (value / totalChemistry) * 100 : 25}%`,
                    }}
                    transition={{ delay: 0.4, duration: 0.6, ease: "easeOut" }}
                  />
                );
              },
            )}
          </div>
          {/* Legend */}
          <div className="flex items-center gap-4">
            {(["resonance", "complement", "friction", "unknown"] as const).map(
              (key) => {
                if (chemistry[key] <= 0) return null;
                return (
                  <div key={key} className="flex items-center gap-1.5">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: CHEMISTRY_COLORS[key] }}
                    />
                    <span className="text-[10px] text-slate-500">
                      {CHEMISTRY_LABELS[key]}
                    </span>
                  </div>
                );
              },
            )}
          </div>
        </div>
      </FadeInView>

      {/* Bridge prediction text */}
      <FadeInView delay={0.3}>
        <div className="mb-3">
          <p className="text-sm font-semibold text-slate-700 leading-relaxed">
            {prediction}
          </p>
        </div>
      </FadeInView>

      {/* Bridge detail */}
      <FadeInView delay={0.4}>
        <p className="text-xs text-slate-500 leading-relaxed">
          {detail}
        </p>
      </FadeInView>
    </div>
  );
}
