// app/login/LoginForm.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { authAction } from "./actions";
import {
    LightBackground,
    GlassCard,
    GlassButton,
    GlassBadge,
    GlassTabs,
    GlassInput,
} from "@/components/ui/glassmorphism-design";

type AuthState = { ok: boolean; error: string | null; message?: string | null };

export default function LoginForm({ nextPath }: { nextPath: string }) {
    const initial: AuthState = { ok: true, error: null, message: null };
    const [state, formAction, isPending] = React.useActionState(authAction, initial);
    const [mode, setMode] = React.useState<"signin" | "signup">("signin");
    const headingStyle = { fontFamily: "'Cormorant Garamond', serif" };

    const tabs = [
        { id: "signin", label: "ログイン", icon: <span>🔓</span> },
        { id: "signup", label: "新規登録", icon: <span>✨</span> },
    ];

    const features = [
        { icon: "✨", title: "AIスタイル提案", desc: "好みを学習して最適なスタイルを提案" },
        { icon: "🛍️", title: "セレクト体験", desc: "あなたに合うアイテムだけを届ける" },
        { icon: "🔮", title: "体験型ショッピング", desc: "AR/バーチャルで試着体験" },
    ];

    return (
        <LightBackground>
            <div className="min-h-screen flex items-center justify-center px-4 py-12">
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                    className="w-full max-w-5xl grid lg:grid-cols-2 gap-8 items-stretch"
                >
                    {/* 左側: ブランド */}
                    <div className="hidden lg:flex">
                        <GlassCard className="p-10 flex flex-col justify-between">
                            <div>
                                <GlassBadge variant="gradient" className="mb-4">
                                    ✨ AI-Powered Fashion
                                </GlassBadge>
                                <h1 className="text-4xl font-bold text-slate-900 mb-4" style={headingStyle}>
                                    Culcept
                                </h1>
                                <p className="text-slate-500 text-lg mb-8">
                                    古着との出会いを再定義。AIがあなたの好みを理解し、似合うスタイルを届けます。
                                </p>
                                <div className="space-y-4">
                                    {features.map((item) => (
                                        <div key={item.title} className="flex items-start gap-4">
                                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center text-lg text-white shadow-lg shadow-violet-500/30">
                                                {item.icon}
                                            </div>
                                            <div>
                                                <h3 className="font-semibold text-slate-900">{item.title}</h3>
                                                <p className="text-sm text-slate-500">{item.desc}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="text-xs text-slate-400 mt-10">
                                まだアカウントがない方は新規登録へ
                            </div>
                        </GlassCard>
                    </div>

                    {/* 右側: フォーム */}
                    <GlassCard className="p-8 sm:p-10">
                        <div className="text-center mb-8">
                            <Link href="/" className="inline-block">
                                <h2 className="text-3xl font-bold text-slate-900" style={headingStyle}>
                                    Welcome to Culcept
                                </h2>
                            </Link>
                            <p className="text-slate-500 mt-2">
                                {mode === "signin" ? "ログインして続ける" : "無料でアカウント作成"}
                            </p>
                        </div>

                        <form action={formAction} className="space-y-6">
                            <input type="hidden" name="next" value={nextPath} />
                            <input type="hidden" name="mode" value={mode} />

                            <GlassTabs
                                tabs={tabs}
                                activeTab={mode}
                                onChange={(id) => setMode(id === "signup" ? "signup" : "signin")}
                                className="w-full justify-center"
                            />

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-semibold text-slate-600 mb-2">
                                        メールアドレス
                                    </label>
                                    <GlassInput
                                        name="email"
                                        type="email"
                                        autoComplete="email"
                                        required
                                        placeholder="you@example.com"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-slate-600 mb-2">
                                        パスワード
                                    </label>
                                    <GlassInput
                                        name="password"
                                        type="password"
                                        autoComplete={mode === "signin" ? "current-password" : "new-password"}
                                        required
                                        placeholder="••••••••"
                                    />
                                </div>
                            </div>

                            {state.error && (
                                <div className="rounded-2xl bg-red-50 border border-red-200 p-4 text-sm text-red-600">
                                    {state.error}
                                </div>
                            )}

                            {state.message && !state.error && (
                                <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-600">
                                    {state.message}
                                </div>
                            )}

                            <GlassButton
                                type="submit"
                                disabled={isPending}
                                loading={isPending}
                                variant="gradient"
                                size="lg"
                                className="w-full justify-center"
                            >
                                {mode === "signin" ? "ログイン" : "アカウント作成"}
                            </GlassButton>
                        </form>

                        <div className="mt-6 text-center text-xs text-slate-400">
                            続行することで、Culceptの利用規約とプライバシーに同意したことになります。
                        </div>
                    </GlassCard>
                </motion.div>
            </div>
        </LightBackground>
    );
}
