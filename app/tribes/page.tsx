"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
    LightBackground,
    GlassNavbar,
    GlassCard,
    GlassButton,
    FadeInView,
    FloatingNavLight,
    GlassBadge,
} from "@/components/ui/glassmorphism-design";
import { STYLE_DRIVES } from "@/lib/styleDrive";

interface Tribe {
    id: string;
    name: string;
    description: string;
    icon: string;
    members: number;
    posts: number;
    joined: boolean;
    featured_items: { id: string; image_url: string }[];
}

const DRIVE_MAP = new Map(STYLE_DRIVES.map((d) => [d.id, d]));

const NAV_ITEMS = [
    { href: "/", label: "ホーム", icon: "🏠" },
    { href: "/products", label: "商品", icon: "👕" },
    { href: "/battle", label: "バトル", icon: "⚔️" },
    { href: "/tribes", label: "ドライブ", icon: "🏎️" },
    { href: "/my", label: "マイページ", icon: "👤" },
];

export default function TribesPage() {
    const [tribes, setTribes] = useState<Tribe[]>([]);
    const [loading, setLoading] = useState(true);
    const [myTribes, setMyTribes] = useState<string[]>([]);

    useEffect(() => {
        const fetchTribes = async () => {
            try {
                const res = await fetch("/api/tribes");
                const data = await res.json();
                setTribes(data.tribes || []);
                setMyTribes(data.myTribes || []);
            } catch (error) {
                console.error("Failed to fetch drives:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchTribes();
    }, []);

    const toggleJoin = async (tribeId: string) => {
        const isJoined = myTribes.includes(tribeId);

        try {
            await fetch(`/api/tribes/${tribeId}/join`, {
                method: isJoined ? "DELETE" : "POST",
            });

            if (isJoined) {
                setMyTribes((prev) => prev.filter((id) => id !== tribeId));
                setTribes((prev) =>
                    prev.map((t) =>
                        t.id === tribeId ? { ...t, members: Math.max(0, t.members - 1), joined: false } : t
                    )
                );
            } else {
                setMyTribes((prev) => [...prev, tribeId]);
                setTribes((prev) =>
                    prev.map((t) =>
                        t.id === tribeId ? { ...t, members: t.members + 1, joined: true } : t
                    )
                );
            }
        } catch (error) {
            console.error("Join/leave failed:", error);
        }
    };

    if (loading) {
        return (
            <LightBackground>
                <div className="min-h-screen flex items-center justify-center">
                    <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                        className="w-16 h-16 rounded-full border-4 border-violet-200 border-t-violet-500"
                    />
                </div>
            </LightBackground>
        );
    }

    const joinedTribes = tribes.filter((t) => myTribes.includes(t.id));
    const discoverTribes = tribes.filter((t) => !myTribes.includes(t.id));

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
                            <h1 className="text-xl font-bold tracking-tight text-gray-800">スタイルドライブ</h1>
                            <p className="text-xs text-gray-400">コーデの熱量でつながる</p>
                        </div>
                    </div>
                    <GlassBadge variant="gradient" size="sm">DRIVE</GlassBadge>
                </div>
            </GlassNavbar>

            <div className="h-24" />

            <main className="max-w-5xl mx-auto px-4 sm:px-6 pb-32">
                <FadeInView>
                    <GlassCard className="mb-10 overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-r from-violet-400/15 via-transparent to-cyan-400/15" />
                        <div className="relative p-8 text-center">
                            <h2 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">Drive your style.</h2>
                            <p className="text-gray-500">
                                ドライブごとにコーデ投票を集め、勝者はバトルへ。
                            </p>
                        </div>
                    </GlassCard>
                </FadeInView>

                {joinedTribes.length > 0 && (
                    <section className="mb-10">
                        <div className="flex items-center gap-2 mb-4">
                            <span className="text-xl">🚗</span>
                            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">My Drives</h3>
                        </div>
                        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {joinedTribes.map((tribe, index) => {
                                const drive = DRIVE_MAP.get(tribe.id);
                                return (
                                    <FadeInView key={tribe.id} delay={0.05 * index}>
                                        <Link href={`/tribes/${tribe.id}`} className="block group">
                                            <GlassCard hoverEffect className="overflow-hidden">
                                                <div className={`absolute inset-0 bg-gradient-to-br ${drive?.gradient || "from-violet-500 to-purple-500"} opacity-10`} />
                                                <div className="relative p-6">
                                                    <div className="flex items-center gap-4 mb-4">
                                                        <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${drive?.gradient || "from-violet-500 to-purple-500"} text-white flex items-center justify-center text-2xl shadow-lg`}>
                                                            {tribe.icon}
                                                        </div>
                                                        <div>
                                                            <div className="font-bold text-gray-800">{tribe.name}</div>
                                                            <div className="text-xs text-gray-500">{tribe.members.toLocaleString()} members</div>
                                                        </div>
                                                    </div>
                                                    <div className="flex -space-x-2">
                                                        {tribe.featured_items.slice(0, 4).map((item, i) => (
                                                            // eslint-disable-next-line @next/next/no-img-element
                                                            <img
                                                                key={i}
                                                                src={item.image_url}
                                                                alt=""
                                                                className="w-10 h-10 rounded-xl border-2 border-white/70 object-cover"
                                                            />
                                                        ))}
                                                    </div>
                                                </div>
                                            </GlassCard>
                                        </Link>
                                    </FadeInView>
                                );
                            })}
                        </div>
                    </section>
                )}

                <section>
                    <div className="flex items-center gap-2 mb-4">
                        <span className="text-xl">🛰️</span>
                        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Discover Drives</h3>
                    </div>
                    <div className="space-y-4">
                        {discoverTribes.map((tribe, index) => {
                            const drive = DRIVE_MAP.get(tribe.id);
                            return (
                                <FadeInView key={tribe.id} delay={0.05 * index}>
                                    <GlassCard className="overflow-hidden">
                                        <div className={`absolute inset-0 bg-gradient-to-r ${drive?.gradient || "from-violet-500 to-purple-500"} opacity-10`} />
                                        <div className="relative p-6">
                                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                                                <div className="flex items-center gap-4">
                                                    <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${drive?.gradient || "from-violet-500 to-purple-500"} text-white flex items-center justify-center text-2xl shadow-lg`}>
                                                        {tribe.icon}
                                                    </div>
                                                    <div>
                                                        <div className="font-bold text-gray-800 text-lg">{tribe.name}</div>
                                                        <div className="text-sm text-gray-500">{tribe.description}</div>
                                                        <div className="mt-2 text-xs text-gray-400">
                                                            👥 {tribe.members.toLocaleString()} ・ 📝 {tribe.posts} posts
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <GlassButton
                                                        variant={myTribes.includes(tribe.id) ? "ghost" : "secondary"}
                                                        size="sm"
                                                        onClick={() => toggleJoin(tribe.id)}
                                                    >
                                                        {myTribes.includes(tribe.id) ? "参加中" : "参加する"}
                                                    </GlassButton>
                                                    <GlassButton href={`/tribes/${tribe.id}`} variant="primary" size="sm">
                                                        入る
                                                    </GlassButton>
                                                </div>
                                            </div>
                                            <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
                                                {tribe.featured_items.map((item, i) => (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img
                                                        key={i}
                                                        src={item.image_url}
                                                        alt=""
                                                        className="w-20 h-20 rounded-xl object-cover flex-shrink-0"
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    </GlassCard>
                                </FadeInView>
                            );
                        })}
                    </div>
                </section>
            </main>

            <FloatingNavLight items={NAV_ITEMS} activeHref="/tribes" />
            <div className="h-24" />
        </LightBackground>
    );
}
