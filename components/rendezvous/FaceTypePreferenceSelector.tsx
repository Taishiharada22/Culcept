"use client";

import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { GlassCard, GlassBadge, GlassButton } from "@/components/ui/glassmorphism-design";
import { FACE_TYPES, type FaceTypeId } from "@/lib/rendezvous/faceTypes";

interface Props {
  initialSelected?: string[];
  onSave?: (selected: string[]) => void;
  /** 読み取り専用モード */
  readOnly?: boolean;
}

const TYPE_ORDER: FaceTypeId[] = [
  "lumiere", "bloom", "prism", "silhouette",
  "terre", "aurora", "ember", "monolith",
];

const TYPE_EMOJI: Record<FaceTypeId, string> = {
  lumiere: "☀️",
  bloom: "🌸",
  terre: "🌍",
  aurora: "🌌",
  prism: "💎",
  silhouette: "✨",
  ember: "🔥",
  monolith: "🗿",
};

export default function FaceTypePreferenceSelector({ initialSelected = [], onSave, readOnly }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelected));
  const [saving, setSaving] = useState(false);

  const toggle = useCallback((id: string) => {
    if (readOnly) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, [readOnly]);

  const handleSave = useCallback(async () => {
    if (!onSave) return;
    setSaving(true);
    try {
      onSave(Array.from(selected));
    } finally {
      setSaving(false);
    }
  }, [onSave, selected]);

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h3 className="text-lg font-bold text-white/90">
          どんな印象に自然と惹かれますか？
        </h3>
        <p className="mt-1 text-sm text-white/50">
          選ばなくてもOK。選んだタイプは相手には見えません
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {TYPE_ORDER.map((id) => {
          const t = FACE_TYPES[id];
          const isSelected = selected.has(id);
          return (
            <motion.div
              key={id}
              whileTap={readOnly ? undefined : { scale: 0.95 }}
              onClick={() => toggle(id)}
              className="cursor-pointer"
            >
              <GlassCard
                className={`p-3 text-center transition-all ${
                  isSelected
                    ? "ring-2 ring-violet-400/60 bg-violet-500/20"
                    : "hover:bg-white/5"
                }`}
              >
                <div className="text-2xl mb-1">{TYPE_EMOJI[id]}</div>
                <div className="text-sm font-bold text-white/90">{t.nameJa}</div>
                <div className="text-[11px] text-white/50 mt-0.5">{t.name}</div>
                <p className="text-[10px] text-white/40 mt-1 leading-tight">
                  {t.description}
                </p>
                <div className="flex flex-wrap justify-center gap-1 mt-2">
                  {t.keywords.slice(0, 2).map((kw) => (
                    <GlassBadge key={kw} size="sm">{kw}</GlassBadge>
                  ))}
                </div>
                {isSelected && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-violet-500 flex items-center justify-center text-white text-xs"
                  >
                    ✓
                  </motion.div>
                )}
              </GlassCard>
            </motion.div>
          );
        })}
      </div>

      {selected.size > 0 && (
        <p className="text-center text-xs text-white/40">
          {selected.size}タイプ選択中
        </p>
      )}

      {!readOnly && onSave && (
        <div className="flex justify-center">
          <GlassButton onClick={handleSave} disabled={saving}>
            {saving ? "保存中..." : "保存する"}
          </GlassButton>
        </div>
      )}
    </div>
  );
}
