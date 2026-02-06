// app/shops/ShopsPageClient.tsx
"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
    LightBackground,
    GlassCard,
    GlassButton,
    GlassNavbar,
    FadeInView,
    FloatingNavLight,
} from "@/components/ui/glassmorphism-design";

type ShopRow = {
    slug: string;
    name_ja: string | null;
    name_en: string | null;
    avatar_url: string | null;
    headline: string | null;
    style_tags: string[];
    cover_url: string | null;
    banner_url: string | null;
    is_active: boolean;
};

interface Props {
    shops: ShopRow[];
    topTags: string[];
    q: string;
    tag: string;
    error: string | null;
}

const NAV_ITEMS = [
    { href: "/", label: "ホーム", icon: "🏠" },
    { href: "/products", label: "商品", icon: "👕" },
    { href: "/luxury", label: "Luxury", icon: "💎" },
    { href: "/calendar", label: "カレンダー", icon: "📅" },
    { href: "/my", label: "マイページ", icon: "👤" },
];


export default function ShopsPageClient({ shops, topTags, q, tag, error }: Props) {
    const handleSearch = (value: string) => {
        const params = new URLSearchParams();
        if (value.trim()) params.set("q", value);
        if (tag) params.set("tag", tag);
        window.location.href = `/shops${params.toString() ? `?${params.toString()}` : ""}`;
    };

    return (
        <LightBackground>
            {/* ヘッダー */}
            <GlassNavbar>
                <div className="flex items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                        <Link
                            href="/"
                            className="w-10 h-10 rounded-xl bg-white/50 backdrop-blur-sm border border-white/60 flex items-center justify-center text-gray-500 hover:bg-white/80 hover:text-gray-800 transition-all duration-300 shadow-sm"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </Link>
                        <div>
                            <h1 className="text-xl font-bold tracking-tight text-gray-800">Shops</h1>
                            <p className="text-xs text-gray-400">{shops.length} curators</p>
                        </div>
                    </div>

                    <div className="hidden md:flex items-center gap-2 rounded-full bg-white/70 border border-white/80 px-2 py-1">
                        <Link
                            href="/shops"
                            className="px-3 py-1 rounded-full text-xs font-semibold bg-gray-900 text-white"
                        >
                            Vintage
                        </Link>
                        <Link
                            href="/shops/luxury"
                            className="px-3 py-1 rounded-full text-xs font-semibold text-gray-600 hover:text-gray-900"
                        >
                            Luxury
                        </Link>
                    </div>

                    {/* 検索 (デスクトップ) */}
                    <div className="hidden md:block flex-1 max-w-md">
                        <div className="relative group">
                            <input
                                type="text"
                                defaultValue={q}
                                placeholder="ショップを検索..."
                                onKeyDown={(e) => e.key === "Enter" && handleSearch((e.target as HTMLInputElement).value)}
                                className="w-full rounded-xl bg-white/60 backdrop-blur-sm border border-white/80 pl-11 pr-4 py-3 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-violet-400 focus:bg-white/80 transition-all duration-300 shadow-sm"
                            />
                            <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-violet-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                        </div>
                    </div>

                    <GlassButton href="/shops/me" variant="primary" size="md">
                        ショップを開設
                    </GlassButton>
                </div>

                {/* モバイル検索 */}
                <div className="md:hidden mt-4">
                    <div className="relative">
                        <input
                            type="text"
                            defaultValue={q}
                            placeholder="検索..."
                            onKeyDown={(e) => e.key === "Enter" && handleSearch((e.target as HTMLInputElement).value)}
                            className="w-full rounded-xl bg-white/60 backdrop-blur-sm border border-white/80 pl-11 pr-4 py-3 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-violet-400 transition-all shadow-sm"
                        />
                        <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>
                </div>
            </GlassNavbar>

            {/* スペーサー */}
            <div className="h-28 md:h-20" />

            <div className="md:hidden px-4 sm:px-6 -mt-6 mb-4">
                <div className="flex items-center gap-2 rounded-full bg-white/70 border border-white/80 px-2 py-1 w-fit">
                    <Link
                        href="/shops"
                        className="px-3 py-1 rounded-full text-xs font-semibold bg-gray-900 text-white"
                    >
                        Vintage
                    </Link>
                    <Link
                        href="/shops/luxury"
                        className="px-3 py-1 rounded-full text-xs font-semibold text-gray-600 hover:text-gray-900"
                    >
                        Luxury
                    </Link>
                </div>
            </div>

            {/* タグフィルター */}
            {topTags.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="sticky top-[72px] md:top-[72px] z-40 bg-white/60 backdrop-blur-xl border-b border-white/80"
                >
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
                        <div className="flex items-center gap-3 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                            <Link
                                href={`/shops${q ? `?q=${encodeURIComponent(q)}` : ""}`}
                                className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
                                    !tag
                                        ? "bg-gray-800 text-white shadow-lg"
                                        : "bg-white/70 text-gray-600 hover:bg-white hover:text-gray-800 border border-white/80"
                                }`}
                            >
                                All
                            </Link>
                            {topTags.map((t) => (
                                <Link
                                    key={t}
                                    href={`/shops?${new URLSearchParams({ ...(q ? { q } : {}), tag: t }).toString()}`}
                                    className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
                                        tag === t
                                            ? "bg-gradient-to-r from-violet-500 to-indigo-500 text-white shadow-lg shadow-violet-500/30"
                                            : "bg-white/70 text-gray-600 hover:bg-white hover:text-gray-800 border border-white/80"
                                    }`}
                                >
                                    #{t}
                                </Link>
                            ))}
                        </div>
                    </div>
                </motion.div>
            )}

            {/* メインコンテンツ */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
                {error && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="rounded-2xl bg-red-50 border border-red-200 p-6 mb-8"
                    >
                        <p className="text-sm text-red-600">{error}</p>
                    </motion.div>
                )}

                {shops.length > 0 ? (
                    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                        {shops.map((shop, index) => {
                            const name = shop.name_ja || shop.name_en || shop.slug;
                            const cover = shop.cover_url || shop.banner_url;

                            return (
                                <FadeInView key={shop.slug} delay={index * 0.05}>
                                    <Link href={`/shops/${shop.slug}`} className="block group">
                                        <GlassCard className="overflow-hidden hover:shadow-xl transition-all duration-300">
                                            {/* カバー画像 */}
                                            <div className="h-36 bg-gradient-to-br from-violet-100 to-indigo-100 relative overflow-hidden">
                                                {cover ? (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img
                                                        src={cover}
                                                        alt=""
                                                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                                    />
                                                ) : (
                                                    <div className="absolute inset-0 flex items-center justify-center">
                                                        <span className="text-5xl opacity-30">🏪</span>
                                                    </div>
                                                )}
                                                {/* グラデーションオーバーレイ */}
                                                <div className="absolute inset-0 bg-gradient-to-t from-white via-transparent to-transparent" />
                                            </div>

                                            {/* 情報 */}
                                            <div className="p-5 relative">
                                                {/* アバター */}
                                                <div className="absolute -top-10 left-5">
                                                    {shop.avatar_url ? (
                                                        // eslint-disable-next-line @next/next/no-img-element
                                                        <img
                                                            src={shop.avatar_url}
                                                            alt={name}
                                                            className="w-16 h-16 rounded-2xl border-4 border-white bg-gray-100 object-cover shadow-xl"
                                                        />
                                                    ) : (
                                                        <div className="w-16 h-16 rounded-2xl border-4 border-white bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center text-2xl shadow-xl">
                                                            🏪
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="pt-8">
                                                    <h3 className="text-lg font-bold text-gray-800 truncate">{name}</h3>
                                                    {shop.headline && (
                                                        <p className="text-sm text-gray-500 mt-1 line-clamp-2 leading-relaxed">
                                                            {shop.headline}
                                                        </p>
                                                    )}

                                                    {shop.style_tags.length > 0 && (
                                                        <div className="flex flex-wrap gap-2 mt-4">
                                                            {shop.style_tags.slice(0, 3).map((t) => (
                                                                <span
                                                                    key={t}
                                                                    className="px-2.5 py-1 rounded-full bg-gray-100 text-xs text-gray-500 border border-gray-200"
                                                                >
                                                                    #{t}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </GlassCard>
                                    </Link>
                                </FadeInView>
                            );
                        })}
                    </div>
                ) : (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="text-center py-32"
                    >
                        <motion.div
                            animate={{ y: [0, -10, 0] }}
                            transition={{ duration: 2, repeat: Infinity }}
                            className="text-6xl mb-6 opacity-50"
                        >
                            🏪
                        </motion.div>
                        <h3 className="text-2xl font-bold text-gray-700 mb-3">
                            ショップが見つかりませんでした
                        </h3>
                        <p className="text-gray-400 mb-8">検索条件を変えてお試しください</p>
                        <GlassButton href="/shops" variant="primary" size="lg">
                            すべてのショップを見る
                        </GlassButton>
                    </motion.div>
                )}
            </main>

            {/* フローティングナビ */}
            <FloatingNavLight items={NAV_ITEMS} />

            <div className="h-24" />
        </LightBackground>
    );
}
