"use client";

import { motion } from "framer-motion";
import type { ActivityEntry } from "@/lib/origin/v7/workspaceTypes";
import { getActivityCategoryLabel } from "@/lib/origin/v7/activityData";
import { getPeriodLabel } from "@/lib/origin/v7/periods";

type Props = {
  activities: ActivityEntry[];
  onSelectActivity: (activity: ActivityEntry) => void;
};

export default function ActivityTimelineOverlay({
  activities,
  onSelectActivity,
}: Props) {
  if (activities.length === 0) return null;

  return (
    <section className="px-3 pb-3">
      <div className="mb-2 flex items-center gap-1.5 px-1">
        <span className="text-sm">📋</span>
        <h4 className="text-xs font-semibold text-gray-600">活動履歴</h4>
        <span className="ml-auto text-[10px] text-gray-400">
          {activities.length}件
        </span>
      </div>
      <div className="space-y-1.5">
        {activities.map((activity, i) => (
          <motion.button
            key={activity.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSelectActivity(activity)}
            className="flex w-full items-center gap-2.5 rounded-xl border border-amber-100/40 bg-white/50 px-3 py-2 text-left transition-all hover:border-amber-200/60 hover:bg-white/70"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-50/80 text-sm">
              {getCategoryIcon(activity.category)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-gray-700">
                {activity.name}
              </p>
              <p className="text-[10px] text-gray-400">
                {getPeriodLabel(activity.period)}
                {activity.endPeriod && activity.endPeriod !== activity.period
                  ? ` 〜 ${getPeriodLabel(activity.endPeriod)}`
                  : ""}
                {" · "}
                {getActivityCategoryLabel(activity.category)}
              </p>
            </div>
            <div className="shrink-0">
              <TimeAllocationDot allocation={activity.timeAllocation} />
            </div>
          </motion.button>
        ))}
      </div>
    </section>
  );
}

function getCategoryIcon(category: string): string {
  const icons: Record<string, string> = {
    club: "🏅",
    hobby: "🎨",
    study: "📚",
    part_time: "💰",
    job: "💼",
    creative: "✏️",
    competition: "🏆",
    volunteer: "🤲",
    other: "📝",
  };
  return icons[category] ?? "📝";
}

function TimeAllocationDot({
  allocation,
}: {
  allocation: "main" | "secondary" | "occasional";
}) {
  const config: Record<string, { color: string; label: string }> = {
    main: { color: "bg-amber-400", label: "中心" },
    secondary: { color: "bg-amber-300/70", label: "並行" },
    occasional: { color: "bg-gray-300/70", label: "時々" },
  };
  const c = config[allocation] ?? config.occasional;
  return (
    <div className="flex items-center gap-1">
      <div className={`h-1.5 w-1.5 rounded-full ${c.color}`} />
      <span className="text-[9px] text-gray-400">{c.label}</span>
    </div>
  );
}
