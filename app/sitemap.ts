// app/sitemap.ts
import type { MetadataRoute } from "next";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const now = new Date();

    // 静的ページ
    const base: MetadataRoute.Sitemap = [
        { url: `${siteUrl}/`, lastModified: now },
        { url: `${siteUrl}/drops`, lastModified: now },
    ];

    // drops 動的
    const { data } = await supabaseAdmin
        .from("drops")
        .select("id,updated_at,created_at")
        .order("created_at", { ascending: false })
        .limit(5000);

    for (const r of data ?? []) {
        const id = String((r as any).id ?? "");
        if (!id) continue;
        const lm = (r as any).updated_at ?? (r as any).created_at ?? now.toISOString();
        base.push({
            url: `${siteUrl}/drops/${id}`,
            lastModified: new Date(lm),
        });
    }

    return base;
}
