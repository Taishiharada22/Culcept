import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import crypto from "crypto";
import path from "path";
import fs from "fs/promises";
import {
    INPUT_DIR,
    OUTPUT_DIR,
    ROOT,
    runVisionPipeline,
    upsertAvatarProfile,
} from "@/lib/body-color/pipeline";

export const runtime = "nodejs";

function extFromMime(mime: string) {
    const m = (mime || "").toLowerCase();
    if (m.includes("png")) return "png";
    if (m.includes("webp")) return "webp";
    if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
    return "png";
}

function normalizeUrls(urls: Record<string, any>) {
    return {
        person: urls.person ?? null,
        clothes: urls.clothes ?? null,
        mask: urls.mask ?? null,
        turntable: urls.turntable ?? null,
        mesh: urls.mesh ?? null,
    };
}

export async function GET(request: NextRequest) {
    try {
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();
        if (!auth?.user) {
            return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
        }

        const url = new URL(request.url);
        const jobId = url.searchParams.get("jobId") || url.searchParams.get("job_id");
        if (!jobId) {
            return NextResponse.json({ ok: false, error: "jobId is required" }, { status: 400 });
        }

        const { data: job, error } = await supabase
            .from("user_body_avatar_jobs")
            .select(
                "id,status,result_urls,warning,error,created_at,started_at,finished_at,run_id"
            )
            .eq("id", jobId)
            .eq("user_id", auth.user.id)
            .maybeSingle();

        if (error) {
            return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
        }
        if (!job) {
            return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
        }

        return NextResponse.json({ ok: true, job });
    } catch (error: any) {
        console.error("pipeline status error:", error);
        return NextResponse.json({ ok: false, error: String(error?.message ?? error) }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();
        if (!auth?.user) {
            return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
        }

        const url = new URL(request.url);
        const form = await request.formData();
        const file = form.get("file");
        const enable3d = String(form.get("enable3d") ?? "") === "1";
        const asyncFlag =
            String(url.searchParams.get("async") ?? form.get("async") ?? "") === "1";

        if (!file || typeof file === "string") {
            return NextResponse.json({ ok: false, error: "file is required" }, { status: 400 });
        }

        await fs.mkdir(INPUT_DIR, { recursive: true });
        await fs.mkdir(OUTPUT_DIR, { recursive: true });

        const runId = crypto.randomUUID();
        const ext = extFromMime(file.type || "");
        const inputPath = path.join(INPUT_DIR, `${auth.user.id}-${runId}.${ext}`);
        const outputDir = path.join(OUTPUT_DIR, auth.user.id, runId);
        const inputRel = path.relative(ROOT, inputPath);
        const outputRel = path.relative(ROOT, outputDir);

        await fs.mkdir(path.dirname(inputPath), { recursive: true });
        await fs.mkdir(outputDir, { recursive: true });
        const buffer = Buffer.from(await file.arrayBuffer());
        await fs.writeFile(inputPath, buffer);

        if (asyncFlag) {
            const { data: job, error: jobErr } = await supabase
                .from("user_body_avatar_jobs")
                .insert({
                    user_id: auth.user.id,
                    run_id: runId,
                    status: "queued",
                    input_path: inputRel,
                    output_dir: outputRel,
                    enable_3d: enable3d,
                    updated_at: new Date().toISOString(),
                })
                .select("id,status,created_at,run_id")
                .single();

            if (jobErr) {
                return NextResponse.json({ ok: false, error: jobErr.message }, { status: 400 });
            }

            return NextResponse.json({ ok: true, mode: "queued", job });
        }

        const { urls, meshWarning } = await runVisionPipeline({
            userId: auth.user.id,
            inputPath,
            outputDir,
            enable3d,
        });

        const upsertError = await upsertAvatarProfile(supabase, auth.user.id, urls);
        if (upsertError) {
            return NextResponse.json({ ok: false, error: upsertError }, { status: 400 });
        }

        return NextResponse.json({
            ok: true,
            urls: normalizeUrls(urls),
            mesh_warning: meshWarning,
        });
    } catch (error: any) {
        console.error("pipeline error:", error);
        return NextResponse.json({ ok: false, error: String(error?.message ?? error) }, { status: 500 });
    }
}
