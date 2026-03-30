"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { WornRecord } from "../_lib/types";
import type { WardrobeItem } from "@/app/my-style/_lib/types";

/* ── 星のセマンティックラベル ── */
const STAR_LABELS: Record<number, string> = {
  1: "いまいち",
  2: "微妙",
  3: "ふつう",
  4: "良い",
  5: "最高",
};

/* ── クイックタグ ── */
const QUICK_TAGS = [
  { tag: "暑かった", icon: "🔥" },
  { tag: "寒かった", icon: "🥶" },
  { tag: "動きにくかった", icon: "🦿" },
  { tag: "褒められた", icon: "💬" },
  { tag: "気分が上がった", icon: "🎵" },
] as const;

interface WornRecordFormProps {
  date: string;
  proposedItems: WardrobeItem[];
  existingRecord: WornRecord | null;
  onSave: (record: WornRecord) => void;
}

export default function WornRecordForm({ date, proposedItems, existingRecord, onSave }: WornRecordFormProps) {
  const [satisfaction, setSatisfaction] = React.useState<number>(existingRecord?.satisfaction ?? 0);
  const [note, setNote] = React.useState(existingRecord?.note ?? "");
  const [selectedTags, setSelectedTags] = React.useState<Set<string>>(() => {
    // 既存の記録からタグを復元
    const tags = new Set<string>();
    if (existingRecord?.note) {
      for (const qt of QUICK_TAGS) {
        if (existingRecord.note.includes(`[${qt.tag}]`)) {
          tags.add(qt.tag);
        }
      }
    }
    return tags;
  });
  const [saved, setSaved] = React.useState(false);

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  };

  const handleSave = () => {
    if (satisfaction < 1) return;

    // タグをプレフィックスとして note に統合
    const tagPrefix = selectedTags.size > 0
      ? Array.from(selectedTags).map(t => `[${t}]`).join("") + " "
      : "";
    // 既存タグプレフィックスを除去してからマージ
    const cleanNote = note.replace(/^\[.*?\]\s*/g, "").trim();
    const finalNote = (tagPrefix + cleanNote).trim() || undefined;

    onSave({
      date,
      itemIds: proposedItems.map(i => i.id),
      satisfaction: satisfaction as 1 | 2 | 3 | 4 | 5,
      note: finalNote,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="rounded-2xl bg-gradient-to-b from-white/40 to-white/20 border border-white/40 backdrop-blur-sm p-4">
      <p className="text-[9px] font-bold tracking-widest text-gray-400 uppercase mb-3">
        {existingRecord ? "着用記録を更新" : "このコーデを着た？"}
      </p>

      {/* 満足度（星 + ラベル） */}
      <div className="mb-3">
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-gray-500 mr-2">満足度:</span>
          {[1, 2, 3, 4, 5].map(n => (
            <motion.button
              key={n}
              onClick={() => setSatisfaction(n)}
              className={`text-lg transition-all ${n <= satisfaction ? "grayscale-0 opacity-100" : "grayscale opacity-30"}`}
              whileTap={{ scale: 1.3 }}
            >
              ⭐
            </motion.button>
          ))}
        </div>
        <AnimatePresence mode="wait">
          {satisfaction > 0 && (
            <motion.p
              key={satisfaction}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-[10px] text-gray-500 mt-1 ml-[52px]"
            >
              {STAR_LABELS[satisfaction]}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* クイックタグ */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {QUICK_TAGS.map(qt => (
          <motion.button
            key={qt.tag}
            onClick={() => toggleTag(qt.tag)}
            className={`rounded-full px-2.5 py-1 text-[9px] border transition-all ${
              selectedTags.has(qt.tag)
                ? "bg-violet-100/70 border-violet-300/50 text-violet-700 font-bold"
                : "bg-white/40 border-gray-200/40 text-gray-500 hover:bg-gray-50/60"
            }`}
            whileTap={{ scale: 0.95 }}
          >
            {qt.icon} {qt.tag}
          </motion.button>
        ))}
      </div>

      {/* メモ */}
      <textarea
        value={note}
        onChange={e => setNote(e.target.value)}
        placeholder="メモ（任意）: 体感温度、反応、次回改善点..."
        className="w-full rounded-xl bg-white/60 border border-gray-200/40 px-3 py-2 text-xs text-gray-700 resize-none h-16 mb-3 placeholder:text-gray-300"
      />

      {/* 保存ボタン */}
      <motion.button
        onClick={handleSave}
        disabled={satisfaction < 1}
        className={`w-full rounded-xl px-4 py-2.5 text-xs font-bold transition-all ${
          saved
            ? "bg-emerald-500 text-white"
            : satisfaction >= 1
              ? "bg-gray-800 text-white hover:bg-gray-700"
              : "bg-gray-200 text-gray-400 cursor-not-allowed"
        }`}
        whileTap={{ scale: 0.97 }}
      >
        {saved ? "記録しました ✓" : existingRecord ? "記録を更新" : "着用を記録"}
      </motion.button>
    </div>
  );
}
