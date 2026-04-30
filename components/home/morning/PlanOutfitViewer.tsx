"use client";

/**
 * PlanOutfitViewer — 選択日の Plan + Outfit 一時表示パネル
 *
 * カレンダー入口から日付を選択した後に表示される。
 * Alter 会話とは完全に独立（chat history には混ぜない）。
 * × で閉じると Alter のみの画面に戻る。
 *
 * 表示優先順位: committed > draft > default candidates
 * プランが主体、コーデは従属。
 */

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassCard } from "@/components/ui/glassmorphism-design";
import { getDateContext } from "./MorningPlanCard";
import { loadWardrobeFromLocal, loadWardrobeWithFallback } from "@/lib/shared/wardrobe";
import type { WardrobeItem } from "@/app/(immersive)/my-style/_lib/types";

// ── ストレージキー ──

const PLAN_SESSION_KEY = "aneurasync_morning_session_v1";
const COMMITTED_PREFIX = "culcept_outfit_committed_";
const DRAFT_PREFIX = "culcept_outfit_draft_";

// ── 型 ──

interface PlanItem {
  id: string;
  text: string;
  startTime?: string;
  durationMin: number;
  kind: string;
}

interface RetrievedPlan {
  date: string;
  items: PlanItem[];
  confirmed: boolean;
}

interface CommittedOutfit {
  selections: Partial<Record<string, string>>; // slot → itemId
  syncTotal: number;
  committedAt: string;
}

// ── データ読み込み ──

