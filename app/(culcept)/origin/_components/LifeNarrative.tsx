"use client";

import { motion } from "framer-motion";
import { useMemo, useCallback } from "react";
import type {
  MemoryChapter,
  CurrentPosition,
  ExplorationAxis,
  LifePeriod,
} from "@/lib/origin/v7/types";
import type { ActivityEntry, TurningPoint, EraAffiliation } from "@/lib/origin/v7/workspaceTypes";
import type { ObservationGap } from "@/lib/origin/v7/observationGaps";
import type { EchoTimelineResult } from "@/lib/origin/v7/echoTimeline";
import { getPeriodLabel } from "@/lib/origin/v7/periods";
import TimelineNode from "./TimelineNode";
import FormationBridge from "./FormationBridge";

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Props
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

type Props = {
  chapters: MemoryChapter[];
  activities: ActivityEntry[];
  turningPoints: TurningPoint[];
  eraAffiliations?: EraAffiliation[];
  currentPosition: CurrentPosition | null;
  selectedChapterId?: string | null;
  gaps?: ObservationGap[];
  echoTimeline?: EchoTimelineResult;
  onStartExploration: (axis?: ExplorationAxis) => void;
  onDeepDiveChapter: (chapter: MemoryChapter, axis: ExplorationAxis) => void;
  onSelectChapter?: (chapter: MemoryChapter) => void;
  onSelectActivity: (activity: ActivityEntry) => void;
  onSelectTurningPoint: (tp: TurningPoint) => void;
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Period Order + Helpers
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const PERIOD_ORDER: Record<string, number> = {
  early_childhood: 0, elementary: 1, middle_school: 2, high_school: 3,
  late_teens: 4, early_twenties: 5, mid_twenties: 6, thirties: 7,
  forties_plus: 8, special_period: 9,
};

const CATEGORY_ICONS: Record<string, string> = {
  club: "🏅", hobby: "🎨", study: "📚", part_time: "💼", job: "💼",
  creative: "🎭", competition: "🏆", volunteer: "🤝", other: "📋",
};

const TP_CATEGORY_ICONS: Record<string, string> = {
  beginning: "🌱", ending: "🍂", meeting: "🤝", separation: "💨",
  win: "🏆", loss: "💧", defeat: "😔", move: "🚚", decision: "⚡",
};

type TimelineItem =
  | { type: "chapter"; data: MemoryChapter; period: LifePeriod; order: number }
  | { type: "activity"; data: ActivityEntry; period: LifePeriod; order: number }
  | { type: "turning_point"; data: TurningPoint; period: LifePeriod; order: number };

type PeriodGroup = {
  period: LifePeriod;
  era?: EraAffiliation;
  items: TimelineItem[];
  isGap: boolean;
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Component
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export default function LifeNarrative({
  chapters,
  activities,
  turningPoints,
  eraAffiliations,
  currentPosition,
  selectedChapterId,
  gaps,
  echoTimeline,
  onStartExploration,
  onDeepDiveChapter,
  onSelectChapter,
  onSelectActivity,
  onSelectTurningPoint,
}: Props) {
  const handleNodeClick = useCallback(
    (chapter: MemoryChapter) => {
      if (onSelectChapter) onSelectChapter(chapter);
    },
    [onSelectChapter],
  );

  // Build period groups
  const periodGroups = useMemo(() => {
    return buildPeriodGroups(chapters, activities, turningPoints, eraAffiliations, gaps);
  }, [chapters, activities, turningPoints, eraAffiliations, gaps]);

  // Get persistent echoes for highlighting
  const persistentEchoSet = useMemo(() => {
    return new Set(echoTimeline?.persistentEchoes ?? []);
  }, [echoTimeline]);

  if (chapters.length === 0 && activities.length === 0 && turningPoints.length === 0) {
    return <EmptyState onStart={() => onStartExploration()} />;
  }

  let globalIndex = 0;

  return (
    <div className="flex flex-col overflow-x-hidden">
      <section className="relative px-3">
        {/* Route line */}
        <motion.div
          initial={{ scaleY: 0 }}
          animate={{ scaleY: 1 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="absolute left-[2.05rem] top-0 bottom-0 w-[2px] origin-top"
          style={{
            background:
              "linear-gradient(to bottom, rgba(212,160,64,0.08), rgba(212,160,64,0.3) 15%, rgba(212,160,64,0.3) 75%, rgba(212,160,64,0.45))",
          }}
        />
        {/* Glow */}
        <div
          className="pointer-events-none absolute left-[1.55rem] top-0 bottom-0 w-3 opacity-40"
          style={{
            background:
              "linear-gradient(to bottom, transparent 5%, rgba(212,160,64,0.08) 20%, rgba(212,160,64,0.06) 80%, transparent 95%)",
            filter: "blur(4px)",
          }}
        />

        <div className="flex flex-col gap-1 pl-4">
          {periodGroups.map((group, gi) => (
            <div key={group.period}>
              {/* Period header */}
              <PeriodHeader
                group={group}
                isGap={group.isGap}
                onExplore={() => onStartExploration()}
              />

              {/* Items within period */}
              {group.items.map((item, ii) => {
                const idx = globalIndex++;
                if (item.type === "chapter") {
                  const ch = item.data as MemoryChapter;
                  const prevChapter = findPrevChapter(periodGroups, gi, ii);
                  return (
                    <div key={`ch-${ch.id}`}>
                      {prevChapter && (
                        <FormationBridge fromChapter={prevChapter} toChapter={ch} />
                      )}
                      <div className="relative flex items-stretch gap-3">
                        <NodeDot
                          index={idx}
                          isSelected={selectedChapterId === ch.id}
                          type="chapter"
                          depth={ch.revisitCount}
                        />
                        <div className="min-w-0 flex-1">
                          <TimelineNode
                            chapter={ch}
                            isSelected={selectedChapterId === ch.id}
                            onClick={() => handleNodeClick(ch)}
                            index={idx}
                          />
                          {/* Echo badges */}
                          {ch.echoes.length > 0 && (
                            <div className="mt-0.5 flex flex-wrap gap-1 pb-1">
                              {ch.echoes.slice(0, 4).map((echo) => (
                                <span
                                  key={echo}
                                  className={`inline-block rounded-full px-1.5 py-0.5 text-[9px] ${
                                    persistentEchoSet.has(echo)
                                      ? "bg-amber-100/60 font-medium text-amber-700"
                                      : "bg-gray-100/50 text-gray-400"
                                  }`}
                                >
                                  {echo}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                }

                if (item.type === "activity") {
                  const act = item.data as ActivityEntry;
                  return (
                    <div key={`act-${act.id}`} className="relative flex items-stretch gap-3">
                      <NodeDot index={idx} isSelected={false} type="activity" />
                      <motion.button
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.05 + 0.1 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => onSelectActivity(act)}
                        className="min-w-0 flex-1 rounded-xl border border-blue-100/40 bg-blue-50/20 p-2.5 text-left transition-all hover:border-blue-200/50 hover:bg-blue-50/40"
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs">
                            {CATEGORY_ICONS[act.category] ?? "📋"}
                          </span>
                          <span className="text-xs font-medium text-gray-700">
                            {act.name}
                          </span>
                          {act.timeAllocation === "main" && (
                            <span className="ml-auto rounded-full bg-amber-100/60 px-1.5 py-0.5 text-[8px] font-medium text-amber-600">
                              主活動
                            </span>
                          )}
                        </div>
                      </motion.button>
                    </div>
                  );
                }

                if (item.type === "turning_point") {
                  const tp = item.data as TurningPoint;
                  return (
                    <div key={`tp-${tp.id}`} className="relative flex items-stretch gap-3">
                      <NodeDot index={idx} isSelected={false} type="turning_point" impact={tp.impact} />
                      <motion.button
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.05 + 0.1 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => onSelectTurningPoint(tp)}
                        className={`min-w-0 flex-1 rounded-xl border p-2.5 text-left transition-all ${
                          tp.impact === "transformative"
                            ? "border-amber-300/50 bg-amber-50/30 hover:border-amber-400/60"
                            : "border-purple-100/40 bg-purple-50/20 hover:border-purple-200/50"
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs">
                            {TP_CATEGORY_ICONS[tp.category] ?? "⚡"}
                          </span>
                          <span className="text-xs font-medium text-gray-700">
                            {tp.title}
                          </span>
                          {tp.impact === "transformative" && (
                            <span className="ml-auto text-[9px] text-amber-500">転換点</span>
                          )}
                        </div>
                      </motion.button>
                    </div>
                  );
                }

                return null;
              })}
            </div>
          ))}

          {/* Mid-journey dots */}
          <div className="flex items-center gap-3 py-1 pl-1">
            <div className="flex h-6 w-6 items-center justify-center">
              <motion.div
                animate={{ opacity: [0.15, 0.35, 0.15] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                className="h-1 w-1 rounded-full bg-amber-400/50"
              />
            </div>
          </div>

          {/* Present anchor */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="relative flex items-center gap-3 pt-2 pb-4"
          >
            <div className="relative flex h-6 w-6 shrink-0 items-center justify-center">
              <motion.div
                animate={{ scale: [1, 1.6, 1], opacity: [0.3, 0, 0.3] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                className="absolute inset-0 rounded-full"
                style={{ border: "1px solid rgba(212,160,64,0.4)" }}
              />
              <div
                className="relative z-10 h-3 w-3 rounded-full"
                style={{
                  background: "linear-gradient(135deg, #d4a040, #e8c050)",
                  boxShadow: "0 0 12px rgba(212,160,64,0.45)",
                }}
              />
            </div>
            <div className="flex flex-col">
              <p className="text-xs font-semibold text-amber-700/70">現在</p>
              <p className="text-[10px] text-gray-400">ここに辿り着いた</p>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Period Header
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function PeriodHeader({
  group,
  isGap,
  onExplore,
}: {
  group: PeriodGroup;
  isGap: boolean;
  onExplore: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={`mb-1.5 mt-3 flex items-center gap-2 first:mt-0 ${isGap ? "opacity-50" : ""}`}
    >
      <div className="flex h-6 w-6 items-center justify-center">
        {isGap ? (
          <div className="h-1.5 w-1.5 rounded-full border border-dashed border-gray-300" />
        ) : (
          <div className="h-2 w-2 rounded-full bg-amber-300/60" />
        )}
      </div>
      <div className="flex flex-1 items-center gap-2">
        <span className={`text-[11px] font-semibold ${isGap ? "text-gray-300" : "text-gray-600"}`}>
          {getPeriodLabel(group.period)}
        </span>
        {group.era && (
          <span className="text-[9px] text-gray-400">
            {[group.era.school, group.era.mainActivity].filter(Boolean).join(" / ")}
          </span>
        )}
        {isGap && (
          <button
            onClick={onExplore}
            className="ml-auto rounded-full bg-amber-50/50 px-2 py-0.5 text-[9px] text-amber-500 transition-colors hover:bg-amber-100/50"
          >
            探索する
          </button>
        )}
      </div>
    </motion.div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Node Dot (spine marker)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function NodeDot({
  index,
  isSelected,
  type,
  depth = 0,
  impact,
}: {
  index: number;
  isSelected: boolean;
  type: "chapter" | "activity" | "turning_point";
  depth?: number;
  impact?: string;
}) {
  const color =
    type === "chapter"
      ? isSelected
        ? "rgba(212,160,64,0.8)"
        : "rgba(200,185,160,0.55)"
      : type === "activity"
        ? "rgba(96,165,250,0.5)"
        : impact === "transformative"
          ? "rgba(212,160,64,0.7)"
          : "rgba(168,85,247,0.5)";

  const hasGlow = isSelected || (type === "chapter" && depth > 0);

  return (
    <div className="relative flex flex-col items-center pt-4">
      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ delay: index * 0.05 + 0.2, duration: 0.3 }}
        className="absolute left-[1.05rem] top-[1.2rem] h-[1px] w-3 origin-left"
        style={{ background: "rgba(212,160,64,0.25)" }}
      />
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 20, delay: index * 0.05 }}
        className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center"
      >
        <div
          className="absolute inset-0 rounded-full"
          style={{ border: `1px solid ${color}` }}
        />
        <div
          className="rounded-full"
          style={{
            width: type === "chapter" ? "10px" : "7px",
            height: type === "chapter" ? "10px" : "7px",
            background: color,
            boxShadow: hasGlow ? `0 0 8px ${color}` : "none",
          }}
        />
      </motion.div>
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Build Period Groups
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function buildPeriodGroups(
  chapters: MemoryChapter[],
  activities: ActivityEntry[],
  turningPoints: TurningPoint[],
  eraAffiliations?: EraAffiliation[],
  gaps?: ObservationGap[],
): PeriodGroup[] {
  // Collect all periods with data
  const periodItems = new Map<LifePeriod, TimelineItem[]>();

  for (const ch of chapters) {
    const p = ch.fact.period;
    if (!periodItems.has(p)) periodItems.set(p, []);
    periodItems.get(p)!.push({
      type: "chapter",
      data: ch,
      period: p,
      order: 0,
    });
  }

  for (const act of activities) {
    if (!periodItems.has(act.period)) periodItems.set(act.period, []);
    periodItems.get(act.period)!.push({
      type: "activity",
      data: act,
      period: act.period,
      order: 1,
    });
  }

  for (const tp of turningPoints) {
    if (!periodItems.has(tp.period)) periodItems.set(tp.period, []);
    periodItems.get(tp.period)!.push({
      type: "turning_point",
      data: tp,
      period: tp.period,
      order: 2,
    });
  }

  // Gap periods (no data but detected as gap)
  const gapPeriods = new Set<LifePeriod>();
  if (gaps) {
    for (const gap of gaps) {
      if (gap.type === "unobserved_period" && gap.period && !periodItems.has(gap.period)) {
        gapPeriods.add(gap.period);
      }
    }
  }

  // Build era lookup
  const eraByPeriod = new Map<LifePeriod, EraAffiliation>();
  for (const era of eraAffiliations ?? []) {
    eraByPeriod.set(era.period, era);
  }

  // Sort items within each period: chapters first, then activities, then turning points
  for (const items of periodItems.values()) {
    items.sort((a, b) => a.order - b.order);
  }

  // Build groups sorted by period order
  const allPeriods = new Set([...periodItems.keys(), ...gapPeriods]);
  const groups: PeriodGroup[] = Array.from(allPeriods)
    .sort((a, b) => (PERIOD_ORDER[a] ?? 99) - (PERIOD_ORDER[b] ?? 99))
    .map((period) => ({
      period,
      era: eraByPeriod.get(period),
      items: periodItems.get(period) ?? [],
      isGap: gapPeriods.has(period),
    }));

  // Insert gap indicators between data groups where periods are not consecutive
  const result: PeriodGroup[] = [];
  for (let i = 0; i < groups.length; i++) {
    if (i > 0 && !groups[i].isGap) {
      const prevOrder = PERIOD_ORDER[groups[i - 1].period] ?? 0;
      const currOrder = PERIOD_ORDER[groups[i].period] ?? 0;
      // Insert gap placeholders for skipped periods
      for (let o = prevOrder + 1; o < currOrder; o++) {
        const missingPeriod = Object.entries(PERIOD_ORDER).find(([, v]) => v === o)?.[0] as LifePeriod | undefined;
        if (missingPeriod && !allPeriods.has(missingPeriod)) {
          result.push({
            period: missingPeriod,
            era: eraByPeriod.get(missingPeriod),
            items: [],
            isGap: true,
          });
        }
      }
    }
    result.push(groups[i]);
  }

  return result;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Find previous chapter for bridge
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function findPrevChapter(
  groups: PeriodGroup[],
  currentGroupIdx: number,
  currentItemIdx: number,
): MemoryChapter | null {
  // Look backwards from current position for the closest chapter
  const group = groups[currentGroupIdx];

  // Check within same group first
  for (let i = currentItemIdx - 1; i >= 0; i--) {
    if (group.items[i].type === "chapter") {
      return group.items[i].data as MemoryChapter;
    }
  }

  // Check previous groups
  for (let g = currentGroupIdx - 1; g >= 0; g--) {
    for (let i = groups[g].items.length - 1; i >= 0; i--) {
      if (groups[g].items[i].type === "chapter") {
        return groups[g].items[i].data as MemoryChapter;
      }
    }
  }

  return null;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Empty State
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function EmptyState({ onStart }: { onStart: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center gap-6 py-16"
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 18 }}
          className="text-5xl"
        >
          🔍
        </motion.div>
        <h2 className="text-xl font-bold text-gray-800">Origin</h2>
        <p className="text-xs text-gray-400">今に至るまでの航路</p>
        <p className="mt-2 max-w-xs text-sm leading-relaxed text-gray-500">
          過去の自分を少しずつ思い出していく体験です。
          正確でなくて大丈夫。ざっくりした記憶から始められます。
        </p>
      </div>
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={onStart}
        className="rounded-2xl bg-amber-400/90 px-8 py-3.5 text-sm font-semibold text-white shadow-md hover:bg-amber-500/90"
      >
        最初の記憶を探索する
      </motion.button>
    </motion.div>
  );
}
