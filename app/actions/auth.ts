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

export async function signupAction(formData: FormData) {
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    const locale = normLocale(formData.get("locale"));

    const supa = await supabaseServer();
    const { data, error } = await supa.auth.signUp({
        email,
        password,
        options: { data: { locale } }
    });
    if (error) return { ok: false, error: error.message };

    if (data.user) {
        await supa.from("profiles").upsert({ id: data.user.id, locale });
    }

    const cookieStore = await cookies();
    cookieStore.set("app_locale", locale, { path: "/", maxAge: ONE_YEAR });

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

    const cookieStore = await cookies();
    cookieStore.set("app_locale", locale, { path: "/", maxAge: ONE_YEAR });

    redirect("/");
}
