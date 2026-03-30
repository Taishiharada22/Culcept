"use client";

import Link from "next/link";
import {
  GlassCard,
  GlassButton,
  GlassBadge,
} from "@/components/ui/glassmorphism-design";
import { FACE_COMPARISON_CATEGORIES } from "@/lib/face/references";
import { NOSE_AXES, MOUTH_AXES, FACE_IMPRESSION_AXES } from "@/lib/face/impressionAxes";
import type { FacePhenotypeData } from "@/types/face-phenotype";
import type { HairRecipe } from "@/lib/hair/hairOptions";
import { HAIR_CATEGORY_LABELS } from "@/lib/hair/hairOptions";

function formatAxisScore(v: number): string {
  return v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1);
}

interface Props {
  data: FacePhenotypeData;
  hairRecipe: HairRecipe;
  mode: "confirm" | "done";
  saving?: boolean;
  onSave?: () => void;
  onEditSection?: (section: string) => void;
}

export default function ResultSummary({
  data,
  hairRecipe,
  mode,
  saving,
  onSave,
  onEditSection,
}: Props) {
  return (
    <div className="space-y-5">
      {mode === "done" && (
        <div className="text-center">
          <span className="text-4xl block mb-2">✨</span>
          <h3 className="text-xl font-bold text-slate-800">判定完了</h3>
        </div>
      )}
      {mode === "confirm" && (
        <h3 className="text-center text-lg font-bold text-slate-800">
          判定結果を確認
        </h3>
      )}

      {/* Group A: 骨格系 */}
      <GlassCard className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-700">
            🫥 骨格系
          </span>
          {mode === "confirm" && onEditSection && (
            <button
              onClick={() => onEditSection("skeletal")}
              className="text-[10px] text-amber-600 underline"
            >
              編集
            </button>
          )}
        </div>
        {FACE_COMPARISON_CATEGORIES.map((cat) => {
          const sel = data[cat.id];
          if (!sel?.primary) return null;
          const opt = cat.options.find((o) => o.key === sel.primary);
          return (
            <div
              key={cat.id}
              className="flex items-center justify-between py-1"
            >
              <span className="text-xs text-slate-500">
                {cat.icon} {cat.label}
              </span>
              <div className="flex items-center gap-2">
                <GlassBadge variant="info">
                  {opt?.label ?? sel.primary}
                </GlassBadge>
                {sel.runner_up && (
                  <span className="text-[10px] text-slate-400">
                    次点:{" "}
                    {cat.options.find((o) => o.key === sel.runner_up)?.label ??
                      sel.runner_up}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </GlassCard>

      {/* Group B: 印象系 */}
      <GlassCard className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-700">
            👃 印象パーツ
          </span>
          {mode === "confirm" && onEditSection && (
            <button
              onClick={() => onEditSection("impression")}
              className="text-[10px] text-amber-600 underline"
            >
              編集
            </button>
          )}
        </div>
        {data.nose_impression && (
          <div>
            <span className="text-xs text-slate-500 block mb-1">鼻</span>
            <div className="flex flex-wrap gap-1.5">
              {NOSE_AXES.map((axis) => {
                const v =
                  data.nose_impression?.[
                    axis.id as keyof typeof data.nose_impression
                  ] ?? 0;
                return (
                  <GlassBadge key={axis.id} variant="default">
                    {axis.label}: {formatAxisScore(v)}
                  </GlassBadge>
                );
              })}
            </div>
          </div>
        )}
        {data.mouth_impression && (
          <div>
            <span className="text-xs text-slate-500 block mb-1">口元</span>
            <div className="flex flex-wrap gap-1.5">
              {MOUTH_AXES.map((axis) => {
                const v =
                  data.mouth_impression?.[
                    axis.id as keyof typeof data.mouth_impression
                  ] ?? 0;
                return (
                  <GlassBadge key={axis.id} variant="default">
                    {axis.label}: {formatAxisScore(v)}
                  </GlassBadge>
                );
              })}
            </div>
          </div>
        )}
      </GlassCard>

      {/* Group C: ヘア */}
      <GlassCard className="p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-700">💇 ヘア</span>
          {mode === "confirm" && onEditSection && (
            <button
              onClick={() => onEditSection("hair")}
              className="text-[10px] text-amber-600 underline"
            >
              編集
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(Object.entries(hairRecipe) as [string, { label: string }][]).map(
            ([cat, opt]) => (
              <GlassBadge key={cat} variant="info">
                {HAIR_CATEGORY_LABELS[cat as keyof typeof HAIR_CATEGORY_LABELS]}:{" "}
                {opt.label}
              </GlassBadge>
            ),
          )}
          {Object.keys(hairRecipe).length === 0 && (
            <span className="text-xs text-slate-400">未設定</span>
          )}
        </div>
      </GlassCard>

      {/* Face Impression */}
      {data.face_impression && (
        <GlassCard className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700">
              ✨ 顔全体の印象
            </span>
            {mode === "confirm" && onEditSection && (
              <button
                onClick={() => onEditSection("overall")}
                className="text-[10px] text-amber-600 underline"
              >
                編集
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {FACE_IMPRESSION_AXES.map((axis) => {
              const v =
                data.face_impression?.[
                  axis.id as keyof typeof data.face_impression
                ] ?? 0;
              const label =
                v < -0.3
                  ? axis.leftLabel
                  : v > 0.3
                    ? axis.rightLabel
                    : "中立";
              return (
                <GlassBadge key={axis.id} variant="default">
                  {axis.label}: {label}
                </GlassBadge>
              );
            })}
          </div>
        </GlassCard>
      )}

      {/* Actions */}
      {mode === "confirm" && onSave && (
        <GlassButton
          onClick={onSave}
          disabled={saving}
          variant="gradient"
          className="w-full"
        >
          {saving ? "保存中…" : "保存する"}
        </GlassButton>
      )}
      {mode === "done" && (
        <Link href="/aneurasync/genome">
          <GlassButton variant="gradient" className="w-full">
            ゲノムに反映を確認
          </GlassButton>
        </Link>
      )}
    </div>
  );
}
