import type { SupabaseClient } from "@supabase/supabase-js";
import { getStyleLane } from "@/lib/profile/registry";
import { selectUserStyleSummaryMaybeSingle } from "@/lib/userStyleSummary";

export type CollabAneuraSignals = {
    userId: string | null;
    isPersonalized: boolean;
    laneTop3: string[];
    moodKeywords: string[];
    overallSync: number | null;
    archetypeLabel: string | null;
    bodyType: string | null;
    summary: string;
};

const LANE_ALIASES: Record<string, string> = {
    officecasual: "office_casual",
    office_casual: "office_casual",
    office: "office_casual",
    korean: "korean_fashion",
    koreanfashion: "korean_fashion",
    cleancasual: "clean_casual",
};

function safeText(value: unknown) {
    return String(value ?? "").trim();
}

function normalizeKeyword(value: unknown) {
    return safeText(value).toLowerCase().replace(/[\s_-]+/g, "");
}

function normalizeLaneId(value: unknown) {
    const raw = normalizeKeyword(value);
    if (!raw) return "";
    return LANE_ALIASES[raw] ?? raw;
}

function isMissingSchema(error: any) {
    const code = safeText(error?.code);
    const message = safeText(error?.message).toLowerCase();
    return code === "42P01" || code === "42703" || message.includes("does not exist");
}

function uniqueStrings(values: unknown[], limit = 6) {
    const seen = new Set<string>();
    for (const value of values) {
        const normalized = safeText(value);
        if (!normalized) continue;
        seen.add(normalized);
        if (seen.size >= limit) break;
    }
    return Array.from(seen);
}

export async function loadCollabAneuraSignals(
    supabase: SupabaseClient,
    userId: string | null | undefined
): Promise<CollabAneuraSignals> {
    const resolvedUserId = safeText(userId) || null;
    if (!resolvedUserId) {
        return {
            userId: null,
            isPersonalized: false,
            laneTop3: [],
            moodKeywords: [],
            overallSync: null,
            archetypeLabel: null,
            bodyType: null,
            summary: "ログインすると Aneurasync の観測データで Collab が最適化されます。",
        };
    }

    const [
        tasteLayersRes,
        styleSummaryRes,
        syncLevelRes,
        coreStarRes,
        styleVectorRes,
    ] = await Promise.all([
        supabase
            .from("taste_layers_cache")
            .select("layer_30d")
            .eq("user_id", resolvedUserId)
            .maybeSingle(),
        selectUserStyleSummaryMaybeSingle(supabase, resolvedUserId, "mood_keywords", "user_id"),
        supabase
            .from("personality_sync_level")
            .select("overall_sync")
            .eq("user_id", resolvedUserId)
            .maybeSingle(),
        supabase
            .from("stargazer_core_star")
            .select("archetype_label")
            .eq("user_id", resolvedUserId)
            .maybeSingle(),
        supabase
            .from("user_style_vector")
            .select("jp_3type")
            .eq("user_id", resolvedUserId)
            .maybeSingle(),
    ]);

    for (const res of [tasteLayersRes, styleSummaryRes, syncLevelRes, coreStarRes, styleVectorRes]) {
        if (res.error && !isMissingSchema(res.error)) {
            throw res.error;
        }
    }

    const rawLaneTop3 = Array.isArray((tasteLayersRes.data?.layer_30d as any)?.lane_top3)
        ? ((tasteLayersRes.data?.layer_30d as any).lane_top3 as unknown[])
        : [];

    const laneTop3 = uniqueStrings(
        rawLaneTop3
            .map((value) => normalizeLaneId(value))
            .filter(Boolean)
            .map((laneId) => getStyleLane(laneId)?.id ?? laneId),
        3
    );

    const styleSummaryData = styleSummaryRes.data as Record<string, unknown> | null;
    const moodKeywords = uniqueStrings(
        Array.isArray(styleSummaryData?.mood_keywords)
            ? (styleSummaryData?.mood_keywords as string[])
            : [],
        6
    );

    const overallSyncRaw = Number(syncLevelRes.data?.overall_sync ?? NaN);
    const overallSync = Number.isFinite(overallSyncRaw) ? Math.max(0, Math.min(100, Math.round(overallSyncRaw))) : null;
    const archetypeLabel = safeText(coreStarRes.data?.archetype_label) || null;
    const bodyType = safeText(styleVectorRes.data?.jp_3type) || null;
    const primaryLane = laneTop3[0] ? getStyleLane(laneTop3[0]) : undefined;

    const summaryParts = [
        primaryLane ? `Top lane: ${primaryLane.label}` : "",
        overallSync != null ? `Sync ${overallSync}%` : "",
        archetypeLabel ? `Archetype ${archetypeLabel}` : "",
    ].filter(Boolean);

    return {
        userId: resolvedUserId,
        isPersonalized: laneTop3.length > 0 || overallSync != null || !!archetypeLabel || moodKeywords.length > 0,
        laneTop3,
        moodKeywords,
        overallSync,
        archetypeLabel,
        bodyType,
        summary: summaryParts.join(" / ") || "Aneurasync 観測はまだ浅めです。探索結果を増やすと精度が上がります。",
    };
}

export function buildCollabAneuraAffinity(args: {
    laneId: string;
    themeTags: string[];
    signals: CollabAneuraSignals;
}) {
    const laneId = normalizeLaneId(args.laneId);
    const lane = getStyleLane(laneId);
    const normalizedThemeTags = args.themeTags.map((tag) => normalizeKeyword(tag)).filter(Boolean);
    const normalizedMoodKeywords = args.signals.moodKeywords.map((tag) => normalizeKeyword(tag)).filter(Boolean);
    const laneIndex = args.signals.laneTop3.findIndex((candidate) => candidate === laneId);
    const laneBoost = laneIndex === 0 ? 28 : laneIndex === 1 ? 18 : laneIndex === 2 ? 12 : 0;
    const moodOverlap = normalizedThemeTags.filter((tag) => normalizedMoodKeywords.includes(tag)).length;
    const moodBoost = Math.min(14, moodOverlap * 7);
    const syncBoost = args.signals.overallSync != null ? Math.round(args.signals.overallSync / 8) : 0;
    const baseScore = args.signals.isPersonalized ? 56 : 48;
    const score = Math.max(40, Math.min(97, baseScore + laneBoost + moodBoost + syncBoost));

    let reason = "Aneurasync: 現在の観測データで探索候補に入っています。";
    if (laneBoost > 0 && lane) {
        reason = `Aneurasync: 30日レーンが ${lane.label} に寄っているため優先表示しています。`;
    } else if (moodBoost > 0) {
        reason = "Aneurasync: 最近の mood keyword とドロップテーマが重なっています。";
    } else if (args.signals.archetypeLabel) {
        const label = args.signals.archetypeLabel;
        reason = `Aneurasync: ${label} フェーズで相性が出やすい企画です。`;
    }

    return {
        score,
        reason,
        matchedLanes: args.signals.laneTop3.filter((candidate) => candidate === laneId),
    };
}
