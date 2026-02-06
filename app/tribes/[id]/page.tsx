"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
    LightBackground,
    GlassNavbar,
    GlassCard,
    GlassButton,
    GlassBadge,
    FadeInView,
    FloatingNavLight,
} from "@/components/ui/glassmorphism-design";
import { getStyleDrive } from "@/lib/styleDrive";

type DrivePost = {
    card_id: string;
    image_url: string;
    title: string;
    tags: string[];
    score: number;
    upvotes: number;
    downvotes: number;
    myVote: number;
};

const NAV_ITEMS = [
    { href: "/", label: "ホーム", icon: "🏠" },
    { href: "/products", label: "商品", icon: "👕" },
    { href: "/battle", label: "バトル", icon: "⚔️" },
    { href: "/tribes", label: "ドライブ", icon: "🏎️" },
    { href: "/my", label: "マイページ", icon: "👤" },
];

export default function DriveDetailPage() {
    const params = useParams<{ id: string | string[] }>();
    const router = useRouter();
    const driveId = Array.isArray(params?.id) ? params?.id?.[0] ?? "" : params?.id ?? "";
    const drive = useMemo(() => getStyleDrive(driveId), [driveId]);

    const [posts, setPosts] = useState<DrivePost[]>([]);
    const [loading, setLoading] = useState(true);
    const [voting, setVoting] = useState<string | null>(null);
    const [creatingBattle, setCreatingBattle] = useState(false);

    useEffect(() => {
        const load = async () => {
            if (!driveId) return;
            try {
                const res = await fetch(`/api/tribes/${driveId}/posts`);
                const data = await res.json();
                setPosts(data.posts || []);
            } catch (error) {
                console.error("Failed to load drive posts:", error);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [driveId]);

    const handleVote = async (cardId: string, vote: number) => {
        if (voting) return;
        setVoting(cardId);
        try {
            const res = await fetch(`/api/tribes/${driveId}/vote`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ card_id: cardId, vote }),
            });
            const data = await res.json();
            setPosts((prev) =>
                prev.map((p) =>
                    p.card_id === cardId
                        ? { ...p, score: data.score, upvotes: data.upvotes, downvotes: data.downvotes, myVote: vote }
                        : p
                )
            );
        } catch (error) {
            console.error("Vote failed:", error);
        } finally {
            setVoting(null);
        }
    };

    const handleCreateBattle = async () => {
        if (creatingBattle) return;
        setCreatingBattle(true);
        try {
            const res = await fetch(`/api/tribes/${driveId}/battle`, { method: "POST" });
            const data = await res.json();
            if (data?.battleId) {
                router.push(`/battle/drive-${data.battleId}`);
                return;
            }
        } catch (error) {
            console.error("Battle create failed:", error);
        } finally {
            setCreatingBattle(false);
        }
    };

    if (!drive) {
        return (
            <LightBackground>
                <div className="min-h-screen flex items-center justify-center text-gray-500">
                    ドライブが見つかりません
                </div>
            </LightBackground>
        );
    }

    return (
        <LightBackground>
            <GlassNavbar>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link
                            href="/tribes"
                            className="w-10 h-10 rounded-xl bg-white/50 backdrop-blur-sm border border-white/60 flex items-center justify-center text-gray-500 hover:bg-white/80 transition-all shadow-sm"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </Link>
                        <div>
                            <h1 className="text-xl font-bold text-gray-800">{drive.name}</h1>
                            <p className="text-xs text-gray-400">Style Drive</p>
                        </div>
                    </div>
                    <GlassBadge variant="gradient" size="sm">VOTE</GlassBadge>
                </div>
            </GlassNavbar>

            <div className="h-24" />

            <main className="max-w-5xl mx-auto px-4 sm:px-6 pb-32">
                <FadeInView>
                    <GlassCard className="mb-8 overflow-hidden">
                        <div className={`absolute inset-0 bg-gradient-to-br ${drive.gradient} opacity-10`} />
                        <div className="relative p-8 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
                            <div className="flex items-center gap-4">
                                <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${drive.gradient} text-white flex items-center justify-center text-3xl shadow-lg`}>
                                    {drive.icon}
                                </div>
                                <div>
                                    <h2 className="text-2xl font-bold text-gray-800">{drive.name}</h2>
                                    <p className="text-gray-500">{drive.description}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <GlassButton variant="secondary" size="sm" href="/battle">
                                    バトルを見る
                                </GlassButton>
                                <GlassButton variant="primary" size="sm" onClick={handleCreateBattle}>
                                    {creatingBattle ? "開催中..." : "ドライブ勝者でバトル開催"}
                                </GlassButton>
                            </div>
                        </div>
                    </GlassCard>
                </FadeInView>

                {loading ? (
                    <div className="flex items-center justify-center h-64">
                        <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                            className="w-16 h-16 rounded-full border-4 border-violet-200 border-t-violet-500"
                        />
                    </div>
                ) : posts.length === 0 ? (
                    <GlassCard className="p-10 text-center">
                        <div className="text-5xl mb-4">📭</div>
                        <h3 className="text-xl font-bold text-gray-800 mb-2">投稿がまだありません</h3>
                        <p className="text-gray-500">コーデが集まり次第、投票が始まります。</p>
                    </GlassCard>
                ) : (
                    <div className="space-y-4">
                        {posts.map((post, index) => (
                            <FadeInView key={post.card_id} delay={0.03 * index}>
                                <GlassCard className="overflow-hidden">
                                    <div className="relative flex flex-col md:flex-row">
                                        <div className="w-full md:w-20 flex md:flex-col items-center justify-center gap-2 border-b md:border-b-0 md:border-r border-white/60 bg-white/40 p-3">
                                            <button
                                                className={`w-9 h-9 rounded-full border flex items-center justify-center text-lg transition-colors ${
                                                    post.myVote === 1
                                                        ? "bg-emerald-100 border-emerald-300 text-emerald-500"
                                                        : "bg-white/70 border-white/80 text-gray-400 hover:text-emerald-500"
                                                }`}
                                                onClick={() => handleVote(post.card_id, post.myVote === 1 ? 0 : 1)}
                                            >
                                                ▲
                                            </button>
                                            <div className="text-sm font-bold text-gray-700">{post.score}</div>
                                            <button
                                                className={`w-9 h-9 rounded-full border flex items-center justify-center text-lg transition-colors ${
                                                    post.myVote === -1
                                                        ? "bg-rose-100 border-rose-300 text-rose-500"
                                                        : "bg-white/70 border-white/80 text-gray-400 hover:text-rose-500"
                                                }`}
                                                onClick={() => handleVote(post.card_id, post.myVote === -1 ? 0 : -1)}
                                            >
                                                ▼
                                            </button>
                                        </div>

                                        <div className="flex-1 p-5">
                                            <div className="flex items-center justify-between mb-3">
                                                <div className="flex items-center gap-2">
                                                    {index === 0 && (
                                                        <GlassBadge variant="gradient" size="sm">TOP</GlassBadge>
                                                    )}
                                                    <span className="text-sm text-gray-400">Drive Vote</span>
                                                </div>
                                                <span className="text-xs text-gray-400">{post.upvotes} up / {post.downvotes} down</span>
                                            </div>
                                            <h3 className="text-lg font-bold text-gray-800 mb-2">{post.title}</h3>
                                            <div className="flex flex-wrap gap-2 mb-4">
                                                {(post.tags || []).slice(0, 4).map((tag) => (
                                                    <span
                                                        key={tag}
                                                        className="px-2 py-1 rounded-full bg-white/70 border border-white/80 text-xs text-gray-500"
                                                    >
                                                        #{tag}
                                                    </span>
                                                ))}
                                            </div>
                                            <div className="relative rounded-2xl overflow-hidden border border-white/70 bg-white/70">
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img
                                                    src={post.image_url}
                                                    alt=""
                                                    className="w-full h-64 sm:h-80 object-cover"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </GlassCard>
                            </FadeInView>
                        ))}
                    </div>
                )}
            </main>

            <FloatingNavLight items={NAV_ITEMS} activeHref="/tribes" />
            <div className="h-24" />
        </LightBackground>
    );
}
