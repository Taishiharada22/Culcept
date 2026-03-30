"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BODY_ZONE_OPTIONS } from "@/lib/origin/dailyOrbit/types";
import type { BodyEcho } from "@/lib/origin/dailyOrbit/types";

type Props = {
  bodyMemo: string;
  shadowText: string;
  onBodyMemoChange: (v: string) => void;
  onShadowTextChange: (v: string) => void;
  shadowCandidates?: string[];
};

const BODY_QUICK_OPTIONS = [
  { zone: "head" as const, options: BODY_ZONE_OPTIONS.head.options },
  { zone: "chest" as const, options: BODY_ZONE_OPTIONS.chest.options },
];

export default function JournalDeepLayer({
  bodyMemo,
  shadowText,
  onBodyMemoChange,
  onShadowTextChange,
  shadowCandidates,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mt-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-1.5 rounded-xl bg-white/30 px-3 py-2 text-[11px] text-gray-400 transition-colors hover:bg-white/40"
      >
        <span>{expanded ? "▾" : "▸"}</span>
        <span>深層レイヤー（任意）</span>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-2 space-y-3 rounded-2xl bg-white/30 p-3">
              {/* Body memo */}
              <div>
                <p className="mb-1.5 text-[11px] font-medium text-gray-400">🫁 からだメモ</p>
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {BODY_QUICK_OPTIONS.map(({ zone, options }) =>
                    options.map((opt) => (
                      <button
                        key={`${zone}-${opt.value}`}
                        onClick={() => {
                          const tag = `${opt.emoji}${zone === "head" ? "頭" : "胸"}:${opt.label}`;
                          const current = bodyMemo ? bodyMemo + " " + tag : tag;
                          onBodyMemoChange(current);
                        }}
                        className="rounded-full bg-white/50 px-2 py-1 text-[10px] text-gray-500 transition-colors hover:bg-white/80"
                      >
                        {opt.emoji} {zone === "head" ? "頭" : "胸"}: {opt.label}
                      </button>
                    )),
                  )}
                </div>
                <input
                  value={bodyMemo}
                  onChange={(e) => onBodyMemoChange(e.target.value)}
                  placeholder="肩が重い、目が疲れた、など"
                  className="w-full rounded-xl bg-white/50 px-3 py-2 text-xs text-gray-600 outline-none placeholder:text-gray-300"
                />
              </div>

              {/* Shadow intention */}
              <div>
                <p className="mb-1.5 text-[11px] font-medium text-gray-400">🔮 今日の本音</p>
                {shadowCandidates && shadowCandidates.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {shadowCandidates.map((c, i) => (
                      <button
                        key={i}
                        onClick={() => onShadowTextChange(c)}
                        className="rounded-full bg-purple-50/60 px-2.5 py-1 text-[10px] text-purple-500 transition-colors hover:bg-purple-50"
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                )}
                <input
                  value={shadowText}
                  onChange={(e) => onShadowTextChange(e.target.value)}
                  placeholder="本当はやりたかったこと、言えなかったこと"
                  className="w-full rounded-xl bg-white/50 px-3 py-2 text-xs text-gray-600 outline-none placeholder:text-gray-300"
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
