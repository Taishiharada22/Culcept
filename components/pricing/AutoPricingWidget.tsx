// components/pricing/AutoPricingWidget.tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { PricingSuggestion } from "@/types/auto-pricing";

type Props = {
    productId: string;
    currentPrice: number | null;
    title: string;
    brand: string | null;
    condition: string | null;
};

export default function AutoPricingWidget({
    productId,
    currentPrice,
    title,
    brand,
    condition,
}: Props) {
    const router = useRouter();
    const [loading, setLoading] = React.useState(false);
    const [suggestion, setSuggestion] = React.useState<PricingSuggestion | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [applying, setApplying] = React.useState(false);

    const fetchSuggestion = async () => {
        setLoading(true);
        setError(null);

        try {
            const res = await fetch(`/api/auto-pricing?product_id=${productId}`);
            const data = await res.json();

            if (!res.ok || !data.ok) {
                throw new Error(data.error || "Failed to get pricing suggestion");
            }

            setSuggestion(data.suggestion);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const applyPrice = async () => {
        if (!suggestion) return;

        if (!confirm(`Apply suggested price of ¥${suggestion.suggested_price.toLocaleString()}?`)) {
            return;
        }

        setApplying(true);

        try {
            const res = await fetch(`/api/auto-pricing/apply`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    product_id: productId,
                    price: suggestion.suggested_price,
                }),
            });

            const data = await res.json();

            if (!res.ok || !data.ok) {
                throw new Error(data.error || "Failed to apply price");
            }

            alert("Price updated successfully!");
            router.refresh();
        } catch (err: any) {
            alert(err.message);
        } finally {
            setApplying(false);
        }
    };

    return (
        <div className="rounded-2xl border-2 border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                    <h3 className="text-xl font-black text-slate-900 mb-1">
                        🤖 AI Pricing Assistant
                    </h3>
                    <p className="text-sm font-semibold text-slate-600">
                        Get optimal price suggestions based on market data
                    </p>
                </div>

                {!suggestion && (
                    <button
                        onClick={fetchSuggestion}
                        disabled={loading}
                        className="rounded-xl bg-gradient-to-r from-purple-500 to-purple-600 px-6 py-3 text-sm font-black text-white transition-all hover:shadow-lg disabled:opacity-50"
                    >
                        {loading ? "Analyzing..." : "Get Suggestion"}
                    </button>
                )}
            </div>

            {error && (
                <div className="rounded-xl bg-red-50 border-2 border-red-200 p-4 text-sm font-bold text-red-700">
                    {error}
                </div>
            )}

            {suggestion && (
                <div className="space-y-4">
                    {/* Price Comparison */}
                    <div className="rounded-xl border-2 border-purple-200 bg-gradient-to-br from-purple-50/50 to-white p-6">
                        <div className="grid gap-6 sm:grid-cols-3">
                            <div>
                                <div className="text-xs font-black text-slate-500 uppercase tracking-wide mb-1">
                                    Current Price
                                </div>
                                <div className="text-3xl font-black text-slate-900">
                                    ¥{(currentPrice || 0).toLocaleString()}
                                </div>
                            </div>

                            <div>
                                <div className="text-xs font-black text-purple-600 uppercase tracking-wide mb-1">
                                    AI Suggested
                                </div>
                                <div className="text-3xl font-black text-purple-600">
                                    ¥{suggestion.suggested_price.toLocaleString()}
                                </div>
                                <div
                                    className={`mt-1 text-sm font-bold ${suggestion.suggested_price > (currentPrice || 0)
                                            ? "text-teal-600"
                                            : suggestion.suggested_price < (currentPrice || 0)
                                                ? "text-orange-600"
                                                : "text-slate-600"
                                        }`}
                                >
                                    {suggestion.suggested_price > (currentPrice || 0) && "↑ Higher"}
                                    {suggestion.suggested_price < (currentPrice || 0) && "↓ Lower"}
                                    {suggestion.suggested_price === (currentPrice || 0) && "= Same"}
                                    {currentPrice &&
                                        ` (${Math.abs(
                                            Math.round(
                                                ((suggestion.suggested_price - currentPrice) /
                                                    currentPrice) *
                                                100
                                            )
                                        )}%)`}
                                </div>
                            </div>

                            <div>
                                <div className="text-xs font-black text-slate-500 uppercase tracking-wide mb-1">
                                    Confidence
                                </div>
                                <div className="flex items-center gap-2 mt-2">
                                    <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all ${suggestion.confidence === "high"
                                                    ? "bg-teal-500 w-full"
                                                    : suggestion.confidence === "medium"
                                                        ? "bg-orange-500 w-2/3"
                                                        : "bg-red-500 w-1/3"
                                                }`}
                                        />
                                    </div>
                                    <span
                                        className={`text-xs font-black uppercase ${suggestion.confidence === "high"
                                                ? "text-teal-600"
                                                : suggestion.confidence === "medium"
                                                    ? "text-orange-600"
                                                    : "text-red-600"
                                            }`}
                                    >
                                        {suggestion.confidence}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Price Range */}
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <div className="text-xs font-black text-slate-600 uppercase tracking-wide mb-3">
                            Recommended Price Range
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-slate-700">
                                ¥{suggestion.price_range.min.toLocaleString()}
                            </span>
                            <div className="flex-1 h-3 rounded-full bg-slate-200 relative overflow-hidden">
                                <div
                                    className="absolute h-full bg-gradient-to-r from-orange-400 to-purple-500"
                                    style={{
                                        left: "0%",
                                        width: "100%",
                                    }}
                                />
                                <div
                                    className="absolute h-5 w-1 bg-white border-2 border-purple-600 -translate-x-1/2 -translate-y-1/4"
                                    style={{
                                        left: `${((suggestion.price_range.optimal -
                                                suggestion.price_range.min) /
                                                (suggestion.price_range.max -
                                                    suggestion.price_range.min)) *
                                            100
                                            }%`,
                                    }}
                                />
                            </div>
                            <span className="text-sm font-bold text-slate-700">
                                ¥{suggestion.price_range.max.toLocaleString()}
                            </span>
                        </div>
                        <div className="mt-2 text-xs font-semibold text-slate-600 text-center">
                            Optimal: ¥{suggestion.price_range.optimal.toLocaleString()}
                        </div>
                    </div>

                    {/* Reasoning */}
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <div className="text-xs font-black text-slate-600 uppercase tracking-wide mb-3">
                            Price Factors
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="flex items-center justify-between text-sm">
                                <span className="font-semibold text-slate-700">Market Average:</span>
                                <span className="font-black text-slate-900">
                                    ¥{suggestion.reasoning.market_average.toLocaleString()}
                                </span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span className="font-semibold text-slate-700">Similar Products:</span>
                                <span className="font-black text-slate-900">
                                    {suggestion.reasoning.similar_products_count}
                                </span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span className="font-semibold text-slate-700">Condition Adj:</span>
                                <span
                                    className={`font-black ${suggestion.reasoning.condition_adjustment > 0
                                            ? "text-teal-600"
                                            : "text-orange-600"
                                        }`}
                                >
                                    {suggestion.reasoning.condition_adjustment > 0 ? "+" : ""}
                                    {suggestion.reasoning.condition_adjustment}%
                                </span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span className="font-semibold text-slate-700">Brand Premium:</span>
                                <span className="font-black text-purple-600">
                                    +{suggestion.reasoning.brand_premium}%
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Market Insights */}
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <div className="text-xs font-black text-slate-600 uppercase tracking-wide mb-3">
                            Market Insights
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {suggestion.market_insights.trending_up && (
                                <span className="rounded-full bg-teal-100 border border-teal-300 px-3 py-1 text-xs font-black text-teal-700">
                                    📈 Trending Up
                                </span>
                            )}
                            <span
                                className={`rounded-full border px-3 py-1 text-xs font-black ${suggestion.market_insights.competition_level === "high"
                                        ? "bg-red-100 border-red-300 text-red-700"
                                        : suggestion.market_insights.competition_level === "medium"
                                            ? "bg-orange-100 border-orange-300 text-orange-700"
                                            : "bg-teal-100 border-teal-300 text-teal-700"
                                    }`}
                            >
                                Competition: {suggestion.market_insights.competition_level}
                            </span>
                            <span className="rounded-full bg-purple-100 border border-purple-300 px-3 py-1 text-xs font-black text-purple-700">
                                {suggestion.market_insights.recent_sales} recent sales
                            </span>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 pt-2">
                        <button
                            onClick={applyPrice}
                            disabled={applying}
                            className="flex-1 rounded-xl bg-gradient-to-r from-purple-500 to-purple-600 px-6 py-3 text-sm font-black text-white transition-all hover:shadow-lg disabled:opacity-50"
                        >
                            {applying ? "Applying..." : "Apply This Price"}
                        </button>

                        <button
                            onClick={() => setSuggestion(null)}
                            className="rounded-xl border-2 border-slate-300 bg-white px-6 py-3 text-sm font-black text-slate-700 transition-all hover:bg-slate-50"
                        >
                            Get New Suggestion
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
