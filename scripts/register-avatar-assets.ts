import fs from "fs";
import path from "path";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type Args = {
    userId: string;
    dir: string;
};

function parseArgs(): Args {
    const args = process.argv.slice(2);
    const out: Partial<Args> = {};
    for (let i = 0; i < args.length; i += 1) {
        const key = args[i];
        const next = args[i + 1];
        if (key === "--user-id") out.userId = next;
        if (key === "--dir") out.dir = next;
    }
    if (!out.userId || !out.dir) {
        throw new Error("Usage: tsx scripts/register-avatar-assets.ts --user-id <uuid> --dir <output_dir>");
    }
    return out as Args;
}

function copyIfExists(src: string, dest: string) {
    if (!fs.existsSync(src)) return false;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    return true;
}

async function main() {
    const { userId, dir } = parseArgs();
    const outDir = path.resolve(dir);
    const targetDir = path.resolve("public/uploads", userId);

    const files = [
        { name: "person_rgba.png", key: "person_cutout_url" },
        { name: "clothes_rgba.png", key: "clothes_cutout_url" },
        { name: "mask_clothes.png", key: "mask_clothes_url" },
        { name: "preview_turntable.gif", key: "turntable_gif_url" },
        { name: "mesh.glb", key: "mesh_glb_url" },
    ] as const;

    const payload: Record<string, string> = {};

    for (const file of files) {
        const src = path.join(outDir, file.name);
        const dest = path.join(targetDir, file.name);
        const ok = copyIfExists(src, dest);
        if (ok) {
            payload[file.key] = `/uploads/${userId}/${file.name}`;
        }
    }

    if (Object.keys(payload).length === 0) {
        throw new Error("No files found to register.");
    }

    const { data: existing } = await supabaseAdmin
        .from("user_body_avatar_profiles")
        .select("views")
        .eq("user_id", userId)
        .maybeSingle();

    const { error } = await supabaseAdmin
        .from("user_body_avatar_profiles")
        .upsert(
            {
                user_id: userId,
                views: existing?.views ?? {},
                ...payload,
                updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" }
        );

    if (error) {
        throw error;
    }

    console.log("Registered:", payload);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
