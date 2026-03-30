"use client";

import { motion } from "framer-motion";
import { useCallback, useRef, useState } from "react";
import type { DraftChapter, RecoveryText } from "@/lib/origin/v7/types";

type Props = {
  draft: DraftChapter;
  onComplete: (update: Partial<DraftChapter>) => void;
};

export default function AIRecoveryStep({ draft, onComplete }: Props) {
  const [loading, setLoading] = useState(!draft.aiNarrative);
  const [error, setError] = useState<string | null>(null);
  const [narrative, setNarrative] = useState<RecoveryText | null>(
    draft.aiNarrative,
  );
  const titleRef = useRef(draft.aiTitle ?? "");
  const echoesRef = useRef<string[]>(draft.aiEchoes ?? []);
  const sourceRef = useRef<string>("ai");
  const hasFetched = useRef(false);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/origin/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          period: draft.period,
          atmosphere: draft.atmosphere,
          perspective: draft.perspective,
          comparison: draft.comparison,
          triggers: draft.triggers,
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();

      const recovery: RecoveryText = {
        narrative: data.narrative,
        generatedAt: new Date().toISOString(),
        model: data.model ?? "unknown",
      };
      setNarrative(recovery);
      titleRef.current = data.title ?? "";
      echoesRef.current = data.echoes ?? [];
      sourceRef.current = data.source ?? "ai";
    } catch (e) {
      setError(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }, [draft]);

  // Auto-generate on mount (once)
  if (!draft.aiNarrative && !hasFetched.current) {
    hasFetched.current = true;
    generate();
  }

  const handleProceed = useCallback(() => {
    if (!narrative) return;
    onComplete({
      aiNarrative: narrative,
      aiTitle: titleRef.current,
      aiEchoes: echoesRef.current,
    });
  }, [narrative, onComplete]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.35 }}
      className="flex flex-col gap-6"
    >
      <div className="text-center">
        <p className="mb-1 text-sm text-gray-500">Step 6</p>
        <h2 className="text-lg font-semibold text-gray-800">
          あなたの断片から
        </h2>
        <p className="mt-1 text-xs text-gray-400">
          選んだ記憶の断片をもとに、その頃のプロフィールを描きます
        </p>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center gap-4 py-12">
          <motion.div
            animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            className="h-4 w-4 rounded-full bg-amber-400/70"
          />
          <p className="text-sm text-gray-400 italic">
            記憶の断片を集めています...
          </p>
          <p className="text-[10px] text-gray-300">
            少し時間がかかることがあります
          </p>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="flex flex-col items-center gap-3 py-8">
          <p className="text-sm text-red-500">{error}</p>
          <button
            onClick={generate}
            className="rounded-xl bg-white/70 px-4 py-2 text-sm text-gray-600 hover:bg-white/90"
          >
            もう一度試す
          </button>
        </div>
      )}

      {/* Narrative */}
      {narrative && !loading && (
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 20 }}
          className="flex flex-col gap-5"
        >
          <div className="rounded-2xl bg-white/80 backdrop-blur-md p-5 shadow-sm">
            <p className="text-sm leading-relaxed text-gray-700 whitespace-pre-wrap">
              {narrative.narrative}
            </p>
          </div>

          <p className="text-center text-xs text-gray-400">
            {sourceRef.current === "template"
              ? "選択した断片をもとにプロフィールを描きました。次のステップで修正できます"
              : "これはあくまで推測です。次のステップで修正できます"}
          </p>

          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleProceed}
            className="mx-auto w-full max-w-xs rounded-2xl bg-amber-400/90 px-6 py-3 text-sm font-semibold text-white shadow-md hover:bg-amber-500/90"
          >
            次へ — 修正する
          </motion.button>
        </motion.div>
      )}
    </motion.div>
  );
}
