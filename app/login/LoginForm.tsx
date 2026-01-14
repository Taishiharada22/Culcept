"use client";

import * as React from "react";
import { authAction } from "./actions";

type AuthState = { ok: boolean; error: string | null; message?: string | null };

export default function LoginForm({ nextPath }: { nextPath: string }) {
    const initial: AuthState = { ok: true, error: null, message: null };
    const [state, formAction, isPending] = React.useActionState(authAction, initial);

    return (
        <form action={formAction} style={{ display: "grid", gap: 12 }}>
            <input type="hidden" name="next" value={nextPath} />

            <div>
                <label style={{ display: "block", fontWeight: 700, marginBottom: 6 }}>Email</label>
                <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #d1d5db" }}
                />
            </div>

            <div>
                <label style={{ display: "block", fontWeight: 700, marginBottom: 6 }}>Password</label>
                <input
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #d1d5db" }}
                />
            </div>

            {state.error && (
                <p role="alert" style={{ color: "crimson", margin: 0 }}>
                    {state.error}
                </p>
            )}
            {state.message && !state.error && (
                <p style={{ margin: 0, opacity: 0.85 }}>{state.message}</p>
            )}

            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <button
                    type="submit"
                    name="mode"
                    value="signin"
                    disabled={isPending}
                    style={{
                        padding: "10px 14px",
                        borderRadius: 10,
                        border: "1px solid #111827",
                        background: "#111827",
                        color: "white",
                        cursor: isPending ? "not-allowed" : "pointer",
                        fontWeight: 800,
                    }}
                >
                    {isPending ? "..." : "Sign in"}
                </button>

                <button
                    type="submit"
                    name="mode"
                    value="signup"
                    disabled={isPending}
                    style={{
                        padding: "10px 14px",
                        borderRadius: 10,
                        border: "1px solid #d1d5db",
                        background: "transparent",
                        cursor: isPending ? "not-allowed" : "pointer",
                        fontWeight: 800,
                    }}
                >
                    {isPending ? "..." : "Sign up"}
                </button>
            </div>

            <p style={{ margin: 0, fontSize: 13, opacity: 0.7 }}>
                ※ Supabase の設定で email confirmation がONだと、Sign up後にメール確認が必要。
            </p>
        </form>
    );
}
