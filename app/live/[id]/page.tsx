// app/live/[id]/page.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { use } from "react";

interface ChatMessage {
    id: string;
    user: string;
    message: string;
    timestamp: Date;
    type: "chat" | "purchase" | "system";
}

interface Product {
    id: string;
    image_url: string;
    name: string;
    price: number;
    stock: number;
}

interface LiveStream {
    id: string;
    title: string;
    host: {
        id: string;
        name: string;
        avatar: string;
    };
    viewers: number;
    products: Product[];
    status: "live" | "ended";
}

export default function LiveStreamPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const [stream, setStream] = useState<LiveStream | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [newMessage, setNewMessage] = useState("");
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [showProducts, setShowProducts] = useState(false);
    const [isFollowing, setIsFollowing] = useState(false);
    const [liked, setLiked] = useState(false);
    const [hearts, setHearts] = useState<{ id: number; x: number }[]>([]);
    const chatEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // ストリーム情報を取得
        const fetchStream = async () => {
            try {
                const res = await fetch(`/api/live/streams/${id}`);
                const data = await res.json();
                setStream(data.stream);

                // サンプルメッセージ
                setMessages([
                    { id: "1", user: "システム", message: "ライブ配信が始まりました！", timestamp: new Date(), type: "system" },
                    { id: "2", user: "ユーザーA", message: "こんにちは！", timestamp: new Date(), type: "chat" },
                    { id: "3", user: "ユーザーB", message: "このジャケットかわいい😍", timestamp: new Date(), type: "chat" },
                ]);
            } catch (error) {
                console.error("Failed to fetch stream:", error);
            }
        };
        fetchStream();

        // 模擬的なリアルタイム更新
        const interval = setInterval(() => {
            setStream((prev) => prev ? { ...prev, viewers: prev.viewers + Math.floor(Math.random() * 3) - 1 } : null);
        }, 5000);

        return () => clearInterval(interval);
    }, [id]);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const sendMessage = () => {
        if (!newMessage.trim()) return;

        const msg: ChatMessage = {
            id: Date.now().toString(),
            user: "あなた",
            message: newMessage,
            timestamp: new Date(),
            type: "chat",
        };

        setMessages((prev) => [...prev, msg]);
        setNewMessage("");
    };

    const handleLike = () => {
        setLiked(true);
        const newHeart = { id: Date.now(), x: Math.random() * 60 + 20 };
        setHearts((prev) => [...prev, newHeart]);

        setTimeout(() => {
            setHearts((prev) => prev.filter((h) => h.id !== newHeart.id));
        }, 2000);

        setTimeout(() => setLiked(false), 200);
    };

    const handlePurchase = (product: Product) => {
        // 購入処理
        const purchaseMsg: ChatMessage = {
            id: Date.now().toString(),
            user: "あなた",
            message: `${product.name}を購入しました！`,
            timestamp: new Date(),
            type: "purchase",
        };
        setMessages((prev) => [...prev, purchaseMsg]);
        setSelectedProduct(null);
    };

    if (!stream) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-black text-white">
                <div className="animate-spin text-4xl">⏳</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-black text-white flex flex-col">
            {/* ビデオエリア */}
            <div className="relative flex-1 bg-gradient-to-b from-slate-800 to-slate-900">
                {/* プレースホルダービデオ */}
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                        <div className="text-6xl mb-4">📺</div>
                        <p className="text-white/60">ライブ配信中</p>
                    </div>
                </div>

                {/* ヘッダーオーバーレイ */}
                <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/80 to-transparent p-4">
                    <div className="flex items-center justify-between">
                        <Link href="/live" className="p-2">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </Link>

                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2 px-3 py-1 bg-red-600 rounded-full text-sm">
                                <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
                                LIVE
                            </div>
                            <div className="px-3 py-1 bg-black/60 rounded-full text-sm">
                                👁 {stream.viewers.toLocaleString()}
                            </div>
                        </div>

                        <button className="p-2">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                            </svg>
                        </button>
                    </div>

                    {/* ホスト情報 */}
                    <div className="flex items-center gap-3 mt-4">
                        <img
                            src={stream.host.avatar}
                            alt={stream.host.name}
                            className="w-12 h-12 rounded-full border-2 border-red-500"
                        />
                        <div>
                            <h2 className="font-bold">{stream.title}</h2>
                            <p className="text-sm text-white/70">{stream.host.name}</p>
                        </div>
                        <button
                            onClick={() => setIsFollowing(!isFollowing)}
                            className={`ml-auto px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                                isFollowing ? "bg-white/20" : "bg-red-600"
                            }`}
                        >
                            {isFollowing ? "フォロー中" : "フォロー"}
                        </button>
                    </div>
                </div>

                {/* ハートアニメーション */}
                {hearts.map((heart) => (
                    <div
                        key={heart.id}
                        className="absolute bottom-32 animate-float-up pointer-events-none"
                        style={{ left: `${heart.x}%` }}
                    >
                        <span className="text-3xl text-red-500">❤️</span>
                    </div>
                ))}

                {/* 右側アクション */}
                <div className="absolute right-4 bottom-32 flex flex-col gap-4">
                    <button
                        onClick={handleLike}
                        className={`w-14 h-14 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center transition-transform ${
                            liked ? "scale-125" : ""
                        }`}
                    >
                        <span className="text-2xl">❤️</span>
                    </button>
                    <button
                        onClick={() => setShowProducts(!showProducts)}
                        className="w-14 h-14 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center relative"
                    >
                        <span className="text-2xl">🛍️</span>
                        {stream.products.length > 0 && (
                            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-xs flex items-center justify-center">
                                {stream.products.length}
                            </span>
                        )}
                    </button>
                </div>

                {/* チャットオーバーレイ */}
                <div className="absolute left-0 right-20 bottom-24 max-h-48 overflow-y-auto px-4 space-y-2">
                    {messages.slice(-10).map((msg) => (
                        <div
                            key={msg.id}
                            className={`text-sm ${
                                msg.type === "system"
                                    ? "text-yellow-400"
                                    : msg.type === "purchase"
                                    ? "text-green-400"
                                    : "text-white"
                            }`}
                        >
                            {msg.type === "purchase" ? (
                                <span className="bg-green-500/20 px-2 py-1 rounded">
                                    🎉 {msg.user} {msg.message}
                                </span>
                            ) : msg.type === "system" ? (
                                <span className="bg-yellow-500/20 px-2 py-1 rounded">
                                    📢 {msg.message}
                                </span>
                            ) : (
                                <>
                                    <span className="font-bold text-white/80">{msg.user}:</span>{" "}
                                    <span className="text-white/90">{msg.message}</span>
                                </>
                            )}
                        </div>
                    ))}
                    <div ref={chatEndRef} />
                </div>
            </div>

            {/* 商品パネル */}
            {showProducts && (
                <div className="absolute bottom-24 left-0 right-0 bg-black/90 backdrop-blur-sm rounded-t-3xl p-4 max-h-[60vh] overflow-y-auto">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-bold text-lg">紹介中の商品</h3>
                        <button onClick={() => setShowProducts(false)} className="p-2">
                            ✕
                        </button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        {stream.products.map((product) => (
                            <button
                                key={product.id}
                                onClick={() => setSelectedProduct(product)}
                                className="bg-white/10 rounded-xl p-3 text-left"
                            >
                                <img
                                    src={product.image_url}
                                    alt={product.name}
                                    className="w-full aspect-square object-cover rounded-lg mb-2"
                                />
                                <p className="font-medium line-clamp-1">{product.name}</p>
                                <p className="text-red-400 font-bold">¥{product.price.toLocaleString()}</p>
                                <p className="text-xs text-white/50">残り{product.stock}点</p>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* 購入確認モーダル */}
            {selectedProduct && (
                <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60">
                    <div className="bg-white text-slate-900 rounded-t-3xl p-6 w-full max-w-lg">
                        <div className="flex gap-4 mb-4">
                            <img
                                src={selectedProduct.image_url}
                                alt={selectedProduct.name}
                                className="w-24 h-24 object-cover rounded-xl"
                            />
                            <div>
                                <h3 className="font-bold text-lg">{selectedProduct.name}</h3>
                                <p className="text-2xl font-bold text-red-600">
                                    ¥{selectedProduct.price.toLocaleString()}
                                </p>
                                <p className="text-sm text-slate-500">残り{selectedProduct.stock}点</p>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setSelectedProduct(null)}
                                className="flex-1 py-3 border rounded-xl font-medium"
                            >
                                キャンセル
                            </button>
                            <button
                                onClick={() => handlePurchase(selectedProduct)}
                                className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold"
                            >
                                購入する
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* チャット入力 */}
            <div className="bg-black/90 backdrop-blur-sm p-4">
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyPress={(e) => e.key === "Enter" && sendMessage()}
                        placeholder="コメントを入力..."
                        className="flex-1 px-4 py-3 bg-white/10 rounded-full text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                    <button
                        onClick={sendMessage}
                        className="px-6 py-3 bg-red-600 rounded-full font-medium"
                    >
                        送信
                    </button>
                </div>
            </div>

            <style jsx>{`
                @keyframes float-up {
                    0% {
                        opacity: 1;
                        transform: translateY(0) scale(1);
                    }
                    100% {
                        opacity: 0;
                        transform: translateY(-100px) scale(1.5);
                    }
                }
                .animate-float-up {
                    animation: float-up 2s ease-out forwards;
                }
            `}</style>
        </div>
    );
}
