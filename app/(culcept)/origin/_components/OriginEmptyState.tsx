"use client";

type EmptyStateVariant =
  | "no-data"       // データなし（始めたばかり）
  | "in-progress"   // データ蓄積中（もう少しで見えてくる）
  | "seasonal";     // 季節/時間帯で非表示

type Props = {
  variant: EmptyStateVariant;
  message: string;
  daysUntil?: number; // "in-progress" 用: あとN日
  totalDays?: number; // "in-progress" 用: 全体の日数
};

const GROWTH_EMOJI: [number, string][] = [
  [0, "🌱"],
  [7, "🌿"],
  [14, "🌳"],
  [28, "🌲"],
];

function getGrowthEmoji(days: number): string {
  let emoji = "🌱";
  for (const [threshold, e] of GROWTH_EMOJI) {
    if (days >= threshold) emoji = e;
  }
  return emoji;
}

export default function OriginEmptyState({ variant, message, daysUntil, totalDays }: Props) {
  const currentDays = totalDays && daysUntil != null ? totalDays - daysUntil : 0;
  const emoji = getGrowthEmoji(currentDays);

  return (
    <div className="py-6 text-center">
      <p className="text-2xl">{emoji}</p>
      <p className="mt-2 text-xs text-gray-400">{message}</p>

      {variant === "in-progress" && daysUntil != null && totalDays != null && totalDays > 0 && (
        <div className="mx-auto mt-3 max-w-[180px]">
          <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-amber-300 transition-all duration-500"
              style={{ width: `${Math.min(100, Math.round((currentDays / totalDays) * 100))}%` }}
            />
          </div>
          <p className="mt-1 text-[10px] text-gray-400">
            {currentDays}/{totalDays}日
          </p>
        </div>
      )}
    </div>
  );
}
