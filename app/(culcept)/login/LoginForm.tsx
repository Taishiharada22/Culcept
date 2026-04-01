// app/login/LoginForm.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { authAction } from "./actions";
import { supabaseBrowser } from "@/lib/supabase/client";
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
    const [passwordError, setPasswordError] = React.useState<string | null>(null);
    const [resetEmail, setResetEmail] = React.useState("");
    const [resetSent, setResetSent] = React.useState(false);
    const [resetError, setResetError] = React.useState<string | null>(null);
    const [sendingReset, setSendingReset] = React.useState(false);
    const [cooldownSec, setCooldownSec] = React.useState(0);
    const headingStyle = { fontFamily: "'Cormorant Garamond', serif" };

    // ── パスワードリセット（60秒クールダウン付き） ──
    const COOLDOWN_SEC = 60;
    const cooldownRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

    const startCooldown = React.useCallback(() => {
        setCooldownSec(COOLDOWN_SEC);
        cooldownRef.current = setInterval(() => {
            setCooldownSec((prev) => {
                if (prev <= 1) {
                    if (cooldownRef.current) clearInterval(cooldownRef.current);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    }, []);

    React.useEffect(() => {
        return () => { if (cooldownRef.current) clearInterval(cooldownRef.current); };
    }, []);

    const handleForgotPassword = async () => {
        if (!resetEmail.trim()) {
            setResetError("メールアドレスを入力してください");
            return;
        }
        if (cooldownSec > 0) return;
        setSendingReset(true);
        setResetError(null);
        const supabase = supabaseBrowser();
        const { error } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), {
            redirectTo: `${window.location.origin}/auth/reset-password`,
        });
        setSendingReset(false);
        if (error) {
            setResetError(error.message);
        } else {
            setResetSent(true);
            startCooldown();
        }
    };

    const tabs = [
        { id: "signin", label: "ログイン", icon: <span>🔓</span> },
        { id: "signup", label: "新規登録", icon: <span>✨</span> },
    ];

    const features = [
        { icon: "🔭", title: "深層観測", desc: "判断パターンと内面傾向をAIが静かに観測" },
        { icon: "🌱", title: "自己発見", desc: "「そういう人間だったのか」という気づきを届ける" },
        { icon: "🤝", title: "深いつながり", desc: "自己理解が、理解し合える関係を生む" },
    ];

    return (
        <LightBackground>
            <div className="min-h-screen flex items-center justify-center px-4 py-12">
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                    className="w-full max-w-5xl grid lg:grid-cols-2 gap-8 items-stretch"
                >
                    {/* 左側: ブランド */}
                    <div className="hidden lg:flex">
                        <GlassCard className="p-10 flex flex-col justify-between">
                            <div>
                                <GlassBadge variant="gradient" className="mb-4">
                                    🔭 Personal AI OS
                                </GlassBadge>
                                <h1 className="text-4xl font-bold text-slate-900 mb-4" style={headingStyle}>
                                    Aneurasync
                                </h1>
                                <p className="text-slate-500 text-lg mb-8">
                                    あなたの判断パターン、揺れの法則、無自覚な傾向を深く観測。自分自身への理解が変わる体験を。
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
                                    Welcome to Aneurasync
                                </h2>
                            </Link>
                            <p className="text-slate-500 mt-2">
                                {mode === "signin" ? "ログインして続ける" : "無料でアカウント作成"}
                            </p>
                        </div>

                        <form
                            action={formAction}
                            onSubmit={(e) => {
                                if (mode === "signup") {
                                    const fd = new FormData(e.currentTarget);
                                    const pw = String(fd.get("password") ?? "");
                                    const confirm = String(fd.get("passwordConfirm") ?? "");
                                    if (pw.length < 6) {
                                        e.preventDefault();
                                        setPasswordError("パスワードは6文字以上で入力してください");
                                        return;
                                    }
                                    if (pw !== confirm) {
                                        e.preventDefault();
                                        setPasswordError("パスワードが一致しません");
                                        return;
                                    }
                                    setPasswordError(null);
                                }
                            }}
                            className="space-y-6"
                        >
                            <input type="hidden" name="next" value={nextPath} />
                            <input type="hidden" name="mode" value={mode} />

                            <GlassTabs
                                tabs={tabs}
                                activeTab={mode}
                                onChange={(id) => { setMode(id === "signup" ? "signup" : "signin"); setPasswordError(null); }}
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
                                        onChange={(v: string) => setResetEmail(v)}
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
                                        placeholder={mode === "signup" ? "6文字以上" : "••••••••"}
                                        onChange={() => setPasswordError(null)}
                                    />
                                    {passwordError && (
                                        <div className="mt-2 rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-600">
                                            {passwordError}
                                        </div>
                                    )}
                                </div>
                                {mode === "signup" && (
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-600 mb-2">
                                            パスワード確認
                                        </label>
                                        <GlassInput
                                            name="passwordConfirm"
                                            type="password"
                                            autoComplete="new-password"
                                            required
                                            placeholder="もう一度入力"
                                            onChange={() => setPasswordError(null)}
                                        />
                                    </div>
                                )}
                                {mode === "signin" && (
                                    <div>
                                        <div className="text-right">
                                            <button
                                                type="button"
                                                onClick={handleForgotPassword}
                                                disabled={sendingReset || cooldownSec > 0}
                                                className="text-xs text-violet-500 hover:text-violet-700 underline underline-offset-2 transition-colors disabled:opacity-50"
                                            >
                                                {sendingReset
                                                    ? "送信中..."
                                                    : cooldownSec > 0
                                                        ? `再送信まで ${cooldownSec}秒`
                                                        : "パスワードを忘れた"}
                                            </button>
                                        </div>
                                        {resetSent && (
                                            <div className="mt-2 rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-600">
                                                リセットメールを送信しました。メールのリンクから再設定してください。
                                            </div>
                                        )}
                                        {resetError && (
                                            <div className="mt-2 rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-600">
                                                {resetError}
                                            </div>
                                        )}
                                    </div>
                                )}
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
                            続行することで、Aneurasyncの利用規約とプライバシーに同意したことになります。
                        </div>
                    </GlassCard>
                </motion.div>
            </div>
        </LightBackground>
    );
}
