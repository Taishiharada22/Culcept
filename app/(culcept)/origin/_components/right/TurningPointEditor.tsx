"use client";

import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import type {
  TurningPoint,
  TurningPointCategory,
  AnalyticalFrame,
} from "@/lib/origin/v7/workspaceTypes";
import { createEmptyAnalyticalFrame } from "@/lib/origin/v7/workspaceTypes";
import type { LifePeriod } from "@/lib/origin/v7/types";
import type { FrameSuggestion } from "@/lib/origin/v7/assistedFill";
import {
  TURNING_POINT_CATEGORY_CARDS,
  IMPACT_CARDS,
} from "@/lib/origin/v7/turningPointData";
import { PERIOD_DEFS } from "@/lib/origin/v7/periods";
import AnalyticalFrameEditor from "../AnalyticalFrameEditor";
import SuggestionChips from "../SuggestionChips";

type Props = {
  turningPoint: TurningPoint | null;
  onSave: (tp: TurningPoint) => void;
  onDelete?: (id: string) => void;
  onClose: () => void;
  frameSuggestions?: FrameSuggestion[];
};

function createEmptyTurningPoint(): TurningPoint {
  return {
    id: crypto.randomUUID(),
    period: "elementary",
    category: "beginning",
    title: "",
    impact: "significant",
    analyticalFrame: null,
  };
}

