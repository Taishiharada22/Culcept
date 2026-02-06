// app/favorites/FavoritesClient.tsx
"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
    LightBackground,
    GlassCard,
    GlassNavbar,
    GlassButton,
    GlassBadge,
    FadeInView,
} from "@/components/ui/glassmorphism-design";

type SavedItem = {
    id: string;
    created_at: string;
    target_type: string;
    target_id: string;
    payload: {
        card_id?: string;
        image_url?: string;
        cover_image_url?: string;
        title?: string;
        brand?: string;
        price?: number;
        tags?: string[];
    };
    explain?: string;
};

type Props = {
    items: SavedItem[];
};

function formatTimeAgo(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "たった今";
    if (diffMins < 60) return `${diffMins}分前`;
    if (diffHours < 24) return `${diffHours}時間前`;
    if (diffDays < 7) return `${diffDays}日前`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}週間前`;
    return `${Math.floor(diffDays / 30)}ヶ月前`;
}

function buildHref(item: SavedItem) {
    if (item.target_type === "drop") return `/drops/${item.target_id}`;
    if (item.target_type === "card") return "/start";
    return "#";
}

export default function FavoritesClient({ items }: Props) {
    const headingStyle = { fontFamily: "'Cormorant Garamond', serif" };

    return (
        <LightBackground>
            {/* ヘッダー */}
            <GlassNavbar>
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <Link
                            href="/my"
                            className="w-10 h-10 rounded-xl bg-white/50 backdrop-blur-sm border border-white/60 flex items-center justify-center text-slate-500 hover:bg-white/80 hover:text-slate-800 transition-all duration-300 shadow-sm"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </Link>
                        <div>
                            <h1
                                className="text-xl font-bold tracking-tight text-slate-900"
                                style={headingStyle}
                            >
                                お気に入り
                            </h1>
                            <p className="text-xs text-slate-400">保存したアイテム</p>
                        </div>
                    </div>
                    <GlassButton href="/start" variant="gradient" size="sm">
                        スワイプを始める
                    </GlassButton>
                </div>
            </GlassNavbar>

            <div className="h-20" />

            <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
                <FadeInView>
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-rose-400 to-pink-500 flex items-center justify-center text-xl text-white shadow-lg shadow-rose-500/30">
                                ❤️
                            </div>
                            <div>
                                <h2
                                    className="text-2xl font-bold tracking-tight text-slate-900"
                                    style={headingStyle}
                                >
                                    お気に入り
                                </h2>
                                <p className="text-sm text-slate-500">いいねしたアイテム一覧</p>
                            </div>
                        </div>
                        <GlassBadge variant="gradient">{items.length} 件</GlassBadge>
                    </div>
                </FadeInView>

                {items.length === 0 ? (
                    <FadeInView delay={0.1}>
                        <GlassCard className="p-12 text-center">
                            <motion.div
                                animate={{ y: [0, -6, 0] }}
                                transition={{ duration: 2, repeat: Infinity }}
                                className="text-6xl mb-4 opacity-30"
                            >
                                💔
                            </motion.div>
                            <p className="text-slate-500 mb-6">まだお気に入りがありません</p>
                            <GlassButton href="/start" variant="gradient" size="lg">
                                スワイプを始める
                            </GlassButton>
                        </GlassCard>
                    </FadeInView>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {items.map((item, index) => {
                            const imageUrl =
                                item.payload.image_url ||
                                item.payload.cover_image_url ||
                                "/placeholder.png";
                            const title = item.payload.title || item.payload.card_id || "アイテム";
                            const tags = item.payload.tags || [];
                            const timeAgo = formatTimeAgo(new Date(item.created_at));

                            return (
                                <FadeInView key={item.id} delay={0.05 + index * 0.03}>
                                    <Link href={buildHref(item)} className="block group">
                                        <GlassCard padding="none" className="overflow-hidden">
                                            <div className="relative aspect-square overflow-hidden">
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img
                                                    src={imageUrl}
                                                    alt={title}
                                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                                />
                                                <div className="absolute top-3 right-3">
                                                    <GlassBadge variant="gradient" size="sm">
                                                        ❤️
                                                    </GlassBadge>
                                                </div>
                                            </div>
                                            <div className="p-4">
                                                <h3 className="font-semibold text-sm text-slate-900 truncate">
                                                    {title}
                                                </h3>
                                                {item.payload.brand && (
                                                    <p className="text-xs text-slate-500 truncate">
                                                        {item.payload.brand}
                                                    </p>
                                                )}
                                                {item.payload.price && (
                                                    <p className="text-base font-bold text-slate-900 mt-2">
                                                        ¥{item.payload.price.toLocaleString("ja-JP")}
                                                    </p>
                                                )}
                                                {tags.length > 0 && (
                                                    <div className="flex flex-wrap gap-1.5 mt-3">
                                                        {tags.slice(0, 3).map((tag, i) => (
                                                            <span
                                                                key={`${item.id}-tag-${i}`}
                                                                className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full"
                                                            >
                                                                {tag}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                                <p className="text-xs text-slate-400 mt-3">{timeAgo}</p>
                                            </div>
                                        </GlassCard>
                                    </Link>
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
