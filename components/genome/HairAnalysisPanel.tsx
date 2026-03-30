"use client";

import { useCallback, useEffect, useState } from "react";
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

/* ─── emoji fallback per category ─── */
const CATEGORY_EMOJI: Record<HairCategory, string> = {
  length: "📏",
  bangs: "💇",
  silhouette: "✂️",
  texture: "🌀",
  color: "🎨",
};

interface HairAnalysisPanelProps {
  onSaved?: (recipe: HairRecipe) => void;
}

/* ─── main component ─── */
export default function HairAnalysisPanel({ onSaved }: HairAnalysisPanelProps) {
  const [recipe, setRecipe] = useState<HairRecipe>(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as HairRecipe;
        return HAIR_CATEGORY_ORDER.reduce<HairRecipe>((acc, category) => {
          const storedId = parsed?.[category]?.id;
          if (!storedId) return acc;
          const matched = getOptionsByCategory(category).find((option) => option.id === storedId);
          if (matched) acc[category] = matched;
          return acc;
        }, {});
      }
    } catch { /* ignore */ }
    return {};
  });
  const [imgErrors, setImgErrors] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState(false);

  /* restore from DB */
  useEffect(() => {
    fetch("/api/aneurasync/hair-phenotype")
      .then((r) => r.json())
      .then((res) => {
        if (!res.ok || !res.hair_phenotype) return;
        const hp = res.hair_phenotype;
        const fromDb = HAIR_CATEGORY_ORDER.reduce<HairRecipe>((acc, category) => {
          const storedId = hp[category];
          if (!storedId) return acc;
          const matched = getOptionsByCategory(category).find((option) => option.id === storedId);
          if (matched) acc[category] = matched;
          return acc;
        }, {});
        if (Object.keys(fromDb).length > 0) {
          setRecipe((prev) => ({ ...prev, ...fromDb }));
        }
      })
      .catch(() => {/* ignore */});
  }, []);

  /* select an option (single-select per category) */
  const select = useCallback((opt: HairOption) => {
    setRecipe((prev) => ({ ...prev, [opt.category]: opt }));
  }, []);

  /* save to localStorage + DB */
  const save = useCallback(async () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(recipe));
    } catch {
      /* ignore */
    }
    const payload: Record<string, unknown> = { recipe };
    for (const cat of HAIR_CATEGORY_ORDER) {
      if (recipe[cat]) {
        payload[cat] = recipe[cat]!.id;
        if (cat === "color" && recipe[cat]!.hex) {
          payload.color_hex = recipe[cat]!.hex;
        }
      }
    }
    try {
      await fetch("/api/aneurasync/hair-phenotype", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      // Notify parent so dashboard updates immediately
      onSaved?.(recipe);
    } catch {
      /* ignore */
    }
  }, [recipe, onSaved]);

  const selectedCount = Object.keys(recipe).length;

  return (
    <GlassCard className="p-4">
      {/* ─── header ─── */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base font-bold text-slate-900">
            Hair Analysis
          </h2>
          <p className="text-xs text-slate-400">
            髪型の要素を選んでレシピを作成
          </p>
        </div>
        <GlassBadge variant="default">
          {selectedCount}/{HAIR_CATEGORY_ORDER.length} 選択済
        </GlassBadge>
      </div>

      {/* ─── selected recipe summary ─── */}
      {selectedCount > 0 && (
        <div className="mb-4">
          <div className="rounded-xl border border-slate-200/80 bg-white/50 p-3">
            <div className="flex flex-wrap gap-1.5">
              {HAIR_CATEGORY_ORDER.map((cat) => {
                const opt = recipe[cat];
                if (!opt) return null;
                const isColorChip = cat === "color" && !!opt.hex;
                return (
                  <div
                    key={cat}
                    className="flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50/60 px-2 py-1"
                  >
                    {isColorChip ? (
                      <div
                        className="h-4 w-4 shrink-0 rounded-full border-2 border-white shadow-sm"
                        style={{ backgroundColor: opt.hex }}
                      />
                    ) : (
                      <span className="text-xs shrink-0">
                        {CATEGORY_EMOJI[cat]}
                      </span>
                    )}
                    <span className="text-[11px] font-medium text-slate-700">
                      {opt.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ─── category lanes (horizontal scroll) ─── */}
      <div className="space-y-4">
        {HAIR_CATEGORY_ORDER.map((cat) => {
          const options = getOptionsByCategory(cat);
          const current = recipe[cat];
          return (
            <div key={cat}>
              {/* lane header */}
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-xs font-semibold text-slate-700">
                  {CATEGORY_EMOJI[cat]} {HAIR_CATEGORY_LABELS[cat]}
                </div>
                <GlassBadge variant={current ? "default" : "default"}>
                  {current ? current.label : "未選択"}
                </GlassBadge>
              </div>
              {/* card row */}
              <div
                className="flex flex-nowrap gap-2 overflow-x-auto snap-x snap-mandatory scroll-smooth pb-1"
                style={{
                  scrollbarWidth: "none",
                  WebkitOverflowScrolling: "touch",
                }}
              >
                {cat === "color" ? (
                  <div className="flex w-full flex-wrap justify-center gap-2.5 rounded-xl border border-slate-200/80 bg-white/70 px-3 py-3">
                    {options.map((opt) => {
                      const selected = current?.id === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => select(opt)}
                          className="group shrink-0 text-center"
                        >
                          <div
                            className={`mx-auto h-10 w-10 rounded-full border-[3px] border-white shadow transition-all duration-200 ${
                              selected
                                ? "scale-110 ring-[3px] ring-violet-300"
                                : "ring-1 ring-slate-200 group-hover:scale-105 group-hover:ring-2 group-hover:ring-violet-200"
                            }`}
                            style={{ backgroundColor: opt.hex ?? "#d4d4d8" }}
                          />
                          <div className="mt-1 text-[10px] font-medium text-slate-700">{opt.label}</div>
                          {selected && (
                            <div className="text-[9px] font-semibold text-violet-500">
                              選択中
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  options.map((opt) => {
                    const selected = current?.id === opt.id;
                    const hasError = opt.file
                      ? imgErrors.has(opt.file)
                      : true;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => select(opt)}
                        className={`
                          shrink-0 w-[90px] snap-start rounded-lg border-2 p-1 transition-all duration-200 text-left
                          ${
                            selected
                              ? "border-violet-500 bg-violet-50 shadow-lg scale-[1.02]"
                              : "border-slate-200/80 bg-white/70 hover:border-violet-300"
                          }
                        `}
                      >
                        <div className="aspect-[3/4] rounded-md overflow-hidden bg-slate-100 mb-0.5 flex items-center justify-center">
                          {opt.file && !hasError ? (
                            <Image
                              src={hairImageSrc(opt.file)}
                              alt={opt.label}
                              width={90}
                              height={120}
                              className="w-full h-full object-cover object-bottom"
                              onError={() =>
                                setImgErrors((s) =>
                                  new Set(s).add(opt.file!)
                                )
                              }
                            />
                          ) : (
                            <span className="text-2xl">
                              {CATEGORY_EMOJI[cat]}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] font-medium text-slate-700 text-center truncate">
                          {opt.label}
                        </div>
                        {selected && (
                          <div className="text-[9px] text-violet-500 text-center">
                            選択中
                          </div>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ─── save button ─── */}
      <div className="mt-4 flex items-center gap-3">
        <GlassButton variant="gradient" onClick={save}>
          {saved ? "✓ 保存完了" : "レシピを保存"}
        </GlassButton>
        {saved ? (
          <span className="text-xs text-emerald-500 font-medium">
            髪質データを保存しました
          </span>
        ) : (
          <span className="text-xs text-slate-400">
            保存するとリロードしても復元されます
          </span>
        )}
      </div>
    </GlassCard>
  );
}
