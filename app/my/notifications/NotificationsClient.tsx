// app/my/notifications/NotificationsClient.tsx
"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
    LightBackground,
    GlassNavbar,
    GlassCard,
    GlassButton,
    GlassBadge,
    FadeInView,
} from "@/components/ui/glassmorphism-design";

type NotificationRow = {
    id: string;
    type: string | null;
    title: string | null;
    body: string | null;
    link: string | null;
    created_at: string | null;
    read_at: string | null;
};

type Props = {
    isLoggedIn: boolean;
    notifications: NotificationRow[];
    errorMessage?: string | null;
};

const TYPE_GRADIENT: Record<string, string> = {
    order: "from-emerald-400 to-teal-500",
    message: "from-violet-400 to-indigo-500",
    follow: "from-blue-400 to-cyan-500",
    like: "from-rose-400 to-pink-500",
    price: "from-amber-400 to-orange-500",
    default: "from-slate-400 to-slate-500",
};

const TYPE_ICON: Record<string, string> = {
    order: "🛒",
    message: "💬",
    follow: "👤",
    like: "❤️",
    price: "💰",
    default: "🔔",
};

function formatDate(value: string | null) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString("ja-JP");
}

export default function NotificationsClient({ isLoggedIn, notifications, errorMessage }: Props) {
    const headingStyle = { fontFamily: "'Cormorant Garamond', serif" };

    if (!isLoggedIn) {
        return (
            <LightBackground>
                <div className="min-h-screen flex items-center justify-center px-4 py-12">
                    <GlassCard className="max-w-md w-full text-center p-10">
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ duration: 0.4 }}
                            className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-3xl text-white shadow-lg shadow-amber-500/30"
                        >
                            🔔
                        </motion.div>
                        <h1 className="text-2xl font-bold text-gray-800 mb-2" style={headingStyle}>
                            通知
                        </h1>
                        <p className="text-gray-500 mb-8">ログインしてください。</p>
                        <GlassButton href="/login?next=/my/notifications" variant="gradient" size="lg" className="w-full justify-center">
                            ログイン
                        </GlassButton>
                    </GlassCard>
                </div>
            </LightBackground>
        );
    }

    return (
        <LightBackground>
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
                            <h1 className="text-xl font-bold tracking-tight text-gray-800" style={headingStyle}>
                                通知
                            </h1>
                            <p className="text-xs text-gray-400">お知らせ一覧</p>
                        </div>
                    </div>
                    <GlassButton href="/settings/notifications" variant="secondary" size="sm">
                        ⚙️ 設定
                    </GlassButton>
                </div>
            </GlassNavbar>

            <div className="h-20" />

            <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
                {errorMessage && (
                    <FadeInView>
                        <GlassCard className="p-6 border border-red-200/60">
                            <p className="text-sm text-red-600">Error: {errorMessage}</p>
                        </GlassCard>
                    </FadeInView>
                )}

                {notifications.length === 0 && !errorMessage ? (
                    <FadeInView>
                        <GlassCard className="p-12 text-center">
                            <motion.div
                                animate={{ y: [0, -6, 0] }}
                                transition={{ duration: 2, repeat: Infinity }}
                                className="text-5xl mb-4 opacity-30"
                            >
                                🔔
                            </motion.div>
                            <p className="text-gray-500">まだ通知がありません。</p>
                        </GlassCard>
                    </FadeInView>
                ) : (
                    <div className="space-y-3">
                        {notifications.map((n, index) => {
                            const typeKey = (n.type || "default").toLowerCase();
                            const gradient = TYPE_GRADIENT[typeKey] ?? TYPE_GRADIENT.default;
                            const icon = TYPE_ICON[typeKey] ?? TYPE_ICON.default;

                            return (
                                <FadeInView key={n.id} delay={0.05 + index * 0.03}>
                                    <GlassCard className={`p-5 transition-all ${n.read_at ? "opacity-70" : ""}`}>
                                        <div className="flex items-start gap-4">
                                            <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center text-xl shadow-md shrink-0`}>
                                                {icon}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between gap-2 mb-1">
                                                    <h3 className="font-bold text-gray-800 truncate">
                                                        {n.title || "通知"}
                                                    </h3>
                                                    {!n.read_at && (
                                                        <GlassBadge variant="gradient" size="sm">
                                                            NEW
                                                        </GlassBadge>
                                                    )}
                                                </div>
                                                {n.body && (
                                                    <p className="text-sm text-gray-600 line-clamp-2">{n.body}</p>
                                                )}
                                                <div className="mt-3 flex items-center justify-between gap-3">
                                                    <span className="text-xs text-gray-400">
                                                        {formatDate(n.created_at)}
                                                    </span>
                                                    {n.link && (
                                                        <GlassButton href={n.link} variant="ghost" size="sm">
                                                            詳細を見る →
                                                        </GlassButton>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </GlassCard>
                                </FadeInView>
                            );
                        })}
                    </div>
                )}
            </main>

            <div className="h-16" />
        </LightBackground>
    );
}
