// app/stargazer/_components/PredictionHitCelebration.tsx
// 予測的中リアルタイム演出 — 3段階セレブレーション（衝撃波 -> 的中表示 -> フェードアウト）
// 宇宙的・瞑想的トーンを維持しつつ、的中の達成感を演出
"use client";

import {
  useEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
} from "react";
import { motion, AnimatePresence } from "framer-motion";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface PredictionHitCelebrationProps {
  /** 的中した予測文 */
  prediction: string;
  /** 更新後の的中率 (0-1) */
  newAccuracy: number;
  /** カテゴリ */
  category: string;
  /** 連続的中回数 */
  consecutiveHits?: number;
  /** 閉じるコールバック */
  onDismiss: () => void;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const AUTO_DISMISS_MS = 5000;
const PHASE_SHOCKWAVE_END = 1000;
const PHASE_DISPLAY_END = 3000;
const PARTICLE_COUNT = 70;

const GOLD_PALETTE = [
  "rgba(255,215,0,0.9)",
  "rgba(255,200,50,0.85)",
  "rgba(240,180,40,0.8)",
  "rgba(255,230,100,0.75)",
  "rgba(220,190,60,0.7)",
  "rgba(255,240,150,0.6)",
];

const AURORA_PALETTE = [
  "rgba(120,220,255,0.8)",
  "rgba(200,120,255,0.75)",
  "rgba(255,180,120,0.7)",
  "rgba(100,255,200,0.65)",
  "rgba(255,140,200,0.6)",
  "rgba(180,255,140,0.55)",
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Gold particle definitions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface GoldParticle {
  id: number;
  x: number;
  endY: number;
  size: number;
  color: string;
  delay: number;
  duration: number;
  drift: number;
  rotation: number;
  type: "dot" | "star" | "ring";
}

function generateGoldParticles(
  count: number,
  isAurora: boolean,
): GoldParticle[] {
  const palette = isAurora ? AURORA_PALETTE : GOLD_PALETTE;
  const particles: GoldParticle[] = [];

  for (let i = 0; i < count; i++) {
    particles.push({
      id: i,
      x: Math.random() * 100,
      endY: 60 + Math.random() * 50,
      size: 2 + Math.random() * 4,
      color: palette[i % palette.length],
      delay: Math.random() * 2.0,
      duration: 2.0 + Math.random() * 1.5,
      drift: (Math.random() - 0.5) * 30,
      rotation: Math.random() * 720 - 360,
      type: i % 9 === 0 ? "star" : i % 5 === 0 ? "ring" : "dot",
    });
  }

  return particles;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Particle renderer
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function GoldParticleElement({ particle }: { particle: GoldParticle }) {
  const baseStyle = {
    left: `${particle.x}%`,
    top: "-4%",
  };

  if (particle.type === "star") {
    return (
      <motion.div
        className="absolute"
        style={{ ...baseStyle, width: particle.size * 2.5, height: particle.size * 2.5 }}
        initial={{ y: 0, x: 0, opacity: 0, scale: 0, rotate: 0 }}
        animate={{
          y: `${particle.endY}vh`,
          x: particle.drift,
          opacity: [0, 1, 1, 0.8, 0],
          scale: [0, 1.2, 0.9, 1.1, 0.3],
          rotate: particle.rotation,
        }}
        transition={{
          duration: particle.duration,
          delay: particle.delay,
          ease: [0.22, 1, 0.36, 1],
        }}
      >
        <svg
          width={particle.size * 2.5}
          height={particle.size * 2.5}
          viewBox="0 0 20 20"
        >
          <path
            d="M10 1 L12.5 7.5 L19 10 L12.5 12.5 L10 19 L7.5 12.5 L1 10 L7.5 7.5 Z"
            fill={particle.color}
          />
        </svg>
      </motion.div>
    );
  }

  if (particle.type === "ring") {
    return (
      <motion.div
        className="absolute rounded-full"
        style={{
          ...baseStyle,
          width: particle.size * 2,
          height: particle.size * 2,
          border: `1px solid ${particle.color}`,
        }}
        initial={{ y: 0, x: 0, opacity: 0, scale: 0 }}
        animate={{
          y: `${particle.endY}vh`,
          x: particle.drift,
          opacity: [0, 0.9, 0.7, 0],
          scale: [0, 1.5, 1.2, 0.4],
        }}
        transition={{
          duration: particle.duration,
          delay: particle.delay,
          ease: [0.22, 1, 0.36, 1],
        }}
      />
    );
  }

  // Default: dot
  return (
    <motion.div
      className="absolute rounded-full"
      style={{
        ...baseStyle,
        width: particle.size,
        height: particle.size,
        background: particle.color,
        boxShadow: `0 0 ${particle.size * 3}px ${particle.color}`,
      }}
      initial={{ y: 0, x: 0, opacity: 0, scale: 0 }}
      animate={{
        y: `${particle.endY}vh`,
        x: particle.drift,
        opacity: [0, 1, 0.9, 0],
        scale: [0, 1.3, 1, 0.2],
      }}
      transition={{
        duration: particle.duration,
        delay: particle.delay,
        ease: [0.22, 1, 0.36, 1],
      }}
    />
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CountUp animation component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function CountUp({
  target,
  duration = 1.5,
  delay = 0,
}: {
  target: number;
  duration?: number;
  delay?: number;
}) {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number>(0);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    let started = false;
    const delayTimeout = window.setTimeout(() => {
      started = true;
      startTimeRef.current = null;

      const animate = (timestamp: number) => {
        if (startTimeRef.current === null) {
          startTimeRef.current = timestamp;
        }
        const elapsed = timestamp - startTimeRef.current;
        const progress = Math.min(elapsed / (duration * 1000), 1);
        // Ease-out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        setValue(Math.round(eased * target));

        if (progress < 1) {
          rafRef.current = requestAnimationFrame(animate);
        }
      };

      rafRef.current = requestAnimationFrame(animate);
    }, delay * 1000);

    return () => {
      clearTimeout(delayTimeout);
      if (started) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [target, duration, delay]);

  return <>{value}</>;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Shockwave ripple component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function ShockwaveRipple({ delay }: { delay: number }) {
  return (
    <motion.div
      className="absolute rounded-full"
      style={{
        left: "50%",
        top: "50%",
        width: 40,
        height: 40,
        marginLeft: -20,
        marginTop: -20,
        border: "2px solid rgba(255,215,0,0.4)",
      }}
      initial={{ scale: 0, opacity: 0.8 }}
      animate={{ scale: 15, opacity: 0 }}
      transition={{
        duration: 1.2,
        delay,
        ease: [0.22, 1, 0.36, 1],
      }}
    />
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Aurora background effect (for consecutive hits)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function AuroraEffect() {
  return (
    <motion.div
      className="absolute inset-0 pointer-events-none"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1.0, delay: 0.5 }}
    >
      <motion.div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(135deg, rgba(120,180,255,0.08) 0%, rgba(200,120,255,0.06) 25%, rgba(255,180,120,0.05) 50%, rgba(100,255,200,0.06) 75%, rgba(255,140,200,0.08) 100%)",
        }}
        animate={{
          background: [
            "linear-gradient(135deg, rgba(120,180,255,0.08) 0%, rgba(200,120,255,0.06) 25%, rgba(255,180,120,0.05) 50%, rgba(100,255,200,0.06) 75%, rgba(255,140,200,0.08) 100%)",
            "linear-gradient(225deg, rgba(255,140,200,0.08) 0%, rgba(100,255,200,0.06) 25%, rgba(255,180,120,0.05) 50%, rgba(200,120,255,0.06) 75%, rgba(120,180,255,0.08) 100%)",
            "linear-gradient(135deg, rgba(120,180,255,0.08) 0%, rgba(200,120,255,0.06) 25%, rgba(255,180,120,0.05) 50%, rgba(100,255,200,0.06) 75%, rgba(255,140,200,0.08) 100%)",
          ],
        }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Flowing aurora bands */}
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="absolute h-[30%] w-[120%] -left-[10%] rounded-full"
          style={{
            top: `${20 + i * 20}%`,
            background: `linear-gradient(90deg, transparent 0%, ${
              AURORA_PALETTE[i * 2]
            } 30%, ${AURORA_PALETTE[i * 2 + 1]} 70%, transparent 100%)`,
            filter: "blur(40px)",
            opacity: 0.12,
          }}
          animate={{
            x: ["-5%", "5%", "-5%"],
            opacity: [0.08, 0.15, 0.08],
          }}
          transition={{
            duration: 2.5 + i * 0.5,
            repeat: Infinity,
            ease: "easeInOut",
            delay: i * 0.3,
          }}
        />
      ))}
    </motion.div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function PredictionHitCelebration({
  prediction,
  newAccuracy,
  category,
  consecutiveHits,
  onDismiss,
}: PredictionHitCelebrationProps) {
  const [show, setShow] = useState(true);
  const [phase, setPhase] = useState<"shockwave" | "display" | "fadeout">(
    "shockwave",
  );
  const dismissedRef = useRef(false);
  const isConsecutive = (consecutiveHits ?? 0) >= 3;

  const particles = useMemo(
    () => generateGoldParticles(PARTICLE_COUNT, isConsecutive),
    [isConsecutive],
  );

  // Sound integration: try to import useStargazerSounds
  const soundTriggered = useRef(false);
  useEffect(() => {
    if (soundTriggered.current) return;
    soundTriggered.current = true;
    // Dynamic import to avoid hard dependency
    import("@/hooks/useStargazerSounds").catch(() => {
      // Hook not available — sounds will not play
    });
  }, []);

  // Phase progression
  useEffect(() => {
    const t1 = window.setTimeout(
      () => setPhase("display"),
      PHASE_SHOCKWAVE_END,
    );
    const t2 = window.setTimeout(
      () => setPhase("fadeout"),
      PHASE_DISPLAY_END,
    );
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  // Auto-dismiss
  useEffect(() => {
    const timer = window.setTimeout(() => {
      handleDismiss();
    }, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDismiss = useCallback(() => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    setShow(false);
    // Wait for exit animation
    setTimeout(() => onDismiss(), 600);
  }, [onDismiss]);

  const accuracyPercent = Math.round(newAccuracy * 100);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          onClick={handleDismiss}
          role="dialog"
          aria-label="予測的中"
        >
          {/* ── Phase 1: Background — deep black to gold gradient ── */}
          <motion.div
            className="absolute inset-0"
            initial={{ background: "rgba(5,5,15,0.95)" }}
            animate={{
              background:
                phase === "fadeout"
                  ? "rgba(5,5,15,0.0)"
                  : "rgba(5,5,15,0.92)",
            }}
            transition={{ duration: phase === "fadeout" ? 2.0 : 0.3 }}
          />

          {/* Gold radial glow */}
          <motion.div
            className="absolute inset-0"
            style={{
              background: isConsecutive
                ? "radial-gradient(ellipse at 50% 40%, rgba(200,160,255,0.12) 0%, rgba(120,180,255,0.06) 30%, transparent 65%)"
                : "radial-gradient(ellipse at 50% 40%, rgba(255,215,0,0.12) 0%, rgba(220,180,60,0.06) 30%, transparent 65%)",
            }}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{
              opacity: phase === "fadeout" ? 0 : 1,
              scale: phase === "shockwave" ? 1.5 : 1.2,
            }}
            transition={{ duration: 1.0, ease: "easeOut" }}
          />

          {/* ── Aurora effect for consecutive hits ── */}
          {isConsecutive && <AuroraEffect />}

          {/* ── Phase 1: Shockwave ripples ── */}
          <ShockwaveRipple delay={0} />
          <ShockwaveRipple delay={0.15} />
          <ShockwaveRipple delay={0.3} />

          {/* White flash */}
          <motion.div
            className="absolute inset-0"
            style={{ background: "rgba(255,255,255,1)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.25, 0] }}
            transition={{ duration: 0.22, ease: "easeOut" }}
          />

          {/* ── Phase 2: Gold particles raining down ── */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {particles.map((p) => (
              <GoldParticleElement key={p.id} particle={p} />
            ))}
          </div>

          {/* ── Phase 2: Central content ── */}
          <motion.div
            className="relative z-10 flex flex-col items-center text-center px-8 max-w-md"
            initial={{ opacity: 0, y: 30, scale: 0.8 }}
            animate={{
              opacity: phase === "fadeout" ? 0 : 1,
              y: phase === "fadeout" ? -20 : 0,
              scale: phase === "fadeout" ? 0.95 : 1,
            }}
            transition={{
              delay: phase === "shockwave" ? 0.6 : 0,
              duration: phase === "fadeout" ? 1.5 : 0.7,
              type: "spring",
              stiffness: 180,
              damping: 20,
            }}
          >
            {/* "的中" main text */}
            <motion.div
              className="relative mb-4"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{
                delay: 0.7,
                duration: 0.22,
                type: "spring",
                stiffness: 250,
                damping: 15,
              }}
            >
              <h1
                className="text-6xl font-bold tracking-wider"
                style={{
                  fontFamily: "'Cormorant Garamond', 'Georgia', serif",
                  color: isConsecutive
                    ? "rgba(200,180,255,0.95)"
                    : "rgba(255,215,0,0.95)",
                  textShadow: isConsecutive
                    ? "0 0 40px rgba(200,160,255,0.5), 0 0 80px rgba(120,180,255,0.3), 0 2px 4px rgba(0,0,0,0.3)"
                    : "0 0 40px rgba(255,215,0,0.5), 0 0 80px rgba(255,180,0,0.3), 0 2px 4px rgba(0,0,0,0.3)",
                }}
              >
                的中
              </h1>

              {/* Glow pulse behind text */}
              <motion.div
                className="absolute inset-0 -z-10"
                style={{
                  background: isConsecutive
                    ? "radial-gradient(circle, rgba(200,160,255,0.2) 0%, transparent 70%)"
                    : "radial-gradient(circle, rgba(255,215,0,0.2) 0%, transparent 70%)",
                  filter: "blur(20px)",
                }}
                animate={{
                  scale: [1, 1.3, 1],
                  opacity: [0.6, 1, 0.6],
                }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              />
            </motion.div>

            {/* Consecutive hits badge */}
            {isConsecutive && consecutiveHits && (
              <motion.div
                className="mb-3 px-4 py-1.5 rounded-full"
                style={{
                  background: "rgba(200,160,255,0.15)",
                  border: "1px solid rgba(200,160,255,0.3)",
                }}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 1.0, duration: 0.22 }}
              >
                <span
                  className="text-sm font-bold tracking-wide"
                  style={{
                    fontFamily: "'Cormorant Garamond', 'Georgia', serif",
                    color: "rgba(200,180,255,0.9)",
                  }}
                >
                  {consecutiveHits} 連続的中
                </span>
              </motion.div>
            )}

            {/* Category label */}
            <motion.div
              className="mb-4 px-3 py-1 rounded-full"
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.9, duration: 0.22 }}
            >
              <span
                className="text-xs font-medium"
                style={{ color: "rgba(255,255,255,0.5)" }}
              >
                {category}
              </span>
            </motion.div>

            {/* Prediction text highlighted */}
            <motion.p
              className="text-base leading-relaxed font-medium mb-6 px-4"
              style={{
                fontFamily: "'Cormorant Garamond', 'Georgia', serif",
                color: "rgba(255,255,255,0.85)",
                textShadow: "0 1px 3px rgba(0,0,0,0.5)",
              }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.1, duration: 0.22 }}
            >
              &ldquo;{prediction}&rdquo;
            </motion.p>

            {/* Accuracy counter */}
            <motion.div
              className="flex items-center gap-3"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.3, duration: 0.22 }}
            >
              <div className="text-center">
                <p
                  className="text-xs font-medium mb-1"
                  style={{ color: "rgba(255,255,255,0.4)" }}
                >
                  的中率
                </p>
                <div
                  className="text-3xl font-bold tabular-nums"
                  style={{
                    fontFamily: "'Cormorant Garamond', 'Georgia', serif",
                    color: isConsecutive
                      ? "rgba(200,180,255,0.9)"
                      : "rgba(255,215,0,0.9)",
                    textShadow: isConsecutive
                      ? "0 0 20px rgba(200,160,255,0.4)"
                      : "0 0 20px rgba(255,215,0,0.4)",
                  }}
                >
                  <CountUp target={accuracyPercent} duration={1.5} delay={1.5} />
                  <span className="text-lg ml-0.5">%</span>
                </div>
              </div>
            </motion.div>

            {/* Tap to dismiss hint */}
            <motion.p
              className="mt-8 text-xs"
              style={{ color: "rgba(255,255,255,0.2)" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 2.5, duration: 0.22 }}
            >
              タップして閉じる
            </motion.p>
          </motion.div>

          {/* ── Phase 3: Gold afterglow ── */}
          {phase === "fadeout" && (
            <motion.div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: isConsecutive
                  ? "radial-gradient(ellipse at 50% 50%, rgba(200,160,255,0.06) 0%, transparent 50%)"
                  : "radial-gradient(ellipse at 50% 50%, rgba(255,215,0,0.06) 0%, transparent 50%)",
              }}
              initial={{ opacity: 1 }}
              animate={{ opacity: 0 }}
              transition={{ duration: 2.0 }}
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
