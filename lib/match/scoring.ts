import { TAG_VEC, Vec3 } from "./tagVec";
import { MIN_DROP_ITEMS, MAX_DROP_ITEMS } from "@/lib/constants";

export type IntlMode = "direct" | "proxy_ok" | "unknown";
export type CandidateKind = "shop" | "drop";

export type Candidate = {
    id: string;
    kind: CandidateKind;
    intl: IntlMode;
    quality: number; // 0..1
    activeItems?: number; // drops only
    tagStrength: Record<string, number>; // tag -> 0..3
};

function similarity(u: Vec3, t: Vec3) {
    const da = u.street - t.street;
    const db = u.loud - t.loud;
    const dc = u.vintage - t.vintage;
    const dist = Math.sqrt(da * da + db * db + dc * dc);
    const maxDist = Math.sqrt(100 * 100 * 3);
    return 1 - dist / maxDist; // 0..1
}

export function scoreCandidate(u: Vec3, x: Candidate) {
    if (x.kind === "drop") {
        const n = x.activeItems ?? 0;
        if (n < MIN_DROP_ITEMS || n > MAX_DROP_ITEMS) return Number.NEGATIVE_INFINITY;
    }

    let tagScore = 0;
    for (const [tag, strength] of Object.entries(x.tagStrength)) {
        const tv = TAG_VEC[tag];
        if (!tv) continue;
        tagScore += strength * similarity(u, tv);
    }

    const intlBonus = x.intl === "direct" ? 0.25 : x.intl === "proxy_ok" ? 0.10 : 0;
    const invBonus =
        x.kind === "drop"
            ? Math.min((x.activeItems ?? 0) / MAX_DROP_ITEMS, 1) * 0.30
            : 0;
    const qualityBonus = Math.max(0, Math.min(1, x.quality)) * 0.50;

    return tagScore + intlBonus + invBonus + qualityBonus;
}

export function rankTop10(u: Vec3, candidates: Candidate[]) {
    return candidates
        .map((c) => ({ c, s: scoreCandidate(u, c) }))
        .filter((x) => Number.isFinite(x.s))
        .sort((a, b) => b.s - a.s)
        .slice(0, 10)
        .map((x) => x.c);
}
