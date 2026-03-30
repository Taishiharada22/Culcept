"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { FadeInView } from "@/components/ui/glassmorphism-design";
import RelationshipMirrorView from "@/components/rendezvous/RelationshipMirrorView";
import UnconsciousPatternCard from "@/components/rendezvous/UnconsciousPatternCard";
import type { MirrorProfile } from "@/lib/rendezvous/relationshipMirror";
import type { UnconsciousPattern } from "@/lib/rendezvous/unconsciousPatterns";

type MirrorResponse = {
  ok: boolean;
  mirror: MirrorProfile;
  unconsciousPatterns: UnconsciousPattern[];
  error?: string;
};

export default function MirrorPageClient() {
  const [mirror, setMirror] = useState<MirrorProfile | null>(null);
  const [patterns, setPatterns] = useState<UnconsciousPattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/rendezvous/mirror");
        const data: MirrorResponse = await res.json();

        if (!data.ok) {
          setError(data.error ?? "\u30C7\u30FC\u30BF\u306E\u53D6\u5F97\u306B\u5931\u6557\u3057\u307E\u3057\u305F");
          return;
        }

        setMirror(data.mirror);
        setPatterns(data.unconsciousPatterns);
      } catch {
        setError("\u30CD\u30C3\u30C8\u30EF\u30FC\u30AF\u30A8\u30E9\u30FC\u304C\u767A\u751F\u3057\u307E\u3057\u305F");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const handleFace = useCallback((id: string) => {
    // TODO: persist "faced" state to backend
    // For now, just leave the card visible as acknowledged
  }, []);

  const handleDefer = useCallback((id: string) => {
    setDismissedIds((prev) => new Set([...prev, id]));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <motion.div
          className="flex flex-col items-center gap-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <motion.div
            className="w-12 h-12 rounded-full border-2 border-indigo-300 border-t-indigo-600"
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          />
          <p className="text-sm text-slate-500">
            {"\u95A2\u4FC2\u6027\u3092\u5206\u6790\u4E2D..."}
          </p>
        </motion.div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="text-center">
          <p className="text-sm text-red-500 mb-2">{error}</p>
          <button
            className="text-sm text-indigo-500 hover:text-indigo-600"
            onClick={() => window.location.reload()}
          >
            {"\u518D\u8A66\u884C"}
          </button>
        </div>
      </div>
    );
  }

  const visiblePatterns = patterns.filter((p) => !dismissedIds.has(p.id));

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <div className="px-5 pt-8 pb-4">
        <FadeInView>
          <h1 className="text-2xl font-bold text-slate-800">
            {"\u95A2\u4FC2\u6027\u306E\u93E1"}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {"\u3059\u3079\u3066\u306E\u51FA\u4F1A\u3044\u304C\u6620\u3057\u51FA\u3059\u3001\u3042\u306A\u305F\u306E\u59FF"}
          </p>
        </FadeInView>
      </div>

      <div className="px-4 space-y-6">
        {/* Quick links */}
        <FadeInView delay={0.1}>
          <div className="flex gap-3">
            <Link
              href="/rendezvous/settings/profile"
              className="flex-1 text-center py-3 rounded-xl text-xs font-bold no-underline transition-colors"
              style={{
                background: "#F5F3F0",
                color: "#6B6580",
                border: "1px solid rgba(26,16,37,0.06)",
              }}
            >
              プロフィール編集
            </Link>
            <Link
              href="/rendezvous/settings"
              className="flex-1 text-center py-3 rounded-xl text-xs font-bold no-underline transition-colors"
              style={{
                background: "#F5F3F0",
                color: "#6B6580",
                border: "1px solid rgba(26,16,37,0.06)",
              }}
            >
              探索設定
            </Link>
          </div>
        </FadeInView>

        {/* Mirror Profile */}
        {mirror && <RelationshipMirrorView mirrorProfile={mirror} />}

        {/* Unconscious Patterns */}
        {visiblePatterns.length > 0 && (
          <div>
            <FadeInView delay={0.6}>
              <div className="px-1 mb-3">
                <h2 className="text-lg font-bold text-slate-800">
                  {"\u7121\u610F\u8B58\u306E\u30D1\u30BF\u30FC\u30F3"}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {"\u3042\u306A\u305F\u304C\u6C17\u3065\u3044\u3066\u3044\u306A\u3044\u3001\u884C\u52D5\u306E\u50BE\u5411"}
                </p>
              </div>
            </FadeInView>

            <div className="space-y-3">
              {visiblePatterns.map((pattern) => (
                <UnconsciousPatternCard
                  key={pattern.id}
                  pattern={pattern}
                  onFace={handleFace}
                  onDefer={handleDefer}
                />
              ))}
            </div>
          </div>
        )}

        {/* Empty state when no patterns detected */}
        {mirror && mirror.stats.totalConnections < 3 && (
          <FadeInView delay={0.7}>
            <div className="text-center py-8">
              <p className="text-sm text-slate-400">
                {"\u3088\u308A\u591A\u304F\u306E\u51FA\u4F1A\u3044\u3092\u91CD\u306D\u308B\u3053\u3068\u3067\u3001"}
                <br />
                {"\u3042\u306A\u305F\u306E\u95A2\u4FC2\u6027\u306E\u30D1\u30BF\u30FC\u30F3\u304C\u898B\u3048\u3066\u304D\u307E\u3059"}
              </p>
            </div>
          </FadeInView>
        )}
      </div>
    </div>
  );
}
