// app/stargazer/_shared/EmptyState.tsx
// Stargazer -- Thematic empty state with star animation
"use client";

import { motion } from "framer-motion";
import { GlassButton } from "@/components/ui/glassmorphism-design";

// ── Variant definitions ──

type EmptyVariant =
  | "stars"       // default: no observations
  | "prophecy"    // no prophecy history
  | "signature"   // no signature generated
  | "alter"       // alter not ready
  | "weather"     // no weather data
  | "generic";    // fallback

interface VariantConfig {
  icon: React.ReactNode;
  particleColor: string;
  glowColor: string;
}

const CONSTELLATION_DOTS = [
  { x: 20, y: 15, r: 1.5, delay: 0 },
  { x: 72, y: 22, r: 2, delay: 0.3 },
  { x: 45, y: 50, r: 1.8, delay: 0.6 },
  { x: 85, y: 65, r: 1.2, delay: 0.9 },
  { x: 30, y: 78, r: 1.6, delay: 1.2 },
  { x: 60, y: 88, r: 1.4, delay: 0.4 },
  { x: 10, y: 55, r: 1, delay: 0.8 },
];

const CONSTELLATION_LINES = [
  { x1: 20, y1: 15, x2: 45, y2: 50 },
  { x1: 45, y1: 50, x2: 72, y2: 22 },
  { x1: 45, y1: 50, x2: 85, y2: 65 },
  { x1: 30, y1: 78, x2: 45, y2: 50 },
  { x1: 30, y1: 78, x2: 60, y2: 88 },
];

function getVariantConfig(variant: EmptyVariant): VariantConfig {
  switch (variant) {
    case "prophecy":
      return {
        icon: (
          <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <circle cx="12" cy="12" r="10" strokeOpacity={0.4} />
            <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10" strokeLinecap="round" strokeOpacity={0.6} />
            <circle cx="12" cy="12" r="3" fill="currentColor" fillOpacity={0.15} />
          </svg>
        ),
        particleColor: "rgba(99,102,241,0.5)",
        glowColor: "rgba(99,102,241,0.06)",
      };
    case "signature":
      return {
        icon: (
          <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path d="M12 2l2.4 7.4h7.6l-6.2 4.5 2.4 7.4L12 16.8l-6.2 4.5 2.4-7.4L2 9.4h7.6z" strokeOpacity={0.5} />
          </svg>
        ),
        particleColor: "rgba(236,72,153,0.4)",
        glowColor: "rgba(236,72,153,0.06)",
      };
    case "alter":
      return {
        icon: (
          <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" strokeOpacity={0.4} />
            <circle cx="12" cy="7" r="4" strokeOpacity={0.5} />
            <path d="M12 11v2M10 14h4" strokeOpacity={0.3} />
          </svg>
        ),
        particleColor: "rgba(168,85,247,0.4)",
        glowColor: "rgba(168,85,247,0.06)",
      };
    case "weather":
      return {
        icon: (
          <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" strokeOpacity={0.35} />
            <circle cx="12" cy="12" r="5" strokeOpacity={0.5} />
          </svg>
        ),
        particleColor: "rgba(14,165,233,0.4)",
        glowColor: "rgba(14,165,233,0.06)",
      };
    case "stars":
    case "generic":
    default:
      return {
        icon: (
          <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <circle cx="12" cy="12" r="2" fill="currentColor" fillOpacity={0.2} />
            <path d="M12 2v4M12 18v4M2 12h4M18 12h4M5.64 5.64l2.83 2.83M15.54 15.54l2.83 2.83M5.64 18.36l2.83-2.83M15.54 8.46l2.83-2.83" strokeOpacity={0.35} />
          </svg>
        ),
        particleColor: "rgba(176,144,80,0.4)",
        glowColor: "rgba(176,144,80,0.06)",
      };
  }
}

// ── Props ──

interface EmptyStateProps {
  message: string;
  submessage?: string;
  variant?: EmptyVariant;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  compact?: boolean;
}

export default function EmptyState({
  message,
  submessage,
  variant = "stars",
  actionLabel,
  actionHref,
  onAction,
  compact = false,
}: EmptyStateProps) {
  const config = getVariantConfig(variant);

  return (
    <div className={`flex flex-col items-center justify-center ${compact ? "py-10" : "py-20"}`}>
      {/* Star animation container */}
      <div className="relative w-28 h-28 mb-6">
        {/* Glow backdrop */}
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{ background: `radial-gradient(circle, ${config.glowColor}, transparent)` }}
          animate={{ scale: [1, 1.15, 1], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* Star pattern SVG */}
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100">
          {/* Connection lines - drawn with reveal */}
          {CONSTELLATION_LINES.map((line, i) => (
            <motion.line
              key={`line-${i}`}
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              stroke={config.particleColor}
              strokeWidth={0.5}
              strokeOpacity={0.3}
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.5, delay: 0.5 + i * 0.2, ease: "easeOut" }}
            />
          ))}

          {/* Star dots */}
          {CONSTELLATION_DOTS.map((dot, i) => (
            <motion.circle
              key={`dot-${i}`}
              cx={dot.x}
              cy={dot.y}
              r={dot.r}
              fill={config.particleColor}
              initial={{ opacity: 0, scale: 0 }}
              animate={{
                opacity: [0, 0.8, 0.3, 0.8, 0],
                scale: [0, 1, 0.8, 1, 0],
              }}
              transition={{
                duration: 5,
                delay: dot.delay,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
          ))}
        </svg>

        {/* Center icon */}
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ color: config.particleColor }}
        >
          <motion.div
            animate={{ opacity: [0.4, 0.7, 0.4] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          >
            {config.icon}
          </motion.div>
        </div>
      </div>

      {/* Message */}
      <motion.p
        className="font-display text-sm text-center max-w-[280px] leading-7"
        style={{ color: "rgba(30,35,55,0.6)" }}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.25 }}
      >
        {message}
      </motion.p>

      {/* Sub-message */}
      {submessage && (
        <motion.p
          className="text-xs text-center max-w-[240px] mt-2 leading-relaxed"
          style={{ color: "rgba(100,105,130,0.5)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.25 }}
        >
          {submessage}
        </motion.p>
      )}

      {/* Action button */}
      {(actionLabel && (actionHref || onAction)) && (
        <motion.div
          className="mt-5"
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <GlassButton
            variant="ghost"
            size="sm"
            href={actionHref}
            onClick={onAction}
          >
            {actionLabel}
          </GlassButton>
        </motion.div>
      )}
    </div>
  );
}
