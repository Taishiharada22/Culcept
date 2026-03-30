"use client";

import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import type {
  EraAffiliation,
  EraRole,
  RelationshipTone,
  LifeCenter,
} from "@/lib/origin/v7/workspaceTypes";
import type { LifePeriod } from "@/lib/origin/v7/types";
import {
  ERA_ROLE_CARDS,
  RELATIONSHIP_CARDS,
  LIFE_CENTER_CARDS,
} from "@/lib/origin/v7/eraAffiliationData";
import { PERIOD_DEFS, getPeriodLabel } from "@/lib/origin/v7/periods";

type Props = {
  era: EraAffiliation | null;
  onSave: (era: EraAffiliation) => void;
  onDelete?: (id: string) => void;
  onClose: () => void;
};

function createEmptyEra(): EraAffiliation {
  return {
    id: crypto.randomUUID(),
    period: "elementary",
    school: null,
    affiliation: null,
    mainActivity: null,
    mainRole: null,
    atmosphere: null,
    relationships: null,
    lifeCenter: null,
  };
}

export default function EraAffiliationEditor({ era, onSave, onDelete, onClose }: Props) {
  const isNew = !era;
  const [draft, setDraft] = useState<EraAffiliation>(era ?? createEmptyEra());

  const updateDraft = useCallback(
    (updates: Partial<EraAffiliation>) => {
      setDraft((prev) => ({ ...prev, ...updates }));
    },
    [],
  );

  const handleSave = useCallback(() => {
    onSave(draft);
  }, [draft, onSave]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">📖</span>
          <h3 className="text-sm font-bold text-gray-800">
            {isNew ? "時代を追加" : "時代を編集"}
          </h3>
        </div>
        <button
          onClick={onClose}
          className="rounded-full p-1.5 text-gray-400 transition-colors hover:bg-gray-100/50 hover:text-gray-600"
        >
          <span className="text-sm">✕</span>
        </button>
      </div>

      {/* Period selector */}
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

      {/* School / Organization */}
      <section>
        <label className="mb-1.5 block text-xs font-semibold text-gray-600">
          学校・所属先
        </label>
        <input
          type="text"
          value={draft.school ?? ""}
          onChange={(e) => updateDraft({ school: e.target.value || null })}
          placeholder="例：〇〇高校、△△大学、□□会社"
          className="w-full rounded-xl border border-gray-200/60 bg-white/70 px-3 py-2.5 text-sm text-gray-700 placeholder-gray-400 outline-none transition-all focus:border-amber-300/70 focus:bg-white/90 focus:ring-1 focus:ring-amber-200/50"
        />
      </section>

      {/* Affiliation */}
      <section>
        <label className="mb-1.5 block text-xs font-semibold text-gray-600">
          所属（部活・チーム・部署など）
        </label>
        <input
          type="text"
          value={draft.affiliation ?? ""}
          onChange={(e) => updateDraft({ affiliation: e.target.value || null })}
          placeholder="例：サッカー部、文化祭実行委員会"
          className="w-full rounded-xl border border-gray-200/60 bg-white/70 px-3 py-2.5 text-sm text-gray-700 placeholder-gray-400 outline-none transition-all focus:border-amber-300/70 focus:bg-white/90 focus:ring-1 focus:ring-amber-200/50"
        />
      </section>

      {/* Main activity */}
      <section>
        <label className="mb-1.5 block text-xs font-semibold text-gray-600">
          主な活動
        </label>
        <input
          type="text"
          value={draft.mainActivity ?? ""}
          onChange={(e) => updateDraft({ mainActivity: e.target.value || null })}
          placeholder="例：練習、研究、接客、プログラミング"
          className="w-full rounded-xl border border-gray-200/60 bg-white/70 px-3 py-2.5 text-sm text-gray-700 placeholder-gray-400 outline-none transition-all focus:border-amber-300/70 focus:bg-white/90 focus:ring-1 focus:ring-amber-200/50"
        />
      </section>

      {/* Role */}
      <section>
        <label className="mb-2 block text-xs font-semibold text-gray-600">
          そこでの立ち位置
        </label>
        <div className="flex flex-wrap gap-1.5">
          {ERA_ROLE_CARDS.map((card) => {
            const isSelected = draft.mainRole === card.id;
            return (
              <motion.button
                key={card.id}
                whileTap={{ scale: 0.95 }}
                onClick={() =>
                  updateDraft({ mainRole: isSelected ? null : card.id })
                }
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

      {/* Relationships */}
      <section>
        <label className="mb-2 block text-xs font-semibold text-gray-600">
          人間関係の質感
        </label>
        <div className="space-y-1.5">
          {RELATIONSHIP_CARDS.map((card) => {
            const isSelected = draft.relationships === card.id;
            return (
              <motion.button
                key={card.id}
                whileTap={{ scale: 0.97 }}
                onClick={() =>
                  updateDraft({ relationships: isSelected ? null : card.id })
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
                <span className={`text-xs font-medium ${isSelected ? "text-amber-800" : "text-gray-700"}`}>
                  {card.label}
                </span>
              </motion.button>
            );
          })}
        </div>
      </section>

      {/* Life center */}
      <section>
        <label className="mb-2 block text-xs font-semibold text-gray-600">
          生活の中心
        </label>
        <div className="flex flex-wrap gap-1.5">
          {LIFE_CENTER_CARDS.map((card) => {
            const isSelected = draft.lifeCenter === card.id;
            return (
              <motion.button
                key={card.id}
                whileTap={{ scale: 0.95 }}
                onClick={() =>
                  updateDraft({ lifeCenter: isSelected ? null : card.id })
                }
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

      {/* Atmosphere */}
      <section>
        <label className="mb-1.5 block text-xs font-semibold text-gray-600">
          その時代の雰囲気（一言で）
        </label>
        <input
          type="text"
          value={draft.atmosphere ?? ""}
          onChange={(e) => updateDraft({ atmosphere: e.target.value || null })}
          placeholder="例：充実していた、必死だった、退屈だった"
          className="w-full rounded-xl border border-gray-200/60 bg-white/70 px-3 py-2.5 text-sm text-gray-700 placeholder-gray-400 outline-none transition-all focus:border-amber-300/70 focus:bg-white/90 focus:ring-1 focus:ring-amber-200/50"
        />
      </section>

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleSave}
          className="flex-1 rounded-2xl bg-amber-400/90 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:bg-amber-500/90"
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
