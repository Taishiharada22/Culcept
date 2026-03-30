"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { generateWeeklyReport, type WeeklyReport, type WeeklyReportSlide } from "@/lib/stargazer/weeklyReportGenerator";

const mono = "'JetBrains Mono','SF Mono',monospace";

type Props = {
  axisScores: Record<string, number>;
  observationCount: number;
  streakDays: number;
};

export default function WeeklyReportBanner({
  axisScores,
  observationCount,
  streakDays,
}: Props) {
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);

  // 月〜水のみ表示
  const dayOfWeek = new Date().getDay(); // 0=Sun, 1=Mon...
  const isShowDay = dayOfWeek >= 1 && dayOfWeek <= 3;

  useEffect(() => {
    if (!isShowDay || observationCount < 7) return;
    try {
      const r = generateWeeklyReport({
        axisScores,
        observationCount,
        streakDays,
        contradictions: [],
        contradictionCount: 0,
        weeklyObservationCount: Math.min(observationCount, 7),
      });
      setReport(r);
    } catch { /* ignore */ }
  }, [isShowDay, observationCount, streakDays, axisScores]);

  if (!report || !isShowDay) return null;

  return (
    <>
      {/* Banner */}
      <motion.button
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.3 }}
        onClick={() => { setModalOpen(true); setCurrentSlide(0); }}
        style={{
          width: "100%",
          padding: "14px 20px",
          borderRadius: 18,
          background: report.slides[0]?.backgroundGradient ?? "linear-gradient(135deg, #0F0B1E, #2D1B69)",
          border: "1.5px solid rgba(139,92,246,0.3)",
          boxShadow: "0 8px 32px rgba(139,92,246,0.15)",
          color: "#fff",
          cursor: "pointer",
          textAlign: "left",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <div style={{ fontSize: 9, letterSpacing: 2, fontFamily: mono, opacity: 0.6, marginBottom: 4 }}>
            WEEKLY REPORT
          </div>
          <div style={{ fontSize: 14, fontWeight: 800 }}>
            今週のあなたを見る
          </div>
          <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>
            {report.slides.length}枚のスライドで1週間を振り返ろう
          </div>
        </div>
        <div style={{ fontSize: 28, opacity: 0.8 }}>📊</div>
      </motion.button>

      {/* Modal */}
      <AnimatePresence>
        {modalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 300,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {/* Backdrop */}
            <div
              onClick={() => setModalOpen(false)}
              style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.85)" }}
            />

            {/* Slide */}
            <motion.div
              key={currentSlide}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.22 }}
              style={{
                position: "relative",
                width: "90%",
                maxWidth: 380,
                minHeight: 420,
                borderRadius: 24,
                padding: "32px 28px",
                background: report.slides[currentSlide]?.backgroundGradient ?? "#1a1a2e",
                color: "#fff",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                boxShadow: "0 24px 64px rgba(0,0,0,0.4)",
              }}
            >
              {/* Slide counter */}
              <div style={{ fontSize: 9, fontFamily: mono, opacity: 0.5, letterSpacing: 2, marginBottom: 16 }}>
                {currentSlide + 1} / {report.slides.length}
              </div>

              {/* Slide content */}
              <div style={{ flex: 1 }}>
                {report.slides[currentSlide]?.iconEmoji && (
                  <div style={{ fontSize: 32, marginBottom: 12 }}>
                    {report.slides[currentSlide].iconEmoji}
                  </div>
                )}
                <h3 style={{ fontSize: 20, fontWeight: 900, marginBottom: 8, lineHeight: 1.3 }}>
                  {report.slides[currentSlide]?.headline}
                </h3>
                {report.slides[currentSlide]?.mainStat && (
                  <div style={{ fontSize: 36, fontWeight: 900, fontFamily: mono, marginBottom: 4, color: report.slides[currentSlide].accentColor }}>
                    {report.slides[currentSlide].mainStat}
                  </div>
                )}
                {report.slides[currentSlide]?.mainStatLabel && (
                  <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 12 }}>
                    {report.slides[currentSlide].mainStatLabel}
                  </div>
                )}
                <p style={{ fontSize: 13, lineHeight: 1.8, opacity: 0.85 }}>
                  {report.slides[currentSlide]?.body}
                </p>
              </div>

              {/* Navigation */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 20 }}>
                <button
                  onClick={() => setCurrentSlide(Math.max(0, currentSlide - 1))}
                  disabled={currentSlide === 0}
                  style={{
                    padding: "8px 16px", borderRadius: 10, fontSize: 12, fontWeight: 700,
                    background: "rgba(255,255,255,0.1)", border: "none", color: "#fff",
                    cursor: currentSlide === 0 ? "default" : "pointer",
                    opacity: currentSlide === 0 ? 0.3 : 1,
                  }}
                >
                  ← 前へ
                </button>

                {/* Dots */}
                <div style={{ display: "flex", gap: 4 }}>
                  {report.slides.map((_, i) => (
                    <div
                      key={i}
                      style={{
                        width: i === currentSlide ? 16 : 5,
                        height: 5,
                        borderRadius: 3,
                        background: i === currentSlide ? "#fff" : "rgba(255,255,255,0.3)",
                        transition: "all 0.3s",
                      }}
                    />
                  ))}
                </div>

                {currentSlide < report.slides.length - 1 ? (
                  <button
                    onClick={() => setCurrentSlide(currentSlide + 1)}
                    style={{
                      padding: "8px 16px", borderRadius: 10, fontSize: 12, fontWeight: 700,
                      background: "rgba(255,255,255,0.15)", border: "none", color: "#fff",
                      cursor: "pointer",
                    }}
                  >
                    次へ →
                  </button>
                ) : (
                  <button
                    onClick={() => setModalOpen(false)}
                    style={{
                      padding: "8px 16px", borderRadius: 10, fontSize: 12, fontWeight: 700,
                      background: report.slides[currentSlide]?.accentColor ?? "#8B5CF6",
                      border: "none", color: "#fff", cursor: "pointer",
                    }}
                  >
                    閉じる ✓
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
