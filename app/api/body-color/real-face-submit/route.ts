import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { completeRealFaceSession, getRealFaceSession } from "@/lib/realFaceSessions";
import {
    clearRealFaceMeta,
    mergeRealFaceMeta,
    type RealFaceCaptureMethod,
    type RealFaceCheckResult,
} from "@/lib/realFaceStorage";
import { optimizeImageForUpload } from "@/lib/body/imageOptimization";
import { retryUpload } from "@/lib/body/uploadRetry";
import { BodyColorError } from "@/lib/body/errors";
import { validateRealFaceSubmitInput } from "@/lib/body/validation";

export const runtime = "nodejs";
export const maxDuration = 30;

const BUCKET = process.env.SUPABASE_BODY_BUCKET || "body-avatars";

let bucketVerified = false;

async function ensureBucket() {
    if (bucketVerified) return;
    try {
        const { error } = await supabaseAdmin.storage.getBucket(BUCKET);
        if (error) {
            // バケットが存在しない場合は作成を試みる
            console.warn(`[real-face-submit] bucket "${BUCKET}" not found, creating...`);
            const { error: createError } = await supabaseAdmin.storage.createBucket(BUCKET, {
                public: true,
                fileSizeLimit: 20 * 1024 * 1024, // 20MB
                allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
            });
            if (createError && !createError.message?.includes("already exists")) {
                console.error(`[real-face-submit] bucket creation failed:`, createError.message);
                throw new BodyColorError("UPLOAD_FAILED", `ストレージバケットの初期化に失敗しました: ${createError.message}`);
            }
        }
        bucketVerified = true;
    } catch (err) {
        if (err instanceof BodyColorError) throw err;
        console.error(`[real-face-submit] bucket check error:`, err);
        // バケット確認に失敗してもアップロードは試行する
    }
}

async function uploadDataUrl(userId: string, kind: "original" | "normalized", dataUrl: string) {
    // バケット存在確認（初回のみ）
    await ensureBucket();

    // 画像最適化（WebP変換 + リサイズ）
    const optimized = await optimizeImageForUpload(dataUrl);
    if (!optimized) {
        throw new BodyColorError("INVALID_INPUT", "画像データの解析に失敗しました");
    }

    const path = `real-face/${userId}/${kind}-${Date.now()}.${optimized.extension}`;

    // リトライ付きアップロード
    await retryUpload(async () => {
        const { error } = await supabaseAdmin.storage.from(BUCKET).upload(path, optimized.buffer, {
            contentType: optimized.mimeType,
            upsert: true,
            cacheControl: "3600",
        });
        if (error) {
            console.error(`[real-face-submit] upload error (${kind}):`, error.message);
            throw new Error(error.message);
        }
    });

    const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
    if (!data?.publicUrl) {
        throw new BodyColorError("UPLOAD_FAILED", "公開URLの取得に失敗しました");
    }

    return data.publicUrl;
}

export async function POST(request: NextRequest) {
    try {
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();

        const body = await request.json().catch(() => ({}));

        // 入力バリデーション
        let validated;
        try {
            validated = validateRealFaceSubmitInput(body);
        } catch (err) {
            if (err instanceof BodyColorError) return err.toResponse();
            return NextResponse.json({ ok: false, error: "入力内容に問題があります" }, { status: 400 });
        }

        const token = validated.captureSessionToken;
        const session = await getRealFaceSession(token);

        const userId = auth?.user?.id ?? session?.userId ?? null;
        if (!userId) {
            return new BodyColorError("UNAUTHORIZED").toResponse();
        }

        const { originalImageData, normalizedImageData, captureMethod } = validated;

        const [existingProfileRes, originalImageUrl, normalizedImageUrl] = await Promise.all([
            supabaseAdmin
                .from("user_body_avatar_profiles")
                .select("*")
                .eq("user_id", userId)
                .maybeSingle(),
            originalImageData ? uploadDataUrl(userId, "original", originalImageData) : Promise.resolve<string | null>(null),
            uploadDataUrl(userId, "normalized", normalizedImageData),
        ]);

        const existingProfile = existingProfileRes.data ?? null;

        const fitCheckResult = (body?.fitCheckResult ?? null) as RealFaceCheckResult | null;
        const brightnessCheckResult = (body?.brightnessCheckResult ?? null) as RealFaceCheckResult | null;
        const poseCheckResult = (body?.poseCheckResult ?? null) as RealFaceCheckResult | null;
        const updatedAt = new Date().toISOString();

        const nextViews = mergeRealFaceMeta(existingProfile?.views, {
            originalImage: originalImageUrl ?? undefined,
            normalizedRealFace: normalizedImageUrl,
            captureMethod,
            captureSessionToken: token,
            fitCheckResult,
            brightnessCheckResult,
            poseCheckResult,
            isNormalized: true,
            updatedAt,
        });

        const { error } = await supabaseAdmin
            .from("user_body_avatar_profiles")
            .upsert(
                {
                    user_id: userId,
                    views: nextViews,
                    person_cutout_url: existingProfile?.person_cutout_url ?? null,
                    clothes_cutout_url: existingProfile?.clothes_cutout_url ?? null,
                    mask_clothes_url: existingProfile?.mask_clothes_url ?? null,
                    turntable_gif_url: existingProfile?.turntable_gif_url ?? null,
                    mesh_glb_url: existingProfile?.mesh_glb_url ?? null,
                    updated_at: updatedAt,
                },
                { onConflict: "user_id" }
            );

        if (error) {
            return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
        }

        if (token) {
            await completeRealFaceSession(token, {
                originalImage: originalImageUrl ?? null,
                normalizedRealFace: normalizedImageUrl,
                captureMethod,
                captureSessionToken: token,
                fitCheckResult,
                brightnessCheckResult,
                poseCheckResult,
                isNormalized: true,
                updatedAt,
            });
        }

        return NextResponse.json({
            ok: true,
            avatar_profile: {
                ...(existingProfile ?? {}),
                user_id: userId,
                views: nextViews,
                updated_at: updatedAt,
            },
        });
    } catch (error) {
        console.error("real-face submit POST error:", error);
        return NextResponse.json(
            { ok: false, error: error instanceof Error ? error.message : "Internal error" },
            { status: 500 }
        );
    }
}

export async function DELETE() {
    try {
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();
        if (!auth?.user) {
            return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
        }

        const existingProfileRes = await supabaseAdmin
            .from("user_body_avatar_profiles")
            .select("*")
            .eq("user_id", auth.user.id)
            .maybeSingle();

        const existingProfile = existingProfileRes.data;
        const nextViews = clearRealFaceMeta(existingProfile?.views);
        const updatedAt = new Date().toISOString();

        const { error } = await supabaseAdmin
            .from("user_body_avatar_profiles")
            .upsert(
                {
                    user_id: auth.user.id,
                    views: nextViews,
                    person_cutout_url: existingProfile?.person_cutout_url ?? null,
                    clothes_cutout_url: existingProfile?.clothes_cutout_url ?? null,
                    mask_clothes_url: existingProfile?.mask_clothes_url ?? null,
                    turntable_gif_url: existingProfile?.turntable_gif_url ?? null,
                    mesh_glb_url: existingProfile?.mesh_glb_url ?? null,
                    updated_at: updatedAt,
                },
                { onConflict: "user_id" }
            );

        if (error) {
            return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
        }

        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error("real-face submit DELETE error:", error);
        return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
    }
}
