"use client";

import { useEffect, useState } from "react";

interface Props {
  resolution: number;
  answered: number;
  total: number;
  avgResponseTime?: number;
  hesitation?: number;
  completionRate?: number;
}

function useCountUp(target: number, duration = 1000) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const animate = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(target * eased));
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [target, duration]);
  return value;
}

export default function StatusBar({
  resolution,
  answered,
  total,
  avgResponseTime,
  hesitation,
  completionRate,
}: Props) {
  const percent = total > 0 ? Math.min((answered / total) * 100, 100) : 0;
  const animatedScore = useCountUp(resolution, 1200);
  const circumference = 2 * Math.PI * 52;
  const progressOffset = circumference - (percent / 100) * circumference;

  return (
    <div className="card-hero !p-6 sm:!p-8">
      <div className="flex flex-col items-center">
        {/* 解像度リング */}
        <div className="relative w-32 h-32 mb-4">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
            {/* 背景リング */}
            <circle
              cx="60" cy="60" r="52"
              fill="none"
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="2"
            />
            {/* 進捗リング */}
            <circle
              cx="60" cy="60" r="52"
              fill="none"
              stroke="url(#sgAmberGrad)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={progressOffset}
              className="transition-all duration-1000 ease-out"
            />
            <defs>
              <linearGradient id="sgAmberGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#f59e0b" />
                <stop offset="100%" stopColor="#fbbf24" />
              </linearGradient>
            </defs>
          </svg>
          {/* 中央の数字 */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span
              className="font-display text-5xl font-bold text-amber-400"
              style={{ textShadow: "0 0 40px rgba(251,191,36,0.4)" }}
            >
              {animatedScore}
            </span>
            <span className="font-body text-xs font-semibold tracking-[0.25em] text-white/30 uppercase mt-0.5">
              精度
            </span>
          </div>
        </div>

        {/* プログレスバー */}
        <div className="w-full max-w-md">
          <div className="flex justify-between font-mono-sg text-xs text-white/40 mb-1.5">
            <span>観測済 {answered}問</span>
            <span>{answered}/{total}</span>
          </div>
          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-600 via-amber-400 to-amber-300 transition-all duration-1000"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>

        {/* ミニ計器 */}
        <div className="flex gap-8 mt-5">
          {[
            { label: "反応速度", value: avgResponseTime ? `${(avgResponseTime / 1000).toFixed(1)}s` : "—" },
            { label: "迷い度", value: hesitation != null ? `${Math.round(hesitation)}%` : "—" },
            { label: "完了率", value: completionRate != null ? `${completionRate}%` : "—" },
          ].map((m) => (
            <div key={m.label} className="text-center">
              <div className="font-mono-sg text-lg font-medium text-white/90 tabular-nums">
                {m.value}
              </div>
              <div className="font-body text-xs text-white/35 mt-0.5">
                {m.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
