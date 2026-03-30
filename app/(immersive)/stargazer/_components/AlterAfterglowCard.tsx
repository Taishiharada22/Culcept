"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { GlassButton } from "@/components/ui/glassmorphism-design";
import type { AfterglowMessage } from "@/lib/stargazer/alterAfterglowEngine";
import { incrementReaction } from "@/lib/stargazer/engagementScore";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface Props {
  message: AfterglowMessage;
  onDismiss: () => void;
  onReply: () => void;
}

const AFTERGLOW_REACTIONS = [
  { key: "resonated", label: "響いた", icon: "✦" },
  { key: "surprising", label: "意外", icon: "◇" },
  { key: "not_now", label: "今はピンとこない", icon: "―" },
] as const;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function formatTimeSince(generatedAt: number): string {
  const diffMs = Date.now() - generatedAt;
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) {
    return `${hours}時間前の対話から`;
  }
  if (minutes > 10) {
    return `${minutes}分前の対話から`;
  }
  return "少し前の対話から";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function AlterAfterglowCard({
  message,
  onDismiss,
  onReply,
}: Props) {
  const [visible, setVisible] = useState(true);
  const [reaction, setReaction] = useState<string | null>(null);
  const router = useRouter();

  const handleReply = useCallback(() => {
    setVisible(false);
    setTimeout(() => {
      onReply();
      router.push("/stargazer/alter");
    }, 400);
  }, [onReply, router]);

  const handleDismiss = useCallback(() => {
    setVisible(false);
    setTimeout(onDismiss, 400);
  }, [onDismiss]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.97 }}
          transition={{
            type: "spring",
            stiffness: 200,
            damping: 25,
          }}
          className="w-full max-w-lg mx-auto"
        >
          {/* Card with pulse animation on edge */}
          <motion.div
            className="relative overflow-hidden rounded-3xl"
            animate={{
              boxShadow: [
                "0 0 0 1px rgba(168,85,247,0.15), 0 4px 24px rgba(128,0,255,0.06)",
                "0 0 0 1px rgba(168,85,247,0.3), 0 4px 32px rgba(128,0,255,0.12)",
                "0 0 0 1px rgba(168,85,247,0.15), 0 4px 24px rgba(128,0,255,0.06)",
              ],
            }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          >
            {/* Dark glassmorphism background */}
            <div
              className="relative border border-purple-500/15"
              style={{
                background:
                  "linear-gradient(145deg, rgba(25,8,48,0.93) 0%, rgba(40,15,70,0.90) 50%, rgba(20,8,40,0.95) 100%)",
                backdropFilter: "blur(20px)",
              }}
            >
              {/* Subtle gradient shimmer at top */}
              <div
                className="absolute top-0 left-0 right-0 h-[1px]"
                style={{
                  background:
                    "linear-gradient(90deg, transparent 0%, rgba(168,85,247,0.3) 50%, transparent 100%)",
                }}
              />

              <div className="p-5">
                {/* Header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    {/* Alter icon with breathing animation */}
                    <motion.div
                      className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center"
                      animate={{
                        boxShadow: [
                          "0 0 8px rgba(168,85,247,0.2)",
                          "0 0 16px rgba(168,85,247,0.35)",
                          "0 0 8px rgba(168,85,247,0.2)",
                        ],
                      }}
                      transition={{ duration: 2.5, repeat: Infinity }}
                    >
                      <svg
                        className="w-3.5 h-3.5 text-white/90"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                        />
                      </svg>
                    </motion.div>
                    <span className="text-xs font-medium text-purple-200/80">
                      もうひとりの自分からのメッセージ
                    </span>
                  </div>

                  {/* Timestamp */}
                  <span className="text-[11px] text-purple-300/70">
                    {formatTimeSince(message.generatedAt)}
                  </span>
                </div>

                {/* Message body */}
                <p className="text-sm leading-relaxed text-purple-50/85 font-light mb-5 whitespace-pre-line">
                  {message.message}
                </p>

                {/* Reaction */}
                {!reaction ? (
                  <div className="mb-4">
                    <p className="text-[11px] text-purple-300/70 mb-2">
                      このメッセージはどうだった？
                    </p>
                    <div className="flex items-center gap-2">
                      {AFTERGLOW_REACTIONS.map((r) => (
                        <button
                          key={r.key}
                          aria-label={`${r.label}と反応する`}
                          onClick={() => {
                            setReaction(r.key);
                            // XP: リアクション +5pt (max 3)
                            incrementReaction();
                            // Afterglow はlocalStorageベースだが反応はobservationsに記録
                            fetch("/api/stargazer/observations", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                type: "afterglow_reaction",
                                answers: [{
                                  variantId: message.triggerType ?? "unknown",
                                  score: r.key === "resonated" ? 1 : r.key === "surprising" ? 0.5 : 0,
                                  optionId: r.key,
                                }],
                              }),
                            }).catch(() => {});
                          }}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-medium
                            bg-white/8 border border-purple-400/20 text-purple-200/70
                            hover:bg-white/15 hover:border-purple-300/40 transition-all"
                        >
                          <span>{r.icon}</span>
                          {r.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-[11px] text-purple-300/70 mb-4"
                  >
                    ✦ 記録しました
                  </motion.p>
                )}

                {/* Actions */}
                <div className="flex items-center gap-3">
                  <GlassButton
                    variant="gradient"
                    size="sm"
                    onClick={handleReply}
                    className="flex-1"
                  >
                    返事をする
                  </GlassButton>
                  <button
                    aria-label="メッセージを閉じる"
                    onClick={handleDismiss}
                    className="px-4 py-2 text-sm text-purple-300/70 hover:text-purple-200/90 transition-colors rounded-xl hover:bg-white/5"
                  >
                    今はいい
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
