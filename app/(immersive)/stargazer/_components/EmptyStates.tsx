// app/stargazer/_components/EmptyStates.tsx
// 空状態コンポーネント — データがないときの誘導UI
"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { GlassCard, GlassButton } from "@/components/ui/glassmorphism-design";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Shared illustration primitives
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Floating orbit rings — subtle CSS/SVG illustration */
function OrbitIllustration({
  accentColor = "rgba(168,85,247,0.3)",
}: {
  accentColor?: string;
}) {
  return (
    <div className="relative w-28 h-28 mx-auto mb-6">
      {/* Outer ring */}
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{
          border: `1.5px solid ${accentColor}`,
          opacity: 0.4,
        }}
        animate={{ rotate: 360 }}
        transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
      />
      {/* Middle ring */}
      <motion.div
        className="absolute inset-3 rounded-full"
        style={{
          border: `1px dashed rgba(148,163,184,0.2)`,
        }}
        animate={{ rotate: -360 }}
        transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
      />
      {/* Inner glow */}
      <div
        className="absolute inset-6 rounded-full"
        style={{
          background: `radial-gradient(circle, ${accentColor.replace("0.3", "0.08")} 0%, transparent 70%)`,
        }}
      />
      {/* Center dot */}
      <motion.div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full"
        style={{ background: accentColor }}
        animate={{ scale: [0.8, 1.2, 0.8], opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Orbiting dot */}
      <motion.div
        className="absolute w-2 h-2 rounded-full"
        style={{
          background: accentColor,
          top: "50%",
          left: "50%",
        }}
        animate={{
          x: [0, 40, 0, -40, 0],
          y: [-40, 0, 40, 0, -40],
        }}
        transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
      />
    </div>
  );
}

/** Constellation-like dot pattern */
function ConstellationIllustration() {
  const points = [
    { x: 30, y: 20 },
    { x: 70, y: 15 },
    { x: 85, y: 50 },
    { x: 55, y: 70 },
    { x: 20, y: 60 },
    { x: 45, y: 40 },
  ];

  return (
    <div className="relative w-28 h-28 mx-auto mb-6">
      <svg
        viewBox="0 0 100 100"
        className="w-full h-full"
        style={{ opacity: 0.6 }}
      >
        {/* Connection lines */}
        {points.map((p, i) => {
          const next = points[(i + 1) % points.length];
          return (
            <motion.line
              key={`line-${i}`}
              x1={p.x}
              y1={p.y}
              x2={next.x}
              y2={next.y}
              stroke="rgba(168,85,247,0.15)"
              strokeWidth="0.5"
              strokeDasharray="3 3"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 2, delay: i * 0.3 }}
            />
          );
        })}
        {/* Star dots */}
        {points.map((p, i) => (
          <motion.circle
            key={`dot-${i}`}
            cx={p.x}
            cy={p.y}
            r="2"
            fill="rgba(190,170,110,0.5)"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: [0.3, 0.8, 0.3] }}
            transition={{
              scale: { delay: i * 0.2, duration: 0.4 },
              opacity: { delay: i * 0.2 + 0.5, duration: 3, repeat: Infinity },
            }}
          />
        ))}
      </svg>
    </div>
  );
}

/** Wave pattern for predictions */
function WaveIllustration() {
  return (
    <div className="relative w-28 h-28 mx-auto mb-6 overflow-hidden">
      <svg viewBox="0 0 100 80" className="w-full h-full" style={{ opacity: 0.5 }}>
        {[0, 1, 2].map((i) => (
          <motion.path
            key={i}
            d={`M0,${35 + i * 8} Q25,${25 + i * 8} 50,${35 + i * 8} T100,${35 + i * 8}`}
            fill="none"
            stroke={`rgba(99,102,241,${0.3 - i * 0.08})`}
            strokeWidth="1"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 2, delay: i * 0.4 }}
          />
        ))}
        {/* Floating prediction dot */}
        <motion.circle
          cx={50}
          cy={35}
          r="3"
          fill="rgba(99,102,241,0.4)"
          animate={{
            cy: [35, 30, 40, 35],
            opacity: [0.4, 0.8, 0.4],
          }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        />
      </svg>
    </div>
  );
}

/** Mirror/contradiction illustration */
function MirrorIllustration() {
  return (
    <div className="relative w-28 h-28 mx-auto mb-6">
      <svg viewBox="0 0 100 100" className="w-full h-full" style={{ opacity: 0.5 }}>
        {/* Center axis */}
        <line
          x1="50"
          y1="15"
          x2="50"
          y2="85"
          stroke="rgba(148,163,184,0.15)"
          strokeWidth="0.5"
          strokeDasharray="2 4"
        />
        {/* Left face outline */}
        <motion.path
          d="M25,35 Q20,50 25,65 Q35,75 45,65 Q50,50 45,35 Q35,25 25,35"
          fill="none"
          stroke="rgba(236,72,153,0.3)"
          strokeWidth="1"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 2.5, ease: "easeInOut" }}
        />
        {/* Right face outline (mirrored) */}
        <motion.path
          d="M75,35 Q80,50 75,65 Q65,75 55,65 Q50,50 55,35 Q65,25 75,35"
          fill="none"
          stroke="rgba(168,85,247,0.3)"
          strokeWidth="1"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 2.5, delay: 0.5, ease: "easeInOut" }}
        />
        {/* Connecting sparks */}
        <motion.circle
          cx="50"
          cy="50"
          r="2"
          fill="rgba(245,158,11,0.5)"
          animate={{ scale: [0.5, 1.5, 0.5], opacity: [0.3, 0.8, 0.3] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      </svg>
    </div>
  );
}

