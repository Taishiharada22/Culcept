// scripts/import-cards.ts
// Usage examples:
//
// 1) public/cards をそのまま取り込み（今の構成に合う）
//    CULCEPT_IMPORT_CARDS=1 npx tsx scripts/import-cards.ts
//
// 2) 任意フォルダから取り込み（~ もOK）
//    CULCEPT_IMPORT_CARDS=1 npx tsx scripts/import-cards.ts --dir ~/Downloads/culcept_cards/cards
//
// 3) prefix で絞り込み（例: cc_ で始まるファイルだけ）
//    CULCEPT_IMPORT_CARDS=1 npx tsx scripts/import-cards.ts --prefix cc_
//
// 4) 実行せずに確認だけ
//    CULCEPT_IMPORT_CARDS=1 npx tsx scripts/import-cards.ts --dry-run
//
// 5) ファイル名を安全な形式にリネームして取り込み（任意）
//    CULCEPT_IMPORT_CARDS=1 npx tsx scripts/import-cards.ts --rename

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import os from "os";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "";

if (!SUPABASE_URL) throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)");
if (!SERVICE_KEY) throw new Error("Missing env: SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY)");

// ✅ 安全装置：明示しない限り走らせない（“勝手に入る” をここで止める）
if (process.env.CULCEPT_IMPORT_CARDS !== "1") {
    console.error(
        "Refusing to run.\n" +
        "Set env CULCEPT_IMPORT_CARDS=1 to execute.\n" +
        "Example: CULCEPT_IMPORT_CARDS=1 npx tsx scripts/import-cards.ts --dir ./public/cards"
    );
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
});

const EXT_RE = /\.(png|jpg|jpeg|webp)$/i;

function getArg(name: string): string | undefined {
    const args = process.argv.slice(2);
    const eq = args.find((a) => a.startsWith(`--${name}=`));
    if (eq) return eq.slice(`--${name}=`.length);
    const idx = args.findIndex((a) => a === `--${name}`);
    if (idx >= 0) return args[idx + 1];
    return undefined;
}

function hasFlag(name: string): boolean {
    return process.argv.slice(2).includes(`--${name}`);
}

