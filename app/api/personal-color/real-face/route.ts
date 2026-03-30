import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { buildRealFaceDiagnosis, REAL_FACE_PC_QUESTIONS } from "@/lib/realFacePersonalColor";
import { mergeRealFaceMeta, readRealFaceMeta } from "@/lib/realFaceStorage";

export const runtime = "nodejs";

function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
}

export async function POST(request: NextRequest) {
    try {
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();
        if (!auth?.user) {
            return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json().catch(() => ({}));
        const answers = Array.isArray(body?.answers) ? body.answers : [];
        const minRequiredAnswers = Math.max(8, Math.ceil(REAL_FACE_PC_QUESTIONS.length * 0.5));
        const answeredCount = answers.filter((answer: any) => answer?.selectedSide && answer.selectedSide !== "tie").length;

        if (answeredCount < minRequiredAnswers) {
            return NextResponse.json(
                { ok: false, error: `回答数が不足しています (${answeredCount}/${minRequiredAnswers})` },
                { status: 400 }
            );
        }

        const [avatarRes, colorRes] = await Promise.all([
            supabase
                .from("user_body_avatar_profiles")
                .select("*")
                .eq("user_id", auth.user.id)
                .maybeSingle(),
            supabase
                .from("user_personal_color_profiles")
                .select("cpv,labels,palette")
                .eq("user_id", auth.user.id)
                .maybeSingle(),
        ]);

        const avatarProfile = avatarRes.data;
        const meta = readRealFaceMeta(avatarProfile?.views);

        if (!meta.normalizedRealFace) {
            return NextResponse.json(
                { ok: false, error: "診断用の実顔写真が未設定です" },
                { status: 400 }
            );
        }

        const diagnosis = buildRealFaceDiagnosis(answers);
        const updatedAt = new Date().toISOString();

        const nextViews = mergeRealFaceMeta(avatarProfile?.views, {
            diagnosisResult: {
                ...diagnosis,
                capture_image_ref: meta.normalizedRealFace,
                created_at: updatedAt,
            },
            answerLogs: diagnosis.answerLogs,
            updatedAt,
        });
        const nextAvatarProfile = {
            ...(avatarProfile ?? {}),
            user_id: auth.user.id,
            views: nextViews,
            person_cutout_url: avatarProfile?.person_cutout_url ?? null,
            clothes_cutout_url: avatarProfile?.clothes_cutout_url ?? null,
            mask_clothes_url: avatarProfile?.mask_clothes_url ?? null,
            turntable_gif_url: avatarProfile?.turntable_gif_url ?? null,
            mesh_glb_url: avatarProfile?.mesh_glb_url ?? null,
            updated_at: updatedAt,
        };

        const cpv = {
            ...(colorRes.data?.cpv ?? {}),
            undertone: clamp(
                diagnosis.temp_score / Math.max(diagnosis.warm_score + diagnosis.cool_score, 1),
                -1,
                1
            ),
            value_L: clamp(
                50 + (diagnosis.value_score / Math.max(diagnosis.light_score + diagnosis.deep_score, 1)) * 25,
                0,
                100
            ),
            chroma_C: clamp(
                60 + (diagnosis.chroma_score / Math.max(diagnosis.clear_score + diagnosis.soft_score, 1)) * 40,
                0,
                200
            ),
            clarity: clamp(
                diagnosis.clear_score / Math.max(diagnosis.clear_score + diagnosis.soft_score, 1),
                0,
                1
            ),
            depth: clamp(
                diagnosis.deep_score / Math.max(diagnosis.light_score + diagnosis.deep_score, 1),
                0,
                1
            ),
            contrast: clamp(
                diagnosis.contour_score / Math.max(REAL_FACE_PC_QUESTIONS.length / 4, 1),
                0,
                1
            ),
            confidence: diagnosis.confidence,
        };

        const labels = {
            ...(colorRes.data?.labels ?? {}),
            season4: diagnosis.season_primary,
            season12: `${diagnosis.season_primary}_${diagnosis.season_secondary}`,
            season16: `${diagnosis.season_primary}_${diagnosis.attributeSummary.chroma}`,
        };

        const results = await Promise.all([
            supabase.from("user_body_avatar_profiles").upsert(
                {
                    user_id: auth.user.id,
                    views: nextViews,
                    person_cutout_url: avatarProfile?.person_cutout_url ?? null,
                    clothes_cutout_url: avatarProfile?.clothes_cutout_url ?? null,
                    mask_clothes_url: avatarProfile?.mask_clothes_url ?? null,
                    turntable_gif_url: avatarProfile?.turntable_gif_url ?? null,
                    mesh_glb_url: avatarProfile?.mesh_glb_url ?? null,
                    updated_at: updatedAt,
                },
                { onConflict: "user_id" }
            ),
            supabase.from("user_personal_color_profiles").upsert(
                {
                    user_id: auth.user.id,
                    cpv,
                    labels,
                    palette: colorRes.data?.palette ?? {},
                    updated_at: updatedAt,
                },
                { onConflict: "user_id" }
            ),
        ]);

        const error = results.find((result) => result.error)?.error;
        if (error) {
            return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
        }

        return NextResponse.json({
            ok: true,
            result: diagnosis,
            avatar_profile: nextAvatarProfile,
            saved_at: updatedAt,
        });
    } catch (error) {
        console.error("real-face diagnosis POST error:", error);
        return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
    }
}
