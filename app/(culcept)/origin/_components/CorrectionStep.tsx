"use client";

import { motion } from "framer-motion";
import { useCallback, useState } from "react";
import type { CorrectionLevel, DraftChapter, UserCorrection } from "@/lib/origin/v7/types";

type Props = {
  draft: DraftChapter;
  onComplete: (update: Partial<DraftChapter>) => void;
};

const CORRECTION_OPTIONS: { level: CorrectionLevel; label: string; icon: string }[] = [
  { level: "close", label: "かなり近い", icon: "✅" },
  { level: "slightly_off", label: "少し違う", icon: "🔄" },
  { level: "wrong", label: "違う", icon: "❌" },
];

export default function CorrectionStep({ draft, onComplete }: Props) {
  const [selectedLevel, setSelectedLevel] = useState<CorrectionLevel | null>(
    draft.correction?.level ?? null,
  );
  const [editedText, setEditedText] = useState<string>(
    draft.correction?.editedText ?? draft.aiNarrative?.narrative ?? "",
  );
  const [showEditor, setShowEditor] = useState(false);

  const handleLevelSelect = useCallback(
    (level: CorrectionLevel) => {
      setSelectedLevel(level);
      if (level === "close") {
        // No editing needed — proceed
        const correction: UserCorrection = {
          level,
          editedText: null,
          correctedAt: new Date().toISOString(),
        };
        onComplete({ correction });
      } else {
        // Show text editor
        setShowEditor(true);
        setEditedText(draft.aiNarrative?.narrative ?? "");
      }
    },
    [draft.aiNarrative, onComplete],
  );

  const handleSaveEdit = useCallback(() => {
    if (!selectedLevel) return;
    const correction: UserCorrection = {
      level: selectedLevel,
      editedText: editedText.trim() || null,
      correctedAt: new Date().toISOString(),
    };
    onComplete({ correction });
  }, [selectedLevel, editedText, onComplete]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.35 }}
      className="flex flex-col gap-6"
    >
      <div className="text-center">
        <p className="mb-1 text-sm text-gray-500">Step 7</p>
        <h2 className="text-lg font-semibold text-gray-800">
          この描写、どうですか？
        </h2>
        <p className="mt-1 text-xs text-gray-400">
          近さを教えてください。違う部分は修正できます
        </p>
      </div>

      {/* AI text preview */}
      <div className="rounded-2xl bg-white/70 backdrop-blur-sm p-4">
        <p className="text-sm leading-relaxed text-gray-600 whitespace-pre-wrap">
          {draft.aiNarrative?.narrative ?? ""}
        </p>
      </div>

      {/* Level selection */}
      {!showEditor && (
        <div className="flex gap-3">
          {CORRECTION_OPTIONS.map((opt) => (
            <motion.button
              key={opt.level}
              whileTap={{ scale: 0.96 }}
              onClick={() => handleLevelSelect(opt.level)}
              className={`
                flex flex-1 flex-col items-center gap-1 rounded-2xl px-3 py-4
                transition-all
                ${
                  selectedLevel === opt.level
                    ? "bg-amber-400/20 ring-2 ring-amber-400/50"
                    : "bg-white/60 hover:bg-white/75"
                }
              `}
            >
              <span className="text-xl">{opt.icon}</span>
              <span className="text-xs font-medium text-gray-700">
                {opt.label}
              </span>
            </motion.button>
          ))}
        </div>
      )}

      {/* Text editor */}
      {showEditor && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="flex flex-col gap-4"
        >
          <p className="text-xs text-gray-500">
            自由に書き直してください。近い部分はそのままで大丈夫です
          </p>
          <textarea
            value={editedText}
            onChange={(e) => setEditedText(e.target.value)}
            rows={5}
            className="w-full resize-none rounded-2xl bg-white/80 p-4 text-sm leading-relaxed text-gray-700 outline-none ring-1 ring-gray-200 focus:ring-amber-400/50"
            placeholder="その頃の自分を、自分の言葉で..."
          />
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleSaveEdit}
            className="mx-auto w-full max-w-xs rounded-2xl bg-amber-400/90 px-6 py-3 text-sm font-semibold text-white shadow-md hover:bg-amber-500/90"
          >
            この内容で保存する
          </motion.button>
        </motion.div>
      )}
    </motion.div>
  );
}
