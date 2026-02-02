// scripts/fix-cards-db-missing.ts
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

const CARD_DIR = path.join(process.cwd(), "public", "cards");
const tryExts = [".png", ".webp", ".jpg", ".jpeg", ".gif"];

function fileExists(name: string) {
    try {
        const full = path.join(CARD_DIR, name);
        return fs.statSync(full).isFile();
    } catch {
        return false;
    }
}

function urlToName(url: string) {
    return url.replace(/^\/cards\//, "");
}

function candidatesFromName(name: string): string[] {
    const ext = path.extname(name);
    const base = name.slice(0, -ext.length);

    const bases = new Set<string>();
    bases.add(base);

    // よくあるパターンを段階的に潰す
    bases.add(base.replace(/_2_2_2$/, "_2_2"));
    bases.add(base.replace(/_2_2$/, "_2"));
    bases.add(base.replace(/_3$/, "_2"));
    bases.add(base.replace(/_3$/, "")); // 一応

    const out: string[] = [];
    for (const b of bases) {
        for (const e of tryExts) out.push(`${b}${e}`);
    }

    // 重複除去しつつ順序維持
    const uniq: string[] = [];
    const seen = new Set<string>();
    for (const x of out) {
        if (seen.has(x)) continue;
        seen.add(x);
        uniq.push(x);
    }
    return uniq;
}

async function fetchActiveRows() {
    const all: any[] = [];
    const pageSize = 1000;
    let from = 0;
    while (true) {
        const to = from + pageSize - 1;
        const { data, error } = await supabase
            .from("curated_cards")
            .select("card_id,image_url,is_active")
            .neq("is_active", false)
            .range(from, to);

        if (error) throw error;
        if (!data || data.length === 0) break;
        all.push(...data);
        if (data.length < pageSize) break;
        from += pageSize;
    }
    return all;
}

async function main() {
    if (process.env.CULCEPT_FIX_DB !== "1") {
        console.error("⚠️ Refusing to run. Set env CULCEPT_FIX_DB=1");
        process.exit(1);
    }

    const rows = await fetchActiveRows();

    let fixed = 0;
    let deactivated = 0;
    let kept = 0;

    for (const r of rows) {
        const url = r.image_url as string;
        const name = urlToName(url);

        if (fileExists(name)) {
            kept++;
            continue;
        }

        const cands = candidatesFromName(name);
        const found = cands.find(fileExists);

        if (found) {
            const newUrl = `/cards/${found}`;
            const { error } = await supabase
                .from("curated_cards")
                .update({ image_url: newUrl, is_active: true })
                .eq("card_id", r.card_id);

            if (!error) {
                fixed++;
                console.log(`✅ fix: ${url} -> ${newUrl} (card_id=${r.card_id})`);
            } else {
                console.log(`❌ update failed: ${r.card_id} ${error.message}`);
            }
            continue;
        }

        const { error } = await supabase
            .from("curated_cards")
            .update({ is_active: false })
            .eq("card_id", r.card_id);

        if (!error) {
            deactivated++;
            console.log(`🛑 deactivate: ${url} (card_id=${r.card_id})`);
        } else {
            console.log(`❌ deactivate failed: ${r.card_id} ${error.message}`);
        }
    }

    console.log("\n📊 Summary (fix db missing)");
    console.log("  kept:", kept);
    console.log("  fixed:", fixed);
    console.log("  deactivated:", deactivated);
}

main().catch((e) => {
    console.error("❌ Fatal:", e?.message ?? e);
    process.exit(1);
});
