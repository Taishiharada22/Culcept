"use client";

import { motion } from "framer-motion";

interface Props {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

const SITUATIONS = [
  { id: "solo", label: "一人のとき", emoji: "🧘" },
  { id: "close", label: "親しい人と", emoji: "💫" },
  { id: "group", label: "集団の中で", emoji: "👥" },
  { id: "pressure", label: "プレッシャー下", emoji: "⚡" },
];

export default function SituationSwitchLayer({ selectedId, onSelect }: Props) {
  return (
    <div>
      <p className="text-xs text-white/25 tracking-wider mb-2">
        どんな場面で？（任意）
      </p>
      <div className="flex flex-wrap gap-2">
        {SITUATIONS.map((sit) => {
          const isSelected = selectedId === sit.id;
          return (
            <motion.button
              key={sit.id}
              whileTap={{ scale: 0.93 }}
              onClick={() => onSelect(isSelected ? null : sit.id)}
              aria-label={`${sit.label}の場面を${isSelected ? "解除" : "選択"}`}
              aria-pressed={isSelected}
              className="px-3 py-1.5 rounded-full text-xs font-medium transition-all"
              style={{
                background: isSelected
                  ? "rgba(251,191,36,0.2)"
                  : "rgba(251,191,36,0.06)",
                border: isSelected
                  ? "1px solid rgba(251,191,36,0.4)"
                  : "1px solid rgba(251,191,36,0.12)",
              }}
              animate={{
                boxShadow: isSelected
                  ? ["0 0 0px rgba(251,191,36,0)", "0 0 12px rgba(251,191,36,0.25)", "0 0 0px rgba(251,191,36,0)"]
                  : "0 0 0px rgba(251,191,36,0)",
              }}
              transition={{
                boxShadow: { duration: 2, repeat: Infinity, ease: "easeInOut" },
                type: "spring",
                stiffness: 400,
                damping: 15,
              }}
            >
              <span className="text-amber-300/80 text-xs">
                {sit.emoji} {sit.label}
              </span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
