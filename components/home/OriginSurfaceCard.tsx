"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { loadOrbitStoreWithSync, todayKey } from "@/lib/origin/dailyOrbit/store";
import { selectHomeSurface, type OriginHomeSurface } from "@/lib/origin/dailyOrbit/homeSurface";
import { generateEvidenceCards, type EvidenceCard } from "@/lib/origin/evidenceCardEngine";

function loadEntryRecords() {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem("origin_entry_records_v1") ?? "[]");
  } catch {
    return [];
  }
}

export default function OriginSurfaceCard() {
  const [surface, setSurface] = useState<OriginHomeSurface | null>(null);
  const [topCard, setTopCard] = useState<EvidenceCard | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    (async () => {
      const store = await loadOrbitStoreWithSync();
      if (!store) return;
      const today = todayKey();
      const chosen = selectHomeSurface(store, today);
      if (chosen) setSurface(chosen);

      // 証拠カードの最上位を取得
      const entries = loadEntryRecords();
      const cards = generateEvidenceCards(store, entries, null);
      if (cards.length > 0 && cards[0].growth !== "seed") {
        setTopCard(cards[0]);
      }
    })();
  }, []);

  return (
    <AnimatePresence>
      {surface && !dismissed && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, height: 0, marginBottom: 0 }}
          transition={{ duration: 0.3 }}
          className="mb-3 rounded-2xl bg-gradient-to-r from-amber-50/50 to-orange-50/30 px-4 py-3"
        >
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-sm">{surface.emoji}</span>
            <div className="flex-1">
              <p className="mb-0.5 text-[10px] font-medium text-amber-500">
                Originからの発見
              </p>
              <p className="text-xs leading-relaxed text-gray-600">
                {surface.text}
              </p>
            </div>
            <button
              onClick={() => setDismissed(true)}
              className="text-[10px] text-gray-400 hover:text-gray-500"
            >
              ×
            </button>
          </div>
          {topCard && (
            <div className="mt-2 pt-2 border-t border-amber-100/40">
              <p className="text-[10px] text-amber-600/70 font-medium mb-0.5">
                {topCard.growth === "evidence" ? "🌳 証拠" : "🌿 芽"}
              </p>
              <p className="text-xs text-gray-500 leading-relaxed">
                {topCard.pattern}
              </p>
              {topCard.frequency && (
                <p className="text-[10px] text-gray-400 mt-0.5">{topCard.frequency}</p>
              )}
            </div>
          )}
          <div className="mt-2 text-right">
            <a
              href="/origin"
              className="text-[10px] text-amber-500 hover:text-amber-600"
            >
              Origin で詳しく →
            </a>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
