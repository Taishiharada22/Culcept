"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence, Reorder } from "framer-motion";
import type {
  DailyOrbitStore,
  DailyOrbitEntry,
  OrbitTask,
  CompletionTexture,
  TaskNature,
  SelfForecast,
  DriftingTask,
} from "@/lib/origin/dailyOrbit/types";
import { TEXTURE_META } from "@/lib/origin/dailyOrbit/types";
import {
  loadOrbitStoreWithSync,
  saveOrbitStore,
  todayKey,
  getOrCreateEntry,
  upsertEntry,
  newTaskId,
  getCarryOverCandidates,
  getDriftingTasks,
  updateStreak,
  getSubtasks,
  getParentProgress,
} from "@/lib/origin/dailyOrbit/store";
import { generateSelfForecast } from "@/lib/origin/dailyOrbit/insightEngine";
import { parseTaskInput, formatDueInfo } from "@/lib/origin/dailyOrbit/naturalLanguageParser";
import { generateMiniInsight, dismissMiniInsight, type MiniInsight } from "@/lib/origin/dailyOrbit/miniInsightEngine";
import { generateBehavioralLaws, getNextLawUnlockInfo, type GeneratedLaw } from "@/lib/origin/dailyOrbit/behavioralLawEngine";
import { generateMorningPrediction, type MorningPrediction } from "@/lib/origin/dailyOrbit/morningPrediction";
import { recordMorningWeather, generateWeatherPrediction, type WeatherPrediction } from "@/lib/origin/dailyOrbit/weatherLoop";
import { generateSeedInsight, markSeedInsightShown, type SeedInsight } from "@/lib/origin/dailyOrbit/seedInsight";
import { checkTaskCelebration, markCelebrationShown, type Celebration } from "@/lib/origin/dailyOrbit/celebrations";
import TaskItem from "./TaskItem";
import GrowthPath from "./GrowthPath";
import CalendarView from "./CalendarView";
import HabitTracker from "./HabitTracker";
import type { JournalEntry } from "./JournalPastList";
import { loadTemplates, type RoutineTemplate } from "@/lib/origin/dailyOrbit/routineTemplates";
import { useInnerWeather } from "@/hooks/useInnerWeather";

type Priority = "high" | "mid" | "low";

type EnrichedTask = OrbitTask & { priority?: Priority; sortOrder?: number };

type Props = {
  onDateJump?: (date: string, target: "todo" | "journal") => void;
  jumpDate?: string | null;
  onJumpHandled?: () => void;
};

