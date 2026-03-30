"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { RV_COLORS } from "@/components/ui/rendezvous-design";

// =============================================================================
// TonightSessionBanner — ホーム画面上部のセッション予告バナー
// =============================================================================

export function TonightSessionBanner() {
  const router = useRouter();

  return (
    <motion.button
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => router.push("/rendezvous/live")}
      className="w-full rounded-2xl px-4 py-3 flex items-center gap-3 text-left"
      style={{
        background: `linear-gradient(135deg, ${RV_COLORS.primary}08 0%, ${RV_COLORS.accent}08 100%)`,
        border: `1px solid ${RV_COLORS.primary}15`,
      }}
    >
      <motion.span
        animate={{ scale: [1, 1.15, 1] }}
        transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
        className="text-2xl"
      >
        🎭
      </motion.span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold" style={{ color: RV_COLORS.text }}>
          匿名セッション受付中
        </p>
        <p className="text-[10px]" style={{ color: RV_COLORS.textMuted }}>
          誰かと5分間、匿名で話してみませんか？
        </p>
      </div>
      <span className="text-xs" style={{ color: RV_COLORS.primary }}>
        参加 →
      </span>
    </motion.button>
  );
}
