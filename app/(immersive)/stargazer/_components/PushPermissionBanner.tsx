"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

const DISMISS_KEY = "stargazer_push_dismissed_at";
const GRANTED_KEY = "stargazer_push_granted";
const DISMISS_DAYS = 7;

interface Props {
  onGranted: () => void;
  onDismissed: () => void;
}

function isDismissedRecently(): boolean {
  try {
    const stored = localStorage.getItem(DISMISS_KEY);
    if (!stored) return false;
    const dismissedAt = parseInt(stored, 10);
    const daysSince = (Date.now() - dismissedAt) / (1000 * 60 * 60 * 24);
    return daysSince < DISMISS_DAYS;
  } catch {
    return false;
  }
}

function isSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

const FEATURES = [
  { icon: "\u{1F52D}", label: "\u671D\u306E\u4E00\u554F\uFF08\u6BCE\u671D8\u6642\uFF09" },
  { icon: "\u2728", label: "\u6D88\u3048\u308B\u30A4\u30F3\u30B5\u30A4\u30C8\uFF0824\u6642\u9593\u9650\u5B9A\uFF09" },
  { icon: "\u{1F4C9}", label: "\u7CBE\u5EA6\u4F4E\u4E0B\u30A2\u30E9\u30FC\u30C8" },
  { icon: "\u{1F4AC}", label: "Alter\u304B\u3089\u306E\u30E1\u30C3\u30BB\u30FC\u30B8" },
] as const;

export default function PushPermissionBanner({ onGranted, onDismissed }: Props) {
  const [visible, setVisible] = useState(false);
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    if (!isSupported()) return;
    if (Notification.permission === "granted") return;
    if (Notification.permission === "denied") return;
    // 一度許可を押した後は永久に非表示
    try {
      if (localStorage.getItem(GRANTED_KEY) === "true") return;
    } catch { /* noop */ }
    if (isDismissedRecently()) return;
    setVisible(true);
  }, []);

  const handleRequest = useCallback(async () => {
    if (requesting) return;
    setRequesting(true);

    try {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        // サービスワーカー登録 + プッシュサブスクリプション取得
        const registration = await navigator.serviceWorker.register("/sw-push.js");
        await navigator.serviceWorker.ready;

        const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (vapidKey) {
          const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
          });

          // サブスクリプションをサーバーに登録
          await fetch("/api/push/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              token: JSON.stringify(subscription),
              platform: "web",
            }),
          });
        }

        // 許可済みをlocalStorageに永続保存 → 二度と表示しない
        try { localStorage.setItem(GRANTED_KEY, "true"); } catch { /* noop */ }
        setVisible(false);
        onGranted();
      }
    } catch (err) {
      console.error("[PushPermissionBanner] Error requesting permission:", err);
    } finally {
      setRequesting(false);
    }
  }, [requesting, onGranted]);

  const handleDismiss = useCallback(() => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // localStorage unavailable
    }
    setVisible(false);
    onDismissed();
  }, [onDismissed]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.95 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="mx-auto max-w-6xl px-4 pb-4"
        >
          <div
            className="relative overflow-hidden rounded-2xl p-5"
            style={{
              background:
                "linear-gradient(135deg, rgba(255,255,255,0.85) 0%, rgba(248,245,240,0.8) 100%)",
              border: "1px solid rgba(180,160,120,0.25)",
              boxShadow:
                "0 8px 32px rgba(24,32,64,0.08), inset 0 1px 0 rgba(255,255,255,0.6)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
            }}
          >
            {/* Gold accent line */}
            <div
              className="absolute left-0 top-0 h-full w-1"
              style={{
                background:
                  "linear-gradient(180deg, rgba(200,170,100,0.8) 0%, rgba(180,150,80,0.4) 100%)",
              }}
            />

            <div className="space-y-4 pl-3">
              {/* Title */}
              <div>
                <h3
                  className="text-base font-semibold tracking-wide"
                  style={{ color: "rgba(40,35,30,0.9)" }}
                >
                  観測を逃さないために
                </h3>
                <p
                  className="mt-1 text-sm"
                  style={{ color: "rgba(60,55,50,0.65)", lineHeight: 1.7 }}
                >
                  朝の一問や新しい発見をリアルタイムでお届けします
                </p>
              </div>

              {/* Features */}
              <div className="grid grid-cols-2 gap-2">
                {FEATURES.map((f) => (
                  <div
                    key={f.label}
                    className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs"
                    style={{
                      background: "rgba(255,255,255,0.5)",
                      color: "rgba(40,35,30,0.75)",
                    }}
                  >
                    <span className="text-sm">{f.icon}</span>
                    <span>{f.label}</span>
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3">
                <button
                  onClick={handleRequest}
                  disabled={requesting}
                  className="rounded-xl px-5 py-2.5 text-sm font-medium transition-all active:scale-[0.97]"
                  style={{
                    background: requesting
                      ? "rgba(180,160,120,0.4)"
                      : "linear-gradient(135deg, rgba(180,160,120,0.9) 0%, rgba(160,140,100,0.85) 100%)",
                    color: "#fff",
                    boxShadow: requesting
                      ? "none"
                      : "0 4px 16px rgba(180,160,120,0.3)",
                  }}
                >
                  {requesting ? "許可を確認中..." : "通知を許可する"}
                </button>
                <button
                  onClick={handleDismiss}
                  className="text-xs transition-colors hover:underline"
                  style={{ color: "rgba(60,55,50,0.45)" }}
                >
                  あとで
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * VAPID公開鍵をUint8Arrayに変換（Web Push API用）
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
