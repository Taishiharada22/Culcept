"use client";

/**
 * MorningOutfitCard — プランに基づくコーデ提案カード
 *
 * Alter の会話内にインラインで表示される。
 * - 5スロット縦並び（accessory / outer / top / bottom / shoes）
 * - 各スロットでスワイプして候補を切り替え
 * - Intent バッジ表示
 * - SYNC スコアはスワイプごとにリアルタイム再計算
 * - 選択状態は日付キーで localStorage に永続化
 * - ワードローブ未登録時は My-Style への案内
 */

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassCard } from "@/components/ui/glassmorphism-design";
import type { MorningPlan } from "@/lib/alter-morning/types";
import {
  generateOutfitFromPlan,
  detectOutfitInvalidation,
  refreshReasonLabel,
  toWeatherDaily,
  type OutfitBridgeResult,
  type OutfitInvalidation,
} from "@/lib/alter-morning/outfitBridge";
import type { WardrobeItem } from "@/app/(immersive)/my-style/_lib/types";
import type { Slot } from "@/app/(culcept)/calendar/_lib/vcTypes";
import type { ScoredCandidate } from "@/app/(culcept)/calendar/_lib/vcCandidates";
import { computeSyncScore } from "@/lib/shared/outfitEngine/syncScoring";
import { saveWearEvent } from "@/lib/shared/wearEvents";
import { loadWardrobeFromLocal, loadWardrobeWithFallback } from "@/lib/shared/wardrobe";
import { getDateContext } from "./MorningPlanCard";
import Image, { type ImageLoader } from "next/image";

