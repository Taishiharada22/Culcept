"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  motion,
  AnimatePresence,
  Reorder,
  useDragControls,
  useMotionValue,
  useTransform,
} from "framer-motion";
import type { OrbitTask, CompletionTexture, TaskNature } from "@/lib/origin/dailyOrbit/types";
import { TASK_NATURE_META, TEXTURE_META } from "@/lib/origin/dailyOrbit/types";

type Priority = "high" | "mid" | "low";

const PRIORITY_COLORS: Record<Priority, string> = {
  high: "bg-red-400",
  mid: "bg-amber-400",
  low: "bg-blue-400",
};

const PRIORITY_LABELS: Record<Priority, string> = {
  high: "高",
  mid: "中",
  low: "低",
};

const SWIPE_THRESHOLD = 120;

type Props = {
  task: OrbitTask & { priority?: Priority; sortOrder?: number };
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onSetTexture: (id: string, texture: CompletionTexture) => void;
  onSetPriority: (id: string, priority: Priority) => void;
  onPostpone?: (id: string) => void;
  driftInfo?: { carryCount: number };
  onDriftAction?: (action: "anchor" | "release" | "transform", text?: string) => void;
  /** false = render as motion.div instead of Reorder.Item (for completed tasks outside Reorder.Group) */
  draggable?: boolean;
  /** Show texture picker externally (for just-completed tasks) */
  showTextureOverride?: boolean;
  onTextureDismiss?: () => void;
  /** Subtask support */
  subtasks?: OrbitTask[];
  parentProgress?: { done: number; total: number };
  onAddSubtask?: (parentId: string, text: string) => void;
  /** Tag support */
  onSetTags?: (id: string, tags: string[]) => void;
};

