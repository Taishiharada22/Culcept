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
            whileTap={{ scale: 0.93 }}
            onClick={() => onSelect(choice)}
            aria-label={option.label}
            aria-pressed={isSelected}
            className="p-4 rounded-xl border transition-all text-center"
            style={{
              background: isSelected
                ? "rgba(251,191,36,0.15)"
                : "rgba(255,255,255,0.04)",
              border: isSelected
                ? "1px solid rgba(251,191,36,0.3)"
                : "1px solid rgba(255,255,255,0.08)",
            }}
            animate={{
              scale: isSelected ? [0.93, 1.05, 1.0] : selectedChoice !== null ? 0.95 : 1.0,
              opacity: selectedChoice !== null && !isSelected ? 0.4 : 1,
              boxShadow: isSelected
                ? "0 0 16px rgba(251,191,36,0.25)"
                : "0 0 0px transparent",
            }}
            transition={{
              type: "spring",
              stiffness: 400,
              damping: 15,
              opacity: { duration: 0.1 },
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
