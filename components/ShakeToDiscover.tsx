// components/ShakeToDiscover.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface ShakeToDiscoverProps {
    enabled?: boolean;
}

interface DiscoveredItem {
    id: string;
    image_url: string;
    title: string;
    tags: string[];
}

export default function ShakeToDiscover({ enabled = true }: ShakeToDiscoverProps) {
    const [showModal, setShowModal] = useState(false);
    const [item, setItem] = useState<DiscoveredItem | null>(null);
    const [loading, setLoading] = useState(false);
    const [shakeCount, setShakeCount] = useState(0);

    const discoverItem = useCallback(async () => {
        if (loading) return;

        setLoading(true);
        setShowModal(true);

        try {
            const res = await fetch("/api/discover/random");
            const data = await res.json();
            setItem(data.item);
        } catch (error) {
            console.error("Discover failed:", error);
        } finally {
            setLoading(false);
        }
    }, [loading]);

    useEffect(() => {
        if (!enabled) return;

        let lastX = 0;
        let lastY = 0;
        let lastZ = 0;
        let lastTime = 0;
        const threshold = 15;
        const timeout = 1000;

        const handleMotion = (event: DeviceMotionEvent) => {
            const acceleration = event.accelerationIncludingGravity;
            if (!acceleration) return;

            const currentTime = Date.now();
            const timeDiff = currentTime - lastTime;

            if (timeDiff > 100) {
                const deltaX = Math.abs((acceleration.x || 0) - lastX);
                const deltaY = Math.abs((acceleration.y || 0) - lastY);
                const deltaZ = Math.abs((acceleration.z || 0) - lastZ);

                if (
                    (deltaX > threshold && deltaY > threshold) ||
                    (deltaX > threshold && deltaZ > threshold) ||
                    (deltaY > threshold && deltaZ > threshold)
                ) {
                    setShakeCount((prev) => prev + 1);
                }

                lastX = acceleration.x || 0;
                lastY = acceleration.y || 0;
                lastZ = acceleration.z || 0;
                lastTime = currentTime;
            }
        };

        // シェイクカウントが閾値を超えたらアイテム発見
        if (shakeCount >= 3) {
            discoverItem();
            setShakeCount(0);
        }

        // シェイクカウントをリセット
        const resetTimer = setTimeout(() => {
            setShakeCount(0);
        }, timeout);

        // iOS 13+でモーション許可が必要
        if (typeof DeviceMotionEvent !== "undefined") {
            if (typeof (DeviceMotionEvent as any).requestPermission === "function") {
                // iOS
                (DeviceMotionEvent as any).requestPermission().then((response: string) => {
                    if (response === "granted") {
                        window.addEventListener("devicemotion", handleMotion);
                    }
                });
            } else {
                // Android / Desktop
                window.addEventListener("devicemotion", handleMotion);
            }
        }

        return () => {
            window.removeEventListener("devicemotion", handleMotion);
            clearTimeout(resetTimer);
        };
    }, [enabled, shakeCount, discoverItem]);

    if (!showModal) {
        return null;
    }

    return (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl p-6 max-w-sm w-full text-center">
                {/* ヘッダー */}
                <div className="flex items-center justify-between mb-4">
                    <div className="text-2xl">🎲</div>
                    <h2 className="font-bold text-lg">発見！</h2>
                    <button
                        onClick={() => setShowModal(false)}
                        className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600"
                    >
                        ✕
                    </button>
                </div>

                {loading ? (
                    <div className="py-12">
                        <div className="animate-spin text-4xl mb-4">🎰</div>
                        <p className="text-slate-600">アイテムを探しています...</p>
                    </div>
                ) : item ? (
                    <>
                        {/* アイテム画像 */}
                        <div className="relative mb-4">
                            <img
                                src={item.image_url}
                                alt={item.title}
                                className="w-full aspect-square object-cover rounded-2xl"
                            />
                            <div className="absolute top-2 right-2 px-3 py-1 bg-purple-600 text-white rounded-full text-sm font-bold">
                                ランダム発見
                            </div>
                        </div>

                        {/* アイテム情報 */}
                        <h3 className="font-bold text-lg mb-2">{item.title}</h3>
                        <div className="flex flex-wrap justify-center gap-1 mb-4">
                            {item.tags.slice(0, 4).map((tag, i) => (
                                <span
                                    key={i}
                                    className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs"
                                >
                                    #{tag}
                                </span>
                            ))}
                        </div>

                        {/* アクション */}
                        <div className="flex gap-3">
                            <button
                                onClick={() => {
                                    setItem(null);
                                    discoverItem();
                                }}
                                className="flex-1 py-3 border rounded-xl font-medium text-slate-700 hover:bg-slate-50"
                            >
                                🔄 もう一回
                            </button>
                            <Link
                                href={`/drops/${item.id}`}
                                className="flex-1 py-3 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700"
                                onClick={() => setShowModal(false)}
                            >
                                詳細を見る
                            </Link>
                        </div>
                    </>
                ) : (
                    <div className="py-12">
                        <p className="text-slate-600">アイテムが見つかりませんでした</p>
                    </div>
                )}

                {/* ヒント */}
                <div className="mt-4 pt-4 border-t">
                    <p className="text-xs text-slate-500">
                        📱 スマホを振るとランダムなアイテムが見つかります
                    </p>
                </div>
            </div>
        </div>
    );
}

// モーション許可リクエストコンポーネント
export function ShakePermissionRequest({ onGranted }: { onGranted: () => void }) {
    const [requested, setRequested] = useState(false);

    const requestPermission = async () => {
        if (typeof DeviceMotionEvent !== "undefined") {
            if (typeof (DeviceMotionEvent as any).requestPermission === "function") {
                try {
                    const response = await (DeviceMotionEvent as any).requestPermission();
                    if (response === "granted") {
                        onGranted();
                    }
                } catch (error) {
                    console.error("Permission request failed:", error);
                }
            } else {
                onGranted();
            }
        }
        setRequested(true);
    };

    if (requested) return null;

    return (
        <button
            onClick={requestPermission}
            className="fixed bottom-20 right-4 z-40 w-14 h-14 bg-purple-600 text-white rounded-full shadow-lg flex items-center justify-center text-2xl hover:bg-purple-700 transition-colors animate-bounce"
            title="シェイクで発見"
        >
            🎲
        </button>
    );
}
