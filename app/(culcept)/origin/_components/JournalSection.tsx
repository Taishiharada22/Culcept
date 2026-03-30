"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { DailyOrbitStore, DailyOrbitEntry, OrbitTask, SurpriseObservation } from "@/lib/origin/dailyOrbit/types";
import {
  loadOrbitStoreWithSync,
  todayKey,
  getOrCreateEntry,
} from "@/lib/origin/dailyOrbit/store";
import { generateSurpriseObservation } from "@/lib/origin/dailyOrbit/retentionEngine";
import JournalDeepLayer from "./JournalDeepLayer";
import JournalPastList, { type JournalEntry } from "./JournalPastList";
import { generateJournalFeedback, generateEmotionTrend, type JournalFeedback } from "@/lib/origin/dailyOrbit/journalFeedback";
import { shouldPromptMemoryDive, type MemoryPrompt } from "@/lib/origin/dailyOrbit/memoryBridge";
import { getOnThisDay, type OnThisDayEntry } from "@/lib/origin/dailyOrbit/onThisDay";
import MarkdownToolbar from "./MarkdownToolbar";
import MarkdownRenderer from "./MarkdownRenderer";
import { useInnerWeather } from "@/hooks/useInnerWeather";

const EMOTION_TAGS = [
  "達成感", "集中できた", "穏やか", "楽しかった", "もやもや",
  "疲れた", "新鮮", "不安", "感謝", "孤独",
];

// IWSnapshot type removed — using shared useInnerWeather hook

