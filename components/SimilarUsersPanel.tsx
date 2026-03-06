// components/SimilarUsersPanel.tsx
"use client";

import { useEffect, useState } from "react";

type RecommendedTag = { tag: string; score: number };
type SimilarUser = { similarity: number; topTags: string[] };

type SimilarUsersData = {
    myTopTags: string[];
    similarUsers: SimilarUser[];
    recommendedTags: RecommendedTag[];
    message?: string;
};

export default function SimilarUsersPanel() {
    const [data, setData] = useState<SimilarUsersData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetch("/api/recommendations/similar-users", {
            credentials: "include",
            cache: "no-store",
        })
            .then((r) => r.json())
            .then((res) => {
                if (res.ok) {
                    setData({
                        myTopTags: res.myTopTags || [],
                        similarUsers: res.similarUsers || [],
                        recommendedTags: res.recommendedTags || [],
                        message: res.message,
                    });
                } else {
                    setError(res.error || "Failed to load");
                }
            })
            .catch((err) => {
                setError(String(err?.message ?? err));
            })
            .finally(() => {
                setLoading(false);
            });
    }, []);

    if (loading) {
        return (
            <div className="text-center py-6">
                <div className="inline-block h-6 w-6 animate-spin rounded-full border-4 border-teal-200 border-t-teal-600" />
                <div className="mt-2 text-sm text-gray-600">類似ユーザー分析中...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {error}
            </div>
        );
    }

    if (!data || data.myTopTags.length === 0) {
        return (
            <div className="text-center py-6">
                <div className="text-3xl mb-2 opacity-30">👥</div>
                <div className="text-sm text-gray-600">
                    {data?.message || "まだデータがありません"}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* あなたのトップタグ */}
            <div>
                <h4 className="text-sm font-black text-gray-900 mb-3">🏷️ あなたの好み</h4>
                <div className="flex flex-wrap gap-2">
                    {data.myTopTags.map((tag) => (
                        <span
                            key={tag}
                            className="rounded-full bg-gradient-to-r from-purple-500 to-purple-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm"
                        >
                            {tag}
                        </span>
                    ))}
                </div>
            </div>

            {/* 類似ユーザー */}
            {data.similarUsers.length > 0 && (
                <div>
                    <h4 className="text-sm font-black text-gray-900 mb-3">
                        👥 あなたと似た好みのユーザー
                    </h4>
                    <div className="space-y-2">
                        {data.similarUsers.map((user, idx) => (
                            <div
                                key={idx}
                                className="rounded-lg border border-gray-200 bg-gray-50 p-3 flex items-center gap-3"
                            >
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-teal-600 text-white text-xs font-black">
                                    #{idx + 1}
                                </div>
                                <div className="flex-1">
                                    <div className="text-xs text-gray-500 mb-1">
                                        類似度: {user.similarity}/3
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                        {user.topTags.map((tag) => (
                                            <span
                                                key={tag}
                                                className="text-xs px-2 py-0.5 rounded-full bg-white border border-gray-300 text-gray-700"
                                            >
                                                {tag}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* おすすめタグ */}
            {data.recommendedTags.length > 0 && (
                <div>
                    <h4 className="text-sm font-black text-gray-900 mb-3">
                        ✨ 似たユーザーが好きなタグ
                    </h4>
                    <div className="rounded-xl border-2 border-teal-200 bg-gradient-to-br from-teal-50 to-white p-4">
                        <div className="text-xs text-teal-800 mb-3">
                            これらのタグもお好みかもしれません
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {data.recommendedTags.map(({ tag, score }) => (
                                <span
                                    key={tag}
                                    className="rounded-full border-2 border-teal-300 bg-white px-3 py-1.5 text-xs font-bold text-teal-700 hover:bg-teal-50 transition-colors cursor-pointer"
                                    title={`スコア: ${score}`}
                                >
                                    {tag} <span className="text-teal-500">+{score}</span>
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