/** Calendar / time illustration */
function CalendarIllustration() {
  return (
    <div className="relative w-28 h-28 mx-auto mb-6">
      <svg viewBox="0 0 100 100" className="w-full h-full" style={{ opacity: 0.5 }}>
        {/* Calendar outline */}
        <rect
          x="20"
          y="25"
          width="60"
          height="55"
          rx="6"
          fill="none"
          stroke="rgba(148,163,184,0.25)"
          strokeWidth="1"
        />
        {/* Top bar */}
        <rect
          x="20"
          y="25"
          width="60"
          height="12"
          rx="6"
          fill="rgba(168,85,247,0.1)"
          stroke="rgba(168,85,247,0.2)"
          strokeWidth="0.5"
        />
        {/* Day dots — 7 columns, progress fills */}
        {Array.from({ length: 7 }, (_, i) => (
          <motion.circle
            key={i}
            cx={30 + i * 8}
            cy={55}
            r="2.5"
            fill={i < 3 ? "rgba(168,85,247,0.4)" : "rgba(148,163,184,0.1)"}
            stroke={i < 3 ? "rgba(168,85,247,0.3)" : "rgba(148,163,184,0.1)"}
            strokeWidth="0.5"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: i * 0.06, type: "spring" }}
          />
        ))}
        {/* Progress arrow */}
        <motion.path
          d="M28,68 L72,68"
          fill="none"
          stroke="rgba(168,85,247,0.2)"
          strokeWidth="0.8"
          strokeDasharray="3 3"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 0.4 }}
          transition={{ duration: 2, ease: "easeInOut" }}
        />
      </svg>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Empty state layout wrapper
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function EmptyStateWrapper({
  illustration,
  message,
  subMessage,
  ctaLabel,
  ctaAction,
}: {
  illustration: React.ReactNode;
  message: string;
  subMessage?: string;
  ctaLabel?: string;
  ctaAction?: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
    >
      <GlassCard variant="gradient" padding="lg" hoverEffect={false}>
        <div className="flex flex-col items-center text-center py-4">
          {illustration}

          <p
            className="text-sm font-medium leading-relaxed mb-2"
            style={{ color: "rgba(22,28,48,0.75)" }}
          >
            {message}
          </p>

          {subMessage && (
            <p
              className="text-xs leading-relaxed mb-5 max-w-xs"
              style={{ color: "rgba(100,116,139,0.6)" }}
            >
              {subMessage}
            </p>
          )}

          {ctaLabel && ctaAction && (
            <GlassButton
              variant="primary"
              size="sm"
              onClick={ctaAction}
            >
              {ctaLabel}
            </GlassButton>
          )}
        </div>
      </GlassCard>
    </motion.div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Exported empty states
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function NoObservationsYet() {
  const router = useRouter();

  return (
    <EmptyStateWrapper
      illustration={<OrbitIllustration />}
      message="まだ観測データがありません"
      subMessage="最初の一歩を踏み出しましょう。あなたの内面を観測することで、深層の自分が見えてきます。"
      ctaLabel="最初の観測を始める"
      ctaAction={() => router.push("/stargazer?tab=observe")}
    />
  );
}

export function NoPredictionsYet() {
  const router = useRouter();

  return (
    <EmptyStateWrapper
      illustration={<WaveIllustration />}
      message="予測を生成するには、もう少し観測が必要です"
      subMessage="観測を重ねるたびに深層観測はあなたのパターンを学習し、やがて行動や感情を予測できるようになります。"
      ctaLabel="観測を続ける"
      ctaAction={() => router.push("/stargazer?tab=observe")}
    />
  );
}

export function NoContradictionsYet() {
  return (
    <EmptyStateWrapper
      illustration={<MirrorIllustration />}
      message="矛盾はまだ検出されていません"
      subMessage="観測を続けると、あなたの内なる対立が見えてきます。矛盾は弱さではなく、あなたの深さの証です。"
    />
  );
}

export function NoWeeklyReportYet() {
  const router = useRouter();

  return (
    <EmptyStateWrapper
      illustration={<CalendarIllustration />}
      message="週次レポートは7日間の観測後に生成されます"
      subMessage="毎日少しずつ観測を続けてください。7日間のデータが揃うと、あなただけの物語が紡がれます。"
      ctaLabel="今日の観測へ"
      ctaAction={() => router.push("/stargazer?tab=observe")}
    />
  );
}

export function NoInsightsYet() {
  return (
    <EmptyStateWrapper
      illustration={<ConstellationIllustration />}
      message="インサイトはまだ届いていません"
      subMessage="観測を重ねると、一期一会のインサイトが届きます。消える前に見逃さないでください。"
    />
  );
}
