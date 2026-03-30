"use client";

// EntryGate — 判断ベースの軽量エントリーUI
// 「今日、一番エネルギーを使った場面は？」選択肢式で2秒
// 観測密度に応じて応答の深さが連続的に変化する

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassCard, FadeInView } from "@/components/ui/glassmorphism-design";
import {
  type JudgmentCategory,
  JUDGMENT_CATEGORIES,
  JUDGMENT_CATEGORY_ORDER,
  suggestOrbitLayers,
  type EntryRecord,
} from "@/lib/origin/entryContract";
import {
  calculateObservationDensity,
  selectDepthResponse,
  type ObservationDensity,
  type DepthResponse,
} from "@/lib/origin/observationDensity";
import {
  fetchStargazerContext,
  type StargazerOriginContext,
} from "@/lib/origin/stargazerPipeline";
import type { DailyOrbitStore } from "@/lib/origin/dailyOrbit/types";
import { loadOrbitStore } from "@/lib/origin/dailyOrbit/store";
import { mergeEntryRecords, trimToWindow } from "@/lib/origin/entrySync";
import { trackOriginEvent } from "@/lib/origin/tracking";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type EntryGateProps = {
  onComplete: (entry: EntryRecord, suggestedLayers: string[]) => void;
  /** 今日のエントリーが既に存在する場合 */
  todayEntry?: EntryRecord | null;
  /** コンパクトモード — タスク一覧の下に配置する場合 */
  compact?: boolean;
};

// ---------------------------------------------------------------------------
// localStorage persistence for entries
// ---------------------------------------------------------------------------

const ENTRY_KEY = "origin_entry_records_v1";
const SYNC_TS_KEY = "origin_entry_sync_ts";

function loadEntryRecords(): EntryRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(ENTRY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveEntryRecordsToLocal(records: EntryRecord[]): void {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const trimmed = records.filter((r) => r.date >= cutoffStr);
  try {
    localStorage.setItem(ENTRY_KEY, JSON.stringify(trimmed));
  } catch { /* quota */ }
}

function saveEntryRecord(entry: EntryRecord): EntryRecord[] {
  const records = loadEntryRecords();
  const filtered = records.filter((r) => r.date !== entry.date);
  filtered.push(entry);
  saveEntryRecordsToLocal(filtered);
  // サーバーに非同期同期（fire-and-forget）
  syncEntryToServer(entry);
  return filtered;
}

export function getTodayEntry(): EntryRecord | null {
  const today = new Date().toISOString().slice(0, 10);
  const records = loadEntryRecords();
  return records.find((r) => r.date === today) ?? null;
}

// ---------------------------------------------------------------------------
// Server sync helpers
// ---------------------------------------------------------------------------

/** 単一エントリーをサーバーに同期（保存時に呼ぶ） */
function syncEntryToServer(entry: EntryRecord): void {
  fetch("/api/origin/entry-records", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ records: [entry] }),
  }).catch(() => { /* オフライン時は無視、次回同期で回収 */ });
}

/** 全レコードをサーバーに一括同期 */
function syncAllToServer(records: EntryRecord[]): void {
  if (records.length === 0) return;
  fetch("/api/origin/entry-records", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ records }),
  }).catch(() => {});
}

/**
 * サーバーからレコードを取得し、localStorage とマージ。
 * 同じ日は recordedAt が新しい方を採用。
 * 初回マウント時に1回だけ呼ぶ。
 */
