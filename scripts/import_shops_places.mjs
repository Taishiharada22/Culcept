/* eslint-disable no-console */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const IMPORT_OWNER_ID = process.env.IMPORT_OWNER_ID; // owner_id必須なら必要

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}
if (!GOOGLE_MAPS_API_KEY) {
    throw new Error("Missing GOOGLE_MAPS_API_KEY");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
});

function arg(name, def = null) {
    const idx = process.argv.indexOf(`--${name}`);
    if (idx === -1) return def;
    const v = process.argv[idx + 1];
    return v ?? def;
}

function slugify(raw) {
    const base = String(raw ?? "")
        .toLowerCase()
        .trim()
        .replace(/['"]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60);
    const rand = Math.random().toString(36).slice(2, 8);
    return base || `shop-${rand}`;
}

async function placesTextSearchAll({ query, maxPages = 3, languageCode = "ja", regionCode = "JP" }) {
    let pageToken = null;
    const all = [];

    for (let i = 0; i < maxPages; i++) {
        const body = {
            textQuery: query,
            languageCode,
            regionCode,
            ...(pageToken ? { pageToken } : {}),
        };

        const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
                // 重要：FieldMask（必要なものだけ取る：課金も軽くなる）
                "X-Goog-FieldMask":
                    "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.location,nextPageToken",
            },
            body: JSON.stringify(body),
        });

        if (!res.ok) {
            const t = await res.text().catch(() => "");
            throw new Error(`Places API error: ${res.status} ${t}`);
        }

        const json = await res.json();
        const places = Array.isArray(json?.places) ? json.places : [];
        all.push(...places);

        pageToken = json?.nextPageToken || null;
        if (!pageToken) break;

        // nextPageToken は即時有効じゃない場合があるので少し待つ
        await new Promise((r) => setTimeout(r, 2000));
    }

    return all;
}

async function upsertShopsFromPlaces(places) {
    const rows = places
        .map((p) => {
            const id = p?.id || null;
            const name = p?.displayName?.text || null;
            if (!id || !name) return null;

            const website = p?.websiteUri || null;
            const address = p?.formattedAddress || null;
            const phone = p?.nationalPhoneNumber || null;
            const lat = p?.location?.latitude ?? null;
            const lng = p?.location?.longitude ?? null;

            const row = {
                google_place_id: id,
                slug: slugify(name),
                name_ja: name,
                name_en: null,
                headline: "Google Places 取り込み（要確認）",
                bio: null,
                url: website, // あなたの schema が url 列ならこれでOK
                style_tags: ["furugi", "import"],
                socials: {},
                is_active: false, // まずは非公開で投入 → 確認して公開
                address,
                phone,
                lat,
                lng,
            };

            if (IMPORT_OWNER_ID) row.owner_id = IMPORT_OWNER_ID;

            return row;
        })
        .filter(Boolean);

    if (!rows.length) return { inserted: 0 };

    const { data, error } = await supabase
        .from("shops")
        .upsert(rows, { onConflict: "google_place_id" })
        .select("id");

    if (error) throw error;
    return { inserted: data?.length ?? 0 };
}

async function main() {
    const query = arg("query");
    const maxPages = Number(arg("pages", "3"));
    if (!query) {
        console.log('Usage: node scripts/import_shops_places.mjs --query "古着屋 渋谷" --pages 3');
        process.exit(1);
    }

    const places = await placesTextSearchAll({ query, maxPages });
    console.log(`Fetched places: ${places.length}`);

    const { inserted } = await upsertShopsFromPlaces(places);
    console.log(`Upserted rows: ${inserted}`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
