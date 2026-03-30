"use client";

interface Props {
  count: number;
  avgResponseTime?: string;
  hesitation?: string;
  theme?: string;
}

export default function EvidenceLine({
  count,
  avgResponseTime,
  hesitation,
  theme,
}: Props) {
  const parts: string[] = [`${count}件`];
  if (avgResponseTime) parts.push(`平均${avgResponseTime}`);
  if (hesitation) parts.push(`迷い: ${hesitation}`);
  if (theme) parts.push(`テーマ: ${theme}`);

  return (
    <div
      className="mt-6 inline-flex items-center gap-3 px-5 py-2.5 rounded-full"
      style={{
        background: "rgba(251, 191, 36, 0.06)",
        border: "1px solid rgba(251, 191, 36, 0.12)",
      }}
    >
      <span className="text-amber-400/70 text-sm">📊</span>
      <span className="font-mono-sg text-sm text-white/55">
        {parts.join(" / ")}
      </span>
    </div>
  );
}