function highlightSearchText(text: string, query?: string): React.ReactNode {
  if (!query) return text;
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const parts: React.ReactNode[] = [];
  let lastIdx = 0;
  let idx = lowerText.indexOf(lowerQuery, lastIdx);
  let key = 0;
  while (idx !== -1) {
    if (idx > lastIdx) parts.push(text.slice(lastIdx, idx));
    parts.push(
      <mark key={key++} className="rounded bg-amber-200/60 px-0.5">
        {text.slice(idx, idx + query.length)}
      </mark>,
    );
    lastIdx = idx + query.length;
    idx = lowerText.indexOf(lowerQuery, lastIdx);
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
  return parts.length > 0 ? <>{parts}</> : text;
}

function computeJournalStreak(pastEntries: JournalEntry[], today: string): number {
  const dates = new Set([today, ...pastEntries.map((e) => e.date)]);
  let streak = 0;
  const d = new Date(today + "T00:00:00");
  while (dates.has(d.toISOString().slice(0, 10))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

type Props = {
  onStartMemoryDive?: () => void;
  jumpToDate?: string | null;
  onJumpHandled?: () => void;
};

export default function JournalSection({ onStartMemoryDive, jumpToDate, onJumpHandled }: Props = {}) {
  const [store, setStore] = useState<DailyOrbitStore | null>(null);
  const [entry, setEntry] = useState<DailyOrbitEntry | null>(null);
  const [journalBody, setJournalBody] = useState("");
  const [emotionTags, setEmotionTags] = useState<string[]>([]);
  const [tomorrowNote, setTomorrowNote] = useState("");
  const [bodyMemo, setBodyMemo] = useState("");
  const [shadowText, setShadowText] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiDrafting, setAiDrafting] = useState(false);
  const innerWeather = useInnerWeather();
  const [pastEntries, setPastEntries] = useState<JournalEntry[]>([]);
  const [surprise, setSurprise] = useState<SurpriseObservation | null>(null);
  const [journalTitle, setJournalTitle] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const [memoryPrompt, setMemoryPrompt] = useState<MemoryPrompt | null>(null);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [onThisDayEntries, setOnThisDayEntries] = useState<OnThisDayEntry[]>([]);
  const [expandedOTD, setExpandedOTD] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [goDeeper, setGoDeeper] = useState<string[] | null>(null);
  const [goDeeperLoading, setGoDeeperLoading] = useState(false);
  const [autoWeather, setAutoWeather] = useState<{ temp?: number; description?: string; icon?: string } | null>(null);
  const [autoLocation, setAutoLocation] = useState<string | null>(null);
  const [wordCount, setWordCount] = useState(0);
  const [viewingEntry, setViewingEntry] = useState<JournalEntry | null>(null);
  const [viewingHighlight, setViewingHighlight] = useState<string | undefined>();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const today = todayKey();

  // Load store + journal + weather + onThisDay in parallel
  useEffect(() => {
    (async () => {
      const [loaded, journalData, weatherData, onThisDayData] = await Promise.all([
        loadOrbitStoreWithSync(),
        fetch("/api/origin/journal?days=30").then(r => r.json()).catch(() => null),
        fetch("/api/weather/current").then(r => r.json()).catch(() => null),
        getOnThisDay(today).catch(() => [] as OnThisDayEntry[]),
      ]);

      // Store
      if (loaded) {
        setStore(loaded);
        setEntry(getOrCreateEntry(loaded, today));
      }

      // Journal
      if (journalData?.ok && journalData.entries) {
        const todayEntry = journalData.entries.find((e: JournalEntry) => e.date === today);
        if (todayEntry) {
          setJournalBody(todayEntry.body || "");
          setEmotionTags(todayEntry.emotion_tags || []);
          setTomorrowNote(todayEntry.tomorrow_note || "");
          setBodyMemo(todayEntry.body_memo || "");
          setShadowText(todayEntry.shadow_text || "");
          setJournalTitle(todayEntry.title || "");
          const urls = todayEntry.photo_urls ?? (todayEntry.photo_url ? [todayEntry.photo_url] : []);
          setPhotoUrls(urls);
          setPhotoUrl(todayEntry.photo_url || null);
          setSaved(true);
        }
        setPastEntries(journalData.entries.filter((e: JournalEntry) => e.date !== today));
      }

      // Weather
      if (weatherData?.ok) {
        setAutoWeather({ temp: weatherData.temp, description: weatherData.description, icon: weatherData.icon });
      }

      // On This Day
      if (onThisDayData.length > 0) setOnThisDayEntries(onThisDayData);
    })();
  }, [today]);

  // Word count
  useEffect(() => {
    setWordCount(journalBody.trim() ? journalBody.trim().length : 0);
  }, [journalBody]);

  // Auto-fetch location (browser geolocation → reverse geocode) — separate due to permission dialog
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch(`/api/weather/location?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}`);
          const data = await res.json();
          if (data.ok && data.name) setAutoLocation(data.name);
        } catch { /* silent */ }
      },
      () => { /* permission denied — silent */ },
      { timeout: 5000 },
    );
  }, []);

  // Inner Weather: shared hook (useInnerWeather) — no duplicate fetch

  // Handle jumpToDate from CalendarView
  useEffect(() => {
    if (!jumpToDate || pastEntries.length === 0) return;
    const target = pastEntries.find((e) => e.date === jumpToDate);
    if (target) {
      setViewingEntry(target);
    }
    onJumpHandled?.();
  }, [jumpToDate, pastEntries, onJumpHandled]);

  // Completed tasks from today
  const completedTasks = useMemo(
    () => entry?.tasks.filter((t) => t.completed) ?? [],
    [entry],
  );
  const incompleteTasks = useMemo(
    () => entry?.tasks.filter((t) => !t.completed) ?? [],
    [entry],
  );

  // Toggle emotion tag
  const toggleTag = useCallback((tag: string) => {
    setEmotionTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }, []);

  // AI draft
  const generateAiDraft = useCallback(async () => {
    setAiDrafting(true);
    try {
      const res = await fetch("/api/origin/journal/ai-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          completedTasks: completedTasks.map((t) => ({ text: t.text, texture: t.texture })),
          innerWeather,
          emotionTags,
          date: today,
        }),
      });
      const data = await res.json();
      if (data.ok && data.draft) {
        setJournalBody(data.draft);
      }
    } catch { /* silent */ }
    setAiDrafting(false);
  }, [completedTasks, innerWeather, emotionTags, today]);

  // Save
  const saveJournal = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/origin/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: today,
          title: journalTitle,
          body: journalBody,
          emotion_tags: emotionTags,
          tomorrow_note: tomorrowNote || null,
          inner_weather_ref: innerWeather,
          completed_task_ids: completedTasks.map((t) => t.id),
          body_memo: bodyMemo || null,
          shadow_text: shadowText || null,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setSaveFeedback("保存に失敗しました。もう一度お試しください");
        setSaving(false);
        return;
      }
      if (data.ok) {
        setSaved(true);
        // Auto-generate title if not set and body is long enough
        if (!journalTitle && journalBody.trim().length >= 20) {
          fetch("/api/origin/journal/title", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ date: today, body: journalBody }),
          })
            .then((r) => r.json())
            .then((d) => { if (d.ok && d.title) setJournalTitle(d.title); })
            .catch(() => {});
        }
        // Journal → Profile feedback
        if (store) {
          try {
            // First-ever journal: special feedback
            if (pastEntries.length === 0) {
              setSaveFeedback("最初の記録。ここから取扱説明書が始まります");
            } else {
              // Emotion trend check
              const allTags = pastEntries.map((e) => e.emotion_tags ?? []);
              const emotionHint = generateEmotionTrend(allTags, emotionTags);
              if (emotionHint) {
                setSaveFeedback(emotionHint);
              } else {
                // General feedback (streak, milestone, etc.)
                const journalStreak = computeJournalStreak(pastEntries, today);
                const fb = generateJournalFeedback(store, today, emotionTags, pastEntries.length + 1, journalStreak);
                if (fb) setSaveFeedback(fb.text);
              }
            }
          } catch { /* silent */ }
        }
        // Memory bridge prompt (3+ days, max once per 3 days)
        if (store) {
          try {
            const mp = shouldPromptMemoryDive(emotionTags, journalBody, store);
            if (mp) setMemoryPrompt(mp);
          } catch { /* silent */ }
        }

        // Maybe generate surprise observation (25% chance)
        if (store && Math.random() < 0.25) {
          try {
            const obs = generateSurpriseObservation(store, today);
            if (obs) setSurprise(obs);
          } catch { /* silent */ }
        }
      }
    } catch {
      setSaveFeedback("保存に失敗しました。もう一度お試しください");
    }
    setSaving(false);
  }, [today, journalTitle, journalBody, emotionTags, tomorrowNote, innerWeather, completedTasks, bodyMemo, shadowText, store]);

  // Photo upload (supports multiple photos, max 5)
  const handlePhotoUpload = useCallback(async (file: File) => {
    if (photoUrls.length >= 5) return;
    setPhotoUploading(true);
    try {
      const formData = new FormData();
      formData.append("date", today);
      formData.append("photo", file);
      const res = await fetch("/api/origin/journal/photo", { method: "POST", body: formData });
      const data = await res.json();
      if (data.ok && data.photo_url) {
        setPhotoUrls((prev) => [...prev, data.photo_url]);
        setPhotoUrl(data.photo_url);
      }
    } catch { /* silent */ }
    setPhotoUploading(false);
  }, [today, photoUrls.length]);

  const handlePhotoRemove = useCallback(async (url?: string) => {
    const target = url ?? photoUrl;
    if (!target) return;
    try {
      await fetch(`/api/origin/journal/photo?date=${today}&url=${encodeURIComponent(target)}`, { method: "DELETE" });
      setPhotoUrls((prev) => prev.filter((u) => u !== target));
      if (target === photoUrl) setPhotoUrl(null);
    } catch { /* silent */ }
  }, [today, photoUrl]);

  // Go Deeper — AI follow-up questions
  const handleGoDeeper = useCallback(async () => {
    if (!journalBody || journalBody.trim().length < 10) return;
    setGoDeeperLoading(true);
    try {
      const res = await fetch("/api/origin/journal/go-deeper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: journalBody, emotion_tags: emotionTags, date: today }),
      });
      const data = await res.json();
      if (data.ok && data.questions) {
        setGoDeeper(data.questions);
      }
    } catch { /* silent */ }
    setGoDeeperLoading(false);
  }, [journalBody, emotionTags, today]);

  // Self forecast result
  const forecastResult = useMemo(() => {
    if (!entry?.selfForecast) return null;
    const actual = completedTasks.length;
    const predicted = entry.selfForecast.predictedCompletion;
    const total = entry.tasks.length;
    return { predicted, actual, total, note: entry.selfForecast.note };
  }, [entry, completedTasks]);

  const [showTaskSummary, setShowTaskSummary] = useState(false);

  return (
    <div className="mx-auto max-w-lg px-4 py-4">
      {/* ── Hero: 今日を残す ── */}
      <div className="mb-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-semibold" style={{ color: "#3a2a1a" }}>
            {new Date().toLocaleDateString("ja-JP", { month: "long", day: "numeric", weekday: "short" })}
          </h2>
          {innerWeather && (
            <span className="text-xs text-gray-400">
              {innerWeather.emoji} {innerWeather.label}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-gray-400">
          今日の自分を、ひとつ残す
        </p>
      </div>

      {/* ── Step 1: 今の気持ち（最低コスト入口） ── */}
      <div className="mb-4">
        <p className="mb-1.5 text-[11px] font-medium text-gray-500">💭 今の気持ちは？</p>
        <div className="flex flex-wrap gap-1.5">
          {EMOTION_TAGS.map((tag) => (
            <button
              key={tag}
              onClick={() => toggleTag(tag)}
              className={`rounded-full px-2.5 py-1.5 text-xs transition-all ${
                emotionTags.includes(tag)
                  ? "bg-violet-100 text-violet-600 shadow-sm"
                  : "bg-white/50 text-gray-400 hover:bg-white/70"
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* ── Step 2: ひとこと入力（タイトル兼ワンライナー） ── */}
      <input
        value={journalTitle}
        onChange={(e) => { setJournalTitle(e.target.value); setSaved(false); }}
        placeholder="今日いちばん残したいこと"
        className="mb-3 w-full rounded-2xl border border-amber-200/30 bg-white/60 px-4 py-3 text-sm font-medium text-gray-700 outline-none placeholder:text-gray-400 focus:border-amber-300/50 focus:bg-white/80 transition-all"
      />

      {/* ── Step 3: もっと書く（展開式テキストエリア） ── */}
      <div className="relative mb-3 rounded-2xl bg-white/60 shadow-sm backdrop-blur-sm overflow-hidden">
        {/* Toolbar — compact */}
        <div className="flex items-center justify-between border-b border-gray-100/80 px-3 py-1.5">
          <MarkdownToolbar
            textareaRef={textareaRef}
            onInsert={(v) => { setJournalBody(v); setSaved(false); }}
          />
          <div className="flex items-center gap-1.5">
            <button
              onClick={generateAiDraft}
              disabled={aiDrafting}
              className="rounded-md px-2 py-0.5 text-[10px] text-gray-400 transition-colors hover:bg-white/50 hover:text-gray-600 disabled:opacity-50"
            >
              {aiDrafting ? "..." : "✨ AI下書き"}
            </button>
            <button
              onClick={() => setShowPreview(!showPreview)}
              className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] transition-colors ${
                showPreview ? "bg-violet-100 text-violet-600" : "text-gray-400 hover:text-gray-600"
              }`}
            >
              {showPreview ? "編集" : "プレビュー"}
            </button>
          </div>
        </div>

        {showPreview ? (
          <div className="min-h-[80px] px-3 py-2">
            {journalBody ? (
              <MarkdownRenderer content={journalBody} />
            ) : (
              <p className="text-sm text-gray-400">プレビューする内容がありません</p>
            )}
          </div>
        ) : (
          <textarea
            ref={textareaRef}
            value={journalBody}
            onChange={(e) => { setJournalBody(e.target.value); setSaved(false); }}
            placeholder="もう少し書きたければここに。短くても、長くても"
            className="min-h-[80px] w-full resize-none bg-transparent px-3 py-2 text-sm text-gray-700 outline-none placeholder:text-gray-400"
            rows={3}
          />
        )}

        {/* Bottom metadata */}
        <div className="flex items-center gap-2 border-t border-gray-100/80 px-3 py-1.5 text-[10px] text-gray-400">
          <span>{wordCount}文字</span>
          {autoWeather && (
            <span>{autoWeather.icon ?? "🌤"} {autoWeather.temp != null ? `${autoWeather.temp}°` : ""} {autoWeather.description ?? ""}</span>
          )}
          {autoLocation && <span>📍 {autoLocation}</span>}
        </div>
      </div>

      {/* ── 明日へのメモ ── */}
      <div className="mb-3">
        <p className="mb-1 text-[11px] text-gray-400">📝 明日に残すこと（任意）</p>
        <input
          value={tomorrowNote}
          onChange={(e) => { setTomorrowNote(e.target.value); setSaved(false); }}
          placeholder="明日の自分へのメモ"
          className="w-full rounded-xl bg-white/50 px-3 py-2 text-xs text-gray-600 outline-none placeholder:text-gray-300"
        />
      </div>

      {/* ── 完了タスク（折りたたみ） ── */}
      {(completedTasks.length > 0 || incompleteTasks.length > 0) && (
        <div className="mb-3">
          <button
            onClick={() => setShowTaskSummary(!showTaskSummary)}
            className="flex w-full items-center justify-between rounded-2xl bg-white/30 px-3 py-2 text-[11px] text-gray-400 transition-colors hover:bg-white/50"
          >
            <span>✓ 今日やったこと ({completedTasks.length}件)</span>
            <span className="text-[10px]">{showTaskSummary ? "▾" : "▸"}</span>
          </button>
          <AnimatePresence>
            {showTaskSummary && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="rounded-b-2xl bg-white/30 px-3 pb-2">
                  {completedTasks.map((t) => (
                    <div key={t.id} className="flex items-center gap-2 py-0.5 text-xs text-gray-500">
                      <span className="text-emerald-400">✓</span>
                      <span>{t.text}</span>
                      {t.texture && (
                        <span className="text-[10px]">
                          {t.texture === "satisfying" ? "😌" : t.texture === "relieved" ? "😊" : "😐"}
                        </span>
                      )}
                    </div>
                  ))}
                  {incompleteTasks.map((t) => (
                    <div key={t.id} className="flex items-center gap-2 py-0.5 text-xs text-gray-400">
                      <span>☐</span>
                      <span>{t.text} → 明日へ</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Forecast result */}
      {forecastResult && (
        <div className="mb-3 rounded-2xl bg-indigo-50/40 px-3 py-2 text-xs text-indigo-500">
          見通し「{forecastResult.note}」→ 実際: {forecastResult.actual}/{forecastResult.total} 完了
        </div>
      )}

      {/* First journal guidance */}
      {pastEntries.length === 0 && !saved && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mb-3 rounded-2xl bg-gradient-to-br from-violet-50/20 to-indigo-50/10 px-3 py-2.5 text-center"
        >
          <p className="text-[11px] text-gray-400">
            気持ちを1つ選ぶだけでも、あなたの記録になります
          </p>
        </motion.div>
      )}

      {/* Deep layer */}
      <JournalDeepLayer
        bodyMemo={bodyMemo}
        shadowText={shadowText}
        onBodyMemoChange={(v) => { setBodyMemo(v); setSaved(false); }}
        onShadowTextChange={(v) => { setShadowText(v); setSaved(false); }}
      />

      {/* Photo gallery (visible after save or if already has photos) */}
      {(saved || photoUrls.length > 0) && (
        <div className="mb-3">
          {photoUrls.length > 0 && (
            <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
              {photoUrls.map((url, i) => (
                <div key={i} className="relative shrink-0">
                  <img
                    src={url}
                    alt={`写真 ${i + 1}`}
                    className="h-24 w-24 rounded-xl object-cover"
                  />
                  <button
                    onClick={() => handlePhotoRemove(url)}
                    className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/40 text-[9px] text-white backdrop-blur-sm"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
          {photoUrls.length < 5 && (
            <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-white/40 px-3 py-2 text-xs text-gray-400 transition-colors hover:bg-white/60">
              <span>📷</span>
              <span>{photoUploading ? "アップロード中..." : `写真を追加（${photoUrls.length}/5）`}</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={photoUploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handlePhotoUpload(file);
                }}
              />
            </label>
          )}
        </div>
      )}

      {/* Save button */}
      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={saveJournal}
          disabled={saving}
          className={`flex-1 rounded-2xl py-3 text-sm font-medium transition-all ${
            saved
              ? "bg-emerald-50 text-emerald-600"
              : "bg-white/80 text-gray-700 shadow-sm hover:bg-white"
          }`}
        >
          {saving ? "保存中..." : saved ? "✓ 保存済み" : "保存する"}
        </button>
      </div>

      {/* Journal → Profile feedback (after save) or error */}
      <AnimatePresence>
        {saveFeedback && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`mt-2 rounded-xl px-3 py-2 ${
              saveFeedback.includes("失敗")
                ? "bg-red-50/40"
                : "bg-violet-50/40"
            }`}
          >
            <p className={`text-xs leading-relaxed ${
              saveFeedback.includes("失敗")
                ? "text-red-600/80"
                : "text-violet-600/80"
            }`}>{saveFeedback}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Unlock progress after save — what this record grows */}
      {saved && !saveFeedback?.includes("失敗") && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-2 flex flex-wrap gap-1.5"
        >
          <span className="rounded-full bg-violet-50/50 px-2 py-0.5 text-[9px] text-violet-400">
            ✓ 感情ログ蓄積
          </span>
          {emotionTags.length > 0 && (
            <span className="rounded-full bg-indigo-50/50 px-2 py-0.5 text-[9px] text-indigo-400">
              ✓ 感情タグ {emotionTags.length} 件記録
            </span>
          )}
          {journalBody.trim().length >= 50 && (
            <span className="rounded-full bg-purple-50/50 px-2 py-0.5 text-[9px] text-purple-400">
              ✓ 深掘り分析の対象
            </span>
          )}
        </motion.div>
      )}

      {/* Go Deeper — AI probing questions */}
      {saved && !goDeeper && journalBody.trim().length >= 10 && (
        <div className="mt-2 flex justify-center">
          <button
            onClick={handleGoDeeper}
            disabled={goDeeperLoading}
            className="rounded-xl bg-gradient-to-r from-violet-50/60 to-indigo-50/40 px-4 py-2 text-xs text-violet-600 transition-all hover:from-violet-100/60 hover:to-indigo-100/40 disabled:opacity-50"
          >
            {goDeeperLoading ? "考え中..." : "🔍 もっと深く掘り下げる"}
          </button>
        </div>
      )}
      <AnimatePresence>
        {goDeeper && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-3 rounded-2xl bg-gradient-to-br from-violet-50/50 to-indigo-50/30 p-4"
          >
            <p className="mb-2 text-[11px] font-medium text-violet-500">🔍 深掘りの問い</p>
            <div className="space-y-2">
              {goDeeper.map((q, i) => (
                <p key={i} className="text-xs leading-relaxed text-violet-700/80">
                  {i + 1}. {q}
                </p>
              ))}
            </div>
            <button
              onClick={() => setGoDeeper(null)}
              className="mt-2 text-[10px] text-violet-400 hover:text-violet-600"
            >
              閉じる
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Surprise observation popup */}
      <AnimatePresence>
        {surprise && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="mt-4 rounded-2xl bg-gradient-to-br from-purple-50/80 to-violet-50/60 p-4"
          >
            <p className="mb-1 text-[11px] font-medium text-purple-500">🔍 不意打ち観測</p>
            <p className="text-sm text-purple-700">{surprise.text}</p>
            <button
              onClick={() => setSurprise(null)}
              className="mt-2 text-[10px] text-purple-400"
            >
              閉じる
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Memory bridge prompt (journal → memory exploration) */}
      <AnimatePresence>
        {memoryPrompt && saved && onStartMemoryDive && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-3 rounded-2xl bg-gradient-to-r from-indigo-50/40 to-purple-50/30 p-3"
          >
            <p className="text-xs leading-relaxed text-indigo-600/80">{memoryPrompt.text}</p>
            <button
              onClick={onStartMemoryDive}
              className="mt-2 text-[11px] font-medium text-indigo-500 hover:text-indigo-700"
            >
              記憶を辿る →
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* On This Day — 過去の今日 */}
      {onThisDayEntries.length > 0 && (
        <div className="mt-6 mb-2">
          <p className="mb-2 text-[11px] font-medium text-gray-400">── 過去の今日 ──</p>
          <div className="space-y-2">
            {onThisDayEntries.map((otd) => {
              const firstPhoto = otd.photoUrls?.[0] ?? otd.photoUrl;
              // Mood comparison: compare past inner weather with today's
              const moodComparison = otd.innerWeather?.emoji && innerWeather
                ? otd.innerWeather.emoji === innerWeather.emoji
                  ? "同じ気分だったようです"
                  : `${otd.label}は${otd.innerWeather.label ?? otd.innerWeather.emoji}、今日は${innerWeather.label}`
                : null;
              return (
                <motion.div
                  key={otd.date}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="rounded-2xl bg-gradient-to-r from-violet-50/40 to-purple-50/30 p-3"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-medium text-violet-500">
                      {otd.innerWeather?.emoji && <span className="mr-1">{otd.innerWeather.emoji}</span>}
                      {otd.label}のあなた
                    </p>
                    <p className="text-[10px] text-gray-400">{otd.date}</p>
                  </div>
                  {otd.title && <p className="mt-1 text-xs font-medium text-gray-600">{otd.title}</p>}

                  {/* Photo thumbnail */}
                  {firstPhoto && (
                    <div className="mt-1.5 overflow-hidden rounded-xl">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={firstPhoto}
                        alt={`${otd.label}の写真`}
                        className="h-24 w-full object-cover"
                        loading="lazy"
                      />
                    </div>
                  )}

                  <p className="mt-0.5 text-xs leading-relaxed text-gray-500">
                    {expandedOTD === otd.date ? otd.bodySnippet : otd.bodySnippet.slice(0, 50) + (otd.bodySnippet.length > 50 ? "…" : "")}
                  </p>
                  {otd.emotionTags.length > 0 && (
                    <p className="mt-1 text-[10px] text-violet-400">{otd.emotionTags.join(" · ")}</p>
                  )}

                  {/* Mood comparison */}
                  {moodComparison && (
                    <p className="mt-1 text-[10px] italic text-violet-400/80">
                      🔮 {moodComparison}
                    </p>
                  )}

                  {otd.bodySnippet.length > 50 && (
                    <button
                      onClick={() => setExpandedOTD(expandedOTD === otd.date ? null : otd.date)}
                      className="mt-1 text-[10px] text-violet-500 hover:text-violet-700"
                    >
                      {expandedOTD === otd.date ? "閉じる" : "もっと見る"}
                    </button>
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* Past entry detail view */}
      <AnimatePresence>
        {viewingEntry && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="mb-4 rounded-2xl bg-white/70 p-4 shadow-sm backdrop-blur-sm"
          >
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-medium text-gray-500">
                {new Date(viewingEntry.date).toLocaleDateString("ja-JP", {
                  year: "numeric", month: "long", day: "numeric", weekday: "short",
                })}
              </p>
              <button
                onClick={() => { setViewingEntry(null); setViewingHighlight(undefined); }}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                ✕ 閉じる
              </button>
            </div>
            {viewingEntry.inner_weather_ref?.emoji && (
              <p className="mb-1 text-sm">
                {viewingEntry.inner_weather_ref.emoji} {viewingEntry.inner_weather_ref.label}
              </p>
            )}
            {viewingEntry.title && (
              <p className="mb-1 text-sm font-medium text-gray-700">
                {highlightSearchText(viewingEntry.title, viewingHighlight)}
              </p>
            )}
            {viewingEntry.body && (
              <div className="mb-2 text-sm leading-relaxed text-gray-600 whitespace-pre-wrap">
                {highlightSearchText(viewingEntry.body, viewingHighlight)}
              </div>
            )}
            {viewingEntry.emotion_tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {viewingEntry.emotion_tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] text-violet-500">
                    {tag}
                  </span>
                ))}
              </div>
            )}
            {viewingEntry.photo_urls && viewingEntry.photo_urls.length > 0 && (
              <div className="mt-2 flex gap-2 overflow-x-auto">
                {viewingEntry.photo_urls.map((url, i) => (
                  <img key={i} src={url} alt="" className="h-20 w-20 rounded-lg object-cover" />
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Past entries */}
      <JournalPastList entries={pastEntries} onSelect={(entry, q) => {
        setViewingEntry(entry);
        setViewingHighlight(q);
      }} />
    </div>
  );
}
