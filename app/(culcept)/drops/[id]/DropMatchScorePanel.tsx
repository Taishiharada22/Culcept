"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type MatchBand = "green" | "yellow" | "red";

type MatchResponse = {
  ok: boolean;
  total300: number;
  avg100: number;
  band: MatchBand;
  confidence: number;
  style: {
    score: number;
    reasons: string[];
    tags?: string[];
    moods?: string[];
  };
  color: {
    score: number;
    reasons: string[];
  };
  fit: {
    score: number;
    reasons: string[];
    parts: Array<{ key: string; label: string; score: number }>;
    detail: Record<string, { score: number; ease: number; target: [number, number] }>;
  };
  error?: string;
};

function bandStyle(band: MatchBand) {
  if (band === "green") {
    return {
      chip: "border-emerald-200 bg-emerald-50 text-emerald-700",
      bar: "bg-emerald-500",
      soft: "from-emerald-50 to-cyan-50",
    };
  }
  if (band === "yellow") {
    return {
      chip: "border-amber-200 bg-amber-50 text-amber-700",
      bar: "bg-amber-500",
      soft: "from-amber-50 to-orange-50",
    };
  }
  return {
    chip: "border-rose-200 bg-rose-50 text-rose-700",
    bar: "bg-rose-500",
    soft: "from-rose-50 to-pink-50",
  };
}

function partColor(score: number) {
  if (score >= 80) return "bg-emerald-500";
  if (score >= 65) return "bg-amber-500";
  return "bg-rose-500";
}

export default function DropMatchScorePanel({ itemId }: { itemId: string }) {
  const pathname = usePathname();
  const [data, setData] = useState<MatchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUnauthorized, setIsUnauthorized] = useState(false);

  useEffect(() => {
    let active = true;

    fetch(`/api/items/${itemId}/match`, { cache: "no-store", credentials: "include" })
      .then(async (response) => {
        const json = (await response.json().catch(() => ({}))) as MatchResponse;
        if (response.status === 401) {
          setIsUnauthorized(true);
          throw new Error("ログインするとマッチ度を表示できます");
        }
        if (!response.ok || !json.ok) {
          throw new Error(json.error ?? "マッチ度の取得に失敗しました");
        }
        if (active) setData(json);
      })
      .catch((fetchError: unknown) => {
        if (!active) return;
        setError(fetchError instanceof Error ? fetchError.message : "マッチ度の取得に失敗しました");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [itemId]);

  if (loading) {
    return (
      <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="animate-pulse space-y-3">
          <div className="h-5 w-40 rounded-full bg-zinc-100" />
          <div className="h-20 rounded-2xl bg-zinc-100" />
          <div className="grid gap-2 md:grid-cols-3">
            <div className="h-16 rounded-2xl bg-zinc-100" />
            <div className="h-16 rounded-2xl bg-zinc-100" />
            <div className="h-16 rounded-2xl bg-zinc-100" />
          </div>
        </div>
      </section>
    );
  }

  if (!data) {
    return (
      <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black tracking-tight text-zinc-900">マッチ度</h2>
            <p className="mt-1 text-sm text-zinc-500">{error ?? "データを取得できませんでした"}</p>
          </div>
          {isUnauthorized ? (
            <Link
              href={`/login?next=${encodeURIComponent(pathname || `/drops/${itemId}`)}`}
              className="rounded-2xl border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-black text-white no-underline hover:bg-zinc-800"
            >
              ログイン
            </Link>
          ) : null}
        </div>
      </section>
    );
  }

  const style = bandStyle(data.band);

  return (
    <section className={`rounded-3xl border border-zinc-200 bg-gradient-to-br ${style.soft} p-5 shadow-sm`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-black tracking-tight text-zinc-900">ユーザーマッチ度</h2>
          <p className="mt-1 text-sm text-zinc-600">
            スタイル、色、実寸の相性を合算して表示しています。
          </p>
        </div>
        <div className={`rounded-full border px-4 py-2 text-sm font-black ${style.chip}`}>
          Match {data.total300} / 300
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-white/80 bg-white/85 p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">Average</div>
          <div className="mt-2 text-2xl font-black text-zinc-900">{data.avg100}</div>
          <div className="mt-1 text-xs text-zinc-500">confidence {Math.round(data.confidence * 100)}%</div>
        </div>
        <div className="rounded-2xl border border-white/80 bg-white/85 p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">Style</div>
          <div className="mt-2 text-2xl font-black text-zinc-900">{data.style.score}</div>
          <div className="mt-1 text-xs text-zinc-500 line-clamp-2">{data.style.reasons[0] ?? "スタイル傾向で算出"}</div>
        </div>
        <div className="rounded-2xl border border-white/80 bg-white/85 p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">Color</div>
          <div className="mt-2 text-2xl font-black text-zinc-900">{data.color.score}</div>
          <div className="mt-1 text-xs text-zinc-500 line-clamp-2">{data.color.reasons[0] ?? "カラー相性で算出"}</div>
        </div>
        <div className="rounded-2xl border border-white/80 bg-white/85 p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">Fit</div>
          <div className="mt-2 text-2xl font-black text-zinc-900">{data.fit.score}</div>
          <div className="mt-1 text-xs text-zinc-500 line-clamp-2">{data.fit.reasons[0] ?? "実寸相性で算出"}</div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-2xl border border-white/80 bg-white/85 p-4">
          <div className="text-sm font-black text-zinc-900">理由</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {[...data.style.reasons, ...data.color.reasons, ...data.fit.reasons].slice(0, 6).map((reason) => (
              <span
                key={reason}
                className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-700"
              >
                {reason}
              </span>
            ))}
          </div>
          {(data.style.tags?.length || data.style.moods?.length) ? (
            <div className="mt-4 space-y-2">
              {data.style.tags && data.style.tags.length > 0 ? (
                <div className="text-xs text-zinc-500">
                  style: {data.style.tags.slice(0, 5).join(", ")}
                </div>
              ) : null}
              {data.style.moods && data.style.moods.length > 0 ? (
                <div className="text-xs text-zinc-500">
                  mood: {data.style.moods.slice(0, 5).join(", ")}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-white/80 bg-white/85 p-4">
          <div className="text-sm font-black text-zinc-900">Fit内訳</div>
          <div className="mt-3 space-y-3">
            {data.fit.parts.length > 0 ? (
              data.fit.parts.map((part) => {
                const detail = data.fit.detail[part.key];
                return (
                  <div key={part.key}>
                    <div className="mb-1 flex items-center justify-between gap-3">
                      <span className="text-xs font-semibold text-zinc-700">{part.label}</span>
                      <span className="text-xs font-black text-zinc-900">{part.score}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
                      <div className={`h-full rounded-full ${partColor(part.score)}`} style={{ width: `${part.score}%` }} />
                    </div>
                    {detail ? (
                      <div className="mt-1 text-[11px] text-zinc-500">
                        ease {detail.ease} / target {detail.target[0]} - {detail.target[1]}
                      </div>
                    ) : null}
                  </div>
                );
              })
            ) : (
              <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-500">
                実寸データが不足しているため、部位別の内訳はまだ表示できません。
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
