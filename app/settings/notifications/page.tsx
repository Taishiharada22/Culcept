// app/settings/notifications/page.tsx
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
    LightBackground,
    GlassNavbar,
    GlassCard,
    GlassButton,
    FadeInView,
} from "@/components/ui/glassmorphism-design";

interface NotificationPreferences {
    new_items: boolean;
    price_drops: boolean;
    restock: boolean;
    favorite_seller: boolean;
    likes_on_items: boolean;
    new_followers: boolean;
    messages: boolean;
    purchase_updates: boolean;
    weekly_digest: boolean;
    recommendations: boolean;
    push_enabled: boolean;
    email_enabled: boolean;
    quiet_hours_enabled: boolean;
    quiet_hours_start: string;
    quiet_hours_end: string;
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
    icon: string;
    gradient: string;
    items: {
        key: keyof NotificationPreferences;
        label: string;
        description: string;
    }[];
}

const NOTIFICATION_CATEGORIES: NotificationCategory[] = [
    {
        title: "アイテム関連",
        description: "商品に関する通知",
        icon: "🛍️",
        gradient: "from-pink-400 to-rose-500",
        items: [
            { key: "new_items", label: "新着アイテム", description: "あなたの好みに合った新商品をお知らせ" },
            { key: "price_drops", label: "値下げ通知", description: "お気に入り商品の価格が下がった時" },
            { key: "restock", label: "再入荷通知", description: "売り切れ商品が再入荷した時" },
            { key: "favorite_seller", label: "お気に入りセラー", description: "フォロー中のセラーが新商品を出品した時" },
        ],
    },
    {
        title: "アクティビティ",
        description: "あなたのアクティビティに関する通知",
        icon: "💬",
        gradient: "from-violet-400 to-indigo-500",
        items: [
            { key: "likes_on_items", label: "いいね通知", description: "あなたの商品に「いいね」がついた時" },
            { key: "new_followers", label: "新しいフォロワー", description: "誰かがあなたをフォローした時" },
            { key: "messages", label: "メッセージ", description: "新しいメッセージを受信した時" },
            { key: "purchase_updates", label: "取引の更新", description: "購入・販売の状況が更新された時" },
        ],
    },
    {
        title: "ダイジェスト",
        description: "まとめ通知",
        icon: "📊",
        gradient: "from-cyan-400 to-blue-500",
        items: [
            { key: "weekly_digest", label: "週間ダイジェスト", description: "週に1回、トレンドやおすすめをまとめてお届け" },
            { key: "recommendations", label: "パーソナライズ通知", description: "AIが選んだあなたへのおすすめ" },
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
    const headingStyle = { fontFamily: "'Cormorant Garamond', serif" };

    useEffect(() => {
        if ("Notification" in window && "serviceWorker" in navigator) {
            setPushSupported(true);
            setPushPermission(Notification.permission);
        }
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
        setPreferences((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    const handleTimeChange = (key: "quiet_hours_start" | "quiet_hours_end", value: string) => {
        setPreferences((prev) => ({ ...prev, [key]: value }));
    };

    const requestPushPermission = async () => {
        if (!pushSupported) return;
        try {
            const permission = await Notification.requestPermission();
            setPushPermission(permission);
            if (permission === "granted") {
                const registration = await navigator.serviceWorker.ready;
                const subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
                });
                await fetch("/api/notifications/subscribe", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ subscription: subscription.toJSON(), preferences }),
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
            const res = await fetch("/api/notifications/test", { method: "POST" });
            if (res.ok) {
                setMessage({ type: "success", text: "テスト通知を送信しました！" });
            }
        } catch (error) {
            setMessage({ type: "error", text: "テスト送信に失敗しました" });
        }
    };

    if (loading) {
        return (
            <LightBackground>
                <div className="min-h-screen flex items-center justify-center">
                    <div className="w-10 h-10 rounded-full border-4 border-violet-200 border-t-violet-500 animate-spin" />
                </div>
            </LightBackground>
        );
    }

    return (
        <LightBackground>
            <GlassNavbar>
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <Link
                            href="/my/notifications"
                            className="w-10 h-10 rounded-xl bg-white/50 backdrop-blur-sm border border-white/60 flex items-center justify-center text-gray-500 hover:bg-white/80 hover:text-gray-800 transition-all duration-300 shadow-sm"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </Link>
                        <div>
                            <h1 className="text-xl font-bold tracking-tight text-gray-800" style={headingStyle}>
                                通知設定
                            </h1>
                            <p className="text-xs text-gray-400">通知の種類と配信方法をカスタマイズ</p>
                        </div>
                    </div>
                    <GlassButton href="/my" variant="secondary" size="sm">
                        マイページ
                    </GlassButton>
                </div>
            </GlassNavbar>

            <div className="h-20" />

            <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 pb-32 space-y-6">
                <AnimatePresence>
                    {message && (
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                        >
                            <GlassCard
                                className={`p-4 ${
                                    message.type === "success"
                                        ? "border border-emerald-200/60 text-emerald-700"
                                        : "border border-red-200/60 text-red-700"
                                }`}
                            >
                                {message.text}
                            </GlassCard>
                        </motion.div>
                    )}
                </AnimatePresence>

                <FadeInView>
                    <GlassCard className="p-6">
                        <div className="flex items-start justify-between gap-4">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-400 to-indigo-500 flex items-center justify-center text-xl shadow-md">
                                    🔔
                                </div>
                                <div>
                                    <h2 className="font-bold text-gray-800">プッシュ通知</h2>
                                    <p className="text-sm text-gray-500">
                                        {pushPermission === "granted"
                                            ? "有効になっています"
                                            : pushPermission === "denied"
                                                ? "ブラウザで拒否されています"
                                                : "リアルタイムで通知を受け取る"}
                                    </p>
                                </div>
                            </div>

                            {pushSupported ? (
                                pushPermission === "granted" ? (
                                    <div className="flex items-center gap-3">
                                        <span className="text-emerald-600 text-sm font-medium">ON</span>
                                        <GlassButton onClick={testNotification} variant="ghost" size="sm">
                                            テスト送信
                                        </GlassButton>
                                    </div>
                                ) : pushPermission === "denied" ? (
                                    <span className="text-sm text-red-500">拒否済み</span>
                                ) : (
                                    <GlassButton onClick={requestPushPermission} variant="gradient" size="sm">
                                        有効にする
                                    </GlassButton>
                                )
                            ) : (
                                <span className="text-sm text-gray-400">非対応ブラウザ</span>
                            )}
                        </div>
                    </GlassCard>
                </FadeInView>

                <FadeInView delay={0.05}>
                    <GlassCard className="p-6">
                        <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-xl shadow-md">
                                    ✉️
                                </div>
                                <div>
                                    <h2 className="font-bold text-gray-800">メール通知</h2>
                                    <p className="text-sm text-gray-500">重要な通知をメールで受け取る</p>
                                </div>
                            </div>
                            <ToggleSwitch
                                enabled={preferences.email_enabled}
                                onChange={() => handleToggle("email_enabled")}
                            />
                        </div>
                    </GlassCard>
                </FadeInView>

                {NOTIFICATION_CATEGORIES.map((category, catIndex) => (
                    <FadeInView key={category.title} delay={0.1 + catIndex * 0.05}>
                        <GlassCard className="p-6">
                            <div className="flex items-center gap-3 mb-4">
                                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${category.gradient} flex items-center justify-center text-lg shadow-md`}>
                                    {category.icon}
                                </div>
                                <div>
                                    <h2 className="font-bold text-gray-800">{category.title}</h2>
                                    <p className="text-xs text-gray-500">{category.description}</p>
                                </div>
                            </div>

                            <div className="space-y-4">
                                {category.items.map((item) => (
                                    <div
                                        key={item.key}
                                        className="flex items-center justify-between gap-4 py-3 border-b border-gray-100/60 last:border-0"
                                    >
                                        <div>
                                            <div className="font-medium text-gray-700">{item.label}</div>
                                            <div className="text-sm text-gray-500">{item.description}</div>
                                        </div>
                                        <ToggleSwitch
                                            enabled={preferences[item.key] as boolean}
                                            onChange={() => handleToggle(item.key)}
                                        />
                                    </div>
                                ))}
                            </div>
                        </GlassCard>
                    </FadeInView>
                ))}

                <FadeInView delay={0.2}>
                    <GlassCard className="p-6">
                        <div className="flex items-center justify-between gap-4 mb-4">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-xl shadow-md">
                                    🌙
                                </div>
                                <div>
                                    <h2 className="font-bold text-gray-800">おやすみモード</h2>
                                    <p className="text-sm text-gray-500">指定時間は通知をミュート</p>
                                </div>
                            </div>
                            <ToggleSwitch
                                enabled={preferences.quiet_hours_enabled}
                                onChange={() => handleToggle("quiet_hours_enabled")}
                            />
                        </div>

                        <AnimatePresence>
                            {preferences.quiet_hours_enabled && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: "auto" }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="flex items-center gap-4 mt-4 p-4 bg-white/60 rounded-2xl border border-white/60"
                                >
                                    <div className="flex-1">
                                        <label className="block text-sm text-gray-500 mb-1">開始時刻</label>
                                        <input
                                            type="time"
                                            value={preferences.quiet_hours_start}
                                            onChange={(e) => handleTimeChange("quiet_hours_start", e.target.value)}
                                            className="w-full rounded-2xl bg-white/80 backdrop-blur-lg border border-slate-200/80 px-4 py-2 text-slate-800 focus:outline-none focus:border-violet-300"
                                        />
                                    </div>
                                    <div className="text-gray-400">→</div>
                                    <div className="flex-1">
                                        <label className="block text-sm text-gray-500 mb-1">終了時刻</label>
                                        <input
                                            type="time"
                                            value={preferences.quiet_hours_end}
                                            onChange={(e) => handleTimeChange("quiet_hours_end", e.target.value)}
                                            className="w-full rounded-2xl bg-white/80 backdrop-blur-lg border border-slate-200/80 px-4 py-2 text-slate-800 focus:outline-none focus:border-violet-300"
                                        />
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </GlassCard>
                </FadeInView>
            </main>

            <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-white via-white/90 to-transparent">
                <div className="max-w-3xl mx-auto">
                    <GlassButton
                        onClick={savePreferences}
                        disabled={saving}
                        loading={saving}
                        variant="gradient"
                        size="lg"
                        className="w-full justify-center"
                    >
                        設定を保存
                    </GlassButton>
                </div>
            </div>
        </LightBackground>
    );
}

function ToggleSwitch({ enabled, onChange }: { enabled: boolean; onChange: () => void }) {
    return (
        <button
            onClick={onChange}
            className={`relative w-14 h-8 rounded-full transition-colors border ${
                enabled
                    ? "bg-gradient-to-r from-violet-500 to-indigo-500 border-transparent"
                    : "bg-white/70 border-white/80"
            }`}
            aria-pressed={enabled}
        >
            <div
                className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow transition-transform ${
                    enabled ? "translate-x-7" : "translate-x-1"
                }`}
            />
        </button>
    );
}
