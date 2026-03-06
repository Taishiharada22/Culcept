"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
    LightBackground,
    GlassNavbar,
    GlassCard,
    GlassBadge,
    FadeInView,
    FloatingNavLight,
} from "@/components/ui/glassmorphism-design";

type MyDrive = {
    id: string;
    name: string;
    description: string;
    icon: string;
    gradient: string;
    createdAt: string;
};

const OFFICIAL_DRIVES = [
    { id: "street", name: "ストリート", description: "ストリートカルチャーを楽しむコミュニティ", icon: "🧢", gradient: "from-orange-400 to-red-500" },
    { id: "minimal", name: "ミニマル", description: "シンプル・クリーンな美学", icon: "⬜", gradient: "from-slate-400 to-gray-600" },
    { id: "vintage", name: "ヴィンテージ", description: "クラシック&レトロの魅力", icon: "🎸", gradient: "from-amber-400 to-yellow-500" },
    { id: "sporty", name: "スポーティ", description: "アクティブ&ダイナミック", icon: "🏃", gradient: "from-green-400 to-emerald-500" },
    { id: "luxury", name: "ラグジュアリー", description: "プレミアム&ハイエンド", icon: "💎", gradient: "from-purple-400 to-pink-500" },
    { id: "daily", name: "デイリー", description: "日常のカジュアルスタイル", icon: "👕", gradient: "from-blue-400 to-cyan-500" },
];

const MY_DRIVES_KEY = "culcept_my_drives_v1";

export default function StyleDrivePage() {
    const [myDrives, setMyDrives] = React.useState<MyDrive[]>([]);
    const [activeTab, setActiveTab] = React.useState<"official" | "community">("official");

    React.useEffect(() => {
        try {
            const raw = localStorage.getItem(MY_DRIVES_KEY);
            if (raw) setMyDrives(JSON.parse(raw));
        } catch { /* ignore */ }
    }, []);

    const removeDrive = (id: string) => {
        const next = myDrives.filter((d) => d.id !== id);
        setMyDrives(next);
        localStorage.setItem(MY_DRIVES_KEY, JSON.stringify(next));
    };

    return (
        <LightBackground>
            <GlassNavbar>
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <Link
                            href="/"
                            className="w-10 h-10 rounded-xl bg-white/50 backdrop-blur-sm border border-white/60 flex items-center justify-center text-slate-500 hover:bg-white/80 transition-all no-underline"
                        >
                            ←
                        </Link>
                        <div>
                            <h1 className="text-xl font-black tracking-tight text-slate-900">Pulse+</h1>
                            <p className="text-[11px] text-slate-400">スタイルコミュニティに参加 & 自分のPulse+を作成</p>
                        </div>
                    </div>
                    <Link
                        href="/style-drive/create"
                        className="rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white px-4 py-2 text-xs font-black hover:opacity-90 transition shadow-md no-underline"
                    >
                        + 新規作成
                    </Link>
                </div>
            </GlassNavbar>

            <div className="h-20" />

            <main className="mx-auto max-w-4xl px-4 py-6 pb-28 space-y-6">
                {/* タブ */}
                <div className="flex gap-2">
                    {[
                        { id: "official" as const, label: "公式Pulse+", icon: "🏆" },
                        { id: "community" as const, label: `My Pulse+ (${myDrives.length})`, icon: "🎨" },
                    ].map((t) => (
                        <button
                            key={t.id}
                            onClick={() => setActiveTab(t.id)}
                            className={`rounded-xl px-4 py-2 text-sm font-bold transition ${activeTab === t.id
                                    ? "bg-slate-900 text-white shadow-md"
                                    : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                                }`}
                        >
                            {t.icon} {t.label}
                        </button>
                    ))}
                </div>

                {/* 公式ドライブ */}
                {activeTab === "official" && (
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {OFFICIAL_DRIVES.map((drive, i) => (
                            <FadeInView key={drive.id} delay={i * 0.05}>
                                <Link href={`/tribes/${drive.id}`} className="block group no-underline">
                                    <GlassCard variant="elevated" hoverEffect className="overflow-hidden">
                                        <div className={`h-28 bg-gradient-to-br ${drive.gradient} flex items-center justify-center relative`}>
                                            <span className="text-5xl drop-shadow-lg">{drive.icon}</span>
                                            <GlassBadge size="sm" className="absolute top-3 right-3 bg-white/90 text-slate-700 border-white">
                                                公式
                                            </GlassBadge>
                                        </div>
                                        <div className="p-4">
                                            <h3 className="text-base font-black text-slate-900">{drive.name}</h3>
                                            <p className="text-xs text-slate-500 mt-1">{drive.description}</p>
                                        </div>
                                    </GlassCard>
                                </Link>
                            </FadeInView>
                        ))}
                    </div>
                )}

                {/* マイドライブ / コミュニティドライブ */}
                {activeTab === "community" && (
                    <div className="space-y-4">
                        {myDrives.length === 0 ? (
                            <GlassCard className="p-10 text-center">
                                <div className="text-5xl mb-4">🎨</div>
                                <h3 className="text-lg font-black text-slate-900 mb-2">
                                    まだPulse+がありません
                                </h3>
                                <p className="text-sm text-slate-500 mb-4">
                                    あなただけのPulse+を作って、<br />
                                    コミュニティと共有しましょう
                                </p>
                                <Link
                                    href="/style-drive/create"
                                    className="inline-block rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white px-6 py-3 text-sm font-black hover:opacity-90 transition shadow-md no-underline"
                                >
                                    Pulse+を作成する
                                </Link>
                            </GlassCard>
                        ) : (
                            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                {myDrives.map((drive, i) => (
                                    <FadeInView key={drive.id} delay={i * 0.05}>
                                        <div className="group relative">
                                            <GlassCard variant="elevated" hoverEffect className="overflow-hidden">
                                                <div className={`h-28 bg-gradient-to-br ${drive.gradient} flex items-center justify-center relative`}>
                                                    <span className="text-5xl drop-shadow-lg">{drive.icon}</span>
                                                    <GlassBadge size="sm" className="absolute top-3 right-3 bg-white/90 text-violet-600 border-white">
                                                        MY
                                                    </GlassBadge>
                                                </div>
                                                <div className="p-4">
                                                    <h3 className="text-base font-black text-slate-900">{drive.name}</h3>
                                                    <p className="text-xs text-slate-500 mt-1">
                                                        {drive.description || "説明なし"}
                                                    </p>
                                                    <div className="mt-2 text-[10px] text-slate-400">
                                                        作成: {new Date(drive.createdAt).toLocaleDateString("ja-JP")}
                                                    </div>
                                                </div>
                                            </GlassCard>
                                            <button
                                                onClick={() => removeDrive(drive.id)}
                                                className="absolute top-2 left-2 w-7 h-7 rounded-full bg-red-500 text-white text-xs font-bold opacity-0 group-hover:opacity-100 transition hover:bg-red-600 shadow-md"
                                            >
                                                ×
                                            </button>
                                        </div>
                                    </FadeInView>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </main>

            <FloatingNavLight
                items={[
                    { href: "/", label: "ホーム", icon: <span>🏠</span> },
                    { href: "/products", label: "商品", icon: <span>👕</span> },
                    { href: "/sns/profile", label: "Presence", icon: <span>🪞</span> },
                    { href: "/style-drive", label: "Pulse+", icon: <span>🎨</span>, active: true },
                    { href: "/my", label: "マイページ", icon: <span>👤</span> },
                ]}
            />
        </LightBackground>
    );
}
