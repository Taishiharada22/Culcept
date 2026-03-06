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
      <p className="text-[10px] text-white/25 tracking-wider mb-2">
        どんな場面で？（任意）
      </p>
      <div className="flex flex-wrap gap-2">
        {SITUATIONS.map((sit) => {
          const isSelected = selectedId === sit.id;
          return (
            <motion.button
              key={sit.id}
              whileTap={{ scale: 0.95 }}
              onClick={() => onSelect(isSelected ? null : sit.id)}
              className="px-3 py-1.5 rounded-full text-xs font-medium transition-all"
              style={{
                background: isSelected
                  ? "rgba(251,191,36,0.2)"
                  : "rgba(251,191,36,0.06)",
                border: isSelected
                  ? "1px solid rgba(251,191,36,0.4)"
                  : "1px solid rgba(251,191,36,0.12)",
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
