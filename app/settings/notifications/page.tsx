// app/settings/notifications/page.tsx
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface NotificationPreferences {
    // アイテム関連
    new_items: boolean;           // 新着アイテム
    price_drops: boolean;         // 値下げ通知
    restock: boolean;             // 再入荷通知
    favorite_seller: boolean;     // お気に入りセラーの新商品

    // アクティビティ
    likes_on_items: boolean;      // 自分の商品へのいいね
    new_followers: boolean;       // 新しいフォロワー
    messages: boolean;            // メッセージ受信
    purchase_updates: boolean;    // 購入状況の更新

    // ダイジェスト
    weekly_digest: boolean;       // 週間まとめ
    recommendations: boolean;     // おすすめ通知

    // 通知方法
    push_enabled: boolean;        // プッシュ通知
    email_enabled: boolean;       // メール通知

    // 静かな時間
    quiet_hours_enabled: boolean;
    quiet_hours_start: string;    // "22:00"
    quiet_hours_end: string;      // "08:00"
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
    new_items: true,
    price_drops: true,
    restock: true,
    favorite_seller: true,
    likes_on_items: true,
    new_followers: true,
    messages: true,
    purchase_updates: true,
    weekly_digest: true,
    recommendations: false,
    push_enabled: false,
    email_enabled: true,
    quiet_hours_enabled: false,
    quiet_hours_start: "22:00",
    quiet_hours_end: "08:00",
};

interface NotificationCategory {
    title: string;
    description: string;
    items: {
        key: keyof NotificationPreferences;
        label: string;
        description: string;
    }[];
}

const NOTIFICATION_CATEGORIES: NotificationCategory[] = [
    {
        title: "🛍️ アイテム関連",
        description: "商品に関する通知",
        items: [
            {
                key: "new_items",
                label: "新着アイテム",
                description: "あなたの好みに合った新商品をお知らせ",
            },
            {
                key: "price_drops",
                label: "値下げ通知",
                description: "お気に入り商品の価格が下がった時",
            },
            {
                key: "restock",
                label: "再入荷通知",
                description: "売り切れ商品が再入荷した時",
            },
            {
                key: "favorite_seller",
                label: "お気に入りセラー",
                description: "フォロー中のセラーが新商品を出品した時",
            },
        ],
    },
    {
        title: "💬 アクティビティ",
        description: "あなたのアクティビティに関する通知",
        items: [
            {
                key: "likes_on_items",
                label: "いいね通知",
                description: "あなたの商品に「いいね」がついた時",
            },
            {
                key: "new_followers",
                label: "新しいフォロワー",
                description: "誰かがあなたをフォローした時",
            },
            {
                key: "messages",
                label: "メッセージ",
                description: "新しいメッセージを受信した時",
            },
            {
                key: "purchase_updates",
                label: "取引の更新",
                description: "購入・販売の状況が更新された時",
            },
        ],
    },
    {
        title: "📊 ダイジェスト",
        description: "まとめ通知",
        items: [
            {
                key: "weekly_digest",
                label: "週間ダイジェスト",
                description: "週に1回、トレンドやおすすめをまとめてお届け",
            },
            {
                key: "recommendations",
                label: "パーソナライズ通知",
                description: "AIが選んだあなたへのおすすめ",
            },
        ],
    },
];

