// app/shops/me/_lib/generateShopCopy.ts
import type { SiteFacts } from "./extractSiteFacts";

export type ShopGen = {
    headline: string;
    intro: string;
    suggested_tags: string[];
    address_text: string | null;
    hero_image_url: string | null;

    // ✅ タグごとの強み（0-100）: 一般公開で見せる用
    tag_scores?: Record<string, number>;
};

function normalizeTags(tags: string[]) {
    const norm = tags
        .map((t) => String(t || "").trim().toLowerCase())
        .map((t) => t.replace(/[^\p{L}\p{N}_-]+/gu, "-"))
        .map((t) => t.replace(/^-+|-+$/g, ""))
        .filter(Boolean)
        .slice(0, 20);
    return Array.from(new Set(norm));
}

function clampScore(n: unknown) {
    const x = Math.round(Number(n));
    if (!Number.isFinite(x)) return 0;
    return Math.max(0, Math.min(100, x));
}

function normalizeScoreMap(raw: unknown): Record<string, number> {
    if (!raw) return {};
    if (Array.isArray(raw)) {
        const out: Record<string, number> = {};
        for (const it of raw as any[]) {
            const tag = String((it as any)?.tag ?? "").trim().toLowerCase();
            if (!tag) continue;
            out[tag] = clampScore((it as any)?.score);
        }
        return out;
    }
    if (typeof raw === "object") {
        const out: Record<string, number> = {};
        for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
            const tag = String(k ?? "").trim().toLowerCase();
            if (!tag) continue;
            out[tag] = clampScore(v);
        }
        return out;
    }
    return {};
}

function fillScoresFromTags(tags: string[], fallback = 50): Record<string, number> {
    const out: Record<string, number> = {};
    for (const t of normalizeTags(tags)) out[t] = clampScore(fallback);
    return out;
}

function fallbackGenerate(f: SiteFacts): ShopGen {
    const headline =
        (f.og.title || f.jsonld.name || "古着ショップ").slice(0, 60);
    const base =
        f.og.description ||
        f.jsonld.description ||
        "このお店の公式サイト情報をもとに、雰囲気や特徴をまとめました。";
    const intro = String(base).trim().slice(0, 500);

    const seed = `${headline} ${intro}`.toLowerCase();
    const tags: string[] = [];
    if (seed.includes("vintage") || seed.includes("ヴィンテージ")) tags.push("vintage");
    if (seed.includes("street") || seed.includes("ストリート")) tags.push("street");
    if (seed.includes("designer") || seed.includes("デザイナー")) tags.push("designer");
    tags.push("furugi");

    const suggested_tags = normalizeTags(tags);

    return {
        headline,
        intro,
        suggested_tags,
        address_text: f.jsonld.addressText || null,
        hero_image_url: f.og.image || null,
        tag_scores: fillScoresFromTags(suggested_tags, 50),
    };
}

async function generateWithOllama(f: SiteFacts): Promise<ShopGen> {
    const host = process.env.OLLAMA_HOST || "http://localhost:11434";
    const model = process.env.OLLAMA_MODEL || "llama3.1";

    const facts = {
        og: f.og,
        jsonld: f.jsonld,
        finalUrl: f.finalUrl,
    };

    const system = `
あなたは古着ショップの紹介ページを作る編集者です。
入力は公式サイトから抽出した「事実」だけです。
禁止：原文の丸写し、長い引用。
出力：必ずJSONのみ。
`;

    const user = `
次の facts を元に、Culcept掲載用の文章とタグ候補を作って。
- headline: 30-50文字（雰囲気＋売り）
- intro: 200-350文字（要約＋再編集）
- suggested_tags: 5-12個（英小文字・短い）
- tag_scores: suggested_tags の各タグに対して 0-100 の強みスコア（数字のみ。例: {"vintage":82,...}）
- address_text: 住所っぽい文字列が取れたら（無ければnull）
- hero_image_url: og:imageがあれば入れて（無ければnull）
facts: ${JSON.stringify(facts)}
`;

    const res = await fetch(`${host}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            model,
            messages: [
                { role: "system", content: system.trim() },
                { role: "user", content: user.trim() },
            ],
            stream: false,
            format: "json",
        }),
    });

    if (!res.ok) throw new Error(`ollama error: ${res.status}`);

    const json = await res.json();
    const content = json?.message?.content;
    if (!content) throw new Error("ollama: empty content");

    const out = JSON.parse(content);

    const fb = fallbackGenerate(f);

    const headline = String(out?.headline ?? "").trim().slice(0, 60) || fb.headline;
    const intro = String(out?.intro ?? "").trim().slice(0, 700) || fb.intro;

    const suggested_tags = normalizeTags(Array.isArray(out?.suggested_tags) ? out.suggested_tags : []);
    const address_text = out?.address_text ? String(out.address_text).trim().slice(0, 200) : null;
    const hero_image_url = out?.hero_image_url ? String(out.hero_image_url).trim().slice(0, 500) : (f.og.image || null);

    const tag_scores_raw = out?.tag_scores;
    const tag_scores_norm = normalizeScoreMap(tag_scores_raw);
    const tag_scores =
        suggested_tags.length
            ? Object.keys(tag_scores_norm).length
                ? tag_scores_norm
                : fillScoresFromTags(suggested_tags, 50)
            : fb.tag_scores;

    return {
        headline,
        intro,
        suggested_tags: suggested_tags.length ? suggested_tags : fb.suggested_tags,
        address_text: address_text || f.jsonld.addressText || null,
        hero_image_url,
        tag_scores,
    };
}

export async function generateShopCopy(f: SiteFacts): Promise<ShopGen> {
    const provider = (process.env.AI_PROVIDER || "ollama").toLowerCase();

    try {
        if (provider === "ollama") return await generateWithOllama(f);
    } catch {
        // 落ちたらフォールバック
    }
    return fallbackGenerate(f);
}
