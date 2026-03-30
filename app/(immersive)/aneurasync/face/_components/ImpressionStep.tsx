"use client";

import { useState, useCallback } from "react";
import { GlassCard, GlassButton } from "@/components/ui/glassmorphism-design";
import type { ImpressionAxis } from "@/lib/face/impressionAxes";

type FocusArea = "face" | "nose" | "mouth";

interface Props {
  title: string;
  icon: string;
  axes: ImpressionAxis[];
  userImage?: string;
  referenceImages?: string[];
  referenceCaptions?: string[];
  previewLabel?: string;
  focusArea?: FocusArea;
  existing?: Record<string, number>;
  onComplete: (scores: Record<string, number>) => void;
}

function describeAxisScore(axis: ImpressionAxis, value: number) {
  const distance = Math.abs(value);
  if (distance < 0.15) return "平均";
  const tone = distance >= 0.7 ? "かなり" : distance >= 0.35 ? "やや" : "少し";
  return value < 0 ? `${tone}${axis.leftLabel}` : `${tone}${axis.rightLabel}`;
}

function getFocusConfig(focusArea: FocusArea) {
  if (focusArea === "mouth") {
    return {
      helper: "中央が平均です。まず口元を見て、平均よりどちらへ寄るかを決めてください。",
      previewLabel: "口元フォーカス",
      previewStyle: {
        objectPosition: "center 74%",
        transform: "scale(2.15)",
      },
    };
  }

  if (focusArea === "nose") {
    return {
      helper: "中央が平均です。鼻筋と小鼻の印象が平均よりどちらへ寄るかを選んでください。",
      previewLabel: "鼻まわりフォーカス",
      previewStyle: {
        objectPosition: "center 48%",
        transform: "scale(1.82)",
      },
    };
  }

  return {
    helper: "中央が平均です。左右に寄るほど、その印象が強くなります。",
    previewLabel: "参照画像",
    previewStyle: {
      objectPosition: "center",
      transform: "scale(1)",
    },
  };
}

export default function ImpressionStep({
  title,
  icon,
  axes,
  userImage,
  referenceImages,
  referenceCaptions,
  previewLabel,
  focusArea = "face",
  existing,
  onComplete,
}: Props) {
  const focusConfig = getFocusConfig(focusArea);
  const previewImages = referenceImages?.length
    ? referenceImages
    : userImage
      ? [userImage]
      : [];
  const usesStaticReferences = Boolean(referenceImages?.length);
  const [activeReferenceIndex, setActiveReferenceIndex] = useState(0);
  const [scores, setScores] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const axis of axes) {
      init[axis.id] = existing?.[axis.id] ?? 0;
    }
    return init;
  });
  const currentStaticImage = previewImages[activeReferenceIndex] ?? previewImages[0] ?? "";
  const displayedPreviewImages = usesStaticReferences
    ? focusArea === "nose"
      ? (currentStaticImage ? [currentStaticImage] : [])
      : previewImages.slice(0, 1)
    : previewImages;
  const displayedReferenceCaptions = usesStaticReferences
    ? focusArea === "nose"
      ? [referenceCaptions?.[activeReferenceIndex] ?? referenceCaptions?.[0] ?? ""]
      : [referenceCaptions?.[0] ?? ""]
    : referenceCaptions;

  const updateScore = useCallback((axisId: string, value: number) => {
    setScores((prev) => ({
      ...prev,
      [axisId]: Math.round(value * 10) / 10,
    }));
  }, []);

  return (
    <div className="space-y-5">
      <h3 className="text-center text-lg font-bold text-slate-800">
        {icon} {title}の印象
      </h3>

      <div className="rounded-2xl border border-violet-200 bg-violet-50/80 px-4 py-3 text-center text-xs leading-6 text-violet-700">
        {focusConfig.helper}
      </div>

      <div className={`mx-auto w-full ${usesStaticReferences ? "max-w-[560px]" : "max-w-[360px]"}`}>
        <div className="mb-2 text-center text-[11px] font-black uppercase tracking-[0.24em] text-slate-400">
          {previewLabel ?? focusConfig.previewLabel}
        </div>
        {usesStaticReferences && focusArea === "nose" && previewImages.length > 1 ? (
          <div className="mb-3 flex flex-wrap justify-center gap-2">
            {previewImages.map((src, index) => (
              <button
                key={`${src}-${index}-tab`}
                type="button"
                onClick={() => setActiveReferenceIndex(index)}
                className={`rounded-full px-4 py-2 text-xs font-black transition-all ${
                  index === activeReferenceIndex
                    ? "bg-violet-600 text-white shadow-md"
                    : "bg-white text-slate-600 border border-slate-200 hover:border-violet-200"
                }`}
              >
                {referenceCaptions?.[index] ?? `参照 ${index + 1}`}
              </button>
            ))}
          </div>
        ) : null}
        <div className={displayedPreviewImages.length > 1 ? "grid gap-3 sm:grid-cols-2" : "space-y-0"}>
          {displayedPreviewImages.map((src, index) => (
            <div
              key={`${src}-${index}`}
              className="relative overflow-hidden rounded-[28px] border border-slate-200 bg-slate-100 shadow-inner"
              style={{ aspectRatio: usesStaticReferences ? "5 / 4" : "5 / 3" }}
            >
              <img
                src={src}
                alt="参照画像"
                className={usesStaticReferences ? "h-full w-full object-contain bg-white" : "h-full w-full object-cover"}
                style={usesStaticReferences ? undefined : focusConfig.previewStyle}
              />
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.18),rgba(255,255,255,0)_28%,rgba(15,23,42,0.04)_100%)]" />
              {displayedReferenceCaptions?.[index] ? (
                <div className="pointer-events-none absolute left-3 top-3 rounded-full bg-white/92 px-3 py-1 text-[10px] font-black text-slate-700">
                  {displayedReferenceCaptions[index]}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <GlassCard className="p-5 space-y-5">
        {axes.map((axis) => (
          <div key={axis.id} className="rounded-[24px] border border-slate-200 bg-white/80 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="text-sm font-black text-slate-900">
                {axis.label}
              </span>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-600">
                  {describeAxisScore(axis, scores[axis.id])}
                </span>
                <span className="text-[10px] text-slate-400 tabular-nums">
                  {scores[axis.id] > 0 ? "+" : ""}
                  {scores[axis.id].toFixed(1)}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 text-[11px] font-semibold text-slate-500">
              <div className="flex items-center gap-1">
                <span className="text-sm">{axis.leftIcon}</span>
                <span>{axis.leftLabel}</span>
              </div>
              <span className="rounded-full bg-violet-50 px-2.5 py-0.5 text-[10px] font-black text-violet-600">
                平均
              </span>
              <div className="flex items-center gap-1">
                <span>{axis.rightLabel}</span>
                <span className="text-sm">{axis.rightIcon}</span>
              </div>
            </div>
            <div className="relative mt-3">
              <div className="pointer-events-none absolute left-1/2 top-1/2 h-6 w-px -translate-x-1/2 -translate-y-1/2 bg-slate-300" />
              <input
                type="range"
                min={-1}
                max={1}
                step={0.1}
                value={scores[axis.id]}
                onChange={(e) => updateScore(axis.id, Number(e.target.value))}
                className="h-1.5 w-full accent-amber-500"
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400 tabular-nums">
              <span>-1.0</span>
              <span>0.0 = 平均</span>
              <span>+1.0</span>
            </div>
          </div>
        ))}
      </GlassCard>

      <GlassButton onClick={() => onComplete(scores)} className="w-full">
        この印象で確定
      </GlassButton>
    </div>
  );
}
