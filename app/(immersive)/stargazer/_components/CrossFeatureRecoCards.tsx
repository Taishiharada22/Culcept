"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { GlassButton } from "@/components/ui/glassmorphism-design";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CrossFeatureRecoCardsProps {
  visible: boolean;
  onNavigated: () => void;
}

interface RecoCard {
  id: string;
  icon: string;
  title: string;
  description: string;
  benefit: string;
  href: string;
  accentFrom: string;
  accentTo: string;
}

// ---------------------------------------------------------------------------
// Card data
// ---------------------------------------------------------------------------

const RECO_CARDS: RecoCard[] = [
  {
    id: "origin",
    icon: "📝",
    title: "Origin — あなたの記憶地図",
    description:
      "過去の記憶を探索し、今の自分を形作った出来事や価値観を発掘します。",
    benefit:
      "深層観測で見えた性格の「なぜ」が、記憶から裏付けられます。判断パターンの根源を発見できます。",
    href: "/origin",
    accentFrom: "from-emerald-50",
    accentTo: "to-teal-50",
  },
  {
    id: "body-color-avatar",
    icon: "🫀",
    title: "Phenotype — 外見の解析",
    description:
      "パーソナルカラー・体型・顔立ちなど、外見の特徴を多角的に分析します。",
    benefit:
      "内面（深層観測）と外見（Phenotype）の両面から自分を理解できるようになります。",
    href: "/body-color/avatar",
    accentFrom: "from-violet-50",
    accentTo: "to-fuchsia-50",
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CrossFeatureRecoCards({
  visible,
  onNavigated,
}: CrossFeatureRecoCardsProps) {
  const router = useRouter();
  // "expanded" = full cards visible, "collapsed" = folded pill at top
  const [mode, setMode] = useState<"expanded" | "collapsed">("expanded");

  const handleNavigate = (href: string) => {
    onNavigated();
    router.push(href);
  };

  const handleLater = () => {
    setMode("collapsed");
  };

  const handleExpand = () => {
    setMode("expanded");
  };

  if (!visible) return null;

  return (
    <>
      {/* ── Collapsed pill at top ── */}
      <AnimatePresence>
        {mode === "collapsed" && (
          <motion.button
            key="collapsed-pill"
            type="button"
            onClick={handleExpand}
            className="fixed top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full border border-indigo-200/60 bg-white/90 px-4 py-2 shadow-lg backdrop-blur-xl ring-1 ring-indigo-100/40"
            initial={{ opacity: 0, y: -20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            transition={{ type: "spring", damping: 22, stiffness: 260 }}
          >
            <span className="text-base">📝</span>
            <span className="text-base">🫀</span>
            <span className="text-xs font-bold text-slate-600">
              次のおすすめ
            </span>
            <motion.span
              className="text-[10px] text-indigo-500"
              animate={{ y: [0, -2, 0] }}
              transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
            >
              ▼
            </motion.span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── Expanded full cards (centered) ── */}
      <AnimatePresence>
        {mode === "expanded" && (
          <motion.div
            key="cross-reco-overlay"
            className="fixed inset-0 z-50 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/30 backdrop-blur-sm"
              onClick={handleLater}
            />

            {/* Cards stack — centered */}
            <div className="relative z-10 mx-5 w-full max-w-sm space-y-3">
              {/* Header */}
              <motion.p
                className="text-center text-sm font-semibold text-white/90"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                次のおすすめ
              </motion.p>

              {RECO_CARDS.map((card, idx) => (
                <motion.div
                  key={card.id}
                  className="relative rounded-2xl border border-white/50 bg-white/95 shadow-xl backdrop-blur-xl ring-1 ring-slate-200/50"
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 30, scale: 0.95 }}
                  transition={{
                    type: "spring",
                    damping: 24,
                    stiffness: 260,
                    delay: 0.15 * idx,
                  }}
                >
                  <div className="px-4 pb-4 pt-3.5 space-y-2.5">
                    {/* Title */}
                    <div className="flex items-center gap-2.5">
                      <span className="text-2xl">{card.icon}</span>
                      <h3 className="text-sm font-bold text-slate-800">
                        {card.title}
                      </h3>
                    </div>

                    {/* Description */}
                    <p className="text-xs leading-relaxed text-slate-600">
                      {card.description}
                    </p>

                    {/* Benefit highlight */}
                    <div
                      className={`rounded-lg bg-gradient-to-br ${card.accentFrom} ${card.accentTo} p-2.5`}
                    >
                      <p className="text-xs leading-relaxed text-slate-700">
                        <span className="font-semibold text-indigo-600">
                          メリット:{" "}
                        </span>
                        {card.benefit}
                      </p>
                    </div>

                    {/* CTA */}
                    <GlassButton
                      variant="primary"
                      size="sm"
                      onClick={() => handleNavigate(card.href)}
                      fullWidth
                    >
                      見てみる →
                    </GlassButton>
                  </div>
                </motion.div>
              ))}

              {/* Later button — prominent so users don't feel pressured */}
              <motion.button
                type="button"
                onClick={handleLater}
                className="w-full py-3 text-center text-base font-bold rounded-xl border border-white/40 bg-white/20 backdrop-blur-sm text-white transition-all hover:bg-white/30 hover:border-white/60 active:scale-[0.98]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
              >
                後で見る
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
