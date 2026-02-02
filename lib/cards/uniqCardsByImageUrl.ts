// lib/cards/uniqCardsByImageUrl.ts
export type Card = { image_url: string };

export function uniqCardsByImageUrl(cards: Card[]): Card[] {
    const seen = new Set<string>();
    const out: Card[] = [];

    for (const c of cards ?? []) {
        const url = String(c?.image_url ?? "").trim();
        if (!url) continue;
        if (seen.has(url)) continue;
        seen.add(url);
        out.push({ image_url: url });
    }

    return out;
}
