"use client";

import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { trackFeatureView } from "@/lib/stargazer/trackClient";
import {
  GlassCard,
  GlassBadge,
  FadeInView,
  LightBackground,
  Skeleton,
} from "@/components/ui/glassmorphism-design";
import {
  generateGhostResonance,
  type GhostResonanceInput,
  type GhostResonanceEntry,
  type GhostCategory,
} from "@/lib/stargazer/ghostResonance";

// ---------------------------------------------------------------------------
// Mock profile
// ---------------------------------------------------------------------------
const MOCK_INPUT_BASE: Omit<GhostResonanceInput, "observationDepth"> = {
  archetypeCode: "PEA",
  shadowCode: "BWD",
  axisScores: {
    cautious_vs_bold: 0.2,
    change_embrace_vs_resist: -0.3,
    perfectionist_vs_pragmatic: -0.4,
    independence_vs_harmony: 0.1,
    direct_vs_diplomatic: 0.15,
    analytical_vs_intuitive: 0.35,
    plan_vs_spontaneous: -0.1,
    introvert_vs_extrovert: -0.2,
    emotional_variability: 0.25,
  },
  contradictions: [
    { axisA: "cautious_vs_bold", axisB: "perfectionist_vs_pragmatic", tension: 0.7 },
    { axisA: "analytical_vs_intuitive", axisB: "plan_vs_spontaneous", tension: 0.5 },
    { axisA: "independence_vs_harmony", axisB: "direct_vs_diplomatic", tension: 0.3 },
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const CATEGORY_META: Record<GhostCategory, { label: string; color: "info" | "warning" | "success" | "default"; hue: number }> = {
  discovery:    { label: "発見",     color: "info",    hue: 230 },
  struggle:     { label: "葛藤",     color: "warning", hue: 30 },
  breakthrough: { label: "突破",     color: "success", hue: 150 },
  pattern:      { label: "パターン", color: "default", hue: 270 },
  mirror:       { label: "鏡像",     color: "info",    hue: 200 },
  wound:        { label: "深層の核", color: "warning", hue: 350 },
  season:       { label: "季節",     color: "success", hue: 120 },
  echo:         { label: "残響",     color: "default", hue: 280 },
};

function generateGhosts(count: number): GhostResonanceEntry[] {
  const entries: GhostResonanceEntry[] = [];
  const depths = [15, 30, 45, 55, 65, 75, 85];
  for (let i = 0; i < count; i++) {
    const depth = depths[i % depths.length]!;
    const input: GhostResonanceInput = { ...MOCK_INPUT_BASE, observationDepth: depth };
    if (i > 0 && MOCK_INPUT_BASE.contradictions) {
      const rotated = [...MOCK_INPUT_BASE.contradictions];
      for (let r = 0; r < i % rotated.length; r++) {
        rotated.push(rotated.shift()!);
      }
      input.contradictions = rotated;
    }
    const entry = generateGhostResonance(input);
    entries.push({ ...entry, id: `${entry.id}_${i}` });
  }
  const seen = new Set<string>();
  return entries.filter((e) => {
    if (seen.has(e.insight)) return false;
    seen.add(e.insight);
    return true;
  });
}

function ghostPopulation(hash: string): number {
  let h = 0;
  for (let i = 0; i < hash.length; i++) {
    h = ((h << 5) - h + hash.charCodeAt(i)) | 0;
  }
  return 3 + ((h >>> 0) % 42);
}

// ---------------------------------------------------------------------------
// Ethereal Particle Field (background)
// ---------------------------------------------------------------------------
function EtherealField() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {Array.from({ length: 12 }).map((_, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            width: 2 + (i % 3) * 2,
            height: 2 + (i % 3) * 2,
            background: `rgba(168,85,247,${0.08 + (i % 4) * 0.03})`,
            filter: "blur(1px)",
            left: `${(i * 8.3) % 100}%`,
            top: `${(i * 13.7) % 100}%`,
          }}
          animate={{
            y: [0, -30 - i * 5, 0],
            x: [0, (i % 2 === 0 ? 15 : -15), 0],
            opacity: [0.05, 0.2, 0.05],
          }}
          transition={{
            duration: 8 + i * 2,
            repeat: Infinity,
            ease: "easeInOut",
            delay: i * 0.8,
          }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ghost Silhouette SVG
// ---------------------------------------------------------------------------
function GhostSilhouette({ similarity, index }: { similarity: number; index: number }) {
  const opacity = 0.04 + similarity * 0.12;
  return (
    <svg
      width="40"
      height="50"
      viewBox="0 0 40 50"
      className="absolute -top-2 -right-2 pointer-events-none"
      style={{ opacity }}
    >
      <motion.path
        d="M20 5 C28 5 35 14 35 24 L35 40 C35 42 33 44 31 42 C29 40 27 42 25 44 C23 46 21 44 20 42 C19 44 17 46 15 44 C13 42 11 40 9 42 C7 44 5 42 5 40 L5 24 C5 14 12 5 20 5Z"
        fill={`rgba(168,85,247,${opacity})`}
        animate={{
          d: [
            "M20 5 C28 5 35 14 35 24 L35 40 C35 42 33 44 31 42 C29 40 27 42 25 44 C23 46 21 44 20 42 C19 44 17 46 15 44 C13 42 11 40 9 42 C7 44 5 42 5 40 L5 24 C5 14 12 5 20 5Z",
            "M20 6 C28 6 34 15 34 25 L34 41 C34 43 32 43 30 41 C28 39 26 43 24 45 C22 47 20 43 19 41 C18 43 16 47 14 45 C12 43 10 39 8 41 C6 43 4 43 4 41 L4 25 C4 15 12 6 20 6Z",
            "M20 5 C28 5 35 14 35 24 L35 40 C35 42 33 44 31 42 C29 40 27 42 25 44 C23 46 21 44 20 42 C19 44 17 46 15 44 C13 42 11 40 9 42 C7 44 5 42 5 40 L5 24 C5 14 12 5 20 5Z",
          ],
        }}
        transition={{ duration: 4 + index * 0.5, repeat: Infinity, ease: "easeInOut" }}
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Ghost Card (enhanced ethereal feel)
// ---------------------------------------------------------------------------
function GhostCard({
  ghost,
  meta,
  population,
  index,
}: {
  ghost: GhostResonanceEntry;
  meta: { label: string; color: "info" | "warning" | "success" | "default"; hue: number };
  population: number;
  index: number;
}) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <motion.div
      animate={{
        y: [0, -4, 0],
      }}
      transition={{
        duration: 5 + index * 0.7,
        repeat: Infinity,
        ease: "easeInOut",
        delay: index * 1,
      }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
    >
      <GlassCard
        variant="gradient"
        className="relative overflow-hidden"
        style={{
          background: `linear-gradient(${135 + index * 15}deg, rgba(255,255,255,0.75), rgba(168,85,247,${0.03 + index * 0.01}), rgba(255,255,255,0.6))`,
        }}
      >
        {/* Ghost silhouette */}
        <GhostSilhouette similarity={ghost.similarity} index={index} />

        {/* Ethereal glow -- responds to hover */}
        <motion.div
          className="absolute -inset-px rounded-3xl pointer-events-none"
          style={{
            background: `radial-gradient(ellipse at ${30 + index * 10}% ${40 + index * 5}%, hsla(${meta.hue},60%,70%,0.08), transparent 70%)`,
          }}
          animate={{
            opacity: isHovered ? 0.25 : 0.08,
          }}
          transition={{ duration: 0.22 }}
        />

        {/* Shimmer line at top */}
        <motion.div
          className="absolute top-0 left-0 right-0 h-px pointer-events-none"
          style={{
            background: `linear-gradient(90deg, transparent, hsla(${meta.hue},50%,70%,${isHovered ? 0.3 : 0.1}), transparent)`,
          }}
          animate={{
            opacity: [0.3, 0.7, 0.3],
          }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        />

        <div className="relative z-10">
          {/* Top row */}
          <div className="flex items-center justify-between mb-3">
            <GlassBadge variant={meta.color} size="sm">
              {meta.label}
            </GlassBadge>
            <span className="text-xs text-slate-300 font-mono tracking-wider">
              #{ghost.patternHash}
            </span>
          </div>

          {/* Insight -- the core message from the parallel self */}
          <motion.p
            className="text-sm text-slate-700 leading-relaxed"
            style={{ lineHeight: 1.75 }}
          >
            {ghost.insight}
          </motion.p>

          {/* Resonance visualization */}
          <div className="mt-4 pt-3 border-t border-slate-200/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {/* Ghostly avatars */}
                <div className="flex -space-x-1.5">
                  {Array.from({ length: Math.min(population, 5) }).map((_, i) => (
                    <motion.div
                      key={i}
                      className="w-5 h-5 rounded-full border border-white/60"
                      style={{
                        background: `linear-gradient(135deg, hsla(${meta.hue + i * 30},40%,80%,0.5), hsla(${meta.hue + i * 20},30%,90%,0.3))`,
                      }}
                      animate={{
                        opacity: [0.4, 0.7, 0.4],
                      }}
                      transition={{
                        duration: 3,
                        delay: i * 0.3,
                        repeat: Infinity,
                      }}
                    />
                  ))}
                  {population > 5 && (
                    <span className="text-[10px] text-slate-400 ml-1.5 self-center">
                      +{population - 5}
                    </span>
                  )}
                </div>
                <span className="text-xs text-slate-400">
                  {population}人の共鳴者
                </span>
              </div>

              {/* Resonance bar */}
              <div className="flex items-center gap-2">
                <div className="w-16 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{
                      background: `linear-gradient(90deg, hsla(${meta.hue},50%,65%,0.5), hsla(${meta.hue},60%,55%,0.8))`,
                    }}
                    initial={{ width: "0%" }}
                    animate={{ width: `${ghost.similarity * 100}%` }}
                    transition={{ delay: 0.5 + index * 0.2, duration: 0.4, ease: "easeOut" }}
                  />
                </div>
                <span
                  className="text-xs font-medium font-mono-sg"
                  style={{
                    color: `hsla(${meta.hue},50%,45%,${0.5 + ghost.similarity * 0.5})`,
                  }}
                >
                  {Math.round(ghost.similarity * 100)}%
                </span>
              </div>
            </div>
          </div>
        </div>
      </GlassCard>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function GhostClient() {
  const [ready, setReady] = useState(false);
  const [ghosts, setGhosts] = useState<GhostResonanceEntry[]>([]);

  useEffect(() => { trackFeatureView("ghost_resonance"); }, []);

  // APIからGhost Resonanceデータを取得。失敗時はローカル生成にフォールバック
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/stargazer/ghost-resonance");
        if (res.ok) {
          const data = await res.json();
          if (!cancelled && data.resonances?.length) {
            // APIレスポンスをGhostResonanceEntry形式に変換
            const entries: GhostResonanceEntry[] = data.resonances.map((r: Record<string, unknown>) => ({
              id: r.id as string,
              patternHash: r.ghost_pattern_hash as string ?? "",
              patternName: r.pattern_name as string ?? "",
              category: (r.category as GhostCategory) ?? "pattern",
              insight: r.ghost_insight as string ?? "",
              resonanceContext: r.resonance_context as string ?? "",
              similarity: (r.pattern_similarity as number) ?? 0.5,
              ghostPopulation: (r.ghost_population as number) ?? 10,
            }));
            setGhosts(entries);
            setReady(true);
            return;
          }
        }
      } catch { /* fall through to local generation */ }

      // フォールバック: ローカル生成
      if (!cancelled) {
        setGhosts(generateGhosts(7));
        setReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (ghosts.length > 0 && !ready) {
      const t = setTimeout(() => setReady(true), 800);
      return () => clearTimeout(t);
    }
  }, [ghosts, ready]);

  return (
    <LightBackground>
      <div className="relative max-w-2xl mx-auto px-4 pt-6 pb-32">
        {/* Background ethereal particles */}
        <EtherealField />

        {/* Header */}
        <FadeInView>
          <div className="flex items-center gap-3 mb-2 relative z-10">
            <Link
              href="/stargazer"
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <h1 className="text-2xl font-bold text-slate-900 font-display">
              似た星の共鳴
            </h1>
          </div>
        </FadeInView>

        {/* Hero -- ethereal entrance */}
        <FadeInView delay={0.1}>
          <div className="text-center py-10 relative z-10">
            {/* Ghostly orb */}
            <motion.div
              className="w-20 h-20 mx-auto mb-6 rounded-full relative"
              style={{
                background: "radial-gradient(circle, rgba(168,85,247,0.08), rgba(168,85,247,0.02))",
                border: "1px solid rgba(168,85,247,0.1)",
              }}
            >
              <motion.div
                className="absolute inset-0 rounded-full"
                style={{ border: "1px solid rgba(168,85,247,0.06)" }}
                animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0.1, 0.3] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              />
              <motion.div
                className="absolute inset-0 rounded-full"
                style={{ border: "1px solid rgba(168,85,247,0.04)" }}
                animate={{ scale: [1, 1.6, 1], opacity: [0.2, 0.05, 0.2] }}
                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <motion.span
                  className="text-3xl"
                  animate={{ opacity: [0.5, 0.9, 0.5] }}
                  transition={{ duration: 3, repeat: Infinity }}
                >
                  &#x1F47B;
                </motion.span>
              </div>
            </motion.div>

            <motion.p
              className="text-lg font-bold text-slate-700 leading-relaxed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1.5 }}
            >
              もし別の自分だったら
            </motion.p>
            <motion.p
              className="text-sm text-slate-400 mt-2 max-w-xs mx-auto leading-relaxed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1.5, delay: 0.6 }}
            >
              あなたと似た判断パターンを持つ匿名の存在が伝える、もうひとつの可能性の記録
            </motion.p>
          </div>
        </FadeInView>

        {/* Ghost Entries */}
        <div className="relative z-10">
          {!ready ? (
            <div className="space-y-4">
              {[0, 1, 2].map((i) => (
                <GlassCard key={i}>
                  <Skeleton className="h-4 w-20 mb-3" />
                  <Skeleton className="h-4 w-full mb-2" />
                  <Skeleton className="h-4 w-3/4" />
                </GlassCard>
              ))}
            </div>
          ) : (
            <div className="space-y-5">
              {ghosts.map((ghost, idx) => {
                const meta = CATEGORY_META[ghost.category] ?? { label: ghost.category, color: "default" as const, hue: 0 };
                const population = ghostPopulation(ghost.patternHash);
                return (
                  <motion.div
                    key={ghost.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      delay: idx * 0.2,
                      type: "spring",
                      stiffness: 150,
                      damping: 20,
                    }}
                  >
                    <GhostCard
                      ghost={ghost}
                      meta={meta}
                      population={population}
                      index={idx}
                    />
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </LightBackground>
  );
}
