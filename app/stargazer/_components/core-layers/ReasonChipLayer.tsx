"use client";

import { motion } from "framer-motion";

interface Props {
  accentColor: "indigo" | "amber";
  onSelect: (chipId: string) => void;
  selectedId: string | null;
}

const REASON_CHIPS = [
  { id: "intuition", label: "直感で" },
  { id: "experience", label: "経験から" },
  { id: "logic", label: "論理的に" },
  { id: "feeling", label: "感覚で" },
  { id: "unsure", label: "迷いつつ" },
];

export default function ReasonChipLayer({ accentColor, onSelect, selectedId }: Props) {
  const isAmber = accentColor === "amber";
  const pillBg = isAmber ? "rgba(251,191,36,0.12)" : "rgba(251,191,36,0.12)";
  const pillBorder = isAmber ? "rgba(251,191,36,0.25)" : "rgba(251,191,36,0.25)";
  const selectedBg = isAmber ? "rgba(251,191,36,0.25)" : "rgba(251,191,36,0.25)";
  const selectedBorder = isAmber ? "rgba(251,191,36,0.5)" : "rgba(251,191,36,0.5)";
  const selectedShadow = "0 0 16px rgba(251,191,36,0.3)";

  return (
    <div>
      <p className="text-[10px] text-white/25 tracking-wider mb-2">
        なぜその選択？（任意）
      </p>
      <div className="flex flex-wrap gap-2">
        {REASON_CHIPS.map((chip) => {
          const isSelected = selectedId === chip.id;
          return (
            <motion.button
              key={chip.id}
              whileTap={{ scale: 0.95 }}
              onClick={() => onSelect(isSelected ? "" : chip.id)}
              className="px-3 py-1.5 rounded-full text-xs font-medium transition-all"
              style={{
                background: isSelected ? selectedBg : pillBg,
                border: `1px solid ${isSelected ? selectedBorder : pillBorder}`,
                boxShadow: isSelected ? selectedShadow : "none",
                color: isSelected ? "rgba(253,230,138,0.9)" : "rgba(255,255,255,0.5)",
              }}
            >
              {chip.label}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
