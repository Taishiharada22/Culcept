// app/api/body-color/profile/route.ts
import { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { resolveShoeWidthCodeServer } from "@/lib/shoeWidthServer";
import { apiOk, apiUnauthorized, apiBadRequest, apiError, apiCatch } from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CFV_KEYS = [
    "vertical_line",
    "shoulder_width",
    "shoulder_slope",
    "ribcage_width",
    "torso_depth",
    "pelvis_width",
    "joint_size",
    "bone_sharpness",
    "leg_ratio",
    "arm_ratio",
    "waist_position",
    "posture_round_shoulders",
    "pelvic_tilt",
    "mobility_upper",
];

const CPV_KEYS = [
    "undertone",
    "value_L",
    "chroma_C",
    "clarity",
    "depth",
    "contrast",
    "skin_redness_a",
    "skin_yellowness_b",
    "temperature_stability",
    "confidence",
];

const MEASURE_KEYS = [
    "stature",
    "neck_circ",
    "shoulder_breadth",
    "shoulder",
    "chest_circ",
    "chest",
    "waist_circ",
    "waist",
    "hip_circ",
    "hip",
    "back_length",
    "sleeve_length",
    "sleeve",
    "inseam",
    "rise",
    "thigh_circ",
    "thigh",
    "calf_circ",
    "calf",
    "armhole_depth",
    "torso_depth",
    "foot_length_cm",
    "foot_girth_cm",
    "foot_width_cm",
];

function toNum(v: any): number | null {
    const n = typeof v === "number" ? v : Number(String(v ?? ""));
    return Number.isFinite(n) ? n : null;
}

function clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
}

function normalizeCFV(cfv: any) {
    const out: Record<string, number> = {};
    for (const key of CFV_KEYS) {
        const n = toNum(cfv?.[key]);
        if (n == null) continue;
        out[key] = clamp(n, 0, 2);
    }
    return out;
}

function normalizeCPV(cpv: any) {
    const out: Record<string, number> = {};
    for (const key of CPV_KEYS) {
        const n = toNum(cpv?.[key]);
        if (n == null) continue;

        if (key === "undertone") out[key] = clamp(n, -1, 1);
        else if (key === "value_L") out[key] = clamp(n, 0, 100);
        else if (key === "chroma_C") out[key] = clamp(n, 0, 200);
        else if (key === "clarity") out[key] = clamp(n, 0, 1);
        else if (key === "depth") out[key] = clamp(n, 0, 1);
        else if (key === "contrast") out[key] = clamp(n, 0, 1);
        else if (key === "skin_redness_a") out[key] = clamp(n, -128, 128);
        else if (key === "skin_yellowness_b") out[key] = clamp(n, -128, 128);
        else if (key === "temperature_stability") out[key] = clamp(n, 0, 1);
        else if (key === "confidence") out[key] = clamp(n, 0, 1);
        else out[key] = n;
    }
    return out;
}

function normalizeMeasurements(measurements: any) {
    const out: Record<string, number> = {};
    for (const key of MEASURE_KEYS) {
        const n = toNum(measurements?.[key]);
        if (n == null) continue;
        out[key] = n;
    }
    return out;
}

function hasValues(obj: Record<string, any>) {
    return Object.values(obj).some((v) => v !== undefined && v !== null && v !== "");
}

function cleanObject(obj: Record<string, any>) {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj ?? {})) {
        if (v === undefined || v === null || v === "") continue;
        out[k] = v;
    }
    return out;
}

