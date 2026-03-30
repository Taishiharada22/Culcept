"use client";

import { motion } from "framer-motion";
import type {
  WhyStartedReason,
  WhyContinuedReason,
  WhyStoppedReason,
} from "@/lib/origin/v7/workspaceTypes";
import {
  WHY_STARTED_CARDS,
  WHY_CONTINUED_CARDS,
  WHY_STOPPED_CARDS,
  type WhyReasonCard,
} from "@/lib/origin/v7/whyLedgerData";

type WhyPhase = "started" | "continued" | "stopped";

type Props = {
  phase: WhyPhase;
  selected: string[];
  onChange: (selected: string[]) => void;
};

const PHASE_CONFIG: Record<
  WhyPhase,
  { title: string; icon: string; cards: WhyReasonCard<string>[] }
> = {
  started: {
    title: "始めた理由",
    icon: "🌅",
    cards: WHY_STARTED_CARDS as WhyReasonCard<string>[],
  },
  continued: {
    title: "続けた理由",
    icon: "🔄",
    cards: WHY_CONTINUED_CARDS as WhyReasonCard<string>[],
  },
  stopped: {
    title: "やめた理由",
    icon: "🌆",
    cards: WHY_STOPPED_CARDS as WhyReasonCard<string>[],
  },
};

export default function WhyLedgerCards({ phase, selected, onChange }: Props) {
  const config = PHASE_CONFIG[phase];

  const toggle = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5">
        <span className="text-sm">{config.icon}</span>
        <h4 className="text-xs font-semibold text-gray-700">{config.title}</h4>
        {selected.length > 0 && (
          <span className="ml-auto text-[10px] text-amber-600">
            {selected.length}個選択
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {config.cards.map((card) => {
          const isSelected = selected.includes(card.id);
          return (
            <motion.button
              key={card.id}
              whileTap={{ scale: 0.95 }}
              onClick={() => toggle(card.id)}
              className={`
                rounded-full px-3 py-1.5 text-xs font-medium transition-all
                ${
                  isSelected
                    ? "border border-amber-400/70 bg-amber-50/90 text-amber-800 shadow-sm"
                    : "border border-gray-200/60 bg-white/60 text-gray-600 hover:border-amber-200/60 hover:bg-white/80"
                }
              `}
            >
              <span className="mr-1">{card.icon}</span>
              {card.label}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

export type { WhyPhase };
