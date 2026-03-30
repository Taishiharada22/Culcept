"use client";

/**
 * MemoryCrystalBadge — チャットヘッダーに表示する結晶バッジ
 * count > 0 で光る。クリックで結晶ギャラリーを開く。
 */

import { motion } from "framer-motion";

type Props = {
  count: number;
  onClick: () => void;
};

export default function MemoryCrystalBadge({ count, onClick }: Props) {
  if (count <= 0) return null;

  return (
    <>
      <style>{`
        @keyframes rv-badge-glow {
          0%, 100% { box-shadow: 0 0 4px rgba(99,102,241,0.2); }
          50% { box-shadow: 0 0 10px rgba(99,102,241,0.4); }
        }
      `}</style>
      <motion.button
        onClick={onClick}
        whileTap={{ scale: 0.9 }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "4px 10px",
          borderRadius: 12,
          border: "1px solid rgba(99,102,241,0.15)",
          background: "rgba(99,102,241,0.08)",
          cursor: "pointer",
          fontSize: 12,
          color: "#a78bfa",
          fontWeight: 700,
          animation: "rv-badge-glow 3s ease-in-out infinite",
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 14 }}>💎</span>
        <span>{count}</span>
      </motion.button>
    </>
  );
}
