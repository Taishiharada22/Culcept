/**
 * OrbitDock configuration builder.
 * Converts InstrumentRail data into OrbitDock items with status text.
 */
import type { OrbitItem } from "@/components/home/OrbitDock";

type OrbitConfigContext = {
  sgData: { observationCount?: number; confidence?: number; archetype?: string; archetypeCode?: string } | null;
  identityLive: any;
  ptData: { pct: number } | null;
  instrumentUsedToday: Record<string, boolean>;
  innerWeather?: { recorded?: boolean } | null;
  calendarFeed?: { days?: any[] } | null;
};

export function buildOrbitItems(ctx: OrbitConfigContext): OrbitItem[] {
  const { sgData, identityLive, ptData, instrumentUsedToday, innerWeather, calendarFeed } = ctx;
  const il = identityLive as any;
  const obsCount = sgData?.observationCount ?? 0;

  return [
    // ─── Primary (daily use) ───
    {
      key: "stargazer",
      icon: "🧠",
      label: "Stargazer",
      color: "#6366F1",
      progress: Math.min(100, Math.round((obsCount / 100) * 100)),
      href: "/stargazer",
      tier: "primary" as const,
      usedToday: instrumentUsedToday.stargazer,
      pulse: instrumentUsedToday.stargazer ? "none" as const : "strong" as const,
      status: instrumentUsedToday.stargazer
        ? `${obsCount}問完了`
        : obsCount === 0
          ? "性格を観測する"
          : "今日の観測がある",
    },
    {
      key: "origin",
      icon: "📝",
      label: "Origin",
      color: "#EAB308",
      progress: il?.origin?.pct ?? 0,
      href: "/origin",
      tier: "primary" as const,
      usedToday: instrumentUsedToday.origin,
      pulse: instrumentUsedToday.origin ? "none" as const : "medium" as const,
      status: instrumentUsedToday.origin
        ? "記録済み"
        : "日記・経験を記録",
    },
    {
      key: "calendar",
      icon: "📅",
      label: "Calendar",
      color: "#14B8A6",
      progress: 0,
      href: "/calendar",
      tier: "primary" as const,
      usedToday: instrumentUsedToday.calendar,
      pulse: instrumentUsedToday.calendar ? "none" as const : "soft" as const,
      status: calendarFeed?.days?.[0]?.weather
        ? `${calendarFeed.days[0].weather.icon ?? "☀️"} ${Math.round(calendarFeed.days[0].weather.temp ?? 20)}°`
        : "今日のコーデ",
    },

    // ─── Secondary (setup-oriented) ───
    {
      key: "style",
      icon: "👗",
      label: "Style",
      color: "#A855F7",
      progress: il?.style?.pct ?? 0,
      href: "/my-style?source=aneurasync&mode=sync",
      tier: "secondary" as const,
      usedToday: instrumentUsedToday.style,
      pulse: (il?.style?.pct ?? 0) > 0 ? "none" as const : "soft" as const,
      status: (il?.style?.pct ?? 0) > 0 ? "微調整可能" : "好みを入力",
    },
    {
      key: "phenotype",
      icon: "🫀",
      label: "Phenotype",
      color: "#EC4899",
      progress: ptData?.pct ?? 0,
      href: "/body-color/avatar",
      tier: "secondary" as const,
      usedToday: instrumentUsedToday.phenotype,
      pulse: (ptData?.pct ?? 0) > 0 ? "none" as const : "soft" as const,
      status: (ptData?.pct ?? 0) > 0 ? "完了済み" : "診断を始める",
    },
  ];
}
