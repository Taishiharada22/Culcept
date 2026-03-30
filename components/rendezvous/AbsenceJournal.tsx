"use client";

import { motion, AnimatePresence } from "framer-motion";
import { GlassCard, GlassButton, FadeInView } from "@/components/ui/glassmorphism-design";
import type { JournalEntry } from "@/lib/rendezvous/absenceJournal";

// =============================================================================
// AbsenceJournal
// 不在の美学ジャーナル - 不在期間中のアバターの旅を記録するモーダル
// =============================================================================

interface AbsenceJournalProps {
  journal: JournalEntry;
  onClose: () => void;
}

// Emotion to Japanese label mapping
const EMOTION_LABELS: Record<string, string> = {
  curious: "好奇心",
  excited: "高揚",
  hesitant: "逡巡",
  contemplative: "思索",
  delighted: "喜び",
  resting: "静寂",
};

// Emotion to color mapping
const EMOTION_COLORS: Record<string, string> = {
  curious: "bg-cyan-100 text-cyan-700",
  excited: "bg-amber-100 text-amber-700",
  hesitant: "bg-slate-100 text-slate-600",
  contemplative: "bg-indigo-100 text-indigo-700",
  delighted: "bg-rose-100 text-rose-700",
  resting: "bg-slate-50 text-slate-500",
};

function formatDuration(hours: number): string {
  if (hours < 24) return `${hours}時間`;
  const days = Math.floor(hours / 24);
  const remaining = hours % 24;
  return remaining > 0 ? `${days}日${remaining}時間` : `${days}日`;
}

export default function AbsenceJournal({ journal, onClose }: AbsenceJournalProps) {
  // Deduplicate emotion arc for display
  const uniqueEmotions = [...new Set(journal.emotionArc)];

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[90] flex items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {/* Deep glassmorphism backdrop */}
        <div
          className="absolute inset-0 bg-slate-900/50 backdrop-blur-2xl"
          onClick={onClose}
        />

        {/* Journal modal */}
        <motion.div
          className="relative z-10 w-full max-w-md mx-4 max-h-[85vh] overflow-y-auto"
          initial={{ opacity: 0, y: 30, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 30, scale: 0.95 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        >
          <div className="bg-white/90 backdrop-blur-2xl rounded-3xl shadow-2xl shadow-black/10 border border-white overflow-hidden">
            {/* Header with book-like aesthetic */}
            <div className="px-6 pt-8 pb-4 text-center border-b border-slate-100">
              <FadeInView delay={0.1}>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-widest mb-2">
                  不在の記録
                </p>
                <h2 className="text-xl font-bold text-slate-900">
                  {formatDuration(journal.period.durationHours)}の旅路
                </h2>
              </FadeInView>
            </div>

            {/* Content */}
            <div className="px-6 py-6 space-y-6">
              {/* Period summary */}
              <FadeInView delay={0.2}>
                <div className="flex items-center justify-between text-sm text-slate-500">
                  <span>{journal.encounters}人と交差</span>
                  <span className="mx-2 text-slate-300">|</span>
                  <span>{journal.lingeredCount}人の前で立ち止まる</span>
                </div>
              </FadeInView>

              {/* Narrative */}
              <FadeInView delay={0.3}>
                <p className="text-base text-slate-700 leading-relaxed">
                  {journal.narrativeJa}
                </p>
              </FadeInView>

              {/* Emotion arc */}
              {uniqueEmotions.length > 0 && (
                <FadeInView delay={0.4}>
                  <div>
                    <p className="text-xs font-medium text-slate-400 mb-3">
                      感情の軌跡
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {uniqueEmotions.map((emotion, i) => (
                        <span
                          key={`${emotion}-${i}`}
                          className={`px-3 py-1 rounded-full text-xs font-medium ${EMOTION_COLORS[emotion] ?? "bg-slate-100 text-slate-600"}`}
                        >
                          {EMOTION_LABELS[emotion] ?? emotion}
                        </span>
                      ))}
                    </div>
                  </div>
                </FadeInView>
              )}

              {/* Highlights */}
              {journal.highlights.length > 0 && (
                <FadeInView delay={0.5}>
                  <div>
                    <p className="text-xs font-medium text-slate-400 mb-3">
                      印象的な瞬間
                    </p>
                    <div className="space-y-3">
                      {journal.highlights.map((h, i) => (
                        <GlassCard
                          key={`${h.candidateId}-${i}`}
                          padding="sm"
                          hoverEffect={false}
                          variant="bordered"
                        >
                          <p className="text-sm text-slate-600 leading-relaxed">
                            {h.snippet}
                          </p>
                        </GlassCard>
                      ))}
                    </div>
                  </div>
                </FadeInView>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 pb-6">
              <FadeInView delay={0.6}>
                <GlassButton
                  variant="primary"
                  fullWidth
                  onClick={onClose}
                >
                  閉じる
                </GlassButton>
              </FadeInView>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
