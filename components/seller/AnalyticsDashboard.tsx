// components/seller/AnalyticsDashboard.tsx
"use client";

import * as React from "react";
import type { ShopAnalytics, TimeSeriesData, TopProduct } from "@/types/analytics";

type Props = {
    analytics: ShopAnalytics;
    timeSeriesData: TimeSeriesData[];
    topProducts: TopProduct[];
};

export default function AnalyticsDashboard({ analytics, timeSeriesData, topProducts }: Props) {
    const [timeRange, setTimeRange] = React.useState<"7d" | "30d" | "90d">("30d");

    // Filter time series data based on range
    const filteredData = React.useMemo(() => {
        const days = timeRange === "7d" ? 7 : timeRange === "30d" ? 30 : 90;
        return timeSeriesData.slice(-days);
    }, [timeSeriesData, timeRange]);

    // Calculate totals for the range
    const rangeTotals = React.useMemo(() => {
        return filteredData.reduce(
            (acc, day) => ({
                views: acc.views + day.views,
                clicks: acc.clicks + day.clicks,
                sales: acc.sales + day.sales,
                revenue: acc.revenue + day.revenue,
            }),
            { views: 0, clicks: 0, sales: 0, revenue: 0 }
        );
    }, [filteredData]);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h2 className="text-3xl font-black text-slate-900">
                    Analytics Dashboard
                </h2>

                {/* Time Range Selector */}
                <div className="flex gap-2">
                    {(["7d", "30d", "90d"] as const).map((range) => (
                        <button
                            key={range}
                            onClick={() => setTimeRange(range)}
                            className={`rounded-lg px-4 py-2 text-sm font-black transition-all ${timeRange === range
                                    ? "bg-slate-900 text-white"
                                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                                }`}
                        >
                            {range === "7d" ? "7 Days" : range === "30d" ? "30 Days" : "90 Days"}
                        </button>
                    ))}
                </div>
            </div>

            {/* Key Metrics */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <MetricCard
                    title="Total Views"
                    value={rangeTotals.views.toLocaleString()}
                    icon="👁️"
                    color="purple"
                />
                <MetricCard
                    title="Total Clicks"
                    value={rangeTotals.clicks.toLocaleString()}
                    icon="🖱️"
                    color="orange"
                />
                <MetricCard
                    title="Sales"
                    value={rangeTotals.sales.toString()}
                    icon="🛍️"
                    color="teal"
                />
                <MetricCard
                    title="Revenue"
                    value={`¥${rangeTotals.revenue.toLocaleString()}`}
                    icon="💰"
                    color="green"
                />
            </div>

            {/* Overall Stats */}
            <div className="rounded-2xl border-2 border-slate-200 bg-white p-6">
                <h3 className="text-xl font-black text-slate-900 mb-4">
                    Shop Overview
                </h3>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <StatItem
                        label="Total Products"
                        value={analytics.total_products.toString()}
                    />
                    <StatItem
                        label="Published"
                        value={analytics.published_products.toString()}
                    />
                    <StatItem
                        label="Followers"
                        value={analytics.follower_count.toString()}
                    />
                    <StatItem
                        label="Avg. Price"
                        value={`¥${Math.round(analytics.average_price).toLocaleString()}`}
                    />
                </div>
            </div>

            {/* Simple Chart */}
            <div className="rounded-2xl border-2 border-slate-200 bg-white p-6">
                <h3 className="text-xl font-black text-slate-900 mb-6">
                    Views & Clicks Trend
                </h3>

                <SimpleLineChart
                    data={filteredData}
                    lines={[
                        { key: "views", color: "#8b5cf6", label: "Views" },
                        { key: "clicks", color: "#f97316", label: "Clicks" },
                    ]}
                />
            </div>

            {/* Top Products */}
            <div className="rounded-2xl border-2 border-slate-200 bg-white p-6">
                <h3 className="text-xl font-black text-slate-900 mb-6">
                    Top Performing Products
                </h3>

                {topProducts.length === 0 ? (
                    <div className="text-center text-sm font-semibold text-slate-600 py-8">
                        No data yet. Keep listing products!
                    </div>
                ) : (
                    <div className="space-y-3">
                        {topProducts.map((product, idx) => (
                            <div
                                key={product.id}
                                className="flex items-center gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4"
                            >
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-purple-600 text-lg font-black text-white">
                                    {idx + 1}
                                </div>

                                {product.cover_image_url && (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={product.cover_image_url}
                                        alt={product.title}
                                        className="h-16 w-16 rounded-lg border border-slate-200 object-cover"
                                    />
                                )}

                                <div className="flex-1 min-w-0">
                                    <h4 className="text-sm font-black text-slate-900 truncate">
                                        {product.title}
                                    </h4>
                                    <div className="mt-1 flex items-center gap-4 text-xs font-semibold text-slate-600">
                                        <span>👁️ {product.views.toLocaleString()} views</span>
                                        <span>🖱️ {product.clicks.toLocaleString()} clicks</span>
                                        <span>💰 ¥{product.revenue.toLocaleString()}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

function MetricCard({
    title,
    value,
    icon,
    color,
}: {
    title: string;
    value: string;
    icon: string;
    color: string;
}) {
    const colorClasses = {
        purple: "from-purple-500 to-purple-600 border-purple-400",
        orange: "from-orange-500 to-orange-600 border-orange-400",
        teal: "from-teal-500 to-teal-600 border-teal-400",
        green: "from-green-500 to-green-600 border-green-400",
    };

    return (
        <div
            className={`rounded-2xl border-2 bg-gradient-to-br ${colorClasses[color as keyof typeof colorClasses]} p-6 text-white shadow-lg`}
        >
            <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold opacity-90">{title}</span>
                <span className="text-2xl">{icon}</span>
            </div>
            <div className="text-3xl font-black">{value}</div>
        </div>
    );
}

function StatItem({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-bold text-slate-600 mb-1">{label}</div>
            <div className="text-2xl font-black text-slate-900">{value}</div>
        </div>
    );
}

function SimpleLineChart({
    data,
    lines,
}: {
    data: TimeSeriesData[];
    lines: Array<{ key: keyof TimeSeriesData; color: string; label: string }>;
}) {
    if (data.length === 0) {
        return (
            <div className="text-center text-sm font-semibold text-slate-600 py-8">
                No data available
            </div>
        );
    }

    // Find max value for scaling
    const maxValue = Math.max(
        ...data.flatMap((d) => lines.map((line) => Number(d[line.key]) || 0))
    );

    const chartHeight = 200;
    const chartWidth = 600;
    const padding = 40;

    return (
        <div className="overflow-x-auto">
            <svg width={chartWidth} height={chartHeight + padding} className="mx-auto">
                {/* Grid lines */}
                {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                    const y = padding / 2 + chartHeight * (1 - ratio);
                    return (
                        <g key={ratio}>
                            <line
                                x1={padding}
                                y1={y}
                                x2={chartWidth - padding}
                                y2={y}
                                stroke="#e2e8f0"
                                strokeWidth="1"
                            />
                            <text
                                x={padding - 10}
                                y={y + 4}
                                textAnchor="end"
                                fontSize="10"
                                fill="#64748b"
                            >
                                {Math.round(maxValue * ratio)}
                            </text>
                        </g>
                    );
                })}

                {/* Lines */}
                {lines.map((line) => {
                    const points = data
                        .map((d, i) => {
                            const x =
                                padding +
                                ((chartWidth - 2 * padding) / (data.length - 1 || 1)) * i;
                            const value = Number(d[line.key]) || 0;
                            const y =
                                padding / 2 +
                                chartHeight * (1 - value / (maxValue || 1));
                            return `${x},${y}`;
                        })
                        .join(" ");

                    return (
                        <polyline
                            key={line.key}
                            points={points}
                            fill="none"
                            stroke={line.color}
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    );
                })}

                {/* Legend */}
                {lines.map((line, i) => (
                    <g key={line.key} transform={`translate(${padding + i * 100}, ${chartHeight + padding / 2 + 10})`}>
                        <rect width="20" height="3" fill={line.color} />
                        <text x="25" y="4" fontSize="12" fill="#475569">
                            {line.label}
                        </text>
                    </g>
                ))}
            </svg>
        </div>
    );
}
