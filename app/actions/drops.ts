"use server";

import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { isAllowedExternal } from "@/lib/allowlist";
import { MIN_DROP_ITEMS, MAX_DROP_ITEMS } from "@/lib/constants";

export type DropActionState = {
    ok: boolean;
    error?: string | null;
};

function slugify(input: string) {
    return input
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60);
}

export async function submitDropAction(
    _prev: DropActionState,
    formData: FormData
): Promise<DropActionState> {
    try {
        const displayName = String(formData.get("display_name") ?? "").trim();
        const bioEn = String(formData.get("bio_en") ?? "").trim();
        const bioJa = String(formData.get("bio_ja") ?? "").trim();
        const rawUrls = String(formData.get("listing_urls") ?? "");
        const tagsRaw = String(formData.get("tags") ?? ""); // MVPでは未使用でOK

        if (!displayName) return { ok: false, error: "Display name is required." };

        const urls = rawUrls
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean);

        if (urls.length < MIN_DROP_ITEMS)
            return { ok: false, error: `Minimum ${MIN_DROP_ITEMS} listing URLs required.` };
        if (urls.length > MAX_DROP_ITEMS)
            return { ok: false, error: `Maximum ${MAX_DROP_ITEMS} listing URLs allowed.` };

        const listings: { external_url: string; platform: string }[] = [];
        for (const u of urls) {
            const res = isAllowedExternal(u);
            if (!res.ok) return { ok: false, error: `Blocked URL: ${u} (${res.reason})` };
            listings.push({ external_url: res.url.toString(), platform: res.platform });
        }

        const supa = await supabaseServer();
        const { data: userRes, error: userErr } = await supa.auth.getUser();
        const userId = userRes?.user?.id;
        if (userErr || !userId) return { ok: false, error: "Please login first." };

        const slugBase = slugify(displayName);
        const slug = `${slugBase}-${Math.random().toString(36).slice(2, 6)}`;

        const { data: drop, error: dropErr } = await supa
            .from("drops")
            .insert({
                owner_user_id: userId,
                slug,
                display_name: displayName,
                bio_en: bioEn,
                bio_ja: bioJa,
                status: "pending",
                active_items_count: listings.length
            })
            .select("id, slug")
            .single();

        if (dropErr) return { ok: false, error: `DB error (drops): ${dropErr.message}` };

        const { error: listErr } = await supa.from("drop_listings").insert(
            listings.map((l) => ({
                drop_id: drop.id,
                external_url: l.external_url,
                platform: l.platform,
                is_active: true
            }))
        );

        if (listErr) return { ok: false, error: `DB error (listings): ${listErr.message}` };

        // tagsRaw は後で drop_tags に入れる（MVPは後回し）
        redirect(`/drops/${drop.slug}`);
    } catch (e: any) {
        // redirect 例外だけは潰さない
        if (String(e?.digest ?? "").startsWith("NEXT_REDIRECT")) throw e;
        return { ok: false, error: String(e?.message ?? e) };
    }
}
