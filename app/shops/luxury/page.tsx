// app/shops/luxury/page.tsx
import LuxuryShopsPageClient from "./LuxuryShopsPageClient";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { syncLuxuryCards } from "@/lib/luxury/cardsSync";
import fs from "node:fs";
import path from "node:path";

export const runtime = "nodejs";

export const dynamic = "force-dynamic";

const BRAND_META = [
    { name: "Chanel", url: "https://www.chanel.com", tagline: "Timeless couture & Parisian elegance" },
    { name: "Dior", url: "https://www.dior.com", tagline: "Modern romance with heritage craft" },
    { name: "Louis Vuitton", url: "https://www.louisvuitton.com", tagline: "Iconic travel & monogram luxury" },
    { name: "Hermès", url: "https://www.hermes.com", tagline: "Artisan leather & refined minimalism" },
    { name: "Gucci", url: "https://www.gucci.com", tagline: "Bold statements with vintage soul" },
    { name: "Prada", url: "https://www.prada.com", tagline: "Architectural silhouettes & edge" },
    { name: "Saint Laurent", url: "https://www.saintlaurent.com", tagline: "Paris rock & sleek tailoring" },
    { name: "Balenciaga", url: "https://www.balenciaga.com", tagline: "Future-forward, oversized, iconic" },
];

function slugify(input: string) {
    return input
        .normalize("NFKD")
        .replace(/[^\w\s-]/g, "")
        .trim()
        .replace(/\s+/g, "_")
        .replace(/-+/g, "_")
        .replace(/_+/g, "_")
        .toLowerCase();
}

function extractFolderFromImageUrl(url: string | null | undefined) {
    const s = String(url ?? "");
    if (!s.startsWith("/cards/luxury/")) return null;
    const parts = s.split("/");
    if (parts.length < 4) return null;
    return decodeURIComponent(parts[3] ?? "");
}

function findBrandLogo(folderName: string | null) {
    if (!folderName) return null;
    const base = path.join(process.cwd(), "public", "cards", "luxury", folderName);
    const candidates = ["logo.svg", "logo.png", "logo.webp", "logo.jpg", "logo.jpeg"];
    for (const file of candidates) {
        const abs = path.join(base, file);
        if (fs.existsSync(abs)) {
            return `/cards/luxury/${encodeURIComponent(folderName)}/${file}`;
        }
    }
    return null;
}

export default async function LuxuryShopsPage() {
    await syncLuxuryCards();

    const brandLaneIds = BRAND_META.map((b) => slugify(b.name));

    const { data: lanes } = await supabaseAdmin
        .from("luxury_lanes")
        .select("lane_id,name_ja,name_en,description,color_primary,color_secondary,icon_emoji,shop_url,shop_slug")
        .in("lane_id", brandLaneIds);

    const laneMap = new Map<string, any>((lanes ?? []).map((l) => [String(l.lane_id), l]));

    const { data: cards } = await supabaseAdmin
        .from("luxury_cards")
        .select("lane_id,image_url,display_order,is_active")
        .in("lane_id", brandLaneIds)
        .eq("is_active", true)
        .order("display_order", { ascending: true })
        .limit(2000);

    const imagesByLane = new Map<string, string[]>();
    (cards ?? []).forEach((c: any) => {
        const laneId = String(c.lane_id ?? "");
        if (!laneId || !c.image_url) return;
        const arr = imagesByLane.get(laneId) ?? [];
        if (arr.length < 12) arr.push(String(c.image_url));
        imagesByLane.set(laneId, arr);
    });

    const brands = BRAND_META.map((meta) => {
        const laneId = slugify(meta.name);
        const lane = laneMap.get(laneId);
        const folderFromImage = extractFolderFromImageUrl(imagesByLane.get(laneId)?.[0]);
        const folderName = folderFromImage || meta.name;
        const logoUrl = findBrandLogo(folderName);

        return {
            lane_id: laneId,
            name: meta.name,
            tagline: meta.tagline,
            shop_url: lane?.shop_url || meta.url,
            shop_slug: lane?.shop_slug ?? null,
            color_primary: lane?.color_primary ?? null,
            color_secondary: lane?.color_secondary ?? null,
            icon_emoji: lane?.icon_emoji ?? "💎",
            logo_url: logoUrl,
            images: imagesByLane.get(laneId) ?? [],
        };
    });

    return <LuxuryShopsPageClient brands={brands} />;
}
