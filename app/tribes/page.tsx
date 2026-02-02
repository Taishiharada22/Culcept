// app/tribes/page.tsx
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Tribe {
    id: string;
    name: string;
    description: string;
    icon: string;
    color: string;
    members: number;
    posts: number;
    joined: boolean;
    featured_items: { id: string; image_url: string }[];
}

const TRIBE_COLORS: Record<string, string> = {
    street: "from-orange-500 to-red-500",
    minimal: "from-slate-600 to-gray-800",
    vintage: "from-amber-500 to-yellow-600",
    sporty: "from-green-500 to-emerald-500",
    luxury: "from-purple-600 to-pink-500",
    casual: "from-blue-500 to-cyan-500",
};

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
                console.error("Failed to fetch tribes:", error);
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
                        t.id === tribeId ? { ...t, members: t.members - 1, joined: false } : t
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
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-violet-50 to-white">
                <div className="text-center">
                    <div className="animate-pulse text-5xl mb-4">🏕️</div>
                    <p className="text-slate-600">トライブを探しています...</p>
                </div>
            </div>
        );
    }

    const joinedTribes = tribes.filter((t) => myTribes.includes(t.id));
    const discoverTribes = tribes.filter((t) => !myTribes.includes(t.id));

    return (
        <div className="min-h-screen bg-gradient-to-b from-violet-50 to-white">
            <div className="max-w-4xl mx-auto px-4 py-8">
                {/* ヘッダー */}
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold mb-2">🏕️ スタイルトライブ</h1>
                    <p className="text-slate-600">
                        同じスタイルを愛する仲間とつながろう
                    </p>
                </div>

                {/* 参加中のトライブ */}
                {joinedTribes.length > 0 && (
                    <div className="mb-8">
                        <h2 className="font-bold text-lg mb-4">参加中のトライブ</h2>
                        <div className="grid grid-cols-2 gap-4">
                            {joinedTribes.map((tribe) => (
                                <Link
                                    key={tribe.id}
                                    href={`/tribes/${tribe.id}`}
                                    className={`bg-gradient-to-br ${TRIBE_COLORS[tribe.id] || "from-purple-500 to-pink-500"} rounded-2xl p-4 text-white`}
                                >
                                    <div className="flex items-center gap-3 mb-3">
                                        <span className="text-3xl">{tribe.icon}</span>
                                        <div>
                                            <div className="font-bold">{tribe.name}</div>
                                            <div className="text-sm opacity-80">
                                                {tribe.members.toLocaleString()}人
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex -space-x-2">
                                        {tribe.featured_items.slice(0, 4).map((item, i) => (
                                            <img
                                                key={i}
                                                src={item.image_url}
                                                alt=""
                                                className="w-10 h-10 rounded-lg border-2 border-white/30 object-cover"
                                            />
                                        ))}
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </div>
                )}

                {/* 発見 */}
                <h2 className="font-bold text-lg mb-4">トライブを発見</h2>
                <div className="space-y-4">
                    {discoverTribes.map((tribe) => (
                        <div
                            key={tribe.id}
                            className="bg-white rounded-2xl border overflow-hidden"
                        >
                            {/* ヘッダー */}
                            <div
                                className={`bg-gradient-to-r ${TRIBE_COLORS[tribe.id] || "from-purple-500 to-pink-500"} p-4 text-white`}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <span className="text-4xl">{tribe.icon}</span>
                                        <div>
                                            <h3 className="font-bold text-xl">{tribe.name}</h3>
                                            <p className="text-sm opacity-90">{tribe.description}</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => toggleJoin(tribe.id)}
                                        className="px-4 py-2 bg-white/20 backdrop-blur-sm rounded-full font-medium hover:bg-white/30 transition-colors"
                                    >
                                        参加する
                                    </button>
                                </div>
                            </div>

                            {/* コンテンツ */}
                            <div className="p-4">
                                <div className="flex items-center gap-6 mb-4 text-sm text-slate-600">
                                    <span>👥 {tribe.members.toLocaleString()}人</span>
                                    <span>📝 {tribe.posts}投稿</span>
                                </div>

                                {/* 人気アイテム */}
                                <div className="flex gap-2 overflow-x-auto pb-2">
                                    {tribe.featured_items.map((item, i) => (
                                        <img
                                            key={i}
                                            src={item.image_url}
                                            alt=""
                                            className="w-20 h-20 rounded-xl object-cover flex-shrink-0"
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* CTA */}
                <div className="mt-12 bg-gradient-to-r from-violet-500 to-purple-600 rounded-2xl p-8 text-white text-center">
                    <h2 className="text-2xl font-bold mb-2">新しいトライブを作ろう</h2>
                    <p className="opacity-90 mb-4">
                        あなただけのコミュニティを始める
                    </p>
                    <Link
                        href="/tribes/create"
                        className="inline-block px-8 py-3 bg-white text-violet-600 rounded-xl font-bold hover:bg-violet-50 transition-colors"
                    >
                        トライブを作成
                    </Link>
                </div>
            </div>
        </div>
    );
}