async function pullAndMerge(): Promise<EntryRecord[]> {
  const local = loadEntryRecords();
  try {
    const res = await fetch("/api/origin/entry-records?days=90");
    if (!res.ok) return local;
    const json = await res.json();
    const server: EntryRecord[] = json.records ?? [];
    if (server.length === 0 && local.length > 0) {
      syncAllToServer(local);
      return local;
    }

    const { merged, toUpload, localUpdated } = mergeEntryRecords(local, server);

    if (localUpdated) {
      saveEntryRecordsToLocal(merged);
      trackOriginEvent("origin_sync_conflict", {
        localCount: local.length,
        serverCount: server.length,
        mergedCount: merged.length,
      });
    }
    if (toUpload.length > 0) {
      syncAllToServer(toUpload);
    }

    trackOriginEvent("origin_sync_completed", {
      uploaded: toUpload.length,
      localUpdated,
      total: merged.length,
    });
    localStorage.setItem(SYNC_TS_KEY, new Date().toISOString());
    return merged;
  } catch {
    return local;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function EntryGate({ onComplete, todayEntry, compact }: EntryGateProps) {
  const [phase, setPhase] = useState<"question" | "response" | "done">(
    todayEntry ? "done" : "question"
  );
  const [selected, setSelected] = useState<JudgmentCategory | null>(
    todayEntry?.category ?? null
  );
  const [stargazerCtx, setStargazerCtx] = useState<StargazerOriginContext | null>(null);
  const [orbitStore, setOrbitStore] = useState<DailyOrbitStore | null>(null);
  const [density, setDensity] = useState<ObservationDensity | null>(null);
  const [response, setResponse] = useState<DepthResponse | null>(null);
  const [showNote, setShowNote] = useState(false);
  const [note, setNote] = useState("");

  // 初回: Stargazer + OrbitStore + サーバー同期を並行実行
  useEffect(() => {
    fetchStargazerContext().then(setStargazerCtx);
    try {
      setOrbitStore(loadOrbitStore());
    } catch { /* fallback: null */ }
    // サーバーとの同期（マージ後に今日のエントリーを再チェック）
    pullAndMerge().then((merged) => {
      const today = new Date().toISOString().slice(0, 10);
      const entry = merged.find((r) => r.date === today);
      if (entry && phase === "question") {
        setSelected(entry.category);
        setPhase("done");
      }
    });
  }, []);

  // 観測密度を計算
  useEffect(() => {
    const d = calculateObservationDensity(
      orbitStore,
      stargazerCtx?.density ?? null,
    );
    setDensity(d);
  }, [orbitStore, stargazerCtx]);

  const handleSelect = useCallback((category: JudgmentCategory) => {
    setSelected(category);

    const today = new Date().toISOString().slice(0, 10);
    const entry: EntryRecord = {
      date: today,
      category,
      recordedAt: new Date().toISOString(),
    };

    // 応答を生成
    if (density) {
      const meta = JUDGMENT_CATEGORIES[category];
      const resp = selectDepthResponse(density, {
        judgmentCategory: category,
        categoryLabel: meta.label,
        stargazerTopAxes: stargazerCtx?.topAxes?.map((a) => ({
          key: a.key,
          label: a.label,
          score: a.score,
        })),
      });
      setResponse(resp);
    }

    // 少し間を置いてから応答を表示
    setTimeout(() => {
      setPhase("response");
    }, 300);

    // 保存 & 完了通知は応答表示後
    saveEntryRecord(entry);
    trackOriginEvent("origin_entry_recorded", {
      category,
      depthLevel: density?.depthLevel ?? "unknown",
      densityScore: density?.score ?? 0,
    });
    const suggestedLayers = suggestOrbitLayers(category);
    // onComplete は応答確認後に呼ぶ
    setTimeout(() => {
      onComplete(entry, suggestedLayers);
    }, 800);
  }, [density, stargazerCtx, onComplete]);

  const handleNoteSubmit = useCallback(() => {
    if (!selected || !note.trim()) return;
    const today = new Date().toISOString().slice(0, 10);
    const entry: EntryRecord = {
      date: today,
      category: selected,
      note: note.trim(),
      recordedAt: new Date().toISOString(),
    };
    saveEntryRecord(entry);
    setShowNote(false);
  }, [selected, note]);

  // 既にエントリー済みなら表示しない
  if (phase === "done" && todayEntry) return null;

  return (
    <AnimatePresence mode="wait">
      {phase === "question" && (
        <motion.div
          key="question"
          initial={{ opacity: 0, y: compact ? 8 : 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.4 }}
        >
          {compact ? (
            /* ── コンパクトモード: 横スクロール1行 ── */
            <div className="rounded-2xl border border-amber-200/40 bg-white/50 px-3 py-3 backdrop-blur-sm">
              <p className="mb-2 text-xs font-medium text-slate-500">
                ⚡ 今日、一番エネルギーを使った場面は？
              </p>
              <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
                {JUDGMENT_CATEGORY_ORDER.map((cat) => {
                  const meta = JUDGMENT_CATEGORIES[cat];
                  return (
                    <motion.button
                      key={cat}
                      onClick={() => handleSelect(cat)}
                      className="flex shrink-0 items-center gap-1 rounded-full border border-white/80 bg-white/70 px-3 py-1.5 text-xs text-slate-600 transition-all hover:bg-white hover:shadow-sm"
                      whileTap={{ scale: 0.95 }}
                    >
                      <span>{meta.emoji}</span>
                      <span>{meta.label}</span>
                    </motion.button>
                  );
                })}
              </div>
            </div>
          ) : (
            /* ── フルモード: 2列グリッド ── */
            <GlassCard variant="gradient" padding="md" className="mb-4">
              <h3 className="text-lg font-semibold text-slate-800 mb-1">
                今日、一番エネルギーを使った場面は？
              </h3>
              <p className="text-sm text-slate-500 mb-4">
                タップひとつで記録。あなたの判断パターンが見え始めます
              </p>

              <div className="grid grid-cols-2 gap-2">
                {JUDGMENT_CATEGORY_ORDER.map((cat) => {
                  const meta = JUDGMENT_CATEGORIES[cat];
                  return (
                    <motion.button
                      key={cat}
                      onClick={() => handleSelect(cat)}
                      className={`
                        flex items-center gap-2 px-3 py-3 rounded-2xl text-left
                        transition-all duration-200
                        ${cat === "nothing_special"
                          ? "col-span-2 bg-slate-50/80 border border-slate-200/60 hover:bg-slate-100/80"
                          : "bg-white/60 border border-white/80 hover:bg-white/80 hover:shadow-md"
                        }
                      `}
                      whileTap={{ scale: 0.97 }}
                    >
                      <span className="text-xl">{meta.emoji}</span>
                      <div>
                        <span className="text-sm font-medium text-slate-700">
                          {meta.label}
                        </span>
                        {cat !== "nothing_special" && (
                          <p className="text-xs text-slate-400 mt-0.5">
                            {meta.description}
                          </p>
                        )}
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </GlassCard>
          )}
        </motion.div>
      )}

      {phase === "response" && response && (
        <motion.div
          key="response"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {compact ? (
            /* ── コンパクト応答 ── */
            <div className="rounded-2xl border border-amber-200/40 bg-white/50 px-3 py-3 backdrop-blur-sm">
              <div className="flex items-start gap-2">
                <span className="text-lg">
                  {selected ? JUDGMENT_CATEGORIES[selected].emoji : "📝"}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-700 font-medium">
                    {response.acknowledgment}
                  </p>
                  {response.insight && (
                    <motion.p
                      className="text-xs text-slate-500 mt-1 leading-relaxed"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.6 }}
                    >
                      {response.insight}
                    </motion.p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* ── フル応答 ── */
            <GlassCard variant="default" padding="md" className="mb-4">
              <div className="flex items-start gap-3">
                <span className="text-2xl mt-0.5">
                  {selected ? JUDGMENT_CATEGORIES[selected].emoji : "📝"}
                </span>
                <div className="flex-1">
                  <p className="text-sm text-slate-700 font-medium">
                    {response.acknowledgment}
                  </p>

                  {response.insight && (
                    <motion.p
                      className="text-sm text-slate-600 mt-2 leading-relaxed"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.6 }}
                    >
                      {response.insight}
                    </motion.p>
                  )}

                  {response.nextPrompt && (
                    <motion.p
                      className="text-xs text-slate-400 mt-3 italic"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 1.0 }}
                    >
                      {response.nextPrompt}
                    </motion.p>
                  )}

                  {/* 一言メモ（オプション） */}
                  {!showNote && density && density.depthLevel !== "surface" && (
                    <motion.button
                      className="text-xs text-blue-500/70 mt-3 hover:text-blue-600 transition-colors"
                      onClick={() => setShowNote(true)}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 1.2 }}
                    >
                      一言メモを残す（任意）
                    </motion.button>
                  )}

                  {showNote && (
                    <motion.div
                      className="mt-3 flex gap-2"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                    >
                      <input
                        type="text"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="どんな場面だった？"
                        className="flex-1 text-sm px-3 py-2 rounded-xl bg-white/60 border border-slate-200/60 outline-none focus:border-blue-300 transition-colors"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleNoteSubmit();
                        }}
                      />
                      <button
                        onClick={handleNoteSubmit}
                        className="px-3 py-2 text-sm rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                      >
                        保存
                      </button>
                    </motion.div>
                  )}
                </div>
              </div>
            </GlassCard>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
