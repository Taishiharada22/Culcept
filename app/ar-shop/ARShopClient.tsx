// app/ar-shop/ARShopClient.tsx
"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence, useMotionValue, useTransform } from "framer-motion";
import {
    LightBackground,
    GlassCard,
    GlassNavbar,
    GlassButton,
    GlassBadge,
    GlassModal,
    FadeInView,
    FloatingNavLight,
} from "@/components/ui/glassmorphism-design";

// 型定義
type Product3D = {
    id: string;
    title: string;
    brand: string;
    price: number;
    images: string[];
    position: { x: number; y: number; z: number };
    rotation: number;
    scale: number;
    category: string;
    isNew?: boolean;
    isSale?: boolean;
};

// モックデータ - 3D空間の商品配置
const mockProducts: Product3D[] = [
    { id: "1", title: "オーバーサイズブレザー", brand: "ZARA", price: 12800, images: [], position: { x: -30, y: 0, z: 0 }, rotation: 15, scale: 1, category: "アウター", isNew: true },
    { id: "2", title: "ニットセーター", brand: "UNIQLO", price: 4990, images: [], position: { x: 0, y: 10, z: 20 }, rotation: -10, scale: 1.1, category: "トップス" },
    { id: "3", title: "デニムパンツ", brand: "Levi's", price: 13200, images: [], position: { x: 25, y: -5, z: 10 }, rotation: 5, scale: 0.95, category: "パンツ", isSale: true },
    { id: "4", title: "スニーカー", brand: "Nike", price: 14300, images: [], position: { x: -20, y: -15, z: 30 }, rotation: -20, scale: 1.05, category: "シューズ", isNew: true },
    { id: "5", title: "キャンバスバッグ", brand: "COS", price: 8900, images: [], position: { x: 35, y: 15, z: -10 }, rotation: 25, scale: 0.9, category: "バッグ" },
    { id: "6", title: "ウールコート", brand: "Cos", price: 34900, images: [], position: { x: -40, y: 5, z: -20 }, rotation: -5, scale: 1.15, category: "アウター" },
];

const categoryEmojis: Record<string, string> = {
    "アウター": "🧥",
    "トップス": "👕",
    "パンツ": "👖",
    "シューズ": "👟",
    "バッグ": "👜",
    "アクセサリー": "💍",
};

