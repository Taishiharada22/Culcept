"use client";

import { useState, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";

export type JournalEntry = {
  id: string;
  date: string;
  title: string;
  body: string;
  emotion_tags: string[];
  photo_url?: string | null;
  photo_urls?: string[] | null;
  inner_weather_ref?: { emoji?: string; label?: string } | null;
};

type Props = {
  entries: JournalEntry[];
  onSelect?: (entry: JournalEntry, searchQuery?: string) => void;
};

function highlightText(text: string, query: string): React.ReactNode {
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

export default function JournalPastList({ entries, onSelect }: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<JournalEntry[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Collect all unique emotion tags across entries
  const allTags = useMemo(() => {
    const tags = new Map<string, number>(); // tag → count
    for (const entry of entries) {
      for (const tag of entry.emotion_tags ?? []) {
        tags.set(tag, (tags.get(tag) ?? 0) + 1);
      }
    }
    return Array.from(tags.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([tag]) => tag);
  }, [entries]);

  const performSearch = useCallback((q: string, tag: string | null, from: string, to: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!q.trim() && !tag && !from && !to) {
      setSearchResults(null);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const params = new URLSearchParams();
        if (q.trim()) params.set("q", q.trim());
        if (tag) params.set("tag", tag);
        if (from) params.set("from", from);
        if (to) params.set("to", to);

        const res = await fetch(`/api/origin/journal/search?${params.toString()}`);
        const data = await res.json();
        if (data.ok) {
          setSearchResults(data.entries);
        }
      } catch { /* silent */ }
      setSearching(false);
    }, 300);
  }, []);

  const handleSearch = useCallback((q: string) => {
    setSearchQuery(q);
    performSearch(q, activeTag, dateFrom, dateTo);
  }, [activeTag, dateFrom, dateTo, performSearch]);

  const handleTagFilter = useCallback((tag: string | null) => {
    setActiveTag(tag);
    performSearch(searchQuery, tag, dateFrom, dateTo);
  }, [searchQuery, dateFrom, dateTo, performSearch]);

  const handleDateRange = useCallback((from: string, to: string) => {
    setDateFrom(from);
    setDateTo(to);
    performSearch(searchQuery, activeTag, from, to);
  }, [searchQuery, activeTag, performSearch]);

  const clearAll = useCallback(() => {
    setSearchQuery("");
    setActiveTag(null);
    setDateFrom("");
    setDateTo("");
    setSearchResults(null);
    setShowAdvanced(false);
  }, []);

  const displayEntries = searchResults ?? entries;
  const isSearchActive = searchResults !== null;
  const hasActiveFilters = !!activeTag || !!dateFrom || !!dateTo;

  if (entries.length === 0 && !isSearchActive) return null;

  return (
    <div className="mt-6">
      <p className="mb-2 text-[11px] font-medium text-gray-400">── 過去のジャーナル ──</p>

      {/* Search bar */}
      <div className="mb-2 flex items-center gap-2 rounded-xl bg-white/50 px-3 py-2">
        <span className="text-gray-300 text-xs">🔍</span>
        <input
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="過去の記録を検索"
          className="flex-1 bg-transparent text-xs text-gray-600 outline-none placeholder:text-gray-300"
        />
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className={`text-[10px] transition-colors ${
            showAdvanced || hasActiveFilters ? "text-indigo-500" : "text-gray-300 hover:text-gray-500"
          }`}
        >
          ⚙️
        </button>
        {(searchQuery || hasActiveFilters) && (
          <button
            onClick={clearAll}
            className="text-[10px] text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        )}
        {searching && (
          <div className="h-3 w-3 animate-spin rounded-full border border-gray-300 border-t-gray-500" />
        )}
      </div>

      {/* Advanced filters */}
      <AnimatePresence>
        {showAdvanced && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-3 overflow-hidden"
          >
            <div className="space-y-2 rounded-xl bg-white/40 p-2.5">
              {/* Emotion tag chips */}
              {allTags.length > 0 && (
                <div>
                  <p className="mb-1 text-[10px] text-gray-400">感情タグ</p>
                  <div className="flex flex-wrap gap-1">
                    {allTags.map((tag) => (
                      <button
                        key={tag}
                        onClick={() => handleTagFilter(activeTag === tag ? null : tag)}
                        className={`rounded-full px-2 py-0.5 text-[10px] transition-all ${
                          activeTag === tag
                            ? "bg-indigo-100 text-indigo-600 shadow-sm"
                            : "bg-white/60 text-gray-400 hover:bg-white/80"
                        }`}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Date range */}
              <div>
                <p className="mb-1 text-[10px] text-gray-400">期間</p>
                <div className="flex items-center gap-1.5">
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => handleDateRange(e.target.value, dateTo)}
                    className="rounded-lg bg-white/60 px-2 py-1 text-[10px] text-gray-500 outline-none"
                  />
                  <span className="text-[10px] text-gray-300">〜</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => handleDateRange(dateFrom, e.target.value)}
                    className="rounded-lg bg-white/60 px-2 py-1 text-[10px] text-gray-500 outline-none"
                  />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Active filter indicator */}
      {hasActiveFilters && !showAdvanced && (
        <div className="mb-2 flex flex-wrap gap-1">
          {activeTag && (
            <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] text-indigo-500">
              {activeTag}
              <button onClick={() => handleTagFilter(null)} className="ml-1">✕</button>
            </span>
          )}
          {dateFrom && (
            <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] text-sky-500">
              {dateFrom}〜
              <button onClick={() => handleDateRange("", dateTo)} className="ml-1">✕</button>
            </span>
          )}
        </div>
      )}

      {/* Results */}
      <div className="space-y-1.5">
        <AnimatePresence mode="popLayout">
          {displayEntries.length === 0 && isSearchActive && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="py-4 text-center text-xs text-gray-400"
            >
              {searchQuery
                ? `「${searchQuery}」に一致する記録はありませんでした`
                : "条件に一致する記録はありませんでした"}
            </motion.p>
          )}
          {displayEntries.map((entry, i) => {
            const dateStr = new Date(entry.date).toLocaleDateString("ja-JP", {
              month: "numeric",
              day: "numeric",
            });
            const displayTitle = entry.title || entry.body?.slice(0, 30) || "（記録なし）";
            const hasPhoto = entry.photo_url || (entry.photo_urls && entry.photo_urls.length > 0);

            return (
              <motion.button
                key={entry.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ delay: i * 0.03 }}
                onClick={() => onSelect?.(entry, searchQuery || undefined)}
                className="flex w-full items-center gap-2 rounded-xl bg-white/40 px-3 py-2 text-left transition-colors hover:bg-white/60"
              >
                <span className="shrink-0 text-[11px] text-gray-400">{dateStr}</span>
                {entry.inner_weather_ref?.emoji && (
                  <span className="shrink-0 text-xs">{entry.inner_weather_ref.emoji}</span>
                )}
                {hasPhoto && <span className="shrink-0 text-[10px]">📷</span>}
                <span className="flex-1 truncate text-xs text-gray-600">
                  {isSearchActive && searchQuery ? highlightText(displayTitle, searchQuery) : displayTitle}
                </span>
                {entry.emotion_tags.length > 0 && (
                  <span className="shrink-0 text-[10px] text-gray-400">
                    [{entry.emotion_tags[0]}]
                  </span>
                )}
              </motion.button>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
