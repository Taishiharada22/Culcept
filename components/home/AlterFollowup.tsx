"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface FollowupData {
  pending: boolean;
  judgmentId?: string;
  actionShape?: string;
  question?: string;
}

const SHAPE_LABELS: Record<string, string> = {
  full_go: "全力で行く",
  bounded_go: "限定参加",
  prepare_then_go: "準備してから",
  observe_first: "様子を見る",
  defer_with_trigger: "今回は見送り",
  skip: "やめる",
};

/**
 * Alter フォローアップ
 * 直近の判断提案に対して「やった？」を軽く聞く。
 * 3タップで完了。押し付けない。
 */
export default function AlterFollowup() {
  const [data, setData] = useState<FollowupData | null>(null);
  const [phase, setPhase] = useState<"ask" | "rate" | "done">("ask");
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    fetch("/api/stargazer/alter/followup")
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => {});
  }, []);

  const submit = useCallback(
    async (executed: boolean, satisfaction?: number) => {
      if (!data?.judgmentId) return;
      try {
        await fetch("/api/stargazer/alter/followup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            judgmentId: data.judgmentId,
            executed,
            satisfaction,
          }),
        });
      } catch {
        // fire-and-forget
      }
      setPhase("done");
      setTimeout(() => setDismissed(true), 1500);
    },
    [data],
  );

  if (!data?.pending || dismissed) return null;

  const shapeLabel = SHAPE_LABELS[data.actionShape ?? ""] ?? "";

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        className="mx-4 mb-2 rounded-xl px-3.5 py-2.5"
        style={{
          background: "rgba(255,255,255,0.35)",
          border: "1px solid rgba(0,0,0,0.04)",
        }}
      >
        {phase === "ask" && (
          <div className="space-y-2">
            <p className="text-[11px] text-black/40">
              前回の提案:{" "}
              <span className="text-black/60 font-medium">{shapeLabel}</span>
            </p>
            {data.question && (
              <p className="text-[10px] text-black/30 truncate">{data.question}</p>
            )}
            <div className="flex gap-1.5">
              <button
                onClick={() => setPhase("rate")}
                className="flex-1 rounded-lg bg-black/[0.04] py-1.5 text-[11px] text-black/55 hover:bg-black/[0.07] transition"
              >
                やった
              </button>
              <button
                onClick={() => submit(false)}
                className="flex-1 rounded-lg bg-black/[0.02] py-1.5 text-[11px] text-black/35 hover:bg-black/[0.05] transition"
              >
                やらなかった
              </button>
              <button
                onClick={() => setDismissed(true)}
                className="rounded-lg px-2 py-1.5 text-[11px] text-black/25 hover:text-black/40 transition"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {phase === "rate" && (
          <div className="space-y-2">
            <p className="text-[11px] text-black/45">どうだった？</p>
            <div className="flex gap-1.5 justify-center">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => submit(true, n)}
                  className="w-8 h-8 rounded-full bg-black/[0.04] text-black/50 text-xs hover:bg-black/[0.07] transition flex items-center justify-center"
                >
                  {n === 1 ? "😞" : n === 2 ? "😐" : n === 3 ? "🙂" : n === 4 ? "😊" : "🎯"}
                </button>
              ))}
            </div>
          </div>
        )}

        {phase === "done" && (
          <p className="text-[11px] text-black/30 text-center py-0.5">記録した</p>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
