// app/drops/DropsPageWrapper.tsx
"use client";

import { ReactNode, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import {
    LightBackground,
    GlassBadge,
    GlassButton,
    GlassCard,
    GlassInput,
} from "@/components/ui/glassmorphism-design";

interface DropsPageWrapperProps {
    children: ReactNode;
    imp: string;
    q: string;
    shop: string;
    count: number;
    hasError: boolean;
    errorMessage?: string;
}

export default function DropsPageWrapper({
    children,
    imp,
    q,
    shop,
    count,
    hasError,
    errorMessage,
}: DropsPageWrapperProps) {
    const [searchValue, setSearchValue] = useState(q);

    const addQuery = (url: string, params: Record<string, string | null | undefined>) => {
        const qs = Object.entries(params)
            .filter(([, v]) => v != null && String(v).trim() !== "")
            .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
            .join("&");
        if (!qs) return url;
        return url + (url.includes("?") ? "&" : "?") + qs;
    };

    const handleSearch = (value: string) => {
        const next = addQuery("/drops", {
            imp: imp || null,
            q: value?.trim() ? value.trim() : null,
            shop: shop || null,
        });
        window.location.href = next;
    };

    return (
        <LightBackground>
            <div className="mx-auto max-w-7xl px-4 sm:px-6 pt-6 pb-16">
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                >
                    <GlassCard variant="elevated" className="p-6 md:p-8">
                        <div className="flex flex-wrap items-center justify-between gap-6">
                            <div className="flex items-center gap-4">
                                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-cyan-500 flex items-center justify-center text-2xl text-white shadow-lg shadow-fuchsia-500/30">
                                    🛍️
                                </div>
                                <div>
                                    <h1 className="text-3xl sm:text-4xl font-bold text-slate-900">Products</h1>
                                    <p className="text-sm text-slate-500">
                                        Discover curated items tailored for your style
                                    </p>
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                                <GlassButton
                                    href={addQuery("/drops/new", { imp })}
                                    variant="gradient"
                                    size="sm"
                                    icon={<Sparkles className="w-4 h-4" />}
                                >
                                    List Product
                                </GlassButton>
                                <GlassButton
                                    href={addQuery("/shops/me", { imp })}
                                    variant="secondary"
                                    size="sm"
                                >
                                    My Store
                                </GlassButton>
                                <GlassButton
                                    href={addQuery("/me/saved", { imp })}
                                    variant="ghost"
                                    size="sm"
                                >
                                    ❤️ Saved
                                </GlassButton>
                            </div>
                        </div>

                        <div className="mt-6 flex flex-col gap-4 md:flex-row md:items-center">
                            <div className="flex-1">
                                <GlassInput
                                    placeholder="Search products, brands, styles..."
                                    value={searchValue}
                                    onChange={setSearchValue}
                                    onSubmit={handleSearch}
                                    icon={
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                        </svg>
                                    }
                                />
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                <GlassBadge size="sm" className="bg-white/70 text-slate-600 border-white/70">
                                    {count} items
                                </GlassBadge>
                                {(shop || q) && (
                                    <Link
                                        href={addQuery("/drops", { imp })}
                                        className="rounded-full border border-white/70 bg-white/60 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:bg-white"
                                    >
                                        Clear Filters
                                    </Link>
                                )}
                                <GlassButton size="sm" variant="secondary" onClick={() => handleSearch(searchValue)}>
                                    Search
                                </GlassButton>
                            </div>
                        </div>

                        {(shop || q) && (
                            <div className="mt-4 flex flex-wrap gap-2">
                                {shop && (
                                    <GlassBadge variant="info" size="sm">
                                        Store: {shop}
                                    </GlassBadge>
                                )}
                                {q && (
                                    <GlassBadge variant="info" size="sm">
                                        Search: "{q}"
                                    </GlassBadge>
                                )}
                            </div>
                        )}
                    </GlassCard>
                </motion.div>

                {hasError && (
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-6"
                    >
                        <GlassCard variant="bordered" className="p-4 text-sm font-semibold text-rose-600">
                            <div className="text-base font-bold">Error</div>
                            <div className="mt-1 text-sm text-rose-500">{errorMessage}</div>
                        </GlassCard>
                    </motion.div>
                )}

                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.1 }}
                    className="mt-8"
                >
                    {children}
                </motion.div>
            </div>
        </LightBackground>
    );
}
