"use client";

import { motion } from "framer-motion";

interface Props {
  message?: string;
  requiredCount?: number;
  currentCount?: number;
}

export default function LockedOverlay({
  message = "もう少し観測を続けましょう",
  requiredCount,
  currentCount,
}: Props) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center justify-center py-16 text-center"
    >
      <span className="text-4xl mb-4">🔒</span>
      <p className="font-body text-sm text-white/50 mb-2">{message}</p>
      {requiredCount && currentCount !== undefined && (
        <p className="text-xs text-white/30 font-mono">
          {currentCount}/{requiredCount} 観測完了
        </p>
      )}
    </motion.div>
  );
}
