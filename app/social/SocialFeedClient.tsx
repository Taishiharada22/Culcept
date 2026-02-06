// app/social/SocialFeedClient.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
    LightBackground,
    GlassCard,
    GlassNavbar,
    GlassButton,
    GlassBadge,
    GlassTabs,
    GlassInput,
    GlassModal,
    FadeInView,
    FloatingNavLight,
    Avatar,
    LivePulse,
} from "@/components/ui/glassmorphism-design";

// 型定義
type User = {
    id: string;
    name: string;
    username: string;
    avatar?: string;
    isVerified?: boolean;
    followers: number;
};

type Post = {
    id: string;
    user: User;
    images: string[];
    caption: string;
    tags: string[];
    linkedProducts: { id: string; title: string; price: number; imageUrl: string }[];
    likes: number;
    comments: number;
    isLiked: boolean;
    isSaved: boolean;
    createdAt: Date;
};

type Comment = {
    id: string;
    user: User;
    text: string;
    createdAt: Date;
    likes: number;
};

// モックデータ
const mockUsers: User[] = [
    { id: "1", name: "Yuki Tanaka", username: "yuki.style", avatar: "", isVerified: true, followers: 12500 },
    { id: "2", name: "Ken Suzuki", username: "ken_fashion", avatar: "", isVerified: false, followers: 8200 },
    { id: "3", name: "Mika Sato", username: "mika.coord", avatar: "", isVerified: true, followers: 45000 },
];

const mockPosts: Post[] = [
    {
        id: "1",
        user: mockUsers[0],
        images: ["/cards/outfit1.jpg", "/cards/outfit2.jpg"],
        caption: "今日のコーデ！春らしいカラーでまとめてみました 🌸\n#春コーデ #カジュアル",
        tags: ["春コーデ", "カジュアル", "ストリート"],
        linkedProducts: [
            { id: "p1", title: "オーバーサイズジャケット", price: 12800, imageUrl: "/cards/jacket.jpg" },
        ],
        likes: 342,
        comments: 28,
        isLiked: false,
        isSaved: false,
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    },
    {
        id: "2",
        user: mockUsers[1],
        images: ["/cards/outfit3.jpg"],
        caption: "シンプルだけど、小物使いがポイント！\nこのバッグは最近のお気に入り ✨",
        tags: ["シンプルコーデ", "ミニマル"],
        linkedProducts: [],
        likes: 189,
        comments: 15,
        isLiked: true,
        isSaved: true,
        createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
    },
    {
        id: "3",
        user: mockUsers[2],
        images: ["/cards/outfit4.jpg", "/cards/outfit5.jpg", "/cards/outfit6.jpg"],
        caption: "ヴィンテージミックスで個性を出す 🎸\n古着って最高！",
        tags: ["ヴィンテージ", "古着", "レトロ"],
        linkedProducts: [
            { id: "p2", title: "ヴィンテージデニム", price: 8500, imageUrl: "/cards/denim.jpg" },
            { id: "p3", title: "バンドTシャツ", price: 4200, imageUrl: "/cards/tee.jpg" },
        ],
        likes: 1024,
        comments: 89,
        isLiked: false,
        isSaved: false,
        createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000),
    },
];

