"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type {
  DailyOrbitEntry,
  DailyOrbitStore,
  OrbitTask,
  DayState,
  NightReflection,
  TaskNature,
  CompletionTexture,
  BodyEcho,
  BodyZone,
  ShadowIntention,
  TemporalResponse,
  TemporalDialogue,
  SelfForecast,
  DriftingTask,
  OrbitLaw,
  OrbitThread,
  DriftAction,
  SurpriseObservation,
  TurningPoint,
} from "@/lib/origin/dailyOrbit/types";
import {
  TASK_NATURE_META,
  TEXTURE_META,
  BODY_ZONE_OPTIONS,
  TEMPORAL_RESPONSE_META,
  DRIFT_ACTION_META,
  DISCOVERY_MILESTONES,
} from "@/lib/origin/dailyOrbit/types";
import {
  loadOrbitStore,
  loadOrbitStoreWithSync,
  saveOrbitStore,
  todayKey,
  yesterdayKey,
  getOrCreateEntry,
  getCarryOverCandidates,
  getDriftingTasks,
  getYesterdayReflection,
  newTaskId,
  upsertEntry,
  getRecentEntries,
  getDaysUsed,
  updateStreak,
  addTurningPoint,
  upsertThread,
  addSurpriseObservation,
} from "@/lib/origin/dailyOrbit/store";
import { selectNightQuestion } from "@/lib/origin/dailyOrbit/reflectionEngine";
import {
  selectAdaptiveLayers,
  type AdaptiveLayerResult,
  type OrbitLayerId,
  getLayerMeta,
} from "@/lib/origin/adaptiveLayerEngine";
import { fetchStargazerContext, type StargazerOriginContext } from "@/lib/origin/stargazerPipeline";
import { getTodayEntry } from "./EntryGate";
import {
  generateSelfForecast,
  discoverOrbitLaws,
  describeNotDoingValue,
} from "@/lib/origin/dailyOrbit/insightEngine";
import {
  updateSelfResolution,
  evaluatePredictionDuel,
  getOverallPredictionScore,
  detectThreads,
  generateSurpriseObservation,
  getAbsenceMessage,
  checkDiscoveryMilestones,
  detectTurningPoints,
  checkLawPromotions,
} from "@/lib/origin/dailyOrbit/retentionEngine";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Stargazer state fetch
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function fetchTodayState(date: string): Promise<DayState | null> {
  try {
    const res = await fetch(
      `/api/stargazer/daily-observation?date=${date}&checkOnly=1`,
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data.dayState) return data.dayState as DayState;
    if (data.alreadyCompleted && data.rawState)
      return data.rawState as DayState;
    return null;
  } catch {
    return null;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase management
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type Phase =
  | "temporal_dialogue" // 朝: 昨日の自分との対話
  | "body_echo" // 朝: 身体の声
  | "tasks" // 日中: メインタスク管理
  | "night"; // 夜: 振り返り（時間の体感 → 内在する意図 → 1問）

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Sub: Temporal Dialogue — 昨日の自分との対話
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function TemporalDialogueView({
  message,
  onRespond,
  onSkip,
}: {
  message: string;
  onRespond: (r: TemporalResponse) => void;
  onSkip: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="rounded-3xl border border-amber-100/60 bg-gradient-to-b from-amber-50/40 to-orange-50/20 backdrop-blur-sm p-6"
    >
      <div className="flex items-center gap-2 mb-4">
        <span className="text-base">💌</span>
        <span className="text-[10px] tracking-[0.15em] text-amber-500/70 uppercase font-medium">
          昨日のあなたからの手紙
        </span>
      </div>

      <div className="rounded-2xl bg-white/60 border border-amber-100/40 px-4 py-3 mb-4">
        <p className="text-sm text-gray-600 leading-relaxed italic">
          「{message}」
        </p>
      </div>

      <p className="text-xs text-gray-400 mb-4">
        今朝の気分で、これを読んでどう感じる？
      </p>

      <div className="flex gap-2">
        {(Object.entries(TEMPORAL_RESPONSE_META) as [TemporalResponse, { emoji: string; label: string }][]).map(
          ([key, meta]) => (
            <button
              key={key}
              onClick={() => onRespond(key)}
              className="flex-1 rounded-2xl bg-white/60 border border-amber-100/40 py-3 text-sm font-medium text-gray-600 hover:bg-white/80 hover:border-amber-200/60 transition-all"
            >
              <span className="block text-lg mb-0.5">{meta.emoji}</span>
              <span className="text-[11px]">{meta.label}</span>
            </button>
          ),
        )}
      </div>

      <button
        onClick={onSkip}
        className="mt-3 w-full text-[10px] text-gray-400 hover:text-gray-500 transition-colors"
      >
        スキップ
      </button>
    </motion.div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Sub: Body Echo — 身体の声
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function BodyEchoView({
  existing,
  onSubmit,
  onSkip,
}: {
  existing: BodyEcho | null;
  onSubmit: (echo: BodyEcho) => void;
  onSkip: () => void;
}) {
  const [body, setBody] = useState<Partial<BodyEcho>>(existing ?? {});

  const handleSelect = (zone: BodyZone, value: string) => {
    setBody((prev) => {
      const next = { ...prev, [zone]: prev[zone] === value ? undefined : value };
      return next;
    });
  };

  const handleSubmit = () => {
    onSubmit({ ...body, recordedAt: new Date().toISOString() } as BodyEcho);
  };

  const hasSelection = Object.entries(body).some(
    ([k, v]) => k !== "recordedAt" && v,
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="rounded-3xl border border-indigo-100/50 bg-gradient-to-b from-indigo-50/30 to-purple-50/20 backdrop-blur-sm p-6"
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base">🫀</span>
        <span className="text-[10px] tracking-[0.15em] text-indigo-400/70 uppercase font-medium">
          身体の声
        </span>
      </div>
      <p className="text-xs text-gray-400 mb-5">
        今の身体の感覚を教えて（30秒で終わります）
      </p>

      <div className="space-y-4">
        {(Object.entries(BODY_ZONE_OPTIONS) as [BodyZone, (typeof BODY_ZONE_OPTIONS)[BodyZone]][]).map(
          ([zone, config]) => (
            <div key={zone}>
              <p className="text-[11px] text-gray-500 font-medium mb-1.5">
                {config.label}
              </p>
              <div className="flex gap-2">
                {config.options.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => handleSelect(zone, opt.value)}
                    className={`flex-1 rounded-xl px-3 py-2.5 text-xs transition-all ${
                      body[zone] === opt.value
                        ? "bg-indigo-100/80 border border-indigo-200/60 text-indigo-700 font-medium"
                        : "bg-white/50 border border-gray-100/40 text-gray-500 hover:bg-white/70"
                    }`}
                  >
                    <span className="block text-base mb-0.5">{opt.emoji}</span>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          ),
        )}
      </div>

      <div className="flex gap-2 mt-5">
        <button
          onClick={handleSubmit}
          disabled={!hasSelection}
          className="flex-1 rounded-2xl bg-indigo-400/80 py-2.5 text-sm font-semibold text-white transition-all hover:bg-indigo-500 disabled:opacity-30"
        >
          記録する
        </button>
        <button
          onClick={onSkip}
          className="rounded-2xl bg-white/60 border border-gray-200/40 px-5 py-2.5 text-sm text-gray-400 transition-all hover:bg-white/80"
        >
          スキップ
        </button>
      </div>
    </motion.div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Sub: Task Input (with Nature)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function TaskInput({ onAdd }: { onAdd: (text: string, nature?: TaskNature) => void }) {
  const [text, setText] = useState("");
  const [showNature, setShowNature] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (nature?: TaskNature) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onAdd(trimmed, nature);
    setText("");
    setShowNature(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (text.trim()) setShowNature(true);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="今日やること..."
          className="flex-1 rounded-2xl border border-gray-200/60 bg-white/60 backdrop-blur-sm px-4 py-3 text-sm text-gray-800 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-amber-300/50 transition-all"
        />
        <button
          onClick={() => text.trim() && setShowNature(true)}
          disabled={!text.trim()}
          className="rounded-2xl bg-amber-400/90 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-amber-500 disabled:opacity-30"
        >
          追加
        </button>
      </div>

      {/* Nature Selection — ふわっと出る */}
      <AnimatePresence>
        {showNature && (
          <motion.div
            initial={{ opacity: 0, y: -8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -8, height: 0 }}
            className="overflow-hidden"
          >
            <p className="text-[10px] text-gray-400 mb-1.5 pl-1">
              なぜこれをやる？（タップで追加）
            </p>
            <div className="flex gap-1.5">
              {(Object.entries(TASK_NATURE_META) as [TaskNature, { emoji: string; label: string; color: string }][]).map(
                ([key, meta]) => (
                  <button
                    key={key}
                    onClick={() => handleSubmit(key)}
                    className="flex-1 rounded-xl bg-white/60 border border-gray-100/50 py-2.5 text-xs text-gray-600 hover:bg-white/80 transition-all"
                  >
                    <span className="block text-base mb-0.5">{meta.emoji}</span>
                    {meta.label}
                  </button>
                ),
              )}
              <button
                onClick={() => handleSubmit(undefined)}
                className="rounded-xl bg-white/40 border border-gray-100/30 px-3 py-2.5 text-[10px] text-gray-400 hover:bg-white/60 transition-all"
              >
                なし
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Sub: Task Item (with Texture popup)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function TaskItem({
  task,
  onToggle,
  onDelete,
  onTexture,
}: {
  task: OrbitTask;
  onToggle: () => void;
  onDelete: () => void;
  onTexture: (t: CompletionTexture) => void;
}) {
  const [showTexture, setShowTexture] = useState(false);

  const handleToggle = () => {
    if (!task.completed) {
      // 完了にする → テクスチャを聞く
      onToggle();
      if (!task.texture) setShowTexture(true);
    } else {
      onToggle();
      setShowTexture(false);
    }
  };

  const handleTexture = (t: CompletionTexture) => {
    onTexture(t);
    setShowTexture(false);
  };

  const natureMeta = task.nature ? TASK_NATURE_META[task.nature] : null;

  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -20 }}>
      <div
        className="group flex items-center gap-3 rounded-2xl border border-gray-100/60 bg-white/50 backdrop-blur-sm px-4 py-3 transition-all hover:bg-white/70"
      >
        <button
          onClick={handleToggle}
          className={`flex-shrink-0 w-5 h-5 rounded-full border-2 transition-all flex items-center justify-center ${
            task.completed
              ? "border-amber-400 bg-amber-400"
              : "border-gray-300 hover:border-amber-300"
          }`}
        >
          {task.completed && (
            <motion.svg initial={{ scale: 0 }} animate={{ scale: 1 }} width={12} height={12} viewBox="0 0 12 12" fill="none">
              <path d="M2.5 6L5 8.5L9.5 3.5" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </motion.svg>
          )}
        </button>

        <span
          className={`flex-1 text-sm transition-all ${
            task.completed ? "text-gray-400 line-through" : "text-gray-700"
          }`}
        >
          {task.text}
          {natureMeta && (
            <span className="ml-1.5 text-[10px]" style={{ color: natureMeta.color }}>
              {natureMeta.emoji}
            </span>
          )}
          {task.carriedFrom && (
            <span className="ml-1.5 text-[10px] text-amber-500/70 font-medium">
              持ち越し{task.carryCount > 1 ? ` ×${task.carryCount}` : ""}
            </span>
          )}
          {task.texture && (
            <span className="ml-1.5 text-[10px]">
              {TEXTURE_META[task.texture].emoji}
            </span>
          )}
        </span>

        <button
          onClick={onDelete}
          className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-gray-500 transition-all text-xs px-1"
        >
          ✕
        </button>
      </div>

      {/* Completion Texture popup */}
      <AnimatePresence>
        {showTexture && task.completed && !task.texture && (
          <motion.div
            initial={{ opacity: 0, y: -4, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -4, height: 0 }}
            className="overflow-hidden mt-1 ml-8"
          >
            <p className="text-[10px] text-gray-400 mb-1">
              どんな気持ちで終わった？
            </p>
            <div className="flex gap-1.5">
              {(Object.entries(TEXTURE_META) as [CompletionTexture, { emoji: string; label: string }][]).map(
                ([key, meta]) => (
                  <button
                    key={key}
                    onClick={() => handleTexture(key)}
                    className="rounded-xl bg-white/60 border border-gray-100/40 px-3 py-2 text-xs text-gray-500 hover:bg-white/80 transition-all"
                  >
                    {meta.emoji} {meta.label}
                  </button>
                ),
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Sub: Carry Over Prompt
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function CarryOverPrompt({
  candidates,
  onAccept,
  onSkip,
}: {
  candidates: OrbitTask[];
  onAccept: (ids: string[]) => void;
  onSkip: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(candidates.map((c) => c.id)),
  );

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="rounded-3xl border border-amber-200/60 bg-amber-50/50 backdrop-blur-sm p-5"
    >
      <p className="text-sm font-semibold text-gray-700 mb-1">
        昨日の未完了タスク
      </p>
      <p className="text-xs text-gray-400 mb-4">今日に引き継ぎますか？</p>

      <div className="space-y-2 mb-4">
        {candidates.map((task) => (
          <button
            key={task.id}
            onClick={() => toggle(task.id)}
            className={`w-full text-left flex items-center gap-3 rounded-2xl px-4 py-3 text-sm transition-all ${
              selected.has(task.id)
                ? "bg-white/80 border border-amber-200/60 text-gray-700"
                : "bg-white/30 border border-transparent text-gray-400"
            }`}
          >
            <span
              className={`w-4 h-4 rounded-full border-2 flex-shrink-0 transition-all ${
                selected.has(task.id)
                  ? "border-amber-400 bg-amber-400"
                  : "border-gray-300"
              }`}
            />
            {task.text}
            {task.carryCount >= 3 && (
              <span className="ml-auto text-[10px] text-orange-400">
                🌊 {task.carryCount}日漂流中
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => onAccept(Array.from(selected))}
          disabled={selected.size === 0}
          className="flex-1 rounded-2xl bg-amber-400/90 py-2.5 text-sm font-semibold text-white transition-all hover:bg-amber-500 disabled:opacity-30"
        >
          引き継ぐ ({selected.size})
        </button>
        <button
          onClick={onSkip}
          className="rounded-2xl bg-white/60 border border-gray-200/40 px-5 py-2.5 text-sm text-gray-500 transition-all hover:bg-white/80"
        >
          スキップ
        </button>
      </div>
    </motion.div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Sub: Drifting Task Prompt
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function DriftingTaskPrompt({
  task,
  onAction,
}: {
  task: OrbitTask;
  onAction: (action: DriftAction, transformedText?: string) => void;
}) {
  const [transformText, setTransformText] = useState("");
  const [showTransform, setShowTransform] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl border border-orange-200/60 bg-gradient-to-b from-orange-50/40 to-amber-50/20 backdrop-blur-sm p-5"
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-base">🌊</span>
        <span className="text-[10px] tracking-[0.15em] text-orange-400/70 uppercase font-medium">
          漂流タスク
        </span>
      </div>

      <p className="text-sm text-gray-700 mb-1 font-medium">
        「{task.text}」
      </p>
      <p className="text-xs text-gray-400 mb-4">
        {task.carryCount}日間漂流中。これは本当にやりたいこと？
      </p>

      <div className="flex gap-2">
        {(Object.entries(DRIFT_ACTION_META) as [DriftAction, { emoji: string; label: string }][]).map(
          ([key, meta]) => (
            <button
              key={key}
              onClick={() => {
                if (key === "transform") {
                  setShowTransform(true);
                } else {
                  onAction(key);
                }
              }}
              className="flex-1 rounded-2xl bg-white/60 border border-orange-100/40 py-3 text-xs font-medium text-gray-600 hover:bg-white/80 transition-all"
            >
              <span className="block text-lg mb-0.5">{meta.emoji}</span>
              {meta.label}
            </button>
          ),
        )}
      </div>

      <AnimatePresence>
        {showTransform && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden mt-3"
          >
            <input
              type="text"
              value={transformText}
              onChange={(e) => setTransformText(e.target.value)}
              placeholder="別の形で書き直す..."
              className="w-full rounded-2xl border border-gray-200/40 bg-white/60 px-4 py-2.5 text-sm text-gray-700 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-orange-200/50"
            />
            <button
              onClick={() => {
                if (transformText.trim()) onAction("transform", transformText.trim());
              }}
              disabled={!transformText.trim()}
              className="mt-2 w-full rounded-2xl bg-orange-400/80 py-2 text-sm font-semibold text-white transition-all hover:bg-orange-500 disabled:opacity-30"
            >
              変換する
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Sub: Self Forecast
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function SelfForecastView({ forecast }: { forecast: SelfForecast }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-cyan-100/50 bg-gradient-to-r from-cyan-50/30 to-indigo-50/20 backdrop-blur-sm px-4 py-3"
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-sm">🔮</span>
        <span className="text-[10px] tracking-[0.12em] text-cyan-500/70 uppercase font-medium">
          自分予報
        </span>
      </div>
      <p className="text-xs text-gray-600 leading-relaxed">{forecast.note}</p>
      {forecast.actual !== undefined && (
        <p className="text-[10px] text-gray-400 mt-1.5">
          結果: {forecast.actual}/{forecast.totalTasks} 完了
          {forecast.actual === forecast.predictedCompletion
            ? " — 予言的中 ✨"
            : forecast.actual > forecast.predictedCompletion
              ? " — 予言を超えた"
              : " — 予言より少なめ"}
        </p>
      )}
    </motion.div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Sub: Self Resolution Badge
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function SelfResolutionBadge({
  score,
  nextMilestone,
}: {
  score: number;
  nextMilestone: { day: number; label: string; daysLeft: number } | null;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex items-center justify-between"
    >
      <div className="flex items-center gap-2">
        <div className="relative w-10 h-10">
          <svg width={40} height={40} className="absolute">
            <circle cx={20} cy={20} r={16} fill="none" stroke="rgba(0,0,0,0.04)" strokeWidth={3} />
            <circle
              cx={20} cy={20} r={16} fill="none" stroke="url(#resGrad)" strokeWidth={3}
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 16}
              strokeDashoffset={2 * Math.PI * 16 * (1 - score / 100)}
              transform="rotate(-90 20 20)"
            />
            <defs>
              <linearGradient id="resGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#8b5cf6" />
                <stop offset="100%" stopColor="#06b6d4" />
              </linearGradient>
            </defs>
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-gray-600">
            {Math.round(score)}
          </span>
        </div>
        <div>
          <p className="text-[10px] text-gray-400">自己解像度</p>
          <p className="text-[11px] text-gray-600 font-medium">{Math.round(score)}%</p>
        </div>
      </div>
      {nextMilestone && nextMilestone.daysLeft > 0 && (
        <div className="text-right">
          <p className="text-[10px] text-gray-400">次の発見まで</p>
          <p className="text-[11px] text-cyan-600 font-medium">
            あと{nextMilestone.daysLeft}日 — {nextMilestone.label}
          </p>
        </div>
      )}
    </motion.div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Sub: Prediction Duel
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function PredictionDuelInput({
  totalTasks,
  onPredict,
}: {
  totalTasks: number;
  onPredict: (n: number) => void;
}) {
  const [val, setVal] = useState(Math.round(totalTasks * 0.6));

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-emerald-100/50 bg-gradient-to-r from-emerald-50/30 to-cyan-50/20 backdrop-blur-sm px-4 py-3"
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm">🎯</span>
        <span className="text-[10px] tracking-[0.12em] text-emerald-500/70 uppercase font-medium">
          予言対決
        </span>
      </div>
      <p className="text-xs text-gray-600 mb-3">
        今日、{totalTasks}個中何個完了すると思う？
      </p>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={totalTasks}
          value={val}
          onChange={(e) => setVal(Number(e.target.value))}
          className="flex-1 accent-emerald-400 h-1.5"
        />
        <span className="text-sm font-bold text-gray-700 w-8 text-center">{val}</span>
        <button
          onClick={() => onPredict(val)}
          className="rounded-xl bg-emerald-400/80 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 transition-all"
        >
          予言
        </button>
      </div>
    </motion.div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Sub: Absence Message
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function AbsenceMessageView({
  message,
  onReturnReason,
}: {
  message: string;
  onReturnReason?: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const showInput = message.includes("理由を聞いてもいい");

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl border border-gray-200/50 bg-gradient-to-b from-gray-50/40 to-slate-50/30 backdrop-blur-sm p-5"
    >
      <p className="text-sm text-gray-600 leading-relaxed">{message}</p>
      {showInput && onReturnReason && (
        <div className="mt-3 flex gap-2">
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="一言だけ..."
            className="flex-1 rounded-xl border border-gray-200/40 bg-white/60 px-3 py-2 text-sm text-gray-700 placeholder:text-gray-300 focus:outline-none"
          />
          <button
            onClick={() => reason.trim() && onReturnReason(reason.trim())}
            disabled={!reason.trim()}
            className="rounded-xl bg-gray-400/80 px-4 py-2 text-xs font-semibold text-white hover:bg-gray-500 transition-all disabled:opacity-30"
          >
            記録
          </button>
        </div>
      )}
    </motion.div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Sub: Surprise Observation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function SurpriseObservationView({
  observation,
  onRespond,
}: {
  observation: SurpriseObservation;
  onRespond: (response: string) => void;
}) {
  const [text, setText] = useState("");
  const [responded, setResponded] = useState(!!observation.userResponse);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="rounded-3xl border border-amber-200/50 bg-gradient-to-b from-amber-50/30 to-yellow-50/20 backdrop-blur-sm p-5"
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm">
          {observation.type === "system_confusion" ? "🤔" : observation.type === "contradiction" ? "🪞" : "💡"}
        </span>
        <span className="text-[10px] tracking-[0.12em] text-amber-500/70 uppercase font-medium">
          {observation.type === "system_confusion" ? "システムの困惑" : "発見"}
        </span>
      </div>
      <p className="text-sm text-gray-700 leading-relaxed">{observation.text}</p>
      {observation.type === "system_confusion" && !responded && (
        <div className="mt-3 flex gap-2">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="心当たりがあれば..."
            className="flex-1 rounded-xl border border-gray-200/40 bg-white/60 px-3 py-2 text-sm text-gray-700 placeholder:text-gray-300 focus:outline-none"
          />
          <button
            onClick={() => {
              if (text.trim()) {
                onRespond(text.trim());
                setResponded(true);
              }
            }}
            disabled={!text.trim()}
            className="rounded-xl bg-amber-400/80 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-500 transition-all disabled:opacity-30"
          >
            教える
          </button>
        </div>
      )}
    </motion.div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Sub: Threads Display
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function ThreadsView({ threads }: { threads: OrbitThread[] }) {
  const active = threads.filter((t) => t.status === "active").slice(0, 3);
  if (active.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl border border-rose-100/50 bg-gradient-to-b from-rose-50/20 to-pink-50/10 backdrop-blur-sm p-5"
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm">🧵</span>
        <span className="text-[10px] tracking-[0.15em] text-rose-400/70 uppercase font-medium">
          続いている糸
        </span>
      </div>
      <div className="space-y-3">
        {active.map((thread) => (
          <div
            key={thread.id}
            className="rounded-2xl bg-white/40 border border-rose-100/30 px-4 py-3"
          >
            <p className="text-xs font-semibold text-gray-700 mb-0.5">
              {thread.title}
            </p>
            <p className="text-[11px] text-gray-500 leading-relaxed">
              {thread.description}
            </p>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Sub: Discovery Milestone Unlock
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function DiscoveryUnlockView({ day }: { day: number }) {
  const milestone = DISCOVERY_MILESTONES.find((m) => m.day === day);
  if (!milestone) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="rounded-3xl border border-yellow-200/60 bg-gradient-to-r from-yellow-50/50 to-amber-50/30 backdrop-blur-sm p-5 text-center"
    >
      <p className="text-2xl mb-2">🔓</p>
      <p className="text-sm font-bold text-gray-800 mb-1">
        {milestone.label} — 解放
      </p>
      <p className="text-xs text-gray-500">{milestone.description}</p>
    </motion.div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Sub: Law Naming (命名権)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function LawNamingPrompt({
  law,
  onName,
}: {
  law: OrbitLaw;
  onName: (name: string) => void;
}) {
  const [name, setName] = useState("");

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl border border-purple-200/50 bg-gradient-to-b from-purple-50/30 to-indigo-50/20 backdrop-blur-sm p-5"
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm">✍️</span>
        <span className="text-[10px] tracking-[0.12em] text-purple-400/70 uppercase font-medium">
          命名権
        </span>
      </div>
      <p className="text-xs text-gray-500 mb-2">
        新しいパターンが発見されました:
      </p>
      <p className="text-sm text-gray-700 leading-relaxed mb-3">
        「{law.text}」
      </p>
      <p className="text-xs text-gray-400 mb-2">
        このパターンに名前をつけてください
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例: 午後の反乱"
          className="flex-1 rounded-xl border border-gray-200/40 bg-white/60 px-3 py-2 text-sm text-gray-700 placeholder:text-gray-300 focus:outline-none"
        />
        <button
          onClick={() => name.trim() && onName(name.trim())}
          disabled={!name.trim()}
          className="rounded-xl bg-purple-400/80 px-4 py-2 text-xs font-semibold text-white hover:bg-purple-500 transition-all disabled:opacity-30"
        >
          命名
        </button>
      </div>
    </motion.div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Sub: Law Promotion Ceremony
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function LawPromotionView({ law }: { law: OrbitLaw }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="rounded-3xl border border-gold/30 bg-gradient-to-b from-amber-50/50 to-yellow-50/30 backdrop-blur-sm p-6 text-center"
      style={{ borderColor: "rgba(212, 175, 55, 0.3)" }}
    >
      <p className="text-3xl mb-2">👑</p>
      <p className="text-[10px] tracking-[0.2em] text-amber-600/70 uppercase font-medium mb-2">
        人生の法則に昇格
      </p>
      <p className="text-sm font-bold text-gray-800 mb-1">
        {law.userLabel ? `「${law.userLabel}」` : ""}
      </p>
      <p className="text-xs text-gray-600 leading-relaxed">
        {law.text}
      </p>
      <p className="text-[10px] text-gray-400 mt-2">
        {law.streak}ヶ月間変わらなかった法則
      </p>
    </motion.div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Sub: Orbit Laws Display
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function OrbitLawsView({ laws }: { laws: OrbitLaw[] }) {
  if (laws.length === 0) return null;

  // 信頼度が高いものを最大3つ表示
  const topLaws = [...laws].sort((a, b) => b.confidence - a.confidence).slice(0, 3);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl border border-purple-100/50 bg-gradient-to-b from-purple-50/30 to-indigo-50/20 backdrop-blur-sm p-5"
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm">🪐</span>
        <span className="text-[10px] tracking-[0.15em] text-purple-400/70 uppercase font-medium">
          軌道の法則
        </span>
      </div>

      <div className="space-y-3">
        {topLaws.map((law) => (
          <div
            key={law.id}
            className="rounded-2xl bg-white/40 border border-purple-100/30 px-4 py-3"
          >
            <p className="text-sm text-gray-700 leading-relaxed">{law.text}</p>
            <p className="text-[10px] text-gray-400 mt-1">
              {law.dataPoints}日のデータから発見
            </p>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Sub: Night Reflection (Time Texture + Shadow + Question)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function NightReflectionView({
  entry,
  nightQuestion,
  notDoingValue,
  onTimeTexture,
  onShadowIntention,
  onReflection,
}: {
  entry: DailyOrbitEntry;
  nightQuestion: string;
  notDoingValue: string | null;
  onTimeTexture: (v: number) => void;
  onShadowIntention: (text: string) => void;
  onReflection: (answer: string) => void;
}) {
  const [step, setStep] = useState<"time" | "shadow" | "question">(
    entry.timeTexture !== null
      ? entry.shadowIntention
        ? "question"
        : "shadow"
      : "time",
  );
  const [timeVal, setTimeVal] = useState(entry.timeTexture ?? 50);
  const [shadowText, setShadowText] = useState(entry.shadowIntention?.text ?? "");
  const [reflText, setReflText] = useState(entry.reflection?.answer ?? "");
  const [submitted, setSubmitted] = useState(!!entry.reflection);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl border border-indigo-100/60 bg-gradient-to-b from-slate-900/[0.03] to-indigo-50/30 backdrop-blur-sm p-6"
    >
      <div className="flex items-center gap-2 mb-4">
        <span className="text-base">🌙</span>
        <span className="text-[10px] tracking-[0.15em] text-indigo-400/70 uppercase font-medium">
          夜の振り返り
        </span>
      </div>

      <AnimatePresence mode="wait">
        {/* Step 1: Time Texture */}
        {step === "time" && (
          <motion.div
            key="time"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            <p className="text-sm text-gray-700 mb-4 font-medium">
              今日はどんな長さの1日だった？
            </p>
            <div className="relative px-2">
              <input
                type="range"
                min={0}
                max={100}
                value={timeVal}
                onChange={(e) => setTimeVal(Number(e.target.value))}
                className="w-full accent-indigo-400 h-1.5"
              />
              <div className="flex justify-between mt-1">
                <span className="text-[10px] text-gray-400">一瞬だった</span>
                <span className="text-[10px] text-gray-400">永遠だった</span>
              </div>
            </div>
            <button
              onClick={() => {
                onTimeTexture(timeVal);
                setStep("shadow");
              }}
              className="mt-4 w-full rounded-2xl bg-indigo-400/80 py-2.5 text-sm font-semibold text-white transition-all hover:bg-indigo-500"
            >
              次へ
            </button>
          </motion.div>
        )}

        {/* Step 2: Shadow Intention */}
        {step === "shadow" && (
          <motion.div
            key="shadow"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            <p className="text-sm text-gray-700 mb-1 font-medium">
              今日、頭をよぎったけどリストに入れなかったことはある？
            </p>
            <p className="text-[10px] text-gray-400 mb-3">
              なければスキップしてOK
            </p>
            <input
              type="text"
              value={shadowText}
              onChange={(e) => setShadowText(e.target.value)}
              placeholder="例: あの人に連絡する、転職サイトを見る..."
              className="w-full rounded-2xl border border-gray-200/40 bg-white/60 backdrop-blur-sm px-4 py-3 text-sm text-gray-700 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-200/50"
            />
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => {
                  if (shadowText.trim()) {
                    onShadowIntention(shadowText.trim());
                  }
                  setStep("question");
                }}
                className="flex-1 rounded-2xl bg-indigo-400/80 py-2.5 text-sm font-semibold text-white transition-all hover:bg-indigo-500"
              >
                {shadowText.trim() ? "記録して次へ" : "スキップ"}
              </button>
            </div>
          </motion.div>
        )}

        {/* Step 3: Night Question */}
        {step === "question" && (
          <motion.div
            key="question"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            {/* Not Doing Value — 完了しなかった価値 */}
            {notDoingValue && (
              <div className="rounded-2xl bg-white/40 border border-gray-100/30 px-3 py-2.5 mb-4">
                <p className="text-[10px] text-gray-400 mb-0.5">
                  今日の観測
                </p>
                <p className="text-xs text-gray-600 leading-relaxed">
                  {notDoingValue}
                </p>
              </div>
            )}

            <p className="text-sm font-medium text-gray-700 mb-4 leading-relaxed">
              {nightQuestion}
            </p>

            {submitted ? (
              <div className="rounded-2xl bg-white/50 border border-gray-100/40 px-4 py-3">
                <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">
                  {reflText}
                </p>
                <button
                  onClick={() => setSubmitted(false)}
                  className="mt-2 text-[10px] text-gray-400 hover:text-gray-500 transition-colors"
                >
                  編集する
                </button>
              </div>
            ) : (
              <>
                <textarea
                  value={reflText}
                  onChange={(e) => setReflText(e.target.value)}
                  placeholder="思いつくまま..."
                  rows={3}
                  className="w-full rounded-2xl border border-gray-200/40 bg-white/60 backdrop-blur-sm px-4 py-3 text-sm text-gray-700 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-200/50 resize-none transition-all"
                />
                <button
                  onClick={() => {
                    if (reflText.trim()) {
                      onReflection(reflText.trim());
                      setSubmitted(true);
                    }
                  }}
                  disabled={!reflText.trim()}
                  className="mt-3 w-full rounded-2xl bg-indigo-400/80 py-2.5 text-sm font-semibold text-white transition-all hover:bg-indigo-500 disabled:opacity-30"
                >
                  記録する
                </button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Sub: Day State Badge
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const ENERGY_LABELS: Record<string, string> = {
  very_low: "とても低い", low: "低め", moderate: "ふつう", high: "高い", very_high: "とても高い",
};
const EMOTION_LABELS: Record<string, string> = {
  calm: "穏やか", anxious: "不安", joyful: "楽しい", tired: "疲れ", frustrated: "もやもや", neutral: "フラット",
};

function DayStateBadge({ state }: { state: DayState }) {
  const tags: string[] = [];
  if (state.energy) tags.push(ENERGY_LABELS[state.energy] ?? state.energy);
  if (state.emotion) tags.push(EMOTION_LABELS[state.emotion] ?? state.emotion);
  if (tags.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-gray-400">今日の状態</span>
      <div className="flex gap-1">
        {tags.map((tag) => (
          <span key={tag} className="rounded-full bg-indigo-50/80 border border-indigo-100/60 px-2.5 py-0.5 text-[11px] text-indigo-500/80 font-medium">
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Sub: Progress Ring
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function ProgressRing({ completed, total }: { completed: number; total: number }) {
  const pct = total > 0 ? completed / total : 0;
  const r = 28;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - pct);

  return (
    <div className="relative w-[72px] h-[72px] flex items-center justify-center">
      <svg width={72} height={72} className="absolute">
        <circle cx={36} cy={36} r={r} fill="none" stroke="rgba(0,0,0,0.04)" strokeWidth={4} />
        <motion.circle
          cx={36} cy={36} r={r} fill="none" stroke="url(#progressGrad)" strokeWidth={4} strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          transform="rotate(-90 36 36)"
        />
        <defs>
          <linearGradient id="progressGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#f97316" />
          </linearGradient>
        </defs>
      </svg>
      <span className="text-sm font-bold text-gray-700">{completed}/{total}</span>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function DailyOrbitSection() {
  const [store, setStore] = useState<DailyOrbitStore | null>(null);
  const [entry, setEntry] = useState<DailyOrbitEntry | null>(null);
  const [dayState, setDayState] = useState<DayState | null>(null);
  const [carryOverCandidates, setCarryOverCandidates] = useState<OrbitTask[]>([]);
  const [carryOverDismissed, setCarryOverDismissed] = useState(false);
  const [driftingTasks, setDriftingTasks] = useState<OrbitTask[]>([]);
  const [driftHandled, setDriftHandled] = useState<Set<string>>(new Set());
  const [yesterdayMsg, setYesterdayMsg] = useState<string | null>(null);
  const [temporalDone, setTemporalDone] = useState(false);
  const [bodyDone, setBodyDone] = useState(false);
  const [orbitLaws, setOrbitLaws] = useState<OrbitLaw[]>([]);
  // 適応的レイヤー
  const [adaptiveLayers, setAdaptiveLayers] = useState<AdaptiveLayerResult | null>(null);
  const [showAllLayers, setShowAllLayers] = useState(false);
  const [stargazerCtx, setStargazerCtx] = useState<StargazerOriginContext | null>(null);
  // Retention state
  const [selfResScore, setSelfResScore] = useState(0);
  const [nextMilestone, setNextMilestone] = useState<{ day: number; label: string; daysLeft: number } | null>(null);
  const [newUnlocks, setNewUnlocks] = useState<number[]>([]);
  const [threads, setThreads] = useState<OrbitThread[]>([]);
  const [surprise, setSurprise] = useState<SurpriseObservation | null>(null);
  const [absenceMsg, setAbsenceMsg] = useState<string | null>(null);
  const [unnamedLaw, setUnnamedLaw] = useState<OrbitLaw | null>(null);
  const [promotedLaws, setPromotedLaws] = useState<OrbitLaw[]>([]);
  const [daysUsed, setDaysUsed] = useState(0);

  const today = todayKey();

  // ── 初期化（ローカル→サーバー同期付き） ──
  const initializeStore = useCallback((s: ReturnType<typeof loadOrbitStore>) => {
    /* eslint-disable react-hooks/set-state-in-effect -- mount-time hydration */
    // ストリーク更新
    s = updateStreak(s, today);

    setStore(s);
    const e = getOrCreateEntry(s, today);
    setEntry(e);
    setDaysUsed(getDaysUsed(s));

    const candidates = getCarryOverCandidates(s, today);
    const existingCarriedIds = new Set(e.tasks.filter((t) => t.carriedFrom).map((t) => t.text));
    setCarryOverCandidates(candidates.filter((c) => !existingCarriedIds.has(c.text)));
    setDriftingTasks(getDriftingTasks(s, today));
    setYesterdayMsg(getYesterdayReflection(s, today));
    if (e.temporalDialogue?.response) setTemporalDone(true);
    if (e.bodyEcho) setBodyDone(true);

    const laws = discoverOrbitLaws(s, today);
    setOrbitLaws(laws);
    setUnnamedLaw(laws.find((l) => !l.userLabel && l.confidence > 0.5) ?? null);

    const resolution = updateSelfResolution(s, today);
    setSelfResScore(resolution.score);
    s = { ...s, selfResolution: resolution };

    const discovery = checkDiscoveryMilestones(s, today);
    setNewUnlocks(discovery.newlyUnlocked);
    setNextMilestone(discovery.nextMilestone);
    for (const day of discovery.newlyUnlocked) {
      s = { ...s, discoveryUnlocked: { ...s.discoveryUnlocked, [day]: new Date().toISOString() } };
    }

    const detected = detectThreads(s, today);
    setThreads(detected);
    s = { ...s, threads: detected };

    const obs = generateSurpriseObservation(s, today);
    if (obs) {
      setSurprise(obs);
      s = addSurpriseObservation(s, obs);
    }

    setAbsenceMsg(getAbsenceMessage(s, today));

    const tps = detectTurningPoints(s, today, e);
    for (const tp of tps) {
      s = addTurningPoint(s, tp);
    }

    setPromotedLaws(checkLawPromotions(s, today));
    saveOrbitStore(s);
    setStore(s);
    /* eslint-enable react-hooks/set-state-in-effect */
    return s;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today]);

  useEffect(() => {
    // 1. まず localStorage から即座に描画（ブロッキングなし）
    const localStore = loadOrbitStore();
    initializeStore(localStore);

    // 2. サーバーから非同期で取得し、データがあれば上書き
    loadOrbitStoreWithSync().then((serverStore) => {
      // サーバーのデータが localStorage より新しい場合のみ再初期化
      const serverEntryCount = Object.keys(serverStore.entries).length;
      const localEntryCount = Object.keys(localStore.entries).length;
      if (serverEntryCount > localEntryCount || serverStore.lastUsedAt !== localStore.lastUsedAt) {
        initializeStore(serverStore);
      }
    });

    // Stargazer state fetch
    fetchTodayState(today).then((state) => {
      setDayState(state);
      if (state) {
        setEntry((prev) => (prev ? { ...prev, dayState: state } : prev));
      }
    });

    // Stargazer context for adaptive layers
    fetchStargazerContext().then(setStargazerCtx);
  }, [today, initializeStore]);

  // 適応的レイヤー計算
  useEffect(() => {
    const todayJudgment = getTodayEntry()?.category ?? null;
    const result = selectAdaptiveLayers(store, stargazerCtx, todayJudgment, {
      forceShowAll: showAllLayers,
    });
    setAdaptiveLayers(result);
  }, [store, stargazerCtx, showAllLayers]);

  // ── 永続化 ──
  const persist = useCallback(
    (updated: DailyOrbitEntry) => {
      setEntry(updated);
      setStore((prev) => {
        if (!prev) return prev;
        const next = upsertEntry(prev, updated);
        saveOrbitStore(next);
        return next;
      });
    },
    [],
  );

  // ── Temporal Dialogue ──
  const handleTemporalResponse = useCallback(
    (r: TemporalResponse) => {
      if (!entry || !yesterdayMsg) return;
      const dialogue: TemporalDialogue = {
        yesterdayMessage: yesterdayMsg,
        response: r,
        respondedAt: new Date().toISOString(),
      };
      persist({ ...entry, temporalDialogue: dialogue });
      setTemporalDone(true);
    },
    [entry, yesterdayMsg, persist],
  );

  // ── Body Echo ──
  const handleBodyEcho = useCallback(
    (echo: BodyEcho) => {
      if (!entry) return;
      persist({ ...entry, bodyEcho: echo });
      setBodyDone(true);
    },
    [entry, persist],
  );

  // ── タスク操作 ──
  const addTask = useCallback(
    (text: string, nature?: TaskNature) => {
      if (!entry) return;
      const task: OrbitTask = {
        id: newTaskId(),
        text,
        completed: false,
        carryCount: 0,
        nature,
        addedAt: new Date().toISOString(),
      };
      const updated = { ...entry, tasks: [...entry.tasks, task] };
      persist(updated);

      // Self Forecast を更新
      if (store) {
        const forecast = generateSelfForecast(store, today, updated);
        if (forecast) persist({ ...updated, selfForecast: forecast });
      }
    },
    [entry, persist, store, today],
  );

  const toggleTask = useCallback(
    (id: string) => {
      if (!entry) return;
      persist({
        ...entry,
        tasks: entry.tasks.map((t) =>
          t.id === id
            ? { ...t, completed: !t.completed, completedAt: !t.completed ? new Date().toISOString() : null }
            : t,
        ),
      });
    },
    [entry, persist],
  );

  const setTaskTexture = useCallback(
    (id: string, texture: CompletionTexture) => {
      if (!entry) return;
      persist({
        ...entry,
        tasks: entry.tasks.map((t) => (t.id === id ? { ...t, texture } : t)),
      });
    },
    [entry, persist],
  );

  const deleteTask = useCallback(
    (id: string) => {
      if (!entry) return;
      persist({ ...entry, tasks: entry.tasks.filter((t) => t.id !== id) });
    },
    [entry, persist],
  );

  // ── 引き継ぎ ──
  const handleCarryOver = useCallback(
    (ids: string[]) => {
      if (!entry) return;
      const accepted = carryOverCandidates
        .filter((c) => ids.includes(c.id))
        .map((c) => ({
          ...c,
          id: newTaskId(),
          completed: false,
          completedAt: null,
          addedAt: new Date().toISOString(),
        }));
      persist({ ...entry, tasks: [...accepted, ...entry.tasks] });
      setCarryOverDismissed(true);
    },
    [entry, carryOverCandidates, persist],
  );

  // ── 漂流タスク ──
  const handleDriftAction = useCallback(
    (taskText: string, action: DriftAction, transformedText?: string) => {
      if (!entry) return;
      if (action === "release") {
        // タスクを削除
        persist({ ...entry, tasks: entry.tasks.filter((t) => t.text !== taskText) });
      } else if (action === "anchor") {
        // そのまま残す（UIから消す）
      } else if (action === "transform" && transformedText) {
        // テキストを書き換え
        persist({
          ...entry,
          tasks: entry.tasks.map((t) =>
            t.text === taskText ? { ...t, text: transformedText, carryCount: 0 } : t,
          ),
        });
      }
      setDriftHandled((prev) => new Set(prev).add(taskText));
    },
    [entry, persist],
  );

  // ── 夜の振り返り ──
  const handleTimeTexture = useCallback(
    (v: number) => {
      if (!entry) return;
      persist({ ...entry, timeTexture: v });
    },
    [entry, persist],
  );

  const handleShadowIntention = useCallback(
    (text: string) => {
      if (!entry) return;
      const shadow: ShadowIntention = { text, recordedAt: new Date().toISOString() };
      persist({ ...entry, shadowIntention: shadow });
    },
    [entry, persist],
  );

  const handleReflection = useCallback(
    (answer: string) => {
      if (!entry) return;
      const nightQuestion = selectNightQuestion(
        {
          tasks: entry.tasks,
          dayState: dayState ?? entry.dayState,
          bodyEcho: entry.bodyEcho,
          hasShadowIntention: !!entry.shadowIntention,
        },
        today,
      );
      const reflection: NightReflection = {
        question: nightQuestion,
        answer,
        answeredAt: new Date().toISOString(),
      };
      // Self Forecast の答え合わせ
      const selfForecast = entry.selfForecast
        ? { ...entry.selfForecast, actual: entry.tasks.filter((t) => t.completed).length }
        : null;
      persist({ ...entry, reflection, selfForecast });
    },
    [entry, dayState, persist, today],
  );

  // ── ユーザー予測 ──
  const handleUserPrediction = useCallback(
    (predicted: number) => {
      if (!entry) return;
      persist({ ...entry, userPrediction: predicted });
    },
    [entry, persist],
  );

  // ── 法則命名 ──
  const handleLawNaming = useCallback(
    (lawId: string, name: string) => {
      if (!store) return;
      const law = orbitLaws.find((l) => l.id === lawId);
      if (!law) return;
      const named = { ...law, userLabel: name };
      const updated = { ...store };
      const idx = updated.orbitLaws.findIndex((l) => l.id === lawId);
      if (idx >= 0) {
        updated.orbitLaws = [...updated.orbitLaws];
        updated.orbitLaws[idx] = named;
      } else {
        updated.orbitLaws = [...updated.orbitLaws, named];
      }
      saveOrbitStore(updated);
      setStore(updated);
      setOrbitLaws((prev) => prev.map((l) => (l.id === lawId ? named : l)));
      setUnnamedLaw(null);
    },
    [store, orbitLaws],
  );

  // ── 不意打ち観測への応答 ──
  const handleSurpriseResponse = useCallback(
    (response: string) => {
      if (!store || !surprise) return;
      const updated = {
        ...store,
        surpriseObservations: store.surpriseObservations.map((o) =>
          o.date === surprise.date && o.text === surprise.text
            ? { ...o, userResponse: response }
            : o,
        ),
      };
      saveOrbitStore(updated);
      setStore(updated);
      setSurprise((prev) => (prev ? { ...prev, userResponse: response } : prev));
    },
    [store, surprise],
  );

  // ── 不在からの帰還 ──
  const handleAbsenceReturn = useCallback(
    (reason: string) => {
      if (!entry) return;
      // 内在する意図として記録
      const shadow: ShadowIntention = {
        text: `[帰還] ${reason}`,
        recordedAt: new Date().toISOString(),
      };
      persist({ ...entry, shadowIntention: shadow });
    },
    [entry, persist],
  );

  // ── 描画準備 ──
  if (!entry) return null;

  const completedCount = entry.tasks.filter((t) => t.completed).length;
  const totalCount = entry.tasks.length;

  const showCarryOver =
    carryOverCandidates.length > 0 &&
    !carryOverDismissed &&
    entry.tasks.filter((t) => t.carriedFrom).length === 0;

  const unhandledDrifts = driftingTasks.filter((d) => !driftHandled.has(d.text));

  const nightQuestion = selectNightQuestion(
    {
      tasks: entry.tasks,
      dayState: dayState ?? entry.dayState,
      bodyEcho: entry.bodyEcho,
      hasShadowIntention: !!entry.shadowIntention,
    },
    today,
  );

  const notDoingValue = describeNotDoingValue(entry);

  const currentHour = new Date().getHours();
  const isEvening = currentHour >= 18;

  // 適応的レイヤー: 層の表示判定ヘルパー
  const isLayerVisible = useCallback((layerId: OrbitLayerId): boolean => {
    if (showAllLayers || !adaptiveLayers) return true;
    return adaptiveLayers.primary.some((l) => l.layerId === layerId);
  }, [showAllLayers, adaptiveLayers]);

  // フェーズ決定
  const showTemporal = yesterdayMsg && !temporalDone;
  const showBody = !bodyDone && !entry.bodyEcho;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-lg mx-auto px-4 pb-24 space-y-5 pt-4">
        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <div>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-[10px] tracking-[0.2em] text-gray-400 uppercase font-medium"
            >
              今日の軌道
            </motion.p>
            <motion.p
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-lg font-bold text-gray-800 mt-0.5"
            >
              {new Date(today).toLocaleDateString("ja-JP", {
                month: "long",
                day: "numeric",
                weekday: "short",
              })}
            </motion.p>
          </div>

          {totalCount > 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
            >
              <ProgressRing completed={completedCount} total={totalCount} />
            </motion.div>
          )}
        </div>

        {/* ── Self Resolution Badge ── */}
        {daysUsed >= 3 && (
          <SelfResolutionBadge score={selfResScore} nextMilestone={nextMilestone} />
        )}

        {/* ── Absence Message ── */}
        <AnimatePresence>
          {absenceMsg && (
            <AbsenceMessageView message={absenceMsg} onReturnReason={handleAbsenceReturn} />
          )}
        </AnimatePresence>

        {/* ── Discovery Milestones ── */}
        <AnimatePresence>
          {newUnlocks.map((day) => (
            <DiscoveryUnlockView key={day} day={day} />
          ))}
        </AnimatePresence>

        {/* ── Stargazer Day State ── */}
        {(dayState || entry.dayState) && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}>
            <DayStateBadge state={(dayState ?? entry.dayState)!} />
          </motion.div>
        )}

        {/* ── Body Echo Badge (after recording) ── */}
        {entry.bodyEcho && isLayerVisible("bodyEcho") && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-1.5">
            <span className="text-[10px] text-gray-400">身体の声</span>
            <div className="flex gap-1">
              {entry.bodyEcho.head && (
                <span className="rounded-full bg-purple-50/80 border border-purple-100/60 px-2 py-0.5 text-[11px] text-purple-500/80 font-medium">
                  頭: {BODY_ZONE_OPTIONS.head.options.find((o) => o.value === entry.bodyEcho!.head)?.label}
                </span>
              )}
              {entry.bodyEcho.chest && (
                <span className="rounded-full bg-purple-50/80 border border-purple-100/60 px-2 py-0.5 text-[11px] text-purple-500/80 font-medium">
                  胸: {BODY_ZONE_OPTIONS.chest.options.find((o) => o.value === entry.bodyEcho!.chest)?.label}
                </span>
              )}
            </div>
          </motion.div>
        )}

        {/* ── Temporal Dialogue (morning) ── */}
        <AnimatePresence>
          {showTemporal && isLayerVisible("temporalDialogue") && (
            <TemporalDialogueView
              message={yesterdayMsg!}
              onRespond={handleTemporalResponse}
              onSkip={() => setTemporalDone(true)}
            />
          )}
        </AnimatePresence>

        {/* ── Body Echo (morning, after temporal) ── */}
        <AnimatePresence>
          {!showTemporal && showBody && isLayerVisible("bodyEcho") && (
            <BodyEchoView
              existing={entry.bodyEcho}
              onSubmit={handleBodyEcho}
              onSkip={() => setBodyDone(true)}
            />
          )}
        </AnimatePresence>

        {/* ── Carry Over Prompt ── */}
        <AnimatePresence>
          {showCarryOver && (
            <CarryOverPrompt
              candidates={carryOverCandidates}
              onAccept={handleCarryOver}
              onSkip={() => setCarryOverDismissed(true)}
            />
          )}
        </AnimatePresence>

        {/* ── Drifting Tasks ── */}
        <AnimatePresence>
          {unhandledDrifts.map((task) => (
            <DriftingTaskPrompt
              key={task.text}
              task={task}
              onAction={(action, transformed) =>
                handleDriftAction(task.text, action, transformed)
              }
            />
          ))}
        </AnimatePresence>

        {/* ── Self Forecast ── */}
        {entry.selfForecast && isLayerVisible("selfForecast") && (
          <SelfForecastView forecast={entry.selfForecast} />
        )}

        {/* ── Prediction Duel ── */}
        {daysUsed >= 10 && totalCount >= 2 && !entry.userPrediction && (
          <PredictionDuelInput
            totalTasks={totalCount}
            onPredict={handleUserPrediction}
          />
        )}

        {/* ── Task Input ── */}
        <TaskInput onAdd={addTask} />

        {/* ── Task List ── */}
        {entry.tasks.length > 0 && (
          <div className="space-y-2">
            <AnimatePresence mode="popLayout">
              {entry.tasks
                .filter((t) => !t.completed)
                .map((task) => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    onToggle={() => toggleTask(task.id)}
                    onDelete={() => deleteTask(task.id)}
                    onTexture={(t) => setTaskTexture(task.id, t)}
                  />
                ))}
              {entry.tasks
                .filter((t) => t.completed)
                .map((task) => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    onToggle={() => toggleTask(task.id)}
                    onDelete={() => deleteTask(task.id)}
                    onTexture={(t) => setTaskTexture(task.id, t)}
                  />
                ))}
            </AnimatePresence>
          </div>
        )}

        {/* ── Empty State ── */}
        {entry.tasks.length === 0 && !showCarryOver && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-center py-12"
          >
            <p className="text-3xl mb-3">☀️</p>
            <p className="text-sm text-gray-400">今日やることを追加しよう</p>
          </motion.div>
        )}

        {/* ── Night Reflection ── */}
        {(isEvening || entry.reflection) && totalCount > 0 && isLayerVisible("reflection") && (
          <div className="pt-4">
            <NightReflectionView
              entry={entry}
              nightQuestion={nightQuestion}
              notDoingValue={notDoingValue}
              onTimeTexture={handleTimeTexture}
              onShadowIntention={handleShadowIntention}
              onReflection={handleReflection}
            />
          </div>
        )}

        {/* ── Surprise Observation ── */}
        <AnimatePresence>
          {surprise && (
            <SurpriseObservationView
              observation={surprise}
              onRespond={handleSurpriseResponse}
            />
          )}
        </AnimatePresence>

        {/* ── Threads ── */}
        {threads.length > 0 && <ThreadsView threads={threads} />}

        {/* ── Law Naming ── */}
        <AnimatePresence>
          {unnamedLaw && (
            <LawNamingPrompt
              law={unnamedLaw}
              onName={(name) => handleLawNaming(unnamedLaw.id, name)}
            />
          )}
        </AnimatePresence>

        {/* ── Law Promotion Ceremony ── */}
        <AnimatePresence>
          {promotedLaws.map((law) => (
            <LawPromotionView key={law.id} law={law} />
          ))}
        </AnimatePresence>

        {/* ── Orbit Laws ── */}
        {orbitLaws.length > 0 && (
          <div className="pt-2">
            <OrbitLawsView laws={orbitLaws} />
          </div>
        )}

        {/* ── Stargazer連携ヒント ── */}
        {!dayState && !entry.dayState && totalCount > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="rounded-2xl border border-gray-100/40 bg-white/30 backdrop-blur-sm px-4 py-3 text-center"
          >
            <p className="text-xs text-gray-400">
              Stargazerで今日の観測をすると、
              <br />
              あなたの状態に合わせた振り返りの問いが届きます
            </p>
          </motion.div>
        )}

        {/* ── 適応的レイヤー: 折りたたみ層 & 盲点提案 ── */}
        {adaptiveLayers && !showAllLayers && adaptiveLayers.collapsed.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="pt-2"
          >
            <button
              onClick={() => setShowAllLayers(true)}
              className="w-full rounded-2xl border border-gray-100/40 bg-white/30 backdrop-blur-sm px-4 py-3 text-center hover:bg-white/50 transition-colors"
            >
              <p className="text-xs text-gray-400">
                {adaptiveLayers.collapsed.map((l) => getLayerMeta(l.layerId).emoji).join(" ")}
                {" "}他{adaptiveLayers.collapsed.length}つの観測層を表示
              </p>
            </button>
          </motion.div>
        )}
        {showAllLayers && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pt-2">
            <button
              onClick={() => setShowAllLayers(false)}
              className="w-full rounded-2xl border border-gray-100/40 bg-white/30 backdrop-blur-sm px-4 py-2 text-center hover:bg-white/50 transition-colors"
            >
              <p className="text-xs text-gray-400">おすすめ層だけ表示</p>
            </button>
          </motion.div>
        )}
        {adaptiveLayers?.blindSpot && !showAllLayers && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
            className="rounded-2xl border border-amber-100/60 bg-amber-50/30 backdrop-blur-sm px-4 py-3"
          >
            <p className="text-xs text-amber-600/80">
              {getLayerMeta(adaptiveLayers.blindSpot.layerId).emoji}{" "}
              {adaptiveLayers.blindSpot.reason}
            </p>
          </motion.div>
        )}
      </div>
    </div>
  );
}
