// scripts/rename-cards.ts
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

// ✅ Next.js 以外（tsx/node）では .env.local が自動ロードされないので明示的に読む
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config(); // ついでに .env も読む（あれば）

function mustEnv(name: string, v: string | undefined) {
    const val = (v ?? "").trim();
    if (!val) {
        throw new Error(`❌ Missing env: ${name}`);
    }
    return val;
}

// ✅ URLは NEXT_PUBLIC / SUPABASE_URL の両対応
const supabaseUrl =
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "").trim();

// ✅ Service Role Key は絶対に NEXT_PUBLIC にしない（クライアントに漏れる）
const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

const supabase = createClient(
    mustEnv("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_URL", supabaseUrl),
    mustEnv("SUPABASE_SERVICE_ROLE_KEY", serviceRoleKey),
    {
        auth: { persistSession: false },
    }
);

/**
 * ファイル名を安全な形式にslugify
 * ChatGPT Image 2026年... → chatgpt_image_2026
 */
function slugify(filename: string): string {
    const ext = path.extname(filename);
    const base = path.basename(filename, ext);

    return (
        base
            .toLowerCase()
            .replace(/[^\w\s-]/g, "")
            .replace(/\s+/g, "_")
            .replace(/[-_]+/g, "_")
            .replace(/^_+|_+$/g, "") || "card"
    );
}

/**
 * スマートリネーム: ファイル名から意味のあるタグを抽出して整形
 */
function smartRename(filename: string): string {
    const ext = path.extname(filename);
    const base = path.basename(filename, ext);

    const words = base
        .toLowerCase()
        .replace(/[^\w\s-]/g, " ")
        .split(/\s+/)
        .filter(Boolean);

    // ✅ duplicate key エラーを避ける（tshirt重複を排除）
    const tagDict: Record<string, string> = {
        // アウター
        jacket: "jacket",
        coat: "coat",
        blazer: "blazer",
        parka: "parka",
        hoodie: "hoodie",
        cardigan: "cardigan",
        bomber: "bomber",
        windbreaker: "windbreaker",

        // トップス
        shirt: "shirt",
        tshirt: "tshirt",
        tee: "tshirt",
        sweater: "sweater",
        sweatshirt: "sweatshirt",
        polo: "polo",
        tank: "tank",
        vest: "vest",

        // ボトムス
        pants: "pants",
        jeans: "jeans",
        denim: "denim",
        chinos: "chinos",
        shorts: "shorts",
        trousers: "trousers",
        joggers: "joggers",

        // スタイル
        vintage: "vintage",
        military: "military",
        workwear: "workwear",
        streetwear: "streetwear",
        casual: "casual",
        formal: "formal",
        oversized: "oversized",
        minimalist: "minimalist",
        retro: "retro",
        modern: "modern",

        // 素材
        leather: "leather",
        wool: "wool",
        cotton: "cotton",
        nylon: "nylon",
        canvas: "canvas",
        corduroy: "corduroy",
        fleece: "fleece",

        // カラー
        black: "black",
        blue: "blue",
        navy: "navy",
        olive: "olive",
        beige: "beige",
        grey: "grey",
        gray: "grey",
        white: "white",
        brown: "brown",
        green: "green",
        red: "red",
        orange: "orange",
        yellow: "yellow",
        purple: "purple",

        // ディテール
        field: "field",
        zip: "zip",
        button: "button",
        pocket: "pocket",
        hood: "hood",
        collar: "collar",
    };

    const tags = words.filter((w) => tagDict[w]).map((w) => tagDict[w]);

    if (tags.length > 0) return tags.join("_");
    return slugify(filename);
}

/**
 * 重複回避: ファイル名が既存の場合 _2, _3... を付与
 */
function getUniqueFilename(dir: string, baseName: string, ext: string): string {
    let candidate = `${baseName}${ext}`;
    let counter = 2;

    while (fs.existsSync(path.join(dir, candidate))) {
        candidate = `${baseName}_${counter}${ext}`;
        counter++;
    }
    return candidate;
}

async function main() {
    if (process.env.CULCEPT_RENAME_CARDS !== "1") {
        console.error("⚠️  Refusing to run. Set env CULCEPT_RENAME_CARDS=1");
        process.exit(1);
    }

    const cardsDir = process.argv[2] || "public/cards";
    if (!fs.existsSync(cardsDir)) {
        console.error(`❌ Directory not found: ${cardsDir}`);
        process.exit(1);
    }

    const files = fs.readdirSync(cardsDir);
    const imageFiles = files.filter((f) => /\.(png|jpe?g|webp|gif)$/i.test(f));

    console.log(`📂 Processing directory: ${cardsDir}`);
    console.log(`🖼️  Found ${imageFiles.length} images`);

    let renamed = 0;
    let skipped = 0;
    let errors = 0;

    for (const oldFilename of imageFiles) {
        try {
            const ext = path.extname(oldFilename);
            const oldPath = path.join(cardsDir, oldFilename);

            const newBase = smartRename(oldFilename);
            const newFilename = getUniqueFilename(cardsDir, newBase, ext);
            const newPath = path.join(cardsDir, newFilename);

            if (oldFilename === newFilename) {
                console.log(`⏭️  Skip: ${oldFilename} (already good)`);
                skipped++;
                continue;
            }

            // ✅ 先にファイルをリネーム
            fs.renameSync(oldPath, newPath);

            const oldCardId = path.basename(oldFilename, ext);
            const newCardId = path.basename(newFilename, ext);
            const oldImageUrl = `/cards/${oldFilename}`;
            const newImageUrl = `/cards/${newFilename}`;

            // ✅ DB更新（card_id一致 or image_url一致 どっちでも拾う）
            const { error: updateError } = await supabase
                .from("curated_cards")
                .update({ card_id: newCardId, image_url: newImageUrl })
                .or(`card_id.eq.${oldCardId},image_url.eq.${oldImageUrl}`);

            if (updateError) {
                // ✅ DB更新失敗したらファイル名を戻す（DBと実ファイルのズレ防止）
                console.warn(`⚠️  DB update failed: ${oldFilename} -> ${newFilename}: ${updateError.message}`);
                try {
                    fs.renameSync(newPath, oldPath);
                    console.warn(`↩️  Reverted file rename: ${newFilename} -> ${oldFilename}`);
                } catch (e: any) {
                    console.error(`❌ Failed to revert rename for ${newFilename}:`, e?.message ?? e);
                }
                errors++;
                continue;
            }

            console.log(`✅ Renamed: ${oldFilename} → ${newFilename}`);
            renamed++;
        } catch (err: any) {
            console.error(`❌ Error processing ${oldFilename}:`, err?.message ?? err);
            errors++;
        }
    }

    console.log("\n📊 Summary:");
    console.log(`   Renamed: ${renamed}`);
    console.log(`   Skipped: ${skipped}`);
    console.log(`   Errors:  ${errors}`);
    console.log(`   Total:   ${imageFiles.length}`);
}

main().catch((e) => {
    console.error(e?.message ?? e);
    process.exit(1);
});
