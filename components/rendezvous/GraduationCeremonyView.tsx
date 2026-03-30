"use client";

/**
 * GraduationCeremonyView
 * 関係が美しい結論に達したときのフルスクリーン・セレモニー演出。
 * 4フェーズ: 出会いの再現 -> 旅路のモンタージュ -> 星座の進化 -> 祝福
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassCard, GlassButton } from "@/components/ui/glassmorphism-design";
import type { GraduationData } from "@/lib/rendezvous/graduationCeremony";

type Phase = "encounter" | "journey" | "constellation" | "blessing";

type Props = {
  data: GraduationData;
  story: string[];
  onShare: () => void;
  onClose: () => void;
};

const PHASE_DURATION = 4000; // 4 seconds per phase

export default function GraduationCeremonyView({
  data,
  story,
  onShare,
  onClose,
}: Props) {
  const [phase, setPhase] = useState<Phase>("encounter");
  const [autoPlay, setAutoPlay] = useState(true);

  // Phase progression
  useEffect(() => {
    if (!autoPlay) return;
    const phases: Phase[] = ["encounter", "journey", "constellation", "blessing"];
    const currentIndex = phases.indexOf(phase);
    if (currentIndex >= phases.length - 1) return;

    const timer = setTimeout(() => {
      setPhase(phases[currentIndex + 1]);
    }, PHASE_DURATION);

    return () => clearTimeout(timer);
  }, [phase, autoPlay]);

  const handlePhaseClick = useCallback(
    (target: Phase) => {
      setAutoPlay(false);
      setPhase(target);
    },
    [],
  );

  const phases: Phase[] = ["encounter", "journey", "constellation", "blessing"];
  const phaseLabels: Record<Phase, string> = {
    encounter: "出会い",
    journey: "旅路",
    constellation: "星座",
    blessing: "祝福",
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Deep space background */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-indigo-950 to-slate-950" />

      {/* Twinkling stars */}
      <StarField />

      {/* Gold/warm gradient overlay */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse at 50% 40%, ${data.shareCard.gradientColors[0]}15, transparent 70%)`,
        }}
        animate={{ opacity: [0.3, 0.6, 0.3] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Phase indicator */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 z-20 flex gap-2">
        {phases.map((p) => (
          <button
            key={p}
            onClick={() => handlePhaseClick(p)}
            className={`px-3 py-1 rounded-full text-xs transition-all ${
              phase === p
                ? "bg-white/20 text-white"
                : "bg-white/5 text-white/40 hover:text-white/60"
            }`}
          >
            {phaseLabels[p]}
          </button>
        ))}
      </div>

      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-6 right-6 z-20 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/20 transition-all"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>

      {/* Phase content */}
      <div className="relative z-10 h-full flex items-center justify-center px-6">
        <AnimatePresence mode="wait">
          {phase === "encounter" && (
            <EncounterPhase key="encounter" data={data} storyParagraph={story[0]} />
          )}
          {phase === "journey" && (
            <JourneyPhase key="journey" data={data} storyParagraphs={story.slice(1, 3)} />
          )}
          {phase === "constellation" && (
            <ConstellationPhase key="constellation" data={data} storyParagraph={story[3]} />
          )}
          {phase === "blessing" && (
            <BlessingPhase
              key="blessing"
              data={data}
              blessingText={story[story.length - 1]}
              onShare={onShare}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ============================================================
// Phase 1: Encounter Replay
// ============================================================

function EncounterPhase({
  data,
  storyParagraph,
}: {
  data: GraduationData;
  storyParagraph?: string;
}) {
  return (
    <motion.div
      className="text-center max-w-lg"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.8 }}
    >
      {/* Two converging stars */}
      <div className="relative w-64 h-40 mx-auto mb-8">
        <motion.div
          className="absolute w-4 h-4 rounded-full bg-amber-300 shadow-lg shadow-amber-300/50"
          initial={{ left: 0, top: "50%" }}
          animate={{ left: "45%", top: "45%" }}
          transition={{ duration: 2.5, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute w-4 h-4 rounded-full bg-rose-300 shadow-lg shadow-rose-300/50"
          initial={{ right: 0, top: "50%" }}
          animate={{ right: "45%", top: "45%" }}
          transition={{ duration: 2.5, ease: "easeInOut" }}
        />
        {/* Convergence burst */}
        <motion.div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full"
          style={{
            background: `radial-gradient(circle, ${data.shareCard.gradientColors[0]}80, transparent)`,
          }}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: [0, 3, 2], opacity: [0, 0.8, 0.4] }}
          transition={{ duration: 1.5, delay: 2 }}
        />
      </div>

      {/* Date */}
      <motion.p
        className="text-white/50 text-sm mb-3"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        {data.story.encounterChapter.date}
      </motion.p>

      {/* Narrative */}
      <motion.p
        className="text-white/90 text-lg leading-relaxed font-light"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1 }}
      >
        {storyParagraph ?? data.story.encounterChapter.triggerNarrative}
      </motion.p>

      {/* Initial sync */}
      <motion.div
        className="mt-6 text-amber-300/80 text-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
      >
        {data.story.encounterChapter.initialSyncPercent}%
      </motion.div>
    </motion.div>
  );
}

// ============================================================
// Phase 2: Journey Montage
// ============================================================

function JourneyPhase({
  data,
  storyParagraphs,
}: {
  data: GraduationData;
  storyParagraphs: string[];
}) {
  const { journeyStats, story } = data;

  return (
    <motion.div
      className="text-center max-w-md w-full"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.8 }}
    >
      {/* Stats counter */}
      <div className="flex justify-center gap-8 mb-8">
        <CounterStat label="日間" value={journeyStats.daysConnected} delay={0} />
        <CounterStat label="通" value={journeyStats.totalMessages} delay={0.3} />
        <CounterStat label="共有体験" value={journeyStats.totalActivities} delay={0.6} />
      </div>

      {/* Milestones scroll */}
      <div className="space-y-3 mb-6">
        {story.growthChapter.keyMilestones.slice(0, 5).map((m, i) => (
          <motion.div
            key={i}
            className="flex items-center gap-3 text-white/80 text-sm"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 + i * 0.3 }}
          >
            <span className="text-lg">{m.emoji}</span>
            <span className="text-white/50 text-xs">{m.date}</span>
            <span>{m.milestone}</span>
          </motion.div>
        ))}
      </div>

      {/* Season transitions */}
      {story.growthChapter.seasonsTraversed.length > 0 && (
        <motion.div
          className="flex justify-center gap-2 flex-wrap"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
        >
          {story.growthChapter.seasonsTraversed.map((s, i) => (
            <span
              key={i}
              className="px-3 py-1 rounded-full bg-white/10 text-white/60 text-xs"
            >
              {s.season} {s.duration}
            </span>
          ))}
        </motion.div>
      )}

      {/* Narrative */}
      {storyParagraphs.map((p, i) => (
        <motion.p
          key={i}
          className="mt-4 text-white/70 text-sm leading-relaxed"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2 + i * 0.5 }}
        >
          {p}
        </motion.p>
      ))}
    </motion.div>
  );
}

// ============================================================
// Phase 3: Constellation Evolution
// ============================================================

function ConstellationPhase({
  data,
  storyParagraph,
}: {
  data: GraduationData;
  storyParagraph?: string;
}) {
  const { constellation, shareCard } = data;
  const initialPoints = useMemo(
    () => vectorToPoints(constellation.initial.axes),
    [constellation.initial.axes],
  );
  const finalPoints = useMemo(
    () => vectorToPoints(constellation.final.axes),
    [constellation.final.axes],
  );

  return (
    <motion.div
      className="text-center max-w-lg"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.8 }}
    >
      {/* Constellation SVG */}
      <div className="relative w-64 h-64 mx-auto mb-8">
        <svg viewBox="0 0 100 100" className="w-full h-full">
          {/* Initial constellation (fading out) */}
          <motion.polygon
            points={initialPoints.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke={shareCard.gradientColors[0]}
            strokeWidth="0.5"
            strokeOpacity="0.3"
            initial={{ opacity: 0.8 }}
            animate={{ opacity: 0.1 }}
            transition={{ duration: 2 }}
          />

          {/* Final constellation (morphing in) */}
          <motion.polygon
            points={initialPoints.map((p) => `${p.x},${p.y}`).join(" ")}
            fill={`${shareCard.gradientColors[0]}10`}
            stroke={shareCard.gradientColors[1]}
            strokeWidth="1"
            animate={{
              points: finalPoints.map((p) => `${p.x},${p.y}`).join(" "),
            }}
            transition={{ duration: 2.5, ease: "easeInOut" }}
          />

          {/* Star points */}
          {finalPoints.map((p, i) => (
            <motion.circle
              key={i}
              cx={p.x}
              cy={p.y}
              r="1.5"
              fill="white"
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 0.8, scale: 1 }}
              transition={{ delay: 1 + i * 0.15 }}
            />
          ))}

          {/* Particle trails between old and new positions */}
          {initialPoints.map((ip, i) => {
            const fp = finalPoints[i];
            if (!fp) return null;
            return (
              <motion.line
                key={`trail-${i}`}
                x1={ip.x}
                y1={ip.y}
                x2={ip.x}
                y2={ip.y}
                stroke="white"
                strokeWidth="0.3"
                strokeOpacity="0.3"
                animate={{ x2: fp.x, y2: fp.y }}
                transition={{ duration: 2, delay: 0.5 }}
              />
            );
          })}
        </svg>
      </div>

      {/* Sync evolution */}
      <div className="flex items-center justify-center gap-4 mb-4">
        <motion.span
          className="text-white/50 text-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
        >
          {constellation.initial.syncPercent}%
        </motion.span>
        <motion.div
          className="w-16 h-px bg-gradient-to-r from-white/20 to-white/60"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ delay: 1.5, duration: 1 }}
        />
        <motion.span
          className="text-amber-300 text-lg font-medium"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2 }}
        >
          {constellation.final.syncPercent}%
        </motion.span>
      </div>

      {/* Transformation text */}
      {data.story.transformationChapter.grownAxes.length > 0 && (
        <motion.div
          className="space-y-2 mb-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2.5 }}
        >
          {data.story.transformationChapter.grownAxes.slice(0, 3).map((a, i) => (
            <div key={i} className="flex items-center justify-center gap-2 text-sm">
              <span className="text-white/50">{a.label}</span>
              <span className="text-white/30">{Math.round(a.before * 100)}%</span>
              <span className="text-white/30">&rarr;</span>
              <span className="text-amber-300/80">{Math.round(a.after * 100)}%</span>
            </div>
          ))}
        </motion.div>
      )}

      {storyParagraph && (
        <motion.p
          className="text-white/70 text-sm leading-relaxed"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 3 }}
        >
          {storyParagraph}
        </motion.p>
      )}
    </motion.div>
  );
}

// ============================================================
// Phase 4: Blessing
// ============================================================

function BlessingPhase({
  data,
  blessingText,
  onShare,
}: {
  data: GraduationData;
  blessingText: string;
  onShare: () => void;
}) {
  return (
    <motion.div
      className="text-center max-w-md"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1.2 }}
    >
      {/* Warm glow */}
      <motion.div
        className="w-24 h-24 mx-auto mb-8 rounded-full"
        style={{
          background: `radial-gradient(circle, ${data.shareCard.gradientColors[0]}60, ${data.shareCard.gradientColors[1]}20, transparent)`,
        }}
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.6, 0.9, 0.6],
        }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Blessing message */}
      <motion.p
        className="text-white text-xl leading-relaxed font-light mb-8"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 1 }}
      >
        {blessingText}
      </motion.p>

      {/* Stats summary */}
      <motion.div
        className="mb-8"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
      >
        <GlassCard className="inline-block !bg-white/5 !border-white/10">
          <div className="flex gap-6 text-center px-4">
            <div>
              <div className="text-amber-300 text-2xl font-light">
                {data.journeyStats.daysConnected}
              </div>
              <div className="text-white/40 text-xs">日間</div>
            </div>
            <div>
              <div className="text-amber-300 text-2xl font-light">
                {data.journeyStats.peakSyncPercent}%
              </div>
              <div className="text-white/40 text-xs">最高シンクロ</div>
            </div>
            <div>
              <div className="text-amber-300 text-2xl font-light">
                {data.story.futureChapter.sharedMemoryCount}
              </div>
              <div className="text-white/40 text-xs">共有の記憶</div>
            </div>
          </div>
        </GlassCard>
      </motion.div>

      {/* Share button */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 2 }}
      >
        <motion.div
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        >
          <div
            style={{
              backgroundImage: `linear-gradient(135deg, ${data.shareCard.gradientColors[0]}, ${data.shareCard.gradientColors[1]})`,
            }}
            className="rounded-[16px]"
          >
            <GlassButton
              onClick={onShare}
              className="!bg-transparent !border-0 !text-white !shadow-lg w-full"
            >
              この物語をシェアする
            </GlassButton>
          </div>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

// ============================================================
// Helper components
// ============================================================

function StarField() {
  const stars = useMemo(() => {
    const result: { x: number; y: number; size: number; delay: number }[] = [];
    // Deterministic positions using simple math
    for (let i = 0; i < 60; i++) {
      const seed = i * 7919; // prime
      result.push({
        x: ((seed * 13) % 1000) / 10,
        y: ((seed * 17) % 1000) / 10,
        size: ((seed * 23) % 3) + 1,
        delay: ((seed * 31) % 30) / 10,
      });
    }
    return result;
  }, []);

  return (
    <div className="absolute inset-0 pointer-events-none">
      {stars.map((star, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full bg-white"
          style={{
            left: `${star.x}%`,
            top: `${star.y}%`,
            width: star.size,
            height: star.size,
          }}
          animate={{ opacity: [0.2, 0.8, 0.2] }}
          transition={{
            duration: 2 + star.delay,
            repeat: Infinity,
            ease: "easeInOut",
            delay: star.delay,
          }}
        />
      ))}
    </div>
  );
}

function CounterStat({
  label,
  value,
  delay,
}: {
  label: string;
  value: number;
  delay: number;
}) {
  const [displayed, setDisplayed] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const duration = 1500;
    const startDelay = delay * 1000;

    const timer = setInterval(() => {
      const elapsed = Date.now() - start - startDelay;
      if (elapsed < 0) return;
      const progress = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayed(Math.round(eased * value));
      if (progress >= 1) clearInterval(timer);
    }, 30);

    return () => clearInterval(timer);
  }, [value, delay]);

  return (
    <motion.div
      className="text-center"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
    >
      <div className="text-white text-2xl font-light">{displayed}</div>
      <div className="text-white/40 text-xs">{label}</div>
    </motion.div>
  );
}

// ============================================================
// Geometry helpers
// ============================================================

function vectorToPoints(
  axes: Record<string, number>,
): { x: number; y: number }[] {
  const keys = Object.keys(axes);
  if (keys.length === 0) return [];

  const angleStep = (2 * Math.PI) / keys.length;
  return keys.map((key, i) => {
    const angle = angleStep * i - Math.PI / 2;
    const radius = (axes[key] ?? 0.5) * 35 + 10;
    return {
      x: Math.round(50 + radius * Math.cos(angle)),
      y: Math.round(50 + radius * Math.sin(angle)),
    };
  });
}
