// app/shops/page.tsx
import { supabaseServer } from "@/lib/supabase/server";
import ShopsPageClient from "./ShopsPageClient";

export const dynamic = "force-dynamic";

type ShopRow = {
    slug: string;
    name_ja: string | null;
    name_en: string | null;
    avatar_url: string | null;
    headline: string | null;
    style_tags: string[];
    cover_url: string | null;
    banner_url: string | null;
    is_active: boolean;
};

function normalizeTags(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    return Array.from(
        new Set(
            (raw as unknown[])
                .map((x) => String(x ?? "").trim().toLowerCase())
                .filter(Boolean)
                .slice(0, 20)
        )
    );
}

function toShopRow(r: any): ShopRow {
    return {
        slug: String(r.slug ?? "").trim(),
        name_ja: r.name_ja ?? null,
        name_en: r.name_en ?? null,
        avatar_url: r.avatar_url ?? null,
        headline: r.headline ?? null,
        style_tags: normalizeTags(r.style_tags),
        cover_url: r.cover_url ?? null,
        banner_url: r.banner_url ?? null,
        is_active: !!r.is_active,
    };
}

type SP = Record<string, string | string[] | undefined>;
function spStr(v: unknown) {
    return String(Array.isArray(v) ? v[0] : v ?? "").trim();
}

export default async function ShopsPage({ searchParams }: { searchParams: Promise<SP> }) {
    const sp = (await searchParams) ?? {};
    const q = spStr(sp.q);
    const tag = spStr(sp.tag);

    const supabase = await supabaseServer();

    let shopsQuery = supabase
        .from("shops")
        .select("slug,name_ja,name_en,avatar_url,headline,style_tags,cover_url,banner_url,is_active")
        .eq("is_active", true)
        .limit(60);

    if (q) {
        const safe = q.slice(0, 50).replace(/[(),]/g, " ").trim();
        const like = `%${safe.replace(/[%_]/g, "")}%`;
        if (safe) shopsQuery = shopsQuery.or(`name_ja.ilike.${like},name_en.ilike.${like},headline.ilike.${like}`);
    }

    if (tag) shopsQuery = shopsQuery.contains("style_tags", [tag]);

    const { data, error } = await shopsQuery;
    const shops = ((data ?? []) as any[]).map(toShopRow);

    // タグ候補
    const tagCounts = new Map<string, number>();
    for (const s of shops) {
        for (const t of s.style_tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
    }
    const topTags = [...tagCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([t]) => t);

    return (
        <ShopsPageClient
            shops={shops}
            topTags={topTags}
            q={q}
            tag={tag}
            error={error?.message || null}
        />
    );
}
