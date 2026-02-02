// scripts/fix-cards-links.ts
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("❌ Missing env: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
    console.error("   set -a; source .env.local; set +a してから実行して");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
});

const exts = ["png", "jpg", "jpeg", "webp", "gif"];

function exists(p: string): boolean {
    try {
        fs.accessSync(p);
        return true;
    } catch {
        return false;
    }
}

function findBestCandidate(cardsDir: string, baseNoExt: string): string | null {
    // 1) 同名別拡張子
    for (const ext of exts) {
        const p = path.join(cardsDir, `${baseNoExt}.${ext}`);
        if (exists(p) && fs.statSync(p).isFile()) return p;
    }

    // 2) 末尾 _2 _3 … を削って探す（a_b_2_2 -> a_b_2 -> a_b）
    let cur = baseNoExt;
    for (let i = 0; i < 4; i++) {
        cur = cur.replace(/_\d+$/g, "");
        if (!cur || cur === baseNoExt) break;

        for (const ext of exts) {
            const p = path.join(cardsDir, `${cur}.${ext}`);
            if (exists(p) && fs.statSync(p).isFile()) return p;
        }
    }

    return null;
}

async function deactivateByImageUrl(imageUrl: string) {
    const { error } = await supabase
        .from("curated_cards")
        .update({ is_active: false })
        .eq("image_url", imageUrl);

    if (error) {
        console.error(`❌ DB deactivate failed (${imageUrl}): ${error.message}`);
    }
}

async function main() {
    if (process.env.CULCEPT_FIX_LINKS !== "1") {
        console.error("⚠️ Refusing to run. Set env CULCEPT_FIX_LINKS=1");
        process.exit(1);
    }

    const cardsDir = path.join(process.cwd(), "public", "cards");
    if (!exists(cardsDir)) {
        console.error("❌ public/cards not found");
        process.exit(1);
    }

    const files = fs.readdirSync(cardsDir).filter((f) => /\.(png|jpe?g|webp|gif)$/i.test(f));

    let links = 0;
    let fixed = 0;
    let brokenRemoved = 0;
    let skipped = 0;

    for (const name of files) {
        const full = path.join(cardsDir, name);

        let st: fs.Stats;
        try {
            st = fs.lstatSync(full); // ★ symlink判定はlstat
        } catch (e: any) {
            console.error(`❌ lstat failed: ${name} -> ${e?.message ?? e}`);
            skipped++;
            continue;
        }

        if (!st.isSymbolicLink()) continue;

        links++;

        let linkTarget: string;
        try {
            linkTarget = fs.readlinkSync(full);
        } catch (e: any) {
            console.error(`❌ readlink failed: ${name} -> ${e?.message ?? e}`);
            skipped++;
            continue;
        }

        // linkTarget は相対のことが多いので cardsDir 基準で解決
        const targetAbs = path.resolve(cardsDir, linkTarget);

        let sourceAbs: string | null = null;

        if (exists(targetAbs)) {
            sourceAbs = targetAbs;
        } else {
            // 壊れてる：参照先名（拡張子除去）で候補探索
            const base = path.basename(linkTarget, path.extname(linkTarget));
            sourceAbs = findBestCandidate(cardsDir, base);
        }

        const imageUrl = `/cards/${name}`;

        if (!sourceAbs) {
            // 完全に復旧不能 → symlink削除 + DB無効化
            try {
                fs.unlinkSync(full);
                brokenRemoved++;
                console.log(`🗑️ removed broken link: ${name} -> ${linkTarget}`);
            } catch (e: any) {
                console.error(`❌ unlink failed: ${name} -> ${e?.message ?? e}`);
            }

            await deactivateByImageUrl(imageUrl);
            continue;
        }

        // symlink を実ファイルに置換（同名を維持）
        try {
            fs.unlinkSync(full); // symlinkを削除
            fs.copyFileSync(sourceAbs, full); // 実体をコピー
            fixed++;
            console.log(`✅ link -> file: ${name} (source=${path.basename(sourceAbs)})`);
        } catch (e: any) {
            console.error(`❌ replace failed: ${name} -> ${e?.message ?? e}`);
            skipped++;
        }
    }

    console.log("\n📊 Summary (fix symlinks)");
    console.log("  symlinks found:", links);
    console.log("  fixed (copied):", fixed);
    console.log("  broken removed:", brokenRemoved);
    console.log("  skipped:", skipped);
}

main().catch((e) => {
    console.error("❌ Fatal:", e?.message ?? e);
    process.exit(1);
});
