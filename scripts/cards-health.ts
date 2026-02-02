// scripts/cards-health.ts
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

const exts = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

function listLocalUrls(): Set<string> {
    const dir = path.join(process.cwd(), "public", "cards");
    const set = new Set<string>();
    for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name);
        const st = fs.lstatSync(full);
        if (!st.isFile()) continue;
        const ext = path.extname(name).toLowerCase();
        if (!exts.has(ext)) continue;
        set.add(`/cards/${name}`);
    }
    return set;
}

async function fetchAllCards() {
    const all: any[] = [];
    const pageSize = 1000;
    let from = 0;
    while (true) {
        const to = from + pageSize - 1;
        const { data, error } = await supabase
            .from("curated_cards")
            .select("card_id,image_url,is_active")
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
    const local = listLocalUrls();
    const rows = await fetchAllCards();

    const active = rows.filter((r) => r.is_active !== false);
    const missingActive = active.filter((r) => !local.has(r.image_url));
    const missingAll = rows.filter((r) => !local.has(r.image_url));

    console.log("📦 Local files:", local.size);
    console.log("🗃️ DB rows:", rows.length);
    console.log("✅ Active rows:", active.length);
    console.log("❌ Missing (active):", missingActive.length);
    console.log("❌ Missing (all):", missingAll.length);

    if (missingActive.length) {
        console.log("\n--- Missing active sample (max 50) ---");
        for (const r of missingActive.slice(0, 50)) {
            console.log(`${r.card_id}\t${r.image_url}`);
        }
    }
}

main().catch((e) => {
    console.error("❌ Fatal:", e?.message ?? e);
    process.exit(1);
});
