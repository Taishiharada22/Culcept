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
import { normalizePlanItem } from "@/lib/alter-morning/normalizedPlanItem";
import { PlaceDetailSheet } from "./PlaceDetailSheet";
import { formatStartEndLabel } from "./timeLabel";
import {
  learnDuration,
  loadDurationStore,
  saveDurationStore,
} from "@/lib/alter-morning/taskDurationMemory";
import { regenerateTravelForPlan } from "@/lib/alter-morning/planning/regenerateTravelForPlan";
import { trackTransportV2EditRegression } from "@/lib/stargazer/trackClient";
import {
  BriefcaseBusiness, MessageCircle, UtensilsCrossed, Coffee,
  Route, BookOpen, Dumbbell, Users, ClipboardList, House,
  Car, Footprints, Bus, TrainFront, PlaneTakeoff, Bike,
  HelpCircle,
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
  /**
   * W3-PR-10 canary — Alter session id 観測窓 join key。
   * AskHero から alterSessionId を流し込み、transport_v2_edit_regression の
   * metadata.session_id に載せる。未提供/null の場合は plan_date + user_id で近似 join。
   * 編集イベントを emit する以外には使用しない。
   */
  sessionId?: string | null;
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

/** plan.date → "today" | "tomorrow" | "specific" */
export function getDateContext(planDate: string): { kind: "today" | "tomorrow" | "specific"; display: string } {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const todayStr = jst.toISOString().slice(0, 10);
  const tomorrow = new Date(jst);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

  if (planDate === todayStr) return { kind: "today", display: "今日" };
  if (planDate === tomorrowStr) return { kind: "tomorrow", display: "明日" };
  const [, m, d] = planDate.split("-");
  return { kind: "specific", display: `${parseInt(m)}/${parseInt(d)}` };
}

const DATE_ICON: Record<string, string> = { today: "☀️", tomorrow: "🌙", specific: "📅" };

/** plan.date を今日/明日/日付 に変換する */
export function formatPlanDateLabel(planDate: string): string {
  const ctx = getDateContext(planDate);
  return `${DATE_ICON[ctx.kind]} ${ctx.display}のプラン`;
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
      {/* オーバーレイ（タップで閉じる）— PR-11 Step 2: 行 onClick への bubble 遮断 */}
      <div
        className="fixed inset-0 z-20"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      />

      {/* ピッカー本体 — 上方向に展開（composerや下タブに隠れない）
          PR-11 Step 2: 内側 button click が親行の onClick に bubble するのを遮断 */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        onClick={(e) => e.stopPropagation()}
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
      {/* オーバーレイ（タップで閉じる）— PR-11 Step 2: 行 onClick への bubble 遮断 */}
      <div
        className="fixed inset-0 z-20"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      />
      {/* ピッカー本体 — PR-11 Step 2: 内側の click が親行に bubble するのを遮断 */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        onClick={(e) => e.stopPropagation()}
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
  onPlaceClick,
  onSelectCandidate,
  onDismissCandidates,
  isDayBoundary,
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
  onPlaceClick: (item: PlanItem) => void;
  onSelectCandidate: (itemId: string, candidateIndex: number) => void;
  onDismissCandidates: (itemId: string) => void;
  /**
   * PR-11 Step 2b: 1日の開始点/終点（= 非 travel の先頭/末尾 index）に該当する時は
   * 時刻表示を開始–終了 range にしない。true の時は従来通り startTime 単一表示。
   * 判定は caller（MorningPlanCard）側で nonTravel index に基づき計算する。
   */
  isDayBoundary: boolean;
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
    const candidates = (item.proposedPlaceCandidates ?? []).slice(0, 3);
    const hasCandidates = candidates.length > 0 && !confirmed;
    return (
      <motion.div
        layout
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        className="rounded-xl border border-dashed border-purple-200/50 bg-purple-50/20"
      >
        {/* メイン行 */}
        <div className="flex items-center gap-2 py-2 px-3">
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
        </div>

        {/* 候補場所（1〜3件）— Block 2-(b) Phase 2 */}
        {hasCandidates && (
          <div className="px-3 pb-2.5 pt-0.5">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[9px] text-purple-400/70 uppercase tracking-wide">
                近くの候補
              </span>
              <button
                onClick={() => onDismissCandidates(item.id)}
                className="text-[9px] text-purple-300/70 hover:text-purple-500 transition-colors"
                title="候補を閉じる"
              >
                閉じる
              </button>
            </div>
            <div className="space-y-1">
              {candidates.map((c, idx) => (
                <button
                  key={`${c.placeId ?? c.name}-${idx}`}
                  onClick={() => onSelectCandidate(item.id, idx)}
                  className="w-full text-left px-2.5 py-2 rounded-lg bg-white/60 hover:bg-white/90 border border-purple-100/60 transition-all"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[12px] text-gray-800 font-medium truncate">
                      {c.name}
                    </span>
                    {c.distanceM !== undefined && (
                      <span className="text-[9px] text-purple-500/70 flex-shrink-0">
                        約{c.distanceM}m
                      </span>
                    )}
                  </div>
                  {c.address && (
                    <div className="text-[10px] text-gray-400 mt-0.5 truncate">
                      {c.address}
                    </div>
                  )}
                  {c.recommendReason && (
                    <div className="text-[10px] text-purple-500/80 mt-0.5 truncate">
                      {c.recommendReason}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </motion.div>
    );
  }

  // ── 通常アイテム ──
  //
  // W3-PR-8 Strict Confirmation（設計書 §5, §6.3）:
  //   - item を normalize（念押し）して slot sharpness + confirmationState を strict に扱う
  //   - slot を個別に描画。sharpness に応じて値 or 未確定ラベルを出す
  //   - confirmationState に応じて枠線 / チップを変える
  //
  //   UI 側では ?? fallback を禁止（設計書 §3.4）。item.location.label のような
  //   PlanItem 既存フィールド（sharpness 非依存）はそのまま参照して良い。
  const normalized = normalizePlanItem(item);
  const { confirmationState, whenSharpness, whereSharpness, whatSharpness } = normalized;
  const subKind = normalized.whereVagueSubKind;

  const category = resolvePlanCategory(item);
  const catConfig = CATEGORY_CONFIG[category];

  // 枠線・背景スタイル（設計書 §5.1-5.3）
  //   confirmed:    実線 + カテゴリ色（従来通り）
  //   provisional:  点線 + 薄色
  //   needs_answer: 濃い点線 + 薄い背景色 + (?) アイコン
  const containerClass =
    confirmationState === "needs_answer"
      ? "border-2 border-dashed border-purple-400/70 bg-purple-50/40"
      : confirmationState === "provisional"
        ? "border border-dashed border-gray-300/60 bg-gray-50/30"
        : `border ${catConfig.bg} ${catConfig.border}`;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className={`rounded-xl transition-all ${
        item.completed ? "opacity-50 bg-gray-50/30 border-transparent" : containerClass
      }`}
    >
      {/* 確定度チップ（左上、confirmed は非表示） */}
      {!item.completed && confirmationState !== "confirmed" && (
        <div className="flex items-center gap-1 px-3 pt-1.5">
          {confirmationState === "needs_answer" ? (
            <span className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full bg-purple-100/80 text-purple-600 border border-purple-200/60">
              <HelpCircle size={9} strokeWidth={2.5} />
              確認中
            </span>
          ) : (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-gray-100/80 text-gray-500 border border-gray-200/60">
              暫定
            </span>
          )}
        </div>
      )}

      {/*
        行全体の tap で PlaceDetailSheet を開く（PR-11 Step 2）:
          - item.location?.label が在る時のみ onClick を有効化（空 location で sheet を開かない）
          - 既存の場所名 button (L659 付近) は keyboard/screen reader の primary trigger として維持
          - 内側の button/picker には stopPropagation を付与し多重発火/誤動作を防ぐ
          - a11y: 行 div には tabIndex/role=button を付与しない（既存 place button に任せ、
            tab 走査ノイズを避ける最小方針）
      */}
      <div
        className={`flex items-center gap-2 py-2.5 px-3 ${
          item.location?.label ? "cursor-pointer" : ""
        }`}
        onClick={() => {
          if (item.location?.label) onPlaceClick(item);
        }}
      >
        {/* 完了チェック（確定後のみ） */}
        {confirmed && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleComplete(item.id);
            }}
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
              onClick={(e) => {
                e.stopPropagation();
                if (canMoveUp) onMoveUp(item.id);
              }}
              disabled={!canMoveUp}
              className={`text-[10px] leading-none p-0.5 ${canMoveUp ? "text-gray-400 hover:text-purple-500" : "text-gray-200"}`}
              title="上に移動"
            >
              ▲
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (canMoveDown) onMoveDown(item.id);
              }}
              disabled={!canMoveDown}
              className={`text-[10px] leading-none p-0.5 ${canMoveDown ? "text-gray-400 hover:text-purple-500" : "text-gray-200"}`}
              title="下に移動"
            >
              ▼
            </button>
          </div>
        )}

        {/* 開始時刻 slot — whenSharpness で分岐
            PR-11 Step 2b: 通常行は開始–終了の range 表示。1日の開始点/終点
            （isDayBoundary=true）は従来通り単一時刻表示。 */}
        <div className="relative flex-shrink-0 min-w-[42px]">
          {whenSharpness === "fixed" ? (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (!confirmed) setShowTimePicker(!showTimePicker);
                }}
                className={`text-[12px] font-mono w-full text-left whitespace-nowrap ${
                  confirmed
                    ? "text-gray-400 cursor-default"
                    : "text-gray-500 hover:text-purple-600 cursor-pointer"
                }`}
                title="開始時刻を変更"
              >
                {formatStartEndLabel({
                  startTime: item.startTime,
                  durationMin: item.durationMin,
                  isDayBoundary,
                }) ?? item.startTime}
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
            </>
          ) : (
            // vague / missing — どちらも「時間未確定」ラベル（設計書 §6.3）
            <span className="text-[10px] text-gray-400 italic whitespace-nowrap" title="時間未確定">
              [時間未確定]
            </span>
          )}
        </div>

        {/* カテゴリアイコン */}
        <CategoryIcon item={item} size={15} />

        {/* 活動 / 場所 slot 群 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 flex-wrap">
            {/* What slot — whatSharpness で分岐（設計書 §5.2(d), §6.3）*/}
            {whatSharpness === "missing" ? (
              <span className="text-[10px] text-gray-400 italic" title="内容暫定">
                [内容暫定]
              </span>
            ) : (
              <>
                <span
                  className={`text-[13px] ${
                    item.completed ? "line-through text-gray-400" : "text-gray-800"
                  }`}
                >
                  {item.what ?? item.text}
                </span>
                {whatSharpness === "vague" && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-50/80 text-amber-700 border border-amber-200/60 flex-shrink-0">
                    内容暫定
                  </span>
                )}
              </>
            )}

            {/* Where slot — whereSharpness + vague sub-kind で分岐（設計書 §6.3）*/}
            {whereSharpness === "fixed" && item.location?.label ? (
              <>
                <span className="text-[12px] text-gray-300 mx-0.5">ー</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onPlaceClick(item);
                  }}
                  className={`text-[12px] underline decoration-dotted decoration-gray-300 underline-offset-2 transition-colors ${
                    item.completed
                      ? "text-gray-400"
                      : "text-gray-700 hover:text-purple-600"
                  }`}
                  title="場所の詳細を見る"
                >
                  {item.location.resolvedName ?? item.location.label}
                </button>
              </>
            ) : whereSharpness === "vague" ? (
              // vague は 3 sub-kind で描画を変える
              subKind === "undecided" ? (
                <>
                  <span className="text-[12px] text-gray-300 mx-0.5">ー</span>
                  <span className="text-[10px] text-gray-400 italic" title="場所未確定">
                    [場所未確定]
                  </span>
                </>
              ) : (
                // anchor / category_chain — 文言残す。category_chain は「店舗暫定」チップ併記。
                <>
                  <span className="text-[12px] text-gray-300 mx-0.5">ー</span>
                  <span
                    className={`text-[12px] ${
                      item.completed ? "text-gray-400" : "text-gray-700"
                    }`}
                  >
                    {item.location?.label ?? item.text}
                  </span>
                  {subKind === "category_chain" && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-50/80 text-amber-700 border border-amber-200/60 flex-shrink-0">
                      店舗暫定
                    </span>
                  )}
                </>
              )
            ) : whereSharpness === "missing" && item.location?.label ? (
              // sharpness=missing だが既存 location がある旧 session 互換
              <>
                <span className="text-[12px] text-gray-300 mx-0.5">ー</span>
                <span className={`text-[12px] ${item.completed ? "text-gray-400" : "text-gray-700"}`}>
                  {item.location.resolvedName ?? item.location.label}
                </span>
              </>
            ) : null}
          </div>

          {/* 住所（fixed 場所のみ表示） */}
          {whereSharpness === "fixed" && item.location?.address && (
            <div className="text-[10px] text-gray-400 mt-0.5 truncate pl-0">
              {item.location.address}
            </div>
          )}
          {/* 同伴者 */}
          {item.withWhom && (
            <div className="text-[10px] text-purple-400/80 mt-0.5 truncate">
              👤 {item.withWhom}
            </div>
          )}
          {whereSharpness === "fixed" &&
            item.location?.source === "user_inferred" &&
            !item.location?.address && (
              <div className="text-[10px] text-gray-300 mt-0.5">（同じ場所）</div>
            )}
        </div>

        {/* 所要時間（タップで変更） */}
        <div className="relative flex-shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (!confirmed) setShowDurationPicker(!showDurationPicker);
            }}
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
        {item.fixedStart && whenSharpness === "fixed" && (
          <span className="text-[9px] text-gray-300 flex-shrink-0" title="時刻固定">⏱</span>
        )}
      </div>
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
  sessionId,
}: MorningPlanCardProps) {
  const [plan, setPlan] = useState(initialPlan);
  // Place detail bottom sheet state（CEO方針 2026-04-17）
  const [placeSheetItem, setPlaceSheetItem] = useState<PlanItem | null>(null);
  const handlePlaceClick = useCallback((item: PlanItem) => {
    if (item.location) setPlaceSheetItem(item);
  }, []);

  // Sync when parent passes a new plan (e.g. after planEditor edit)
  useEffect(() => {
    setPlan(initialPlan);
  }, [initialPlan]);

  /** 並べ替え後に移動アイテムを再生成する（W3-PR-10 Phase 3A: canonical 対応）
   * 本体は `regenerateTravelForPlan`（pure fn）— canonical mode では travel を落として
   * server 側の次ターン rebuild に委ねる。詳細はヘルパーファイル参照。
   */
  const regenerateTravel = useCallback(
    (nonTravelItems: PlanItem[], prevPlan: MorningPlan): PlanItem[] =>
      regenerateTravelForPlan(nonTravelItems, prevPlan),
    [],
  );

  const handleDurationChange = useCallback(
    (itemId: string, newDuration: number) => {
      // W3-PR-10 canary — emit を setPlan の外で一度だけ fire するため
      // reducer 内では args だけ捕まえ、reducer 多重実行（strict mode dev など）では
      // 同じ値で上書きされるだけなので重複 emit にならない。
      let emitArgs: Parameters<typeof trackTransportV2EditRegression>[0] | null = null;
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

        emitArgs = {
          canonical_present: prev.transportSegments !== undefined,
          transport_segments_count: prev.transportSegments?.length ?? 0,
          travel_items_before: prev.items.filter((i) => i.kind === "travel").length,
          travel_items_after: items.filter((i) => i.kind === "travel").length,
          edit_trigger: "duration_edit",
          session_id: sessionId ?? null,
          plan_date: prev.date,
        };

        return { ...prev, items };
      });
      if (emitArgs) trackTransportV2EditRegression(emitArgs);
    },
    [regenerateTravel, sessionId]
  );

  const handleStartTimeChange = useCallback(
    (itemId: string, newTime: string) => {
      let emitArgs: Parameters<typeof trackTransportV2EditRegression>[0] | null = null;
      setPlan((prev) => {
        // 時刻変更 → travel以外を更新 → 移動アイテムを再生成
        const nonTravel = prev.items.filter(i => i.kind !== "travel").map((item) =>
          item.id === itemId ? { ...item, startTime: newTime, kind: "fixed" as const, fixedStart: true } : item
        );
        const items = regenerateTravel(nonTravel, prev);
        emitArgs = {
          canonical_present: prev.transportSegments !== undefined,
          transport_segments_count: prev.transportSegments?.length ?? 0,
          travel_items_before: prev.items.filter((i) => i.kind === "travel").length,
          travel_items_after: items.filter((i) => i.kind === "travel").length,
          edit_trigger: "time_edit",
          session_id: sessionId ?? null,
          plan_date: prev.date,
        };
        return { ...prev, items };
      });
      if (emitArgs) trackTransportV2EditRegression(emitArgs);
    },
    [regenerateTravel, sessionId]
  );

  const handleMoveUp = useCallback((itemId: string) => {
    let emitArgs: Parameters<typeof trackTransportV2EditRegression>[0] | null = null;
    setPlan((prev) => {
      const nonTravel = prev.items.filter(i => i.kind !== "travel");
      const idx = nonTravel.findIndex(i => i.id === itemId);
      if (idx <= 0) return prev;
      const reordered = [...nonTravel];
      [reordered[idx - 1], reordered[idx]] = [reordered[idx], reordered[idx - 1]];
      // 移動アイテムを新しい順序で再生成
      const items = regenerateTravel(reordered, prev);
      emitArgs = {
        canonical_present: prev.transportSegments !== undefined,
        transport_segments_count: prev.transportSegments?.length ?? 0,
        travel_items_before: prev.items.filter((i) => i.kind === "travel").length,
        travel_items_after: items.filter((i) => i.kind === "travel").length,
        edit_trigger: "reorder",
        session_id: sessionId ?? null,
        plan_date: prev.date,
      };
      return { ...prev, items };
    });
    if (emitArgs) trackTransportV2EditRegression(emitArgs);
  }, [regenerateTravel, sessionId]);

  const handleMoveDown = useCallback((itemId: string) => {
    let emitArgs: Parameters<typeof trackTransportV2EditRegression>[0] | null = null;
    setPlan((prev) => {
      const nonTravel = prev.items.filter(i => i.kind !== "travel");
      const idx = nonTravel.findIndex(i => i.id === itemId);
      if (idx < 0 || idx >= nonTravel.length - 1) return prev;
      const reordered = [...nonTravel];
      [reordered[idx], reordered[idx + 1]] = [reordered[idx + 1], reordered[idx]];
      const items = regenerateTravel(reordered, prev);
      emitArgs = {
        canonical_present: prev.transportSegments !== undefined,
        transport_segments_count: prev.transportSegments?.length ?? 0,
        travel_items_before: prev.items.filter((i) => i.kind === "travel").length,
        travel_items_after: items.filter((i) => i.kind === "travel").length,
        edit_trigger: "reorder",
        session_id: sessionId ?? null,
        plan_date: prev.date,
      };
      return { ...prev, items };
    });
    if (emitArgs) trackTransportV2EditRegression(emitArgs);
  }, [regenerateTravel, sessionId]);

  const handleToggleComplete = useCallback((itemId: string) => {
    setPlan((prev) => ({
      ...prev,
      items: prev.items.map((item) =>
        item.id === itemId ? { ...item, completed: !item.completed } : item
      ),
    }));
  }, []);

  /**
   * Block 2-(b) Phase 2: 候補場所を選択して提案に確定させる。
   *
   * - proposedPlaceCandidates から指定インデックスの候補を取り出す
   * - MainLocation を構築（source: "alter_suggested"）
   * - item.location にセット、proposal=false、proposedPlaceCandidates をクリア
   * - recommendReason を引き継ぐ（bottom sheet で表示）
   * - 場所が追加されたので travel アイテムを再生成
   */
  const handleSelectCandidate = useCallback(
    (itemId: string, candidateIndex: number) => {
      let emitArgs: Parameters<typeof trackTransportV2EditRegression>[0] | null = null;
      setPlan((prev) => {
        const target = prev.items.find((i) => i.id === itemId);
        if (!target || !target.proposedPlaceCandidates) return prev;
        const candidate = target.proposedPlaceCandidates[candidateIndex];
        if (!candidate) return prev;

        const canonicalId = candidate.placeId
          ? `places:${candidate.placeId}`
          : `alter_suggested:${candidate.name}`;

        const location: MainLocation = {
          canonicalId,
          label: candidate.name,
          source: "alter_suggested",
          resolvedName: candidate.name,
          address: candidate.address,
          placeId: candidate.placeId,
          lat: candidate.lat,
          lng: candidate.lng,
        };

        // travel 以外を更新（対象アイテム: proposal を外し、場所をセット）
        const nonTravel = prev.items
          .filter((i) => i.kind !== "travel")
          .map((item) =>
            item.id === itemId
              ? {
                  ...item,
                  proposal: false as const,
                  proposalReason: undefined,
                  proposedPlaceCandidates: undefined,
                  location,
                  recommendReason: candidate.recommendReason,
                }
              : item
          );
        // 場所が変わったので travel を再生成
        const items = regenerateTravel(nonTravel, prev);
        emitArgs = {
          canonical_present: prev.transportSegments !== undefined,
          transport_segments_count: prev.transportSegments?.length ?? 0,
          travel_items_before: prev.items.filter((i) => i.kind === "travel").length,
          travel_items_after: items.filter((i) => i.kind === "travel").length,
          edit_trigger: "place_change",
          session_id: sessionId ?? null,
          plan_date: prev.date,
        };
        return { ...prev, items };
      });
      if (emitArgs) trackTransportV2EditRegression(emitArgs);
    },
    [regenerateTravel, sessionId]
  );

  /**
   * Block 2-(b) Phase 2: 候補場所を非表示にする。
   * 提案自体は残す（ユーザーは提案を受け入れるが場所だけ後で決めたいケース）。
   */
  const handleDismissCandidates = useCallback((itemId: string) => {
    setPlan((prev) => ({
      ...prev,
      items: prev.items.map((item) =>
        item.id === itemId
          ? { ...item, proposedPlaceCandidates: undefined }
          : item
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
          {(() => {
            // nonTravel 一覧は render pass 間で 1 回だけ算出（N^2 回避）。
            // plan.items は PR-11 render cycle 内で不変。
            const nonTravel = plan.items.filter((i) => i.kind !== "travel");
            const nonTravelLastIdx = nonTravel.length - 1;
            return plan.items.map((item) => {
              const ntIdx = nonTravel.findIndex((i) => i.id === item.id);
              // PR-11 Step 2b: 1日の開始点/終点（非 travel の先頭/末尾）は
              // 時刻 range の対象外。travel 行は自身の startTime 単一表示を維持
              // （専用 fork L375-404）のため、本 flag は normal item のみ意味を持つ。
              const isDayBoundary =
                item.kind !== "travel" &&
                (ntIdx === 0 || ntIdx === nonTravelLastIdx);
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
                  canMoveDown={
                    item.kind !== "travel" && !item.proposal && ntIdx < nonTravelLastIdx
                  }
                  confirmed={plan.confirmed}
                  onPlaceClick={handlePlaceClick}
                  onSelectCandidate={handleSelectCandidate}
                  onDismissCandidates={handleDismissCandidates}
                  isDayBoundary={isDayBoundary}
                />
              );
            });
          })()}
        </div>

        {/* 場所詳細 bottom sheet */}
        <PlaceDetailSheet
          open={placeSheetItem !== null}
          location={placeSheetItem?.location ?? null}
          recommendReason={placeSheetItem?.recommendReason}
          onClose={() => setPlaceSheetItem(null)}
        />

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
