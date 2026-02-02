"use client";

import { useState, useEffect } from "react";

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallPrompt() {
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
    const [showPrompt, setShowPrompt] = useState(false);
    const [isIOS, setIsIOS] = useState(false);
    const [isStandalone, setIsStandalone] = useState(false);

    useEffect(() => {
        // PWAとして起動済みか確認
        const standalone = window.matchMedia("(display-mode: standalone)").matches;
        setIsStandalone(standalone);

        // iOS判定
        const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
        setIsIOS(ios);

        // インストールプロンプトをキャプチャ
        const handleBeforeInstall = (e: Event) => {
            e.preventDefault();
            setDeferredPrompt(e as BeforeInstallPromptEvent);

            // 初回訪問から3回目以降で表示
            const visitCount = parseInt(localStorage.getItem("visit_count") || "0", 10) + 1;
            localStorage.setItem("visit_count", String(visitCount));

            // 既にdismissedなら表示しない
            const dismissed = localStorage.getItem("pwa_prompt_dismissed");
            if (!dismissed && visitCount >= 3) {
                setShowPrompt(true);
            }
        };

        window.addEventListener("beforeinstallprompt", handleBeforeInstall);

        return () => {
            window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
        };
    }, []);

    const handleInstall = async () => {
        if (!deferredPrompt) return;

        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;

        if (outcome === "accepted") {
            console.log("PWA installed");
        }

        setDeferredPrompt(null);
        setShowPrompt(false);
    };

    const handleDismiss = () => {
        setShowPrompt(false);
        localStorage.setItem("pwa_prompt_dismissed", "true");
    };

    // 既にインストール済みなら何も表示しない
    if (isStandalone) return null;

    // iOSの場合は別のUI
    if (isIOS && showPrompt) {
        return (
            <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg p-4 z-50 animate-slide-up">
                <div className="max-w-lg mx-auto">
                    <div className="flex items-start gap-4">
                        <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
                            C
                        </div>
                        <div className="flex-1">
                            <h3 className="font-bold">アプリをインストール</h3>
                            <p className="text-sm text-gray-600 mt-1">
                                ホーム画面に追加して、より快適に使えます
                            </p>
                            <div className="mt-3 text-sm text-gray-500 bg-gray-50 rounded-lg p-3">
                                <p className="flex items-center gap-2">
                                    <span>1.</span>
                                    <span>下の</span>
                                    <span className="inline-flex items-center justify-center w-6 h-6 bg-blue-500 text-white rounded">
                                        ↑
                                    </span>
                                    <span>をタップ</span>
                                </p>
                                <p className="flex items-center gap-2 mt-1">
                                    <span>2.</span>
                                    <span>「ホーム画面に追加」を選択</span>
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={handleDismiss}
                            className="text-gray-400 hover:text-gray-600"
                        >
                            ✕
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Android/Desktop
    if (!showPrompt || !deferredPrompt) return null;

    return (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg p-4 z-50 animate-slide-up">
            <div className="max-w-lg mx-auto">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
                        C
                    </div>
                    <div className="flex-1">
                        <h3 className="font-bold">アプリをインストール</h3>
                        <p className="text-sm text-gray-600">
                            ホーム画面に追加して、より快適に
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={handleDismiss}
                            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-full text-sm"
                        >
                            後で
                        </button>
                        <button
                            onClick={handleInstall}
                            className="px-4 py-2 bg-purple-500 text-white rounded-full text-sm font-medium hover:bg-purple-600"
                        >
                            インストール
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default InstallPrompt;
