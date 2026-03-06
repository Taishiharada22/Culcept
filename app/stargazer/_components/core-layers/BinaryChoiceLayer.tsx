"use client";

import { motion } from "framer-motion";

interface QuestionOption {
  emoji: string;
  label: string;
}

interface Props {
  optionA: QuestionOption;
  optionB: QuestionOption;
  selectedChoice: "A" | "B" | null;
  onSelect: (choice: "A" | "B") => void;
}

export default function BinaryChoiceLayer({ optionA, optionB, selectedChoice, onSelect }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {(["A", "B"] as const).map((choice) => {
        const option = choice === "A" ? optionA : optionB;
        const isSelected = selectedChoice === choice;
        return (
          <motion.button
            key={choice}
            whileTap={{ scale: 0.97 }}
            onClick={() => onSelect(choice)}
            className="p-4 rounded-xl border transition-all text-center"
            style={{
              background: isSelected
                ? "rgba(251,191,36,0.15)"
                : "rgba(255,255,255,0.04)",
              border: isSelected
                ? "1px solid rgba(251,191,36,0.3)"
                : "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <span className="text-3xl block mb-2">{option.emoji}</span>
            <span
              className={`text-sm font-medium ${
                isSelected ? "text-amber-200" : "text-white/60"
              }`}
            >
              {option.label}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}
