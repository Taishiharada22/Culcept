// scripts/auto-tag-cards.ts
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

/**
 * 完全自動タグ付け + DB反映（統合版）
 *
 * ✅ できること
 * - 指定ディレクトリ（デフォルト public/cards）配下の画像を走査
 * - ファイル名からタグ抽出（TAG_DICT）
 * - DB curated_cards に反映（update / upsert）
 * - --rename があればファイルを安全にリネーム（衝突回避）
 * - 既存DBに「元の image_url」がある場合、card_id を維持したまま update（←重要）
 *
 * ✅ 安全対策
 * - CULCEPT_AUTO_TAG=1 を設定しないと実行拒否
 * - NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が無いと実行拒否
 *
 * 実行例:
 *   set -a; source .env.local; set +a
 *   CULCEPT_AUTO_TAG=1 npx tsx scripts/auto-tag-cards.ts
 *   CULCEPT_AUTO_TAG=1 npx tsx scripts/auto-tag-cards.ts public/cards --rename
 */

// ---------- env ----------
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("❌ Missing env vars: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
    console.error("   (Tip) set -a; source .env.local; set +a してから実行して");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
});

// ---------- Tag Dictionary ----------
const TAG_DICT: Record<string, string[]> = {
    // outer
    jacket: ["jacket", "outerwear"],
    coat: ["coat", "outerwear"],
    blazer: ["blazer", "formal", "outerwear"],
    parka: ["parka", "casual", "outerwear"],
    hoodie: ["hoodie", "casual", "streetwear"],
    cardigan: ["cardigan", "casual"],
    bomber: ["bomber", "jacket", "streetwear"],
    windbreaker: ["windbreaker", "sports", "outerwear"],

    // tops
    shirt: ["shirt", "tops"],
    tshirt: ["tshirt", "casual", "tops"],
    sweater: ["sweater", "tops"],
    sweatshirt: ["sweatshirt", "casual", "tops"],
    polo: ["polo", "casual", "tops"],
    tank: ["tank", "casual", "tops"],

    // bottoms
    pants: ["pants", "bottoms"],
    jeans: ["jeans", "denim", "bottoms"],
    denim: ["denim", "bottoms"],
    chinos: ["chinos", "casual", "bottoms"],
    shorts: ["shorts", "casual", "bottoms"],
    trousers: ["trousers", "formal", "bottoms"],

    // style
    vintage: ["vintage", "retro"],
    military: ["military", "workwear"],
    workwear: ["workwear", "utility"],
    streetwear: ["streetwear", "casual"],
    casual: ["casual"],
    formal: ["formal"],
    oversized: ["oversized", "relaxed"],
    minimalist: ["minimalist", "simple"],

    // material
    leather: ["leather"],
    wool: ["wool"],
    cotton: ["cotton"],
    nylon: ["nylon", "synthetic"],
    canvas: ["canvas"],
    corduroy: ["corduroy"],
    fleece: ["fleece"],

    // color
    black: ["black"],
    blue: ["blue"],
    navy: ["navy", "blue"],
    olive: ["olive", "green"],
    beige: ["beige", "neutral"],
    grey: ["grey", "neutral"],
    gray: ["grey", "neutral"],
    white: ["white", "neutral"],
    brown: ["brown"],
    green: ["green"],
    red: ["red"],

    // detail
    field: ["field", "utility"],
    zip: ["zip"],
    button: ["button"],
    pocket: ["pocket", "utility"],
    hood: ["hood"],
    collar: ["collar"],
};

function tokenizeFilename(filename: string): string[] {
    const base = path.basename(filename, path.extname(filename));
    return base
        .toLowerCase()
        .replace(/[^\w\s-]/g, " ")
        .split(/[_\s-]+/)
        .filter(Boolean);
}

function extractTagsFromFilename(filename: string): string[] {
    const words = tokenizeFilename(filename);

    const tags = new Set<string>();
    for (const w of words) {
        const mapped = TAG_DICT[w];
        if (!mapped) continue;
        for (const t of mapped) tags.add(t);
    }

    return Array.from(tags).slice(0, 10);
}

