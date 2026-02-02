"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistration() {
    useEffect(() => {
        if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
            return;
        }

        // 開発環境ではスキップ
        if (process.env.NODE_ENV === "development") {
            console.log("[SW] Skipping registration in development");
            return;
        }

        const registerSW = async () => {
            try {
                const registration = await navigator.serviceWorker.register("/sw.js", {
                    scope: "/",
                });

                console.log("[SW] Registered:", registration.scope);

                // 更新チェック
                registration.addEventListener("updatefound", () => {
                    const newWorker = registration.installing;
                    if (!newWorker) return;

                    newWorker.addEventListener("statechange", () => {
                        if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                            // 新しいバージョンがインストールされた
                            console.log("[SW] New version available");

                            // ユーザーに更新を通知
                            if (confirm("新しいバージョンが利用可能です。更新しますか？")) {
                                window.location.reload();
                            }
                        }
                    });
                });
            } catch (error) {
                console.error("[SW] Registration failed:", error);
            }
        };

        // ページ読み込み後に登録
        if (document.readyState === "complete") {
            registerSW();
        } else {
            window.addEventListener("load", registerSW);
        }
    }, []);

    return null;
}

export default ServiceWorkerRegistration;
