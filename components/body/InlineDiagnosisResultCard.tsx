"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { GlassBadge, GlassButton, GlassCard } from "@/components/ui/glassmorphism-design";

type DiagnosisResponse = {
  profile?: {
    diagnosisScore?: number;
    personalColor?: {
      season?: string;
      description?: string;
      recommendedColors?: string[];
      confidence?: number;
    };
    bodyType?: {
      type?: string;
      name?: string;
      silhouette?: string;
      description?: string;
      confidence?: number;
      recommendedItems?: string[];
      avoidItems?: string[];
    };
    deepInsights?: Array<{
      title?: string;
      text?: string;
      confidence?: number;
      evidence?: string;
    }>;
  };
  error?: string;
};

function scoreTone(score: number) {
  if (score >= 80) {
    return {
      chip: "bg-emerald-50 text-emerald-700 border-emerald-200",
      ring: "from-emerald-400/25 to-cyan-400/20",
    };
  }
  if (score >= 60) {
    return {
      chip: "bg-amber-50 text-amber-700 border-amber-200",
      ring: "from-amber-300/25 to-orange-300/20",
    };
  }
  return {
    chip: "bg-rose-50 text-rose-700 border-rose-200",
    ring: "from-rose-400/25 to-pink-400/20",
  };
}

export default function InlineDiagnosisResultCard() {
  const [data, setData] = useState<DiagnosisResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    fetch("/api/style-profile", { cache: "no-store", credentials: "include" })
      .then(async (response) => {
        const json = (await response.json().catch(() => ({}))) as DiagnosisResponse;
        if (!response.ok) {
          throw new Error(json.error ?? "診断データの取得に失敗しました");
        }
        if (active) setData(json);
      })
      .catch((fetchError: unknown) => {
        if (!active) return;
        setError(fetchError instanceof Error ? fetchError.message : "診断データの取得に失敗しました");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <GlassCard className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-5 w-40 rounded-full bg-slate-200" />
          <div className="grid gap-3 md:grid-cols-2">
            <div className="h-28 rounded-3xl bg-slate-100" />
            <div className="h-28 rounded-3xl bg-slate-100" />
          </div>
          <div className="h-24 rounded-3xl bg-slate-100" />
        </div>
      </GlassCard>
    );
  }

  if (error || !data?.profile) {
    return (
      <GlassCard className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-lg font-bold text-slate-900">総合診断</div>
            <div className="mt-1 text-sm text-slate-500">
              {error ?? "診断データがまだありません。"}
            </div>
          </div>
          <GlassButton href="/style-profile" variant="gradient">
            診断を確認
          </GlassButton>
        </div>
      </GlassCard>
    );
  }

  const diagnosisScore = Math.round(data.profile.diagnosisScore ?? 0);
  const tone = scoreTone(diagnosisScore);
  const bodyType = data.profile.bodyType;
  const personalColor = data.profile.personalColor;
  const insights = (data.profile.deepInsights ?? []).filter((item) => item?.title || item?.text).slice(0, 3);

  return (
    <GlassCard className="relative overflow-hidden p-6">
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${tone.ring}`} />
      <div className="relative">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-slate-900">総合診断</span>
              <GlassBadge variant="default">inline</GlassBadge>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              ページ遷移せず、この場で骨格とパーソナルカラーの要点を確認できます。
            </p>
          </div>
          <div className={`rounded-full border px-4 py-2 text-sm font-black ${tone.chip}`}>
            Score {diagnosisScore}
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <div className="rounded-3xl border border-white/70 bg-white/70 p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Body Type</div>
            <div className="mt-2 text-xl font-black text-slate-900">
              {bodyType?.name ?? bodyType?.type ?? "未解析"}
            </div>
            <div className="mt-1 text-sm text-slate-500">
              {bodyType?.silhouette ?? bodyType?.description ?? "体型データをもとにシルエット適性を表示します。"}
            </div>
            {Array.isArray(bodyType?.recommendedItems) && bodyType.recommendedItems.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {bodyType.recommendedItems.slice(0, 3).map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700"
                  >
                    {item}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <div className="rounded-3xl border border-white/70 bg-white/70 p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Personal Color</div>
            <div className="mt-2 text-xl font-black text-slate-900">
              {personalColor?.season ?? "未解析"}
            </div>
            <div className="mt-1 text-sm text-slate-500">
              {personalColor?.description ?? "肌色・明度・コントラストから色相性を表示します。"}
            </div>
            {Array.isArray(personalColor?.recommendedColors) && personalColor.recommendedColors.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {personalColor.recommendedColors.slice(0, 4).map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700"
                  >
                    {item}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-4 rounded-3xl border border-white/70 bg-white/70 p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-bold text-slate-900">診断の根拠</div>
            <Link href="/style-profile" className="text-xs font-semibold text-slate-500 hover:text-slate-800">
              詳細を見る →
            </Link>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {insights.length > 0 ? (
              insights.map((insight, index) => (
                <div key={`${insight.title ?? "insight"}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-sm font-bold text-slate-900">{insight.title ?? "Insight"}</div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">{insight.text ?? "分析中"}</div>
                  {insight.evidence ? (
                    <div className="mt-2 text-[11px] font-medium text-slate-400">{insight.evidence}</div>
                  ) : null}
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500 md:col-span-3">
                データが増えると、ここに診断の根拠が表示されます。
              </div>
            )}
          </div>
        </div>
      </div>
    </GlassCard>
  );
}
