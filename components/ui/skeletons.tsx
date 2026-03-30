"use client";

/**
 * Content-Shaped Skeleton Components
 *
 * 各ページの実際のレイアウトに合わせたスケルトン。
 * ジェネリックなグリッドではなく、コンテンツの形を予告する。
 */

import { motion } from "framer-motion";

/** 基本パルスアニメーション */
function Pulse({ className }: { className?: string }) {
  return (
    <motion.div
      className={`bg-white/5 rounded-xl ${className ?? ""}`}
      animate={{ opacity: [0.3, 0.6, 0.3] }}
      transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

/** ホームページスケルトン -- ヒーロー + セクション構造 */
export function HomeSkeleton() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 p-5">
      {/* Hero */}
      <div className="pt-16 pb-12">
        <Pulse className="h-12 w-3/4 mb-4" />
        <Pulse className="h-12 w-1/2 mb-4" />
        <Pulse className="h-6 w-2/3 mb-8" />
        <div className="flex gap-3">
          <Pulse className="h-12 w-32 rounded-full" />
          <Pulse className="h-12 w-32 rounded-full" />
        </div>
      </div>
      {/* Section cards */}
      <div className="space-y-4 mt-8">
        <Pulse className="h-40 w-full" />
        <Pulse className="h-32 w-full" />
        <div className="grid grid-cols-2 gap-3">
          <Pulse className="h-24" />
          <Pulse className="h-24" />
        </div>
      </div>
    </div>
  );
}

/** Stargazer スケルトン -- 観測カード形状 */
export function StargazerSkeleton() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-950 to-slate-900 flex items-center justify-center p-5">
      <div className="w-full max-w-md">
        <Pulse className="h-6 w-24 mb-8 mx-auto" />
        <Pulse className="h-64 w-full rounded-2xl mb-6" />
        <div className="space-y-3">
          <Pulse className="h-14 w-full rounded-xl" />
          <Pulse className="h-14 w-full rounded-xl" />
          <Pulse className="h-14 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}

/** Rendezvous スケルトン -- プロフィールカード形状 */
export function RendezvousSkeleton() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-rose-950 to-slate-900 p-5">
      <Pulse className="h-8 w-40 mb-6" />
      <div className="space-y-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex gap-4 p-4">
            <Pulse className="h-16 w-16 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <Pulse className="h-5 w-32" />
              <Pulse className="h-4 w-48" />
              <Pulse className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Genome Card スケルトン */
export function GenomeCardSkeleton() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-950 to-slate-900 p-5 flex justify-center">
      <div className="w-full max-w-sm pt-12">
        <Pulse className="h-48 w-full rounded-2xl mb-4" />
        <Pulse className="h-6 w-40 mx-auto mb-2" />
        <Pulse className="h-4 w-56 mx-auto mb-6" />
        <div className="grid grid-cols-2 gap-3">
          <Pulse className="h-20 rounded-xl" />
          <Pulse className="h-20 rounded-xl" />
          <Pulse className="h-20 rounded-xl" />
          <Pulse className="h-20 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

/** プロフィール/マイページ スケルトン */
export function ProfileSkeleton() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 p-5">
      <div className="flex items-center gap-4 mb-8 pt-8">
        <Pulse className="h-20 w-20 rounded-full" />
        <div className="space-y-2">
          <Pulse className="h-6 w-32" />
          <Pulse className="h-4 w-48" />
        </div>
      </div>
      <div className="space-y-4">
        <Pulse className="h-32 w-full rounded-xl" />
        <Pulse className="h-24 w-full rounded-xl" />
        <Pulse className="h-24 w-full rounded-xl" />
      </div>
    </div>
  );
}

/** カレンダー スケルトン */
export function CalendarSkeleton() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-950 to-slate-900 p-5">
      <Pulse className="h-8 w-24 mb-6" />
      <div className="grid grid-cols-7 gap-2 mb-6">
        {Array.from({ length: 35 }).map((_, i) => (
          <Pulse key={i} className="h-12 rounded-lg" />
        ))}
      </div>
      <Pulse className="h-40 w-full rounded-xl" />
    </div>
  );
}
