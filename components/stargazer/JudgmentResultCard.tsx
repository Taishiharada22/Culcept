"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  title: string;
  icon: string;
  judgment: unknown;
  variant?: "dark" | "light";
}

export default function JudgmentResultCard({ children, title, icon, variant = "dark" }: Props) {
  const isDark = variant === "dark";
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4 p-4 rounded-xl"
      style={{
        background: isDark ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.06)",
        border: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(255,255,255,0.12)",
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{icon}</span>
        <h4 className="font-body text-sm font-semibold text-white/70">{title}</h4>
      </div>
      {children}
    </motion.div>
  );
}
