// app/(immersive)/stargazer/_components/StargazerSkeletons.tsx
// 汎用スケルトンコンポーネント — タブ・カード・レーダー用
"use client";

/**
 * TabSkeleton — タブコンテンツのローディングプレースホルダー
 * タブ切り替え時やReact.lazy読み込み中に表示
 */
export function TabSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      {/* Header area */}
      <div
        className="rounded-2xl p-6"
        style={{ background: "rgba(255,255,255,0.04)" }}
      >
        <div className="h-5 w-2/5 rounded bg-slate-700/20 mb-4" />
        <div className="h-4 w-4/5 rounded bg-slate-700/15 mb-2" />
        <div className="h-4 w-3/5 rounded bg-slate-700/15 mb-6" />
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-slate-700/10" />
          ))}
        </div>
      </div>

      {/* Secondary cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="h-28 rounded-2xl bg-slate-700/8" />
        <div className="h-28 rounded-2xl bg-slate-700/8" />
      </div>

      {/* Tertiary row */}
      <div
        className="rounded-2xl p-5"
        style={{ background: "rgba(255,255,255,0.03)" }}
      >
        <div className="h-4 w-1/3 rounded bg-slate-700/15 mb-3" />
        <div className="space-y-2">
          <div className="h-3 w-full rounded bg-slate-700/10" />
          <div className="h-3 w-4/5 rounded bg-slate-700/10" />
          <div className="h-3 w-2/3 rounded bg-slate-700/10" />
        </div>
      </div>
    </div>
  );
}

/**
 * CardSkeleton — インサイト・予測カードのプレースホルダー
 * insight, prediction, observation カードの読み込み中に使用
 */
export function CardSkeleton() {
  return (
    <div
      className="rounded-2xl p-5 animate-pulse"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      {/* Badge row */}
      <div className="flex items-center gap-2 mb-4">
        <div className="h-5 w-16 rounded-full bg-slate-700/20" />
        <div className="h-4 w-20 rounded bg-slate-700/12" />
      </div>

      {/* Title */}
      <div className="h-4 w-4/5 rounded bg-slate-700/15 mb-2" />
      <div className="h-4 w-3/5 rounded bg-slate-700/15 mb-4" />

      {/* Description lines */}
      <div className="space-y-2 mb-4">
        <div className="h-3 w-full rounded bg-slate-700/10" />
        <div className="h-3 w-5/6 rounded bg-slate-700/10" />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-2">
        <div className="h-3 w-24 rounded bg-slate-700/10" />
        <div className="h-3 w-16 rounded bg-slate-700/10" />
      </div>
    </div>
  );
}

/**
 * RadarSkeleton — レーダーチャートのプレースホルダー
 * アーキタイプタブや特性タブのレーダー表示用
 */
export function RadarSkeleton() {
  return (
    <div
      className="rounded-2xl p-6 animate-pulse"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      {/* Label */}
      <div className="h-4 w-1/3 rounded bg-slate-700/15 mb-6 mx-auto" />

      {/* Hexagonal radar placeholder */}
      <div className="flex items-center justify-center py-4">
        <div className="relative w-44 h-44">
          <svg
            viewBox="0 0 200 200"
            className="w-full h-full"
            style={{ opacity: 0.2 }}
          >
            {/* Outer hexagon */}
            <polygon
              points="100,20 175,65 175,135 100,180 25,135 25,65"
              fill="none"
              stroke="rgba(148,163,184,0.3)"
              strokeWidth="1"
            />
            {/* Mid hexagon */}
            <polygon
              points="100,50 155,77 155,123 100,150 45,123 45,77"
              fill="none"
              stroke="rgba(148,163,184,0.2)"
              strokeWidth="1"
            />
            {/* Inner hexagon */}
            <polygon
              points="100,80 130,93 130,107 100,120 70,107 70,93"
              fill="rgba(148,163,184,0.05)"
              stroke="rgba(148,163,184,0.15)"
              strokeWidth="1"
            />
            {/* Center dot */}
            <circle
              cx="100"
              cy="100"
              r="3"
              fill="rgba(148,163,184,0.2)"
            />
          </svg>
        </div>
      </div>

      {/* Axis labels */}
      <div className="grid grid-cols-3 gap-2 mt-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-6 rounded-lg bg-slate-700/10" />
        ))}
      </div>
    </div>
  );
}
