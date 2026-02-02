// app/login/LoginForm.tsx
"use client";

import * as React from "react";
import { authAction } from "./actions";

type AuthState = { ok: boolean; error: string | null; message?: string | null };

export default function LoginForm({ nextPath }: { nextPath: string }) {
    const initial: AuthState = { ok: true, error: null, message: null };
    const [state, formAction, isPending] = React.useActionState(authAction, initial);
    const [mode, setMode] = React.useState<"signin" | "signup">("signin");

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 via-white to-orange-50 p-6">
            <style jsx global>{`
                @keyframes slideIn {
                    from {
                        opacity: 0;
                        transform: translateY(30px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
            `}</style>

            <div
                className="w-full max-w-md"
                style={{
                    animation: "slideIn 0.6s ease-out forwards",
                }}
            >
                {/* Logo / Header */}
                <div className="text-center mb-8">
                    <h1
                        className="text-6xl font-black text-slate-900 mb-3"
                        style={{ fontFamily: "'Cormorant Garamond', serif" }}
                    >
                        Culcept
                    </h1>
                    <p className="text-sm font-bold text-slate-600 uppercase tracking-wide">
                        Refined Vintage Marketplace
                    </p>
                </div>

                {/* Form Card */}
                <div className="rounded-3xl border-2 border-slate-200 bg-white p-8 shadow-2xl">
                    <form action={formAction} className="grid gap-6">
                        <input type="hidden" name="next" value={nextPath} />
                        <input type="hidden" name="mode" value={mode} />

                        {/* Email */}
                        <div className="grid gap-2">
                            <label className="text-sm font-black text-slate-700 uppercase tracking-wide">
                                Email
                            </label>
                            <input
                                name="email"
                                type="email"
                                autoComplete="email"
                                required
                                className="w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-base font-semibold text-slate-900 transition-all duration-200 focus:border-purple-500 focus:outline-none focus:ring-4 focus:ring-purple-100"
                                placeholder="you@example.com"
                            />
                        </div>

                        {/* Password */}
                        <div className="grid gap-2">
                            <label className="text-sm font-black text-slate-700 uppercase tracking-wide">
                                Password
                            </label>
                            <input
                                name="password"
                                type="password"
                                autoComplete="current-password"
                                required
                                className="w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-base font-semibold text-slate-900 transition-all duration-200 focus:border-purple-500 focus:outline-none focus:ring-4 focus:ring-purple-100"
                                placeholder="••••••••"
                            />
                        </div>

                        {/* Error / Success Messages */}
                        {state.error && (
                            <div
                                className="rounded-xl border-2 border-red-200 bg-gradient-to-br from-red-50 to-white p-4"
                                style={{ animation: "slideIn 0.3s ease-out" }}
                            >
                                <p className="text-sm font-bold text-red-700 m-0">
                                    {state.error}
                                </p>
                            </div>
                        )}

                        {state.message && !state.error && (
                            <div
                                className="rounded-xl border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-4"
                                style={{ animation: "slideIn 0.3s ease-out" }}
                            >
                                <p className="text-sm font-bold text-emerald-700 m-0">
                                    {state.message}
                                </p>
                            </div>
                        )}

                        {/* Mode Toggle */}
                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={() => setMode("signin")}
                                className={`
                                    flex-1 rounded-xl px-6 py-3 text-sm font-black uppercase tracking-wide
                                    transition-all duration-200
                                    ${mode === "signin"
                                        ? "bg-gradient-to-br from-purple-500 to-purple-600 text-white shadow-lg scale-105"
                                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                                    }
                                `}
                            >
                                Sign In
                            </button>

                            <button
                                type="button"
                                onClick={() => setMode("signup")}
                                className={`
                                    flex-1 rounded-xl px-6 py-3 text-sm font-black uppercase tracking-wide
                                    transition-all duration-200
                                    ${mode === "signup"
                                        ? "bg-gradient-to-br from-orange-500 to-orange-600 text-white shadow-lg scale-105"
                                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                                    }
                                `}
                            >
                                Sign Up
                            </button>
                        </div>

                        {/* Submit Button */}
                        <button
                            type="submit"
                            disabled={isPending}
                            className={`
                                w-full rounded-xl px-6 py-4 text-base font-black uppercase tracking-wide text-white
                                shadow-xl transition-all duration-200
                                ${mode === "signin"
                                    ? "bg-gradient-to-br from-purple-500 via-purple-600 to-purple-700"
                                    : "bg-gradient-to-br from-orange-500 via-orange-600 to-orange-700"
                                }
                                ${isPending
                                    ? "opacity-50 cursor-not-allowed"
                                    : "hover:scale-105 hover:shadow-2xl"
                                }
                            `}
                        >
                            {isPending ? (
                                <span className="flex items-center justify-center gap-2">
                                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                    </svg>
                                    Processing...
                                </span>
                            ) : (
                                <span>
                                    {mode === "signin" ? "🔓 Sign In" : "✨ Sign Up"}
                                </span>
                            )}
                        </button>

                        {/* Note */}
                        <p className="text-xs font-semibold text-slate-500 text-center m-0 opacity-75">
                            ※ Supabase の設定で email confirmation がONだと、<br />
                            Sign up後にメール確認が必要。
                        </p>
                    </form>
                </div>

                {/* Back Link */}
                <div className="mt-6 text-center">
                    <a
                        href="/drops"
                        className="text-sm font-bold text-slate-600 hover:text-purple-600 transition-colors duration-200 no-underline"
                    >
                        ← Back to Products
                    </a>
                </div>
            </div>
        </div>
    );
}