const passthroughLoader: ImageLoader = ({ src }) => src;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Props
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface MorningOutfitCardProps {
  plan: MorningPlan;
  weather?: {
    tempMax: number | null;
    tempMin: number | null;
    condition: "sunny" | "cloudy" | "rain" | "snow";
    pop: number | null;
  };
  /** コーデ確定後のコールバック — 親がカードを退避させるために使う */
  onCommit?: () => void;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// スロット表示名・順序
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const SLOT_LABELS: Record<Slot, string> = {
  accessory: "小物",
  outer: "アウター",
  top: "トップス",
  bottom: "ボトムス",
  shoes: "シューズ",
};

const SLOT_ORDER: Slot[] = ["accessory", "outer", "top", "bottom", "shoes"];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Draft 選択の永続化（日付単位）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type SlotSelections = Partial<Record<Slot, string>>; // slot → item.id

const DRAFT_STORAGE_PREFIX = "culcept_outfit_draft_";

function loadDraftSelections(date: string): SlotSelections {
  try {
    const raw = localStorage.getItem(`${DRAFT_STORAGE_PREFIX}${date}`);
    if (!raw) return {};
    return JSON.parse(raw) as SlotSelections;
  } catch {
    return {};
  }
}

function saveDraftSelections(date: string, selections: SlotSelections): void {
  try {
    localStorage.setItem(`${DRAFT_STORAGE_PREFIX}${date}`, JSON.stringify(selections));
  } catch { /* quota exceeded — non-critical */ }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Committed 選択の永続化（日付単位）— draft とは別管理
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface CommittedOutfit {
  selections: SlotSelections;
  syncTotal: number;
  committedAt: string;
}

const COMMITTED_STORAGE_PREFIX = "culcept_outfit_committed_";

function loadCommittedOutfit(date: string): CommittedOutfit | null {
  try {
    const raw = localStorage.getItem(`${COMMITTED_STORAGE_PREFIX}${date}`);
    if (!raw) return null;
    return JSON.parse(raw) as CommittedOutfit;
  } catch {
    return null;
  }
}

function saveCommittedOutfit(date: string, outfit: CommittedOutfit): void {
  try {
    localStorage.setItem(`${COMMITTED_STORAGE_PREFIX}${date}`, JSON.stringify(outfit));
  } catch { /* non-critical */ }
}

/** 候補配列から item.id に一致するインデックスを探す。見つからなければ 0 */
function findIndexByItemId(candidates: ScoredCandidate[], itemId: string | undefined): number {
  if (!itemId) return 0;
  const idx = candidates.findIndex((c) => c.item.id === itemId);
  return idx >= 0 ? idx : 0;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ミニスロットレーン（コンパクト版）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function MiniSlotLane({
  slot,
  candidates,
  initialItemId,
  onSelect,
}: {
  slot: Slot;
  candidates: ScoredCandidate[];
  initialItemId?: string;
  onSelect: (slot: Slot, itemId: string) => void;
}) {
  const [index, setIndex] = useState(() => findIndexByItemId(candidates, initialItemId));

  // initialItemId が変わったら（例：リストア時）インデックスを再計算
  useEffect(() => {
    setIndex(findIndexByItemId(candidates, initialItemId));
  }, [initialItemId, candidates]);

  if (candidates.length === 0) {
    return (
      <div className="flex items-center gap-2 py-1.5">
        <span className="text-[11px] text-gray-400 w-[52px] flex-shrink-0">
          {SLOT_LABELS[slot]}
        </span>
        <div className="flex-1 h-[64px] rounded-lg bg-gray-50/50 flex items-center justify-center text-[11px] text-gray-300">
          候補なし
        </div>
      </div>
    );
  }

  const current = candidates[index].item;
  const goLeft = () => {
    const next = Math.max(0, index - 1);
    setIndex(next);
    onSelect(slot, candidates[next].item.id);
  };
  const goRight = () => {
    const next = Math.min(candidates.length - 1, index + 1);
    setIndex(next);
    onSelect(slot, candidates[next].item.id);
  };

  return (
    <div className="flex items-center gap-2 py-1">
      {/* スロットラベル */}
      <span className="text-[11px] text-gray-400 w-[52px] flex-shrink-0 text-right">
        {SLOT_LABELS[slot]}
      </span>

      {/* アイテムカード */}
      <div className="relative flex-1">
        <div className="flex items-center gap-1.5">
          {/* 左矢印 */}
          {candidates.length > 1 && (
            <button
              onClick={goLeft}
              disabled={index === 0}
              className="w-5 h-5 rounded-full bg-white/70 shadow-sm flex items-center justify-center text-[10px] text-gray-400 disabled:opacity-30 flex-shrink-0"
            >
              ‹
            </button>
          )}

          {/* メインカード */}
          <AnimatePresence mode="wait">
            <motion.div
              key={current.id}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.15 }}
              className="flex items-center gap-2 flex-1 min-w-0 bg-white/60 rounded-lg px-2 py-1.5 border border-white/50"
            >
              {/* サムネイル */}
              <div className="w-[48px] h-[48px] rounded-md bg-gradient-to-br from-gray-50 to-gray-100/50 flex-shrink-0 overflow-hidden relative">
                {current.imageUrl ? (
                  <Image
                    loader={passthroughLoader}
                    src={current.imageUrl}
                    alt={current.name}
                    fill
                    className="object-contain p-1"
                    sizes="48px"
                    unoptimized
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-300 text-lg">
                    👕
                  </div>
                )}
              </div>

              {/* アイテム名 */}
              <div className="flex-1 min-w-0">
                <p className="text-[12px] text-gray-700 truncate">{current.name}</p>
                {current.colorName && (
                  <p className="text-[10px] text-gray-400">{current.colorName}</p>
                )}
              </div>

              {/* インデックス */}
              {candidates.length > 1 && (
                <span className="text-[9px] text-gray-300 flex-shrink-0">
                  {index + 1}/{candidates.length}
                </span>
              )}
            </motion.div>
          </AnimatePresence>

          {/* 右矢印 */}
          {candidates.length > 1 && (
            <button
              onClick={goRight}
              disabled={index === candidates.length - 1}
              className="w-5 h-5 rounded-full bg-white/70 shadow-sm flex items-center justify-center text-[10px] text-gray-400 disabled:opacity-30 flex-shrink-0"
            >
              ›
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// メインコンポーネント
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function MorningOutfitCard({
  plan,
  weather,
  onCommit,
}: MorningOutfitCardProps) {
  const [result, setResult] = useState<OutfitBridgeResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [staleInfo, setStaleInfo] = useState<OutfitInvalidation | null>(null);
  const generatedPlanRef = useRef<MorningPlan | null>(null);

  // 選択状態：日付ベースで永続化（item.id で保持）
  const [slotSelections, setSlotSelections] = useState<SlotSelections>(() => {
    // committed があればそれを初期値に使う（committed > draft の優先表示）
    const committed = loadCommittedOutfit(plan.date);
    if (committed) return committed.selections;
    return loadDraftSelections(plan.date);
  });

  // 確定状態
  const [committed, setCommitted] = useState<CommittedOutfit | null>(() =>
    loadCommittedOutfit(plan.date),
  );

  // 選択変更時に localStorage に保存 + committed を解除（再編集中）
  const handleSlotSelect = useCallback((slot: Slot, itemId: string) => {
    setSlotSelections((prev) => {
      const next = { ...prev, [slot]: itemId };
      saveDraftSelections(plan.date, next);
      return next;
    });
    // スワイプで変更 = 確定を解除して編集モードに戻す
    setCommitted(null);
  }, [plan.date]);

  /** コーデを（再）生成する */
  const generate = useCallback(() => {
    // 同期で localStorage を試す（高速パス）
    const localWardrobe = loadWardrobeFromLocal();
    if (localWardrobe.length > 0) {
      const bridgeResult = generateOutfitFromPlan(plan, localWardrobe, weather);
      setResult(bridgeResult);
      setLoading(false);
      setStaleInfo(null);
      generatedPlanRef.current = plan;
      return;
    }
    // localStorage が空 → IndexedDB / server フォールバック（非同期）
    void loadWardrobeWithFallback().then((wardrobe) => {
      const bridgeResult = generateOutfitFromPlan(plan, wardrobe, weather);
      setResult(bridgeResult);
      setLoading(false);
      setStaleInfo(null);
      generatedPlanRef.current = plan;
    });
  }, [plan, weather]);

  useEffect(() => {
    // 初回 or 天気変更 → 即生成
    if (!generatedPlanRef.current) {
      generate();
      return;
    }

    // プラン変更 → structured diff で invalidation 判定
    const invalidation = detectOutfitInvalidation(generatedPlanRef.current, plan);
    if (invalidation.needsRefresh) {
      // 自動再生成せず、ユーザーに確認を求める
      setStaleInfo(invalidation);
    }
    // outfit に影響しないプラン変更（text のみ等）→ 何もしない
  }, [plan, weather, generate]);

  // ── SYNC スコアをリアルタイム再計算（親の派生値）──
  const liveSync = useMemo(() => {
    if (!result) return null;
    // 現在の選択アイテムを組み立て
    const selectedItems: WardrobeItem[] = [];
    for (const slot of SLOT_ORDER) {
      const candidates = result.candidates[slot];
      if (candidates.length === 0) continue;
      const selectedId = slotSelections[slot];
      if (selectedId) {
        const found = candidates.find((c) => c.item.id === selectedId);
        if (found) { selectedItems.push(found.item); continue; }
      }
      // フォールバック: top 候補
      selectedItems.push(candidates[0].item);
    }
    if (selectedItems.length < 2) return result.syncScore; // 計算不能 → 元のスコアを維持

    const wd = toWeatherDaily(weather);
    const events = plan.items
      .filter((item) => item.eventType)
      .map((item) => ({ event_type: item.eventType ?? "other" }));
    const month = new Date().getMonth() + 1;
    return computeSyncScore(selectedItems, wd, events, month);
  }, [result, slotSelections, weather, plan.items]);

  // ── SYNC 変動の検出（アニメーション用）──
  const prevSyncRef = useRef<number | null>(null);
  const syncDelta = useMemo(() => {
    if (!liveSync || prevSyncRef.current === null) {
      prevSyncRef.current = liveSync?.total ?? null;
      return 0;
    }
    const delta = liveSync.total - prevSyncRef.current;
    prevSyncRef.current = liveSync.total;
    return delta;
  }, [liveSync]);

  // ── 「これで決まり」ハンドラ ──
  const handleCommit = useCallback(() => {
    if (!liveSync) return;
    const outfit: CommittedOutfit = {
      selections: slotSelections,
      syncTotal: liveSync.total,
      committedAt: new Date().toISOString(),
    };
    saveCommittedOutfit(plan.date, outfit);
    setCommitted(outfit);

    // wearEvent として記録（確定時のみ — draft は記録しない）
    const itemIds = Object.values(slotSelections).filter(Boolean) as string[];
    if (itemIds.length > 0) {
      saveWearEvent({
        date: plan.date,
        itemIds,
        source: "my-style",
        moodTag: "planned",
      });
    }

    // CEO方針: 成果物は Alter 画面に常設しない。
    // コミット後 1.5 秒で親に通知 → カードを退避させる。
    if (onCommit) {
      setTimeout(() => onCommit(), 1500);
    }
  }, [plan.date, slotSelections, liveSync, onCommit]);

  if (loading) {
    return (
      <GlassCard className="mx-0 mt-3 mb-2">
        <div className="flex items-center justify-center py-6">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            className="w-5 h-5 border-2 border-purple-300 border-t-transparent rounded-full"
          />
          <span className="ml-2 text-[12px] text-gray-400">コーデを考え中...</span>
        </div>
      </GlassCard>
    );
  }

  if (!result) {
    return null;
  }

  // ワードローブ未登録
  if (result.noWardrobe) {
    return (
      <GlassCard className="mx-0 mt-3 mb-2">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="text-center py-4">
            <p className="text-[13px] text-gray-600 mb-2">
              服を登録すると、予定に合わせたコーデを提案できるよ
            </p>
            <a
              href="/my-style"
              className="inline-block px-4 py-2 rounded-xl bg-purple-500/90 text-white text-[12px] font-medium hover:bg-purple-600/90 transition-all"
            >
              My Style で登録する
            </a>
          </div>

          {/* バッジだけ表示（今日求められるスタイル） */}
          {result.badges.length > 0 && (
            <div className="flex flex-wrap gap-1 justify-center mt-2 pb-1">
              {result.badges.map((badge, i) => (
                <span
                  key={i}
                  className="text-[10px] px-2 py-0.5 rounded-full bg-purple-50/80 text-purple-500 border border-purple-200/40"
                >
                  {badge.label}
                </span>
              ))}
            </div>
          )}
        </motion.div>
      </GlassCard>
    );
  }

  const dateCtx = getDateContext(plan.date);
  const outfitDateLabel = `${dateCtx.display}のコーデ`;
  const displaySync = liveSync ?? result.syncScore;

  return (
    <GlassCard className="mx-0 mt-3 mb-2">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[14px] font-semibold text-gray-800 flex items-center gap-1.5">
            👗 {outfitDateLabel}
            {committed && (
              <span className="text-[9px] text-emerald-500 font-medium bg-emerald-50/80 px-1.5 py-0.5 rounded-full">
                ✓
              </span>
            )}
          </h3>
          <a
            href="/calendar"
            className="text-[10px] text-purple-500 hover:text-purple-600"
          >
            詳しく見る →
          </a>
        </div>

        {/* プラン変更バナー */}
        {staleInfo && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="mb-2 p-2.5 rounded-lg bg-amber-50/80 border border-amber-200/60"
          >
            <p className="text-[11px] text-amber-700 font-medium mb-1">
              プランが変わりました
            </p>
            <div className="space-y-0.5 mb-2">
              {staleInfo.reasons.slice(0, 3).map((reason, i) => (
                <p key={i} className="text-[10px] text-amber-600">
                  ・{refreshReasonLabel(reason)}
                </p>
              ))}
              {staleInfo.reasons.length > 3 && (
                <p className="text-[10px] text-amber-500">
                  他 {staleInfo.reasons.length - 3} 件
                </p>
              )}
            </div>
            <button
              onClick={generate}
              className="w-full py-1.5 rounded-md bg-amber-500/90 text-white text-[11px] font-medium hover:bg-amber-600/90 transition-all"
            >
              コーデを更新する
            </button>
          </motion.div>
        )}

        {/* Intent バッジ */}
        {result.badges.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {result.badges.map((badge, i) => (
              <span
                key={i}
                className="text-[10px] px-2 py-0.5 rounded-full bg-purple-50/80 text-purple-500 border border-purple-200/40"
              >
                {badge.label}
              </span>
            ))}
          </div>
        )}

        {/* 5スロット */}
        <div className="space-y-0">
          {SLOT_ORDER.map((slot) => (
            <MiniSlotLane
              key={slot}
              slot={slot}
              candidates={result.candidates[slot]}
              initialItemId={slotSelections[slot]}
              onSelect={handleSlotSelect}
            />
          ))}
        </div>

        {/* SYNCスコア + 理由（リアルタイム更新） */}
        {displaySync && (
          <div className="mt-2 pt-2 border-t border-white/30">
            <div className="flex items-center gap-2">
              <motion.span
                key={displaySync.total}
                initial={{ scale: 1.2, opacity: 0.7 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.3 }}
                className={`text-[16px] font-bold ${
                  displaySync.band === "excellent" ? "text-emerald-600" :
                  displaySync.band === "good" ? "text-purple-600" :
                  displaySync.band === "caution" ? "text-amber-600" :
                  "text-red-500"
                }`}
              >
                SYNC {displaySync.total}
              </motion.span>
              <span className="text-[10px] text-gray-400">/ 100</span>
              {/* 変動インジケータ */}
              {syncDelta !== 0 && (
                <motion.span
                  initial={{ opacity: 0, y: syncDelta > 0 ? 4 : -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className={`text-[10px] font-bold ${syncDelta > 0 ? "text-emerald-500" : "text-red-400"}`}
                >
                  {syncDelta > 0 ? `+${syncDelta}` : syncDelta}
                </motion.span>
              )}
            </div>
            {displaySync.reasons.length > 0 && (
              <div className="mt-1 space-y-0.5">
                {displaySync.reasons.slice(0, 2).map((reason, i) => (
                  <p key={i} className="text-[10px] text-gray-500">{reason}</p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* コミットボタン or 確定バッジ */}
        <div className="mt-3">
          {committed ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-emerald-50/80 border border-emerald-200/40"
            >
              <span className="text-[12px] text-emerald-600 font-medium">✓ 決定済み</span>
              <span className="text-[10px] text-emerald-400">— スワイプで変更可</span>
            </motion.div>
          ) : (
            <button
              onClick={handleCommit}
              disabled={!liveSync}
              className="w-full py-2.5 rounded-xl bg-purple-500/90 text-white text-[13px] font-medium hover:bg-purple-600/90 active:scale-[0.98] transition-all disabled:opacity-40"
            >
              これで決まり 👗
            </button>
          )}
        </div>

        {/* フッター */}
        <div className="mt-1.5 text-center">
          <span className="text-[10px] text-gray-400">
            スワイプで候補を変更 ・ 詳細は Calendar で
          </span>
        </div>
      </motion.div>
    </GlassCard>
  );
}
