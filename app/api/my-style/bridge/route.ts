import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { selectUserStyleSummaryMaybeSingle, upsertUserStyleSummary } from "@/lib/userStyleSummary";
import {
    createPortableStateSnapshot,
    deriveSyncSignals,
    hasMeaningfulState,
    isRecord,
    normalizeSavedState,
} from "@/app/my-style/_lib/state";
import type { SavedState } from "@/app/my-style/_lib/types";

export const runtime = "nodejs";

function topAxisKey(raw: unknown, fallback = "neutral") {
    if (!raw || typeof raw !== "object") return fallback;
    const entries = Object.entries(raw as Record<string, number>).sort((a, b) => Number(b[1] ?? 0) - Number(a[1] ?? 0));
    if (!entries.length) return fallback;
    return String(entries[0][0] ?? fallback);
}

function readServerSnapshot(raw: unknown): SavedState | null {
    if (!isRecord(raw)) return null;
    const maybeState = isRecord(raw.myStyleState) ? raw.myStyleState : null;
    if (!maybeState) return null;
    const normalized = normalizeSavedState(maybeState);
    // Return state if it has meaningful data OR a revision > 0 (intentional empty state).
    // Only return null for truly never-used state.
    if (hasMeaningfulState(normalized) || (normalized._revision ?? 0) > 0) return normalized;
    return null;
}

