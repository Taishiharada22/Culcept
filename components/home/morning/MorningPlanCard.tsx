"use client";

/**
 * MorningPlanCard — 今日のプラン表示カード
 *
 * Alterの会話内にインラインで表示される。
 * - 時間タップで所要時間変更
 * - 項目の完了チェック
 * - 確定 / 変更ボタン
 */

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassCard } from "@/components/ui/glassmorphism-design";
import type { MorningPlan, PlanItem, MainLocation } from "@/lib/alter-morning/types";
import {
  learnDuration,
  loadDurationStore,
  saveDurationStore,
} from "@/lib/alter-morning/taskDurationMemory";
import { recalculateSchedule } from "@/lib/alter-morning/planningEngine";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Props
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface MorningPlanCardProps {
  plan: MorningPlan;
  personalizeHints?: string[];
  onConfirm: (plan: MorningPlan) => void;
  onRequestChange: () => void;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 時間表示ヘルパー
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function formatDuration(min: number): string {
  if (min < 60) return `${min}分`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}時間${m}分` : `${h}時間`;
}

/** plan.date を今日/明日/日付 に変換する */
function formatPlanDateLabel(planDate: string): string {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const todayStr = jst.toISOString().slice(0, 10);
  // 明日
  const tomorrow = new Date(jst);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

  if (planDate === todayStr) return "☀️ 今日のプラン";
  if (planDate === tomorrowStr) return "🌙 明日のプラン";
  // それ以外: 月/日表示
  const [, m, d] = planDate.split("-");
  return `📅 ${parseInt(m)}/${parseInt(d)}のプラン`;
}

function getItemEmoji(item: PlanItem): string {
  if (item.eventType === "errand") return "🏥";
  if (item.eventType === "friends") return "🍽️";
  if (item.eventType === "date") return "💑";
  if (item.eventType === "work") return "💼";
  if (item.eventType === "sports") return "🏃";
  if (item.eventType === "travel") return "✈️";
  if (item.eventType === "formal") return "👔";
  if (item.eventType === "party") return "🎉";
  if (item.eventType === "outdoor") return "🌳";
  if (item.eventType === "home") return "🏠";
  if (item.kind === "fixed") return "📌";
  return "✅";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 時間編集ポップオーバー
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120, 180];

function DurationPicker({
  current,
  onSelect,
  onClose,
}: {
  current: number;
  onSelect: (min: number) => void;
  onClose: () => void;
}) {
  const [customMode, setCustomMode] = useState(false);
  const [customValue, setCustomValue] = useState(String(current));

  return (
    <>
      {/* オーバーレイ（タップで閉じる） */}
      <div className="fixed inset-0 z-20" onClick={onClose} />

      {/* ピッカー本体 — 上方向に展開（composerや下タブに隠れない） */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        className="absolute right-0 bottom-full mb-2 z-30 bg-white/95 backdrop-blur-xl rounded-2xl shadow-xl border border-white/60 p-3 min-w-[220px]"
      >
        <div className="text-[11px] text-gray-400 mb-2 font-medium">所要時間を変更</div>

        {/* プリセットボタン */}
        <div className="flex flex-wrap gap-1.5 mb-2">
          {DURATION_OPTIONS.map((min) => (
            <button
              key={min}
              onClick={() => {
                onSelect(min);
                onClose();
              }}
              className={`px-3 py-1.5 rounded-full text-[12px] font-medium transition-all ${
                min === current
                  ? "bg-purple-100 text-purple-700 border border-purple-300/60 shadow-sm"
                  : "bg-gray-50 text-gray-600 border border-gray-200/50 hover:bg-purple-50 active:bg-purple-100"
              }`}
            >
              {formatDuration(min)}
            </button>
          ))}
        </div>

        {/* カスタム入力 */}
        {customMode ? (
          <div className="flex items-center gap-2 mt-1">
            <input
              type="number"
              min={5}
              max={480}
              step={5}
              value={customValue}
              onChange={(e) => setCustomValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const val = parseInt(customValue, 10);
                  if (val >= 5 && val <= 480) {
                    onSelect(val);
                    onClose();
                  }
                }
              }}
              autoFocus
              className="w-16 px-2 py-1 rounded-lg border border-purple-200 text-[12px] text-center focus:outline-none focus:border-purple-400"
            />
            <span className="text-[11px] text-gray-400">分</span>
            <button
              onClick={() => {
                const val = parseInt(customValue, 10);
                if (val >= 5 && val <= 480) {
                  onSelect(val);
                  onClose();
                }
              }}
              className="px-2.5 py-1 rounded-lg bg-purple-500 text-white text-[11px] font-medium"
            >
              決定
            </button>
          </div>
        ) : (
          <button
            onClick={() => setCustomMode(true)}
            className="text-[11px] text-purple-500 hover:text-purple-700 mt-1"
          >
            カスタム時間を入力 →
          </button>
        )}
      </motion.div>
    </>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 開始時刻編集ポップオーバー
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function StartTimePicker({
  current,
  onSelect,
  onClose,
}: {
  current: string | undefined;
  onSelect: (time: string) => void;
  onClose: () => void;
}) {
  const [hours, setHours] = useState(() => {
    if (!current) return 9;
    return parseInt(current.split(":")[0], 10);
  });
  const [minutes, setMinutes] = useState(() => {
    if (!current) return 0;
    return parseInt(current.split(":")[1], 10);
  });

  const handleConfirm = () => {
    const time = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    onSelect(time);
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 z-20" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        className="absolute left-0 bottom-full mb-2 z-30 bg-white/95 backdrop-blur-xl rounded-2xl shadow-xl border border-white/60 p-3 min-w-[180px]"
      >
        <div className="text-[11px] text-gray-400 mb-2 font-medium">開始時刻を変更</div>
        <div className="flex items-center gap-2 justify-center">
          <select
            value={hours}
            onChange={(e) => setHours(parseInt(e.target.value, 10))}
            className="px-2 py-1.5 rounded-lg border border-purple-200 text-[13px] focus:outline-none focus:border-purple-400 bg-white"
          >
            {Array.from({ length: 24 }, (_, i) => (
              <option key={i} value={i}>{String(i).padStart(2, "0")}</option>
            ))}
          </select>
          <span className="text-gray-400 text-[14px] font-bold">:</span>
          <select
            value={minutes}
            onChange={(e) => setMinutes(parseInt(e.target.value, 10))}
            className="px-2 py-1.5 rounded-lg border border-purple-200 text-[13px] focus:outline-none focus:border-purple-400 bg-white"
          >
            {[0, 15, 30, 45].map((m) => (
              <option key={m} value={m}>{String(m).padStart(2, "0")}</option>
            ))}
          </select>
          <button
            onClick={handleConfirm}
            className="px-3 py-1.5 rounded-lg bg-purple-500 text-white text-[12px] font-medium"
          >
            決定
          </button>
        </div>
      </motion.div>
    </>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// プランアイテム行
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function PlanItemRow({
  item,
  onDurationChange,
  onStartTimeChange,
  onToggleComplete,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  confirmed,
}: {
  item: PlanItem;
  onDurationChange: (id: string, newDuration: number) => void;
  onStartTimeChange: (id: string, newTime: string) => void;
  onToggleComplete: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  confirmed: boolean;
}) {
  const [showDurationPicker, setShowDurationPicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  // ── 移動アイテム: 専用の軽量表示 ──
  if (item.kind === "travel") {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        className="flex items-center gap-3 py-1.5 px-3 rounded-lg"
      >
        {/* 確定後のスペーサー（チェックボックス幅に合わせる） */}
        {confirmed && <div className="w-5 flex-shrink-0" />}
        {/* 未確定: 並べ替えスペーサー */}
        {!confirmed && <div className="w-5 flex-shrink-0" />}

        {/* 時刻 */}
        <span className="text-[11px] text-gray-300 w-[42px] flex-shrink-0 font-mono">
          {item.startTime ?? "──"}
        </span>

        {/* 移動テキスト（絵文字込み） */}
        <span className="text-[11px] text-gray-400 flex-1 italic">
          {item.text}
        </span>

        {/* 移動時間 */}
        <span className="text-[10px] text-gray-300 flex-shrink-0">
          {formatDuration(item.durationMin)}
        </span>
      </motion.div>
    );
  }

  // ── 通常アイテム ──
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className={`flex items-center gap-2 py-2.5 px-3 rounded-xl transition-all ${
        item.completed
          ? "opacity-50"
          : item.kind === "fixed"
            ? "bg-purple-50/40"
            : "bg-white/30"
      }`}
    >
      {/* 完了チェック（確定後のみ） */}
      {confirmed && (
        <button
          onClick={() => onToggleComplete(item.id)}
          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all flex-shrink-0 ${
            item.completed
              ? "bg-purple-500 border-purple-500"
              : "border-gray-300 hover:border-purple-400"
          }`}
        >
          {item.completed && (
            <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
              <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" />
            </svg>
          )}
        </button>
      )}

      {/* 並べ替えボタン（未確定時のみ） */}
      {!confirmed && (
        <div className="flex flex-col gap-0 flex-shrink-0">
          <button
            onClick={() => canMoveUp && onMoveUp(item.id)}
            disabled={!canMoveUp}
            className={`text-[10px] leading-none p-0.5 ${canMoveUp ? "text-gray-400 hover:text-purple-500" : "text-gray-200"}`}
            title="上に移動"
          >
            ▲
          </button>
          <button
            onClick={() => canMoveDown && onMoveDown(item.id)}
            disabled={!canMoveDown}
            className={`text-[10px] leading-none p-0.5 ${canMoveDown ? "text-gray-400 hover:text-purple-500" : "text-gray-200"}`}
            title="下に移動"
          >
            ▼
          </button>
        </div>
      )}

      {/* 開始時刻（タップで変更） */}
      <div className="relative flex-shrink-0 w-[42px]">
        <button
          onClick={() => !confirmed && setShowTimePicker(!showTimePicker)}
          className={`text-[12px] font-mono w-full text-left ${
            confirmed
              ? "text-gray-400 cursor-default"
              : "text-gray-500 hover:text-purple-600 cursor-pointer"
          }`}
        >
          {item.startTime ?? "──"}
        </button>
        <AnimatePresence>
          {showTimePicker && (
            <StartTimePicker
              current={item.startTime}
              onSelect={(time) => onStartTimeChange(item.id, time)}
              onClose={() => setShowTimePicker(false)}
            />
          )}
        </AnimatePresence>
      </div>

      {/* 絵文字 */}
      <span className="text-[14px] flex-shrink-0">{getItemEmoji(item)}</span>

      {/* テキスト */}
      <span
        className={`text-[13px] flex-1 ${
          item.completed ? "line-through text-gray-400" : "text-gray-800"
        }`}
      >
        {item.text}
      </span>

      {/* 所要時間（タップで変更） */}
      <div className="relative flex-shrink-0">
        <button
          onClick={() => !confirmed && setShowDurationPicker(!showDurationPicker)}
          className={`text-[11px] px-2 py-0.5 rounded-full transition-all ${
            confirmed
              ? "text-gray-400 bg-gray-50/50 cursor-default"
              : "text-purple-600 bg-purple-50/60 border border-purple-200/40 hover:bg-purple-100/60 cursor-pointer"
          }`}
        >
          {formatDuration(item.durationMin)}
        </button>
        <AnimatePresence>
          {showDurationPicker && (
            <DurationPicker
              current={item.durationMin}
              onSelect={(min) => onDurationChange(item.id, min)}
              onClose={() => setShowDurationPicker(false)}
            />
          )}
        </AnimatePresence>
      </div>

      {/* 固定予定マーク */}
      {item.kind === "fixed" && item.eventType && (
        <span className="text-[10px] text-purple-400" title="固定予定">📌</span>
      )}
    </motion.div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// メインコンポーネント
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function MorningPlanCard({
  plan: initialPlan,
  personalizeHints,
  onConfirm,
  onRequestChange,
}: MorningPlanCardProps) {
  const [plan, setPlan] = useState(initialPlan);

  // Sync when parent passes a new plan (e.g. after planEditor edit)
  useEffect(() => {
    setPlan(initialPlan);
  }, [initialPlan]);

  const handleDurationChange = useCallback(
    (itemId: string, newDuration: number) => {
      setPlan((prev) => {
        // 1. 対象アイテムの duration を更新
        const updatedItems = prev.items.map((item) =>
          item.id === itemId ? { ...item, durationMin: newDuration } : item
        );
        // 2. 後続アイテムの startTime をカスケード再計算
        const cascaded = recalculateSchedule(updatedItems);

        // TaskDurationMemory に学習
        const item = prev.items.find((i) => i.id === itemId);
        if (item) {
          const store = loadDurationStore();
          const newStore = learnDuration(item.text, newDuration, store);
          saveDurationStore(newStore);
        }

        return { ...prev, items: cascaded };
      });
    },
    []
  );

  const handleStartTimeChange = useCallback(
    (itemId: string, newTime: string) => {
      setPlan((prev) => {
        const updatedItems = prev.items.map((item) =>
          item.id === itemId ? { ...item, startTime: newTime, kind: "fixed" as const, fixedStart: true } : item
        );
        const cascaded = recalculateSchedule(updatedItems);
        return { ...prev, items: cascaded };
      });
    },
    []
  );

  const handleMoveUp = useCallback((itemId: string) => {
    setPlan((prev) => {
      // travel 以外のアイテムのみ並べ替え対象
      const nonTravel = prev.items.filter(i => i.kind !== "travel");
      const travelItems = prev.items.filter(i => i.kind === "travel");
      const idx = nonTravel.findIndex(i => i.id === itemId);
      if (idx <= 0) return prev;
      // swap
      const reordered = [...nonTravel];
      [reordered[idx - 1], reordered[idx]] = [reordered[idx], reordered[idx - 1]];
      // travel items を含めて再計算
      const merged = [...reordered, ...travelItems];
      const cascaded = recalculateSchedule(merged);
      return { ...prev, items: cascaded };
    });
  }, []);

  const handleMoveDown = useCallback((itemId: string) => {
    setPlan((prev) => {
      const nonTravel = prev.items.filter(i => i.kind !== "travel");
      const travelItems = prev.items.filter(i => i.kind === "travel");
      const idx = nonTravel.findIndex(i => i.id === itemId);
      if (idx < 0 || idx >= nonTravel.length - 1) return prev;
      const reordered = [...nonTravel];
      [reordered[idx], reordered[idx + 1]] = [reordered[idx + 1], reordered[idx]];
      const merged = [...reordered, ...travelItems];
      const cascaded = recalculateSchedule(merged);
      return { ...prev, items: cascaded };
    });
  }, []);

  const handleToggleComplete = useCallback((itemId: string) => {
    setPlan((prev) => ({
      ...prev,
      items: prev.items.map((item) =>
        item.id === itemId ? { ...item, completed: !item.completed } : item
      ),
    }));
  }, []);

  const handleConfirm = useCallback(() => {
    const confirmed = { ...plan, confirmed: true };
    setPlan(confirmed);
    onConfirm(confirmed);
  }, [plan, onConfirm]);

  // 合計所要時間（移動・活動を分離）
  const totalMinutes = plan.items.reduce((sum, i) => sum + i.durationMin, 0);
  const travelMinutes = plan.items
    .filter((i) => i.kind === "travel")
    .reduce((sum, i) => sum + i.durationMin, 0);
  const hasTravelItems = travelMinutes > 0;

  return (
    <GlassCard className="mx-0 mt-3 mb-2">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[14px] font-semibold text-gray-800 flex items-center gap-1.5">
            {formatPlanDateLabel(plan.date)}
          </h3>
          <span className="text-[11px] text-gray-400">
            合計 {formatDuration(totalMinutes)}
            {hasTravelItems && (
              <span className="text-[10px] ml-1">
                (移動{formatDuration(travelMinutes)})
              </span>
            )}
          </span>
        </div>

        {/* 場所 & フロー情報 */}
        {(plan.mainLocation || plan.flowContext) && (
          <div className="flex flex-wrap gap-1.5 mb-2.5">
            {plan.mainLocation && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50/60 text-blue-600 text-[11px] border border-blue-100/50">
                📍 {plan.mainLocation.label}
              </span>
            )}
            {plan.flowContext?.goOut === true && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50/60 text-green-600 text-[11px] border border-green-100/50">
                🚶 外出
              </span>
            )}
            {plan.flowContext?.goOut === false && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50/60 text-amber-600 text-[11px] border border-amber-100/50">
                🏠 在宅
              </span>
            )}
            {plan.flowContext?.durationHint === "all_day" && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-50/60 text-purple-600 text-[11px] border border-purple-100/50">
                📅 終日
              </span>
            )}
          </div>
        )}

        {/* パーソナライズヒント（最大2件: タスク学習 + プロアクティブ提案） */}
        {personalizeHints && personalizeHints.length > 0 && !plan.confirmed && (
          <div className="space-y-1 mb-2 px-1">
            {personalizeHints.slice(0, 2).map((hint, i) => (
              <div key={i} className="text-[11px] text-purple-500/80">
                💡 {hint}
              </div>
            ))}
          </div>
        )}

        {/* アイテムリスト */}
        <div className="space-y-0.5">
          {plan.items.map((item) => {
            // 並べ替え対象: travel 以外
            const nonTravel = plan.items.filter(i => i.kind !== "travel");
            const ntIdx = nonTravel.findIndex(i => i.id === item.id);
            return (
              <PlanItemRow
                key={item.id}
                item={item}
                onDurationChange={handleDurationChange}
                onStartTimeChange={handleStartTimeChange}
                onToggleComplete={handleToggleComplete}
                onMoveUp={handleMoveUp}
                onMoveDown={handleMoveDown}
                canMoveUp={item.kind !== "travel" && ntIdx > 0}
                canMoveDown={item.kind !== "travel" && ntIdx < nonTravel.length - 1}
                confirmed={plan.confirmed}
              />
            );
          })}
        </div>

        {/* アクションボタン */}
        {!plan.confirmed && (
          <div className="flex gap-2 mt-4">
            <button
              onClick={handleConfirm}
              className="flex-1 py-2 rounded-xl bg-purple-500/90 text-white text-[13px] font-medium hover:bg-purple-600/90 transition-all"
            >
              これでいく
            </button>
            <button
              onClick={onRequestChange}
              className="px-4 py-2 rounded-xl bg-white/50 text-gray-600 text-[13px] border border-gray-200/50 hover:bg-white/70 transition-all"
            >
              変更する
            </button>
          </div>
        )}

        {/* 確定後の状態表示 */}
        {plan.confirmed && (
          <div className="mt-3 text-center">
            <span className="text-[11px] text-purple-500/70">
              ✨ プラン確定済み — タスクをタップで完了
            </span>
          </div>
        )}
      </motion.div>
    </GlassCard>
  );
}
