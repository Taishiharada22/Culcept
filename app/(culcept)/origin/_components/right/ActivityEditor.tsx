"use client";

import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import type {
  ActivityEntry,
  ActivityCategory,
  AnalyticalFrame,
} from "@/lib/origin/v7/workspaceTypes";
import { createEmptyAnalyticalFrame } from "@/lib/origin/v7/workspaceTypes";
import type { LifePeriod } from "@/lib/origin/v7/types";
import type { FrameSuggestion } from "@/lib/origin/v7/assistedFill";
import {
  ACTIVITY_CATEGORY_CARDS,
  TIME_ALLOCATION_CARDS,
} from "@/lib/origin/v7/activityData";
import { PERIOD_DEFS } from "@/lib/origin/v7/periods";
import AnalyticalFrameEditor from "../AnalyticalFrameEditor";
import SuggestionChips from "../SuggestionChips";

type Props = {
  activity: ActivityEntry | null;
  onSave: (activity: ActivityEntry) => void;
  onDelete?: (id: string) => void;
  onClose: () => void;
  frameSuggestions?: FrameSuggestion[];
};

function createEmptyActivity(): ActivityEntry {
  return {
    id: crypto.randomUUID(),
    name: "",
    category: "other",
    period: "elementary",
    leadershipRole: false,
    caretakerRole: false,
    timeAllocation: "secondary",
    analyticalFrame: null,
  };
}

export default function ActivityEditor({ activity, onSave, onDelete, onClose, frameSuggestions }: Props) {
  const isNew = !activity;
  const [draft, setDraft] = useState<ActivityEntry>(activity ?? createEmptyActivity());
  const [showFrame, setShowFrame] = useState(draft.analyticalFrame !== null);

  const updateDraft = useCallback(
    (updates: Partial<ActivityEntry>) => {
      setDraft((prev) => ({ ...prev, ...updates }));
    },
    [],
  );

  const handleSave = useCallback(() => {
    if (!draft.name.trim()) return;
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
          <span className="text-lg">📋</span>
          <h3 className="text-sm font-bold text-gray-800">
            {isNew ? "活動を追加" : "活動を編集"}
          </h3>
        </div>
        <button
          onClick={onClose}
          className="rounded-full p-1.5 text-gray-400 transition-colors hover:bg-gray-100/50 hover:text-gray-600"
        >
          <span className="text-sm">✕</span>
        </button>
      </div>

      {/* Name */}
      <section>
        <label className="mb-1.5 block text-xs font-semibold text-gray-600">
          活動名
        </label>
        <input
          type="text"
          value={draft.name}
          onChange={(e) => updateDraft({ name: e.target.value })}
          placeholder="例：吹奏楽部、プログラミング、コンビニバイト"
          className="w-full rounded-xl border border-gray-200/60 bg-white/70 px-3 py-2.5 text-sm text-gray-700 placeholder-gray-400 outline-none transition-all focus:border-amber-300/70 focus:bg-white/90 focus:ring-1 focus:ring-amber-200/50"
        />
      </section>

      {/* Category */}
      <section>
        <label className="mb-2 block text-xs font-semibold text-gray-600">
          カテゴリ
        </label>
        <div className="flex flex-wrap gap-1.5">
          {ACTIVITY_CATEGORY_CARDS.map((card) => {
            const isSelected = draft.category === card.id;
            return (
              <motion.button
                key={card.id}
                whileTap={{ scale: 0.95 }}
                onClick={() => updateDraft({ category: card.id })}
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

      {/* Time allocation */}
      <section>
        <label className="mb-2 block text-xs font-semibold text-gray-600">
          時間配分
        </label>
        <div className="space-y-1.5">
          {TIME_ALLOCATION_CARDS.map((card) => {
            const isSelected = draft.timeAllocation === card.id;
            return (
              <motion.button
                key={card.id}
                whileTap={{ scale: 0.97 }}
                onClick={() =>
                  updateDraft({
                    timeAllocation: card.id as "main" | "secondary" | "occasional",
                  })
                }
                className={`
                  flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left transition-all
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

      {/* Role toggles */}
      <section>
        <label className="mb-2 block text-xs font-semibold text-gray-600">
          担っていた役割
        </label>
        <div className="flex gap-2">
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => updateDraft({ leadershipRole: !draft.leadershipRole })}
            className={`
              flex-1 rounded-xl px-3 py-2.5 text-center text-xs font-medium transition-all
              ${
                draft.leadershipRole
                  ? "border border-amber-400/70 bg-amber-50/90 text-amber-800 shadow-sm"
                  : "border border-gray-200/50 bg-white/50 text-gray-600 hover:bg-white/70"
              }
            `}
          >
            👑 リーダー的役割
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => updateDraft({ caretakerRole: !draft.caretakerRole })}
            className={`
              flex-1 rounded-xl px-3 py-2.5 text-center text-xs font-medium transition-all
              ${
                draft.caretakerRole
                  ? "border border-amber-400/70 bg-amber-50/90 text-amber-800 shadow-sm"
                  : "border border-gray-200/50 bg-white/50 text-gray-600 hover:bg-white/70"
              }
            `}
          >
            🤝 世話役的役割
          </motion.button>
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
          disabled={!draft.name.trim()}
          className={`
            flex-1 rounded-2xl py-2.5 text-sm font-semibold shadow-md transition-all
            ${
              draft.name.trim()
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
