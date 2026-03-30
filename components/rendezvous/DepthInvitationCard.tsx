"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassCard, GlassButton } from "@/components/ui/glassmorphism-design";
import type {
  DepthInvitation,
  VulnerabilityLevel,
} from "@/lib/rendezvous/vulnerabilityGradient";

// =============================================================================
// Props
// =============================================================================

type DepthInvitationCardProps = {
  invitation: DepthInvitation;
  onAccept: () => void;
  onDefer: () => void;
};

// =============================================================================
// Visual Config per Level
// =============================================================================

type LevelVisual = {
  bgGradient: string;
  overlayOpacity: number;
  borderColor: string;
  textColor: string;
  mutedTextColor: string;
  buttonVariant: "primary" | "secondary" | "ghost";
  ambientGlow: string;
  /** Sacred golden accent for level 5 */
  goldenEdge?: boolean;
};

const LEVEL_VISUALS: Record<VulnerabilityLevel, LevelVisual> = {
  1: {
    bgGradient: "from-white/80 via-cyan-50/60 to-white/70",
    overlayOpacity: 0,
    borderColor: "border-white/60",
    textColor: "text-slate-700",
    mutedTextColor: "text-slate-400",
    buttonVariant: "primary",
    ambientGlow: "rgba(6, 182, 212, 0.1)",
  },
  2: {
    bgGradient: "from-white/70 via-violet-50/50 to-white/60",
    overlayOpacity: 0,
    borderColor: "border-violet-200/40",
    textColor: "text-slate-700",
    mutedTextColor: "text-slate-400",
    buttonVariant: "primary",
    ambientGlow: "rgba(139, 92, 246, 0.12)",
  },
  3: {
    bgGradient: "from-purple-950/10 via-pink-900/8 to-purple-950/10",
    overlayOpacity: 0.05,
    borderColor: "border-pink-300/30",
    textColor: "text-slate-700",
    mutedTextColor: "text-slate-400",
    buttonVariant: "primary",
    ambientGlow: "rgba(236, 72, 153, 0.15)",
  },
  4: {
    bgGradient: "from-red-950/15 via-purple-950/12 to-red-950/15",
    overlayOpacity: 0.1,
    borderColor: "border-red-300/25",
    textColor: "text-slate-700",
    mutedTextColor: "text-slate-400",
    buttonVariant: "primary",
    ambientGlow: "rgba(239, 68, 68, 0.18)",
  },
  5: {
    bgGradient: "from-slate-900/20 via-amber-950/15 to-slate-900/20",
    overlayOpacity: 0.15,
    borderColor: "border-amber-400/30",
    textColor: "text-slate-700",
    mutedTextColor: "text-slate-400",
    buttonVariant: "primary",
    ambientGlow: "rgba(245, 158, 11, 0.2)",
    goldenEdge: true,
  },
};

// =============================================================================
// Component
// =============================================================================

export default function DepthInvitationCard({
  invitation,
  onAccept,
  onDefer,
}: DepthInvitationCardProps) {
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(true);
  const visual = LEVEL_VISUALS[invitation.level];

  const handleAccept = () => {
    setIsVisible(false);
    // Delay to allow exit animation
    setTimeout(onAccept, 400);
  };

  const handleDefer = () => {
    setIsVisible(false);
    setTimeout(onDefer, 400);
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          <GlassCard variant="gradient" padding="none" hoverEffect={false}>
            <div className="relative overflow-hidden rounded-3xl">
              {/* Background gradient layer */}
              <div
                className={`absolute inset-0 bg-gradient-to-br ${visual.bgGradient}`}
              />

              {/* Vignette overlay for deeper levels */}
              {visual.overlayOpacity > 0 && (
                <div
                  className="absolute inset-0"
                  style={{
                    background: `radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,${visual.overlayOpacity}) 100%)`,
                  }}
                />
              )}

              {/* Ambient glow */}
              <motion.div
                className="absolute -top-20 -right-20 w-60 h-60 rounded-full blur-3xl"
                style={{ background: visual.ambientGlow }}
                animate={{ scale: [1, 1.1, 1], opacity: [0.5, 0.8, 0.5] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              />
              <motion.div
                className="absolute -bottom-20 -left-20 w-48 h-48 rounded-full blur-3xl"
                style={{ background: visual.ambientGlow }}
                animate={{ scale: [1.1, 1, 1.1], opacity: [0.3, 0.6, 0.3] }}
                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
              />

              {/* Golden edge for level 5 */}
              {visual.goldenEdge && (
                <div
                  className="absolute inset-0 rounded-3xl pointer-events-none"
                  style={{
                    border: "1px solid rgba(245, 158, 11, 0.35)",
                    boxShadow:
                      "inset 0 0 30px rgba(245, 158, 11, 0.08), 0 0 20px rgba(245, 158, 11, 0.06)",
                  }}
                />
              )}

              {/* Content */}
              <div className="relative z-10 p-6">
                {/* Context text */}
                <motion.p
                  className={`text-xs ${visual.mutedTextColor} mb-4 leading-relaxed`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3, duration: 0.5 }}
                >
                  {invitation.context}
                </motion.p>

                {/* Main prompt — the invitation to share */}
                <motion.p
                  className={`text-[17px] leading-[1.7] ${visual.textColor} font-medium mb-6`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5, duration: 0.6, ease: "easeOut" }}
                >
                  {invitation.prompt}
                </motion.p>

                {/* Choices if responseType is 'choice' */}
                {invitation.responseType === "choice" &&
                  invitation.choices && (
                    <motion.div
                      className="flex flex-wrap gap-2 mb-6"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.7, duration: 0.4 }}
                    >
                      {invitation.choices.map((choice) => (
                        <motion.button
                          key={choice}
                          onClick={() => setSelectedChoice(choice)}
                          className={`
                            px-4 py-2 rounded-2xl text-sm font-medium
                            transition-all duration-200
                            ${
                              selectedChoice === choice
                                ? "bg-white/80 border-2 border-violet-300 text-violet-700 shadow-sm"
                                : "bg-white/40 border border-white/60 text-slate-600 hover:bg-white/60"
                            }
                          `}
                          whileTap={{ scale: 0.95 }}
                        >
                          {choice}
                        </motion.button>
                      ))}
                    </motion.div>
                  )}

                {/* Action buttons */}
                <motion.div
                  className="flex items-center gap-3"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.9, duration: 0.4 }}
                >
                  <GlassButton
                    variant={visual.buttonVariant}
                    onClick={handleAccept}
                    className="flex-1"
                  >
                    {"\u5411\u304D\u5408\u3046"}
                  </GlassButton>
                  <GlassButton
                    variant="ghost"
                    onClick={handleDefer}
                    className="flex-1"
                  >
                    {"\u307E\u3060\u65E9\u3044"}
                  </GlassButton>
                </motion.div>

                {/* Safety note — always visible, very muted */}
                <motion.p
                  className="text-[10px] text-slate-300 text-center mt-4 leading-relaxed"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1.1, duration: 0.4 }}
                >
                  {invitation.safetyNote}
                </motion.p>
              </div>
            </div>
          </GlassCard>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
