// app/login/actions.ts
// ── 認証の唯一の Server Action 層 ──
// LoginForm (authAction) / SiteHeader+LogoutButton (signOutAction) が利用
"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { mergeAnonymousIntoExistingUser } from "@/lib/auth/mergeAnonymousData";
import { cleanNext } from "@/lib/auth/cleanNext";

type AuthState = { ok: boolean; error: string | null; message?: string | null };

const ONE_YEAR = 60 * 60 * 24 * 365;

// ── locale cookie 保存（失敗しても認証は成立させる） ──
async function saveLocaleCookie(locale: string = "ja") {
    try {
        const store = await (cookies() as any);
        store?.set?.("app_locale", locale, {
            path: "/",
            maxAge: ONE_YEAR,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
        });
    } catch { /* non-fatal */ }
}

// ── 登録済みフラグ cookie（登録済みユーザーをログイン画面に誘導するため） ──
async function saveRegisteredCookie() {
    try {
        const store = await (cookies() as any);
        store?.set?.("aneurasync_registered", "1", {
            path: "/",
            maxAge: ONE_YEAR * 5, // 5年間保持
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
        });
    } catch { /* non-fatal */ }
}

// ── ログイン / 新規登録（LoginForm が利用） ──
export async function authAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
    const mode = String(formData.get("mode") ?? "signin");
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "").trim();
    const next = cleanNext(String(formData.get("next") ?? ""));

    if (!email || !password) {
        return { ok: false, error: "メールアドレスとパスワードを入力してください" };
    }

    const supabase = await supabaseServer();

    // ━━ signup ━━
    if (mode === "signup") {
        // 匿名ユーザーの昇格チェック（Stargazer 後ログイン型フロー対応）
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        if (currentUser?.is_anonymous) {
            // Case 1: 匿名→新規アカウントで signUp（updateUser だと "email change" メールになるため使用禁止）
            // 匿名データのマージは signin 時の Case 2 ロジック（mergeAnonymousIntoExistingUser）が担う。
            // signUp 後にメール確認リンクを踏むと auth/callback → next= にリダイレクトされる。
            const { data, error: signUpErr } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: { locale: "ja", anonymous_id: currentUser.id },
                    emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/auth/callback?next=${encodeURIComponent(next)}`,
                },
            });
            if (signUpErr) return { ok: false, error: signUpErr.message };

            // email confirm ON → session なし → 確認メール案内
            if (!data.session) {
                return {
                    ok: true,
                    error: null,
                    message: "確認メールを送信しました。メールのリンクをクリックするとアカウントが有効になります。",
                };
            }

            // email confirm ON → 確認メール案内（registered cookie はメール確認後のcallbackで）
            // email confirm OFF（開発環境など）→ 即時セッション確立
            if (data.user) {
                await supabase.from("profiles").upsert({ id: data.user.id, locale: "ja" });
            }
            await saveLocaleCookie("ja");
            await saveRegisteredCookie();
            redirect(next);
        }

        // 通常の新規登録
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: { data: { locale: "ja" } },
        });
        if (error) return { ok: false, error: error.message };

        // email confirm ON → session なし → 確認メール案内（registered cookie はcallbackで設定）
        if (!data.session) {
            return {
                ok: true,
                error: null,
                message: "確認メールを送信しました。メールのリンクからログインしてください。",
            };
        }

        if (data.user) {
            await supabase.from("profiles").upsert({ id: data.user.id, locale: "ja" });
        }
        await saveLocaleCookie("ja");
        await saveRegisteredCookie();
        redirect(next);
    }

    // ━━ signin ━━
    // ログイン前に匿名ユーザーIDを記録（ログイン後にセッションが変わるため）
    const { data: { user: preLoginUser } } = await supabase.auth.getUser();
    const preLoginAnonId = preLoginUser?.is_anonymous ? preLoginUser.id : null;

    const { data: signInData, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, error: error.message };

    const user = signInData.user;

    // locale: metadata → profile → default "ja"
    if (user) {
        let locale = user.user_metadata?.locale ?? "ja";
        if (!user.user_metadata?.locale) {
            const { data: prof } = await supabase
                .from("profiles")
                .select("locale")
                .eq("id", user.id)
                .maybeSingle();
            if (prof?.locale) locale = prof.locale;
            await supabase.auth.updateUser({ data: { locale } });
        }
        await saveLocaleCookie(locale);
    }

    // 匿名データを既存アカウントに merge（Case 2）
    if (user && preLoginAnonId && preLoginAnonId !== user.id) {
        try {
            await mergeAnonymousIntoExistingUser(user.id, preLoginAnonId);
        } catch (mergeErr) {
            console.error("[authAction] merge failed:", mergeErr);
        }
    }

    redirect(next);
}

// ── サインアウト（SiteHeader / LogoutButton が利用） ──
export async function signOutAction() {
    const supabase = await supabaseServer();
    await supabase.auth.signOut();
    redirect("/");
}

// 後方互換エイリアス
export { signOutAction as logoutAction };