export async function GET(request: NextRequest) {
    try {
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();
        if (!auth?.user) {
            return apiUnauthorized();
        }

        const { searchParams } = new URL(request.url);
        const wantHistory = searchParams.get("history") === "true";

        const [bodyRes, colorRes, measurementRes, avatarRes] = await Promise.all([
            supabase.from("user_body_profiles").select("*").eq("user_id", auth.user.id).maybeSingle(),
            supabase
                .from("user_personal_color_profiles")
                .select("user_id,cpv,labels,palette,photo_analysis,updated_at")
                .eq("user_id", auth.user.id)
                .maybeSingle(),
            supabase
                .from("user_body_measurements")
                .select("*")
                .eq("user_id", auth.user.id)
                .order("measured_at", { ascending: false })
                .limit(1),
            supabase.from("user_body_avatar_profiles").select("*").eq("user_id", auth.user.id).maybeSingle(),
        ]);

        const measurement = measurementRes.data?.[0] ?? null;

        // 計測履歴（オプション）
        let measurementHistory: Array<{ measurements: Record<string, unknown>; measured_at: string }> | null = null;
        if (wantHistory) {
            const historyRes = await supabase
                .from("user_body_measurements")
                .select("measurements, measured_at")
                .eq("user_id", auth.user.id)
                .order("measured_at", { ascending: true })
                .limit(50);
            measurementHistory = (historyRes.data ?? []).map((row) => ({
                measurements: (row.measurements ?? {}) as Record<string, unknown>,
                measured_at: row.measured_at as string,
            }));
        }

        // DEBUG: GET return直前 — DB row と返却JSONの photo_analysis を確認
        const colorRow = colorRes.data;
        console.info("[COLOR-TRACE] GET color_profile row:", {
            hasRow: !!colorRow,
            rowKeys: colorRow ? Object.keys(colorRow) : null,
            hasPhotoAnalysis: !!colorRow?.photo_analysis,
            photoAnalysisType: typeof colorRow?.photo_analysis,
            photoAnalysisKeys: colorRow?.photo_analysis ? Object.keys(colorRow.photo_analysis as Record<string, unknown>) : null,
        });

        return apiOk({
            body_profile: bodyRes.data ?? null,
            color_profile: colorRes.data ?? null,
            measurement: measurement?.measurements ?? null,
            measured_at: measurement?.measured_at ?? null,
            avatar_profile: avatarRes.data ?? null,
            ...(measurementHistory ? { measurement_history: measurementHistory } : {}),
        });
    } catch (error) {
        return apiCatch(error, "GET /api/body-color/profile");
    }
}

