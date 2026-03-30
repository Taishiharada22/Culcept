"use client";

import { motion, AnimatePresence } from "framer-motion";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";

/**
 * ページ遷移アニメーション
 *
 * 脳科学的根拠: スムーズな遷移は前頭前皮質の認知負荷を下げ、
 * 連続性の錯覚を作る (change blindness prevention)。
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{
          duration: 0.2,
          ease: [0.25, 0.1, 0.25, 1.0],
        }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