export default function ARShopClient() {
    const [selectedProduct, setSelectedProduct] = useState<Product3D | null>(null);
    const [viewAngle, setViewAngle] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [isDragging, setIsDragging] = useState(false);
    const [showProductDetail, setShowProductDetail] = useState(false);
    const [isGyroEnabled, setIsGyroEnabled] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const lastTouch = useRef({ x: 0, y: 0 });

    // ジャイロスコープでの視点移動
    useEffect(() => {
        if (!isGyroEnabled) return;

        const handleOrientation = (e: DeviceOrientationEvent) => {
            if (e.gamma !== null && e.beta !== null) {
                setViewAngle({
                    x: Math.max(-30, Math.min(30, e.gamma)),
                    y: Math.max(-30, Math.min(30, (e.beta - 45))),
                });
            }
        };

        window.addEventListener("deviceorientation", handleOrientation);
        return () => window.removeEventListener("deviceorientation", handleOrientation);
    }, [isGyroEnabled]);

    // ドラッグでの視点移動
    const handleDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
        setIsDragging(true);
        if ("touches" in e) {
            lastTouch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        } else {
            lastTouch.current = { x: e.clientX, y: e.clientY };
        }
    }, []);

    const handleDragMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
        if (!isDragging) return;

        const currentX = "touches" in e ? e.touches[0].clientX : e.clientX;
        const currentY = "touches" in e ? e.touches[0].clientY : e.clientY;

        const deltaX = (currentX - lastTouch.current.x) * 0.2;
        const deltaY = (currentY - lastTouch.current.y) * 0.2;

        setViewAngle(prev => ({
            x: Math.max(-60, Math.min(60, prev.x + deltaX)),
            y: Math.max(-40, Math.min(40, prev.y - deltaY)),
        }));

        lastTouch.current = { x: currentX, y: currentY };
    }, [isDragging]);

    const handleDragEnd = useCallback(() => {
        setIsDragging(false);
    }, []);

    // ズーム操作
    const handleWheel = useCallback((e: React.WheelEvent) => {
        e.preventDefault();
        setZoom(prev => Math.max(0.5, Math.min(2, prev - e.deltaY * 0.001)));
    }, []);

    // 商品をタップ
    const handleProductClick = useCallback((product: Product3D) => {
        setSelectedProduct(product);
        setShowProductDetail(true);
    }, []);

    // ジャイロ有効化リクエスト
    const requestGyro = useCallback(async () => {
        if (typeof (DeviceOrientationEvent as any).requestPermission === "function") {
            try {
                const permission = await (DeviceOrientationEvent as any).requestPermission();
                if (permission === "granted") {
                    setIsGyroEnabled(true);
                }
            } catch (error) {
                console.error("Gyro permission denied");
            }
        } else {
            setIsGyroEnabled(true);
        }
    }, []);

    return (
        <LightBackground>
            {/* ヘッダー */}
            <GlassNavbar transparent>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link
                            href="/"
                            className="w-10 h-10 rounded-xl bg-white/80 backdrop-blur-lg shadow-lg hover:bg-white flex items-center justify-center text-slate-600 transition-colors"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </Link>
                        <div className="bg-white/80 backdrop-blur-lg rounded-xl px-4 py-2 shadow-lg">
                            <h1 className="text-lg font-bold text-slate-900">AR Space</h1>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={requestGyro}
                            className={`w-10 h-10 rounded-xl backdrop-blur-lg shadow-lg flex items-center justify-center transition-colors ${
                                isGyroEnabled ? "bg-purple-500 text-white" : "bg-white/80 text-slate-600 hover:bg-white"
                            }`}
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                            </svg>
                        </button>
                        <GlassBadge variant="gradient">Beta</GlassBadge>
                    </div>
                </div>
            </GlassNavbar>

            {/* 3D空間 */}
            <div
                ref={containerRef}
                className="fixed inset-0 overflow-hidden cursor-grab active:cursor-grabbing"
                onMouseDown={handleDragStart}
                onMouseMove={handleDragMove}
                onMouseUp={handleDragEnd}
                onMouseLeave={handleDragEnd}
                onTouchStart={handleDragStart}
                onTouchMove={handleDragMove}
                onTouchEnd={handleDragEnd}
                onWheel={handleWheel}
                style={{ touchAction: "none" }}
            >
                {/* 3D空間背景 */}
                <div
                    className="absolute inset-0 transition-transform duration-100"
                    style={{
                        transform: `perspective(1000px) rotateX(${viewAngle.y}deg) rotateY(${viewAngle.x}deg) scale(${zoom})`,
                        transformStyle: "preserve-3d",
                    }}
                >
                    {/* グリッド床 */}
                    <div
                        className="absolute w-[200vw] h-[200vw] left-1/2 top-1/2 -translate-x-1/2"
                        style={{
                            transform: "translateZ(-200px) rotateX(90deg)",
                            background: `
                                linear-gradient(rgba(139,92,246,0.1) 1px, transparent 1px),
                                linear-gradient(90deg, rgba(139,92,246,0.1) 1px, transparent 1px)
                            `,
                            backgroundSize: "50px 50px",
                        }}
                    />

                    {/* 商品配置 */}
                    {mockProducts.map((product) => (
                        <motion.div
                            key={product.id}
                            className="absolute left-1/2 top-1/2 cursor-pointer"
                            style={{
                                transform: `
                                    translateX(${product.position.x * 5}px)
                                    translateY(${product.position.y * 5}px)
                                    translateZ(${product.position.z * 5}px)
                                    rotateY(${product.rotation}deg)
                                    scale(${product.scale})
                                `,
                                transformStyle: "preserve-3d",
                            }}
                            whileHover={{ scale: product.scale * 1.1 }}
                            whileTap={{ scale: product.scale * 0.95 }}
                            onClick={() => handleProductClick(product)}
                        >
                            {/* 商品カード（3D風） */}
                            <div className="relative w-40 h-52 rounded-2xl bg-white/90 backdrop-blur-xl shadow-2xl overflow-hidden border border-white">
                                {/* 商品画像 */}
                                <div className="h-32 bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center relative">
                                    <span className="text-5xl">{categoryEmojis[product.category] || "👕"}</span>

                                    {/* バッジ */}
                                    {product.isNew && (
                                        <div className="absolute top-2 left-2 px-2 py-0.5 bg-gradient-to-r from-pink-500 to-purple-500 text-white text-xs font-bold rounded-full">
                                            NEW
                                        </div>
                                    )}
                                    {product.isSale && (
                                        <div className="absolute top-2 right-2 px-2 py-0.5 bg-red-500 text-white text-xs font-bold rounded-full">
                                            SALE
                                        </div>
                                    )}
                                </div>

                                {/* 情報 */}
                                <div className="p-3">
                                    <p className="text-xs text-slate-500 font-medium">{product.brand}</p>
                                    <p className="text-sm font-bold text-slate-900 truncate">{product.title}</p>
                                    <p className="text-sm font-bold text-purple-600 mt-1">
                                        ¥{product.price.toLocaleString()}
                                    </p>
                                </div>

                                {/* ホバー時のグロー */}
                                <motion.div
                                    className="absolute inset-0 rounded-2xl border-2 border-purple-400 opacity-0 pointer-events-none"
                                    whileHover={{ opacity: 1 }}
                                />
                            </div>

                            {/* 床への影 */}
                            <div
                                className="absolute w-32 h-8 left-1/2 -translate-x-1/2 bg-black/10 rounded-full blur-md"
                                style={{
                                    transform: "translateY(120px) rotateX(90deg)",
                                }}
                            />
                        </motion.div>
                    ))}
                </div>
            </div>

            {/* 操作ガイド */}
            <div className="fixed bottom-32 left-4 right-4 pointer-events-none">
                <div className="max-w-md mx-auto">
                    <GlassCard variant="default" padding="sm" className="pointer-events-auto">
                        <div className="flex items-center justify-around text-center">
                            <div className="flex flex-col items-center">
                                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mb-1">
                                    <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11" />
                                    </svg>
                                </div>
                                <p className="text-xs text-slate-600">ドラッグで回転</p>
                            </div>
                            <div className="flex flex-col items-center">
                                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mb-1">
                                    <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                                    </svg>
                                </div>
                                <p className="text-xs text-slate-600">スクロールでズーム</p>
                            </div>
                            <div className="flex flex-col items-center">
                                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mb-1">
                                    <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                                    </svg>
                                </div>
                                <p className="text-xs text-slate-600">タップで詳細</p>
                            </div>
                        </div>
                    </GlassCard>
                </div>
            </div>

            {/* ズームコントロール */}
            <div className="fixed right-4 top-1/2 -translate-y-1/2 flex flex-col gap-2">
                <button
                    onClick={() => setZoom(prev => Math.min(2, prev + 0.2))}
                    className="w-12 h-12 rounded-xl bg-white/80 backdrop-blur-lg shadow-lg flex items-center justify-center text-slate-600 hover:bg-white transition-colors"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                </button>
                <div className="h-24 w-12 rounded-xl bg-white/80 backdrop-blur-lg shadow-lg flex items-center justify-center">
                    <div className="h-16 w-1 bg-slate-200 rounded-full relative">
                        <div
                            className="absolute bottom-0 left-0 right-0 bg-purple-500 rounded-full transition-all"
                            style={{ height: `${((zoom - 0.5) / 1.5) * 100}%` }}
                        />
                    </div>
                </div>
                <button
                    onClick={() => setZoom(prev => Math.max(0.5, prev - 0.2))}
                    className="w-12 h-12 rounded-xl bg-white/80 backdrop-blur-lg shadow-lg flex items-center justify-center text-slate-600 hover:bg-white transition-colors"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                    </svg>
                </button>
            </div>

            {/* 商品詳細モーダル */}
            <GlassModal
                isOpen={showProductDetail}
                onClose={() => setShowProductDetail(false)}
                title={selectedProduct?.title}
                size="md"
            >
                {selectedProduct && (
                    <div className="space-y-6">
                        {/* 3D回転プレビュー */}
                        <div className="aspect-square rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center relative overflow-hidden">
                            <motion.div
                                animate={{ rotateY: 360 }}
                                transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                                className="text-[120px]"
                            >
                                {categoryEmojis[selectedProduct.category] || "👕"}
                            </motion.div>

                            <div className="absolute bottom-4 left-4 right-4 flex justify-center gap-2">
                                <p className="text-xs text-slate-500 bg-white/80 backdrop-blur-sm px-3 py-1 rounded-full">
                                    360° ビュー
                                </p>
                            </div>

                            {selectedProduct.isNew && (
                                <GlassBadge variant="gradient" className="absolute top-4 left-4">
                                    NEW
                                </GlassBadge>
                            )}
                        </div>

                        {/* 情報 */}
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <GlassBadge variant="default">{selectedProduct.brand}</GlassBadge>
                                <GlassBadge variant="info">{selectedProduct.category}</GlassBadge>
                            </div>
                            <h3 className="text-xl font-bold text-slate-900">{selectedProduct.title}</h3>
                            <p className="text-2xl font-bold text-purple-600 mt-2">
                                ¥{selectedProduct.price.toLocaleString()}
                            </p>
                        </div>

                        {/* アクション */}
                        <div className="flex gap-3">
                            <GlassButton
                                variant="secondary"
                                fullWidth
                                icon={
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                                    </svg>
                                }
                            >
                                保存
                            </GlassButton>
                            <GlassButton variant="gradient" fullWidth>
                                商品ページへ
                            </GlassButton>
                        </div>

                        {/* AR試着リンク */}
                        <Link href="/try-on">
                            <GlassCard variant="gradient" padding="sm" hoverEffect className="text-center">
                                <p className="text-sm font-medium text-slate-700">
                                    ✨ この商品をAR試着で確認
                                </p>
                            </GlassCard>
                        </Link>
                    </div>
                )}
            </GlassModal>

            {/* フローティングナビ */}
            <FloatingNavLight
                items={[
                    { href: "/", label: "ホーム", icon: <span>🏠</span> },
                    { href: "/ar-shop", label: "AR", icon: <span>🔮</span>, active: true },
                    { href: "/products", label: "商品", icon: <span>👕</span> },
                    { href: "/my", label: "マイページ", icon: <span>👤</span> },
                ]}
            />
        </LightBackground>
    );
}
