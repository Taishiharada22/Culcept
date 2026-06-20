"use client";

/**
 * ResourceTrendChart — 今日の推移予測（over.png の折れ線グラフ）+ 流れレール
 *
 * 正本: over.png（CEO 2026-06-11 契約緩和でグラフ・数値解禁）+ W1 D-1（CEO 判断 2026-06-12）
 *  - 体力(青) / 集中(紫) / 負荷(オレンジ) の 3 本 + 回復タイム帯（夜の余白）+ now マーカー縦線
 *  - 曲線動態は mock_reference（参考値）。時刻軸・回復帯・now・流れレール = flow_derived（実セグメント）
 *  - 流れレール（D-1: 「今日の流れ」事実帯の統合）: x 軸下に予定/移動/余白を実セグメントで表示。
 *    ラベルは実セグメント由来のみ（捏造禁止）・表示は最大 3 件に絞る（うるささ回避）
 */

import { useEffect, useState } from "react";
import type { AlterBatteryViewModel } from "@/lib/plan/dayState/dayStateTypes";
import { jstNowMinutes, type AlterScreenViewModel } from "./screenViewModel";
import { RefBadge } from "./ForecastCards";

type FlowSegments = AlterBatteryViewModel["flowTimeline"]["segments"];

export interface ResourceTrendChartProps {
  trend: AlterScreenViewModel["trend"];
  /** D-1: flowTimeline の実セグメント（流れレール表示用）。省略時はレールなし */
  segments?: FlowSegments;
}

