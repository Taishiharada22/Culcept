"use client";

import Link from "next/link";
import {
    LightBackground,
    GlassNavbar,
    GlassCard,
    GlassButton,
    GlassBadge,
    FadeInView,
    FloatingNavLight,
} from "@/components/ui/glassmorphism-design";

type RankedItem = {
    card_id: string;
    image_url: string;
    tags: string[];
    likes: number;
    impressions: number;
    ctr: number;
};

type RankedShop = {
    shop_id: string;
    shop_name: string;
    avatar_url: string;
    followers: number;
    likes: number;
};

type Props = {
    rankedCards: RankedItem[];
    rankedShops: RankedShop[];
};

const NAV_ITEMS = [
    { href: "/", label: "ホーム", icon: "🏠" },
    { href: "/ranking", label: "ランキング", icon: "🏆" },
    { href: "/battle", label: "バトル", icon: "⚔️" },
    { href: "/collab", label: "コラボ", icon: "🤝" },
    { href: "/my", label: "マイページ", icon: "👤" },
];

export default function RankingPageClient({ rankedCards, rankedShops }: Props) {
    return (
        <LightBackground>
            <GlassNavbar>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link
                            href="/"
                            className="w-10 h-10 rounded-xl bg-white/50 backdrop-blur-sm border border-white/60 flex items-center justify-center text-gray-500 hover:bg-white/80 transition-all shadow-sm"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </Link>
                        <div>
                            <h1 className="text-xl font-bold tracking-tight text-gray-800">週間ランキング</h1>
                            <p className="text-xs text-gray-400">今週人気のアイテム・ショップ</p>
                        </div>
                    </div>
                    <GlassBadge variant="gradient" size="sm">RANKING</GlassBadge>
                </div>
            </GlassNavbar>

            <div className="h-24" />

            <main className="max-w-6xl mx-auto px-4 sm:px-6 pb-32">
                <FadeInView>
                    <GlassCard className="mb-8 overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-r from-red-400/15 via-transparent to-orange-400/15" />
                        <div className="relative p-8 text-center">
                            <h2 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">Top Picks This Week</h2>
                            <p className="text-gray-500">今週最も人気のアイテムとショップをチェック</p>
                        </div>
                    </GlassCard>
                </FadeInView>

                <div className="flex flex-wrap justify-center gap-2 mb-8">
                    <GlassButton variant="gradient" size="sm">🔥 人気アイテム</GlassButton>
                    <GlassButton variant="secondary" size="sm">📈 急上昇</GlassButton>
                    <GlassButton variant="secondary" size="sm">🏪 ショップ</GlassButton>
                </div>

                <FadeInView>
                    <GlassCard className="p-6 mb-8">
                        <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-gray-800">
                            <span>🔥</span> 人気アイテム TOP20
                        </h2>

                        {rankedCards.length > 0 ? (
                            <div className="space-y-3">
                                {rankedCards.map((item, index) => (
                                    <RankingCard key={item.card_id} item={item} rank={index + 1} />
                                ))}
                            </div>
                        ) : (
                            <p className="text-gray-500 text-center py-8">
                                今週のデータはまだありません
                            </p>
                        )}
                    </GlassCard>
                </FadeInView>

                {rankedShops.length > 0 && (
                    <FadeInView>
                        <GlassCard className="p-6">
                            <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-gray-800">
                                <span>🏪</span> 人気ショップ
                            </h2>
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                                {rankedShops.map((shop, index) => (
                                    <ShopRankCard key={shop.shop_id} shop={shop} rank={index + 1} />
                                ))}
                            </div>
                        </GlassCard>
                    </FadeInView>
                )}
            </main>

            <FloatingNavLight items={NAV_ITEMS} activeHref="/ranking" />
            <div className="h-24" />
        </LightBackground>
    );
}

function RankingCard({ item, rank }: { item: RankedItem; rank: number }) {
    const medalColors: Record<number, string> = {
        1: "bg-amber-400 text-amber-900",
        2: "bg-slate-300 text-slate-700",
        3: "bg-orange-300 text-orange-800",
    };

    return (
        <div className="flex items-center gap-4 p-3 rounded-xl hover:bg-white/70 transition-colors">
            <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg ${
                    medalColors[rank] || "bg-white/70 text-gray-600 border border-white/80"
                }`}
            >
                {rank}
            </div>

            <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 border border-white/70 bg-white/70">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.image_url} alt={item.card_id} className="w-full h-full object-cover" />
            </div>

            <div className="flex-1 min-w-0">
                <h3 className="font-medium truncate text-gray-800">
                    {item.card_id.replace(/_/g, " ")}
                </h3>
                <div className="flex flex-wrap gap-1 mt-1">
                    {item.tags.slice(0, 3).map((tag, i) => (
                        <span
                            key={i}
                            className="text-xs bg-white/70 text-gray-600 px-2 py-0.5 rounded-full border border-white/80"
                        >
                            {tag}
                        </span>
                    ))}
                </div>
            </div>

            <div className="text-right flex-shrink-0">
                <div className="text-lg font-bold text-rose-500">
                    ❤️ {item.likes}
                </div>
                <div className="text-xs text-gray-500">
                    {item.ctr.toFixed(1)}% CTR
                </div>
            </div>
        </div>
    );
}

function ShopRankCard({ shop, rank }: { shop: RankedShop; rank: number }) {
    return (
        <Link
            href={`/shops/${shop.shop_id}`}
            className="bg-white/70 rounded-xl p-4 text-center hover:bg-white transition-colors border border-white/80"
        >
            <div className="relative inline-block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={shop.avatar_url || "/default-avatar.png"}
                    alt={shop.shop_name}
                    className="w-16 h-16 rounded-full mx-auto object-cover border border-white"
                />
                <span
                    className={`absolute -top-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        rank <= 3 ? "bg-amber-400" : "bg-slate-300"
                    }`}
                >
                    {rank}
                </span>
            </div>
            <h3 className="font-medium text-sm mt-2 truncate text-gray-700">{shop.shop_name}</h3>
            <p className="text-xs text-gray-500 mt-1">❤️ {shop.likes}</p>
        </Link>
    );
}
