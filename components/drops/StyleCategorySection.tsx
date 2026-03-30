"use client";

import { PRODUCT_TAXONOMY } from "@/lib/profile/registry";
import { normalizeCategoryMain, normalizeSubcategoryId, type FitCategoryMain } from "@/lib/drops/fitProfile";

type StyleCategorySectionProps = {
  categoryMain: string;
  subcategoryId: string;
  onCategoryMainChange: (value: FitCategoryMain | "") => void;
  onSubcategoryIdChange: (value: string) => void;
};

export default function StyleCategorySection({
  categoryMain,
  subcategoryId,
  onCategoryMainChange,
  onSubcategoryIdChange,
}: StyleCategorySectionProps) {
  const normalizedCategory = normalizeCategoryMain(categoryMain);
  const selectedCategory = PRODUCT_TAXONOMY.find((category) => category.id === normalizedCategory) ?? null;
  const normalizedSubcategory = normalizeSubcategoryId(subcategoryId);

  return (
    <div className="space-y-5">
      <div>
        <div className="text-sm font-semibold text-slate-700">スタイル</div>
        <div className="text-xs text-slate-400">求める商品像に近いカテゴリを選択してください。</div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {PRODUCT_TAXONOMY.map((category) => {
          const selected = category.id === normalizedCategory;
          return (
            <button
              key={category.id}
              type="button"
              onClick={() => {
                onCategoryMainChange(category.id as FitCategoryMain);
                onSubcategoryIdChange(category.subs[0]?.id ?? "");
              }}
              className={`rounded-2xl border px-4 py-4 text-left transition ${
                selected
                  ? "border-violet-400 bg-violet-50 shadow-sm"
                  : "border-white/80 bg-white/60 hover:border-violet-200"
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{category.icon}</span>
                <div>
                  <div className="text-sm font-bold text-slate-800">{category.label}</div>
                  <div className="text-[11px] text-slate-400">{category.subs.length}種類</div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {selectedCategory ? (
        <div className="space-y-3">
          <div className="text-sm font-semibold text-slate-700">アイテムカテゴリ</div>
          <div className="flex flex-wrap gap-2">
            {selectedCategory.subs.map((subcategory) => {
              const selected = normalizedSubcategory === subcategory.id;
              return (
                <button
                  key={subcategory.id}
                  type="button"
                  onClick={() => onSubcategoryIdChange(subcategory.id)}
                  className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                    selected
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:border-violet-200 hover:text-slate-900"
                  }`}
                >
                  {subcategory.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
