// app/try-on/page.tsx
"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";

interface ClothingItem {
    id: string;
    image_url: string;
    name: string;
    category: string;
}

export default function VirtualTryOnPage() {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [cameraActive, setCameraActive] = useState(false);
    const [selectedItem, setSelectedItem] = useState<ClothingItem | null>(null);
    const [items, setItems] = useState<ClothingItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [overlayPosition, setOverlayPosition] = useState({ x: 50, y: 30 });
    const [overlayScale, setOverlayScale] = useState(1);
    const [capturedImage, setCapturedImage] = useState<string | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [showGuide, setShowGuide] = useState(true);

    // 商品を取得
    useEffect(() => {
        const fetchItems = async () => {
            try {
                const res = await fetch("/api/try-on/items");
                const data = await res.json();
                setItems(data.items || []);
            } catch (error) {
                console.error("Failed to fetch items:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchItems();
    }, []);

    // カメラ起動
    const startCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "user", width: 720, height: 960 },
            });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                setCameraActive(true);
                setShowGuide(false);
            }
        } catch (error) {
            console.error("Camera access denied:", error);
            alert("カメラへのアクセスを許可してください");
        }
    };

    // カメラ停止
    const stopCamera = () => {
        if (videoRef.current?.srcObject) {
            const stream = videoRef.current.srcObject as MediaStream;
            stream.getTracks().forEach((track) => track.stop());
            videoRef.current.srcObject = null;
            setCameraActive(false);
        }
    };

    // 写真撮影
    const capturePhoto = () => {
        if (!canvasRef.current || !videoRef.current) return;

        const canvas = canvasRef.current;
        const video = videoRef.current;
        const ctx = canvas.getContext("2d");

        if (!ctx) return;

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        // ビデオを描画
        ctx.drawImage(video, 0, 0);

        // オーバーレイを描画
        if (selectedItem) {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => {
                const x = (overlayPosition.x / 100) * canvas.width - (img.width * overlayScale) / 2;
                const y = (overlayPosition.y / 100) * canvas.height - (img.height * overlayScale) / 2;
                ctx.drawImage(img, x, y, img.width * overlayScale, img.height * overlayScale);
                setCapturedImage(canvas.toDataURL("image/png"));
            };
            img.src = selectedItem.image_url;
        } else {
            setCapturedImage(canvas.toDataURL("image/png"));
        }
    };

    // ドラッグ操作
    const handleDragStart = () => setIsDragging(true);
    const handleDragEnd = () => setIsDragging(false);

    const handleDrag = useCallback(
        (e: React.TouchEvent | React.MouseEvent) => {
            if (!isDragging) return;

            const container = (e.target as HTMLElement).closest(".try-on-container");
            if (!container) return;

            const rect = container.getBoundingClientRect();
            const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
            const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

            const x = ((clientX - rect.left) / rect.width) * 100;
            const y = ((clientY - rect.top) / rect.height) * 100;

            setOverlayPosition({
                x: Math.max(10, Math.min(90, x)),
                y: Math.max(10, Math.min(90, y)),
            });
        },
        [isDragging]
    );

    // シェア
    const shareImage = async () => {
        if (!capturedImage) return;

        if (navigator.share) {
            try {
                const blob = await (await fetch(capturedImage)).blob();
                const file = new File([blob], "try-on.png", { type: "image/png" });
                await navigator.share({
                    title: "バーチャル試着 - Culcept",
                    files: [file],
                });
            } catch (error) {
                console.log("Share cancelled");
            }
        } else {
            // ダウンロード
            const link = document.createElement("a");
            link.download = "try-on.png";
            link.href = capturedImage;
            link.click();
        }
    };

    return (
        <div className="min-h-screen bg-black text-white">
            {/* ヘッダー */}
            <div className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-b from-black/80 to-transparent p-4">
                <div className="flex items-center justify-between max-w-4xl mx-auto">
                    <Link href="/drops" className="p-2 hover:bg-white/10 rounded-full transition-colors">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                    </Link>
                    <h1 className="font-bold text-lg">バーチャル試着</h1>
                    <div className="w-10" />
                </div>
            </div>

            {/* メイン表示エリア */}
            <div className="relative h-screen">
                {/* ガイド（カメラ起動前） */}
                {showGuide && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-8 bg-gradient-to-b from-purple-900 to-black">
                        <div className="w-24 h-24 bg-white/10 rounded-full flex items-center justify-center mb-6">
                            <span className="text-5xl">👕</span>
                        </div>
                        <h2 className="text-2xl font-bold mb-4">ARで試着しよう！</h2>
                        <p className="text-center text-white/70 mb-8">
                            カメラを起動して、気になるアイテムを<br />
                            自分に重ねてみましょう
                        </p>
                        <button
                            onClick={startCamera}
                            className="px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 rounded-2xl font-bold text-lg hover:from-purple-700 hover:to-pink-700 transition-all"
                        >
                            📸 カメラを起動
                        </button>
                    </div>
                )}

                {/* キャプチャ画像表示 */}
                {capturedImage && (
                    <div className="absolute inset-0 z-40 bg-black flex flex-col">
                        <img
                            src={capturedImage}
                            alt="Captured"
                            className="flex-1 object-contain"
                        />
                        <div className="p-4 flex gap-3">
                            <button
                                onClick={() => setCapturedImage(null)}
                                className="flex-1 py-3 bg-white/20 rounded-xl font-medium"
                            >
                                撮り直す
                            </button>
                            <button
                                onClick={shareImage}
                                className="flex-1 py-3 bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl font-medium"
                            >
                                シェア・保存
                            </button>
                        </div>
                    </div>
                )}

                {/* カメラビュー */}
                <div
                    className="try-on-container relative h-full"
                    onMouseMove={handleDrag}
                    onMouseUp={handleDragEnd}
                    onMouseLeave={handleDragEnd}
                    onTouchMove={handleDrag}
                    onTouchEnd={handleDragEnd}
                >
                    <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className={`w-full h-full object-cover ${cameraActive ? "" : "hidden"}`}
                        style={{ transform: "scaleX(-1)" }}
                    />

                    {/* 服のオーバーレイ */}
                    {cameraActive && selectedItem && (
                        <div
                            className="absolute cursor-move"
                            style={{
                                left: `${overlayPosition.x}%`,
                                top: `${overlayPosition.y}%`,
                                transform: `translate(-50%, -50%) scale(${overlayScale})`,
                            }}
                            onMouseDown={handleDragStart}
                            onTouchStart={handleDragStart}
                        >
                            <img
                                src={selectedItem.image_url}
                                alt={selectedItem.name}
                                className="w-48 h-48 object-contain pointer-events-none"
                                style={{ filter: "drop-shadow(0 4px 20px rgba(0,0,0,0.5))" }}
                            />
                        </div>
                    )}

                    {/* 隠しキャンバス */}
                    <canvas ref={canvasRef} className="hidden" />
                </div>

                {/* コントロール */}
                {cameraActive && !capturedImage && (
                    <>
                        {/* サイズ調整 */}
                        {selectedItem && (
                            <div className="fixed left-4 top-1/2 -translate-y-1/2 z-30 flex flex-col gap-2">
                                <button
                                    onClick={() => setOverlayScale((s) => Math.min(2, s + 0.1))}
                                    className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-full text-2xl"
                                >
                                    +
                                </button>
                                <div className="text-center text-sm opacity-70">
                                    {Math.round(overlayScale * 100)}%
                                </div>
                                <button
                                    onClick={() => setOverlayScale((s) => Math.max(0.3, s - 0.1))}
                                    className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-full text-2xl"
                                >
                                    −
                                </button>
                            </div>
                        )}

                        {/* シャッターボタン */}
                        <div className="fixed bottom-32 left-1/2 -translate-x-1/2 z-30">
                            <button
                                onClick={capturePhoto}
                                className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-lg"
                            >
                                <div className="w-16 h-16 bg-white border-4 border-black rounded-full" />
                            </button>
                        </div>

                        {/* 選択解除 */}
                        {selectedItem && (
                            <button
                                onClick={() => setSelectedItem(null)}
                                className="fixed top-20 right-4 z-30 px-4 py-2 bg-red-500/80 backdrop-blur-sm rounded-full text-sm"
                            >
                                ✕ 解除
                            </button>
                        )}
                    </>
                )}

                {/* アイテムセレクター */}
                {cameraActive && !capturedImage && (
                    <div className="fixed bottom-0 left-0 right-0 z-30 bg-gradient-to-t from-black via-black/90 to-transparent pt-8 pb-4 px-4">
                        <p className="text-sm text-white/60 mb-3">
                            {selectedItem ? "ドラッグで位置調整 • +/-でサイズ調整" : "試着するアイテムを選択"}
                        </p>
                        <div className="flex gap-3 overflow-x-auto pb-2">
                            {items.map((item) => (
                                <button
                                    key={item.id}
                                    onClick={() => setSelectedItem(item)}
                                    className={`flex-shrink-0 rounded-xl overflow-hidden border-2 transition-all ${
                                        selectedItem?.id === item.id
                                            ? "border-purple-500 scale-105"
                                            : "border-transparent"
                                    }`}
                                >
                                    <img
                                        src={item.image_url}
                                        alt={item.name}
                                        className="w-20 h-20 object-cover"
                                    />
                                </button>
                            ))}
                            {items.length === 0 && !loading && (
                                <p className="text-white/50 py-4">アイテムがありません</p>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
