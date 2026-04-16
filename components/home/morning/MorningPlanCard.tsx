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
import { insertTravelItems } from "@/lib/alter-morning/travelTimeEngine";
import {
  BriefcaseBusiness, MessageCircle, UtensilsCrossed, Coffee,
  Route, BookOpen, Dumbbell, Users, ClipboardList, House,
  Car, Footprints, Bus, TrainFront, PlaneTakeoff, Bike,
} from "lucide-react";
import type { TransportMode } from "@/app/(culcept)/calendar/_lib/vcTypes";

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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// カテゴリシステム — アイコン + 色
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type PlanCategory = "work" | "meeting" | "meal" | "break" | "move" | "study" | "exercise" | "social" | "errand" | "home";

const CATEGORY_CONFIG: Record<PlanCategory, { icon: typeof BriefcaseBusiness; color: string; bg: string; border: string }> = {
  work:     { icon: BriefcaseBusiness, color: "text-blue-600",   bg: "bg-blue-50/60",   border: "border-blue-200/40" },
  meeting:  { icon: MessageCircle,     color: "text-purple-600", bg: "bg-purple-50/60", border: "border-purple-200/40" },
  meal:     { icon: UtensilsCrossed,   color: "text-orange-600", bg: "bg-orange-50/60", border: "border-orange-200/40" },
  break:    { icon: Coffee,            color: "text-green-600",  bg: "bg-green-50/60",  border: "border-green-200/40" },
  move:     { icon: Route,             color: "text-gray-500",   bg: "bg-gray-50/60",   border: "border-gray-200/40" },
  study:    { icon: BookOpen,          color: "text-indigo-600", bg: "bg-indigo-50/60", border: "border-indigo-200/40" },
  exercise: { icon: Dumbbell,          color: "text-red-500",    bg: "bg-red-50/60",    border: "border-red-200/40" },
  social:   { icon: Users,             color: "text-pink-600",   bg: "bg-pink-50/60",   border: "border-pink-200/40" },
  errand:   { icon: ClipboardList,     color: "text-amber-700",  bg: "bg-amber-50/60",  border: "border-amber-200/40" },
  home:     { icon: House,             color: "text-stone-600",  bg: "bg-stone-50/60",  border: "border-stone-200/40" },
};

/** ActivityCategory → PlanCategory マッピング */
function resolvePlanCategory(item: PlanItem): PlanCategory {
  const cat = item.activityCategory;
  if (!cat) {
    // eventType ベースのフォールバック
    if (item.eventType === "work" || item.eventType === "formal") return "work";
    if (item.eventType === "friends" || item.eventType === "date" || item.eventType === "party") return "social";
    if (item.eventType === "sports" || item.eventType === "outdoor") return "exercise";
    if (item.eventType === "errand") return "errand";
    if (item.eventType === "home") return "home";
    if (item.kind === "travel") return "move";
    // テキストベースのヒューリスティック
    const t = (item.text + (item.what ?? "")).toLowerCase();
    if (/打ち合わせ|ミーティング|meeting|商談|面談|会議|相談/.test(t)) return "meeting";
    if (/食事|ランチ|ディナー|朝食|昼食|夕食|ご飯/.test(t)) return "meal";
    if (/休憩|カフェ|一息|リラックス/.test(t)) return "break";
    if (/勉強|学習|読書|資格/.test(t)) return "study";
    if (/散歩|ジム|運動|ランニング|ヨガ|筋トレ/.test(t)) return "exercise";
    if (/買い物|病院|役所|銀行|美容/.test(t)) return "errand";
    if (/家|自宅|掃除|洗濯|料理/.test(t)) return "home";
    return "work"; // デフォルト
  }
  // ActivityCategory prefix → PlanCategory
  if (cat.startsWith("work_meeting")) return "meeting";
  if (cat.startsWith("work_")) return "work";
  if (cat.startsWith("study_")) return "study";
  if (cat.startsWith("exercise_")) return "exercise";
  if (cat.startsWith("social_meal") || cat.startsWith("social_drink")) return "meal";
  if (cat.startsWith("social_")) return "social";
  if (cat.startsWith("errand_")) return "errand";
  if (cat.startsWith("life_rest")) return "break";
  if (cat.startsWith("life_")) return "home";
  if (cat.startsWith("creative_")) return "work";
  if (cat === "entertainment") return "break";
  if (cat === "travel") return "move";
  return "work";
}

