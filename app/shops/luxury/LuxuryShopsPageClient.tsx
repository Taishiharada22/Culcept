"use client";

import Link from "next/link";
import {
    LightBackground,
    GlassCard,
    GlassNavbar,
    FadeInView,
    FloatingNavLight,
    GlassButton,
} from "@/components/ui/glassmorphism-design";

type Brand = {
    lane_id: string;
    name: string;
    tagline: string;
    shop_url: string | null;
    shop_slug: string | null;
    color_primary: string | null;
    color_secondary: string | null;
    icon_emoji: string;
    logo_url?: string | null;
    images: string[];
};

const NAV_ITEMS = [
    { href: "/", label: "ホーム", icon: "🏠" },
    { href: "/products", label: "商品", icon: "👕" },
    { href: "/luxury", label: "Luxury", icon: "💎" },
    { href: "/calendar", label: "カレンダー", icon: "📅" },
    { href: "/my", label: "マイページ", icon: "👤" },
];

function hexToRgba(hex: string, alpha: number) {
    const h = hex.replace("#", "");
    if (h.length !== 6) return `rgba(0,0,0,${alpha})`;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}

export default function LuxuryShopsPageClient({ brands }: { brands: Brand[] }) {
    return (
        <LightBackground>
            <GlassNavbar>
                <div className="flex items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                        <Link
                            href="/"
                            className="w-10 h-10 rounded-xl bg-white/50 backdrop-blur-sm border border-white/60 flex items-center justify-center text-gray-500 hover:bg-white/80 transition-all duration-300 shadow-sm"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </Link>
                        <div>
                            <h1 className="text-xl font-bold tracking-tight text-gray-800">Luxury Shops</h1>
                            <p className="text-xs text-gray-400">8 curated maisons</p>
                        </div>
                    </div>

                    <div className="hidden md:flex items-center gap-2 rounded-full bg-white/70 border border-white/80 px-2 py-1">
                        <Link
                            href="/shops"
                            className="px-3 py-1 rounded-full text-xs font-semibold text-gray-600 hover:text-gray-900"
                        >
                            Vintage
                        </Link>
                        <Link
                            href="/shops/luxury"
                            className="px-3 py-1 rounded-full text-xs font-semibold bg-gray-900 text-white"
                        >
                            Luxury
                        </Link>
                    </div>

                    <GlassButton href="/shops" variant="secondary" size="sm">
                        ショップ一覧へ
                    </GlassButton>
                </div>
            </GlassNavbar>

            <div className="h-24" />

            <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 pb-28">
                <FadeInView>
                    <div className="mb-10 text-center">
                        <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
                            Luxury Showcase
                        </h2>
                        <p className="text-gray-500 mt-3 max-w-2xl mx-auto">
                            ブランドごとの世界観に合わせて、あなたが格納した写真を自動で流し込みます。
                        </p>
                    </div>
                </FadeInView>

                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                    {brands.map((brand, i) => {
                        const accent = brand.color_primary ?? "#9CA3AF";
                        const tint = hexToRgba(accent, 0.08);
                        const tintStrong = hexToRgba(accent, 0.16);
                        const images = brand.images ?? [];
                        let baseImages = images.slice(0, 12);
                        if (baseImages.length > 0) {
                            while (baseImages.length < 6) {
                                baseImages = baseImages.concat(baseImages);
                            }
                            baseImages = baseImages.slice(0, 12);
                        }
                        const loopImages = baseImages.length > 0 ? baseImages.concat(baseImages) : [];

                        return (
                            <FadeInView key={brand.lane_id} delay={i * 0.05}>
                                <GlassCard className="overflow-hidden transition-all hover:shadow-xl group">
                                    <div className="relative h-40">
                                        <div
                                            className="absolute inset-0"
                                            style={{
                                                background: `linear-gradient(120deg, ${tintStrong}, rgba(255,255,255,0.35))`,
                                            }}
                                        />
                                        <div className="absolute inset-0" style={{ backgroundColor: tint }} />

                                        <div className="absolute inset-0 luxury-marquee-container px-3 py-3">
                                            {loopImages.length > 0 ? (
                                                <div className="luxury-marquee flex items-center gap-3 group-hover:[animation-play-state:paused]">
                                                    {loopImages.map((src, idx) => (
                                                        // eslint-disable-next-line @next/next/no-img-element
                                                        <img
                                                            key={`${brand.lane_id}-m-${idx}`}
                                                            src={src}
                                                            alt=""
                                                            className="h-24 w-16 rounded-xl object-cover shadow-sm flex-none"
                                                            loading="lazy"
                                                        />
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="h-full w-full flex items-center justify-center text-sm text-gray-400">
                                                    No Images
                                                </div>
                                            )}
                                        </div>

                                        <div className="absolute inset-y-0 left-0 w-10 pointer-events-none bg-gradient-to-r from-white/90 to-transparent" />
                                        <div className="absolute inset-y-0 right-0 w-10 pointer-events-none bg-gradient-to-l from-white/90 to-transparent" />

                                        <div className="absolute right-3 top-3 text-[10px] font-semibold tracking-widest text-white/80">
                                            LUXURY
                                        </div>
                                    </div>

                                    <div className="p-4">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <span
                                                    className="w-9 h-9 rounded-full flex items-center justify-center text-lg overflow-hidden"
                                                    style={{ backgroundColor: tintStrong }}
                                                >
                                                    {brand.logo_url ? (
                                                        // eslint-disable-next-line @next/next/no-img-element
                                                        <img
                                                            src={brand.logo_url}
                                                            alt={brand.name}
                                                            className="w-7 h-7 object-contain"
                                                        />
                                                    ) : (
                                                        brand.icon_emoji
                                                    )}
                                                </span>
                                                <div className="min-w-0">
                                                    <div className="font-semibold text-gray-900 truncate">{brand.name}</div>
                                                    <div className="text-xs text-gray-400 truncate">{brand.tagline}</div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="mt-4 flex items-center gap-2">
                                            {brand.shop_url && (
                                                <a
                                                    href={brand.shop_url}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="flex-1 text-center rounded-xl border border-white/80 bg-white/80 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-white"
                                                >
                                                    公式サイト
                                                </a>
                                            )}
                                            {!brand.shop_url && brand.shop_slug && (
                                                <Link
                                                    href={`/shops/${encodeURIComponent(String(brand.shop_slug))}`}
                                                    className="flex-1 text-center rounded-xl border border-white/80 bg-white/80 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-white"
                                                >
                                                    ショップを見る
                                                </Link>
                                            )}
                                        </div>
                                    </div>
                                </GlassCard>
                            </FadeInView>
                        );
                    })}
                </div>
            </main>

            <FloatingNavLight items={NAV_ITEMS} />
            <div className="h-24" />
        </LightBackground>
    );
}
