// scripts/fix-cards-ext.ts
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("❌ Missing env: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
});

function sniff(buf: Buffer): "png" | "jpg" | "gif" | "webp" | null {
    if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
    if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xd8) return "jpg";
    if (buf.length >= 6 && buf.slice(0, 6).toString("ascii").startsWith("GIF")) return "gif";
    if (buf.length >= 12 && buf.slice(0, 4).toString("ascii") === "RIFF" && buf.slice(8, 12).toString("ascii") === "WEBP") return "webp";
    return null;
}

function uniqueName(dir: string, base: string, ext: string) {
    let name = `${base}.${ext}`;
    let i = 2;
    while (fs.existsSync(path.join(dir, name))) {
        name = `${base}_${i}.${ext}`;
        i++;
    }
    return name;
}

async function main() {
    if (process.env.CULCEPT_FIX_EXT !== "1") {
        console.error("⚠️ Refusing to run. Set env CULCEPT_FIX_EXT=1");
        process.exit(1);
    }

    const cardsDir = path.join(process.cwd(), "public", "cards");
    const files = fs.readdirSync(cardsDir).filter((f) => /\.(png|jpe?g|webp|gif)$/i.test(f));

    let renamed = 0;
    let updated = 0;
    let skipped = 0;

    for (const f of files) {
        const full = path.join(cardsDir, f);

        // ★ ここが落ちないポイント：lstatでsymlinkを検知し、壊れてたらスキップ
        let lst: fs.Stats;
        try {
            lst = fs.lstatSync(full);
        } catch {
            skipped++;
            continue;
        }

        if (lst.isSymbolicLink()) {
            // symlinkは先に fix-cards-links.ts で潰す想定。念のため壊れならスキップ
            try {
                fs.realpathSync(full);
            } catch {
                console.log(`⛔ skip broken symlink: ${f}`);
                skipped++;
                continue;
            }
        }

        let st: fs.Stats;
        try {
            st = fs.statSync(full);
        } catch {
            skipped++;
            continue;
        }
        if (st.size === 0) { skipped++; continue; }

        let buf: Buffer;
        try {
            buf = fs.readFileSync(full);
        } catch {
            skipped++;
            continue;
        }

        const actual = sniff(buf);
        if (!actual) { skipped++; continue; }

        const ext = path.extname(f).replace(".", "").toLowerCase();
        const normExt = ext === "jpeg" ? "jpg" : ext;
        if (normExt === actual) continue;

        const base = path.basename(f, path.extname(f));
        const newName = uniqueName(cardsDir, base, actual);

        fs.renameSync(full, path.join(cardsDir, newName));
        renamed++;

        const oldUrl = `/cards/${f}`;
        const newUrl = `/cards/${newName}`;

        const { error } = await supabase
            .from("curated_cards")
            .update({ image_url: newUrl })
            .eq("image_url", oldUrl);

        if (error) {
            console.error(`❌ DB update failed: ${oldUrl} -> ${newUrl}: ${error.message}`);
        } else {
            updated++;
            console.log(`✅ fixed ext: ${f} -> ${newName}`);
        }
    }

    console.log("\n📊 Summary (fix ext)");
    console.log("  renamed:", renamed);
    console.log("  db updated:", updated);
    console.log("  skipped:", skipped);
}

main().catch((e) => {
    console.error("❌ Fatal:", e?.message ?? e);
    process.exit(1);
});
