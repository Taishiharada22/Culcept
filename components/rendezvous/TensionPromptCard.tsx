"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassCard, GlassButton } from "@/components/ui/glassmorphism-design";
import type {
  TensionPrompt,
  TensionResponse,
  TensionLevel,
} from "@/lib/rendezvous/tensionArchitecture";

// ---------- Props ----------

type TensionPromptCardProps = {
  prompt: TensionPrompt;
  onResponse: (response: TensionResponse) => void;
};

// ---------- Level theme config ----------

const LEVEL_THEME: Record<
  TensionLevel,
  {
    borderGradient: string;
    labelText: string;
    labelColor: string;
    bgOverlay: string;
    pulseClass: string;
  }
> = {
  gentle: {
    borderGradient: "from-blue-400/40 via-blue-300/30 to-blue-500/40",
    labelText: "gentle",
    labelColor: "text-blue-300",
    bgOverlay: "bg-blue-950/10",
    pulseClass: "",
  },
  moderate: {
    borderGradient: "from-amber-400/50 via-amber-300/40 to-amber-500/50",
    labelText: "moderate",
    labelColor: "text-amber-300",
    bgOverlay: "bg-amber-950/10",
    pulseClass: "animate-pulse",
  },
  confronting: {
    borderGradient: "from-red-400/50 via-red-300/40 to-red-500/50",
    labelText: "confronting",
    labelColor: "text-red-300",
    bgOverlay: "bg-red-950/10",
    pulseClass: "animate-[pulse_3s_ease-in-out_infinite]",
  },
  deep: {
    borderGradient: "from-purple-500/60 via-purple-400/40 to-purple-600/60",
    labelText: "deep",
    labelColor: "text-purple-300",
    bgOverlay: "bg-purple-950/10",
    pulseClass: "",
  },
};

// ---------- Component ----------

export default function TensionPromptCard({
  prompt,
  onResponse,
}: TensionPromptCardProps) {
  const [mode, setMode] = useState<"question" | "reflecting">("question");
  const [reflection, setReflection] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const theme = LEVEL_THEME[prompt.level];

  const handleResponse = useCallback(
    (type: TensionResponse["response"]) => {
      if (submitted) return;
      setSubmitted(true);

      const response: TensionResponse = {
        promptId: prompt.id,
        response: type,
        respondedAt: new Date().toISOString(),
        ...(type === "reflected" && reflection ? { reflection } : {}),
      };
      onResponse(response);
    },
    [prompt.id, reflection, submitted, onResponse],
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.8, ease: "easeOut" }}
      className="relative"
    >
      {/* グラデーションボーダー */}
      <div
        className={`absolute -inset-[1px] rounded-2xl bg-gradient-to-br ${theme.borderGradient} ${theme.pulseClass}`}
      />

      {/* Deep level: subtle glow */}
      {prompt.level === "deep" && (
        <motion.div
          className="absolute -inset-2 rounded-3xl bg-purple-500/10 blur-xl"
          animate={{ opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        />
      )}

      <GlassCard className="relative overflow-hidden rounded-2xl border-0 bg-gray-950/80 backdrop-blur-xl p-6">
        {/* Background overlay */}
        <div className={`absolute inset-0 ${theme.bgOverlay} pointer-events-none`} />

        <div className="relative z-10 space-y-6">
          {/* Level indicator */}
          <div className="flex items-center justify-between">
            <span
              className={`text-xs font-medium tracking-widest uppercase ${theme.labelColor}`}
            >
              {theme.labelText}
            </span>
            <div className="flex gap-1">
              {(["gentle", "moderate", "confronting", "deep"] as TensionLevel[]).map(
                (lvl) => (
                  <div
                    key={lvl}
                    className={`w-2 h-2 rounded-full ${
                      LEVEL_ORDER[lvl] <= LEVEL_ORDER[prompt.level]
                        ? `bg-gradient-to-r ${LEVEL_THEME[lvl].borderGradient}`
                        : "bg-gray-700"
                    }`}
                  />
                ),
              )}
            </div>
          </div>

          {/* Question */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.6 }}
            className="text-xl font-serif leading-relaxed text-gray-100"
          >
            {prompt.prompt}
          </motion.p>

          {/* Context */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6, duration: 0.6 }}
            className="text-sm text-gray-400 leading-relaxed"
          >
            {prompt.context}
          </motion.p>

          {/* Reflection textarea (when reflecting) */}
          <AnimatePresence>
            {mode === "reflecting" && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.4 }}
              >
                <textarea
                  value={reflection}
                  onChange={(e) => setReflection(e.target.value)}
                  placeholder="あなたの言葉で..."
                  className="w-full min-h-[120px] bg-gray-900/60 border border-gray-700/50 rounded-xl p-4 text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-gray-500/70 resize-none text-sm leading-relaxed"
                  autoFocus
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Response buttons */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.9, duration: 0.4 }}
            className="flex flex-col gap-3 pt-2"
          >
            {mode === "question" ? (
              <>
                <GlassButton
                  onClick={() => handleResponse("faced")}
                  disabled={submitted}
                  className="w-full justify-center py-3 bg-white/5 hover:bg-white/10 text-gray-200 border border-white/10"
                >
                  向き合う
                </GlassButton>

                <div className="flex gap-3">
                  <GlassButton
                    onClick={() => setMode("reflecting")}
                    disabled={submitted}
                    className="flex-1 justify-center py-3 bg-white/3 hover:bg-white/8 text-gray-400 border border-white/5 text-sm"
                  >
                    書き留める
                  </GlassButton>

                  <GlassButton
                    onClick={() => handleResponse("deferred")}
                    disabled={submitted}
                    className="flex-1 justify-center py-3 bg-white/3 hover:bg-white/8 text-gray-500 border border-white/5 text-sm"
                  >
                    今はまだ
                  </GlassButton>
                </div>
              </>
            ) : (
              <div className="flex gap-3">
                <GlassButton
                  onClick={() => handleResponse("reflected")}
                  disabled={submitted || reflection.trim().length === 0}
                  className="flex-1 justify-center py-3 bg-white/5 hover:bg-white/10 text-gray-200 border border-white/10"
                >
                  記録する
                </GlassButton>
                <GlassButton
                  onClick={() => {
                    setMode("question");
                    setReflection("");
                  }}
                  disabled={submitted}
                  className="justify-center py-3 px-4 bg-white/3 hover:bg-white/8 text-gray-500 border border-white/5 text-sm"
                >
                  戻る
                </GlassButton>
              </div>
            )}
          </motion.div>
        </div>
      </GlassCard>
    </motion.div>
  );
}

// ---------- Helpers ----------

const LEVEL_ORDER: Record<TensionLevel, number> = {
  gentle: 0,
  moderate: 1,
  confronting: 2,
  deep: 3,
};
