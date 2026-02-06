import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs/promises";

const execFileAsync = promisify(execFile);

export const ROOT = process.cwd();
export const PIPELINE_DIR = path.join(ROOT, "tools", "vision-pipeline", "py");
export const INPUT_DIR = path.join(ROOT, "tools", "vision-pipeline", "input");
export const OUTPUT_DIR = path.join(ROOT, "tools", "vision-pipeline", "output");
export const PUBLIC_UPLOAD_DIR = path.join(ROOT, "public", "uploads");

const PYTHON = process.env.VISION_PYTHON_BIN || "python3";

export type PipelineUrls = {
    person?: string | null;
    clothes?: string | null;
    mask?: string | null;
    turntable?: string | null;
    mesh?: string | null;
};

export function toAbsPath(p: string) {
    return path.isAbsolute(p) ? p : path.join(ROOT, p);
}

async function fileExists(p: string) {
    try {
        await fs.access(p);
        return true;
    } catch {
        return false;
    }
}

async function copyOutputs(userId: string, outDir: string): Promise<PipelineUrls> {
    const uploadDir = path.join(PUBLIC_UPLOAD_DIR, userId);
    await fs.mkdir(uploadDir, { recursive: true });

    const files: Array<[keyof PipelineUrls, string]> = [
        ["person", "person_rgba.png"],
        ["clothes", "clothes_rgba.png"],
        ["mask", "mask_clothes.png"],
        ["turntable", "preview_turntable.gif"],
        ["mesh", "mesh.glb"],
    ];

    const urls: PipelineUrls = {};
    for (const [key, name] of files) {
        const src = path.join(outDir, name);
        if (!(await fileExists(src))) continue;
        const dest = path.join(uploadDir, name);
        await fs.copyFile(src, dest);
        urls[key] = `/uploads/${userId}/${name}`;
    }

    return urls;
}

export async function runVisionPipeline(params: {
    userId: string;
    inputPath: string;
    outputDir: string;
    enable3d: boolean;
}): Promise<{ urls: PipelineUrls; meshWarning: string | null }> {
    const { userId, inputPath, outputDir, enable3d } = params;

    await fs.mkdir(INPUT_DIR, { recursive: true });
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    await fs.mkdir(outputDir, { recursive: true });

    const appPy = path.join(PIPELINE_DIR, "app.py");
    await execFileAsync(PYTHON, [appPy, "--in", inputPath, "--outdir", outputDir], {
        cwd: PIPELINE_DIR,
        maxBuffer: 1024 * 1024 * 20,
    });

    let meshWarning: string | null = null;
    if (enable3d) {
        const tripoPy = path.join(PIPELINE_DIR, "tripo_sr_runner.py");
        const clothesPath = path.join(outputDir, "clothes_rgba.png");
        const meshOut = path.join(outputDir, "mesh.glb");
        if (await fileExists(clothesPath)) {
            try {
                await execFileAsync(PYTHON, [tripoPy, "--in", clothesPath, "--out", meshOut], {
                    cwd: PIPELINE_DIR,
                    maxBuffer: 1024 * 1024 * 20,
                });
            } catch (err: any) {
                meshWarning = String(err?.message ?? err);
            }
        } else {
            meshWarning = "clothes_rgba.png not found for 3D generation.";
        }
    }

    const urls = await copyOutputs(userId, outputDir);
    return { urls, meshWarning };
}

export async function upsertAvatarProfile(
    supabase: any,
    userId: string,
    urls: PipelineUrls
): Promise<string | null> {
    const { data: existing, error: existingError } = await supabase
        .from("user_body_avatar_profiles")
        .select("views")
        .eq("user_id", userId)
        .maybeSingle();

    if (existingError) return existingError.message;

    const views = existing?.views ?? {};
    if (urls.person && !views.front) views.front = urls.person;

    const payload: Record<string, any> = {
        user_id: userId,
        views,
        updated_at: new Date().toISOString(),
    };

    if (urls.person) payload.person_cutout_url = urls.person;
    if (urls.clothes) payload.clothes_cutout_url = urls.clothes;
    if (urls.mask) payload.mask_clothes_url = urls.mask;
    if (urls.turntable) payload.turntable_gif_url = urls.turntable;
    if (urls.mesh) payload.mesh_glb_url = urls.mesh;

    const { error: upsertErr } = await supabase
        .from("user_body_avatar_profiles")
        .upsert(payload, { onConflict: "user_id" });

    return upsertErr ? upsertErr.message : null;
}
