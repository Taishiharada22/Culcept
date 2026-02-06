import "server-only";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
    runVisionPipeline,
    upsertAvatarProfile,
    toAbsPath,
} from "@/lib/body-color/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthed(req: Request) {
    const url = new URL(req.url);
    const q = url.searchParams.get("secret");
    const h = req.headers.get("x-cron-secret");
    const vercelCron = req.headers.get("x-vercel-cron") === "1";
    const secret = process.env.CRON_SECRET || "";
    if (vercelCron) return true;
    if (!secret) return false;
    return q === secret || h === secret;
}

export async function GET(req: Request) {
    try {
        if (!isAuthed(req)) {
            return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
        }

        const url = new URL(req.url);
        const limitParam = Number(url.searchParams.get("limit") ?? "3");
        const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 10) : 3;

        const { data: jobs, error: jobError } = await supabaseAdmin
            .from("user_body_avatar_jobs")
            .select("*")
            .eq("status", "queued")
            .order("created_at", { ascending: true })
            .limit(limit);

        if (jobError) throw jobError;

        let processed = 0;
        let done = 0;
        let failed = 0;

        for (const job of jobs ?? []) {
            const nowIso = new Date().toISOString();
            const { data: claimed } = await supabaseAdmin
                .from("user_body_avatar_jobs")
                .update({ status: "running", started_at: nowIso, updated_at: nowIso })
                .eq("id", job.id)
                .eq("status", "queued")
                .select("id")
                .maybeSingle();

            if (!claimed) continue;

            processed += 1;
            try {
                const inputPath = toAbsPath(job.input_path);
                const outputDir = toAbsPath(job.output_dir);
                const { urls, meshWarning } = await runVisionPipeline({
                    userId: job.user_id,
                    inputPath,
                    outputDir,
                    enable3d: !!job.enable_3d,
                });

                const upsertError = await upsertAvatarProfile(supabaseAdmin, job.user_id, urls);
                if (upsertError) throw new Error(upsertError);

                await supabaseAdmin
                    .from("user_body_avatar_jobs")
                    .update({
                        status: "done",
                        result_urls: urls,
                        warning: meshWarning,
                        finished_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", job.id);
                done += 1;
            } catch (err: any) {
                await supabaseAdmin
                    .from("user_body_avatar_jobs")
                    .update({
                        status: "error",
                        error: String(err?.message ?? err),
                        finished_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", job.id);
                failed += 1;
            }
        }

        return NextResponse.json({
            ok: true,
            processed,
            done,
            failed,
            queued: jobs?.length ?? 0,
        });
    } catch (e: any) {
        return NextResponse.json({ ok: false, error: e?.message ?? "unknown" }, { status: 500 });
    }
}
