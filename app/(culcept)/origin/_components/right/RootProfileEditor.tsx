"use client";

import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import type { RootProfile, HomeAtmosphere } from "@/lib/origin/v7/workspaceTypes";
import { createEmptyRootProfile } from "@/lib/origin/v7/workspaceTypes";
import {
  HOME_ATMOSPHERE_CARDS,
  DISTANCE_CARDS,
} from "@/lib/origin/v7/rootProfileData";

type Props = {
  profile: RootProfile | undefined;
  onSave: (profile: RootProfile) => void;
  onClose: () => void;
};

export default function RootProfileEditor({ profile, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<RootProfile>(
    profile ?? createEmptyRootProfile(),
  );

  const updateDraft = useCallback(
    (updates: Partial<RootProfile>) => {
      setDraft((prev) => ({ ...prev, ...updates }));
    },
    [],
  );

  const handleSave = useCallback(() => {
    onSave({ ...draft, completedAt: new Date().toISOString() });
  }, [draft, onSave]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">🏠</span>
          <h3 className="text-sm font-bold text-gray-800">ルーツ</h3>
        </div>
        <button
          onClick={onClose}
          className="rounded-full p-1.5 text-gray-400 transition-colors hover:bg-gray-100/50 hover:text-gray-600"
        >
          <span className="text-sm">✕</span>
        </button>
      </div>

      {/* Birthplace */}
      <section>
        <label className="mb-1.5 block text-xs font-semibold text-gray-600">
          出身地
        </label>
        <input
          type="text"
          value={draft.birthplace}
          onChange={(e) => updateDraft({ birthplace: e.target.value })}
          placeholder="例：東京都港区、大阪府、北海道"
          className="w-full rounded-xl border border-gray-200/60 bg-white/70 px-3 py-2.5 text-sm text-gray-700 placeholder-gray-400 outline-none transition-all focus:border-amber-300/70 focus:bg-white/90 focus:ring-1 focus:ring-amber-200/50"
        />
      </section>

      {/* Childhood location */}
      <section>
        <label className="mb-1.5 block text-xs font-semibold text-gray-600">
          育った場所
        </label>
        <input
          type="text"
          value={draft.childhoodLocation}
          onChange={(e) => updateDraft({ childhoodLocation: e.target.value })}
          placeholder="例：神奈川県横浜市（出身地と同じなら空欄でOK）"
          className="w-full rounded-xl border border-gray-200/60 bg-white/70 px-3 py-2.5 text-sm text-gray-700 placeholder-gray-400 outline-none transition-all focus:border-amber-300/70 focus:bg-white/90 focus:ring-1 focus:ring-amber-200/50"
        />
      </section>

      {/* Home atmosphere */}
      <section>
        <label className="mb-2 block text-xs font-semibold text-gray-600">
          家庭の雰囲気
        </label>
        <div className="flex flex-wrap gap-1.5">
          {HOME_ATMOSPHERE_CARDS.map((card) => {
            const isSelected = draft.homeAtmosphere === card.id;
            return (
              <motion.button
                key={card.id}
                whileTap={{ scale: 0.95 }}
                onClick={() =>
                  updateDraft({
                    homeAtmosphere: isSelected ? null : card.id,
                  })
                }
                className={`
                  rounded-xl px-3 py-2 text-left transition-all
                  ${
                    isSelected
                      ? "border border-amber-400/70 bg-amber-50/90 shadow-sm"
                      : "border border-gray-200/50 bg-white/50 hover:border-amber-200/60 hover:bg-white/70"
                  }
                `}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">{card.icon}</span>
                  <span className={`text-xs font-medium ${isSelected ? "text-amber-800" : "text-gray-700"}`}>
                    {card.label}
                  </span>
                </div>
                <p className="mt-0.5 text-[10px] text-gray-400">
                  {card.description}
                </p>
              </motion.button>
            );
          })}
        </div>
      </section>

      {/* Distance from hometown */}
      <section>
        <label className="mb-2 block text-xs font-semibold text-gray-600">
          出身地との距離感
        </label>
        <div className="space-y-1.5">
          {DISTANCE_CARDS.map((card) => {
            const isSelected = draft.distanceFromHometown === card.id;
            return (
              <motion.button
                key={card.id}
                whileTap={{ scale: 0.97 }}
                onClick={() =>
                  updateDraft({
                    distanceFromHometown: isSelected ? null : card.id,
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
                <span className={`text-xs font-medium ${isSelected ? "text-amber-800" : "text-gray-700"}`}>
                  {card.label}
                </span>
              </motion.button>
            );
          })}
        </div>
      </section>

      {/* Birth year & month (for Life Calendar) */}
      <section>
        <label className="mb-1.5 block text-xs font-semibold text-gray-600">
          生年月 <span className="font-normal text-gray-400">（人生カレンダーの表示に使用）</span>
        </label>
        <div className="flex gap-2">
          <input
            type="number"
            min={1920}
            max={2020}
            value={draft.birthYear ?? ""}
            onChange={(e) => {
              const v = e.target.value ? parseInt(e.target.value, 10) : undefined;
              updateDraft({ birthYear: v });
            }}
            placeholder="1990"
            className="w-24 rounded-xl border border-gray-200/60 bg-white/70 px-3 py-2.5 text-sm text-gray-700 placeholder-gray-400 outline-none transition-all focus:border-amber-300/70 focus:bg-white/90 focus:ring-1 focus:ring-amber-200/50"
          />
          <span className="flex items-center text-xs text-gray-500">年</span>
          <select
            value={draft.birthMonth ?? ""}
            onChange={(e) => {
              const v = e.target.value ? parseInt(e.target.value, 10) : undefined;
              updateDraft({ birthMonth: v });
            }}
            className="w-20 rounded-xl border border-gray-200/60 bg-white/70 px-2 py-2.5 text-sm text-gray-700 outline-none transition-all focus:border-amber-300/70 focus:bg-white/90 focus:ring-1 focus:ring-amber-200/50"
          >
            <option value="">--</option>
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {i + 1}月
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* Save button */}
      <div className="flex gap-2 pt-2">
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleSave}
          className="flex-1 rounded-2xl bg-amber-400/90 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:bg-amber-500/90"
        >
          保存する
        </motion.button>
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
