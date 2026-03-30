"use client";

/**
 * TypingIndicator
 * 相手が入力中であることを表示する、3つのバウンスするドットアニメーション
 * パートナーのミニアバター + 「入力中...」テキスト付き
 */

import { motion, AnimatePresence } from "framer-motion";

type Props = {
  visible: boolean;
  partnerName?: string;
  /** パートナーのアバター画像URL */
  partnerAvatarUrl?: string;
};

const dotVariants = {
  initial: { y: 0, opacity: 0.4 },
  animate: (i: number) => ({
    y: [0, -6, 0],
    opacity: [0.4, 1, 0.4],
    transition: {
      duration: 1.2,
      repeat: Infinity,
      delay: i * 0.15,
      ease: "easeInOut" as const,
    },
  }),
};

export default function TypingIndicator({
  visible,
  partnerName,
  partnerAvatarUrl,
}: Props) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 8, height: 0 }}
          animate={{ opacity: 1, y: 0, height: "auto" }}
          exit={{ opacity: 0, y: 8, height: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            paddingLeft: 4,
            paddingBottom: 4,
          }}
        >
          {/* パートナーミニアバター */}
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: "50%",
              background: partnerAvatarUrl
                ? `url(${partnerAvatarUrl}) center/cover no-repeat`
                : "linear-gradient(135deg, #C4B5FD, #A78BFA)",
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 10,
              color: "#fff",
              fontWeight: 700,
              overflow: "hidden",
            }}
          >
            {!partnerAvatarUrl && (partnerName?.[0] ?? "?")}
          </div>

          {/* バブル */}
          <motion.div
            style={{
              padding: "8px 14px",
              borderRadius: "14px 14px 14px 4px",
              background: "rgba(255,255,255,0.7)",
              border: "1px solid rgba(99,102,241,0.06)",
              backdropFilter: "blur(8px)",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            {/* 3つのバウンスするドット */}
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  custom={i}
                  variants={dotVariants}
                  initial="initial"
                  animate="animate"
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background:
                      "linear-gradient(135deg, #6366F1, #8B5CF6)",
                    display: "block",
                  }}
                />
              ))}
            </div>

            {/* テキスト */}
            <span
              style={{
                fontSize: 11,
                color: "rgba(99,102,241,0.6)",
                fontWeight: 500,
                letterSpacing: 0.3,
              }}
            >
              入力中...
            </span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
