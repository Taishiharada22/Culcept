"use client";

interface Props {
  activeMode: "observe" | "results";
  onModeChange: (mode: "observe" | "results") => void;
  resultsLocked?: boolean;
}

export default function ModeTabBar({ activeMode, onModeChange }: Props) {
  const tabs = [
    { key: "observe" as const, label: "観測", emoji: "🔭" },
    { key: "results" as const, label: "結果", emoji: "📊" },
  ];

  return (
    <div className="flex bg-white/[0.04] rounded-xl p-1 border border-white/[0.06]">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onModeChange(tab.key)}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
            activeMode === tab.key
              ? "bg-white/[0.08] text-white"
              : "text-white/40 hover:text-white/60"
          }`}
        >
          <span>{tab.emoji}</span>
          <span>{tab.label}</span>
        </button>
      ))}
      {activeMode === "results" && (
        <div className="absolute bottom-0 left-1/2 w-6 h-0.5 bg-amber-400/60 rounded-full" />
      )}
    </div>
  );
}
