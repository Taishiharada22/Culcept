// scripts/dedupe-cards.ts
import fs from "fs";
import path from "path";
import crypto from "crypto";

type Mode = "dry" | "apply";
type DbRefSet = Set<string>;

type DupeItem = {
    file: string;       // filename only
    absPath: string;    // full path
    relUrl: string;     // /cards/xxx.png
    hash: string;       // sha256
    size: number;
    mtimeMs: number;
    isDbRef: boolean;
};

type Group = {
    hash: string;
    items: DupeItem[];
};

type ReplaceMapItem = {
    from: string; // /cards/dupe.png
    to: string;   // /cards/keep.png
    hash: string; // full hash
};

function die(msg: string): never {
    console.error(msg);
    process.exit(1);
}

function isImageFile(name: string): boolean {
    return /\.(png|jpe?g|webp|gif)$/i.test(name);
}

function normalizeDbUrlLine(line: string): string | null {
    const s = line.trim();
    if (!s) return null;
    if (s.startsWith("#")) return null;

    // strip quotes
    const unq = s.replace(/^["']|["']$/g, "");

    // Accept:
    // - /cards/xxx.png
    // - cards/xxx.png
    // - public/cards/xxx.png
    // - full URL https://.../cards/xxx.png
    // - JSON-ish lines that include "/cards/..."
    const m = unq.match(/\/cards\/[A-Za-z0-9._-]+\.(png|jpg|jpeg|webp|gif)\b/i);
    if (m?.[0]) return m[0];

    const m2 = unq.match(/\bcards\/[A-Za-z0-9._-]+\.(png|jpg|jpeg|webp|gif)\b/i);
    if (m2?.[0]) return "/" + m2[0].replace(/^\/+/, "");

    const m3 = unq.match(/\bpublic\/cards\/[A-Za-z0-9._-]+\.(png|jpg|jpeg|webp|gif)\b/i);
    if (m3?.[0]) return "/" + m3[0].replace(/^\/+/, "").replace(/^public\//, "");

    return null;
}

function readDbRefs(dbFile?: string): DbRefSet {
    const set: DbRefSet = new Set();
    if (!dbFile) return set;

    if (!fs.existsSync(dbFile)) {
        die(`❌ db urls file not found: ${dbFile}`);
    }

    const raw = fs.readFileSync(dbFile, "utf8");

    // Try JSON first (array or object)
    try {
        const parsed = JSON.parse(raw);
        const collect = (v: any) => {
            if (typeof v === "string") {
                const norm = normalizeDbUrlLine(v);
                if (norm) set.add(norm);
            } else if (Array.isArray(v)) {
                for (const x of v) collect(x);
            } else if (v && typeof v === "object") {
                for (const k of Object.keys(v)) collect(v[k]);
            }
        };
        collect(parsed);
        if (set.size > 0) return set;
    } catch {
        // ignore
    }

    // Fallback: line-by-line (txt/csv/log dumps)
    const lines = raw.split(/\r?\n/);
    for (const line of lines) {
        const norm = normalizeDbUrlLine(line);
        if (norm) set.add(norm);
    }
    return set;
}

function sha256File(absPath: string): string {
    const buf = fs.readFileSync(absPath);
    return crypto.createHash("sha256").update(buf).digest("hex");
}

// ---- Keep preference ----
// DB参照優先。その上で「*_2_3.png を canonical として強く優先」
// shirt.png みたいな「素の名前」も強く優先（shirt_2.png を捨てたい）
function sortKeepPreference(a: DupeItem, b: DupeItem): number {
    // 1) DB referenced wins
    if (a.isDbRef !== b.isDbRef) return a.isDbRef ? -1 : 1;

    const scoreName = (f: string) => {
        let score = 0;

        // Prefer "base" filename (no trailing _<n>)
        // e.g. shirt.png > shirt_2.png
        if (/_\d+\.(png|jpe?g|webp|gif)$/i.test(f)) score -= 6;

        // Strongly prefer *_2_3.* (あなたのデータ上これが「正」っぽい)
        if (/_2_3\.(png|jpe?g|webp|gif)$/i.test(f)) score += 20;

        // Penalize common accidental duplicate patterns
        if (/_2_2_3\.(png|jpe?g|webp|gif)$/i.test(f)) score -= 12;
        if (/_2_2_2\.(png|jpe?g|webp|gif)$/i.test(f)) score -= 12;
        if (/_2_2\.(png|jpe?g|webp|gif)$/i.test(f)) score -= 10;

        // Generic: more underscore-digit segments => more likely dupe
        const segs = (f.match(/_\d+/g) ?? []).length;
        score -= Math.min(12, segs * 2);

        // Prefer shorter (slightly)
        score -= Math.min(6, Math.floor(f.length / 40));

        return score;
    };

    const sa = scoreName(a.file);
    const sb = scoreName(b.file);
    if (sa !== sb) return sb - sa; // higher score first

    // 3) Prefer larger file size (sometimes higher quality)
    if (a.size !== b.size) return b.size - a.size;

    // 4) Prefer older (keep “original”)
    if (a.mtimeMs !== b.mtimeMs) return a.mtimeMs - b.mtimeMs;

    // 5) deterministic tie-break
    return a.file.localeCompare(b.file);
}

function parseArgs() {
    const argv = process.argv.slice(2);

    let mode: Mode = "dry";
    let dbFile: string | undefined;
    let dir: string | undefined;
    let urlBase = "/cards";

    let allowDeleteDbDupes = false;

    let mapOut: string | undefined;
    let dbOut: string | undefined;

    let sqlOut: string | undefined;
    const targets: string[] = []; // ["table.column", ...]

    const positionals: string[] = [];

    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];

        if (a === "--apply") {
            mode = "apply";
            continue;
        }

        if (a === "--allowDeleteDbDupes") {
            allowDeleteDbDupes = true;
            continue;
        }

        if (a.startsWith("--db=")) {
            dbFile = a.replace(/^--db=/, "");
            continue;
        }
        if (a === "--db") {
            const v = argv[i + 1];
            if (!v) die("❌ --db requires a value");
            dbFile = v;
            i++;
            continue;
        }

        if (a.startsWith("--dir=")) {
            dir = a.replace(/^--dir=/, "");
            continue;
        }
        if (a === "--dir") {
            const v = argv[i + 1];
            if (!v) die("❌ --dir requires a value");
            dir = v;
            i++;
            continue;
        }

        if (a.startsWith("--urlBase=")) {
            urlBase = a.replace(/^--urlBase=/, "");
            continue;
        }
        if (a === "--urlBase") {
            const v = argv[i + 1];
            if (!v) die("❌ --urlBase requires a value");
            urlBase = v;
            i++;
            continue;
        }

        if (a.startsWith("--mapOut=")) {
            mapOut = a.replace(/^--mapOut=/, "");
            continue;
        }
        if (a === "--mapOut") {
            const v = argv[i + 1];
            if (!v) die("❌ --mapOut requires a value");
            mapOut = v;
            i++;
            continue;
        }

        if (a.startsWith("--dbOut=")) {
            dbOut = a.replace(/^--dbOut=/, "");
            continue;
        }
        if (a === "--dbOut") {
            const v = argv[i + 1];
            if (!v) die("❌ --dbOut requires a value");
            dbOut = v;
            i++;
            continue;
        }

        if (a.startsWith("--sqlOut=")) {
            sqlOut = a.replace(/^--sqlOut=/, "");
            continue;
        }
        if (a === "--sqlOut") {
            const v = argv[i + 1];
            if (!v) die("❌ --sqlOut requires a value");
            sqlOut = v;
            i++;
            continue;
        }

        if (a.startsWith("--target=")) {
            targets.push(a.replace(/^--target=/, ""));
            continue;
        }
        if (a === "--target") {
            const v = argv[i + 1];
            if (!v) die("❌ --target requires a value like table.column");
            targets.push(v);
            i++;
            continue;
        }

        if (a.startsWith("-")) {
            die(`❌ unknown flag: ${a}`);
        }

        positionals.push(a);
    }

    // Backward compatible: first positional is dir
    if (!dir) dir = positionals[0] ?? "public/cards";

    const cleanUrlBase = (urlBase || "/cards").startsWith("/")
        ? urlBase
        : "/" + urlBase;

    return {
        dir,
        dbFile,
        mode,
        urlBase: cleanUrlBase,
        allowDeleteDbDupes,
        mapOut,
        dbOut,
        sqlOut,
        targets,
    };
}

function safeUnlink(absPath: string) {
    // Safety: only allow deleting inside public/cards
    const norm = path.resolve(absPath);
    const cardsRoot = path.resolve("public/cards");
    if (!norm.startsWith(cardsRoot + path.sep) && norm !== cardsRoot) {
        die(`❌ Refusing to delete outside public/cards: ${norm}`);
    }
    fs.unlinkSync(norm);
}

function writeJson(filePath: string, obj: any) {
    const outDir = path.dirname(filePath);
    if (outDir && outDir !== "." && !fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), "utf8");
}

