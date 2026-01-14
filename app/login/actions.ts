"use server";

import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

type AuthState = { ok: boolean; error: string | null; message?: string | null };

function cleanNext(next: string | null | undefined) {
    const n = (next ?? "").trim();
    if (!n) return "/drops";
    if (!n.startsWith("/")) return "/drops";
    return n;
}

export async function authAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
    const mode = String(formData.get("mode") ?? "signin");
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "").trim();
    const next = cleanNext(String(formData.get("next") ?? ""));

    if (!email || !password) return { ok: false, error: "email / password を入力して。" };

    const supabase = await supabaseServer();

    if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) return { ok: false, error: error.message };

        // email confirm がONだと session が無いことがある
        if (!data.session) {
            return { ok: true, error: null, message: "確認メールを送った。メールを確認してログインして。" };
        }

        redirect(next);
    }

    // signin
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, error: error.message };

    redirect(next);
}

export async function logoutAction(): Promise<void> {
    const supabase = await supabaseServer();
    await supabase.auth.signOut();
    redirect("/login");
}
