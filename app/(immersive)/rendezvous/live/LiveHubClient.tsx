"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  RvGlowCard,
  RvButton,
  RV_COLORS,
  RV_CATEGORY_LABELS,
  RV_CATEGORY_COLORS,
  type RvCategory,
} from "@/components/ui/rendezvous-design";

// =============================================================================
// LiveHubClient — ライブ体験のハブ画面（イベントスペース風デザイン）
// =============================================================================

const CATEGORIES: RvCategory[] = ["romantic", "friendship", "cocreation", "community", "partner"];

const staggerItem = {
  hidden: { opacity: 0, y: 20 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.12, duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] as const },
  }),
};

export default function LiveHubClient() {
  const router = useRouter();
  const [selectedCategory, setSelectedCategory] = useState<RvCategory>("friendship");
  const [joining, setJoining] = useState(false);
  const [notifyPsychGame, setNotifyPsychGame] = useState(false);

  const handleJoinSession = async () => {
    if (joining) return;
    setJoining(true);
    try {
      const res = await fetch("/api/rendezvous/session/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: selectedCategory, mode: "text" }),
      });
      const data = await res.json();
      if (data.ok) {
        if (data.status === "matched") {
          router.push(`/rendezvous/session/${data.sessionId}`);
        }
        // キュー中 — TODO: ポーリングでマッチを検出
      }
    } catch {
      // ignore
    } finally {
      setJoining(false);
    }
  };

  return (
    <div
      className="flex flex-col pb-28 min-h-screen"
      style={{
        background: `linear-gradient(180deg, ${RV_COLORS.base} 0%, #F3F0F8 40%, ${RV_COLORS.base} 100%)`,
      }}
    >
      {/* ========== Hero Header ========== */}
      <motion.div
        className="relative overflow-hidden px-5 pt-10 pb-8"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
      >
        {/* Animated background pulse */}
        <motion.div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(ellipse 80% 60% at 50% 30%, rgba(194,24,91,0.06) 0%, transparent 70%)`,
          }}
          animate={{
            opacity: [0.4, 0.8, 0.4],
            scale: [1, 1.05, 1],
          }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        />

        <div className="relative flex flex-col items-center text-center">
          {/* Glow icon */}
          <motion.div
            className="text-5xl mb-3"
            style={{
              filter: `drop-shadow(0 0 20px rgba(194,24,91,0.35))`,
            }}
            animate={{ scale: [1, 1.08, 1] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
          >
            &#x26A1;
          </motion.div>

          <h1
            className="text-2xl font-black tracking-tight"
            style={{ color: RV_COLORS.text }}
          >
            ライブ
          </h1>
          <p
            className="text-sm mt-2 max-w-[260px] leading-relaxed"
            style={{ color: RV_COLORS.textSub }}
          >
            今この瞬間、誰かとつながる。
            <br />
            名前も顔も知らない、だからこそ本音が出る。
          </p>
        </div>
      </motion.div>

      {/* ========== Cards Container ========== */}
      <div className="flex flex-col gap-4 px-4">

        {/* ===== Feature A: 5分間匿名セッション (HERO) ===== */}
        <motion.div
          custom={0}
          variants={staggerItem}
          initial="hidden"
          animate="show"
        >
          <div
            className="relative rounded-2xl overflow-hidden"
            style={{
              background: "linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(236,72,153,0.10) 50%, rgba(255,109,0,0.08) 100%)",
              border: `1px solid rgba(194,24,91,0.12)`,
              boxShadow: `0 8px 32px rgba(194,24,91,0.10), 0 2px 8px rgba(0,0,0,0.04)`,
            }}
          >
            {/* Inner glow accent */}
            <div
              className="absolute top-0 left-0 right-0 h-1"
              style={{ background: RV_COLORS.gradient }}
            />

            <div className="px-5 pt-6 pb-5">
              {/* Top row: title + live indicator */}
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2.5">
                  <span className="text-3xl">&#x1F3AD;</span>
                  <h2
                    className="text-base font-black"
                    style={{ color: RV_COLORS.text }}
                  >
                    5分間の匿名セッション
                  </h2>
                </div>
              </div>

              {/* Live indicator */}
              <div className="flex items-center gap-1.5 mb-3 ml-11">
                <motion.div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: RV_COLORS.success }}
                  animate={{ opacity: [1, 0.4, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
                <span
                  className="text-xs font-bold"
                  style={{ color: RV_COLORS.success }}
                >
                  オンライン: 12人
                </span>
              </div>

              <p
                className="text-xs leading-relaxed mb-4"
                style={{ color: RV_COLORS.textSub }}
              >
                顔も名前も分からない相手と5分間だけ匿名で話せます。
                終了後、お互い「もう一度話したい」と思えたら接続成立。
              </p>

              {/* Category pills — horizontal scroll */}
              <div className="overflow-x-auto -mx-1 px-1 mb-5">
                <div className="flex gap-2 w-max">
                  {CATEGORIES.map((cat) => {
                    const isSelected = selectedCategory === cat;
                    const color = RV_CATEGORY_COLORS[cat];
                    return (
                      <motion.button
                        key={cat}
                        onClick={() => setSelectedCategory(cat)}
                        className="rounded-full px-4 py-2 text-xs font-bold whitespace-nowrap transition-colors"
                        style={{
                          backgroundColor: isSelected ? `${color}18` : RV_COLORS.surface,
                          color: isSelected ? color : RV_COLORS.textMuted,
                          border: `1.5px solid ${isSelected ? `${color}50` : RV_COLORS.border}`,
                          boxShadow: isSelected ? `0 2px 12px ${color}20` : "none",
                        }}
                        whileTap={{ scale: 0.93 }}
                      >
                        {RV_CATEGORY_LABELS[cat]}
                      </motion.button>
                    );
                  })}
                </div>
              </div>

              {/* CTA button — centered, prominent */}
              <div className="flex justify-center">
                <motion.button
                  onClick={handleJoinSession}
                  disabled={joining}
                  className="relative px-10 py-3.5 rounded-full text-sm font-black text-white border-none cursor-pointer disabled:opacity-60"
                  style={{
                    background: RV_COLORS.gradient,
                    boxShadow: `0 4px 24px ${RV_COLORS.primaryGlow}, 0 0 48px rgba(194,24,91,0.12)`,
                  }}
                  whileTap={{ scale: 0.95 }}
                  whileHover={{ scale: 1.03 }}
                >
                  <AnimatePresence mode="wait">
                    {joining ? (
                      <motion.span
                        key="searching"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                      >
                        探しています...
                      </motion.span>
                    ) : (
                      <motion.span
                        key="join"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                      >
                        セッションに参加する
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.button>
              </div>
            </div>
          </div>
        </motion.div>

        {/* ===== Feature D: 心理ゲーム (Secondary) ===== */}
        <motion.div
          custom={1}
          variants={staggerItem}
          initial="hidden"
          animate="show"
        >
          <div
            className="rounded-2xl overflow-hidden"
            style={{
              background: "linear-gradient(135deg, rgba(123,97,255,0.08) 0%, rgba(236,72,153,0.06) 100%)",
              border: `1px solid rgba(123,97,255,0.10)`,
              boxShadow: `0 4px 16px rgba(123,97,255,0.06), 0 1px 4px rgba(0,0,0,0.03)`,
            }}
          >
            <div className="px-5 py-5">
              <div className="flex items-start gap-3">
                <span className="text-2xl">&#x1F9E0;</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h2
                      className="text-sm font-bold"
                      style={{ color: RV_COLORS.text }}
                    >
                      心理ゲーム
                    </h2>
                    <span
                      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold"
                      style={{
                        background: "linear-gradient(135deg, rgba(123,97,255,0.12), rgba(123,97,255,0.06))",
                        color: RV_COLORS.secondary,
                      }}
                    >
                      Coming Soon
                    </span>
                  </div>
                  <p
                    className="text-xs leading-relaxed mb-3"
                    style={{ color: RV_COLORS.textSub }}
                  >
                    不定期開催。匿名の参加者と心理的なジレンマやゲームに挑戦。
                    ゲーム中に自然と「この人いいな」が生まれる。
                  </p>

                  <motion.button
                    onClick={() => setNotifyPsychGame(true)}
                    disabled={notifyPsychGame}
                    className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold border-none cursor-pointer transition-colors"
                    style={{
                      backgroundColor: notifyPsychGame ? RV_COLORS.surfaceMuted : RV_COLORS.surface,
                      color: notifyPsychGame ? RV_COLORS.textMuted : RV_COLORS.secondary,
                      border: `1px solid ${notifyPsychGame ? RV_COLORS.border : `rgba(123,97,255,0.20)`}`,
                    }}
                    whileTap={{ scale: 0.95 }}
                  >
                    {notifyPsychGame ? (
                      <>&#x2713; 通知を設定しました</>
                    ) : (
                      <>&#x1F514; 通知を受け取る</>
                    )}
                  </motion.button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* ===== Feature G: 星座形成 (Tertiary) ===== */}
        <motion.div
          custom={2}
          variants={staggerItem}
          initial="hidden"
          animate="show"
        >
          <div
            className="rounded-2xl overflow-hidden"
            style={{
              background: RV_COLORS.surface,
              border: `1px solid ${RV_COLORS.border}`,
              boxShadow: `0 2px 8px ${RV_COLORS.shadow}`,
            }}
          >
            <div className="px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl">&#x1F30C;</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h2
                      className="text-sm font-bold"
                      style={{ color: RV_COLORS.text }}
                    >
                      星座形成
                    </h2>
                    {/* Shimmer badge */}
                    <motion.span
                      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold"
                      style={{
                        backgroundColor: RV_COLORS.surfaceMuted,
                        color: RV_COLORS.textMuted,
                      }}
                      animate={{ opacity: [0.6, 1, 0.6] }}
                      transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                    >
                      準備中
                    </motion.span>
                  </div>
                  <p
                    className="text-xs leading-relaxed mt-1"
                    style={{ color: RV_COLORS.textSub }}
                  >
                    AIが化学反応の起きそうな3-5人を選出。24時間限定の匿名グループチャット。
                  </p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

      </div>
    </div>
  );
}
