// app/shops/[slug]/edit/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/requireUser";

type ActionState = {
    ok: boolean;
    error: string | null;
    message?: string | null;
    fieldErrors?: Record<string, string | undefined>;
};

function isNextRedirect(e: any) {
    const d = String(e?.digest ?? "");
    return d.startsWith("NEXT_REDIRECT");
}

function normalizeUrl(raw: string) {
    const x = String(raw ?? "").trim();
    if (!x) return "";
    try {
        const u = new URL(x);
        if (u.protocol === "http:" || u.protocol === "https:") return x;
        return "";
    } catch {
        try {
            const u = new URL("https://" + x);
            if (u.protocol === "http:" || u.protocol === "https:") return "https://" + x;
            return "";
        } catch {
            return "";
        }
    }
}

function normalizeTags(arr: unknown): string[] {
    const a = Array.isArray(arr) ? arr : [];
    const out: string[] = [];
    for (const x of a) {
        const t = String(x ?? "").trim().replace(/\s+/g, " ").toLowerCase();
        if (!t) continue;
        if (out.includes(t)) continue;
        out.push(t);
        if (out.length >= 20) break;
    }
    return out;
}

export async function updateShopAction(slug: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
    const name_ja = String(formData.get("name_ja") ?? "").trim();
    const name_en = String(formData.get("name_en") ?? "").trim();
    const headline = String(formData.get("headline") ?? "").trim();
    const bio = String(formData.get("bio") ?? "").trim();
    const avatar_url = String(formData.get("avatar_url") ?? "").trim();
    const is_active = String(formData.get("is_active") ?? "") === "on";

    const instagram = String(formData.get("instagram") ?? "").trim();
    const x = String(formData.get("x") ?? "").trim();
    const youtube = String(formData.get("youtube") ?? "").trim();
    const website = String(formData.get("website") ?? "").trim();

    // url は NOT NULL のため、編集では固定（create時に埋める）
    const url = String(formData.get("url") ?? "").trim() || `/shops/${slug}`;

    const style_tags_raw = String(formData.get("style_tags") ?? "[]");
    let style_tags: string[] = [];
    try {
        style_tags = normalizeTags(JSON.parse(style_tags_raw));
    } catch {
        style_tags = [];
    }

    const fieldErrors: Record<string, string | undefined> = {};
    if (!name_ja && !name_en) fieldErrors.name_ja = "name_ja か name_en のどちらかは必須。";
    if (headline.length > 120) fieldErrors.headline = "headline は120文字まで。";
    if (bio.length > 2000) fieldErrors.bio = "bio は2000文字まで。";

    const socials: any = {};
    if (instagram) {
        const v = normalizeUrl(instagram);
        if (!v) fieldErrors.instagram = "URLが不正。";
        else socials.instagram = v;
    }
    if (x) {
        const v = normalizeUrl(x);
        if (!v) fieldErrors.x = "URLが不正。";
        else socials.x = v;
    }
    if (youtube) {
        const v = normalizeUrl(youtube);
        if (!v) fieldErrors.youtube = "URLが不正。";
        else socials.youtube = v;
    }
    if (website) {
        const v = normalizeUrl(website);
        if (!v) fieldErrors.website = "URLが不正。";
        else socials.website = v;
    }

    if (Object.values(fieldErrors).some(Boolean)) {
        return { ok: false, error: "入力内容を確認して。", fieldErrors };
    }

    try {
        const { supabase, user } = await requireUser(`/login?next=/shops/${slug}/edit`);

        const patch: any = {
            url, // NOT NULL
            name_ja: name_ja || null,
            name_en: name_en || null,
            headline: headline || null,
            bio: bio || null,
            avatar_url: avatar_url || null,
            style_tags,
            socials,
            is_active,
        };

        const { error } = await supabase.from("shops").update(patch).eq("slug", slug).eq("owner_id", user.id);
        if (error) throw error;

        revalidatePath(`/shops/${slug}`);
        revalidatePath(`/shops/${slug}/edit`);
        revalidatePath("/drops");

        return { ok: true, error: null, message: "Saved." };
    } catch (e: any) {
        if (isNextRedirect(e)) throw e;
        return { ok: false, error: String(e?.message ?? "更新に失敗した。"), fieldErrors: {} };
    }
}
