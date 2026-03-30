// app/stargazer/_components/WeeklyReportViewer.tsx
// Full-screen Stories-style weekly report viewer
// Spotify Wrapped 風 — 7枚の物語スライドをスワイプ/タップで遷移
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence, type PanInfo } from "framer-motion";
import type {
  WeeklyReport,
  WeeklyReportSlide,
  SlideEmotion,
} from "@/lib/stargazer/weeklyReportGenerator";
import {
  markReportViewed,
  generateShareableCard,
} from "@/lib/stargazer/weeklyReportGenerator";

// ── Props ──

interface Props {
  report: WeeklyReport;
  onClose: () => void;
  onShare?: (slideIndex: number) => void;
}

// ── CountUp animation hook ──

function useCountUp(target: number, duration = 1200): number {
  const [value, setValue] = useState(0);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const start = performance.now();
    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(target * eased));
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      }
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [target, duration]);

  return value;
}

// ── Emotion-based styling ──

const EMOTION_CONFIG: Record<
  SlideEmotion,
  { particleCount: number; particleSpeed: number; glowIntensity: number }
> = {
  surprise: { particleCount: 18, particleSpeed: 1.5, glowIntensity: 0.6 },
  pride: { particleCount: 14, particleSpeed: 1.0, glowIntensity: 0.5 },
  curiosity: { particleCount: 10, particleSpeed: 2.0, glowIntensity: 0.4 },
  contemplation: { particleCount: 8, particleSpeed: 0.6, glowIntensity: 0.3 },
  anticipation: { particleCount: 16, particleSpeed: 1.8, glowIntensity: 0.7 },
};

// ── Progress bar ──

function ProgressBars({
  total,
  current,
  elapsed,
  slideDuration,
}: {
  total: number;
  current: number;
  elapsed: number;
  slideDuration: number;
}) {
  return (
    <div className="flex gap-1 px-4">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className="flex-1 h-[3px] rounded-full overflow-hidden"
          style={{ background: "rgba(255,255,255,0.2)" }}
        >
          <motion.div
            className="h-full rounded-full"
            style={{ background: "rgba(255,255,255,0.9)" }}
            initial={false}
            animate={{
              width:
                i < current
                  ? "100%"
                  : i === current
                    ? `${Math.min((elapsed / slideDuration) * 100, 100)}%`
                    : "0%",
            }}
            transition={{ duration: 0.1, ease: "linear" }}
          />
        </div>
      ))}
    </div>
  );
}

// ── Slide particles (emotion-aware) ──

function SlideParticles({
  color,
  emotion,
}: {
  color: string;
  emotion: SlideEmotion;
}) {
  const config = EMOTION_CONFIG[emotion] || EMOTION_CONFIG.curiosity;
  const particles = useRef(
    Array.from({ length: config.particleCount }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: 1 + Math.random() * 3,
      delay: Math.random() * 3,
      duration: (2 + Math.random() * 4) / config.particleSpeed,
    })),
  ).current;

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            background: color,
            opacity: 0,
          }}
          animate={{
            opacity: [0, config.glowIntensity, 0],
            scale: [0.5, 1.2, 0.5],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

// ── Headline badge ──

function HeadlineBadge({ text, color }: { text: string; color: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.05, type: "spring", stiffness: 200, damping: 18 }}
      className="inline-block px-4 py-1.5 rounded-full text-sm font-bold tracking-wider"
      style={{
        background: `${color}22`,
        color,
        border: `1px solid ${color}44`,
      }}
    >
      {text}
    </motion.div>
  );
}

// ── Transition text overlay ──

function TransitionOverlay({
  text,
  onComplete,
}: {
  text: string;
  onComplete: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onComplete, 1800);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <motion.div
      className="absolute inset-0 z-30 flex items-center justify-center px-10"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22 }}
    >
      <motion.p
        className="text-lg text-white/70 text-center font-light leading-relaxed"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.25 }}
      >
        {text}
      </motion.p>
    </motion.div>
  );
}

// ── Single slide renderer ──

function SlideContent({ slide }: { slide: WeeklyReportSlide }) {
  const numericStat =
    slide.mainStat && !isNaN(Number(slide.mainStat))
      ? Number(slide.mainStat)
      : null;
  const countUpValue = useCountUp(numericStat ?? 0, 1000);

  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8 gap-5">
      {/* Headline badge */}
      <HeadlineBadge text={slide.headline} color={slide.accentColor} />

      {/* Icon */}
      {slide.iconEmoji && (
        <motion.div
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{
            type: "spring",
            stiffness: 200,
            damping: 15,
            delay: 0.1,
          }}
          className="text-5xl"
        >
          {slide.iconEmoji}
        </motion.div>
      )}

      {/* Title */}
      <motion.h2
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.22 }}
        className="text-2xl font-bold text-white tracking-wide"
      >
        {slide.title}
      </motion.h2>

      {/* Subtitle */}
      {slide.subtitle && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.7 }}
          transition={{ delay: 0.25, duration: 0.22 }}
          className="text-sm text-white/70 -mt-2"
        >
          {slide.subtitle}
        </motion.p>
      )}

      {/* Main stat */}
      {slide.mainStat && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{
            delay: 0.3,
            type: "spring",
            stiffness: 150,
            damping: 15,
          }}
          className="py-3"
        >
          <div
            className="text-6xl sm:text-7xl font-extrabold"
            style={{ color: slide.accentColor }}
          >
            {numericStat !== null ? countUpValue : slide.mainStat}
          </div>
          {slide.mainStatLabel && (
            <p className="text-sm text-white/60 mt-2">{slide.mainStatLabel}</p>
          )}
        </motion.div>
      )}

      {/* Body (narrative text) */}
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.22 }}
        className="text-base text-white/80 leading-relaxed max-w-sm"
      >
        {slide.body}
      </motion.p>

      {/* Data point (subtle) */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.4 }}
        transition={{ delay: 0.8, duration: 0.22 }}
        className="text-xs text-white/40 font-mono mt-2"
      >
        {slide.dataPoint}
      </motion.p>
    </div>
  );
}