export async function POST(request: NextRequest) {
    try {
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();
        if (!auth?.user) {
            return apiUnauthorized();
        }

        const payload = await request.json().catch(() => ({}));
        const bodyProfile = payload?.body_profile ?? {};
        const colorProfile = payload?.color_profile ?? {};
        const measurements = payload?.measurements ?? {};
        const avatarAssets = payload?.avatar_assets ?? {};
        const photoColorAnalysis = payload?.photo_color_analysis ?? null;

        const [existingBodyProfileRes, latestMeasurementRes, existingColorProfileRes] = await Promise.all([
            supabase
                .from("user_body_profiles")
                .select("cfv,display_labels,confidence")
                .eq("user_id", auth.user.id)
                .maybeSingle(),
            supabase
                .from("user_body_measurements")
                .select("measurements")
                .eq("user_id", auth.user.id)
                .order("measured_at", { ascending: false })
                .limit(1),
            supabase
                .from("user_personal_color_profiles")
                .select("cpv,labels,palette")
                .eq("user_id", auth.user.id)
                .maybeSingle(),
        ]);

        const existingBodyProfile = existingBodyProfileRes.data ?? null;
        const latestMeasurement = latestMeasurementRes.data?.[0]?.measurements ?? {};
        const existingColorProfile = existingColorProfileRes.data ?? null;

        const cfv = {
            ...(existingBodyProfile?.cfv ?? {}),
            ...normalizeCFV(bodyProfile.cfv ?? {}),
        };
        const display_labels = {
            ...(existingBodyProfile?.display_labels ?? {}),
            ...cleanObject(bodyProfile.display_labels ?? {}),
        };
        const body_confidence = {
            ...(existingBodyProfile?.confidence ?? {}),
            ...cleanObject(bodyProfile.confidence ?? {}),
        };

        const cpv = {
            ...(existingColorProfile?.cpv ?? {}),
            ...normalizeCPV(colorProfile.cpv ?? {}),
        };
        const labels = {
            ...(existingColorProfile?.labels ?? {}),
            ...cleanObject(colorProfile.labels ?? {}),
        };
        const palette = {
            ...(existingColorProfile?.palette ?? {}),
            ...cleanObject(colorProfile.palette ?? {}),
        };

        const measurementData = normalizeMeasurements(measurements ?? {});
        const mergedMeasurements = {
            ...(latestMeasurement ?? {}),
            ...measurementData,
        };

        const derivedWidthResult = await resolveShoeWidthCodeServer({
            audience: display_labels.derived_width_audience,
            footLengthCm: mergedMeasurements.foot_length_cm,
            footGirthCm: mergedMeasurements.foot_girth_cm,
        }).catch(() => null);

        if (derivedWidthResult?.widthCode) {
            display_labels.derived_width_size = derivedWidthResult.widthCode;
            display_labels.derived_width_audience = derivedWidthResult.audience;
        }

        // Supabaseのクエリビルダーは thenable だが Promise 型ではないため、
        // Promise.resolve(...) で本物の Promise に変換して tasks に積む。
        const tasks: Promise<any>[] = [];

        if (hasValues(cfv) || hasValues(display_labels) || hasValues(body_confidence)) {
            tasks.push(
                Promise.resolve(
                    supabase.from("user_body_profiles").upsert(
                        {
                            user_id: auth.user.id,
                            cfv,
                            display_labels,
                            confidence: body_confidence,
                            updated_at: new Date().toISOString(),
                        },
                        { onConflict: "user_id" }
                    )
                )
            );
        }

        if (hasValues(cpv) || hasValues(labels) || hasValues(palette) || photoColorAnalysis) {
            const colorRow: Record<string, any> = {
                user_id: auth.user.id,
                updated_at: new Date().toISOString(),
            };
            if (hasValues(cpv)) colorRow.cpv = cpv;
            if (hasValues(labels)) colorRow.labels = labels;
            if (hasValues(palette)) colorRow.palette = palette;
            if (photoColorAnalysis) colorRow.photo_analysis = photoColorAnalysis;
            tasks.push(
                Promise.resolve(
                    supabase.from("user_personal_color_profiles").upsert(
                        colorRow,
                        { onConflict: "user_id" }
                    )
                )
            );
        }

        if (hasValues(measurementData)) {
            tasks.push(
                Promise.resolve(
                    supabase.from("user_body_measurements").insert({
                        user_id: auth.user.id,
                        measurements: measurementData,
                    })
                )
            );
        }

        if (hasValues(cleanObject(avatarAssets))) {
            const existing = await supabase
                .from("user_body_avatar_profiles")
                .select("views")
                .eq("user_id", auth.user.id)
                .maybeSingle();

            const cleanAssets = cleanObject(avatarAssets);

            tasks.push(
                Promise.resolve(
                    supabase.from("user_body_avatar_profiles").upsert(
                        {
                            user_id: auth.user.id,
                            views: existing?.data?.views ?? {},
                            person_cutout_url: cleanAssets.person_cutout_url ?? null,
                            clothes_cutout_url: cleanAssets.clothes_cutout_url ?? null,
                            mask_clothes_url: cleanAssets.mask_clothes_url ?? null,
                            turntable_gif_url: cleanAssets.turntable_gif_url ?? null,
                            mesh_glb_url: cleanAssets.mesh_glb_url ?? null,
                            updated_at: new Date().toISOString(),
                        },
                        { onConflict: "user_id" }
                    )
                )
            );
        }

        if (tasks.length === 0) {
            return apiBadRequest("No data to save");
        }

        const settled = await Promise.allSettled(tasks);
        const failures: string[] = [];
        for (let i = 0; i < settled.length; i++) {
            const r = settled[i];
            if (r.status === "rejected") {
                console.error(`[body-color/profile] POST task ${i} rejected:`, r.reason);
                failures.push(`task_${i}: ${String(r.reason)}`);
            } else if (r.value?.error) {
                console.error(`[body-color/profile] POST task ${i} error:`, r.value.error.message);
                failures.push(`task_${i}: ${String(r.value.error.message)}`);
            }
        }
        if (failures.length === settled.length) {
            return apiBadRequest(`All save operations failed: ${failures.join("; ")}`);
        }

        // DEBUG: POST直後にDBの photo_analysis 実値を確認
        const verifyRow = await supabase
            .from("user_personal_color_profiles")
            .select("photo_analysis")
            .eq("user_id", auth.user.id)
            .maybeSingle();
        console.info("[COLOR-TRACE] POST verify DB photo_analysis:", {
            hasValue: !!verifyRow.data?.photo_analysis,
            type: typeof verifyRow.data?.photo_analysis,
            keys: verifyRow.data?.photo_analysis ? Object.keys(verifyRow.data.photo_analysis) : null,
            error: verifyRow.error?.message ?? null,
        });

        return apiOk({ saved: true, ...(failures.length > 0 ? { partialFailures: failures } : {}) });
    } catch (error) {
        return apiCatch(error, "POST /api/body-color/profile");
    }
}
