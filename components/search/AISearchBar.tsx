// components/search/AISearchBar.tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { SearchSuggestion } from "@/types/ai-search";

type Props = {
    initialQuery?: string;
};

const exampleQueries = [
    "vintage denim jacket under ¥10000",
    "rare sneakers in good condition",
    "designer bags from luxury brands",
    "streetwear hoodies with unique graphics",
];

export default function AISearchBar({ initialQuery = "" }: Props) {
    const router = useRouter();
    const [query, setQuery] = React.useState(initialQuery);
    const [suggestions, setSuggestions] = React.useState<SearchSuggestion[]>([]);
    const [showSuggestions, setShowSuggestions] = React.useState(false);
    const [loading, setLoading] = React.useState(false);

    // Debounced suggestions
    React.useEffect(() => {
        if (query.length < 3) {
            setSuggestions([]);
            return;
        }

        const timer = setTimeout(async () => {
            try {
                const res = await fetch(`/api/ai-search/suggestions?q=${encodeURIComponent(query)}`);
                const data = await res.json();
                if (data.ok) {
                    setSuggestions(data.suggestions || []);
                }
            } catch (err) {
                console.error(err);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [query]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!query.trim()) return;

        setLoading(true);
        setShowSuggestions(false);

        // Navigate to search results
        router.push(`/search?q=${encodeURIComponent(query.trim())}`);
    };

    const handleSuggestionClick = (suggestion: SearchSuggestion) => {
        setQuery(suggestion.text);
        setShowSuggestions(false);
        router.push(`/search?q=${encodeURIComponent(suggestion.text)}`);
    };

    return (
        <div className="relative">
            <form onSubmit={handleSubmit} className="relative">
                <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl pointer-events-none">
                        🤖
                    </span>
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onFocus={() => setShowSuggestions(true)}
                        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                        placeholder="Try: vintage denim jacket under ¥10000..."
                        className="w-full rounded-2xl border-2 border-purple-300 bg-white pl-14 pr-32 py-4 text-base font-semibold text-slate-900 transition-all focus:border-purple-500 focus:outline-none focus:ring-4 focus:ring-purple-100 shadow-lg"
                    />
                    <button
                        type="submit"
                        disabled={loading || !query.trim()}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl bg-gradient-to-r from-purple-500 to-purple-600 px-6 py-2.5 text-sm font-black text-white transition-all hover:shadow-lg disabled:opacity-50"
                    >
                        {loading ? "..." : "AI Search"}
                    </button>
                </div>
            </form>

            {/* Suggestions Dropdown */}
            {showSuggestions && suggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-2 rounded-2xl border-2 border-slate-200 bg-white shadow-2xl overflow-hidden z-50">
                    <div className="p-2 space-y-1">
                        {suggestions.map((suggestion, idx) => (
                            <button
                                key={idx}
                                onClick={() => handleSuggestionClick(suggestion)}
                                className="w-full rounded-xl px-4 py-3 text-left text-sm font-semibold text-slate-900 transition-all hover:bg-purple-50 flex items-center gap-3"
                            >
                                <span className="text-lg">
                                    {suggestion.type === "brand" && "🏷️"}
                                    {suggestion.type === "category" && "📦"}
                                    {suggestion.type === "style" && "✨"}
                                    {suggestion.type === "price_range" && "💰"}
                                </span>
                                <span className="flex-1">{suggestion.text}</span>
                                <span className="text-xs font-bold text-purple-600 uppercase tracking-wide">
                                    {suggestion.type}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Example Queries */}
            {!query && (
                <div className="mt-4 flex flex-wrap gap-2">
                    <span className="text-xs font-bold text-slate-500">Try:</span>
                    {exampleQueries.map((example, idx) => (
                        <button
                            key={idx}
                            onClick={() => setQuery(example)}
                            className="rounded-full border-2 border-purple-200 bg-purple-50 px-3 py-1 text-xs font-bold text-purple-700 transition-all hover:bg-purple-100"
                        >
                            {example}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
