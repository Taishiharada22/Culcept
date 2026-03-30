"use client";

/**
 * FeatureGateGuard — 観測回数に基づく機能ゲート
 *
 * アンロック条件を満たしていない場合、ロック画面を表示する。
 * /api/stargazer/profile から totalObservations を取得し、
 * isFeatureUnlocked() でチェックする。
 */

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  isFeatureUnlocked,
  FEATURE_GATES,
  type FeatureGate,
} from "@/lib/stargazer/featureUnlock";
import {
  GlassCard,
  LightBackground,
  Skeleton,
} from "@/components/ui/glassmorphism-design";

interface FeatureGateGuardProps {
  /** Feature key matching FEATURE_GATES (e.g. "alter_dialogue", "ghost_resonance", "blind_spot") */
  feature: string;
  children: React.ReactNode;
}

export default function FeatureGateGuard({
  feature,
  children,
}: FeatureGateGuardProps) {
  const [totalObservations, setTotalObservations] = useState<number | null>(
    null,
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/stargazer/profile", {
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          const total =
            data.actualObservationCount ||
            data.observationStats?.totalAnswered ||
            data.totalSessions ||
            0;
          if (!cancelled) {
            setTotalObservations(total);
          }
        } else {
          // If unauthorized or error, assume 0 observations
          if (!cancelled) setTotalObservations(0);
        }
      } catch {
        if (!cancelled) setTotalObservations(0);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Loading state
  if (loading) {
    return (
      <LightBackground>
        <div className="max-w-2xl mx-auto px-4 pt-20 pb-32">
          <GlassCard>
            <Skeleton className="h-6 w-48 mb-4" />
            <Skeleton className="h-4 w-full mb-2" />
            <Skeleton className="h-4 w-3/4" />
          </GlassCard>
        </div>
      </LightBackground>
    );
  }

  const unlocked = isFeatureUnlocked(feature, totalObservations ?? 0);

  // Unlocked -- render children normally
  if (unlocked) {
    return <>{children}</>;
  }

  // Locked -- show gate screen
  const gate = FEATURE_GATES.find((g) => g.feature === feature);
  const requiredCount = gate?.requiredObservations ?? 0;
  const currentCount = totalObservations ?? 0;
  const remaining = requiredCount - currentCount;

  return (
    <LightBackground>
      <div className="max-w-2xl mx-auto px-4 pt-6 pb-32">
        {/* Back link */}
        <div className="flex items-center gap-3 mb-8">
          <Link
            href="/stargazer"
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </Link>
          <h1 className="text-lg font-bold text-slate-900">
            {gate?.label ?? feature}
          </h1>
        </div>

        {/* Lock Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
          className="text-center py-16"
        >
          {/* Lock icon with pulsing ring */}
          <div className="relative w-24 h-24 mx-auto mb-8">
            <motion.div
              className="absolute inset-0 rounded-full"
              style={{
                border: "2px solid rgba(139,92,246,0.15)",
              }}
              animate={{
                scale: [1, 1.2, 1],
                opacity: [0.3, 0.1, 0.3],
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
            <div
              className="absolute inset-0 flex items-center justify-center rounded-full"
              style={{
                background:
                  "linear-gradient(135deg, rgba(139,92,246,0.08), rgba(170,150,90,0.06))",
                border: "1px solid rgba(139,92,246,0.12)",
              }}
            >
              <svg
                className="w-10 h-10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="rgba(139,92,246,0.5)"
                strokeWidth={1.5}
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
          </div>

          {/* Feature info */}
          <h2
            className="text-xl font-bold mb-2"
            style={{ color: "rgba(20,25,45,0.9)" }}
          >
            {gate?.icon} {gate?.label ?? feature}
          </h2>
          <p
            className="text-sm mb-6 max-w-xs mx-auto leading-relaxed"
            style={{ color: "rgba(80,86,108,0.7)" }}
          >
            {gate?.description}
          </p>

          {/* Unlock requirement */}
          <GlassCard className="max-w-sm mx-auto">
            <p
              className="text-sm font-medium mb-3"
              style={{ color: "rgba(20,25,45,0.85)" }}
            >
              この機能は{requiredCount}回の観測後に解放されます
            </p>

            {/* Progress bar */}
            <div className="w-full h-2 rounded-full overflow-hidden mb-2"
              style={{ background: "rgba(139,92,246,0.08)" }}
            >
              <motion.div
                className="h-full rounded-full"
                style={{
                  background:
                    "linear-gradient(90deg, rgba(139,92,246,0.5), rgba(139,92,246,0.8))",
                }}
                initial={{ width: "0%" }}
                animate={{
                  width: `${Math.min((currentCount / requiredCount) * 100, 100)}%`,
                }}
                transition={{ duration: 0.6, ease: "easeOut", delay: 0.3 }}
              />
            </div>

            <p
              className="text-xs"
              style={{ color: "rgba(100,105,130,0.6)" }}
            >
              現在の観測回数: {currentCount} / {requiredCount}（あと{remaining}回）
            </p>
          </GlassCard>

          {/* CTA to observe */}
          <Link
            href="/stargazer"
            className="inline-flex items-center gap-2 mt-8 px-6 py-3 rounded-xl text-sm font-medium transition-all active:scale-[0.97]"
            style={{
              background:
                "linear-gradient(135deg, rgba(139,92,246,0.9), rgba(139,92,246,0.75))",
              color: "#fff",
              boxShadow: "0 4px 16px rgba(139,92,246,0.25)",
            }}
          >
            <span>🔭</span>
            <span>観測を続ける</span>
          </Link>
        </motion.div>
      </div>
    </LightBackground>
  );
}