export default function TodoSection({ onDateJump, jumpDate, onJumpHandled }: Props = {}) {
  const [store, setStore] = useState<DailyOrbitStore | null>(null);
  const [entry, setEntry] = useState<DailyOrbitEntry | null>(null);
  const [newTaskText, setNewTaskText] = useState("");
  const innerWeather = useInnerWeather();
  const [carryOverCandidates, setCarryOverCandidates] = useState<OrbitTask[]>([]);
  const [driftingTasks, setDriftingTasks] = useState<OrbitTask[]>([]);
  const [carryDismissed, setCarryDismissed] = useState(false);
  const [showForecast, setShowForecast] = useState(false);
  const [forecastChoice, setForecastChoice] = useState<string | null>(null);
  const [justCompletedId, setJustCompletedId] = useState<string | null>(null);
  const [parsedPreview, setParsedPreview] = useState<string | null>(null);
  const [miniInsight, setMiniInsight] = useState<MiniInsight | null>(null);
  const [newLaws, setNewLaws] = useState<GeneratedLaw[]>([]);
  const [lawUnlockInfo, setLawUnlockInfo] = useState<{ daysUntil: number; tierName: string } | null>(null);
  const [morningPrediction, setMorningPrediction] = useState<MorningPrediction | null>(null);
  const [weatherPrediction, setWeatherPrediction] = useState<WeatherPrediction | null>(null);
  const [seedInsight, setSeedInsight] = useState<SeedInsight | null>(null);
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [activeFilter, setActiveFilter] = useState<"all" | "today" | "tagged" | "habits">("all");
  const [sortBy, setSortBy] = useState<"default" | "priority" | "date">("default");
  const [showFilterBar, setShowFilterBar] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [templates, setTemplates] = useState<RoutineTemplate[]>([]);
  const [undoAction, setUndoAction] = useState<{
    type: "delete";
    task: OrbitTask;
    priority?: Priority;
  } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const today = todayKey();
  const isEvening = new Date().getHours() >= 18;

  // Day count for early experience
  const daysUsed = useMemo(() => {
    if (!store?.firstUsedAt) return 1;
    return Math.floor((Date.now() - new Date(store.firstUsedAt).getTime()) / (1000 * 60 * 60 * 24)) + 1;
  }, [store]);

  // Task priorities stored in localStorage
  const [priorities, setPriorities] = useState<Record<string, Priority>>(() => {
    if (typeof window === "undefined") return {};
    try {
      return JSON.parse(localStorage.getItem("origin_task_priorities_v1") ?? "{}");
    } catch { return {}; }
  });

  // Load store + journal in parallel
  useEffect(() => {
    (async () => {
      // Kick off both fetches in parallel
      const [loaded, journalRes] = await Promise.all([
        loadOrbitStoreWithSync(),
        fetch("/api/origin/journal?days=90").then(r => r.json()).catch(() => null),
      ]);
      if (!loaded) return;
      let updated = updateStreak(loaded, today);

      // Auto-release tasks carried for 7+ days (silently remove from past entries)
      let autoReleased = false;
      for (const [, ent] of Object.entries(updated.entries)) {
        const stale = ent.tasks.filter((t) => !t.completed && (t.carryCount ?? 0) >= 7);
        if (stale.length > 0) {
          updated = upsertEntry(updated, {
            ...ent,
            tasks: ent.tasks.filter((t) => t.completed || (t.carryCount ?? 0) < 7),
          });
          autoReleased = true;
        }
      }
      if (autoReleased) saveOrbitStore(updated);

      setStore(updated);
      const todayEntry = getOrCreateEntry(updated, today);
      setEntry(todayEntry);
      setCarryOverCandidates(getCarryOverCandidates(updated, today));
      setDriftingTasks(getDriftingTasks(updated, today));

      // Generate morning prediction (5:00-12:00 only)
      try {
        const prediction = generateMorningPrediction(updated, today);
        if (prediction) setMorningPrediction(prediction);
      } catch { /* silent */ }

      // Generate mini insight (3+ days)
      try {
        const insight = generateMiniInsight(updated);
        if (insight) setMiniInsight(insight);
      } catch { /* silent */ }

      // Seed insight (Day 1-2 only)
      try {
        const seed = generateSeedInsight(updated, today);
        if (seed) setSeedInsight(seed);
      } catch { /* silent */ }

      // Check streak celebration on load
      try {
        const cel = checkTaskCelebration(updated);
        if (cel) {
          setCelebration(cel);
          markCelebrationShown(cel.type);
          setTimeout(() => setCelebration(null), 5000);
        }
      } catch { /* silent */ }

      // Set journal entries from parallel fetch
      if (journalRes?.ok && journalRes.entries) {
        setJournalEntries(journalRes.entries);
      }

      // Generate behavioral laws
      try {
        const laws = generateBehavioralLaws(updated);
        if (laws.length > 0) setNewLaws(laws);
        const unlock = getNextLawUnlockInfo(
          updated.firstUsedAt
            ? Math.floor((Date.now() - new Date(updated.firstUsedAt).getTime()) / (1000 * 60 * 60 * 24)) + 1
            : 0,
        );
        if (unlock) setLawUnlockInfo(unlock);
      } catch { /* silent */ }
    })();
  }, [today]);

  // Handle jumpDate from CalendarView (open calendar and select date)
  useEffect(() => {
    if (!jumpDate) return;
    setShowCalendar(true);
    onJumpHandled?.();
  }, [jumpDate, onJumpHandled]);

  // Record weather for weather loop when innerWeather arrives
  useEffect(() => {
    if (!innerWeather || !store) return;
    recordMorningWeather(today, innerWeather.weatherType, innerWeather.energyLevel ?? 0);
    const wp = generateWeatherPrediction(store, innerWeather.weatherType, innerWeather.energyLevel ?? 0);
    if (wp) setWeatherPrediction(wp);
  }, [innerWeather, store, today]);

  // Persist
  const persist = useCallback((s: DailyOrbitStore) => {
    setStore(s);
    saveOrbitStore(s);
  }, []);

  const persistPriorities = useCallback((p: Record<string, Priority>) => {
    setPriorities(p);
    try { localStorage.setItem("origin_task_priorities_v1", JSON.stringify(p)); } catch {}
  }, []);

  // Load templates
  useEffect(() => {
    setTemplates(loadTemplates());
  }, []);

  // Apply template (add all tasks from template)
  const applyTemplate = useCallback((tpl: RoutineTemplate) => {
    if (!store || !entry) return;
    const now = new Date().toISOString();
    const newTasks = tpl.tasks.map((t) => ({
      id: newTaskId(),
      text: t.text,
      completed: false,
      addedAt: now,
      carryCount: 0,
    }));
    const updated = { ...entry, tasks: [...entry.tasks, ...newTasks], updatedAt: now };
    setEntry(updated);
    persist(upsertEntry(store, updated));
    setShowTemplates(false);
  }, [store, entry, persist]);

  // Update parser preview on input change
  useEffect(() => {
    if (!newTaskText.trim()) { setParsedPreview(null); return; }
    const parsed = parseTaskInput(newTaskText);
    setParsedPreview(formatDueInfo(parsed));
  }, [newTaskText]);

  // Add task
  const addTask = useCallback(() => {
    if (!newTaskText.trim() || !store || !entry) return;
    const parsed = parseTaskInput(newTaskText);
    const task: OrbitTask = {
      id: newTaskId(),
      text: parsed.text,
      completed: false,
      addedAt: new Date().toISOString(),
      carryCount: 0,
      recurrence: parsed.recurrence,
      dueDate: parsed.dueDate,
      dueTime: parsed.dueTime,
    };
    const updated = { ...entry, tasks: [...entry.tasks, task], updatedAt: new Date().toISOString() };
    setEntry(updated);
    const newStore = upsertEntry(store, updated);
    persist(newStore);
    setNewTaskText("");
    setParsedPreview(null);
    inputRef.current?.focus();
  }, [newTaskText, store, entry, persist]);

  // Toggle task
  const toggleTask = useCallback((id: string) => {
    if (!store || !entry) return;
    const wasCompleted = entry.tasks.find((t) => t.id === id)?.completed;
    const isCompleting = !wasCompleted;
    let tasks = entry.tasks.map((t) =>
      t.id === id ? { ...t, completed: !t.completed, addedAt: !t.completed ? new Date().toISOString() : t.addedAt } : t,
    );
    // Parent completing → auto-complete all subtasks
    if (isCompleting) {
      tasks = tasks.map((t) =>
        t.parentId === id && !t.completed ? { ...t, completed: true, addedAt: new Date().toISOString() } : t,
      );
    }
    const updated = { ...entry, tasks, updatedAt: new Date().toISOString() };
    setEntry(updated);
    persist(upsertEntry(store, updated));
    // Show texture picker for just-completed task
    if (!wasCompleted) {
      setJustCompletedId(id);
    } else {
      setJustCompletedId(null);
    }
    // Check for celebrations on task completion
    if (!wasCompleted) {
      const newStore = upsertEntry(store, updated);
      try {
        const cel = checkTaskCelebration(newStore);
        if (cel) {
          setCelebration(cel);
          markCelebrationShown(cel.type);
          setTimeout(() => setCelebration(null), 5000);
        }
      } catch { /* silent */ }
      // Refresh seed insight on task toggle (Day 1-2)
      if (daysUsed <= 2) {
        try {
          const seed = generateSeedInsight(newStore, today);
          if (seed) setSeedInsight(seed);
        } catch { /* silent */ }
      }
    }
  }, [store, entry, persist, daysUsed, today]);

  // Delete task
  const deleteTask = useCallback((id: string) => {
    if (!store || !entry) return;
    const deletedTask = entry.tasks.find((t) => t.id === id);
    const tasks = entry.tasks.filter((t) => t.id !== id);
    const updated = { ...entry, tasks, updatedAt: new Date().toISOString() };
    setEntry(updated);
    persist(upsertEntry(store, updated));
    // Clean up priority
    const p = { ...priorities };
    const deletedPriority = p[id];
    delete p[id];
    persistPriorities(p);
    // Setup undo
    if (deletedTask) {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      setUndoAction({ type: "delete", task: deletedTask, priority: deletedPriority });
      undoTimerRef.current = setTimeout(() => setUndoAction(null), 5000);
    }
  }, [store, entry, persist, priorities, persistPriorities]);

  const handleUndo = useCallback(() => {
    if (!undoAction || !store || !entry) return;
    if (undoAction.type === "delete") {
      const tasks = [...entry.tasks, undoAction.task];
      const updated = { ...entry, tasks, updatedAt: new Date().toISOString() };
      setEntry(updated);
      persist(upsertEntry(store, updated));
      if (undoAction.priority) {
        persistPriorities({ ...priorities, [undoAction.task.id]: undoAction.priority });
      }
    }
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoAction(null);
  }, [undoAction, store, entry, persist, priorities, persistPriorities]);

  // Set texture
  const setTexture = useCallback((id: string, texture: CompletionTexture) => {
    if (!store || !entry) return;
    const tasks = entry.tasks.map((t) => (t.id === id ? { ...t, texture } : t));
    const updated = { ...entry, tasks, updatedAt: new Date().toISOString() };
    setEntry(updated);
    const newStore = upsertEntry(store, updated);
    persist(newStore);
    setJustCompletedId(null);
    // Refresh seed insight on texture selection
    if (daysUsed <= 2) {
      try {
        const seed = generateSeedInsight(newStore, today);
        if (seed) setSeedInsight(seed);
      } catch { /* silent */ }
    }
  }, [store, entry, persist, daysUsed, today]);

  // Add subtask
  const addSubtask = useCallback((parentId: string, text: string) => {
    if (!store || !entry || !text.trim()) return;
    const sub: OrbitTask = {
      id: newTaskId(),
      text: text.trim(),
      completed: false,
      addedAt: new Date().toISOString(),
      carryCount: 0,
      parentId,
    };
    const updated = { ...entry, tasks: [...entry.tasks, sub], updatedAt: new Date().toISOString() };
    setEntry(updated);
    persist(upsertEntry(store, updated));
  }, [store, entry, persist]);

  // Set priority
  const setPriority = useCallback((id: string, priority: Priority) => {
    persistPriorities({ ...priorities, [id]: priority });
  }, [priorities, persistPriorities]);

  // Set tags
  const setTaskTags = useCallback((id: string, tags: string[]) => {
    if (!store || !entry) return;
    const tasks = entry.tasks.map((t) => (t.id === id ? { ...t, tags } : t));
    const updated = { ...entry, tasks, updatedAt: new Date().toISOString() };
    setEntry(updated);
    persist(upsertEntry(store, updated));
  }, [store, entry, persist]);

  // Carry over
  const handleCarryOver = useCallback((selectedIds: string[]) => {
    if (!store || !entry) return;
    const carried = carryOverCandidates
      .filter((t) => selectedIds.includes(t.id))
      .map((t) => ({ ...t, id: newTaskId(), carryCount: (t.carryCount ?? 0) + 1, carriedFrom: t.id }));
    const updated = { ...entry, tasks: [...carried, ...entry.tasks], updatedAt: new Date().toISOString() };
    setEntry(updated);
    persist(upsertEntry(store, updated));
    setCarryDismissed(true);
  }, [store, entry, carryOverCandidates, persist]);

  // Drift action
  const handleDriftAction = useCallback((taskId: string, action: "anchor" | "release" | "transform", text?: string) => {
    if (!store || !entry) return;
    let tasks = entry.tasks;
    if (action === "release") {
      tasks = tasks.filter((t) => t.id !== taskId);
    } else if (action === "transform" && text) {
      tasks = tasks.map((t) => (t.id === taskId ? { ...t, text, carryCount: 0 } : t));
    }
    // anchor = keep as is
    const updated = { ...entry, tasks, updatedAt: new Date().toISOString() };
    setEntry(updated);
    persist(upsertEntry(store, updated));
  }, [store, entry, persist]);

  // Postpone task (left-swipe → move to tomorrow)
  const postponeTask = useCallback((id: string) => {
    if (!store || !entry) return;
    const tasks = entry.tasks.map((t) =>
      t.id === id ? { ...t, carryCount: (t.carryCount ?? 0) + 1 } : t,
    );
    const updated = { ...entry, tasks, updatedAt: new Date().toISOString() };
    setEntry(updated);
    persist(upsertEntry(store, updated));
  }, [store, entry, persist]);

  // Reorder
  const handleReorder = useCallback((newOrder: OrbitTask[]) => {
    if (!entry) return;
    // Preserve completed tasks at the bottom
    const completed = entry.tasks.filter((t) => t.completed);
    const incompleteIds = new Set(entry.tasks.filter((t) => !t.completed).map((t) => t.id));
    const reordered = [...newOrder.filter((t) => incompleteIds.has(t.id)), ...completed];
    setEntry({ ...entry, tasks: reordered });
  }, [entry]);

  // Self forecast
  const handleForecast = useCallback((choice: string) => {
    if (!store || !entry) return;
    const totalTasks = entry.tasks.filter((t) => !t.completed).length + entry.tasks.filter((t) => t.completed).length;
    const predicted = choice === "できそう" ? totalTasks : choice === "半分くらい" ? Math.ceil(totalTasks / 2) : Math.floor(totalTasks / 3);
    const forecast: SelfForecast = {
      predictedCompletion: predicted,
      totalTasks,
      hardestTask: null,
      note: choice,
    };
    const updated = { ...entry, selfForecast: forecast, updatedAt: new Date().toISOString() };
    setEntry(updated);
    persist(upsertEntry(store, updated));
    setForecastChoice(choice);
    setShowForecast(false);
  }, [store, entry, persist]);

  // Computed — top-level only (no parentId)
  const incompleteTasks = useMemo(() => entry?.tasks.filter((t) => !t.completed && !t.parentId) ?? [], [entry]);
  const completedTasks = useMemo(() => entry?.tasks.filter((t) => t.completed && !t.parentId) ?? [], [entry]);
  // Apply filter
  const filteredIncomplete = useMemo(() => {
    let tasks = incompleteTasks;
    if (activeFilter === "tagged") {
      tasks = tasks.filter((t) => t.tags && t.tags.length > 0);
    } else if (activeFilter === "habits") {
      tasks = tasks.filter((t) => t.recurrence);
    }
    // Apply sort
    if (sortBy === "priority") {
      const order: Record<string, number> = { high: 0, mid: 1, low: 2 };
      tasks = [...tasks].sort((a, b) => (order[priorities[a.id] ?? "low"] ?? 2) - (order[priorities[b.id] ?? "low"] ?? 2));
    } else if (sortBy === "date") {
      tasks = [...tasks].sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
    }
    return tasks;
  }, [incompleteTasks, activeFilter, sortBy, priorities]);

  const carriedTasks = useMemo(
    () => filteredIncomplete.filter((t) => (t.carryCount ?? 0) > 0),
    [filteredIncomplete],
  );
  const freshTasks = useMemo(
    () => filteredIncomplete.filter((t) => (t.carryCount ?? 0) === 0),
    [filteredIncomplete],
  );

  // All unique tags across all tasks
  const allTags = useMemo(() => {
    if (!entry) return [];
    const tags = new Set<string>();
    entry.tasks.forEach((t) => t.tags?.forEach((tag) => tags.add(tag)));
    return Array.from(tags);
  }, [entry]);
  const completionRate = useMemo(() => {
    if (!entry) return null;
    const rootTasks = entry.tasks.filter((t) => !t.parentId);
    if (rootTasks.length === 0) return null;
    return Math.round((completedTasks.length / rootTasks.length) * 100);
  }, [entry, completedTasks]);

  // Monthly stats
  const monthlyStats = useMemo(() => {
    if (!store) return null;
    const entries = Object.values(store.entries).filter((e) => {
      const d = new Date(e.date);
      const now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    if (entries.length === 0) return null;
    let total = 0, completed = 0, carried = 0;
    for (const e of entries) {
      total += e.tasks.length;
      completed += e.tasks.filter((t) => t.completed).length;
      carried += e.tasks.filter((t) => (t.carryCount ?? 0) > 0).length;
    }
    return {
      completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
      carryRate: total > 0 ? Math.round((carried / total) * 100) : 0,
      totalDays: entries.length,
    };
  }, [store]);

  if (!store || !entry) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-4">
      {/* Toolbar: Calendar + Filter toggle */}
      <div className="mb-2 flex items-center justify-between">
        <button
          onClick={() => setShowFilterBar(!showFilterBar)}
          className={`rounded-lg px-2.5 py-1 text-xs transition-all ${
            showFilterBar || activeFilter !== "all" || sortBy !== "default"
              ? "bg-indigo-100 text-indigo-600"
              : "bg-white/40 text-gray-400 hover:bg-white/60"
          }`}
        >
          🔍 フィルタ
        </button>
        <div className="flex gap-1.5">
          <button
            onClick={() => setShowTemplates(!showTemplates)}
            className={`rounded-lg px-2.5 py-1 text-xs transition-all ${
              showTemplates ? "bg-emerald-100 text-emerald-600" : "bg-white/40 text-gray-400 hover:bg-white/60"
            }`}
          >
            📋 テンプレ
          </button>
          <button
            onClick={() => setShowCalendar(!showCalendar)}
            className={`rounded-lg px-2.5 py-1 text-xs transition-all ${
              showCalendar ? "bg-violet-100 text-violet-600" : "bg-white/40 text-gray-400 hover:bg-white/60"
            }`}
          >
            📅 カレンダー
          </button>
        </div>
      </div>

      {/* Filter/Sort bar */}
      <AnimatePresence>
        {showFilterBar && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-3 overflow-hidden"
          >
            <div className="rounded-2xl bg-white/50 p-3 space-y-2">
              {/* Filter chips */}
              <div className="flex flex-wrap gap-1.5">
                {([
                  ["all", "すべて"],
                  ["tagged", "タグ付き"],
                  ["habits", "習慣"],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setActiveFilter(key)}
                    className={`rounded-full px-3 py-1 text-[11px] transition-all ${
                      activeFilter === key
                        ? "bg-indigo-100 text-indigo-600 shadow-sm"
                        : "bg-white/60 text-gray-400 hover:bg-white/80"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {/* Sort options */}
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-gray-400">並替:</span>
                {([
                  ["default", "追加順"],
                  ["priority", "優先度"],
                  ["date", "期日"],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setSortBy(key)}
                    className={`rounded-full px-2.5 py-0.5 text-[10px] transition-all ${
                      sortBy === key
                        ? "bg-sky-100 text-sky-600"
                        : "bg-white/60 text-gray-400 hover:bg-white/80"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Template picker */}
      <AnimatePresence>
        {showTemplates && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-3 overflow-hidden"
          >
            <div className="rounded-2xl bg-white/50 p-3 space-y-2">
              <p className="text-[10px] text-gray-400">ルーティンセットを選択</p>
              {templates.map((tpl) => (
                <button
                  key={tpl.id}
                  onClick={() => applyTemplate(tpl)}
                  className="flex w-full items-start gap-2 rounded-xl bg-white/60 px-3 py-2 text-left transition-colors hover:bg-white/80"
                >
                  <span className="mt-0.5 text-base">📋</span>
                  <div>
                    <p className="text-xs font-medium text-gray-600">{tpl.name}</p>
                    <p className="text-[10px] text-gray-400">
                      {tpl.tasks.map((t) => t.text).join(" · ")}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Calendar view */}
      <AnimatePresence>
        {showCalendar && store && (
          <CalendarView
            store={store}
            journalEntries={journalEntries}
            onClose={() => setShowCalendar(false)}
            onDateJump={onDateJump}
          />
        )}
      </AnimatePresence>

      {/* Inner Weather reference */}
      {innerWeather && (
        <div className="mb-3 flex items-center gap-2 rounded-2xl bg-white/40 px-3 py-2">
          <span className="text-base">{innerWeather.emoji}</span>
          <span className="text-xs text-gray-500">{innerWeather.label}</span>
          {innerWeather.energyLevel != null && (
            <span className="text-[10px] text-gray-400">
              ・エネルギー {Math.round((innerWeather.energyLevel + 1) * 50)}%
            </span>
          )}
        </div>
      )}

      {/* Morning Prediction */}
      {morningPrediction && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-3 rounded-2xl bg-gradient-to-r from-sky-50/60 to-blue-50/40 px-3 py-2.5"
        >
          <p className="mb-1 text-[10px] font-medium text-sky-500">
            🌅 今日の傾向{morningPrediction.depth === "light" ? "" : " · あなた用"}
          </p>
          {morningPrediction.lines.map((line, i) => (
            <p key={i} className="text-xs leading-relaxed text-gray-600">{line}</p>
          ))}
          {/* Weather prediction line (appended to morning prediction) */}
          {weatherPrediction && (
            <p className="mt-1 text-xs leading-relaxed text-gray-500">
              {weatherPrediction.text}
            </p>
          )}
        </motion.div>
      )}

      {/* Standalone weather prediction (when morning prediction is unavailable) */}
      {!morningPrediction && weatherPrediction && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-3 rounded-2xl bg-gradient-to-r from-sky-50/60 to-blue-50/40 px-3 py-2.5"
        >
          <p className="mb-1 text-[10px] font-medium text-sky-500">🌤 天気の傾向</p>
          <p className="text-xs leading-relaxed text-gray-600">{weatherPrediction.text}</p>
        </motion.div>
      )}

      {/* Morning prediction placeholder (Day 1-2, morning only) */}
      {!morningPrediction && !weatherPrediction && !isEvening && daysUsed <= 2 && (
        <div className="mb-3 rounded-2xl bg-sky-50/30 px-3 py-2.5">
          <p className="text-[10px] text-sky-400/70">
            🌅 明日から、あなた専用の朝のメッセージが届きます
          </p>
        </div>
      )}

      {/* Self Forecast (morning, optional) */}
      {!isEvening && !entry.selfForecast && !forecastChoice && (
        <button
          onClick={() => setShowForecast(!showForecast)}
          className="mb-3 w-full rounded-2xl bg-indigo-50/60 px-3 py-2 text-left text-xs text-indigo-500 transition-colors hover:bg-indigo-50"
        >
          ✨ 今日の見通しは？
        </button>
      )}
      <AnimatePresence>
        {showForecast && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-3 overflow-hidden"
          >
            <div className="flex gap-2 rounded-2xl bg-white/60 p-3">
              {["できそう", "半分くらい", "厳しい"].map((c) => (
                <button
                  key={c}
                  onClick={() => handleForecast(c)}
                  className="flex-1 rounded-xl bg-white/80 py-2 text-xs text-gray-600 transition-all hover:bg-white hover:shadow-sm"
                >
                  {c}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {forecastChoice && (
        <div className="mb-3 rounded-2xl bg-indigo-50/40 px-3 py-2 text-xs text-indigo-400">
          今日の見通し: {forecastChoice}
        </div>
      )}

      {/* Today's progress bar */}
      {entry && entry.tasks.filter((t) => !t.parentId).length > 0 && (
        <div className="mb-2 flex items-center gap-2">
          <div className="h-1.5 flex-1 rounded-full bg-gray-200/60">
            <motion.div
              className="h-1.5 rounded-full bg-emerald-400"
              initial={{ width: 0 }}
              animate={{ width: `${completionRate ?? 0}%` }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
          </div>
          <span className="text-[10px] text-gray-400">
            {completedTasks.length}/{entry.tasks.filter((t) => !t.parentId).length}
          </span>
        </div>
      )}

      {/* Task input (sticky) */}
      <div className="sticky top-0 z-10 -mx-4 bg-gradient-to-b from-[#f5f0e8] via-[#f5f0e8] to-transparent px-4 pb-3 pt-0.5">
        <div className="flex items-center gap-2 rounded-2xl bg-white/80 px-3 py-2.5 shadow-sm backdrop-blur-sm">
          <span className="text-gray-300">+</span>
          <input
            ref={inputRef}
            value={newTaskText}
            onChange={(e) => setNewTaskText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addTask(); }}
            placeholder="なにをする？（明日 14時 歯医者）"
            className="flex-1 bg-transparent text-sm text-gray-700 outline-none placeholder:text-gray-400"
            autoFocus
          />
          {newTaskText.trim() && (
            <button onClick={addTask} className="text-xs text-gray-400 hover:text-gray-600">
              追加
            </button>
          )}
        </div>
        {parsedPreview && (
          <p className="mt-1 px-1 text-[10px] text-gray-400">{parsedPreview}</p>
        )}
      </div>

      {/* Carry-over prompt */}
      <AnimatePresence>
        {carryOverCandidates.length > 0 && !carryDismissed && (
          <CarryOverPrompt
            candidates={carryOverCandidates}
            onCarry={handleCarryOver}
            onDismiss={() => setCarryDismissed(true)}
          />
        )}
      </AnimatePresence>

      {/* Fresh tasks */}
      {freshTasks.length > 0 && (
        <Reorder.Group axis="y" values={freshTasks} onReorder={(items) => {
          if (!entry) return;
          const completedList = entry.tasks.filter((t) => t.completed && !t.parentId);
          const subs = entry.tasks.filter((t) => t.parentId);
          setEntry({ ...entry, tasks: [...carriedTasks, ...items, ...subs, ...completedList] });
        }}>
          {freshTasks.map((task) => (
            <TaskItem
              key={task.id}
              task={{ ...task, priority: priorities[task.id] }}
              onToggle={toggleTask}
              onDelete={deleteTask}
              onSetTexture={setTexture}
              onSetPriority={setPriority}
              onPostpone={postponeTask}
              subtasks={entry ? getSubtasks(entry, task.id) : []}
              parentProgress={entry ? getParentProgress(entry, task.id) : undefined}
              onAddSubtask={addSubtask}
              onSetTags={setTaskTags}
            />
          ))}
        </Reorder.Group>
      )}

      {/* Carried tasks (1-2 days) */}
      {carriedTasks.filter((t) => (t.carryCount ?? 0) < 3).length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-[11px] font-medium text-gray-400">┄ 昨日から ┄</p>
          <Reorder.Group axis="y" values={carriedTasks.filter((t) => (t.carryCount ?? 0) < 3)} onReorder={(items) => {
            if (!entry) return;
            const drifting = carriedTasks.filter((t) => (t.carryCount ?? 0) >= 3);
            const completedList = entry.tasks.filter((t) => t.completed);
            setEntry({ ...entry, tasks: [...drifting, ...items, ...freshTasks, ...completedList] });
          }}>
            {carriedTasks.filter((t) => (t.carryCount ?? 0) < 3).map((task) => (
              <TaskItem
                key={task.id}
                task={{ ...task, priority: priorities[task.id] }}
                onToggle={toggleTask}
                onDelete={deleteTask}
                onSetTexture={setTexture}
                onSetPriority={setPriority}
                onDriftAction={(action, text) => handleDriftAction(task.id, action, text)}
              />
            ))}
          </Reorder.Group>
        </div>
      )}

      {/* Drifting tasks (3+ days — need decision: anchor / release / transform) */}
      {carriedTasks.filter((t) => (t.carryCount ?? 0) >= 3).length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-[11px] font-medium text-amber-500">
            🌊 漂流中 — このまま放置すると自動で手放されます
          </p>
          {carriedTasks.filter((t) => (t.carryCount ?? 0) >= 3).map((task) => (
            <TaskItem
              key={task.id}
              task={{ ...task, priority: priorities[task.id] }}
              onToggle={toggleTask}
              onDelete={deleteTask}
              onSetTexture={setTexture}
              onSetPriority={setPriority}
              driftInfo={{ carryCount: task.carryCount ?? 0 }}
              onDriftAction={(action, text) => handleDriftAction(task.id, action, text)}
              draggable={false}
            />
          ))}
        </div>
      )}

      {/* Completed tasks */}
      {completedTasks.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-[11px] font-medium text-gray-400">── 完了 ──</p>
          <AnimatePresence>
            {completedTasks.map((task) => (
              <TaskItem
                key={task.id}
                task={{ ...task, priority: priorities[task.id] }}
                onToggle={toggleTask}
                onDelete={deleteTask}
                onSetTexture={setTexture}
                onSetPriority={setPriority}
                draggable={false}
                showTextureOverride={justCompletedId === task.id && !task.texture}
                onTextureDismiss={() => setJustCompletedId(null)}
                subtasks={entry ? getSubtasks(entry, task.id) : []}
                parentProgress={entry ? getParentProgress(entry, task.id) : undefined}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* All complete celebration — texture summary + observation */}
      <AnimatePresence>
        {entry.tasks.length > 0 && incompleteTasks.length === 0 && (() => {
          const rootTasks = entry.tasks.filter((t) => !t.parentId);
          const textures = rootTasks.filter((t) => t.texture).map((t) => t.texture!);
          const textureCounts: Record<string, number> = {};
          for (const tx of textures) textureCounts[tx] = (textureCounts[tx] ?? 0) + 1;
          const topTexture = Object.entries(textureCounts).sort(([,a],[,b]) => b - a)[0];

          return (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="mt-6 rounded-2xl bg-gradient-to-br from-emerald-50/80 to-teal-50/60 p-4"
            >
              <div className="text-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.2 }}
                  className="mb-2 text-2xl"
                >
                  ✨
                </motion.div>
                <p className="text-sm font-medium text-emerald-700">
                  今日のタスク、すべて完了しました
                </p>
              </div>

              {/* Texture summary — Origin's unique observation */}
              {textures.length > 0 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.6 }}
                  className="mt-3 rounded-xl bg-white/50 px-3 py-2"
                >
                  <p className="text-[10px] text-gray-400">今日の完了テクスチャ</p>
                  <div className="mt-1 flex gap-2">
                    {Object.entries(textureCounts).map(([tx, count]) => {
                      const meta = (TEXTURE_META as Record<string, { emoji: string; label: string }>)[tx];
                      return meta ? (
                        <span key={tx} className="text-xs text-gray-500">
                          {meta.emoji} {meta.label} ×{count}
                        </span>
                      ) : null;
                    })}
                  </div>
                  {topTexture && (
                    <p className="mt-1.5 text-[10px] text-emerald-600/70">
                      → 「{(TEXTURE_META as Record<string, { emoji: string; label: string }>)[topTexture[0]]?.label}」が多い日。この感触の蓄積があなたの行動法則を育てます
                    </p>
                  )}
                </motion.div>
              )}

              {/* No textures yet — encourage */}
              {textures.length === 0 && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.6 }}
                  className="mt-2 text-center text-[10px] text-gray-400"
                >
                  💡 完了テクスチャを記録すると、達成の質が見えてきます
                </motion.p>
              )}
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* Empty state — Day 1 rich guidance */}
      {entry.tasks.length === 0 && (
        <div className="mt-8 space-y-3">
          <p className="text-center text-sm text-gray-400">今日やることを書いてみましょう</p>
          {daysUsed <= 2 && (
            <div className="space-y-2 rounded-2xl bg-white/30 px-4 py-3">
              <p className="text-[11px] leading-relaxed text-gray-400">
                💡 「明日 14時 歯医者」のように書くと、日時を自動で認識します
              </p>
              <p className="text-[11px] leading-relaxed text-gray-400">
                ✨ タスクを完了すると「感触」を記録できます — すっきり？ほっとした？淡々？
              </p>
              <div className="mt-2 rounded-xl bg-white/40 px-3 py-2 opacity-50">
                <p className="text-[10px] text-amber-500">🔍 これから見つかる法則の例:</p>
                <p className="text-[10px] text-gray-400">「あなたは月曜に完了率が高い傾向がある」</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ━━━ Hero Card — 日次の主役を1つだけ目立たせる ━━━ */}
      {(() => {
        // Priority order: celebration > newLaw > miniInsight > seedInsight > lawCountdown
        const newLaw = newLaws.find((l) => l.isNew);

        if (celebration) {
          return (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mt-4 rounded-2xl bg-gradient-to-r from-amber-50/80 to-yellow-50/60 p-4 text-center shadow-sm"
            >
              <p className="text-2xl">{celebration.emoji}</p>
              <p className="mt-1.5 text-xs font-medium text-amber-700">{celebration.text}</p>
            </motion.div>
          );
        }

        if (newLaw) {
          return (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 rounded-2xl border border-amber-200/40 bg-gradient-to-br from-amber-50/70 to-orange-50/50 p-4 shadow-sm"
            >
              <p className="text-[11px] font-semibold text-amber-600">🔍 あなたの法則が見つかりました</p>
              <p className="mt-2 text-sm leading-relaxed text-amber-900/80">{newLaw.law.text}</p>
              <div className="mt-2 flex items-center justify-between">
                <p className="text-[10px] text-amber-500">
                  確信度 {Math.round((newLaw.law.confidence ?? 0) * 100)}%
                </p>
                <p className="text-[10px] text-amber-400">プロフィールタブで詳しく →</p>
              </div>
            </motion.div>
          );
        }

        if (miniInsight) {
          return (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 rounded-2xl border border-indigo-200/30 bg-gradient-to-br from-indigo-50/50 to-violet-50/30 p-4 shadow-sm"
            >
              <div className="flex items-start justify-between">
                <p className="text-[11px] font-semibold text-indigo-500">💡 {miniInsight.dataPoints}日間の気づき</p>
                <button
                  onClick={() => { dismissMiniInsight(); setMiniInsight(null); }}
                  className="text-[10px] text-gray-400"
                >
                  閉じる
                </button>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-indigo-700/80">{miniInsight.text}</p>
            </motion.div>
          );
        }

        if (seedInsight) {
          return (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 rounded-2xl border border-amber-200/30 bg-gradient-to-br from-amber-50/50 to-yellow-50/30 p-4 shadow-sm"
            >
              <div className="flex items-start justify-between">
                <p className="text-[11px] font-semibold text-amber-600">{seedInsight.emoji} 最初の観測</p>
                <button
                  onClick={() => { markSeedInsightShown(seedInsight.category); setSeedInsight(null); }}
                  className="text-[10px] text-gray-400"
                >
                  閉じる
                </button>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-amber-800/70">{seedInsight.text}</p>
            </motion.div>
          );
        }

        if (lawUnlockInfo && newLaws.length === 0) {
          return (
            <div className="mt-4 rounded-2xl bg-white/30 px-3 py-2 text-center text-[10px] text-gray-400">
              🔒 {lawUnlockInfo.tierName}まであと{lawUnlockInfo.daysUntil}日分のデータ
            </div>
          );
        }

        return null;
      })()}

      {/* ━━━ Secondary cards (控えめ) ━━━ */}

      {/* Monthly stats */}
      {monthlyStats && monthlyStats.totalDays >= 3 && (
        <div className="mt-4 rounded-2xl bg-white/40 p-3">
          <p className="mb-2 text-[11px] font-medium text-gray-400">📊 今月の傾向</p>
          <div className="flex gap-4 text-xs text-gray-500">
            <span>完了率 {monthlyStats.completionRate}%</span>
            <span>持ち越し率 {monthlyStats.carryRate}%</span>
            <span>{monthlyStats.totalDays}日記録</span>
          </div>
        </div>
      )}

      {/* Habit Tracker */}
      {store && <HabitTracker store={store} />}

      {/* Growth Path (Day 1-30) */}
      <GrowthPath daysUsed={daysUsed} />

      {/* Undo snackbar */}
      <AnimatePresence>
        {undoAction && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-gray-800 px-4 py-2.5 shadow-lg"
          >
            <div className="flex items-center gap-3 text-sm text-white">
              <span>タスクを削除しました</span>
              <button
                onClick={handleUndo}
                className="font-medium text-sky-300 hover:text-sky-200"
              >
                元に戻す
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Carry-over prompt ── */
function CarryOverPrompt({
  candidates,
  onCarry,
  onDismiss,
}: {
  candidates: OrbitTask[];
  onCarry: (ids: string[]) => void;
  onDismiss: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(candidates.map((c) => c.id)));

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      className="mb-4 rounded-2xl bg-amber-50/60 p-3"
    >
      <p className="mb-2 text-xs font-medium text-amber-700">昨日の残り — 持ってくる？</p>
      <div className="space-y-1.5">
        {candidates.map((c) => (
          <label key={c.id} className="flex items-center gap-2 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={selected.has(c.id)}
              onChange={() => {
                const next = new Set(selected);
                if (next.has(c.id)) next.delete(c.id);
                else next.add(c.id);
                setSelected(next);
              }}
              className="rounded text-amber-500"
            />
            {c.text}
            {(c.carryCount ?? 0) > 0 && (
              <span className="text-[10px] text-amber-400">{c.carryCount}日目</span>
            )}
          </label>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <button
          onClick={() => onCarry(Array.from(selected))}
          className="rounded-xl bg-amber-400/90 px-3 py-1.5 text-xs font-medium text-white"
        >
          持ってくる
        </button>
        <button
          onClick={onDismiss}
          className="rounded-xl bg-white/60 px-3 py-1.5 text-xs text-gray-500"
        >
          スキップ
        </button>
      </div>
    </motion.div>
  );
}