function loadPlanForDate(date: string): RetrievedPlan | null {
  try {
    const raw = localStorage.getItem(PLAN_SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (session?.plan?.date !== date) return null;
    return {
      date: session.plan.date,
      items: Array.isArray(session.plan.items) ? session.plan.items : [],
      confirmed: !!session.plan.confirmed,
    };
  } catch { return null; }
}

function loadCommittedOutfit(date: string): CommittedOutfit | null {
  try {
    const raw = localStorage.getItem(`${COMMITTED_PREFIX}${date}`);
    if (!raw) return null;
    return JSON.parse(raw) as CommittedOutfit;
  } catch { return null; }
}

function loadDraftSelections(date: string): Partial<Record<string, string>> | null {
  try {
    const raw = localStorage.getItem(`${DRAFT_PREFIX}${date}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

// ── コンポーネント ──

interface PlanOutfitViewerProps {
  selectedDate: string;
  onClose: () => void;
  onAskAlter?: (date: string) => void;
}

export default function PlanOutfitViewer({ selectedDate, onClose, onAskAlter }: PlanOutfitViewerProps) {
  const dateCtx = getDateContext(selectedDate);
  const dateLabel = `${dateCtx.display}（${getDow(selectedDate)}）`;

  // プランデータ（毎回 mount 時に読み直す — useMemo は閉→開で stale になる）
  const [plan, setPlan] = useState<RetrievedPlan | null>(null);
  const [committedOutfit, setCommittedOutfit] = useState<CommittedOutfit | null>(null);
  const [draftSelections, setDraftSelections] = useState<Partial<Record<string, string>> | null>(null);

  useEffect(() => {
    setPlan(loadPlanForDate(selectedDate));
    setCommittedOutfit(loadCommittedOutfit(selectedDate));
    setDraftSelections(loadDraftSelections(selectedDate));
  }, [selectedDate]);

  const outfitSelections = committedOutfit?.selections ?? draftSelections;
  const isCommitted = !!committedOutfit;

  // ワードローブからアイテム名を解決
  const [wardrobeMap, setWardrobeMap] = useState<Map<string, WardrobeItem>>(new Map());
  useEffect(() => {
    const local = loadWardrobeFromLocal();
    if (local.length > 0) {
      setWardrobeMap(new Map(local.map((item) => [item.id, item])));
      return;
    }
    void loadWardrobeWithFallback().then((items) => {
      setWardrobeMap(new Map(items.map((item) => [item.id, item])));
    });
  }, []);

  // 選択アイテムのリスト
  const selectedItems = useMemo(() => {
    if (!outfitSelections) return [];
    return Object.entries(outfitSelections)
      .filter(([, itemId]) => itemId)
      .map(([slot, itemId]) => ({
        slot,
        item: wardrobeMap.get(itemId!),
        itemId: itemId!,
      }))
      .filter((entry) => entry.item);
  }, [outfitSelections, wardrobeMap]);

  const hasPlan = plan && plan.items.length > 0;
  const hasOutfit = selectedItems.length > 0;
  const hasNothing = !hasPlan && !hasOutfit;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.2 }}
        className="mx-4 mb-3"
      >
        <GlassCard className="mx-0 relative">
          {/* ヘッダー */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-bold text-gray-800">
                📋 {dateLabel}
              </span>
              {isCommitted && (
                <span className="text-[9px] text-emerald-500 font-medium bg-emerald-50/80 px-1.5 py-0.5 rounded-full">
                  ✓ 確定
                </span>
              )}
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-full bg-gray-100/80 flex items-center justify-center text-gray-400 text-[14px] hover:bg-gray-200/80 transition-colors"
            >
              ×
            </button>
          </div>

          {/* プランセクション */}
          {hasPlan ? (
            <div className="mb-3">
              <p className="text-[10px] font-bold text-purple-500 mb-1.5 tracking-wide">
                🗓 プラン
                {plan.confirmed && <span className="ml-1 text-emerald-500">✓</span>}
              </p>
              <div className="space-y-1">
                {plan.items.slice(0, 6).map((item, i) => (
                  <div key={item.id || i} className="flex items-center gap-2 text-[11px]">
                    {item.startTime && (
                      <span className="text-gray-400 font-mono w-[36px] text-right flex-shrink-0">
                        {item.startTime}
                      </span>
                    )}
                    <span className="text-gray-700 truncate">{item.text}</span>
                    {item.durationMin > 0 && (
                      <span className="text-[9px] text-gray-300 flex-shrink-0">
                        {item.durationMin}分
                      </span>
                    )}
                  </div>
                ))}
                {plan.items.length > 6 && (
                  <p className="text-[10px] text-gray-400">他 {plan.items.length - 6} 件</p>
                )}
              </div>
            </div>
          ) : (
            <div className="mb-3 py-2 text-center">
              <p className="text-[11px] text-gray-400">この日のプランはまだありません</p>
            </div>
          )}

          {/* コーデセクション */}
          {hasOutfit ? (
            <div className="mb-2">
              <div className="flex items-center gap-2 mb-1.5">
                <p className="text-[10px] font-bold text-purple-500 tracking-wide">
                  👗 コーデ
                </p>
                {committedOutfit && (
                  <span className="text-[9px] text-gray-400">
                    SYNC {committedOutfit.syncTotal}/100
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {selectedItems.map(({ slot, item }) => (
                  <div
                    key={slot}
                    className="flex items-center gap-1.5 bg-white/60 rounded-lg px-2 py-1 border border-white/50"
                  >
                    {item!.colorHex && (
                      <div
                        className="w-3 h-3 rounded-full border border-white/60 flex-shrink-0"
                        style={{ backgroundColor: item!.colorHex }}
                      />
                    )}
                    <span className="text-[10px] text-gray-600 truncate max-w-[80px]">
                      {item!.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="mb-2 py-1 text-center">
              <p className="text-[11px] text-gray-400">コーデ未選択</p>
            </div>
          )}

          {/* 何もない場合 */}
          {hasNothing && (
            <div className="py-3 text-center">
              <p className="text-[12px] text-gray-500">
                この日の予定やコーデはまだありません
              </p>
            </div>
          )}

          {/* Alter に相談する導線 */}
          {onAskAlter && (
            <button
              onClick={() => onAskAlter(selectedDate)}
              className="w-full mt-2 py-2 rounded-xl bg-purple-50/80 border border-purple-200/30 text-[11px] text-purple-500 font-medium hover:bg-purple-100/80 transition-all active:scale-[0.98]"
            >
              この日について Alter に相談する →
            </button>
          )}
        </GlassCard>
      </motion.div>
    </AnimatePresence>
  );
}

// ── ユーティリティ（重複回避） ──

const DOW_LABELS = ["日", "月", "火", "水", "木", "金", "土"];
function getDow(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return DOW_LABELS[date.getDay()];
}
