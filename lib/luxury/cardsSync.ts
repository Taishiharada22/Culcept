"server-only";

import fs from "node:fs/promises";
import path from "node:path";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

const DEFAULT_LUXURY_DIR = (() => {
    const home = process.env.HOME || "";
    if (!home) return "";
    return path.join(home, "Downloads", "culcept_cards", "luxury");
})();

const LANE_COLORS = [
    ["#C9B037", "#8B7355"],
    ["#8B00FF", "#4B0082"],
    ["#1A1A1A", "#4A4A4A"],
    ["#FFB6C1", "#DDA0DD"],
    ["#FF4500", "#DC143C"],
    ["#8B4513", "#CD853F"],
    ["#2E8B57", "#228B22"],
    ["#9932CC", "#BA55D3"],
    ["#228B22", "#3CB371"],
    ["#4169E1", "#1E90FF"],
];

const LANE_ICONS = ["💎", "✨", "🖤", "🌸", "🔥", "👑", "🏆", "🎨", "🌿", "🏙️"];

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

function titleize(input: string) {
    return input
        .replace(/[_-]+/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .trim();
}

async function listDirSafe(dir: string) {
    try {
        return await fs.readdir(dir, { withFileTypes: true });
    } catch {
        return [];
    }
}

export function getLuxuryCardsDir() {
    return process.env.LUXURY_CARDS_DIR || DEFAULT_LUXURY_DIR;
}

export async function scanLuxuryCards(rootDir: string) {
    const laneDirs = (await listDirSafe(rootDir)).filter((d) => d.isDirectory());
    const lanes: Array<{
        lane_id: string;
        name_ja: string;
        name_en: string;
        description: string;
        color_primary: string;
        color_secondary: string;
        icon_emoji: string;
        keywords: string[];
        display_order: number;
    }> = [];
    const cards: Array<{
        card_id: string;
        lane_id: string;
        image_url: string;
        tags: string[];
        display_order: number;
        is_active: boolean;
    }> = [];

    for (let i = 0; i < laneDirs.length; i++) {
        const laneDir = laneDirs[i];
        const laneName = laneDir.name;
        const laneId = slugify(laneName) || `lane_${i + 1}`;

        const [primary, secondary] = LANE_COLORS[i % LANE_COLORS.length];
        lanes.push({
            lane_id: laneId,
            name_ja: laneName,
            name_en: titleize(laneName),
            description: `${titleize(laneName)} collection`,
            color_primary: primary,
            color_secondary: secondary,
            icon_emoji: LANE_ICONS[i % LANE_ICONS.length],
            keywords: laneId.split("_").filter(Boolean),
            display_order: i + 1,
        });

        const lanePath = path.join(rootDir, laneName);
        const files = (await listDirSafe(lanePath))
            .filter((f) => f.isFile())
            .filter((f) => IMAGE_EXTS.has(path.extname(f.name).toLowerCase()))
            .map((f) => f.name)
            .sort((a, b) => a.localeCompare(b));

        files.forEach((fileName, idx) => {
            const base = path.parse(fileName).name;
            const cardId = `${laneId}__${slugify(base) || base}`.slice(0, 180);
            const imageUrl = `/cards/luxury/${encodeURIComponent(laneName)}/${encodeURIComponent(fileName)}`;
            cards.push({
                card_id: cardId,
                lane_id: laneId,
                image_url: imageUrl,
                tags: laneId.split("_").filter(Boolean),
                display_order: idx + 1,
                is_active: true,
            });
        });
    }

    return { lanes, cards, fileCount: cards.length };
}

export async function syncLuxuryCards(options?: { force?: boolean; rootDir?: string }) {
    const rootDir = options?.rootDir ?? getLuxuryCardsDir();
    if (!rootDir) return { synced: false, fileCount: 0, cardCount: 0 };

    const { lanes, cards, fileCount } = await scanLuxuryCards(rootDir);
    if (!cards.length) return { synced: false, fileCount, cardCount: 0 };

    let shouldSync = !!options?.force;

    if (!shouldSync) {
        const { count, error } = await supabaseAdmin
            .from("luxury_cards")
            .select("id", { count: "exact", head: true });

        if (error) {
            shouldSync = true;
        } else if (typeof count === "number" && count < fileCount) {
            shouldSync = true;
        }
    }

    if (!shouldSync) {
        return { synced: false, fileCount, cardCount: cards.length };
    }

    const laneIds = lanes.map((l) => l.lane_id);
    const { data: existing } = await supabaseAdmin
        .from("luxury_lanes")
        .select("lane_id")
        .in("lane_id", laneIds);
    const existingSet = new Set((existing ?? []).map((l) => l.lane_id));
    const newLanes = lanes.filter((l) => !existingSet.has(l.lane_id));

    if (newLanes.length) {
        await supabaseAdmin.from("luxury_lanes").insert(newLanes as any);
    }

    const chunkSize = 500;
    for (let i = 0; i < cards.length; i += chunkSize) {
        const chunk = cards.slice(i, i + chunkSize);
        await supabaseAdmin
            .from("luxury_cards")
            .upsert(chunk as any, { onConflict: "card_id" });
    }

    return { synced: true, fileCount, cardCount: cards.length };
}
