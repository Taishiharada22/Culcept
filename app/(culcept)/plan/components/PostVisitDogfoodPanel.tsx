"use client";

/**
 * app/(culcept)/plan/components/PostVisitDogfoodPanel.tsx
 *   — 評価OS / Stage 4-A2: dogfood readiness の **read-only inspection panel**（dev 限定）
 *
 * ★flag OFF / production → null（DOM 不変）。localStorage shadow を読むだけ・**書かない・ranking 非影響**。
 * ★raw 値・PII・exact 値は一切出さない（集計と短縮 opaque placeKey のみ）。
 */
import * as React from "react";
import { isPostVisitCheckEnabled } from "@/lib/plan/postVisit/postVisitObservation";
import { loadPostVisitObservations } from "@/lib/plan/postVisit/postVisitStore";
import { summarizePostVisitDogfood, type PostVisitDogfoodSummary } from "@/lib/plan/postVisit/postVisitDogfoodSummary";

function Dist({ title, map }: { title: string; map: Record<string, number> }) {
  const entries = Object.entries(map).sort((a, b) => b[1] - a[1]);
  return (
    <div className="rounded-lg bg-white p-2 ring-1 ring-black/5">
      <p className="text-[11px] font-semibold text-slate-600">{title}</p>
      {entries.length === 0 ? (
        <p className="text-[10px] text-slate-400">—</p>
      ) : (
        <ul className="mt-1 space-y-0.5">
          {entries.map(([k, n]) => (
            <li key={k} className="flex justify-between text-[10.5px] text-slate-500">
              <span className="font-mono">{k}</span>
              <span className="tabular-nums text-slate-700">{n}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function PostVisitDogfoodPanel() {
  const [summary, setSummary] = React.useState<PostVisitDogfoodSummary | null>(null);

  React.useEffect(() => {
    if (!isPostVisitCheckEnabled()) return;
    setSummary(summarizePostVisitDogfood(loadPostVisitObservations()));
  }, []);

  if (!isPostVisitCheckEnabled()) return null; // ★flag OFF / production → DOM 不変
  if (!summary) return null;
  const s = summary;
  const pct = (n: number) => `${Math.round(n * 100)}%`;

  return (
    <div data-testid="postvisit-dogfood-panel" className="mx-auto max-w-[680px] space-y-3 p-4 text-slate-800">
      <header>
        <h1 className="text-[15px] font-bold">post-visit dogfood inspection（dev・read-only）</h1>
        <p className="text-[11px] text-slate-400">localStorage shadow の集計のみ・raw/PII/exact は出さない・ranking 非影響</p>
      </header>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="観測 total" value={s.total} />
        <Stat label="context 付き" value={s.withContext} sub={pct(s.contextCoverage)} />
        <Stat label="context 無し(legacy)" value={s.withoutContext} />
        <Stat label="redaction 違反" value={s.redactionViolations} danger={s.redactionViolations > 0} />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Dist title="by sourceSurface" map={s.bySourceSurface} />
        <Dist title="by trigger" map={s.byTrigger} />
        <Dist title="by response" map={s.byResponse} />
        <Dist title="by timeOfDay" map={s.byTimeOfDay} />
        <Dist title="by dayType" map={s.byDayType} />
        <Dist title="by gapBucket" map={s.byGapBucket} />
      </div>

      <div className="rounded-lg bg-white p-2 ring-1 ring-black/5">
        <p className="text-[11px] font-semibold text-slate-600">
          Fit-Arc per place（観測量・context cells={s.contextCellsCovered}）
        </p>
        {s.fitArcByPlace.length === 0 ? (
          <p className="text-[10px] text-slate-400">観測なし</p>
        ) : (
          <ul className="mt-1 space-y-0.5">
            {s.fitArcByPlace.slice(0, 20).map((p) => (
              <li key={p.placeKeyShort} className="flex justify-between text-[10.5px] text-slate-500">
                <span className="font-mono">{p.placeKeyShort}</span>
                <span className="tabular-nums">
                  {p.count}件 · <span className={p.state === "observed" ? "text-purple-700" : p.state === "tentative" ? "text-purple-400" : "text-slate-400"}>{p.state}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, sub, danger }: { label: string; value: number; sub?: string; danger?: boolean }) {
  return (
    <div className={`rounded-lg p-2 ring-1 ${danger ? "bg-rose-50 ring-rose-200" : "bg-white ring-black/5"}`}>
      <p className="text-[10px] text-slate-400">{label}</p>
      <p className={`text-[18px] font-bold tabular-nums ${danger ? "text-rose-600" : "text-slate-800"}`}>
        {value}
        {sub && <span className="ml-1 text-[11px] font-medium text-slate-400">{sub}</span>}
      </p>
    </div>
  );
}
