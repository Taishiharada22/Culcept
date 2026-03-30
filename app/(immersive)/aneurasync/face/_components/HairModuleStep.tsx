"use client";

import { useCallback, useState } from "react";
import Image from "next/image";
import {
  GlassCard,
  GlassButton,
  GlassBadge,
} from "@/components/ui/glassmorphism-design";
import {
  type HairCategory,
  type HairOption,
  type HairRecipe,
  HAIR_CATEGORY_LABELS,
  HAIR_CATEGORY_ORDER,
  STORAGE_KEY,
  getOptionsByCategory,
  hairImageSrc,
} from "@/lib/hair/hairOptions";

const CATEGORY_EMOJI: Record<HairCategory, string> = {
  length: "📏",
  bangs: "💇",
  silhouette: "✂️",
  texture: "🌀",
  color: "🎨",
};

interface Props {
  userImage: string;
  onComplete: () => void;
}

export default function HairModuleStep({ userImage, onComplete }: Props) {
  const [recipe, setRecipe] = useState<HairRecipe>(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return {};
  });
  const [imgErrors, setImgErrors] = useState<Set<string>>(new Set());

  const select = useCallback((opt: HairOption) => {
    setRecipe((prev) => ({ ...prev, [opt.category]: opt }));
  }, []);

  const save = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(recipe));
    } catch {
      /* ignore */
    }
    onComplete();
  }, [recipe, onComplete]);

  const selectedCount = Object.keys(recipe).length;

  return (
    <div className="space-y-5">
      <h3 className="text-center text-lg font-bold text-slate-800">
        💇 ヘアスタイル
      </h3>
      <p className="text-center text-xs text-slate-500">
        各カテゴリから一番近い要素を選んでください
      </p>

      {/* Upper: user image + recipe summary */}
      <div className="grid grid-cols-2 gap-3">
        {/* User image */}
        <div className="rounded-2xl overflow-hidden bg-slate-100 border border-slate-200 aspect-square">
          <img
            src={userImage}
            alt="参照画像"
            className="w-full h-full object-cover"
          />
        </div>

        {/* Recipe summary */}
        <div className="rounded-2xl border border-slate-200 bg-white/60 p-3">
          <div className="text-xs font-semibold text-slate-600 mb-2">
            選択中{" "}
            <GlassBadge variant="default">
              {selectedCount}/{HAIR_CATEGORY_ORDER.length}
            </GlassBadge>
          </div>
          {selectedCount === 0 ? (
            <div className="flex items-center justify-center h-20 text-xs text-slate-400">
              下から選択
            </div>
          ) : (
            <div className="space-y-1.5">
              {HAIR_CATEGORY_ORDER.map((cat) => {
                const opt = recipe[cat];
                if (!opt) return null;
                return (
                  <div
                    key={cat}
                    className="flex items-center gap-1.5 text-slate-700"
                  >
                    <span className="text-sm">{CATEGORY_EMOJI[cat]}</span>
                    <span className="text-[10px] text-slate-400">
                      {HAIR_CATEGORY_LABELS[cat]}:
                    </span>
                    <span className="text-xs font-medium truncate">
                      {opt.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Category lanes */}
      <div className="space-y-4">
        {HAIR_CATEGORY_ORDER.map((cat) => {
          const options = getOptionsByCategory(cat);
          const current = recipe[cat];
          return (
            <div key={cat}>
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="text-sm font-semibold text-slate-700">
                  {CATEGORY_EMOJI[cat]} {HAIR_CATEGORY_LABELS[cat]}
                </span>
                <GlassBadge variant={current ? "info" : "default"}>
                  {current ? current.label : "未選択"}
                </GlassBadge>
              </div>
              <div
                className="flex flex-nowrap gap-2.5 overflow-x-auto snap-x snap-mandatory scroll-smooth pb-2 px-1"
                style={{
                  scrollbarWidth: "none",
                  WebkitOverflowScrolling: "touch",
                }}
              >
                {options.map((opt) => {
                  const selected = current?.id === opt.id;
                  const hasError = opt.file
                    ? imgErrors.has(opt.file)
                    : true;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => select(opt)}
                      className={`shrink-0 w-[120px] snap-start rounded-xl border-2 p-2 transition-all text-center ${
                        selected
                          ? "border-amber-500 bg-amber-500/10 scale-[1.02]"
                          : "border-slate-200 bg-white/60 hover:border-slate-300"
                      }`}
                    >
                      <div className="aspect-square rounded-lg overflow-hidden bg-slate-100 mb-1.5 flex items-center justify-center">
                        {opt.file && !hasError ? (
                          <Image
                            src={hairImageSrc(opt.file)}
                            alt={opt.label}
                            width={100}
                            height={100}
                            className="w-full h-full object-cover"
                            onError={() =>
                              setImgErrors((s) =>
                                new Set(s).add(opt.file!),
                              )
                            }
                          />
                        ) : (
                          <span className="text-3xl">
                            {CATEGORY_EMOJI[cat]}
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-700 font-medium block truncate">
                        {opt.label}
                      </span>
                      {selected && (
                        <span className="text-[9px] text-amber-400 block mt-0.5">
                          選択中
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <GlassButton
        onClick={save}
        disabled={selectedCount < 2}
        className="w-full"
      >
        ヘア設定を保存して次へ
      </GlassButton>
    </div>
  );
}
