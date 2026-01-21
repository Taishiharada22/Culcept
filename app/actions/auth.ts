// app/actions/auth.ts
"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

const ONE_YEAR = 60 * 60 * 24 * 365;
const SUPPORTED = new Set(["en", "ja"]);

function normLocale(v: unknown) {
    const s = String(v ?? "");
    return SUPPORTED.has(s) ? (s as "en" | "ja") : "en";
}

/**
 * Next のバージョン/型定義によって cookies() が Readonly 扱いになり
 * TS的に .set が生えないことがある。
 * 実行時は set できる環境が多いので、型だけ握りつぶして安全に試す。
 */
async function safeSetLocaleCookie(locale: "en" | "ja") {
    try {
        // cookies() が sync/async どっちでも動くように await（非PromiseでもOK）
        const store = await (cookies() as any);

        // set が無い/readonly の環境もあるので optional chaining
        store?.set?.("app_locale", locale, {
            path: "/",
            maxAge: ONE_YEAR,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
        });
    } catch {
        // cookie set 失敗しても auth は成立するので落とさない
    }
}

export async function signupAction(formData: FormData) {
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    const locale = normLocale(formData.get("locale"));

    const supa = await supabaseServer();
    const { data, error } = await supa.auth.signUp({
        email,
        password,
        options: { data: { locale } },
    });
    if (error) return { ok: false, error: error.message };

    if (data.user) {
        await supa.from("profiles").upsert({ id: data.user.id, locale });
    }

    await safeSetLocaleCookie(locale);

    redirect("/");
}

export async function loginAction(formData: FormData) {
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");

    const supa = await supabaseServer();
    const { data, error } = await supa.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, error: error.message };

    const user = data.user;
    let locale = normLocale(user?.user_metadata?.locale);

    if (user && !user.user_metadata?.locale) {
        const { data: prof } = await supa.from("profiles").select("locale").eq("id", user.id).maybeSingle();
        locale = normLocale(prof?.locale);
        await supa.auth.updateUser({ data: { locale } });
    }

    await safeSetLocaleCookie(locale);

    redirect("/");
}

export async function signOutAction() {
    const supa = await supabaseServer();
    await supa.auth.signOut();
    redirect("/");
}