function minToHHMM(min: number): string {
  const m = Math.min(Math.max(Math.round(min), DAY_START), DAY_END);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

const W = 320;
const H = 150; // W1 D-1: 流れレール分の高さを追加（旧 132）
const PAD_L = 26;
const PAD_R = 8;
const PAD_T = 10;
const PAD_B = 36; // x ラベルの下に流れレール（旧 18）
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

/** ライン下の面（over.png の柔らかいエリアフィル） */
function areaPath(points: Array<{ t: string; v: number }>): string {
  if (points.length === 0) return "";
  const first = points[0];
  const last = points[points.length - 1];
  return `${linePath(points)} L${xOf(last.t).toFixed(1)},${(H - PAD_B).toFixed(1)} L${xOf(first.t).toFixed(1)},${(H - PAD_B).toFixed(1)} Z`;
}

const X_TICKS = ["06:00", "09:00", "12:00", "15:00", "18:00", "21:00", "24:00"];

const RAIL_COLOR: Record<string, string> = {
  event: "#818cf8", // indigo-400
  travel: "#94a3b8", // slate-400
  slack: "rgba(167,139,250,0.45)", // 回復タイム帯と同系
};

/** レールに出す予定ラベル: 実セグメント由来のみ・長い順に最大 3 件・6 文字で省略 */
function railLabels(segments: FlowSegments): Array<{ x: number; text: string }> {
  return segments
    .filter((s) => s.kind === "event" && s.label)
    .map((s) => ({ s, dur: toMin(s.endHHMM) - toMin(s.startHHMM) }))
    .sort((a, b) => b.dur - a.dur)
    .slice(0, 3)
    .map(({ s }) => ({
      x: (xOf(s.startHHMM) + xOf(s.endHHMM)) / 2,
      text: (s.label as string).length > 6 ? `${(s.label as string).slice(0, 5)}…` : (s.label as string),
    }));
}

export function ResourceTrendChart({ trend, segments }: ResourceTrendChartProps) {
  // now マーカーを 1 分ごとに日本時間で自動更新（B15・CEO 指示③）。
  // 初回 SSR は VM の nowMarker（server JST）。mount 後にクライアント時計で同期し 60s 間隔で進む。
  const [nowHHMM, setNowHHMM] = useState(trend.nowMarker);
  useEffect(() => {
    const tick = () => setNowHHMM(minToHHMM(jstNowMinutes(new Date())));
    tick();
    // 次の分境界に合わせてから 60s 間隔に入る
    const now = new Date();
    const msToNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
    let interval: ReturnType<typeof setInterval> | undefined;
    const align = setTimeout(() => {
      tick();
      interval = setInterval(tick, 60000);
    }, msToNextMinute);
    return () => {
      clearTimeout(align);
      if (interval) clearInterval(interval);
    };
  }, []);

  const energy = trend.points.map((p) => ({ t: p.t, v: p.energy }));
  const focus = trend.points.map((p) => ({ t: p.t, v: p.focus }));
  const load = trend.points.map((p) => ({ t: p.t, v: p.load }));
  const bandX1 = xOf(trend.recoveryBand[0]);
  const bandX2 = xOf(trend.recoveryBand[1]);
  const nowX = xOf(nowHHMM);

  const legend = [
    { label: "体力", color: "#3b82f6" },
    { label: "集中", color: "#8b5cf6" },
    { label: "負荷", color: "#fb923c" },
    { label: "回復タイム", swatch: "rgba(167,139,250,0.28)" },
    ...(segments && segments.length > 0
      ? [
          { label: "予定", swatch: RAIL_COLOR.event },
          { label: "移動", swatch: RAIL_COLOR.travel },
        ]
      : []),
  ];
  const railY = H - 12; // x ラベル（H-24 付近）の下
  const labels = segments ? railLabels(segments) : [];

  return (
    <section
      aria-label="今日の推移予測"
      className="rounded-3xl border border-white bg-gradient-to-b from-white to-indigo-50/40 p-3 shadow-[0_6px_18px_rgba(99,102,241,0.10)] backdrop-blur-sm"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h3 className="text-[12px] font-bold text-slate-700">今日の推移予測</h3>
        <RefBadge />
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
        <defs>
          <linearGradient id="rtc-energy" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.18} />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="rtc-focus" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.12} />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
          </linearGradient>
        </defs>
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
            {nowHHMM}
          </text>
        </g>

        {/* エリアフィル（体力・集中の柔らかい面） */}
        <path d={areaPath(focus)} fill="url(#rtc-focus)" />
        <path d={areaPath(energy)} fill="url(#rtc-energy)" />

        {/* ライン + 時間ごとのデータ点 ・（over.png 準拠） */}
        <path d={linePath(load)} fill="none" stroke="#fb923c" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
        <path d={linePath(focus)} fill="none" stroke="#8b5cf6" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
        <path d={linePath(energy)} fill="none" stroke="#3b82f6" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
        {load.map((p) => (
          <circle key={`l-${p.t}`} cx={xOf(p.t)} cy={yOf(p.v)} r={1.7} fill="#fb923c" stroke="#fff" strokeWidth={0.6} />
        ))}
        {focus.map((p) => (
          <circle key={`f-${p.t}`} cx={xOf(p.t)} cy={yOf(p.v)} r={1.7} fill="#8b5cf6" stroke="#fff" strokeWidth={0.6} />
        ))}
        {energy.map((p) => (
          <circle key={`e-${p.t}`} cx={xOf(p.t)} cy={yOf(p.v)} r={1.9} fill="#3b82f6" stroke="#fff" strokeWidth={0.6} />
        ))}

        {/* x ラベル */}
        {X_TICKS.map((t) => (
          <text key={t} x={xOf(t)} y={H - 24} textAnchor="middle" fontSize={6} fill="#94a3b8" className="tabular-nums">
            {t}
          </text>
        ))}

        {/* 流れレール（D-1: 予定/移動/夜の余白の実セグメント。事実のみ・捏造なし） */}
        {segments && segments.length > 0 && (
          <g aria-label="今日の流れ（予定・移動・余白）">
            <line x1={PAD_L} y1={railY} x2={W - PAD_R} y2={railY} stroke="#e2e8f0" strokeWidth={3.5} strokeLinecap="round" />
            {segments.map((seg, i) => {
              const x1 = xOf(seg.startHHMM);
              const x2 = xOf(seg.endHHMM);
              if (x2 - x1 < 1) return null;
              const color =
                seg.kind === "event" ? RAIL_COLOR.event : seg.kind === "travel" ? RAIL_COLOR.travel : seg.isEveningSlack ? RAIL_COLOR.slack : null;
              if (!color) return null;
              return (
                <line
                  key={`rail-${i}`}
                  x1={x1 + 0.5}
                  y1={railY}
                  x2={x2 - 0.5}
                  y2={railY}
                  stroke={color}
                  strokeWidth={3.5}
                  strokeLinecap="round"
                />
              );
            })}
            {labels.map((l) => (
              <text key={`rl-${l.x}-${l.text}`} x={l.x} y={railY + 8} textAnchor="middle" fontSize={5.5} fill="#64748b">
                {l.text}
              </text>
            ))}
          </g>
        )}
      </svg>
    </section>
  );
}
