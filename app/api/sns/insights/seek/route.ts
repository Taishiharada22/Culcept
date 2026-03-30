import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { selectUserStyleSummaryMaybeSingle } from "@/lib/userStyleSummary";
import {
    KNOWN_LANES,
    PRESENCE_API_FALLBACK,
    type IAmProfile,
    type SeekResponse,
    type StyleDna,
    type TasteLayers,
} from "@/app/sns/profile/_lib/presenceDefaults";

export const runtime = "nodejs";

type QueryData<T> = {
    data: T | null;
    error: { message?: string } | null;
};

function unique(values: string[]) {
    return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function asStringArray(value: unknown) {
    return Array.isArray(value)
        ? value.filter((entry): entry is string => typeof entry === "string")
        : [];
}

function asNumberRecord(value: unknown) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};

    return Object.fromEntries(
        Object.entries(value).filter((entry): entry is [string, number] => typeof entry[1] === "number")
    );
}

function topKeys(value: unknown, limit: number) {
    return Object.entries(asNumberRecord(value))
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([key]) => key);
}

function pickData<T>(label: string, result: PromiseSettledResult<QueryData<T>>) {
    if (result.status === "rejected") {
        console.error(`presence seek ${label} rejected`, result.reason);
        return null;
    }

    if (result.value.error) {
        console.error(`presence seek ${label} error`, result.value.error);
    }

    return result.value.data ?? null;
}

function deriveLanes(styleTags: string[], tasteLayers: TasteLayers | null) {
    const laneTop3Raw = tasteLayers?.layer_30d && "lane_top3" in tasteLayers.layer_30d
        ? asStringArray((tasteLayers.layer_30d as Record<string, unknown>).lane_top3)
        : [];

    const known = new Set<string>(KNOWN_LANES);
    const fromTags = styleTags.filter((tag) => known.has(tag));

    return unique([
        ...laneTop3Raw.filter((tag) => known.has(tag)),
        ...fromTags,
        ...PRESENCE_API_FALLBACK.i_am!.lanes,
    ]).slice(0, 3);
}

export async function GET() {
    try {
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();

        if (!auth?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const [summaryRes, prefRes, tasteRes, vectorRes] = await Promise.allSettled([
            selectUserStyleSummaryMaybeSingle(supabase, auth.user.id, "style_tags,mood_keywords,favorite_colors", "style_tags"),
            supabase
                .from("pref_profile")
                .select("silhouette,material,detail,pattern")
                .eq("user_id", auth.user.id)
                .maybeSingle(),
            supabase
                .from("taste_layers_cache")
                .select("layer_7d,layer_30d,layer_180d,updated_at")
                .eq("user_id", auth.user.id)
                .maybeSingle(),
            supabase
                .from("user_style_vector")
                .select("jp_3type,jp_7type,pc_season,pc_base")
                .eq("user_id", auth.user.id)
                .maybeSingle(),
        ]);

        const summary = pickData<{
            style_tags?: string[];
            mood_keywords?: string[];
            favorite_colors?: string[];
        }>("summary", summaryRes as PromiseSettledResult<QueryData<{ style_tags?: string[]; mood_keywords?: string[]; favorite_colors?: string[] }>>);
        const pref = pickData<{
            silhouette?: Record<string, number>;
            material?: Record<string, number>;
            detail?: Record<string, number>;
            pattern?: Record<string, number>;
        }>("pref_profile", prefRes);
        const taste = pickData<{
            layer_7d?: Record<string, number>;
            layer_30d?: Record<string, number>;
            layer_180d?: Record<string, number>;
            updated_at?: string | null;
        }>("taste_layers_cache", tasteRes);
        const vector = pickData<{
            jp_3type?: string | null;
            jp_7type?: string | null;
            pc_season?: string | null;
            pc_base?: string | null;
        }>("user_style_vector", vectorRes);

        const styleTags = unique(asStringArray(summary?.style_tags));
        const moodKeywords = unique(asStringArray(summary?.mood_keywords));
        const favoriteColors = unique(asStringArray(summary?.favorite_colors));

        const layers: TasteLayers = {
            layer_7d: Object.keys(asNumberRecord(taste?.layer_7d)).length
                ? asNumberRecord(taste?.layer_7d)
                : PRESENCE_API_FALLBACK.taste_layers!.layer_7d,
            layer_30d: Object.keys(asNumberRecord(taste?.layer_30d)).length
                ? asNumberRecord(taste?.layer_30d)
                : PRESENCE_API_FALLBACK.taste_layers!.layer_30d,
            layer_180d: Object.keys(asNumberRecord(taste?.layer_180d)).length
                ? asNumberRecord(taste?.layer_180d)
                : PRESENCE_API_FALLBACK.taste_layers!.layer_180d,
            updated_at: taste?.updated_at ?? PRESENCE_API_FALLBACK.taste_layers!.updated_at,
        };

        const lanes = deriveLanes(styleTags, layers);
        const likes = unique([
            ...styleTags.filter((tag) => !lanes.includes(tag)),
            ...moodKeywords,
            ...favoriteColors,
            ...topKeys(pref?.detail, 3),
            ...topKeys(pref?.pattern, 2),
            ...PRESENCE_API_FALLBACK.i_am!.likes,
        ]).slice(0, 8);

        const tags = unique([
            ...lanes,
            ...likes,
            ...topKeys(pref?.silhouette, 2),
            ...topKeys(pref?.material, 2),
            ...PRESENCE_API_FALLBACK.i_am!.tags,
        ]).slice(0, 16);

        const styleScoreBase =
            Math.min(35, lanes.length * 12) +
            Math.min(20, styleTags.length * 2) +
            Math.min(10, moodKeywords.length * 2) +
            Math.min(10, favoriteColors.length * 2);

        const styleScore = Math.max(
            PRESENCE_API_FALLBACK.style_dna!.style_score,
            Math.min(95, styleScoreBase)
        );

        const iAm: IAmProfile = {
            lanes,
            likes,
            avoid: PRESENCE_API_FALLBACK.i_am!.avoid,
            silhouette_pref: topKeys(pref?.silhouette, 1)[0] ?? PRESENCE_API_FALLBACK.i_am!.silhouette_pref,
            material_pref: topKeys(pref?.material, 1)[0] ?? PRESENCE_API_FALLBACK.i_am!.material_pref,
            tags,
        };

        const styleDna: StyleDna = {
            body_type: vector?.jp_3type ?? PRESENCE_API_FALLBACK.style_dna!.body_type,
            body_subtype: vector?.jp_7type ?? PRESENCE_API_FALLBACK.style_dna!.body_subtype,
            pc_season: vector?.pc_season ?? PRESENCE_API_FALLBACK.style_dna!.pc_season,
            pc_base: vector?.pc_base ?? PRESENCE_API_FALLBACK.style_dna!.pc_base,
            top_lanes: lanes.length ? lanes : PRESENCE_API_FALLBACK.style_dna!.top_lanes,
            style_score: styleScore,
        };

        const response: SeekResponse = {
            ok: true,
            enabled: true,
            i_am: iAm,
            style_dna: styleDna,
            seek: PRESENCE_API_FALLBACK.seek,
            taste_layers: layers,
        };

        return NextResponse.json(response, { status: 200 });
    } catch (error) {
        console.error("presence seek route failed", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