function smartRename(filename: string): string {
    const ext = path.extname(filename);
    const base = path.basename(filename, ext);

    const words = tokenizeFilename(filename);

    const picked: string[] = [];
    for (const w of words) {
        const mapped = TAG_DICT[w];
        if (mapped?.[0]) picked.push(mapped[0]);
    }

    // 連続重複を軽く除去（例: denim_denim など）
    const deduped: string[] = [];
    for (const p of picked) {
        if (deduped[deduped.length - 1] !== p) deduped.push(p);
    }

    const name =
        deduped.length > 0
            ? deduped.join("_")
            : base
                .toLowerCase()
                .replace(/[^\w\s-]/g, "")
                .replace(/\s+/g, "_")
                .replace(/[-_]+/g, "_")
                .replace(/^_+|_+$/g, "");

    return name || "card";
}

function getUniqueFilename(dir: string, baseName: string, ext: string): string {
    let candidate = `${baseName}${ext}`;
    let counter = 2;
    while (fs.existsSync(path.join(dir, candidate))) {
        candidate = `${baseName}_${counter}${ext}`;
        counter++;
    }
    return candidate;
}

function asCardsUrl(filename: string): string {
    return `/cards/${filename}`;
}

/**
 * DB上の image_url は相対/絶対が混在しがちなので、
 * - 完全一致
 * - 末尾一致（%/cards/filename）
 * - 末尾ファイル名一致（%/filename）
 * を順に試す
 */
async function findExistingCardIdByImageUrl(imageUrl: string): Promise<string | null> {
    // 1) exact
    {
        const { data, error } = await supabase
            .from("curated_cards")
            .select("card_id")
            .eq("image_url", imageUrl)
            .limit(1);

        if (error) {
            console.error(`❌ DB lookup error (image_url=${imageUrl}): ${error.message}`);
            return null;
        }
        if (data?.[0]?.card_id) return data[0].card_id;
    }

    const filename = imageUrl.split("/").pop();
    if (!filename) return null;

    // 2) endswith /cards/filename (absolute URL対応)
    for (const pattern of [`%/cards/${filename}`, `%cards/${filename}`]) {
        const { data, error } = await supabase
            .from("curated_cards")
            .select("card_id")
            .ilike("image_url", pattern)
            .limit(1);

        if (error) {
            console.error(`❌ DB lookup error (pattern=${pattern}): ${error.message}`);
            return null;
        }
        if (data?.[0]?.card_id) return data[0].card_id;
    }

    // 3) last-resort: endswith filename
    {
        const { data, error } = await supabase
            .from("curated_cards")
            .select("card_id")
            .ilike("image_url", `%/${filename}`)
            .limit(1);

        if (error) {
            console.error(`❌ DB lookup error (filename=${filename}): ${error.message}`);
            return null;
        }
        if (data?.[0]?.card_id) return data[0].card_id;
    }

    return null;
}

function parseArgs() {
    const args = process.argv.slice(2);
    const shouldRename = args.includes("--rename");
    const dryRun = args.includes("--dry-run");
    const cardsDir = args.find((a) => !a.startsWith("-")) || "public/cards";
    return { cardsDir, shouldRename, dryRun };
}

function isImageFile(name: string) {
    return /\.(png|jpe?g|webp|gif)$/i.test(name);
}

