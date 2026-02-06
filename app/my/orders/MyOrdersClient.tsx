// app/my/orders/MyOrdersClient.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
    LightBackground,
    GlassCard,
    GlassNavbar,
    GlassButton,
    GlassBadge,
    GlassTabs,
    FadeInView,
} from "@/components/ui/glassmorphism-design";

type OrderRow = {
    id: string;
    status: string | null;
    paid_at: string | null;
    created_at: string | null;
    drop_id: string | null;
    amount_total: number | null;
    currency: string | null;
    stripe_session_id: string | null;
};

type Props = {
    isLoggedIn: boolean;
    tab: "purchases" | "sales";
    orders: OrderRow[];
    errorMessage?: string | null;
};

function formatYen(value: number | null) {
    if (!Number.isFinite(value ?? NaN)) return "0";
    return Math.round(value as number).toLocaleString("ja-JP");
}

function formatDate(value: string | null) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString("ja-JP");
}

function statusVariant(status: string | null): "default" | "success" | "warning" | "danger" | "info" | "gradient" {
    const st = String(status ?? "").toLowerCase();
    if (st === "paid" || st === "completed") return "success";
    if (st === "paid_conflict" || st === "failed") return "danger";
    if (st === "pending") return "warning";
    if (st) return "info";
    return "default";
}

export default function MyOrdersClient({ isLoggedIn, tab, orders, errorMessage }: Props) {
    const router = useRouter();
    const title = tab === "sales" ? "販売履歴" : "購入履歴";
    const icon = tab === "sales" ? "💰" : "🛒";
    const nextPath = encodeURIComponent(`/my/orders?tab=${tab}`);
    const headingStyle = { fontFamily: "'Cormorant Garamond', serif" };

    const tabs = [
        { id: "purchases", label: "購入履歴", icon: <span>🛒</span> },
        { id: "sales", label: "販売履歴", icon: <span>💰</span> },
    ];

    if (!isLoggedIn) {
        return (
            <LightBackground>
                <div className="min-h-screen flex items-center justify-center px-4 py-12">
                    <GlassCard className="max-w-md w-full text-center p-10">
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ duration: 0.4 }}
                            className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center text-3xl text-white shadow-lg shadow-violet-500/30"
                        >
                            🔒
                        </motion.div>
                        <h1 className="text-2xl font-bold text-gray-800 mb-2">ログインが必要です</h1>
                        <p className="text-gray-500 mb-8">購入履歴・販売履歴を確認するにはログインしてください。</p>
                        <GlassButton
                            href={`/login?next=${nextPath}`}
                            variant="gradient"
                            size="lg"
                            className="w-full justify-center"
                        >
                            ログイン
                        </GlassButton>
                    </GlassCard>
                </div>
            </LightBackground>
        );
    }

    return (
        <LightBackground>
            {/* ヘッダー */}
            <GlassNavbar>
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <Link
                            href="/my"
                            className="w-10 h-10 rounded-xl bg-white/50 backdrop-blur-sm border border-white/60 flex items-center justify-center text-gray-500 hover:bg-white/80 hover:text-gray-800 transition-all duration-300 shadow-sm"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </Link>
                        <div>
                            <h1
                                className="text-xl font-bold tracking-tight text-gray-800"
                                style={headingStyle}
                            >
                                {title}
                            </h1>
                            <p className="text-xs text-gray-400">購入・販売履歴</p>
                        </div>
                    </div>
                    <GlassButton href="/products" variant="secondary" size="sm">
                        商品を見る
                    </GlassButton>
                </div>
            </GlassNavbar>

            <div className="h-20" />

            <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
                <FadeInView>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-400/80 to-cyan-400/80 flex items-center justify-center text-xl shadow-lg">
                                {icon}
                            </div>
                            <div>
                                <h2
                                    className="text-2xl font-bold text-gray-800"
                                    style={headingStyle}
                                >
                                    {title}
                                </h2>
                                <p className="text-sm text-gray-400">最新の取引履歴</p>
                            </div>
                        </div>
                        <GlassBadge variant="gradient">{orders.length} 件</GlassBadge>
                    </div>
                </FadeInView>

                <FadeInView delay={0.05}>
                    <GlassTabs
                        tabs={tabs}
                        activeTab={tab}
                        onChange={(id) => router.push(`/my/orders?tab=${id === "sales" ? "sales" : "purchases"}`)}
                    />
                </FadeInView>

                {errorMessage && (
                    <FadeInView delay={0.1}>
                        <GlassCard className="p-6 border border-red-200/60">
                            <p className="text-sm text-red-600">Error: {errorMessage}</p>
                        </GlassCard>
                    </FadeInView>
                )}

                <div className="space-y-4">
                    {orders.map((order, index) => (
                        <FadeInView key={order.id} delay={0.1 + index * 0.03}>
                            <GlassCard className="overflow-hidden">
                                <div className="p-6">
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex items-start gap-4 min-w-0">
                                            <motion.div
                                                whileHover={{ scale: 1.05, rotate: 3 }}
                                                className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center text-white shadow-lg shadow-violet-500/30"
                                            >
                                                {icon}
                                            </motion.div>
                                            <div className="min-w-0">
                                                <p className="text-sm text-gray-400">{formatDate(order.created_at)}</p>
                                                <p className="text-lg font-bold text-gray-800">
                                                    ¥{formatYen(order.amount_total)}
                                                </p>
                                                <p className="text-xs text-gray-400 truncate">
                                                    order_id: {order.id.slice(0, 8)}…
                                                </p>
                                            </div>
                                        </div>

                                        <GlassBadge variant={statusVariant(order.status)}>
                                            {order.status || "unknown"}
                                        </GlassBadge>
                                    </div>

                                    <div className="mt-4 flex flex-wrap items-center gap-3">
                                        {order.drop_id && (
                                            <GlassButton
                                                href={`/drops/${encodeURIComponent(order.drop_id)}`}
                                                variant="secondary"
                                                size="sm"
                                            >
                                                商品を見る
                                            </GlassButton>
                                        )}
                                        {order.paid_at && (
                                            <span className="text-xs text-gray-400">
                                                支払: {formatDate(order.paid_at)}
                                            </span>
                                        )}
                                        {order.stripe_session_id && (
                                            <span className="text-xs text-gray-300">
                                                session: {order.stripe_session_id.slice(0, 10)}…
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </GlassCard>
                        </FadeInView>
                    ))}

                    {orders.length === 0 && !errorMessage && (
                        <FadeInView delay={0.1}>
                            <GlassCard className="p-12 text-center">
                                <motion.div
                                    animate={{ y: [0, -6, 0] }}
                                    transition={{ duration: 2, repeat: Infinity }}
                                    className="text-5xl mb-4 opacity-30"
                                >
                                    {icon}
                                </motion.div>
                                <p className="text-gray-500">まだ{title}がありません。</p>
                            </GlassCard>
                        </FadeInView>
                    )}
                </div>
            </main>

            <div className="h-16" />
        </LightBackground>
    );
}