export default function TaskItem({
  task,
  onToggle,
  onDelete,
  onSetTexture,
  onSetPriority,
  onPostpone,
  driftInfo,
  onDriftAction,
  draggable = true,
  showTextureOverride,
  onTextureDismiss,
  subtasks,
  parentProgress,
  onAddSubtask,
  onSetTags,
}: Props) {
  const [showTextureInternal, setShowTextureInternal] = useState(false);
  const [showSubtaskInput, setShowSubtaskInput] = useState(false);
  const [subtaskText, setSubtaskText] = useState("");
  const [showTagInput, setShowTagInput] = useState(false);
  const [tagText, setTagText] = useState("");
  const showTexture = showTextureOverride ?? showTextureInternal;
  const [showPriority, setShowPriority] = useState(false);
  const [transformText, setTransformText] = useState("");
  const [showDriftActions, setShowDriftActions] = useState(false);
  const [showTransformInput, setShowTransformInput] = useState(false);
  const [postponeToast, setPostponeToast] = useState(false);
  const [swipedOut, setSwipedOut] = useState<"right" | "left" | null>(null);
  const textureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragControls = useDragControls();

  // Swipe motion values
  const swipeX = useMotionValue(0);
  const isSwiping = useRef(false);

  // Background opacity derived from swipe position
  const completeOpacity = useTransform(swipeX, [0, SWIPE_THRESHOLD], [0, 1]);
  const postponeOpacity = useTransform(swipeX, [-SWIPE_THRESHOLD, 0], [1, 0]);
  // Controls overlay: hide chrome when dragging far enough
  const chromeOpacity = useTransform(swipeX, [-60, -30, 0, 30, 60], [0, 0.5, 1, 0.5, 0]);

  const priority: Priority = (task as { priority?: Priority }).priority ?? "low";

  const handleToggle = () => {
    onToggle(task.id);
    if (!task.completed) {
      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10);
    }
  };

  const handleTexture = (texture: CompletionTexture) => {
    onSetTexture(task.id, texture);
    setShowTextureInternal(false);
    onTextureDismiss?.();
    if (textureTimerRef.current) clearTimeout(textureTimerRef.current);
  };

  const handleTextureDismiss = () => {
    setShowTextureInternal(false);
    onTextureDismiss?.();
  };

  // Auto-dismiss texture picker after 5 seconds
  useEffect(() => {
    if (!showTexture) return;
    const timer = setTimeout(handleTextureDismiss, 5000);
    return () => clearTimeout(timer);
  }, [showTexture]);

  // Auto-dismiss postpone toast
  useEffect(() => {
    if (!postponeToast) return;
    const timer = setTimeout(() => setPostponeToast(false), 1500);
    return () => clearTimeout(timer);
  }, [postponeToast]);

  const handlePriorityClick = () => {
    if (task.completed) return;
    const order: Priority[] = ["low", "mid", "high"];
    const idx = order.indexOf(priority);
    onSetPriority(task.id, order[(idx + 1) % order.length]);
  };

  const handleSwipeDragEnd = useCallback(() => {
    const x = swipeX.get();
    if (x >= SWIPE_THRESHOLD && !task.completed) {
      // Complete
      setSwipedOut("right");
      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10);
      onToggle(task.id);
    } else if (x <= -SWIPE_THRESHOLD && !task.completed && onPostpone) {
      // Postpone
      setSwipedOut("left");
      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10);
      onPostpone(task.id);
      setPostponeToast(true);
    }
    isSwiping.current = false;
  }, [task.id, task.completed, onToggle, onPostpone, swipeX]);

  const canSwipe = !task.completed;

  const animProps = {
    className: "group",
    initial: { opacity: 0, y: -8 } as const,
    animate: swipedOut
      ? {
          opacity: 0,
          x: swipedOut === "right" ? 300 : -300,
          transition: { duration: 0.25 },
        }
      : ({ opacity: 1, y: 0 } as const),
    exit: { opacity: 0, x: -100, transition: { duration: 0.2 } } as const,
  };

  const swipeRow = (
    <div className="relative overflow-hidden rounded-2xl">
      {/* Complete background (right swipe) */}
      {canSwipe && (
        <motion.div
          className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-r from-emerald-400/80 to-emerald-300/60 flex items-center pl-4"
          style={{ opacity: completeOpacity }}
        >
          <span className="text-white text-sm font-medium">完了</span>
        </motion.div>
      )}

      {/* Postpone background (left swipe) */}
      {canSwipe && (
        <motion.div
          className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-l from-amber-400/80 to-amber-300/60 flex items-center justify-end pr-4"
          style={{ opacity: postponeOpacity }}
        >
          <span className="text-white text-sm font-medium">明日へ</span>
        </motion.div>
      )}

      {/* Swipeable row */}
      <motion.div
        drag={canSwipe ? "x" : false}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.5}
        style={{ x: canSwipe ? swipeX : undefined }}
        onDragStart={() => { isSwiping.current = true; }}
        onDragEnd={handleSwipeDragEnd}
        className={`relative flex items-center gap-2 rounded-2xl px-3 py-2.5 transition-colors ${
          task.completed ? "bg-white/30" : "bg-white/60"
        }`}
      >
        {/* Drag handle */}
        {!task.completed && (
          <motion.button
            style={{ opacity: chromeOpacity }}
            className="cursor-grab touch-none text-gray-300 opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
            onPointerDown={(e) => {
              if (!isSwiping.current) dragControls.start(e);
            }}
          >
            <span className="text-sm">≡</span>
          </motion.button>
        )}

        {/* Priority dot */}
        <motion.button
          style={canSwipe ? { opacity: chromeOpacity } : undefined}
          onClick={handlePriorityClick}
          className={`h-2.5 w-2.5 shrink-0 rounded-full transition-all ${PRIORITY_COLORS[priority]} ${
            task.completed ? "opacity-30" : "opacity-80 hover:scale-125"
          }`}
          title={`優先度: ${PRIORITY_LABELS[priority]}`}
        />

        {/* Checkbox */}
        <motion.button
          style={canSwipe ? { opacity: chromeOpacity } : undefined}
          onClick={handleToggle}
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all ${
            task.completed
              ? "border-emerald-400 bg-emerald-400"
              : "border-gray-300 hover:border-gray-400"
          }`}
        >
          {task.completed && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 500, damping: 20 }}
              className="text-[10px] text-white"
            >
              ✓
            </motion.span>
          )}
        </motion.button>

        {/* Task text */}
        <span className={`flex-1 text-sm transition-all ${
          task.completed ? "text-gray-400 line-through" : "text-gray-700"
        }`}>
          {task.text}
        </span>

        {/* Recurrence badge */}
        {task.recurrence && !task.completed && (
          <motion.span
            style={{ opacity: chromeOpacity }}
            className="text-[10px] text-gray-400"
            title={
              task.recurrence.pattern === "daily" ? "毎日" :
              task.recurrence.pattern === "weekdays" ? "毎平日" :
              task.recurrence.pattern === "weekly" ? `毎週${["日","月","火","水","木","金","土"][task.recurrence.dayOfWeek ?? 0]}曜` :
              task.recurrence.pattern === "monthly" ? (task.recurrence.dayOfMonth === 32 ? "毎月末" : `毎月${task.recurrence.dayOfMonth}日`) :
              task.recurrence.pattern === "custom" ? `${task.recurrence.intervalDays}日ごと` :
              `隔週${["日","月","火","水","木","金","土"][task.recurrence.dayOfWeek ?? 0]}曜`
            }
          >
            🔁
          </motion.span>
        )}

        {/* Tags */}
        {task.tags && task.tags.length > 0 && !task.completed && (
          <div className="flex gap-0.5">
            {task.tags.map((tag) => (
              <motion.span
                key={tag}
                style={{ opacity: chromeOpacity }}
                className="rounded-full bg-indigo-50 px-1.5 py-0.5 text-[9px] text-indigo-500"
              >
                {tag}
              </motion.span>
            ))}
          </div>
        )}

        {/* Due date badge */}
        {task.dueDate && !task.completed && (
          <motion.span
            style={{ opacity: chromeOpacity }}
            className="text-[10px] text-gray-400"
          >
            {parseInt(task.dueDate.split("-")[1], 10)}/{parseInt(task.dueDate.split("-")[2], 10)}
          </motion.span>
        )}

        {/* Nature badge */}
        {task.nature && !task.completed && (
          <motion.span
            style={{ opacity: chromeOpacity }}
            className="text-[10px] opacity-50"
            title={TASK_NATURE_META[task.nature]?.label}
          >
            {TASK_NATURE_META[task.nature]?.emoji}
          </motion.span>
        )}

        {/* Completed info */}
        {task.completed && (
          <div className="flex items-center gap-1.5">
            {task.texture && (
              <span className="text-xs">{TEXTURE_META[task.texture]?.emoji}</span>
            )}
            {task.addedAt && (
              <span className="text-[10px] text-gray-400">
                {new Date(task.addedAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>
        )}

        {/* Drift info */}
        {driftInfo && !task.completed && (
          <motion.button
            style={{ opacity: chromeOpacity }}
            onClick={() => setShowDriftActions(!showDriftActions)}
            className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] text-amber-600"
          >
            {driftInfo.carryCount}日目
          </motion.button>
        )}

        {/* Delete */}
        {!task.completed && (
          <motion.button
            style={{ opacity: chromeOpacity }}
            onClick={() => onDelete(task.id)}
            className="text-gray-300 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
          >
            <span className="text-xs">✕</span>
          </motion.button>
        )}
      </motion.div>
    </div>
  );

  const inner = (
    <>
      {swipeRow}

      {/* Postpone toast */}
      <AnimatePresence>
        {postponeToast && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="ml-8 mt-1 text-xs text-amber-600"
          >
            明日に送りました
          </motion.div>
        )}
      </AnimatePresence>

      {/* Texture picker popup */}
      <AnimatePresence>
        {showTexture && task.completed && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="ml-12 mt-1 flex gap-2"
          >
            {(Object.entries(TEXTURE_META) as [CompletionTexture, { emoji: string; label: string }][]).map(
              ([key, meta]) => (
                <button
                  key={key}
                  onClick={() => handleTexture(key)}
                  className="rounded-full bg-white/70 px-2.5 py-1 text-xs transition-all hover:bg-white hover:shadow-sm"
                >
                  {meta.emoji} {meta.label}
                </button>
              ),
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Subtask progress + add */}
      {parentProgress && parentProgress.total > 0 && (
        <div className="ml-8 mt-1 flex items-center gap-2">
          <div className="h-1 flex-1 rounded-full bg-gray-200">
            <div
              className="h-1 rounded-full bg-emerald-400 transition-all"
              style={{ width: `${(parentProgress.done / parentProgress.total) * 100}%` }}
            />
          </div>
          <span className="text-[10px] text-gray-400">{parentProgress.done}/{parentProgress.total}</span>
        </div>
      )}

      {/* Subtask list */}
      {subtasks && subtasks.length > 0 && (
        <div className="ml-8 mt-1 space-y-0.5">
          {subtasks.map((sub) => (
            <div key={sub.id} className="flex items-center gap-2 py-0.5">
              <button
                onClick={() => onToggle(sub.id)}
                className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border transition-all ${
                  sub.completed
                    ? "border-emerald-400 bg-emerald-400"
                    : "border-gray-300 hover:border-gray-400"
                }`}
              >
                {sub.completed && <span className="text-[8px] text-white">✓</span>}
              </button>
              <span className={`text-xs ${sub.completed ? "text-gray-400 line-through" : "text-gray-600"}`}>
                {sub.text}
              </span>
              {!sub.completed && (
                <button onClick={() => onDelete(sub.id)} className="text-[10px] text-gray-300 hover:text-red-400">✕</button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add subtask */}
      {onAddSubtask && !task.completed && (
        <div className="ml-8 mt-1">
          {showSubtaskInput ? (
            <div className="flex items-center gap-1.5">
              <input
                value={subtaskText}
                onChange={(e) => setSubtaskText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && subtaskText.trim()) {
                    onAddSubtask(task.id, subtaskText.trim());
                    setSubtaskText("");
                  }
                }}
                placeholder="サブタスク"
                className="flex-1 rounded-lg bg-white/60 px-2 py-1 text-xs outline-none placeholder:text-gray-300"
                autoFocus
              />
              <button
                onClick={() => {
                  if (subtaskText.trim()) {
                    onAddSubtask(task.id, subtaskText.trim());
                    setSubtaskText("");
                  }
                }}
                className="text-[10px] text-gray-400 hover:text-gray-600"
              >
                追加
              </button>
              <button onClick={() => { setShowSubtaskInput(false); setSubtaskText(""); }} className="text-[10px] text-gray-300">✕</button>
            </div>
          ) : (
            <button
              onClick={() => setShowSubtaskInput(true)}
              className="text-[10px] text-gray-400 hover:text-gray-500"
            >
              + サブタスク
            </button>
          )}
        </div>
      )}

      {/* Tag editor */}
      {onSetTags && !task.completed && (
        <div className="ml-8 mt-0.5">
          {showTagInput ? (
            <div className="flex items-center gap-1.5">
              <input
                value={tagText}
                onChange={(e) => setTagText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && tagText.trim()) {
                    const existing = task.tags ?? [];
                    if (!existing.includes(tagText.trim())) {
                      onSetTags(task.id, [...existing, tagText.trim()]);
                    }
                    setTagText("");
                  }
                }}
                placeholder="タグ名"
                className="w-24 rounded-lg bg-white/60 px-2 py-0.5 text-[10px] outline-none placeholder:text-gray-300"
                autoFocus
              />
              <button onClick={() => setShowTagInput(false)} className="text-[10px] text-gray-300">✕</button>
            </div>
          ) : (
            <button
              onClick={() => setShowTagInput(true)}
              className="text-[10px] text-gray-300 hover:text-gray-500"
            >
              + タグ
            </button>
          )}
        </div>
      )}

      {/* Drift actions */}
      <AnimatePresence>
        {showDriftActions && driftInfo && onDriftAction && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="ml-8 mt-1 overflow-hidden"
          >
            <div className="flex flex-wrap gap-1.5 pb-1">
              <button
                onClick={() => { onDriftAction("anchor"); setShowDriftActions(false); }}
                className="rounded-full bg-blue-50 px-3 py-1 text-[11px] text-blue-600 transition-colors hover:bg-blue-100"
              >
                今日やる
              </button>
              <button
                onClick={() => { onDriftAction("release"); setShowDriftActions(false); }}
                className="rounded-full bg-gray-50 px-3 py-1 text-[11px] text-gray-500 transition-colors hover:bg-gray-100"
              >
                手放す
              </button>
              <button
                onClick={() => setShowTransformInput(!showTransformInput)}
                className="rounded-full bg-amber-50 px-3 py-1 text-[11px] text-amber-600 transition-colors hover:bg-amber-100"
              >
                書き換える
              </button>
            </div>
            {showTransformInput && (
              <div className="mt-1 flex gap-1.5">
                <input
                  value={transformText}
                  onChange={(e) => setTransformText(e.target.value)}
                  placeholder="新しいタスク内容"
                  className="flex-1 rounded-xl bg-white/70 px-3 py-1.5 text-xs outline-none"
                  autoFocus
                />
                <button
                  onClick={() => {
                    if (transformText.trim()) {
                      onDriftAction("transform", transformText.trim());
                      setShowDriftActions(false);
                      setShowTransformInput(false);
                      setTransformText("");
                    }
                  }}
                  className="rounded-xl bg-amber-400 px-3 py-1.5 text-xs text-white"
                >
                  変更
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );

  if (!draggable) {
    return <motion.div {...animProps}>{inner}</motion.div>;
  }

  return (
    <Reorder.Item
      value={task}
      dragListener={false}
      dragControls={dragControls}
      layout="position"
      {...animProps}
    >
      {inner}
    </Reorder.Item>
  );
}
