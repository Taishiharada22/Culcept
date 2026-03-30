"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useCallback } from "react";
import {
  REMAIN_ITEMS,
  SEEKING_ITEMS,
  DIFFERENCE_ITEMS,
} from "@/lib/origin/v7/currentPositionData";
import type { CurrentPosition } from "@/lib/origin/v7/types";

type Props = {
  onComplete: (position: CurrentPosition) => void;
};

type SubStep = "remains" | "seeking" | "difference";
const SUB_STEPS: SubStep[] = ["remains", "seeking", "difference"];

export default function CurrentPositionStep({ onComplete }: Props) {
  const [subStep, setSubStep] = useState<SubStep>("remains");
  const [remains, setRemains] = useState<string[]>([]);
  const [seeking, setSeeking] = useState<string[]>([]);
  const [difference, setDifference] = useState<string[]>([]);

  const subIndex = SUB_STEPS.indexOf(subStep);

  const handleToggle = useCallback(
    (id: string, list: string[], setList: (v: string[]) => void, max: number) => {
      if (list.includes(id)) {
        setList(list.filter((x) => x !== id));
      } else if (list.length < max) {
        setList([...list, id]);
      }
    },
    [],
  );

  const handleNext = useCallback(() => {
    if (subStep === "remains" && remains.length > 0) {
      setSubStep("seeking");
    } else if (subStep === "seeking" && seeking.length > 0) {
      setSubStep("difference");
    } else if (subStep === "difference" && difference.length > 0) {
      onComplete({
        remains,
        seeking,
        difference,
        completedAt: new Date().toISOString(),
      });
    }
  }, [subStep, remains, seeking, difference, onComplete]);

  const handleBack = useCallback(() => {
    if (subStep === "seeking") setSubStep("remains");
    else if (subStep === "difference") setSubStep("seeking");
  }, [subStep]);

  const canProceed =
    (subStep === "remains" && remains.length >= 1) ||
    (subStep === "seeking" && seeking.length >= 1) ||
    (subStep === "difference" && difference.length >= 1);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col gap-5"
    >
      {/* Header */}
      <div className="text-center">
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-lg font-bold text-gray-800"
        >
          今のあなたから始める
        </motion.p>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="mt-1.5 text-xs leading-relaxed text-gray-400"
        >
          過去の断片は、今のあなたのプロフィールとして残っています。
          <br />
          まずは現在地点を置いてみましょう。
        </motion.p>
      </div>

      {/* Sub-step progress */}
      <div className="flex justify-center gap-1.5">
        {SUB_STEPS.map((s, i) => (
          <div
            key={s}
            className="h-1 rounded-full transition-all duration-300"
            style={{
              width: i === subIndex ? 24 : 8,
              background:
                i <= subIndex
                  ? "rgba(212,160,64,0.5)"
                  : "rgba(200,200,200,0.3)",
            }}
          />
        ))}
      </div>

      {/* Sub-step content */}
      <AnimatePresence mode="wait">
        {subStep === "remains" && (
          <SubStepView
            key="remains"
            question="今のあなたに残っているものを選んでください"
            hint="3つまで"
            items={REMAIN_ITEMS}
            selected={remains}
            onToggle={(id) => handleToggle(id, remains, setRemains, 3)}
          />
        )}
        {subStep === "seeking" && (
          <SubStepView
            key="seeking"
            question="今のあなたが探しているものに近いものは？"
            hint="1〜2つ"
            items={SEEKING_ITEMS}
            selected={seeking}
            onToggle={(id) => handleToggle(id, seeking, setSeeking, 2)}
          />
        )}
        {subStep === "difference" && (
          <SubStepView
            key="difference"
            question="今の自分と昔の自分の違いに近いものは？"
            hint="1〜2つ"
            items={DIFFERENCE_ITEMS}
            selected={difference}
            onToggle={(id) => handleToggle(id, difference, setDifference, 2)}
          />
        )}
      </AnimatePresence>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2">
        {subIndex > 0 ? (
          <button
            onClick={handleBack}
            className="rounded-full px-4 py-2 text-xs text-gray-400 hover:text-gray-600"
          >
            ← 戻る
          </button>
        ) : (
          <div />
        )}
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleNext}
          disabled={!canProceed}
          className={`
            rounded-2xl px-6 py-2.5 text-sm font-medium transition-all
            ${canProceed
              ? "bg-amber-400/80 text-white shadow-sm hover:bg-amber-400/90"
              : "bg-gray-200/50 text-gray-300 cursor-not-allowed"}
          `}
        >
          {subStep === "difference" ? "現在地点を置く" : "次へ"}
        </motion.button>
      </div>
    </motion.div>
  );
}

/* ── Sub-step card grid ── */

function SubStepView({
  question,
  hint,
  items,
  selected,
  onToggle,
}: {
  question: string;
  hint: string;
  items: { id: string; label: string; icon: string }[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.25 }}
      className="flex flex-col gap-3"
    >
      <div>
        <p className="text-sm font-medium text-gray-700">{question}</p>
        <p className="mt-0.5 text-[10px] text-gray-400">{hint}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {items.map((item, i) => {
          const isSelected = selected.includes(item.id);
          return (
            <motion.button
              key={item.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => onToggle(item.id)}
              className={`
                flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs transition-all duration-200
                ${isSelected
                  ? "bg-amber-50 text-amber-800 ring-1 ring-amber-300/50 shadow-sm"
                  : "bg-white/50 text-gray-600 hover:bg-white/70"}
              `}
            >
              <span className="text-sm">{item.icon}</span>
              {item.label}
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
}
