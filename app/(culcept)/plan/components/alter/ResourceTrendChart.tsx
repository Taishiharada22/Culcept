"use client";

/**
 * ResourceTrendChart — 今日のリソース推移予測（over.png の折れ線グラフ）
 *
 * 正本: over.png（CEO 2026-06-11 契約緩和でグラフ・数値解禁）
 *  - 体力(青) / 集中(紫) / 負荷(オレンジ) の 3 本 + 回復タイム帯（夜の余白）+ now マーカー縦線
 *  - x 軸 06:00-24:00 / y 0-100%。数値表示可
 */

import type { AlterScreenViewModel } from "./screenViewModel";

export interface ResourceTrendChartProps {
  trend: AlterScreenViewModel["trend"];
}

const W = 320;
const H = 132;
const PAD_L = 26;
const PAD_R = 8;
const PAD_T = 10;
const PAD_B = 18;
const PLOT_W = W - PAD_L - PAD_R;
const PLOT_H = H - PAD_T - PAD_B;

const DAY_START = 6 * 60;
const DAY_END = 24 * 60;
const SPAN = DAY_END - DAY_START;

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
function xOf(hhmm: string): number {
  return PAD_L + (Math.min(Math.max(toMin(hhmm), DAY_START), DAY_END) - DAY_START) / SPAN * PLOT_W;
}
function yOf(v: number): number {
  return PAD_T + (1 - Math.min(Math.max(v, 0), 100) / 100) * PLOT_H;
}

function linePath(points: Array<{ t: string; v: number }>): string {
  return points
    .map((p, i) => `${i === 0 ? "M" : "L"}${xOf(p.t).toFixed(1)},${yOf(p.v).toFixed(1)}`)
    .join(" ");
}

const X_TICKS = ["06:00", "09:00", "12:00", "15:00", "18:00", "21:00", "24:00"];

export function ResourceTrendChart({ trend }: ResourceTrendChartProps) {
  const energy = trend.points.map((p) => ({ t: p.t, v: p.energy }));
  const focus = trend.points.map((p) => ({ t: p.t, v: p.focus }));
  const load = trend.points.map((p) => ({ t: p.t, v: p.load }));
  const bandX1 = xOf(trend.recoveryBand[0]);
  const bandX2 = xOf(trend.recoveryBand[1]);
  const nowX = xOf(trend.nowMarker);

  const legend = [
    { label: "体力", color: "#3b82f6" },
    { label: "集中", color: "#8b5cf6" },
    { label: "負荷", color: "#fb923c" },
    { label: "回復タイム", swatch: "rgba(167,139,250,0.28)" },
  ];

  return (
    <section
      aria-label="今日のリソース推移予測"
      className="rounded-3xl border border-white bg-gradient-to-b from-white to-indigo-50/40 p-3 shadow-[0_6px_18px_rgba(99,102,241,0.10)] backdrop-blur-sm"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h3 className="text-[12px] font-bold text-slate-700">今日のリソース推移予測</h3>
        <div className="ml-auto flex items-center gap-2 text-[8.5px] text-slate-500">
          {legend.map((l) => (
            <span key={l.label} className="flex items-center gap-1">
              {"color" in l ? (
                <span className="h-[3px] w-3 rounded-full" style={{ background: l.color }} />
              ) : (
                <span className="h-2 w-3 rounded-sm" style={{ background: l.swatch }} />
              )}
              {l.label}
            </span>
          ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="mt-1.5 w-full" role="img" aria-label="体力・集中・負荷の推移予測">
        {/* y グリッド + ラベル */}
        {[0, 25, 50, 75, 100].map((g) => (
          <g key={g}>
            <line x1={PAD_L} y1={yOf(g)} x2={W - PAD_R} y2={yOf(g)} stroke="#e2e8f0" strokeWidth={0.6} />
            <text x={PAD_L - 4} y={yOf(g) + 2.5} textAnchor="end" fontSize={6} fill="#94a3b8" className="tabular-nums">
              {g}
            </text>
          </g>
        ))}

        {/* 回復タイム帯 */}
        <rect x={bandX1} y={PAD_T} width={Math.max(bandX2 - bandX1, 2)} height={PLOT_H} fill="rgba(167,139,250,0.20)" rx={2} />
        <text x={(bandX1 + bandX2) / 2} y={PAD_T + 8} textAnchor="middle" fontSize={6} fill="#7c3aed">
          回復タイム
        </text>

        {/* now マーカー */}
        <line x1={nowX} y1={PAD_T} x2={nowX} y2={H - PAD_B} stroke="#6366f1" strokeWidth={1} strokeDasharray="2 2" />
        <g transform={`translate(${nowX}, ${PAD_T - 1})`}>
          <rect x={-13} y={-2} width={26} height={9} rx={4.5} fill="#6366f1" />
          <text x={0} y={4.5} textAnchor="middle" fontSize={6} fill="#fff" className="tabular-nums">
            {trend.nowMarker}
          </text>
        </g>

        {/* ライン */}
        <path d={linePath(load)} fill="none" stroke="#fb923c" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
        <path d={linePath(focus)} fill="none" stroke="#8b5cf6" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
        <path d={linePath(energy)} fill="none" stroke="#3b82f6" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />

        {/* x ラベル */}
        {X_TICKS.map((t) => (
          <text key={t} x={xOf(t)} y={H - 6} textAnchor="middle" fontSize={6} fill="#94a3b8" className="tabular-nums">
            {t}
          </text>
        ))}
      </svg>
    </section>
  );
}