/** TransportMode → Lucide icon + 色 */
const TRANSPORT_ICON_MAP: Record<TransportMode, { icon: typeof Route; color: string }> = {
  car:        { icon: Car,           color: "text-blue-400" },
  walk:       { icon: Footprints,    color: "text-green-400" },
  bus:        { icon: Bus,           color: "text-orange-400" },
  train:      { icon: TrainFront,    color: "text-purple-400" },
  plane:      { icon: PlaneTakeoff,  color: "text-sky-400" },
  bicycle:    { icon: Bike,          color: "text-teal-400" },
  taxi:       { icon: Car,           color: "text-amber-400" },
  motorcycle: { icon: Bike,          color: "text-red-400" },
};

/** travelTransport に応じたアイコンを返す（fallback: Route） */
function TravelIcon({ transport, size = 12 }: { transport?: TransportMode; size?: number }) {
  const entry = transport ? TRANSPORT_ICON_MAP[transport] : undefined;
  const Icon = entry?.icon ?? Route;
  const color = entry?.color ?? "text-gray-400";
  return <Icon size={size} className={`${color} flex-shrink-0`} strokeWidth={2} />;
}

function CategoryIcon({ item, size = 14 }: { item: PlanItem; size?: number }) {
  const category = resolvePlanCategory(item);
  const config = CATEGORY_CONFIG[category];
  const Icon = config.icon;
  return <Icon size={size} className={`${config.color} flex-shrink-0`} strokeWidth={2} />;
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
        className="flex items-center gap-2 py-1 px-3 rounded-lg bg-gray-50/30"
      >
        {/* スペーサー（チェックボックス/並べ替え幅に合わせる） */}
        <div className="w-5 flex-shrink-0" />

        {/* 時刻 */}
        <span className="text-[11px] text-gray-300 w-[42px] flex-shrink-0 font-mono">
          {item.startTime ?? "──"}
        </span>

        {/* 移動手段アイコン */}
        <TravelIcon transport={item.travelTransport} />

        {/* 移動テキスト（先頭の絵文字プレフィックスを除去） */}
        <span className="text-[11px] text-gray-400 flex-1 italic">
          {item.text.replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F]+\s*/u, "")}
        </span>

        {/* 移動時間 */}
        <span className="text-[10px] text-gray-300 flex-shrink-0">
          {formatDuration(item.durationMin)}
        </span>
      </motion.div>
    );
  }

  // ── Alter提案アイテム: 淡い色 + 「提案」タグ ──
  if (item.proposal) {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        className="flex items-center gap-2 py-2 px-3 rounded-xl border border-dashed border-purple-200/50 bg-purple-50/20"
      >
        {/* スペーサー */}
        <div className="w-5 flex-shrink-0" />

        {/* 時刻 */}
        <span className="text-[11px] text-purple-300 w-[42px] flex-shrink-0 font-mono">
          {item.startTime ?? "──"}
        </span>

        {/* 提案タグ + テキスト */}
        <div className="flex-1 min-w-0 flex items-center gap-1.5">
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-purple-100/60 text-purple-500 border border-purple-200/40 flex-shrink-0">
            提案
          </span>
          <span className="text-[12px] text-purple-400/80 truncate">
            {item.text}
          </span>
        </div>

        {/* 理由 */}
        {item.proposalReason && (
          <span className="text-[9px] text-purple-300/70 flex-shrink-0 hidden sm:inline">
            {item.proposalReason}
          </span>
        )}

        {/* 時間 */}
        <span className="text-[10px] text-purple-300 flex-shrink-0">
          {formatDuration(item.durationMin)}
        </span>
      </motion.div>
    );
  }

  // ── 通常アイテム ──
  const category = resolvePlanCategory(item);
  const catConfig = CATEGORY_CONFIG[category];
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className={`flex items-center gap-2 py-2.5 px-3 rounded-xl transition-all border ${
        item.completed
          ? "opacity-50 bg-gray-50/30 border-transparent"
          : `${catConfig.bg} ${catConfig.border}`
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

      {/* カテゴリアイコン */}
      <CategoryIcon item={item} size={15} />

      {/* テキスト + 同伴者 + 場所（CEO 2026-04-17: 継承 location も表示） */}
      <div className="flex-1 min-w-0">
        <span
          className={`text-[13px] ${
            item.completed ? "line-through text-gray-400" : "text-gray-800"
          }`}
        >
          {item.text}
        </span>
        {item.withWhom && (
          <span className="block text-[10px] text-purple-400/80 mt-0.5 truncate">
            👤 {item.withWhom}
          </span>
        )}
        {/*
          item.text に既に場所が含まれている（例: "仕事(カフェ)"）場合は二重表示を避ける。
          含まれていなければ継承された location を明示する。
        */}
        {item.location?.label && !item.text.includes(item.location.label) && (
          <span className="block text-[10px] text-gray-400 mt-0.5 truncate">
            📍 {item.location.label}
            {item.location.source === "user_inferred" && (
              <span className="text-gray-300 ml-1">（同じ場所）</span>
            )}
          </span>
        )}
      </div>

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

      {/* 固定予定: 時計マーク（控えめ） */}
      {item.fixedStart && (
        <span className="text-[9px] text-gray-300 flex-shrink-0" title="時刻固定">⏱</span>
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

  /** 並べ替え後に移動アイテムをA→Bの新しい順序で再生成する */
  const regenerateTravel = useCallback((nonTravelItems: PlanItem[], prevPlan: MorningPlan): PlanItem[] => {
    // 既存の travel から transport を推定
    const existingTravel = prevPlan.items.find(i => i.kind === "travel");
    const transport = existingTravel?.travelTransport
      ?? prevPlan.flowContext?.transport
      ?? prevPlan.dayConditions?.mainTransport
      ?? "car";
    const goOut = prevPlan.flowContext?.goOut ?? nonTravelItems.some(i => i.location);
    // insertTravelItems で場所変化を検出し移動アイテムを挿入
    const withTravel = insertTravelItems(nonTravelItems, transport, goOut);
    // CEO P0: departure/arrival anchor を渡す（サーバーの reassignTimes と同一ロジック）
    return recalculateSchedule(withTravel, {
      departureTime: prevPlan.departureTime,
      arrivalTime: prevPlan.arrivalTime,
    });
  }, []);

  const handleDurationChange = useCallback(
    (itemId: string, newDuration: number) => {
      setPlan((prev) => {
        // 1. 対象アイテムの duration を更新（travel以外）
        const nonTravel = prev.items.filter(i => i.kind !== "travel").map((item) =>
          item.id === itemId ? { ...item, durationMin: newDuration } : item
        );
        // 2. 移動アイテムを再生成 + 時間カスケード
        const items = regenerateTravel(nonTravel, prev);

        // TaskDurationMemory に学習
        const item = prev.items.find((i) => i.id === itemId);
        if (item) {
          const store = loadDurationStore();
          const newStore = learnDuration(item.text, newDuration, store);
          saveDurationStore(newStore);
        }

        return { ...prev, items };
      });
    },
    [regenerateTravel]
  );

  const handleStartTimeChange = useCallback(
    (itemId: string, newTime: string) => {
      setPlan((prev) => {
        // 時刻変更 → travel以外を更新 → 移動アイテムを再生成
        const nonTravel = prev.items.filter(i => i.kind !== "travel").map((item) =>
          item.id === itemId ? { ...item, startTime: newTime, kind: "fixed" as const, fixedStart: true } : item
        );
        const items = regenerateTravel(nonTravel, prev);
        return { ...prev, items };
      });
    },
    [regenerateTravel]
  );

  const handleMoveUp = useCallback((itemId: string) => {
    setPlan((prev) => {
      const nonTravel = prev.items.filter(i => i.kind !== "travel");
      const idx = nonTravel.findIndex(i => i.id === itemId);
      if (idx <= 0) return prev;
      const reordered = [...nonTravel];
      [reordered[idx - 1], reordered[idx]] = [reordered[idx], reordered[idx - 1]];
      // 移動アイテムを新しい順序で再生成
      const items = regenerateTravel(reordered, prev);
      return { ...prev, items };
    });
  }, [regenerateTravel]);

  const handleMoveDown = useCallback((itemId: string) => {
    setPlan((prev) => {
      const nonTravel = prev.items.filter(i => i.kind !== "travel");
      const idx = nonTravel.findIndex(i => i.id === itemId);
      if (idx < 0 || idx >= nonTravel.length - 1) return prev;
      const reordered = [...nonTravel];
      [reordered[idx], reordered[idx + 1]] = [reordered[idx + 1], reordered[idx]];
      const items = regenerateTravel(reordered, prev);
      return { ...prev, items };
    });
  }, [regenerateTravel]);

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
                canMoveUp={item.kind !== "travel" && !item.proposal && ntIdx > 0}
                canMoveDown={item.kind !== "travel" && !item.proposal && ntIdx < nonTravel.length - 1}
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
