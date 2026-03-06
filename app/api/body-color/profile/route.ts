import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

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

export async function GET() {
    try {
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();
        if (!auth?.user) {
            return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
        }

        const [bodyRes, colorRes, measurementRes, avatarRes] = await Promise.all([
            supabase.from("user_body_profiles").select("*").eq("user_id", auth.user.id).maybeSingle(),
            supabase.from("user_personal_color_profiles").select("*").eq("user_id", auth.user.id).maybeSingle(),
            supabase
                .from("user_body_measurements")
                .select("*")
                .eq("user_id", auth.user.id)
                .order("measured_at", { ascending: false })
                .limit(1),
            supabase.from("user_body_avatar_profiles").select("*").eq("user_id", auth.user.id).maybeSingle(),
        ]);

        const measurement = measurementRes.data?.[0] ?? null;

        return NextResponse.json({
            ok: true,
            body_profile: bodyRes.data ?? null,
            color_profile: colorRes.data ?? null,
            measurement: measurement?.measurements ?? null,
            measured_at: measurement?.measured_at ?? null,
            avatar_profile: avatarRes.data ?? null,
        });
    } catch (error) {
        console.error("body-color profile GET error:", error);
        return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();
        if (!auth?.user) {
            return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
        }

        const payload = await request.json().catch(() => ({}));
        const bodyProfile = payload?.body_profile ?? {};
        const colorProfile = payload?.color_profile ?? {};
        const measurements = payload?.measurements ?? {};
        const avatarAssets = payload?.avatar_assets ?? {};

        const cfv = normalizeCFV(bodyProfile.cfv ?? {});
        const display_labels = cleanObject(bodyProfile.display_labels ?? {});
        const body_confidence = cleanObject(bodyProfile.confidence ?? {});

        const cpv = normalizeCPV(colorProfile.cpv ?? {});
        const labels = cleanObject(colorProfile.labels ?? {});
        const palette = cleanObject(colorProfile.palette ?? {});

        const measurementData = normalizeMeasurements(measurements ?? {});

        const tasks: Promise<any>[] = [];

        if (hasValues(cfv) || hasValues(display_labels) || hasValues(body_confidence)) {
            tasks.push(
                supabase.from("user_body_profiles").upsert(
                    {
                        user_id: auth.user.id,
                        cfv: cfv,
                        display_labels,
                        confidence: body_confidence,
                        updated_at: new Date().toISOString(),
                    },
                    { onConflict: "user_id" }
                )
            );
        }

        if (hasValues(cpv) || hasValues(labels) || hasValues(palette)) {
            tasks.push(
                supabase.from("user_personal_color_profiles").upsert(
                    {
                        user_id: auth.user.id,
                        cpv,
                        labels,
                        palette,
                        updated_at: new Date().toISOString(),
                    },
                    { onConflict: "user_id" }
                )
            );
        }

        if (hasValues(measurementData)) {
            tasks.push(
                supabase.from("user_body_measurements").insert({
                    user_id: auth.user.id,
                    measurements: measurementData,
                })
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
            );
        }

        if (tasks.length === 0) {
            return NextResponse.json({ ok: false, error: "No data to save" }, { status: 400 });
        }

        const results = await Promise.all(tasks);
        const err = results.find((r) => r?.error)?.error;
        if (err) {
            return NextResponse.json({ ok: false, error: String(err.message ?? err) }, { status: 400 });
        }

        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error("body-color profile POST error:", error);
        return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
    }
}