async function main() {
    if (process.env.CULCEPT_AUTO_TAG !== "1") {
        console.error("⚠️ Refusing to run. Set env CULCEPT_AUTO_TAG=1");
        process.exit(1);
    }

    const { cardsDir, shouldRename, dryRun } = parseArgs();

    if (!fs.existsSync(cardsDir)) {
        console.error(`❌ Directory not found: ${cardsDir}`);
        process.exit(1);
    }

    const files = fs.readdirSync(cardsDir);
    const imageFiles = files
        .filter((f) => !f.startsWith("."))
        .filter((f) => isImageFile(f))
        .filter((f) => {
            // 念のためファイルのみ
            const p = path.join(cardsDir, f);
            try {
                return fs.statSync(p).isFile();
            } catch {
                return false;
            }
        })
        .sort((a, b) => a.localeCompare(b));

    console.log(`📂 Processing directory: ${cardsDir}`);
    console.log(`🖼️  Found ${imageFiles.length} images`);
    console.log(`🏷️  Auto-tagging: ON`);
    console.log(`📝 Rename: ${shouldRename ? "ON" : "OFF"}`);
    console.log(`🧪 Dry-run: ${dryRun ? "ON" : "OFF"}`);

    let processed = 0;
    let errors = 0;
    let dbOk = 0;
    let dbErr = 0;
    let renamed = 0;

    for (const originalName of imageFiles) {
        try {
            const ext = path.extname(originalName);
            let currentName = originalName;
            let currentPath = path.join(cardsDir, currentName);

            // ✅ リネーム前 URL で既存 card_id を拾う（card_id維持用）
            const originalUrl = asCardsUrl(originalName);
            const existingCardId = await findExistingCardIdByImageUrl(originalUrl);

            // rename
            if (shouldRename) {
                const newBase = smartRename(originalName);
                const newName = getUniqueFilename(cardsDir, newBase, ext);
                const newPath = path.join(cardsDir, newName);

                if (currentName !== newName) {
                    if (!dryRun) fs.renameSync(currentPath, newPath);
                    console.log(`✅ Renamed: ${currentName} → ${newName}${dryRun ? " (dry-run)" : ""}`);
                    currentName = newName;
                    currentPath = newPath;
                    renamed++;
                }
            }

            // tags
            const tagsPayload = extractTagsFromFilename(currentName);

            // final id/url
            const finalUrl = asCardsUrl(currentName);
            const derivedCardId = path.basename(currentName, ext);

            if (dryRun) {
                processed++;
                console.log(
                    `🧪 Would write DB: ${currentName} card_id=${existingCardId ?? derivedCardId} image_url=${finalUrl} tags=[${tagsPayload.join(
                        ", "
                    )}]`
                );
                continue;
            }

            // ✅ 既存があれば card_id を維持したまま update
            if (existingCardId) {
                const { data: updated, error: updErr } = await supabase
                    .from("curated_cards")
                    .update({ image_url: finalUrl, tags: tagsPayload, is_active: true })
                    .eq("card_id", existingCardId)
                    .select("card_id");

                if (updErr) {
                    dbErr++;
                    errors++;
                    console.error(`❌ DB update error for ${currentName} (card_id=${existingCardId}): ${updErr.message}`);
                    continue;
                }

                // updateが0件ならフォールバック upsert（card_id維持）
                if (!updated || updated.length === 0) {
                    const { error: upErr } = await supabase
                        .from("curated_cards")
                        .upsert({ card_id: existingCardId, image_url: finalUrl, tags: tagsPayload, is_active: true }, { onConflict: "card_id" });

                    if (upErr) {
                        dbErr++;
                        errors++;
                        console.error(`❌ Fallback upsert error for ${currentName} (card_id=${existingCardId}): ${upErr.message}`);
                        continue;
                    }
                }

                dbOk++;
                processed++;
                console.log(`✅ Updated: ${currentName} -> (card_id=${existingCardId}) tags=[${tagsPayload.join(", ")}]`);
                continue;
            }

            // ✅ 既存が無いなら、ファイル名由来の card_id で upsert
            const { error: upErr } = await supabase
                .from("curated_cards")
                .upsert({ card_id: derivedCardId, image_url: finalUrl, tags: tagsPayload, is_active: true }, { onConflict: "card_id" });

            if (upErr) {
                dbErr++;
                errors++;
                console.error(`❌ DB upsert error for ${currentName} (card_id=${derivedCardId}): ${upErr.message}`);
                continue;
            }

            dbOk++;
            processed++;
            console.log(`✅ Upserted: ${currentName} (card_id=${derivedCardId}) tags=[${tagsPayload.join(", ")}]`);
        } catch (e: any) {
            errors++;
            console.error(`❌ Error processing ${originalName}: ${e?.message ?? String(e)}`);
        }
    }

    console.log("\n📊 Summary:");
    console.log(`   Processed: ${processed}`);
    console.log(`   Renamed:   ${renamed}`);
    console.log(`   Errors:    ${errors}`);
    console.log(`   DB OK:     ${dbOk}`);
    console.log(`   DB ERR:    ${dbErr}`);
    console.log(`   Total:     ${imageFiles.length}`);

    if (!process.env.CULCEPT_AUTO_TAG) process.exit(1);
    if (!process.env.CULCEPT_AUTO_TAG || process.env.CULCEPT_AUTO_TAG !== "1") process.exit(1);
    if (errors > 0 || dbErr > 0) process.exit(1);
}

main().catch((e) => {
    console.error("❌ Fatal:", e?.message ?? e);
    process.exit(1);
});