function ensureDir(p: string) {
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function expandHome(p: string): string {
    if (!p) return p;
    if (p === "~") return os.homedir();
    if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
    return p;
}

function stripExt(filename: string): string {
    return filename.replace(EXT_RE, "");
}

// ✅ 任意：タグの表記ゆれを正規化
function canonicalizeTag(tag: string): string {
    const t = tag.toLowerCase();

    // まず英数以外は落とした “正規形” に寄せる（off-white → offwhite など）
    const norm = t.replace(/[^a-z0-9]/g, "");

    // よくある揺れ
    const map: Record<string, string> = {
        grey: "gray",
        offwhite: "offwhite",
        darkbrown: "darkbrown",
        darkindigo: "darkindigo",
    };

    // map にあればそれ、なければ norm を返す
    return map[norm] ?? norm;
}

// ✅ ファイル名を “URL/DB 的に安全” な形式へ（任意で使う）
function slugifyBase(base: string): string {
    // lower + 余計な記号を "-" に寄せて、連続 "-" を潰す
    const s = base
        .toLowerCase()
        .trim()
        .replace(/[\s_]+/g, "-")
        .replace(/[^a-z0-9\-]/g, "-")
        .replace(/\-+/g, "-")
        .replace(/^\-+|\-+$/g, "");

    // 空になったら fallback
    return s || `card-${Date.now()}`;
}

function uniqueFilename(dir: string, filename: string): string {
    // 同名があれば _2, _3... を付ける
    const ext = path.extname(filename);
    const base = filename.slice(0, -ext.length);
    let cand = filename;
    let i = 2;
    while (fs.existsSync(path.join(dir, cand))) {
        cand = `${base}_${i}${ext}`;
        i++;
    }
    return cand;
}

// ✅ パターン群（string[] の集合にして includes が素直に通るようにする）
const PATTERNS: Record<string, string[]> = {
    style: ["denim", "military", "workwear", "vintage", "modern", "casual", "formal", "biker", "rock", "flight", "field"],
    item: ["jacket", "shirt", "pants", "jeans", "coat", "hoodie", "sweater", "boots"],
    detail: ["tapered", "straight", "oversized", "slim", "regular", "variant", "only"],
    material: ["cotton", "denim", "leather", "wool", "nylon", "chambray", "suede"],
    color: [
        "black",
        "blue",
        "navy",
        "olive",
        "beige",
        "grey",
        "gray",
        "white",
        "offwhite",
        "sand",
        "brown",
        "darkbrown",
        "khaki",
        "indigo",
        "darkindigo",
        "tan",
    ],
};

// ✅ ファイル名からタグ抽出
function extractTags(filename: string): string[] {
    const base = stripExt(filename);
    const parts = base.split(/[_\-\s]+/).filter(Boolean);

    const tags: string[] = [];
    const lists = Object.values(PATTERNS); // string[][]

    for (const part of parts) {
        const lower = part.toLowerCase();
        const normalized = lower.replace(/[^a-z0-9]/g, "");

        for (const list of lists) {
            if (list.includes(lower)) {
                tags.push(canonicalizeTag(lower));
            } else if (list.includes(normalized)) {
                tags.push(canonicalizeTag(normalized));
            }
        }
    }

    return [...new Set(tags)];
}

async function main() {
    // ✅ 取り込み元
    const dirArg = getArg("dir");
    const cardsDir = expandHome(dirArg || process.env.CULCEPT_CARDS_DIR || path.join(process.cwd(), "public/cards"));

    // ✅ 公開先（アプリから見える場所）
    const publicCardsDir = path.join(process.cwd(), "public/cards");

    // ✅ フィルタ（必要なら cc_ など）
    const prefix = getArg("prefix") ?? process.env.CULCEPT_CARDS_PREFIX ?? "";

    // ✅ dry-run
    const dryRun = hasFlag("dry-run");

    // ✅ 任意：リネーム（DB/URL/ファイルを安全な名前に寄せる）
    const rename = hasFlag("rename") || process.env.CULCEPT_CARDS_RENAME === "1";

    if (!fs.existsSync(cardsDir)) throw new Error(`Directory not found: ${cardsDir}`);
    ensureDir(publicCardsDir);

    const files = fs
        .readdirSync(cardsDir)
        .filter((f) => EXT_RE.test(f))
        .filter((f) => (prefix ? f.startsWith(prefix) : true));

    console.log(`cardsDir: ${path.relative(process.cwd(), cardsDir) || cardsDir}`);
    console.log(`publicCardsDir: ${publicCardsDir}`);
    console.log(`prefix: ${prefix || "(none)"}`);
    console.log(`rename: ${rename ? "on" : "off"}`);
    console.log(`Found ${files.length} candidate images`);

    let ok = 0;
    let ng = 0;

    for (const originalFile of files) {
        const src = path.join(cardsDir, originalFile);

        // 取り込みファイル名（rename が on なら安全なファイル名に変換）
        const ext = path.extname(originalFile).toLowerCase();
        const base = stripExt(originalFile);
        let file = originalFile;

        if (rename) {
            const safeBase = slugifyBase(base);
            const safeName = `${safeBase}${ext}`;

            // publicCardsDir 上でユニークにする
            const uniq = uniqueFilename(publicCardsDir, safeName);

            // cardsDir と publicCardsDir が同じ場合＝その場で rename
            if (path.resolve(cardsDir) === path.resolve(publicCardsDir)) {
                if (originalFile !== uniq) {
                    if (!dryRun) fs.renameSync(src, path.join(publicCardsDir, uniq));
                    file = uniq;
                } else {
                    file = originalFile;
                }
            } else {
                // 別ディレクトリからコピーする場合：dst 名を uniq にする
                file = uniq;
            }
        }

        const dst = path.join(publicCardsDir, file);

        const cardId = stripExt(file);
        const imageUrl = `/cards/${file}`;
        const tags = extractTags(file);

        if (dryRun) {
            console.log(`[dry-run] would import: ${originalFile} -> ${file} (card_id=${cardId}) tags=[${tags.join(", ")}]`);
            continue;
        }

        // ✅ 公開フォルダへコピー（取り込み元が Downloads でもOK）
        // cardsDir と publicCardsDir が同じ時は copy 不要（rename off の場合）
        if (path.resolve(cardsDir) !== path.resolve(publicCardsDir)) {
            fs.copyFileSync(src, dst);
        } else {
            // same dir: rename off の時だけここに来る。dst は src と同じなので何もしない
        }

        const { error } = await supabase
            .from("curated_cards")
            .upsert({ card_id: cardId, image_url: imageUrl, tags, is_active: true }, { onConflict: "card_id" });

        if (error) {
            ng++;
            console.error(`✗ Failed: ${file}`, {
                message: error.message,
                details: (error as any).details,
                hint: (error as any).hint,
                code: (error as any).code,
            });
        } else {
            ok++;
            console.log(`✓ ${file} → ${cardId} tags: [${tags.join(", ")}]`);
        }
    }

    console.log(`Done. ok=${ok} ng=${ng}`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
