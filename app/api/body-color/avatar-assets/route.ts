import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const BUCKET = process.env.SUPABASE_BODY_BUCKET || "body-avatars";

const KIND_MAP: Record<string, string> = {
    person: "person_cutout_url",
    clothes: "clothes_cutout_url",
    mask: "mask_clothes_url",
    turntable: "turntable_gif_url",
    mesh: "mesh_glb_url",
};

function extFromMime(mime: string) {
    const m = (mime || "").toLowerCase();
    if (m.includes("png")) return "png";
    if (m.includes("webp")) return "webp";
    if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
    if (m.includes("gif")) return "gif";
    if (m.includes("glb")) return "glb";
    return "bin";
}

export async function POST(request: NextRequest) {
    try {
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();
        if (!auth?.user) {
            return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
        }

        const form = await request.formData();
        const kind = String(form.get("kind") ?? "").trim();
        const file = form.get("file");

        if (!kind || !KIND_MAP[kind]) {
            return NextResponse.json({ ok: false, error: "Invalid kind" }, { status: 400 });
        }
        if (!file || typeof file === "string") {
            return NextResponse.json({ ok: false, error: "file is required" }, { status: 400 });
        }

        const buf = Buffer.from(await file.arrayBuffer());
        const ext = extFromMime(file.type || "");
        const path = `avatars/${auth.user.id}/assets/${kind}-${Date.now()}.${ext}`;

        const { error: upErr } = await supabaseAdmin.storage
            .from(BUCKET)
            .upload(path, buf, {
                contentType: file.type || "application/octet-stream",
                upsert: true,
                cacheControl: "3600",
            });

        if (upErr) {
            return NextResponse.json({ ok: false, error: upErr.message }, { status: 400 });
        }

        const { data: publicData } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
        const publicUrl = publicData?.publicUrl || "";
        if (!publicUrl) {
            return NextResponse.json({ ok: false, error: "Failed to get public URL" }, { status: 500 });
        }

        const { data: existing } = await supabase
            .from("user_body_avatar_profiles")
            .select("views")
            .eq("user_id", auth.user.id)
            .maybeSingle();

        const payload: Record<string, any> = {
            user_id: auth.user.id,
            views: existing?.views ?? {},
            updated_at: new Date().toISOString(),
        };
        payload[KIND_MAP[kind]] = publicUrl;

        const { error: upsertErr } = await supabase
            .from("user_body_avatar_profiles")
            .upsert(payload, { onConflict: "user_id" });

        if (upsertErr) {
            return NextResponse.json({ ok: false, error: upsertErr.message }, { status: 400 });
        }

        return NextResponse.json({ ok: true, url: publicUrl, kind });
    } catch (error) {
        console.error("avatar-assets POST error:", error);
        return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
    }
}
