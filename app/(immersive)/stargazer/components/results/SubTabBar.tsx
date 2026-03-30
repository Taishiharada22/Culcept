"use client";

export type ResultSubTab =
  | "overview"
  | "traits"
  | "context"
  | "insights"
  | "orbit"
  | "unobserved";

interface TabDef {
  key: ResultSubTab;
  label: string;
}

const TABS: TabDef[] = [
  { key: "overview", label: "概要" },
  { key: "traits", label: "特性" },
  { key: "context", label: "文脈差" },
  { key: "insights", label: "洞察" },
  { key: "orbit", label: "軌道" },
  { key: "unobserved", label: "未観測" },
];

interface Props {
  activeTab: ResultSubTab;
  onTabChange: (tab: ResultSubTab) => void;
}

export default function SubTabBar({ activeTab, onTabChange }: Props) {
  return (
    <div className="overflow-x-auto scrollbar-hide -mx-4 px-4">
      <div role="tablist" className="flex items-center gap-1 min-w-max pb-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={activeTab === tab.key}
            onClick={() => onTabChange(tab.key)}
            className={`px-4 py-2 rounded-lg font-body text-sm font-semibold whitespace-nowrap transition-all duration-200 ${
              activeTab === tab.key
                ? "bg-white/[0.06] text-amber-300"
                : "text-white/35 hover:text-white/60"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}
