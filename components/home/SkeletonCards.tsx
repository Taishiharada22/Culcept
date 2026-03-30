"use client";
// components/home/SkeletonCards.tsx
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Skeleton Loading Cards — Wave 1完了前の「形だけ見える」UI
//
// Google UX研究: スケルトン画面はブランク画面より体感待ち時間が36%短い。
// 「形が見える」だけで脳は「ロード中」ではなく「表示中」と認知する。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { motion } from "framer-motion";

const shimmerStyle: React.CSSProperties = {
  background: "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.4) 50%, rgba(255,255,255,0) 100%)",
  backgroundSize: "200% 100%",
  animation: "shimmer 1.5s ease-in-out infinite",
};

function SkeletonBlock({ width, height, radius = 8 }: { width: string | number; height: number; radius?: number }) {
  return (
    <div style={{
      width,
      height,
      borderRadius: radius,
      background: "rgba(0,0,0,0.04)",
      position: "relative",
      overflow: "hidden",
    }}>
      <div style={{ ...shimmerStyle, position: "absolute", inset: 0 }} />
    </div>
  );
}

/** Hero領域のスケルトン（Wave 1 Critical待ち） */
export function HeroSkeleton() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      style={{ padding: "0 20px" }}
    >
      {/* Greeting row skeleton */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
        <SkeletonBlock width={100} height={100} radius={50} />
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <SkeletonBlock width={140} height={20} />
          <SkeletonBlock width={80} height={16} />
        </div>
      </div>

      {/* Primary Action skeleton */}
      <SkeletonBlock width="100%" height={72} radius={16} />

      {/* Two-card grid skeleton */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 16 }}>
        <SkeletonBlock width="100%" height={100} radius={16} />
        <SkeletonBlock width="100%" height={100} radius={16} />
      </div>
    </motion.div>
  );
}

/** コンテンツ領域のスケルトン（Wave 2 Content待ち） */
export function ContentSkeleton() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 14 }}
    >
      <SkeletonBlock width="100%" height={120} radius={16} />
      <SkeletonBlock width="100%" height={80} radius={16} />
      <SkeletonBlock width="100%" height={60} radius={12} />
    </motion.div>
  );
}

/** インラインCSS keyframe（shimmerアニメーション用） */
export function SkeletonStyles() {
  return (
    <style>{`
      @keyframes shimmer {
        0% { background-position: -200% 0; }
        100% { background-position: 200% 0; }
      }
    `}</style>
  );
}