function writeText(filePath: string, text: string) {
    const outDir = path.dirname(filePath);
    if (outDir && outDir !== "." && !fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }
    fs.writeFileSync(filePath, text, "utf8");
}

function buildSql(repl: ReplaceMapItem[], targets: string[]) {
    const lines: string[] = [];
    lines.push("-- Auto-generated by scripts/dedupe-cards.ts");
    lines.push("begin;");
    for (const t of targets) {
        const [table, col] = t.split(".");
        if (!table || !col) continue;

        for (const m of repl) {
            // single-quote escape
            const from = m.from.replace(/'/g, "''");
            const to = m.to.replace(/'/g, "''");
            lines.push(`update ${table} set ${col}='${to}' where ${col}='${from}';`);
        }
    }
    lines.push("commit;");
    lines.push("");
    return lines.join("\n");
}

async function main() {
    const {
        dir,
        dbFile,
        mode,
        urlBase,
        allowDeleteDbDupes,
        mapOut,
        dbOut,
        sqlOut,
        targets,
    } = parseArgs();

    if (!fs.existsSync(dir)) die(`❌ Directory not found: ${dir}`);

    const dbRefs = readDbRefs(dbFile);

    const entries = fs.readdirSync(dir);
    const images = entries.filter(isImageFile);

    console.log(`\n📦 scan: ${images.length} images in ${dir}`);
    console.log(`🧷 db refs: ${dbRefs.size} (if --db= provided)`);
    console.log(
        `🧪 mode: ${mode === "apply" ? "APPLY (delete)" : "DRY-RUN (no delete)"}`
    );
    if (dbRefs.size > 0) {
        console.log(
            `🛡️  DB policy: ${allowDeleteDbDupes
                ? "allow delete DB-dup (only when keep is also DB)"
                : "protect all DB refs"
            }`
        );
    }
    console.log("");

    // Build items with hash
    const items: DupeItem[] = [];
    for (const file of images) {
        const absPath = path.join(dir, file);
        const st = fs.statSync(absPath);
        const relUrl = `${urlBase.replace(/\/+$/, "")}/${file}`;
        const isDbRef = dbRefs.size > 0 ? dbRefs.has(relUrl) : false;
        const hash = sha256File(absPath);

        items.push({
            file,
            absPath,
            relUrl,
            hash,
            size: st.size,
            mtimeMs: st.mtimeMs,
            isDbRef,
        });
    }

    // Group by hash
    const byHash = new Map<string, DupeItem[]>();
    for (const it of items) {
        const arr = byHash.get(it.hash) ?? [];
        arr.push(it);
        byHash.set(it.hash, arr);
    }

    const groups: Group[] = [];
    for (const [hash, arr] of byHash.entries()) {
        if (arr.length >= 2) groups.push({ hash, items: arr });
    }

    groups.sort((a, b) => b.items.length - a.items.length);

    let duplicateGroups = 0;
    let deletePlanned = 0;
    let deleted = 0;
    let protectedDb = 0;

    const replaceMap: ReplaceMapItem[] = [];

    for (const g of groups) {
        duplicateGroups++;

        const sorted = [...g.items].sort(sortKeepPreference);
        const keep = sorted[0];

        console.log(`# DUP (${sorted.length}) hash=${g.hash.slice(0, 12)}...`);
        console.log(`✅ keep: ${keep.file}${keep.isDbRef ? " [DB]" : ""}  (${keep.relUrl})`);

        for (let i = 1; i < sorted.length; i++) {
            const cand = sorted[i];

            // DB ref handling
            if (dbRefs.size > 0 && cand.isDbRef) {
                // If keep is ALSO DB and flag enabled, we can treat cand as "replaceable DB dupe"
                const canDeleteDbDupe = allowDeleteDbDupes && keep.isDbRef && cand.relUrl !== keep.relUrl;

                if (!canDeleteDbDupe) {
                    protectedDb++;
                    console.log(`🛡️  skip delete (DB ref): ${cand.file}`);
                    continue;
                }

                // Record mapping for DB rewrite (dupe -> keep)
                replaceMap.push({ from: cand.relUrl, to: keep.relUrl, hash: g.hash });
            } else if (dbRefs.size > 0 && !cand.isDbRef && keep.isDbRef) {
                // non-DB duplicate is safe to delete (DB keep exists)
            }

            deletePlanned++;

            if (mode === "apply") {
                try {
                    safeUnlink(cand.absPath);
                    deleted++;
                    console.log(`🗑️  deleted: ${cand.file}`);
                } catch (e: any) {
                    console.log(`❌ delete failed: ${cand.file} -> ${e?.message ?? String(e)}`);
                }
            } else {
                console.log(`🗑️  would delete: ${cand.file}${cand.isDbRef ? " [DB-DUPE]" : ""}`);
            }
        }

        console.log("");
    }

    // Optional outputs
    if (mapOut) {
        writeJson(mapOut, replaceMap);
        console.log(`🧾 wrote mapOut: ${mapOut}  (mappings: ${replaceMap.length})`);
    }

    if (dbOut && dbFile) {
        // Build canonical db list by applying replacements on the *set*
        const canon = new Set<string>(dbRefs);
        for (const m of replaceMap) {
            if (canon.has(m.from)) {
                canon.delete(m.from);
                canon.add(m.to);
            }
        }
        const sorted = Array.from(canon).sort();
        writeText(dbOut, sorted.join("\n") + "\n");
        console.log(`🧷 wrote dbOut (canonicalized): ${dbOut}  (lines: ${sorted.length})`);
    }

    if (sqlOut) {
        if (replaceMap.length === 0) {
            console.log(`ℹ️  sqlOut requested but no mappings; nothing to write.`);
        } else if (!targets || targets.length === 0) {
            console.log(`⚠️  sqlOut requested but no --target=table.column provided; skipping SQL output.`);
        } else {
            const sql = buildSql(replaceMap, targets);
            writeText(sqlOut, sql);
            console.log(`🧠 wrote sqlOut: ${sqlOut}  (targets: ${targets.length}, mappings: ${replaceMap.length})`);
        }
    }

    console.log(`\n📊 Summary`);
    console.log(`  duplicate groups: ${duplicateGroups}`);
    console.log(`  delete planned:   ${deletePlanned}`);
    console.log(`  protected (DB):   ${protectedDb}`);
    console.log(`  deleted:          ${deleted}`);
    console.log(`  mappings:         ${replaceMap.length}`);
    console.log(`  mode:             ${mode === "apply" ? "apply" : "dry-run"}`);
}

main().catch((e) => {
    console.error("❌ Fatal:", e?.message ?? e);
    process.exit(1);
});
