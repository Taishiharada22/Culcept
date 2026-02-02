// app/api/search/suggest/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "edge";

function getSupabaseAdmin() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Missing Supabase credentials");
    return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const query = searchParams.get("q")?.trim() || "";

        if (!query || query.length < 2) {
            return NextResponse.json({ suggestions: [] });
        }

        const supabase = getSupabaseAdmin();
        const suggestions: any[] = [];

        // 1. Products (exact title matches)
        const { data: products } = await supabase
            .from("drops")
            .select("id,title,brand,price")
            .or(`title.ilike.%${query}%,brand.ilike.%${query}%`)
            .limit(5);

        if (products) {
            products.forEach((p: any) => {
                if (p.title && p.title.toLowerCase().includes(query.toLowerCase())) {
                    suggestions.push({
                        type: "product",
                        text: p.title,
                        meta: p.brand || "Product",
                    });
                }
            });
        }

        // 2. Brands (aggregated)
        const { data: brands } = await supabase
            .from("drops")
            .select("brand")
            .not("brand", "is", null)
            .ilike("brand", `%${query}%`)
            .limit(50);

        if (brands) {
            const brandCounts = new Map<string, number>();
            brands.forEach((b: any) => {
                const brand = String(b.brand || "").trim();
                if (brand) brandCounts.set(brand, (brandCounts.get(brand) || 0) + 1);
            });

            Array.from(brandCounts.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .forEach(([brand, count]) => {
                    suggestions.push({
                        type: "brand",
                        text: brand,
                        meta: "Brand",
                        count,
                    });
                });
        }

        // 3. Tags
        const { data: tagged } = await supabase
            .from("drops")
            .select("tags")
            .not("tags", "is", null)
            .limit(100);

        if (tagged) {
            const tagCounts = new Map<string, number>();
            tagged.forEach((t: any) => {
                const tags = Array.isArray(t.tags) ? t.tags : [];
                tags.forEach((tag: string) => {
                    if (tag.toLowerCase().includes(query.toLowerCase())) {
                        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
                    }
                });
            });

            Array.from(tagCounts.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .forEach(([tag, count]) => {
                    suggestions.push({
                        type: "tag",
                        text: tag,
                        meta: "Tag",
                        count,
                    });
                });
        }

        // 4. Stores
        const { data: stores } = await supabase
            .from("shops")
            .select("slug,name_ja,name_en")
            .or(`name_ja.ilike.%${query}%,name_en.ilike.%${query}%,slug.ilike.%${query}%`)
            .limit(3);

        if (stores) {
            stores.forEach((s: any) => {
                const name = s.name_ja || s.name_en || s.slug;
                suggestions.push({
                    type: "store",
                    text: s.slug,
                    meta: name !== s.slug ? name : "Store",
                });
            });
        }

        // Limit and return
        return NextResponse.json({ suggestions: suggestions.slice(0, 10) });
    } catch (error: any) {
        console.error("Search suggest error:", error);
        return NextResponse.json({ suggestions: [], error: error.message }, { status: 500 });
    }
}