export default function TurningPointEditor({ turningPoint, onSave, onDelete, onClose, frameSuggestions }: Props) {
  const isNew = !turningPoint;
  const [draft, setDraft] = useState<TurningPoint>(
    turningPoint ?? createEmptyTurningPoint(),
  );
  const [showFrame, setShowFrame] = useState(draft.analyticalFrame !== null);

  const updateDraft = useCallback(
    (updates: Partial<TurningPoint>) => {
      setDraft((prev) => ({ ...prev, ...updates }));
    },
    [],
  );

  const handleSave = useCallback(() => {
    if (!draft.title.trim()) return;
    onSave(draft);
  }, [draft, onSave]);

  const handleFrameChange = useCallback(
    (frame: AnalyticalFrame) => {
      setDraft((prev) => ({ ...prev, analyticalFrame: frame }));
    },
    [],
  );

  const toggleFrame = useCallback(() => {
    if (!showFrame) {
      setShowFrame(true);
      if (!draft.analyticalFrame) {
        setDraft((prev) => ({
          ...prev,
          analyticalFrame: createEmptyAnalyticalFrame(),
        }));
      }
    } else {
      setShowFrame(false);
    }
  }, [showFrame, draft.analyticalFrame]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">⚡</span>
          <h3 className="text-sm font-bold text-gray-800">
            {isNew ? "転機を追加" : "転機を編集"}
          </h3>
        </div>
        <button
          onClick={onClose}
          className="rounded-full p-1.5 text-gray-400 transition-colors hover:bg-gray-100/50 hover:text-gray-600"
        >
          <span className="text-sm">✕</span>
        </button>
      </div>

      {/* Title */}
      <section>
        <label className="mb-1.5 block text-xs font-semibold text-gray-600">
          タイトル
        </label>
        <input
          type="text"
          value={draft.title}
          onChange={(e) => updateDraft({ title: e.target.value })}
          placeholder="例：部活を辞めた、転校した、就職した"
          className="w-full rounded-xl border border-gray-200/60 bg-white/70 px-3 py-2.5 text-sm text-gray-700 placeholder-gray-400 outline-none transition-all focus:border-amber-300/70 focus:bg-white/90 focus:ring-1 focus:ring-amber-200/50"
        />
      </section>

      {/* Category */}
      <section>
        <label className="mb-2 block text-xs font-semibold text-gray-600">
          種類
        </label>
        <div className="flex flex-wrap gap-1.5">
          {TURNING_POINT_CATEGORY_CARDS.map((card) => {
            const isSelected = draft.category === card.id;
            return (
              <motion.button
                key={card.id}
                whileTap={{ scale: 0.95 }}
                onClick={() => updateDraft({ category: card.id })}
                className={`
                  rounded-xl px-2.5 py-1.5 text-left transition-all
                  ${
                    isSelected
                      ? "border border-amber-400/70 bg-amber-50/90 shadow-sm"
                      : "border border-gray-200/50 bg-white/50 hover:border-amber-200/60 hover:bg-white/70"
                  }
                `}
              >
                <div className="flex items-center gap-1">
                  <span className="text-xs">{card.icon}</span>
                  <span className={`text-[11px] font-medium ${isSelected ? "text-amber-800" : "text-gray-700"}`}>
                    {card.label}
                  </span>
                </div>
              </motion.button>
            );
          })}
        </div>
      </section>

      {/* Period */}
      <section>
        <label className="mb-2 block text-xs font-semibold text-gray-600">
          時期
        </label>
        <div className="flex flex-wrap gap-1.5">
          {PERIOD_DEFS.map((p) => {
            const isSelected = draft.period === p.id;
            return (
              <motion.button
                key={p.id}
                whileTap={{ scale: 0.95 }}
                onClick={() => updateDraft({ period: p.id as LifePeriod })}
                className={`
                  rounded-full px-3 py-1.5 text-xs font-medium transition-all
                  ${
                    isSelected
                      ? "border border-amber-400/70 bg-amber-50/90 text-amber-800 shadow-sm"
                      : "border border-gray-200/60 bg-white/60 text-gray-600 hover:border-amber-200/60 hover:bg-white/80"
                  }
                `}
              >
                <span className="mr-1">{p.icon}</span>
                {p.label}
              </motion.button>
            );
          })}
        </div>
      </section>

      {/* Impact */}
      <section>
        <label className="mb-2 block text-xs font-semibold text-gray-600">
          影響度
        </label>
        <div className="space-y-1.5">
          {IMPACT_CARDS.map((card) => {
            const isSelected = draft.impact === card.id;
            return (
              <motion.button
                key={card.id}
                whileTap={{ scale: 0.97 }}
                onClick={() =>
                  updateDraft({
                    impact: card.id as "transformative" | "significant" | "subtle",
                  })
                }
                className={`
                  flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left transition-all
                  ${
                    isSelected
                      ? "border border-amber-400/70 bg-amber-50/90 shadow-sm"
                      : "border border-gray-200/50 bg-white/50 hover:border-amber-200/60 hover:bg-white/70"
                  }
                `}
              >
                <span className="text-sm">{card.icon}</span>
                <div>
                  <span className={`text-xs font-medium ${isSelected ? "text-amber-800" : "text-gray-700"}`}>
                    {card.label}
                  </span>
                  <p className="text-[10px] text-gray-400">{card.description}</p>
                </div>
              </motion.button>
            );
          })}
        </div>
      </section>

      {/* Frame Suggestions */}
      {frameSuggestions && frameSuggestions.length > 0 && !showFrame && (
        <section className="rounded-2xl border border-amber-100/50 bg-amber-50/20 p-3 space-y-2">
          <p className="text-[10px] font-medium text-amber-600/70">
            💡 分析フレームへの推測候補があります
          </p>
          {frameSuggestions.slice(0, 3).map((fs) => (
            <div key={fs.fieldKey}>
              <p className="mb-0.5 text-[10px] text-gray-500">
                {getFrameFieldLabel(fs.fieldKey)}
              </p>
              <SuggestionChips
                suggestions={fs.suggestions}
                onAccept={(value) => {
                  if (!draft.analyticalFrame) {
                    const frame = createEmptyAnalyticalFrame();
                    (frame as Record<string, unknown>)[fs.fieldKey] = value;
                    setDraft((prev) => ({ ...prev, analyticalFrame: frame }));
                  } else {
                    setDraft((prev) => ({
                      ...prev,
                      analyticalFrame: {
                        ...prev.analyticalFrame!,
                        [fs.fieldKey]: value,
                      },
                    }));
                  }
                  setShowFrame(true);
                }}
              />
            </div>
          ))}
        </section>
      )}

      {/* Analytical Frame toggle */}
      <section>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={toggleFrame}
          className="flex w-full items-center justify-between rounded-2xl border border-amber-200/50 bg-amber-50/30 px-4 py-3 transition-all hover:bg-amber-50/50"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm">🔍</span>
            <span className="text-xs font-semibold text-gray-700">
              分析フレーム（14問）
            </span>
          </div>
          <span className="text-[10px] text-amber-600">
            {showFrame ? "閉じる" : "開く"}
          </span>
        </motion.button>

        {showFrame && draft.analyticalFrame && (
          <div className="mt-3">
            <AnalyticalFrameEditor
              frame={draft.analyticalFrame}
              onChange={handleFrameChange}
            />
          </div>
        )}
      </section>

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleSave}
          disabled={!draft.title.trim()}
          className={`
            flex-1 rounded-2xl py-2.5 text-sm font-semibold shadow-md transition-all
            ${
              draft.title.trim()
                ? "bg-amber-400/90 text-white hover:bg-amber-500/90"
                : "bg-gray-200/60 text-gray-400 cursor-not-allowed"
            }
          `}
        >
          {isNew ? "追加する" : "保存する"}
        </motion.button>
        {!isNew && onDelete && (
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => onDelete(draft.id)}
            className="rounded-2xl bg-red-50/80 px-4 py-2.5 text-sm font-medium text-red-500 transition-all hover:bg-red-100/80"
          >
            削除
          </motion.button>
        )}
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={onClose}
          className="rounded-2xl bg-white/70 px-4 py-2.5 text-sm font-medium text-gray-600 transition-all hover:bg-white/90"
        >
          キャンセル
        </motion.button>
      </div>
    </div>
  );
}

function getFrameFieldLabel(key: string): string {
  const labels: Record<string, string> = {
    role: "役割",
    environment: "環境",
    pressure: "プレッシャー",
    reward: "報酬",
    whatRemains: "今に残るもの",
    whatLost: "何を失ったか",
    learnedRules: "学んだルール",
    emotionalIntensity: "感情の強さ",
    autonomyLevel: "自律度",
    whyStarted: "なぜ始めたか",
    whyEnded: "なぜ終わったか",
    whatGained: "何を得たか",
    repeatedPattern: "繰り返しパターン",
    whatIfCounterfactual: "もしも別の選択をしていたら",
  };
  return labels[key] ?? key;
}
