// app/auction/AuctionPageClient.tsx
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
    Countdown,
    ProgressRing,
} from "@/components/ui/glassmorphism-design";

// 型定義
type AuctionItem = {
    id: string;
    title: string;
    description: string;
    brand: string;
    condition: string;
    images: string[];
    startingPrice: number;
    currentBid: number;
    minIncrement: number;
    bidCount: number;
    endTime: Date;
    seller: {
        id: string;
        name: string;
        avatar?: string;
        rating: number;
    };
    watchers: number;
    isWatching: boolean;
    status: "upcoming" | "live" | "ended";
    winner?: { name: string; avatar?: string };
};

type Bid = {
    id: string;
    userId: string;
    userName: string;
    userAvatar?: string;
    amount: number;
    timestamp: Date;
};

// モックデータ
const mockAuctions: AuctionItem[] = [
    {
        id: "1",
        title: "Supreme Box Logo Hoodie FW21",
        description: "超希少！2021秋冬のボックスロゴフーディ。未使用タグ付き。",
        brand: "Supreme",
        condition: "新品・未使用",
        images: ["/cards/supreme.jpg"],
        startingPrice: 50000,
        currentBid: 78000,
        minIncrement: 1000,
        bidCount: 23,
        endTime: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2時間後
        seller: { id: "s1", name: "HypeBeast Shop", rating: 4.9 },
        watchers: 156,
        isWatching: false,
        status: "live",
    },
    {
        id: "2",
        title: "Nike Dunk Low 'Panda' 27.5cm",
        description: "人気のパンダダンク。新品DS。",
        brand: "Nike",
        condition: "新品・未使用",
        images: ["/cards/dunk.jpg"],
        startingPrice: 15000,
        currentBid: 21500,
        minIncrement: 500,
        bidCount: 15,
        endTime: new Date(Date.now() + 45 * 60 * 1000), // 45分後
        seller: { id: "s2", name: "Sneaker Market", rating: 4.8 },
        watchers: 89,
        isWatching: true,
        status: "live",
    },
    {
        id: "3",
        title: "Vintage CHANEL バッグ",
        description: "90年代のヴィンテージシャネル。状態良好。",
        brand: "CHANEL",
        condition: "中古・良好",
        images: ["/cards/chanel.jpg"],
        startingPrice: 120000,
        currentBid: 120000,
        minIncrement: 5000,
        bidCount: 0,
        endTime: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24時間後
        seller: { id: "s3", name: "Luxury Vintage", rating: 5.0 },
        watchers: 234,
        isWatching: false,
        status: "upcoming",
    },
];

const mockBids: Bid[] = [
    { id: "b1", userId: "u1", userName: "style_hunter", amount: 78000, timestamp: new Date(Date.now() - 5 * 60 * 1000) },
    { id: "b2", userId: "u2", userName: "fashion_lover", amount: 76000, timestamp: new Date(Date.now() - 12 * 60 * 1000) },
    { id: "b3", userId: "u3", userName: "sneaker_head", amount: 72000, timestamp: new Date(Date.now() - 25 * 60 * 1000) },
];

