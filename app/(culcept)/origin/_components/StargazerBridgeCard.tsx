"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { OrbitLaw } from "@/lib/origin/dailyOrbit/types";
import { loadOrbitStoreWithSync } from "@/lib/origin/dailyOrbit/store";
import {
  generateStargazerBridgeInsights,
  type BridgeInsight,
} from "@/lib/origin/dailyOrbit/stargazerBridge";

const DIRECTION_META: Record<string, { emoji: string; color: string }> = {
  confirms: { emoji: "✦", color: "text-indigo-500" },
  nuances: { emoji: "◈", color: "text-amber-500" },
  diverges: { emoji: "◇", color: "text-violet-500" },
};

export default function StargazerBridgeCard() {
  const [insights, setInsights] = useState<BridgeInsight[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    (async () => {
      // Load Origin laws
      const store = await loadOrbitStoreWithSync();
      if (!store) return;

      const allLaws = store.orbitLaws ?? [];
      if (allLaws.length === 0) return;

      // Fetch Stargazer axis scores
      try {
        const res = await fetch("/api/stargazer/profile");
        if (!res.ok) return;
        const data = await res.json();
        const axisScores = data.axisScores as Record<string, number> | undefined;
        if (!axisScores || Object.keys(axisScores).length === 0) return;

        const bridgeInsights = generateStargazerBridgeInsights(allLaws, axisScores);
        setInsights(bridgeInsights);
      } catch {
        // Stargazer未使用 or APIエラー — 非表示
      }
    })();
  }, []);

  if (insights.length === 0) return null;

  const preview = insights[0];
  const rest = insights.slice(1);

  return (
    <div className="mt-3 rounded-xl bg-gradient-to-r from-indigo-50/50 to-violet-50/30 px-3 py-2.5">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-start gap-2 text-left"
      >
        <span className="mt-0.5 text-sm">🔭</span>
        <div className="flex-1">
          <p className="mb-0.5 text-[10px] font-medium text-indigo-400">
            Stargazerとの接点
          </p>
          <p className="text-xs leading-relaxed text-gray-600">
            <span className={DIRECTION_META[preview.direction]?.color ?? "text-gray-500"}>
              {DIRECTION_META[preview.direction]?.emoji ?? "·"}{" "}
            </span>
            {preview.text}
          </p>
        </div>
        <span className="mt-1 text-[10px] text-gray-400">
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      <AnimatePresence>
        {expanded && rest.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-2 space-y-2 border-t border-indigo-100/30 pt-2">
              {rest.map((insight, i) => (
                <motion.p
                  key={insight.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.1 }}
                  className="text-xs leading-relaxed text-gray-600"
                >
                  <span className={DIRECTION_META[insight.direction]?.color ?? "text-gray-500"}>
                    {DIRECTION_META[insight.direction]?.emoji ?? "·"}{" "}
                  </span>
                  {insight.text}
                </motion.p>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-2 text-right">
        <a
          href="/stargazer"
          className="text-[10px] text-indigo-400 hover:text-indigo-600"
        >
          Stargazerで詳しく →
        </a>
      </div>
    </div>
  );
}
