"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/requireUser";

type ActionState = {
    ok: boolean;
    error: string | null;
    message?: string | null;
    fieldErrors?: Record<string, string | undefined>;
};

function normTag(s: string) {
    return s.trim().replace(/\s+/g, " ").toLowerCase();
}

function parseTags(raw: string): string[] {
    const src = String(raw ?? "");
    const parts = src.split(/[,\n]/g).map(normTag).filter(Boolean);
    const out: string[] = [];
    for (const t of parts) {
        if (out.includes(t)) continue;
        out.push(t);
        if (out.length >= 20) break;
    }
    return out;
}

function isValidSlug(slug: string) {
    return /^[a-z0-9][a-z0-9-]{2,31}$/.test(slug);
}

// redirect() の制御例外を握りつぶさない
function isNextRedirect(e: any) {
    const d = String(e?.digest ?? "");
    return d.startsWith("NEXT_REDIRECT");
}

export async function createShopAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
    const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
    const name_ja = String(formData.get("name_ja") ?? "").trim();
    const name_en = String(formData.get("name_en") ?? "").trim();
    const headline = String(formData.get("headline") ?? "").trim();
    const bio = String(formData.get("bio") ?? "").trim();
    const avatar_url = String(formData.get("avatar_url") ?? "").trim();
    const style_tags = parseTags(String(formData.get("style_tags") ?? ""));

    const fieldErrors: Record<string, string | undefined> = {};

    if (!slug) fieldErrors.slug = "slug を入力して。";
    else if (!isValidSlug(slug)) fieldErrors.slug = "slug は a-z0-9 と - で 3〜32文字。";

    if (!name_ja && !name_en) fieldErrors.name_ja = "name_ja か name_en のどちらかは必須。";
    if (headline.length > 120) fieldErrors.headline = "headline は 120文字まで。";
    if (bio.length > 2000) fieldErrors.bio = "bio は 2000文字まで。";

    if (Object.values(fieldErrors).some(Boolean)) {
        return { ok: false, error: "入力内容を確認して。", fieldErrors };
    }

    try {
        const { supabase, user } = await requireUser("/login?next=/shops/new");

        // 1 user = 1 shop（既にあるならeditへ）
        const { data: existing, error: exErr } = await supabase
            .from("shops")
            .select("slug")
            .eq("owner_id", user.id)
            .maybeSingle();

        if (exErr) throw exErr;
        if (existing?.slug) redirect(`/shops/${existing.slug}/edit`);

        // ✅ NOT NULL の url を必ず入れる（内部URLでOK）
        const url = `/shops/${slug}`;

        const { error } = await supabase.from("shops").insert({
            slug,
            owner_id: user.id,
            url,
            name_ja: name_ja || null,
            name_en: name_en || null,
            headline: headline || null,
            bio: bio || null,
            avatar_url: avatar_url || null,
            style_tags,
            socials: {},
            is_active: true,
        } as any);

        if (error) {
            const msg = String(error.message ?? "").toLowerCase();
            if (msg.includes("duplicate") || msg.includes("unique")) {
                return {
                    ok: false,
                    error: "slug が既に使われています。別のslugにして。",
                    fieldErrors: { slug: "このslugは使用中。" },
                };
            }
            throw error;
        }

        redirect(`/shops/${slug}/edit`);
    } catch (e: any) {
        // ✅ redirectの例外は再throw（これ超重要）
        if (isNextRedirect(e)) throw e;

        return { ok: false, error: String(e?.message ?? "作成に失敗した。"), fieldErrors: {} };
    }

    // redirectで到達しないが、型のために置く
    return { ok: true, error: null };
}
