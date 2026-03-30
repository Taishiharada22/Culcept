"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassButton } from "@/components/ui/glassmorphism-design";
import type { AbsenceJournal } from "@/lib/rendezvous/absenceTracker";

// =============================================================================
// AbsenceJournalModal
// 不在の美学 - 帰還時に自動表示されるフルスクリーンモーダル
// localStorage管理で一度だけ表示
// =============================================================================

const LS_LAST_VISIT = "culcept_last_rendezvous_visit";
const LS_SHOWN_PREFIX = "culcept_absence_journal_shown_";
const MIN_ABSENCE_HOURS = 24;
const AUTO_DISMISS_MS = 8000;

export default function AbsenceJournalModal() {
  const [journal, setJournal] = useState<AbsenceJournal | null>(null);
  const [visible, setVisible] = useState(false);

  const dismiss = useCallback(() => {
    setVisible(false);
  }, []);

  useEffect(() => {
    const lastVisit = localStorage.getItem(LS_LAST_VISIT);
    const now = new Date();
    const todayKey = `${LS_SHOWN_PREFIX}${now.toISOString().slice(0, 10)}`;

    const safeSet = (k: string, v: string) => {
      try { localStorage.setItem(k, v); } catch { /* quota exceeded - ignore */ }
    };

    // Check if already shown today
    if (localStorage.getItem(todayKey)) {
      safeSet(LS_LAST_VISIT, now.toISOString());
      return;
    }

    // Check if absent long enough
    if (lastVisit) {
      const diffMs = now.getTime() - new Date(lastVisit).getTime();
      const diffHours = diffMs / (1000 * 60 * 60);

      if (diffHours < MIN_ABSENCE_HOURS) {
        safeSet(LS_LAST_VISIT, now.toISOString());
        return;
      }
    } else {
      // First visit ever - set timestamp and skip journal
      safeSet(LS_LAST_VISIT, now.toISOString());
      return;
    }

    // Fetch absence journal data
    const url = `/api/rendezvous/absence-journal-tracker?lastVisit=${encodeURIComponent(lastVisit)}`;
    fetch(url, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.ok && d.journal) {
          setJournal(d.journal);
          setVisible(true);
          safeSet(todayKey, "1");
        }
      })
      .catch(() => {})
      .finally(() => {
        safeSet(LS_LAST_VISIT, now.toISOString());
      });
  }, []);

  // Auto-dismiss
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(dismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [visible, dismiss]);

  if (!journal) return null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* Semi-transparent overlay */}
          <div
            className="absolute inset-0"
            style={{
              background: "rgba(15,15,35,0.55)",
              backdropFilter: "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
            }}
            onClick={dismiss}
          />

          {/* Journal card */}
          <motion.div
            className="relative z-10 w-full max-w-sm mx-5"
            initial={{ opacity: 0, y: 40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 260, damping: 28 }}
          >
            <div
              style={{
                background: "rgba(255,255,255,0.92)",
                backdropFilter: "blur(24px)",
                WebkitBackdropFilter: "blur(24px)",
                borderRadius: "24px",
                border: "1px solid rgba(255,255,255,0.6)",
                boxShadow:
                  "0 24px 48px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.06)",
                overflow: "hidden",
              }}
            >
              {/* Title */}
              <div className="px-6 pt-8 pb-3 text-center">
                <motion.p
                  className="text-xs font-semibold uppercase tracking-[0.2em] mb-2"
                  style={{ color: "rgba(99,102,241,0.5)" }}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  {"\u2728"} {journal.title}
                </motion.p>
                <motion.h2
                  className="text-xl font-bold"
                  style={{ color: "rgba(30,30,60,0.85)" }}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                >
                  {journal.duration}
                  {"\u306E\u8A18\u9332"}
                </motion.h2>
              </div>

              {/* Entries */}
              <div className="px-6 py-5 space-y-3">
                {journal.entries.map((entry, i) => (
                  <motion.p
                    key={i}
                    className="text-sm leading-relaxed"
                    style={{
                      color: "rgba(30,30,60,0.7)",
                      fontFamily: "'Noto Serif JP', serif",
                    }}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 + i * 0.15 }}
                  >
                    {entry}
                  </motion.p>
                ))}

                {/* Closing line */}
                <motion.p
                  className="text-sm leading-relaxed pt-2"
                  style={{
                    color: "rgba(30,30,60,0.5)",
                    fontStyle: "italic",
                    fontFamily: "'Noto Serif JP', serif",
                  }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{
                    delay: 0.4 + journal.entries.length * 0.15 + 0.2,
                  }}
                >
                  {journal.closingLine}
                </motion.p>
              </div>

              {/* Dismiss button */}
              <div className="px-6 pb-6">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{
                    delay: 0.4 + journal.entries.length * 0.15 + 0.5,
                  }}
                >
                  <GlassButton
                    variant="primary"
                    fullWidth
                    onClick={dismiss}
                  >
                    {
                      "\u623B\u3063\u3066\u304D\u3066\u304F\u308C\u3066\u3001\u3042\u308A\u304C\u3068\u3046"
                    }
                  </GlassButton>
                </motion.div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
