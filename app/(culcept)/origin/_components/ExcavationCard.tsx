"use client";

import { motion } from "framer-motion";
import type { ExplorationAxis } from "@/lib/origin/v7/types";

type Props = {
  axis: ExplorationAxis;
  label: string;
  description: string;
  icon: string;
  onClick: () => void;
};

export default function ExcavationCard({
  label,
  description,
  icon,
  onClick,
}: Props) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl bg-white/60 backdrop-blur-sm px-4 py-3.5 text-left shadow-sm ring-1 ring-amber-200/15 transition-colors hover:bg-white/80"
    >
      <span className="text-lg">{icon}</span>
      <div className="flex flex-col">
        <span className="text-xs font-medium text-gray-700">{label}</span>
        <span className="text-[10px] text-gray-400">{description}</span>
      </div>
    </motion.button>
  );
}
