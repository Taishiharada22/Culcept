"use client";

import { useMemo } from "react";

const C = { neural: "#8B5CF6", pulse: "#EC4899", t3: "#8888a0", t4: "#c8c8dc" };

type RadarData = { analytical: number; cautious: number; social: number; expressive: number; independent: number };

interface Props {
  mine: RadarData;
  theirs: RadarData;
  myName?: string;
  theirName?: string;
}

const AXES = [
  { key: "analytical" as const, label: "分析", angle: -Math.PI / 2 },
  { key: "cautious" as const, label: "慎重", angle: -Math.PI / 2 + (2 * Math.PI / 5) },
  { key: "social" as const, label: "社交", angle: -Math.PI / 2 + (4 * Math.PI / 5) },
  { key: "expressive" as const, label: "表現", angle: -Math.PI / 2 + (6 * Math.PI / 5) },
  { key: "independent" as const, label: "自律", angle: -Math.PI / 2 + (8 * Math.PI / 5) },
] as const;

export default function CompareRadar({ mine, theirs, myName, theirName }: Props) {
  const cx = 60, cy = 60, r = 42;
  const axes = AXES;

  const toPoints = (data: RadarData) =>
    axes.map(({ key, angle }) => {
      const v = (data[key] / 100) * r;
      return `${cx + v * Math.cos(angle)},${cy + v * Math.sin(angle)}`;
    }).join(" ");

  const { similarities, contrasts, resonance } = useMemo(() => {
    const sims = axes.filter(({ key }) => Math.abs(mine[key] - theirs[key]) <= 15);
    const conts = axes.filter(({ key }) => Math.abs(mine[key] - theirs[key]) >= 30);
    // 共鳴度: 類似軸は直接加点、補完軸も価値がある（やや低めの加点）
    const simScore = sims.length * 20; // max 100
    const compScore = conts.length * 12; // 補完は少し低い
    const res = Math.min(100, Math.round(simScore + compScore));
    return { similarities: sims, contrasts: conts, resonance: res };
  }, [mine, theirs, axes]);

  return (
    <div className="space-y-3">
      {/* 共鳴度スコア */}
      <div className="text-center">
        <p style={{ fontSize: 8, color: C.t4, letterSpacing: "0.1em", marginBottom: 2 }}>共鳴度</p>
        <p style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.02em",
          background: `linear-gradient(135deg, ${C.neural}, ${C.pulse})`,
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
          {resonance}%
        </p>
      </div>
      <svg viewBox="0 0 120 120" className="w-full max-w-[200px] mx-auto">
        {/* Grid */}
        {[0.33, 0.66, 1.0].map((level) => (
          <polygon key={level}
            points={axes.map(({ angle }) => `${cx + r * level * Math.cos(angle)},${cy + r * level * Math.sin(angle)}`).join(" ")}
            fill="none" stroke={`${C.t4}40`} strokeWidth="0.3" />
        ))}
        {axes.map(({ key, angle }) => (
          <line key={key} x1={cx} y1={cy} x2={cx + r * Math.cos(angle)} y2={cy + r * Math.sin(angle)}
            stroke={`${C.t4}30`} strokeWidth="0.3" />
        ))}
        {/* 自分 */}
        <polygon points={toPoints(mine)} fill={`${C.neural}15`} stroke={C.neural} strokeWidth="1" strokeOpacity="0.6" />
        {/* 相手 */}
        <polygon points={toPoints(theirs)} fill={`${C.pulse}15`} stroke={C.pulse} strokeWidth="1" strokeOpacity="0.6" />
        {/* ラベル */}
        {axes.map(({ key, label, angle }) => {
          const lx = cx + (r + 12) * Math.cos(angle);
          const ly = cy + (r + 12) * Math.sin(angle);
          return <text key={key} x={lx} y={ly} textAnchor="middle" dominantBaseline="middle"
            fill={C.t3} fontSize="5.5">{label}</text>;
        })}
      </svg>

      {/* 凡例 */}
      <div className="flex justify-center gap-4">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-1.5 rounded-full" style={{ background: C.neural }} />
          <span style={{ fontSize: 10, color: C.t3 }}>{myName ?? "あなた"}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-1.5 rounded-full" style={{ background: C.pulse }} />
          <span style={{ fontSize: 10, color: C.t3 }}>{theirName ?? "相手"}</span>
        </div>
      </div>

      {/* 類似点・相違点 */}
      {similarities.length > 0 && (
        <div className="text-center">
          <p style={{ fontSize: 9, color: C.t4, letterSpacing: "0.08em", marginBottom: 4 }}>似ているところ</p>
          <div className="flex justify-center gap-1.5 flex-wrap">
            {similarities.map(({ key, label }) => (
              <span key={key} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 12,
                background: `${C.neural}10`, color: C.neural }}>{label}</span>
            ))}
          </div>
        </div>
      )}
      {contrasts.length > 0 && (
        <div className="text-center">
          <p style={{ fontSize: 9, color: C.t4, letterSpacing: "0.08em", marginBottom: 4 }}>補い合えるところ</p>
          <div className="flex justify-center gap-1.5 flex-wrap">
            {contrasts.map(({ key, label }) => (
              <span key={key} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 12,
                background: `${C.pulse}10`, color: C.pulse }}>{label}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
