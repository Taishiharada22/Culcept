// components/products/SmartSearch.tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Search, TrendingUp, Clock } from "lucide-react";

type SearchSuggestion = {
    type: "product" | "brand" | "tag" | "recent";
    value: string;
    label: string;
    count?: number;
};

const RECENT_SEARCHES_KEY = "culcept_recent_searches";
const MAX_RECENT = 5;

export default function SmartSearch({ placeholder }: { placeholder?: string }) {
    const router = useRouter();
    const [query, setQuery] = React.useState("");
    const [suggestions, setSuggestions] = React.useState<SearchSuggestion[]>([]);
    const [showSuggestions, setShowSuggestions] = React.useState(false);
    const [loading, setLoading] = React.useState(false);
    const [selectedIndex, setSelectedIndex] = React.useState(-1);
    const inputRef = React.useRef<HTMLInputElement>(null);

    // ✅ 完全修正版: number型を明示的に指定
    const debounceRef = React.useRef<number | undefined>(undefined);

    // Load recent searches
    const [recentSearches, setRecentSearches] = React.useState<string[]>([]);

    React.useEffect(() => {
        try {
            const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
            if (stored) {
                setRecentSearches(JSON.parse(stored));
            }
        } catch { }
    }, []);

    const addToRecent = React.useCallback((search: string) => {
        const trimmed = search.trim();
        if (!trimmed) return;

        setRecentSearches(prev => {
            const filtered = prev.filter(s => s !== trimmed);
            const updated = [trimmed, ...filtered].slice(0, MAX_RECENT);

            try {
                localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
            } catch { }

            return updated;
        });
    }, []);

    // Fetch suggestions
    const fetchSuggestions = React.useCallback(async (q: string) => {
        if (!q.trim()) {
            // Show recent searches when empty
            setSuggestions(
                recentSearches.map(s => ({
                    type: "recent" as const,
                    value: s,
                    label: s,
                }))
            );
            return;
        }

        setLoading(true);
        try {
            const res = await fetch(`/api/search/suggestions?q=${encodeURIComponent(q)}`);
            if (res.ok) {
                const data = await res.json();
                setSuggestions(data.suggestions || []);
            }
        } catch (err) {
            console.warn("Failed to fetch suggestions:", err);
        } finally {
            setLoading(false);
        }
    }, [recentSearches]);

    // Debounced search
    React.useEffect(() => {
        if (debounceRef.current !== undefined) {
            window.clearTimeout(debounceRef.current);
        }

        if (showSuggestions) {
            debounceRef.current = window.setTimeout(() => {
                fetchSuggestions(query);
            }, 300);
        }

        return () => {
            if (debounceRef.current !== undefined) {
                window.clearTimeout(debounceRef.current);
            }
        };
    }, [query, showSuggestions, fetchSuggestions]);

    const handleSearch = React.useCallback((searchQuery: string) => {
        const trimmed = searchQuery.trim();
        if (!trimmed) return;

        addToRecent(trimmed);
        setShowSuggestions(false);
        setQuery("");
        router.push(`/products?q=${encodeURIComponent(trimmed)}`);
    }, [router, addToRecent]);

    const handleKeyDown = React.useCallback((e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            e.preventDefault();
            if (selectedIndex >= 0 && suggestions[selectedIndex]) {
                handleSearch(suggestions[selectedIndex].value);
            } else {
                handleSearch(query);
            }
        } else if (e.key === "ArrowDown") {
            e.preventDefault();
            setSelectedIndex(prev =>
                prev < suggestions.length - 1 ? prev + 1 : prev
            );
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setSelectedIndex(prev => prev > -1 ? prev - 1 : -1);
        } else if (e.key === "Escape") {
            setShowSuggestions(false);
            inputRef.current?.blur();
        }
    }, [query, suggestions, selectedIndex, handleSearch]);

    const getSuggestionIcon = (type: SearchSuggestion["type"]) => {
        switch (type) {
            case "recent":
                return <Clock className="h-4 w-4 text-slate-400" />;
            case "brand":
            case "tag":
                return <TrendingUp className="h-4 w-4 text-orange-500" />;
            default:
                return <Search className="h-4 w-4 text-slate-400" />;
        }
    };

    return (
        <div className="relative">
            {/* Input */}
            <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onFocus={() => setShowSuggestions(true)}
                    onBlur={() => {
                        // Delay to allow clicking suggestions
                        setTimeout(() => setShowSuggestions(false), 200);
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder || "Search products, brands, styles..."}
                    className="w-full rounded-xl border-2 border-slate-200 bg-white pl-12 pr-4 py-4 text-base font-semibold text-slate-900 transition-all duration-200 focus:border-orange-400 focus:outline-none focus:ring-4 focus:ring-orange-100"
                />

                {loading && (
                    <div className="absolute right-4 top-1/2 -translate-y-1/2">
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-orange-500" />
                    </div>
                )}
            </div>

            {/* Suggestions Dropdown */}
            {showSuggestions && suggestions.length > 0 && (
                <div
                    className="absolute top-full left-0 right-0 mt-2 rounded-xl border-2 border-slate-200 bg-white shadow-2xl overflow-hidden z-50"
                    style={{ animation: "slideDown 0.2s ease-out" }}
                >
                    <style jsx>{`
                        @keyframes slideDown {
                            from {
                                opacity: 0;
                                transform: translateY(-10px);
                            }
                            to {
                                opacity: 1;
                                transform: translateY(0);
                            }
                        }
                    `}</style>

                    <div className="max-h-96 overflow-y-auto">
                        {suggestions.map((suggestion, idx) => (
                            <button
                                key={`${suggestion.type}-${suggestion.value}-${idx}`}
                                onClick={() => handleSearch(suggestion.value)}
                                className={`
                                    w-full flex items-center gap-3 px-4 py-3 text-left transition-colors
                                    ${idx === selectedIndex
                                        ? "bg-orange-50 border-l-4 border-orange-500"
                                        : "hover:bg-slate-50"
                                    }
                                `}
                            >
                                {getSuggestionIcon(suggestion.type)}

                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-bold text-slate-900 truncate">
                                        {suggestion.label}
                                    </div>
                                    {suggestion.type === "recent" && (
                                        <div className="text-xs font-semibold text-slate-500">
                                            Recent search
                                        </div>
                                    )}
                                </div>

                                {suggestion.count != null && (
                                    <div className="text-xs font-bold text-slate-400">
                                        {suggestion.count} results
                                    </div>
                                )}
                            </button>
                        ))}
                    </div>

                    {/* Quick Tips */}
                    <div className="border-t border-slate-100 bg-slate-50 px-4 py-2">
                        <div className="text-xs font-semibold text-slate-500">
                            💡 Tip: Use <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-xs font-bold">↑</kbd> <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-xs font-bold">↓</kbd> to navigate
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
