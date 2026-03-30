// app/stargazer/_components/SkeletonLoaders.tsx
// Stargazer専用スケルトンローダー — グラスモーフィズム + シマー + 星の粒子
"use client";

import { useRef } from "react";
import { motion } from "framer-motion";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Shared shimmer + sparkle primitives
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function ShimmerOverlay() {
  return (
    <motion.div
      className="absolute inset-0 pointer-events-none"
      style={{
        background:
          "linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.06) 48%, rgba(255,255,255,0.10) 50%, rgba(255,255,255,0.06) 52%, transparent 70%)",
        backgroundSize: "250% 100%",
      }}
      animate={{ backgroundPosition: ["-100% 0%", "200% 0%"] }}
      transition={{ duration: 2.2, repeat: Infinity, ease: "linear" }}
    />
  );
}

function SparkleParticles({ count = 5 }: { count?: number }) {
  const particles = useRef(
    Array.from({ length: count }, (_, i) => ({
      id: i,
      x: 10 + Math.random() * 80,
      y: 10 + Math.random() * 80,
      delay: Math.random() * 4,
      duration: 2 + Math.random() * 3,
      size: 1 + Math.random() * 2,
    })),
  ).current;

  return (
    <>
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full pointer-events-none"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            background: "rgba(190,170,110,0.5)",
          }}
          animate={{
            opacity: [0, 0.7, 0],
            scale: [0.3, 1.3, 0.3],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </>
  );
}

function SkeletonBar({
  width = "100%",
  height = 12,
  rounded = "rounded-lg",
  className = "",
}: {
  width?: string | number;
  height?: number;
  rounded?: string;
  className?: string;
}) {
  return (
    <div
      className={`${rounded} ${className}`}
      style={{
        width,
        height,
        background: "rgba(148,163,184,0.08)",
      }}
    />
  );
}

function SkeletonCircle({ size = 48 }: { size?: number }) {
  return (
    <div
      className="rounded-full"
      style={{
        width: size,
        height: size,
        background: "rgba(148,163,184,0.08)",
      }}
    />
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Glass skeleton wrapper
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function GlassSkeletonCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      className={`relative overflow-hidden rounded-3xl ${className}`}
      style={{
        background: "rgba(255,255,255,0.04)",
        backdropFilter: "blur(20px)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
      animate={{ opacity: [0.6, 0.9, 0.6] }}
      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
    >
      <ShimmerOverlay />
      <SparkleParticles count={4} />
      {children}
    </motion.div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// StarMapSkeleton
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function StarMapSkeleton() {
  return (
    <div className="space-y-4">
      {/* Archetype card skeleton */}
      <GlassSkeletonCard className="p-6">
        <div className="flex items-center gap-4 mb-5">
          <SkeletonCircle size={56} />
          <div className="flex-1 space-y-2">
            <SkeletonBar width="60%" height={16} />
            <SkeletonBar width="40%" height={10} />
          </div>
        </div>

        {/* Radar chart skeleton — hexagonal placeholder */}
        <div className="flex items-center justify-center py-8">
          <div className="relative w-40 h-40">
            <svg
              viewBox="0 0 200 200"
              className="w-full h-full"
              style={{ opacity: 0.15 }}
            >
              <polygon
                points="100,20 175,65 175,135 100,180 25,135 25,65"
                fill="none"
                stroke="rgba(148,163,184,0.3)"
                strokeWidth="1"
              />
              <polygon
                points="100,50 155,77 155,123 100,150 45,123 45,77"
                fill="none"
                stroke="rgba(148,163,184,0.2)"
                strokeWidth="1"
              />
              <polygon
                points="100,80 130,93 130,107 100,120 70,107 70,93"
                fill="rgba(148,163,184,0.05)"
                stroke="rgba(148,163,184,0.15)"
                strokeWidth="1"
              />
            </svg>
            <SparkleParticles count={3} />
          </div>
        </div>

        {/* Trait labels */}
        <div className="grid grid-cols-3 gap-2 mt-2">
          {[1, 2, 3].map((i) => (
            <SkeletonBar key={i} height={28} rounded="rounded-xl" />
          ))}
        </div>
      </GlassSkeletonCard>

      {/* Secondary cards */}
      <div className="grid grid-cols-2 gap-3">
        {[1, 2].map((i) => (
          <GlassSkeletonCard key={i} className="p-4">
            <SkeletonBar width="70%" height={12} className="mb-3" />
            <SkeletonBar width="50%" height={24} className="mb-2" />
            <SkeletonBar width="90%" height={8} />
          </GlassSkeletonCard>
        ))}
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ObserveSkeleton
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function ObserveSkeleton() {
  return (
    <div className="space-y-4">
      {/* Question card */}
      <GlassSkeletonCard className="p-6">
        <SkeletonBar width="30%" height={10} className="mb-4" />
        <SkeletonBar width="90%" height={16} className="mb-2" />
        <SkeletonBar width="75%" height={16} className="mb-6" />

        {/* Answer options */}
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="rounded-2xl p-4"
              style={{
                background: "rgba(148,163,184,0.04)",
                border: "1px solid rgba(148,163,184,0.06)",
              }}
            >
              <SkeletonBar width={`${50 + Math.random() * 40}%`} height={12} />
            </div>
          ))}
        </div>
      </GlassSkeletonCard>

      {/* Progress bar */}
      <GlassSkeletonCard className="p-4">
        <div className="flex items-center gap-3">
          <SkeletonBar width="100%" height={4} rounded="rounded-full" />
          <SkeletonBar width={32} height={12} />
        </div>
      </GlassSkeletonCard>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// InsightSkeleton
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function InsightSkeleton() {
  return (
    <GlassSkeletonCard className="p-5">
      {/* Category + timer row */}
      <div className="flex items-center justify-between mb-4">
        <SkeletonBar width={72} height={22} rounded="rounded-full" />
        <SkeletonBar width={90} height={14} />
      </div>

      {/* Insight text */}
      <div className="space-y-2 mb-4">
        <SkeletonBar width="95%" height={14} />
        <SkeletonBar width="80%" height={14} />
        <SkeletonBar width="60%" height={14} />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <SkeletonBar width={100} height={8} />
        <SkeletonBar width={140} height={8} />
      </div>
    </GlassSkeletonCard>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PredictionSkeleton
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function PredictionSkeleton() {
  return (
    <GlassSkeletonCard className="p-5">
      {/* Header badges */}
      <div className="flex items-center gap-2 mb-4">
        <SkeletonBar width={64} height={20} rounded="rounded-full" />
        <SkeletonBar width={48} height={14} />
      </div>

      {/* Prediction text */}
      <div className="space-y-2 mb-3">
        <SkeletonBar width="92%" height={13} />
        <SkeletonBar width="70%" height={13} />
      </div>

      {/* Basis text */}
      <SkeletonBar width="85%" height={9} className="mb-4" />

      {/* Confidence bar */}
      <div className="pt-1">
        <SkeletonBar width="100%" height={4} rounded="rounded-full" />
        <SkeletonBar width={60} height={8} className="mt-1.5" />
      </div>
    </GlassSkeletonCard>
  );
}
