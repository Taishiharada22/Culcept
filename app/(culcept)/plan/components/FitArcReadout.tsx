"use client";

/**
 * app/(culcept)/plan/components/FitArcReadout.tsx
 *   — 評価OS / Stage 1: Fit-Arc(Aneura-star) の最小 readout UI（dormant・観測の readout のみ）
 *
 * ★flag OFF / production → null（DOM 不変）。
 * ★表示は「他者の平均品質」でなく「この人・この目的・この状態への適合」。
 * ★confidence をアークの **形** で: solid=観測あり / dashed=仮説 / empty=観測不足。
 * ★observed(solid) は既存 `ProgressRing` を再利用。dashed/empty は ProgressRing で表現不能なため最小カスタム。
 * ★evidence 件数チップは **常に描画（prop で消せない＝構造的に削れない）**。
 * ★ranking/推薦に一切影響しない（表示専用）。Fit-Arc は答え合わせ観測の readout であり、観測不足時に高スコア/断定を出さない。
 */
import * as React from "react";
import { ProgressRing } from "@/components/ui/glassmorphism-design";
import { buildFitArcReadout, isFitArcReadoutEnabled, type FitArcReadout as Readout } from "@/lib/plan/postVisit/fitArcReadout";
import type { PostVisitObservation } from "@/lib/plan/postVisit/postVisitObservation";

export interface FitArcReadoutProps {
  /** 対象（placeKey/lens/state）で filter 済みの Stage 0 観測。 */
  readonly observations: readonly PostVisitObservation[];
  readonly size?: number;
}

export function FitArcReadout({ observations, size = 88 }: FitArcReadoutProps) {
  if (!isFitArcReadoutEnabled()) return null; // ★flag OFF / production → DOM 不変
  const r = buildFitArcReadout(observations);
  const muted = r.state === "insufficient";
  return (
    <div data-testid="fit-arc" data-state={r.state} className="inline-flex flex-col items-center gap-1.5">
      {/* ★ヘッダ：一目で「世間の評価」でなく「あなたへの適合」だと分かる */}
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold tracking-wide text-purple-700/80">
        <span aria-hidden>🧭</span>{r.subtitle}
      </span>
      <FitRing readout={r} size={size} />
      {/* ★evidence 件数チップ（常に表示・構造的に削れない）。de Langhe の「件数無視アンカー」を防ぐ。 */}
      <span data-testid="fit-arc-count" className={`rounded-full px-2 py-0.5 text-[10px] ${muted ? "bg-slate-100 text-slate-400" : "bg-purple-50 text-purple-600 ring-1 ring-purple-100"}`}>
        観測 {r.observationCount} 件
      </span>
      {/* ★state ごとの honest 文（observed=落ち着いた紫 / tentative=薄紫 / insufficient=温かいグレー） */}
      <span data-testid="fit-arc-label" className={`max-w-[170px] text-center text-[10.5px] leading-snug ${muted ? "text-slate-400" : r.state === "tentative" ? "text-purple-400" : "text-purple-700"}`}>
        {r.label}
      </span>
    </div>
  );
}

function FitRing({ readout, size }: { readout: Readout; size: number }) {
  // observed(solid) → 既存 ProgressRing を再利用
  if (readout.arcStyle === "solid" && readout.fillPercent != null) {
    return (
      <ProgressRing progress={readout.fillPercent} size={size} strokeWidth={7}>
        <span data-testid="fit-arc-value" className="text-[15px] font-bold text-slate-800">
          {readout.fillPercent}<span className="text-[9px] font-medium">%</span>
        </span>
      </ProgressRing>
    );
  }
  return <FitRingHonest readout={readout} size={size} />;
}

/** dashed(仮説) / empty(観測不足) を honest に描く最小カスタム ring（ProgressRing は dashed/empty 非対応のため）。 */
function FitRingHonest({ readout, size }: { readout: Readout; size: number }) {
  const strokeWidth = 7;
  const radius = (size - strokeWidth) / 2;
  const dashed = readout.arcStyle === "dashed";
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none"
          strokeWidth={strokeWidth} strokeLinecap="round"
          // ★dashed=破線(仮説) / empty=点線(観測不足)。形そのものが confidence を語る。
          stroke={dashed ? "#a78bfa" : "#e2e8f0"}
          strokeDasharray={dashed ? "5 5" : "2 6"}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {dashed && readout.fillPercent != null ? (
          // ★仮説：≈ を付け、断定でないことを明示（solid の確定 % と一目で別物）
          <span data-testid="fit-arc-value" className="text-[13px] font-semibold text-purple-400">
            ≈{readout.fillPercent}<span className="text-[8px]">%</span>
          </span>
        ) : (
          // ★観測不足：値を出さない（断定しない）
          <span data-testid="fit-arc-empty" className="text-[18px] text-slate-300">—</span>
        )}
      </div>
    </div>
  );
}