export default function SocialFeedClient() {
    const [activeTab, setActiveTab] = useState("for-you");
    const [posts, setPosts] = useState<Post[]>(mockPosts);
    const [selectedPost, setSelectedPost] = useState<Post | null>(null);
    const [showComments, setShowComments] = useState(false);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newComment, setNewComment] = useState("");

    const handleLike = useCallback((postId: string) => {
        setPosts(prev => prev.map(post =>
            post.id === postId
                ? { ...post, isLiked: !post.isLiked, likes: post.isLiked ? post.likes - 1 : post.likes + 1 }
                : post
        ));
    }, []);

    const handleSave = useCallback((postId: string) => {
        setPosts(prev => prev.map(post =>
            post.id === postId
                ? { ...post, isSaved: !post.isSaved }
                : post
        ));
    }, []);

    const formatTime = (date: Date) => {
        const diff = Date.now() - date.getTime();
        const hours = Math.floor(diff / (1000 * 60 * 60));
        if (hours < 1) return "たった今";
        if (hours < 24) return `${hours}時間前`;
        const days = Math.floor(hours / 24);
        return `${days}日前`;
    };

    return (
        <LightBackground>
            {/* ヘッダー */}
            <GlassNavbar>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link
                            href="/"
                            className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition-colors"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </Link>
                        <h1 className="text-xl font-bold text-slate-900">Social Feed</h1>
                    </div>

                    <div className="flex items-center gap-2">
                        <button className="relative w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition-colors">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                            </svg>
                            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-xs text-white flex items-center justify-center">3</span>
                        </button>
                        <GlassButton
                            variant="gradient"
                            size="sm"
                            onClick={() => setShowCreateModal(true)}
                            icon={
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                            }
                        >
                            投稿
                        </GlassButton>
                    </div>
                </div>
            </GlassNavbar>

            <main className="pt-24 pb-32 px-4 max-w-2xl mx-auto">
                {/* タブ */}
                <div className="mb-6 flex justify-center">
                    <GlassTabs
                        tabs={[
                            { id: "for-you", label: "おすすめ", icon: <span>✨</span> },
                            { id: "following", label: "フォロー中", icon: <span>👥</span> },
                            { id: "trending", label: "トレンド", icon: <span>🔥</span> },
                        ]}
                        activeTab={activeTab}
                        onChange={setActiveTab}
                    />
                </div>

                {/* ストーリー風のユーザーリスト */}
                <div className="mb-6 overflow-x-auto pb-2">
                    <div className="flex gap-4">
                        {/* 自分のストーリー追加 */}
                        <button
                            onClick={() => setShowCreateModal(true)}
                            className="flex flex-col items-center gap-1 flex-shrink-0"
                        >
                            <div className="relative w-16 h-16 rounded-full bg-gradient-to-br from-pink-500 to-purple-500 p-[2px]">
                                <div className="w-full h-full rounded-full bg-white flex items-center justify-center">
                                    <svg className="w-6 h-6 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                    </svg>
                                </div>
                            </div>
                            <span className="text-xs text-slate-600">あなた</span>
                        </button>

                        {mockUsers.map((user) => (
                            <button key={user.id} className="flex flex-col items-center gap-1 flex-shrink-0">
                                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-pink-500 via-purple-500 to-cyan-500 p-[2px]">
                                    <Avatar
                                        src={user.avatar}
                                        fallback={user.name[0]}
                                        size="lg"
                                        className="!w-full !h-full"
                                    />
                                </div>
                                <span className="text-xs text-slate-600 truncate max-w-16">{user.username}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* 投稿一覧 */}
                <div className="space-y-6">
                    {posts.map((post, index) => (
                        <FadeInView key={post.id} delay={index * 0.1}>
                            <GlassCard variant="elevated" padding="none" className="overflow-hidden">
                                {/* ヘッダー */}
                                <div className="p-4 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <Avatar
                                            src={post.user.avatar}
                                            fallback={post.user.name[0]}
                                            size="md"
                                            online
                                        />
                                        <div>
                                            <div className="flex items-center gap-1">
                                                <span className="font-semibold text-slate-900">{post.user.username}</span>
                                                {post.user.isVerified && (
                                                    <svg className="w-4 h-4 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
                                                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                                                    </svg>
                                                )}
                                            </div>
                                            <span className="text-xs text-slate-500">{formatTime(post.createdAt)}</span>
                                        </div>
                                    </div>
                                    <button className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center">
                                        <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                                        </svg>
                                    </button>
                                </div>

                                {/* 画像スライダー */}
                                <div className="relative aspect-square bg-slate-100 overflow-hidden">
                                    {post.images.length > 1 ? (
                                        <div className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide">
                                            {post.images.map((img, i) => (
                                                <div key={i} className="flex-shrink-0 w-full h-full snap-center">
                                                    <div className="w-full aspect-square bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center">
                                                        <span className="text-6xl">👕</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="w-full h-full bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center">
                                            <span className="text-6xl">👕</span>
                                        </div>
                                    )}
                                    {post.images.length > 1 && (
                                        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                                            {post.images.map((_, i) => (
                                                <div
                                                    key={i}
                                                    className={`w-1.5 h-1.5 rounded-full ${i === 0 ? "bg-white" : "bg-white/50"}`}
                                                />
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* アクションボタン */}
                                <div className="p-4">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-4">
                                            <button
                                                onClick={() => handleLike(post.id)}
                                                className="flex items-center gap-1 group"
                                            >
                                                <motion.div
                                                    whileTap={{ scale: 1.3 }}
                                                    className={post.isLiked ? "text-red-500" : "text-slate-600 group-hover:text-red-400"}
                                                >
                                                    {post.isLiked ? (
                                                        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                                                            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                                                        </svg>
                                                    ) : (
                                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                                                        </svg>
                                                    )}
                                                </motion.div>
                                                <span className="text-sm font-medium text-slate-700">{post.likes}</span>
                                            </button>

                                            <button
                                                onClick={() => {
                                                    setSelectedPost(post);
                                                    setShowComments(true);
                                                }}
                                                className="flex items-center gap-1 text-slate-600 hover:text-slate-900"
                                            >
                                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                                </svg>
                                                <span className="text-sm font-medium">{post.comments}</span>
                                            </button>

                                            <button className="text-slate-600 hover:text-slate-900">
                                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                                                </svg>
                                            </button>
                                        </div>

                                        <button
                                            onClick={() => handleSave(post.id)}
                                            className={post.isSaved ? "text-purple-600" : "text-slate-600 hover:text-purple-500"}
                                        >
                                            {post.isSaved ? (
                                                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                                                    <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z" />
                                                </svg>
                                            ) : (
                                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                                                </svg>
                                            )}
                                        </button>
                                    </div>

                                    {/* キャプション */}
                                    <p className="text-slate-800 whitespace-pre-line">
                                        <span className="font-semibold">{post.user.username}</span>{" "}
                                        {post.caption}
                                    </p>

                                    {/* タグ */}
                                    {post.tags.length > 0 && (
                                        <div className="flex flex-wrap gap-2 mt-2">
                                            {post.tags.map((tag) => (
                                                <GlassBadge key={tag} variant="info" size="sm">
                                                    #{tag}
                                                </GlassBadge>
                                            ))}
                                        </div>
                                    )}

                                    {/* リンクされた商品 */}
                                    {post.linkedProducts.length > 0 && (
                                        <div className="mt-4 p-3 bg-slate-50 rounded-xl">
                                            <p className="text-xs font-medium text-slate-500 mb-2">この投稿の商品</p>
                                            <div className="flex gap-2 overflow-x-auto">
                                                {post.linkedProducts.map((product) => (
                                                    <Link
                                                        key={product.id}
                                                        href={`/drops/${product.id}`}
                                                        className="flex-shrink-0 flex items-center gap-2 p-2 bg-white rounded-lg hover:shadow-md transition-shadow"
                                                    >
                                                        <div className="w-10 h-10 rounded-lg bg-slate-200 flex items-center justify-center">
                                                            <span>👕</span>
                                                        </div>
                                                        <div>
                                                            <p className="text-xs font-medium text-slate-900 truncate max-w-24">{product.title}</p>
                                                            <p className="text-xs text-slate-500">¥{product.price.toLocaleString()}</p>
                                                        </div>
                                                    </Link>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </GlassCard>
                        </FadeInView>
                    ))}
                </div>
            </main>

            {/* コメントモーダル */}
            <GlassModal
                isOpen={showComments}
                onClose={() => setShowComments(false)}
                title="コメント"
                size="md"
            >
                {selectedPost && (
                    <div className="space-y-4">
                        {/* コメント一覧（モック） */}
                        <div className="space-y-4 max-h-80 overflow-y-auto">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="flex gap-3">
                                    <Avatar fallback="U" size="sm" />
                                    <div className="flex-1">
                                        <p className="text-sm">
                                            <span className="font-semibold text-slate-900">user{i}</span>{" "}
                                            <span className="text-slate-700">素敵なコーデですね！参考になります 🙌</span>
                                        </p>
                                        <div className="flex items-center gap-4 mt-1 text-xs text-slate-500">
                                            <span>2時間前</span>
                                            <button className="hover:text-slate-700">いいね</button>
                                            <button className="hover:text-slate-700">返信</button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* コメント入力 */}
                        <div className="flex gap-2 pt-4 border-t border-slate-200">
                            <GlassInput
                                placeholder="コメントを追加..."
                                value={newComment}
                                onChange={setNewComment}
                                className="flex-1"
                                size="sm"
                            />
                            <GlassButton variant="primary" size="sm" disabled={!newComment}>
                                送信
                            </GlassButton>
                        </div>
                    </div>
                )}
            </GlassModal>

            {/* 投稿作成モーダル */}
            <GlassModal
                isOpen={showCreateModal}
                onClose={() => setShowCreateModal(false)}
                title="新しい投稿"
                size="lg"
            >
                <div className="space-y-6">
                    {/* 画像アップロードエリア */}
                    <div className="border-2 border-dashed border-slate-300 rounded-2xl p-8 text-center hover:border-purple-400 hover:bg-purple-50/30 transition-all cursor-pointer">
                        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-pink-500 to-purple-500 flex items-center justify-center text-white text-2xl">
                            📸
                        </div>
                        <p className="font-semibold text-slate-700">写真をアップロード</p>
                        <p className="text-sm text-slate-500 mt-1">最大10枚まで選択できます</p>
                    </div>

                    {/* キャプション */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">キャプション</label>
                        <textarea
                            className="w-full rounded-xl bg-white/80 backdrop-blur-lg border border-slate-200 p-4 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-purple-400 resize-none"
                            rows={4}
                            placeholder="コーデのポイントを書いてみましょう..."
                        />
                    </div>

                    {/* 商品リンク */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">商品をリンク（任意）</label>
                        <GlassButton variant="secondary" size="sm" icon={<span>🏷️</span>}>
                            商品を選択
                        </GlassButton>
                    </div>

                    {/* 投稿ボタン */}
                    <div className="flex gap-3">
                        <GlassButton variant="secondary" fullWidth onClick={() => setShowCreateModal(false)}>
                            キャンセル
                        </GlassButton>
                        <GlassButton variant="gradient" fullWidth>
                            投稿する
                        </GlassButton>
                    </div>
                </div>
            </GlassModal>

            {/* フローティングナビ */}
            <FloatingNavLight
                items={[
                    { href: "/", label: "ホーム", icon: <span>🏠</span> },
                    { href: "/social", label: "フィード", icon: <span>📱</span>, active: true },
                    { href: "/products", label: "商品", icon: <span>👕</span> },
                    { href: "/my", label: "マイページ", icon: <span>👤</span> },
                ]}
            />
        </LightBackground>
    );
}