export default function NotificationSettingsPage() {
    const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULT_PREFERENCES);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [pushSupported, setPushSupported] = useState(false);
    const [pushPermission, setPushPermission] = useState<NotificationPermission>("default");
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

    // 初期化
    useEffect(() => {
        // Push API対応チェック
        if ("Notification" in window && "serviceWorker" in navigator) {
            setPushSupported(true);
            setPushPermission(Notification.permission);
        }

        // 設定を取得
        fetchPreferences();
    }, []);

    const fetchPreferences = async () => {
        try {
            const res = await fetch("/api/notifications/preferences");
            if (res.ok) {
                const data = await res.json();
                if (data.preferences) {
                    setPreferences({ ...DEFAULT_PREFERENCES, ...data.preferences });
                }
            }
        } catch (error) {
            console.error("Failed to fetch preferences:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleToggle = (key: keyof NotificationPreferences) => {
        setPreferences((prev) => ({
            ...prev,
            [key]: !prev[key],
        }));
    };

    const handleTimeChange = (key: "quiet_hours_start" | "quiet_hours_end", value: string) => {
        setPreferences((prev) => ({
            ...prev,
            [key]: value,
        }));
    };

    const requestPushPermission = async () => {
        if (!pushSupported) return;

        try {
            const permission = await Notification.requestPermission();
            setPushPermission(permission);

            if (permission === "granted") {
                // Service Worker登録 & プッシュ購読
                const registration = await navigator.serviceWorker.ready;
                const subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
                });

                // サーバーに登録
                await fetch("/api/notifications/subscribe", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        subscription: subscription.toJSON(),
                        preferences,
                    }),
                });

                setPreferences((prev) => ({ ...prev, push_enabled: true }));
                setMessage({ type: "success", text: "プッシュ通知を有効にしました！" });
            }
        } catch (error) {
            console.error("Push subscription failed:", error);
            setMessage({ type: "error", text: "プッシュ通知の設定に失敗しました" });
        }
    };

    const savePreferences = async () => {
        setSaving(true);
        setMessage(null);

        try {
            const res = await fetch("/api/notifications/preferences", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ preferences }),
            });

            if (res.ok) {
                setMessage({ type: "success", text: "設定を保存しました！" });
            } else {
                throw new Error("Failed to save");
            }
        } catch (error) {
            setMessage({ type: "error", text: "保存に失敗しました" });
        } finally {
            setSaving(false);
        }
    };

    const testNotification = async () => {
        if (!pushSupported || pushPermission !== "granted") {
            setMessage({ type: "error", text: "プッシュ通知を許可してください" });
            return;
        }

        try {
            const res = await fetch("/api/notifications/test", {
                method: "POST",
            });

            if (res.ok) {
                setMessage({ type: "success", text: "テスト通知を送信しました！" });
            }
        } catch (error) {
            setMessage({ type: "error", text: "テスト送信に失敗しました" });
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
            <div className="max-w-2xl mx-auto px-4 py-8">
                {/* ヘッダー */}
                <div className="flex items-center gap-4 mb-8">
                    <Link
                        href="/my-page"
                        className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold">通知設定</h1>
                        <p className="text-sm text-slate-600">通知の種類と配信方法をカスタマイズ</p>
                    </div>
                </div>

                {/* メッセージ */}
                {message && (
                    <div
                        className={`mb-6 p-4 rounded-xl ${
                            message.type === "success"
                                ? "bg-green-50 text-green-800 border border-green-200"
                                : "bg-red-50 text-red-800 border border-red-200"
                        }`}
                    >
                        {message.text}
                    </div>
                )}

                {/* プッシュ通知セクション */}
                <div className="bg-white rounded-2xl shadow-sm border p-6 mb-6">
                    <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                                <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                                </svg>
                            </div>
                            <div>
                                <h2 className="font-bold text-lg">プッシュ通知</h2>
                                <p className="text-sm text-slate-600">
                                    {pushPermission === "granted"
                                        ? "有効になっています"
                                        : pushPermission === "denied"
                                        ? "ブラウザの設定で拒否されています"
                                        : "リアルタイムで通知を受け取る"}
                                </p>
                            </div>
                        </div>

                        {pushSupported ? (
                            pushPermission === "granted" ? (
                                <div className="flex items-center gap-2">
                                    <span className="text-green-600 text-sm font-medium">ON</span>
                                    <button
                                        onClick={testNotification}
                                        className="text-sm text-purple-600 hover:underline"
                                    >
                                        テスト送信
                                    </button>
                                </div>
                            ) : pushPermission === "denied" ? (
                                <span className="text-sm text-red-600">拒否済み</span>
                            ) : (
                                <button
                                    onClick={requestPushPermission}
                                    className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors"
                                >
                                    有効にする
                                </button>
                            )
                        ) : (
                            <span className="text-sm text-slate-500">非対応ブラウザ</span>
                        )}
                    </div>
                </div>

                {/* メール通知 */}
                <div className="bg-white rounded-2xl shadow-sm border p-6 mb-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                </svg>
                            </div>
                            <div>
                                <h2 className="font-bold text-lg">メール通知</h2>
                                <p className="text-sm text-slate-600">重要な通知をメールで受け取る</p>
                            </div>
                        </div>
                        <ToggleSwitch
                            enabled={preferences.email_enabled}
                            onChange={() => handleToggle("email_enabled")}
                        />
                    </div>
                </div>

                {/* 通知カテゴリ */}
                {NOTIFICATION_CATEGORIES.map((category) => (
                    <div key={category.title} className="bg-white rounded-2xl shadow-sm border p-6 mb-6">
                        <h2 className="font-bold text-lg mb-1">{category.title}</h2>
                        <p className="text-sm text-slate-600 mb-4">{category.description}</p>

                        <div className="space-y-4">
                            {category.items.map((item) => (
                                <div
                                    key={item.key}
                                    className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0"
                                >
                                    <div>
                                        <div className="font-medium">{item.label}</div>
                                        <div className="text-sm text-slate-500">{item.description}</div>
                                    </div>
                                    <ToggleSwitch
                                        enabled={preferences[item.key] as boolean}
                                        onChange={() => handleToggle(item.key)}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                ))}

                {/* おやすみモード */}
                <div className="bg-white rounded-2xl shadow-sm border p-6 mb-6">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center">
                                <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                                </svg>
                            </div>
                            <div>
                                <h2 className="font-bold text-lg">おやすみモード</h2>
                                <p className="text-sm text-slate-600">指定時間は通知をミュート</p>
                            </div>
                        </div>
                        <ToggleSwitch
                            enabled={preferences.quiet_hours_enabled}
                            onChange={() => handleToggle("quiet_hours_enabled")}
                        />
                    </div>

                    {preferences.quiet_hours_enabled && (
                        <div className="flex items-center gap-4 mt-4 p-4 bg-slate-50 rounded-xl">
                            <div className="flex-1">
                                <label className="block text-sm text-slate-600 mb-1">開始時刻</label>
                                <input
                                    type="time"
                                    value={preferences.quiet_hours_start}
                                    onChange={(e) => handleTimeChange("quiet_hours_start", e.target.value)}
                                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                                />
                            </div>
                            <div className="text-slate-400">→</div>
                            <div className="flex-1">
                                <label className="block text-sm text-slate-600 mb-1">終了時刻</label>
                                <input
                                    type="time"
                                    value={preferences.quiet_hours_end}
                                    onChange={(e) => handleTimeChange("quiet_hours_end", e.target.value)}
                                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* 保存ボタン */}
                <div className="sticky bottom-4 pt-4">
                    <button
                        onClick={savePreferences}
                        disabled={saving}
                        className="w-full py-4 bg-purple-600 text-white rounded-2xl font-bold text-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg"
                    >
                        {saving ? "保存中..." : "設定を保存"}
                    </button>
                </div>

                {/* 通知履歴リンク */}
                <div className="mt-6 text-center">
                    <Link
                        href="/my-page/notifications"
                        className="text-purple-600 hover:underline"
                    >
                        通知履歴を見る →
                    </Link>
                </div>
            </div>
        </div>
    );
}

// トグルスイッチコンポーネント
function ToggleSwitch({
    enabled,
    onChange,
}: {
    enabled: boolean;
    onChange: () => void;
}) {
    return (
        <button
            onClick={onChange}
            className={`relative w-14 h-8 rounded-full transition-colors ${
                enabled ? "bg-purple-600" : "bg-slate-300"
            }`}
        >
            <div
                className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow transition-transform ${
                    enabled ? "translate-x-7" : "translate-x-1"
                }`}
            />
        </button>
    );
}
