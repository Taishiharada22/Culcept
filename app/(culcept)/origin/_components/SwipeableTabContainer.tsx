"use client";

import { useCallback, useRef } from "react";
import { motion, AnimatePresence, type PanInfo } from "framer-motion";

interface Props<T extends string> {
  tabs: T[];
  activeTab: T;
  onTabChange: (tab: T) => void;
  children: React.ReactNode;
}

const SWIPE_THRESHOLD = 50;
const SWIPE_VELOCITY = 300;

/**
 * 左右スワイプでタブ切替するコンテナ
 * モバイル専用 (lg:hidden)
 */
export default function SwipeableTabContainer<T extends string>({
  tabs,
  activeTab,
  onTabChange,
  children,
}: Props<T>) {
  const directionRef = useRef(0);

  const handleDragEnd = useCallback(
    (_e: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      const currentIdx = tabs.indexOf(activeTab);
      if (currentIdx < 0) return;

      // 左スワイプ → 次のタブ
      if (
        (info.offset.x < -SWIPE_THRESHOLD || info.velocity.x < -SWIPE_VELOCITY) &&
        currentIdx < tabs.length - 1
      ) {
        directionRef.current = 1;
        onTabChange(tabs[currentIdx + 1]);
        return;
      }

      // 右スワイプ → 前のタブ
      if (
        (info.offset.x > SWIPE_THRESHOLD || info.velocity.x > SWIPE_VELOCITY) &&
        currentIdx > 0
      ) {
        directionRef.current = -1;
        onTabChange(tabs[currentIdx - 1]);
      }
    },
    [tabs, activeTab, onTabChange],
  );

  return (
    <motion.div
      className="h-full lg:hidden"
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.15}
      onDragEnd={handleDragEnd}
      style={{ touchAction: "pan-y" }}
    >
      <AnimatePresence mode="wait" custom={directionRef.current}>
        <motion.div
          key={activeTab}
          custom={directionRef.current}
          initial={{ opacity: 0, x: directionRef.current * 60 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: directionRef.current * -60 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="h-full"
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}