export default function AuctionPageClient() {
    const [activeTab, setActiveTab] = useState("live");
    const [auctions, setAuctions] = useState<AuctionItem[]>(mockAuctions);
    const [selectedAuction, setSelectedAuction] = useState<AuctionItem | null>(null);
    const [showBidModal, setShowBidModal] = useState(false);
    const [bidAmount, setBidAmount] = useState("");
    const [recentBids, setRecentBids] = useState<Bid[]>(mockBids);
    const [showConfetti, setShowConfetti] = useState(false);

    // リアルタイム更新シミュレーション
    useEffect(() => {
        const interval = setInterval(() => {
            // ランダムに入札を追加
            if (Math.random() > 0.7) {
                const randomAuction = auctions.find(a => a.status === "live");
                if (randomAuction) {
                    const newBid = randomAuction.currentBid + randomAuction.minIncrement;
                    setAuctions(prev => prev.map(a =>
                        a.id === randomAuction.id
                            ? { ...a, currentBid: newBid, bidCount: a.bidCount + 1 }
                            : a
                    ));

                    if (selectedAuction?.id === randomAuction.id) {
                        setRecentBids(prev => [{
                            id: `b${Date.now()}`,
                            userId: `u${Math.random()}`,
                            userName: `user_${Math.floor(Math.random() * 1000)}`,
                            amount: newBid,
                            timestamp: new Date(),
                        }, ...prev].slice(0, 10));
                    }
                }
            }
        }, 5000);

        return () => clearInterval(interval);
    }, [auctions, selectedAuction]);

    const handleBid = useCallback(() => {
        if (!selectedAuction || !bidAmount) return;

        const amount = parseInt(bidAmount);
        if (amount <= selectedAuction.currentBid) {
            alert("現在の入札額より高い金額を入力してください");
            return;
        }

        // 入札処理（モック）
        setAuctions(prev => prev.map(a =>
            a.id === selectedAuction.id
                ? { ...a, currentBid: amount, bidCount: a.bidCount + 1 }
                : a
        ));

        setRecentBids(prev => [{
            id: `b${Date.now()}`,
            userId: "me",
            userName: "あなた",
            amount,
            timestamp: new Date(),
        }, ...prev]);

        setShowBidModal(false);
        setBidAmount("");
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 3000);
    }, [selectedAuction, bidAmount]);

    const filteredAuctions = auctions.filter(a => {
        if (activeTab === "live") return a.status === "live";
        if (activeTab === "upcoming") return a.status === "upcoming";
        if (activeTab === "watching") return a.isWatching;
        return true;
    });

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
                        <div>
                            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                                Live Auction
                                <LivePulse />
                            </h1>
                            <p className="text-sm text-slate-500">リアルタイム入札</p>
                        </div>
                    </div>

                    <GlassBadge variant="danger">
                        <LivePulse className="mr-1" />
                        {auctions.filter(a => a.status === "live").length}件開催中
                    </GlassBadge>
                </div>
            </GlassNavbar>

            <main className="pt-28 pb-32 px-4 max-w-6xl mx-auto">
                {/* タブ */}
                <div className="mb-6 flex justify-center">
                    <GlassTabs
                        tabs={[
                            { id: "live", label: "開催中", icon: <LivePulse /> },
                            { id: "upcoming", label: "近日開催", icon: <span>📅</span> },
                            { id: "watching", label: "ウォッチ中", icon: <span>👁️</span> },
                        ]}
                        activeTab={activeTab}
                        onChange={setActiveTab}
                    />
                </div>

                {/* オークション一覧 */}
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredAuctions.map((auction, index) => (
                        <FadeInView key={auction.id} delay={index * 0.1}>
                            <div onClick={() => setSelectedAuction(auction)} className="cursor-pointer">
                            <GlassCard
                                variant="elevated"
                                padding="none"
                                hoverEffect
                            >
                                {/* 画像 */}
                                <div className="relative aspect-square bg-slate-100">
                                    <div className="w-full h-full bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center">
                                        <span className="text-6xl">👕</span>
                                    </div>

                                    {/* ステータスバッジ */}
                                    <div className="absolute top-3 left-3">
                                        {auction.status === "live" ? (
                                            <GlassBadge variant="danger">
                                                <LivePulse className="mr-1" />
                                                LIVE
                                            </GlassBadge>
                                        ) : (
                                            <GlassBadge variant="info">近日開催</GlassBadge>
                                        )}
                                    </div>

                                    {/* ウォッチボタン */}
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setAuctions(prev => prev.map(a =>
                                                a.id === auction.id
                                                    ? { ...a, isWatching: !a.isWatching, watchers: a.isWatching ? a.watchers - 1 : a.watchers + 1 }
                                                    : a
                                            ));
                                        }}
                                        className={`absolute top-3 right-3 w-10 h-10 rounded-full bg-white/90 backdrop-blur-sm shadow-lg flex items-center justify-center transition-colors ${
                                            auction.isWatching ? "text-purple-600" : "text-slate-400 hover:text-purple-500"
                                        }`}
                                    >
                                        <svg className="w-5 h-5" fill={auction.isWatching ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                        </svg>
                                    </button>

                                    {/* 残り時間 */}
                                    {auction.status === "live" && (
                                        <div className="absolute bottom-3 left-3 right-3">
                                            <div className="bg-black/70 backdrop-blur-sm rounded-xl px-3 py-2 text-white text-center">
                                                <p className="text-xs opacity-70 mb-0.5">終了まで</p>
                                                <TimeRemaining endTime={auction.endTime} />
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* 情報 */}
                                <div className="p-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <GlassBadge variant="default" size="sm">{auction.brand}</GlassBadge>
                                        <GlassBadge variant="success" size="sm">{auction.condition}</GlassBadge>
                                    </div>

                                    <h3 className="font-bold text-slate-900 line-clamp-2 mb-2">{auction.title}</h3>

                                    <div className="flex items-end justify-between">
                                        <div>
                                            <p className="text-xs text-slate-500">現在の入札</p>
                                            <p className="text-2xl font-bold text-slate-900">
                                                ¥{auction.currentBid.toLocaleString()}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xs text-slate-500">{auction.bidCount}件の入札</p>
                                            <p className="text-xs text-slate-500">{auction.watchers}人がウォッチ中</p>
                                        </div>
                                    </div>

                                    {auction.status === "live" && (
                                        <div onClick={(e) => e.stopPropagation()}>
                                            <GlassButton
                                                variant="gradient"
                                                fullWidth
                                                className="mt-4"
                                                onClick={() => {
                                                    setSelectedAuction(auction);
                                                    setShowBidModal(true);
                                                }}
                                            >
                                                🔨 入札する
                                            </GlassButton>
                                        </div>
                                    )}
                                </div>
                            </GlassCard>
                            </div>
                        </FadeInView>
                    ))}
                </div>

                {filteredAuctions.length === 0 && (
                    <div className="text-center py-12">
                        <span className="text-6xl mb-4 block">🔨</span>
                        <p className="text-slate-500">該当するオークションがありません</p>
                    </div>
                )}
            </main>

            {/* オークション詳細モーダル */}
            <GlassModal
                isOpen={!!selectedAuction && !showBidModal}
                onClose={() => setSelectedAuction(null)}
                title={selectedAuction?.title}
                size="xl"
            >
                {selectedAuction && (
                    <div className="grid md:grid-cols-2 gap-6">
                        {/* 左: 画像 */}
                        <div className="aspect-square rounded-2xl bg-slate-100 flex items-center justify-center">
                            <span className="text-8xl">👕</span>
                        </div>

                        {/* 右: 詳細 */}
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 flex-wrap">
                                <GlassBadge variant="default">{selectedAuction.brand}</GlassBadge>
                                <GlassBadge variant="success">{selectedAuction.condition}</GlassBadge>
                                {selectedAuction.status === "live" && (
                                    <GlassBadge variant="danger">
                                        <LivePulse className="mr-1" />
                                        LIVE
                                    </GlassBadge>
                                )}
                            </div>

                            <p className="text-slate-600">{selectedAuction.description}</p>

                            {/* 現在の入札 */}
                            <div className="p-4 rounded-xl bg-gradient-to-r from-pink-50 to-purple-50 border border-purple-100">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm text-slate-500">現在の入札</span>
                                    <span className="text-sm text-slate-500">{selectedAuction.bidCount}件</span>
                                </div>
                                <p className="text-3xl font-bold text-slate-900">
                                    ¥{selectedAuction.currentBid.toLocaleString()}
                                </p>
                                <p className="text-xs text-slate-500 mt-1">
                                    最低入札額: ¥{(selectedAuction.currentBid + selectedAuction.minIncrement).toLocaleString()}
                                </p>
                            </div>

                            {/* 残り時間 */}
                            {selectedAuction.status === "live" && (
                                <div className="p-4 rounded-xl bg-slate-50 text-center">
                                    <p className="text-sm text-slate-500 mb-2">オークション終了まで</p>
                                    <Countdown targetDate={selectedAuction.endTime} />
                                </div>
                            )}

                            {/* 入札履歴 */}
                            <div>
                                <h4 className="font-semibold text-slate-900 mb-2">入札履歴</h4>
                                <div className="space-y-2 max-h-40 overflow-y-auto">
                                    {recentBids.map((bid) => (
                                        <motion.div
                                            key={bid.id}
                                            initial={{ opacity: 0, x: -20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            className="flex items-center justify-between p-2 rounded-lg bg-white"
                                        >
                                            <div className="flex items-center gap-2">
                                                <Avatar fallback={bid.userName[0]} size="xs" />
                                                <span className="text-sm font-medium text-slate-700">{bid.userName}</span>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-sm font-bold text-slate-900">¥{bid.amount.toLocaleString()}</p>
                                                <p className="text-xs text-slate-500">
                                                    {Math.floor((Date.now() - bid.timestamp.getTime()) / 60000)}分前
                                                </p>
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>
                            </div>

                            {/* 出品者 */}
                            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50">
                                <div className="flex items-center gap-3">
                                    <Avatar fallback={selectedAuction.seller.name[0]} size="sm" />
                                    <div>
                                        <p className="font-medium text-slate-900">{selectedAuction.seller.name}</p>
                                        <p className="text-xs text-slate-500">⭐ {selectedAuction.seller.rating}</p>
                                    </div>
                                </div>
                                <GlassButton variant="secondary" size="xs">プロフィール</GlassButton>
                            </div>

                            {/* 入札ボタン */}
                            {selectedAuction.status === "live" && (
                                <GlassButton
                                    variant="gradient"
                                    size="lg"
                                    fullWidth
                                    onClick={() => setShowBidModal(true)}
                                >
                                    🔨 入札する
                                </GlassButton>
                            )}
                        </div>
                    </div>
                )}
            </GlassModal>

            {/* 入札モーダル */}
            <GlassModal
                isOpen={showBidModal}
                onClose={() => setShowBidModal(false)}
                title="入札する"
                size="sm"
            >
                {selectedAuction && (
                    <div className="space-y-6">
                        <div className="text-center">
                            <p className="text-sm text-slate-500">現在の入札</p>
                            <p className="text-3xl font-bold text-slate-900">
                                ¥{selectedAuction.currentBid.toLocaleString()}
                            </p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">入札額</label>
                            <GlassInput
                                placeholder={`¥${(selectedAuction.currentBid + selectedAuction.minIncrement).toLocaleString()} 以上`}
                                value={bidAmount}
                                onChange={setBidAmount}
                                type="text"
                                size="lg"
                            />
                            <div className="flex gap-2 mt-2">
                                {[1, 2, 5].map((mult) => {
                                    const quickBid = selectedAuction.currentBid + selectedAuction.minIncrement * mult;
                                    return (
                                        <button
                                            key={mult}
                                            onClick={() => setBidAmount(quickBid.toString())}
                                            className="flex-1 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-sm font-medium text-slate-700 transition-colors"
                                        >
                                            ¥{quickBid.toLocaleString()}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
                            <p className="text-sm text-amber-800">
                                ⚠️ 入札すると、落札時に購入義務が発生します
                            </p>
                        </div>

                        <div className="flex gap-3">
                            <GlassButton variant="secondary" fullWidth onClick={() => setShowBidModal(false)}>
                                キャンセル
                            </GlassButton>
                            <GlassButton variant="gradient" fullWidth onClick={handleBid}>
                                入札確定
                            </GlassButton>
                        </div>
                    </div>
                )}
            </GlassModal>

            {/* 入札成功アニメーション */}
            <AnimatePresence>
                {showConfetti && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center"
                    >
                        <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0 }}
                            className="bg-white/95 backdrop-blur-xl rounded-3xl p-8 shadow-2xl text-center"
                        >
                            <motion.div
                                animate={{ rotate: [0, 10, -10, 0] }}
                                transition={{ duration: 0.5, repeat: 2 }}
                                className="text-6xl mb-4"
                            >
                                🎉
                            </motion.div>
                            <h3 className="text-2xl font-bold text-slate-900 mb-2">入札完了！</h3>
                            <p className="text-slate-500">現在最高入札者です</p>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* フローティングナビ */}
            <FloatingNavLight
                items={[
                    { href: "/", label: "ホーム", icon: <span>🏠</span> },
                    { href: "/auction", label: "オークション", icon: <span>🔨</span>, active: true },
                    { href: "/sns/profile", label: "Presence", icon: <span>🪞</span> },
                    { href: "/products", label: "商品", icon: <span>👕</span> },
                    { href: "/my", label: "マイページ", icon: <span>👤</span> },
                ]}
            />
        </LightBackground>
    );
}

// 残り時間表示コンポーネント
function TimeRemaining({ endTime }: { endTime: Date }) {
    const [timeLeft, setTimeLeft] = useState("");

    useEffect(() => {
        const update = () => {
            const diff = endTime.getTime() - Date.now();
            if (diff <= 0) {
                setTimeLeft("終了");
                return;
            }

            const hours = Math.floor(diff / (1000 * 60 * 60));
            const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const secs = Math.floor((diff % (1000 * 60)) / 1000);

            if (hours > 0) {
                setTimeLeft(`${hours}時間 ${mins}分`);
            } else if (mins > 0) {
                setTimeLeft(`${mins}分 ${secs}秒`);
            } else {
                setTimeLeft(`${secs}秒`);
            }
        };

        update();
        const interval = setInterval(update, 1000);
        return () => clearInterval(interval);
    }, [endTime]);

    return <p className="font-bold">{timeLeft}</p>;
}