export async function GET() {
    try {
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();

        if (!auth?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const [styleSummaryRes, prefProfileRes, tasteLayersRes, styleVectorRes, personalColorRes, bodyProfileRes, stargazerProfileRes, stargazerTypesRes] = await Promise.all([
            selectUserStyleSummaryMaybeSingle(
                supabase,
                auth.user.id,
                "style_tags,wardrobe_colors,wardrobe_categories,quiz_result,mood_keywords,favorite_colors",
                "style_tags,wardrobe_colors,wardrobe_categories,quiz_result",
            ),
            supabase
                .from("pref_profile")
                .select("silhouette,material,detail,pattern")
                .eq("user_id", auth.user.id)
                .maybeSingle(),
            supabase
                .from("taste_layers_cache")
                .select("layer_7d,layer_30d,updated_at")
                .eq("user_id", auth.user.id)
                .maybeSingle(),
            supabase
                .from("user_style_vector")
                .select("pc_season,pc_base,jp_3type,jp_7type")
                .eq("user_id", auth.user.id)
                .maybeSingle(),
            supabase
                .from("user_personal_color_profiles")
                .select("cpv,labels,palette,photo_analysis")
                .eq("user_id", auth.user.id)
                .maybeSingle(),
            supabase
                .from("user_body_profiles")
                .select("cfv,display_labels")
                .eq("user_id", auth.user.id)
                .maybeSingle(),
            supabase
                .from("stargazer_personality_profile")
                .select("type_key,dimensions")
                .eq("user_id", auth.user.id)
                .maybeSingle(),
            supabase
                .from("stargazer_resolved_types")
                .select("archetype_code,archetype_label,axis_scores")
                .eq("user_id", auth.user.id)
                .maybeSingle(),
        ]);

        if (styleSummaryRes.error) throw styleSummaryRes.error;
        if (prefProfileRes.error) throw prefProfileRes.error;
        if (tasteLayersRes.error) throw tasteLayersRes.error;
        if (styleVectorRes.error) throw styleVectorRes.error;
        // Non-fatal: cross-feature data may not exist yet
        if (personalColorRes.error) console.warn("[my-style/bridge] personalColor read failed:", personalColorRes.error.message);
        const personalColor = personalColorRes.error ? null : personalColorRes.data;
        const bodyProfile = bodyProfileRes.error ? null : bodyProfileRes.data;
        const stargazerProfile = stargazerProfileRes.error ? null : stargazerProfileRes.data;
        const stargazerTypes = stargazerTypesRes.error ? null : stargazerTypesRes.data;

        const styleSummary = styleSummaryRes.data as Record<string, unknown> | null;
        const prefProfile = prefProfileRes.data;
        const tasteLayers = tasteLayersRes.data;
        const styleVector = styleVectorRes.data;
        const quizResult = isRecord(styleSummary?.quiz_result) ? styleSummary.quiz_result : {};
        const remoteState = readServerSnapshot(quizResult);

        // ── Diagnostic: wardrobe read-side ──
        const _savedAt = typeof quizResult.myStyleSavedAt === "string" ? quizResult.myStyleSavedAt : null;
        const _wardrobeLen = remoteState?.wardrobe?.length ?? 0;
        const _hasMyStyleState = isRecord(quizResult.myStyleState);
        console.log(`[bridge GET] hasMyStyleState=${_hasMyStyleState} wardrobeLen=${_wardrobeLen} savedAt=${_savedAt ?? "null"} remoteStateNull=${remoteState === null}`);
        if (_hasMyStyleState && _wardrobeLen === 0) {
            const raw = quizResult.myStyleState as Record<string, unknown>;
            console.warn(`[bridge GET] myStyleState exists but wardrobe empty — raw wardrobe type=${typeof raw.wardrobe}, isArray=${Array.isArray(raw.wardrobe)}, rawLen=${Array.isArray(raw.wardrobe) ? raw.wardrobe.length : "N/A"}`);
        }

        const laneTop3 = Array.isArray((tasteLayers?.layer_30d as Record<string, unknown> | null)?.lane_top3)
            ? ((tasteLayers?.layer_30d as Record<string, unknown>).lane_top3 as string[]).slice(0, 3)
            : [];
        const profile = remoteState ? deriveSyncSignals(remoteState).profile : null;

        return NextResponse.json({
            ok: true,
            remoteState,
            profile,
            selfProfile: profile?.exportProfile ?? null,
            syncedAt: typeof quizResult.myStyleSavedAt === "string" ? quizResult.myStyleSavedAt : null,
            pulse: {
                pcSeason: styleVector?.pc_season ?? null,
                pcBase: styleVector?.pc_base ?? null,
                bodyType: styleVector?.jp_3type ?? null,
                bodySubtype: styleVector?.jp_7type ?? null,
                laneTop3,
                colorAxis: topAxisKey((tasteLayers?.layer_30d as Record<string, unknown> | null)?.color_axis),
                silhouetteAxis: topAxisKey((tasteLayers?.layer_30d as Record<string, unknown> | null)?.silhouette_axis),
                styleTags: Array.isArray(styleSummary?.style_tags) ? styleSummary.style_tags : [],
                moodKeywords: Array.isArray(styleSummary?.mood_keywords) ? styleSummary.mood_keywords : [],
                wardrobeColors: Array.isArray(styleSummary?.wardrobe_colors) ? styleSummary.wardrobe_colors : [],
                favoriteColors: Array.isArray(styleSummary?.favorite_colors) ? styleSummary.favorite_colors : [],
                wardrobeCategories: isRecord(styleSummary?.wardrobe_categories) ? styleSummary.wardrobe_categories : {},
                prefProfile: {
                    silhouette: isRecord(prefProfile?.silhouette) ? prefProfile.silhouette : {},
                    material: isRecord(prefProfile?.material) ? prefProfile.material : {},
                    detail: isRecord(prefProfile?.detail) ? prefProfile.detail : {},
                    pattern: isRecord(prefProfile?.pattern) ? prefProfile.pattern : {},
                },
                tasteUpdatedAt: tasteLayers?.updated_at ?? null,
            },
            crossFeature: {
                personalColor: personalColor ? {
                    cpv: isRecord(personalColor.cpv) ? personalColor.cpv : null,
                    labels: isRecord(personalColor.labels) ? personalColor.labels : null,
                    palette: Array.isArray(personalColor.palette) ? personalColor.palette : null,
                    photo_analysis: isRecord(personalColor.photo_analysis) ? personalColor.photo_analysis : null,
                } : null,
                bodyProfile: bodyProfile ? {
                    cfv: isRecord(bodyProfile.cfv) ? bodyProfile.cfv : null,
                    displayLabels: isRecord(bodyProfile.display_labels) ? bodyProfile.display_labels : null,
                } : null,
                stargazer: stargazerProfile ? {
                    typeKey: stargazerProfile.type_key ?? null,
                    dimensions: isRecord(stargazerProfile.dimensions) ? stargazerProfile.dimensions : null,
                } : null,
                stargazerTypes: stargazerTypes ? {
                    archetypeCode: stargazerTypes.archetype_code ?? null,
                    archetypeLabel: stargazerTypes.archetype_label ?? null,
                    axisScores: isRecord(stargazerTypes.axis_scores) ? stargazerTypes.axis_scores : null,
                } : null,
            },
        });
    } catch (error) {
        console.error("my-style bridge GET error:", error);
        return NextResponse.json({ error: "Bridge fetch failed" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();

        if (!auth?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json().catch(() => null);
        const source = String(body?.source ?? "my-style");
        const state = normalizeSavedState(body?.state);

        // Accept empty state when revision > 0 — user intentionally deleted all items.
        // Only skip for truly virgin state (never used).
        if ((state._revision ?? 0) === 0 && !hasMeaningfulState(state)) {
            return NextResponse.json({ ok: true, skipped: true, reason: "empty_state" });
        }

        const derived = deriveSyncSignals(state);
        const { data: existingSummary, error: existingSummaryError } = await supabase
            .from("user_style_summary")
            .select("quiz_result")
            .eq("user_id", auth.user.id)
            .maybeSingle();

        if (existingSummaryError) throw existingSummaryError;

        const existingQuizResult = isRecord(existingSummary?.quiz_result) ? existingSummary.quiz_result : {};
        const savedAt = new Date().toISOString();
        const nextQuizResult = {
            ...existingQuizResult,
            myStyleState: createPortableStateSnapshot(derived.normalizedState),
            myStyleSavedAt: savedAt,
            myStyleSource: source,
            myStyleVersion: 3,
        };

        const styleSummaryPayload = {
            user_id: auth.user.id,
            style_tags: derived.summary.styleTags,
            wardrobe_colors: derived.summary.wardrobeColors,
            wardrobe_categories: derived.summary.wardrobeCategories,
            mood_keywords: derived.summary.moodKeywords,
            favorite_colors: derived.summary.favoriteColors,
            quiz_result: nextQuizResult,
        };

        const prefProfilePayload = {
            user_id: auth.user.id,
            silhouette: derived.prefProfile.silhouette,
            material: derived.prefProfile.material,
            detail: derived.prefProfile.detail,
            pattern: derived.prefProfile.pattern,
        };

        const results = await Promise.allSettled([
            upsertUserStyleSummary(supabase, styleSummaryPayload),
            supabase.from("pref_profile").upsert(prefProfilePayload, { onConflict: "user_id" }),
        ]);

        const labels = ["styleSummary", "prefProfile"] as const;
        const failures: string[] = [];
        for (let i = 0; i < results.length; i++) {
            const r = results[i];
            if (r.status === "rejected") {
                console.error(`[my-style/bridge] POST ${labels[i]} rejected:`, r.reason);
                failures.push(labels[i]);
            } else if (r.value?.error) {
                console.error(`[my-style/bridge] POST ${labels[i]} error:`, r.value.error);
                failures.push(labels[i]);
            }
        }

        if (failures.length === labels.length) {
            return NextResponse.json({ error: "All bridge writes failed", failures }, { status: 500 });
        }

        return NextResponse.json({
            ok: true,
            syncedAt: savedAt,
            summary: derived.summary,
            profile: derived.profile,
            selfProfile: derived.profile.exportProfile,
            ...(failures.length > 0 ? { partialFailures: failures } : {}),
        });
    } catch (error) {
        console.error("my-style bridge POST error:", error);
        return NextResponse.json({ error: "Bridge sync failed" }, { status: 500 });
    }
}