// ── Toast notification ──

function CopiedToast({ show }: { show: boolean }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[60] px-5 py-2.5 rounded-xl text-sm font-medium"
          style={{
            background: "rgba(255,255,255,0.15)",
            backdropFilter: "blur(20px)",
            color: "rgba(255,255,255,0.9)",
            border: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          クリップボードにコピーしました
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Narrative arc overlay (shown after last slide) ──

function NarrativeArcOverlay({
  narrative,
  onClose,
  onShare,
  accentColor,
}: {
  narrative: string;
  onClose: () => void;
  onShare: () => void;
  accentColor: string;
}) {
  const lines = narrative.split("\n\n").filter(Boolean);

  return (
    <motion.div
      className="absolute inset-0 z-30 flex flex-col items-center justify-center px-8 overflow-y-auto py-20"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      <motion.h3
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="text-xl font-bold text-white mb-8"
      >
        あなたの1週間の物語
      </motion.h3>

      <div className="max-w-sm space-y-4">
        {lines.map((line, i) => (
          <motion.p
            key={i}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 + i * 0.3, duration: 0.22 }}
            className="text-sm text-white/75 leading-relaxed"
          >
            {line}
          </motion.p>
        ))}
      </div>

      <motion.div
        className="flex gap-3 mt-10"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 + lines.length * 0.3, duration: 0.22 }}
      >
        <motion.button
          onClick={onShare}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium"
          style={{
            background: `${accentColor}33`,
            color: accentColor,
            border: `1px solid ${accentColor}55`,
          }}
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
            />
          </svg>
          物語をシェア
        </motion.button>

        <motion.button
          onClick={onClose}
          className="px-5 py-2.5 rounded-xl text-sm font-medium"
          style={{
            background: "rgba(255,255,255,0.1)",
            color: "rgba(255,255,255,0.7)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
        >
          閉じる
        </motion.button>
      </motion.div>
    </motion.div>
  );
}

// ── Main Component ──

const SLIDE_DURATION = 6000; // 6 seconds per slide (longer for narrative reading)

export default function WeeklyReportViewer({
  report,
  onClose,
  onShare,
}: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [showCopied, setShowCopied] = useState(false);
  const [showTransition, setShowTransition] = useState(false);
  const [showNarrativeArc, setShowNarrativeArc] = useState(false);
  const timerRef = useRef<number>(0);
  const lastTickRef = useRef(Date.now());
  const totalSlides = report.slides.length;

  // Mark as viewed
  useEffect(() => {
    markReportViewed(report.weekNumber, report.year);
  }, [report.weekNumber, report.year]);

  // Auto-advance timer
  useEffect(() => {
    if (isPaused || showTransition || showNarrativeArc) return;
    lastTickRef.current = Date.now();

    const tick = () => {
      const now = Date.now();
      const dt = now - lastTickRef.current;
      lastTickRef.current = now;

      setElapsed((prev) => {
        const next = prev + dt;
        if (next >= SLIDE_DURATION) {
          setCurrentIndex((idx) => {
            if (idx >= totalSlides - 1) {
              // Show narrative arc instead of closing
              setShowNarrativeArc(true);
              return idx;
            }
            // Check if next slide has transition text
            const nextSlide = report.slides[idx + 1];
            if (nextSlide?.transitionText) {
              setShowTransition(true);
            }
            return idx + 1;
          });
          return 0;
        }
        return next;
      });

      timerRef.current = requestAnimationFrame(tick);
    };

    timerRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(timerRef.current);
  }, [
    isPaused,
    showTransition,
    showNarrativeArc,
    currentIndex,
    totalSlides,
    report.slides,
  ]);

  // Reset elapsed on slide change
  useEffect(() => {
    setElapsed(0);
  }, [currentIndex]);

  // Navigation
  const goNext = useCallback(() => {
    if (showNarrativeArc) {
      onClose();
      return;
    }
    if (currentIndex >= totalSlides - 1) {
      setShowNarrativeArc(true);
    } else {
      const nextSlide = report.slides[currentIndex + 1];
      if (nextSlide?.transitionText && !showTransition) {
        setShowTransition(true);
        setCurrentIndex((i) => i + 1);
      } else {
        setCurrentIndex((i) => i + 1);
      }
    }
  }, [
    currentIndex,
    totalSlides,
    onClose,
    showNarrativeArc,
    showTransition,
    report.slides,
  ]);

  const goPrev = useCallback(() => {
    if (showNarrativeArc) {
      setShowNarrativeArc(false);
      return;
    }
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
    }
  }, [currentIndex, showNarrativeArc]);

  // Handle transition complete
  const handleTransitionComplete = useCallback(() => {
    setShowTransition(false);
  }, []);

  // Tap zones
  const handleTap = useCallback(
    (e: React.MouseEvent) => {
      if (showTransition) {
        setShowTransition(false);
        return;
      }
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const x = e.clientX - rect.left;
      if (x < rect.width * 0.3) {
        goPrev();
      } else {
        goNext();
      }
    },
    [goNext, goPrev, showTransition],
  );

  // Swipe
  const handleDragEnd = useCallback(
    (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      if (info.offset.x < -50) {
        goNext();
      } else if (info.offset.x > 50) {
        goPrev();
      }
    },
    [goNext, goPrev],
  );

  // Share — per-slide shareable card
  const handleShare = useCallback(
    async (narrativeMode = false) => {
      if (onShare && !narrativeMode) {
        onShare(currentIndex);
        return;
      }

      const text = narrativeMode
        ? report.narrativeArc + "\n\n#深層観測 #Aneurasync"
        : generateShareableCard(report, currentIndex);

      if (navigator.share) {
        try {
          await navigator.share({ text });
          return;
        } catch {
          // Fall through to clipboard
        }
      }

      try {
        await navigator.clipboard.writeText(text);
        setShowCopied(true);
        setTimeout(() => setShowCopied(false), 2000);
      } catch {
        // Clipboard API not available
      }
    },
    [currentIndex, onShare, report],
  );

  const currentSlide = report.slides[currentIndex];

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "#000" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
    >
      {/* Background gradient per slide */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentSlide.id}
          className="absolute inset-0"
          style={{ background: currentSlide.backgroundGradient }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
        />
      </AnimatePresence>

      {/* Ambient glow based on emotion */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(circle at 50% 40%, ${currentSlide.accentColor}15 0%, transparent 70%)`,
        }}
      />

      {/* Particles */}
      <SlideParticles
        color={`${currentSlide.accentColor}66`}
        emotion={currentSlide.emotion}
      />

      {/* Progress bars */}
      <div className="absolute top-[env(safe-area-inset-top,12px)] left-0 right-0 z-10 pt-3">
        <ProgressBars
          total={totalSlides}
          current={currentIndex}
          elapsed={elapsed}
          slideDuration={SLIDE_DURATION}
        />
      </div>

      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-[calc(env(safe-area-inset-top,12px)+28px)] right-4 z-20 w-9 h-9 flex items-center justify-center rounded-full"
        style={{ background: "rgba(255,255,255,0.1)" }}
        aria-label="閉じる"
      >
        <svg
          className="w-5 h-5 text-white/80"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>

      {/* Transition text overlay */}
      <AnimatePresence>
        {showTransition && currentSlide.transitionText && (
          <TransitionOverlay
            text={currentSlide.transitionText}
            onComplete={handleTransitionComplete}
          />
        )}
      </AnimatePresence>

      {/* Narrative arc overlay (after last slide) */}
      <AnimatePresence>
        {showNarrativeArc && report.narrativeArc && (
          <NarrativeArcOverlay
            narrative={report.narrativeArc}
            onClose={onClose}
            onShare={() => void handleShare(true)}
            accentColor={currentSlide.accentColor}
          />
        )}
      </AnimatePresence>

      {/* Slide content with drag and tap */}
      {!showNarrativeArc && (
        <motion.div
          className="absolute inset-0 z-[5] flex items-center justify-center cursor-pointer"
          onClick={handleTap}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.2}
          onDragEnd={handleDragEnd}
          onPointerDown={() => setIsPaused(true)}
          onPointerUp={() => setIsPaused(false)}
          onPointerCancel={() => setIsPaused(false)}
        >
          <AnimatePresence mode="wait">
            {!showTransition && (
              <motion.div
                key={currentSlide.id}
                className="w-full h-full"
                initial={{ opacity: 0, x: 60 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -60 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
              >
                <SlideContent slide={currentSlide} />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Bottom controls */}
      {!showNarrativeArc && (
        <div className="absolute bottom-[env(safe-area-inset-bottom,16px)] left-0 right-0 z-10 pb-4 px-6 flex items-center justify-between">
          {/* Slide counter + emotion label */}
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-white/40 font-mono">
              {currentIndex + 1}/{totalSlides}
            </span>
          </div>

          {/* Share button */}
          <motion.button
            onClick={(e) => {
              e.stopPropagation();
              void handleShare();
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium"
            style={{
              background: "rgba(255,255,255,0.1)",
              backdropFilter: "blur(12px)",
              color: "rgba(255,255,255,0.85)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
              />
            </svg>
            シェア
          </motion.button>
        </div>
      )}

      <CopiedToast show={showCopied} />
    </motion.div>
  );
}
