import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const BUCKET = process.env.SUPABASE_BODY_BUCKET || "body-avatars";

function parseDataUrl(dataUrl: string) {
    const match = /^data:(image\/[a-zA-Z0-9+.-]+);base64,(.*)$/.exec(dataUrl);
    if (!match) return null;
    return { mime: match[1], base64: match[2] };
}

function extFromMime(mime: string) {
    const m = (mime || "").toLowerCase();
    if (m.includes("png")) return "png";
    if (m.includes("webp")) return "webp";
    if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
    return "bin";
}

function normalizeView(view: string) {
    const v = String(view || "").toLowerCase();
    if (["front", "left", "right", "back"].includes(v)) return v;
    return null;
}

export async function GET() {
    try {
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();
        if (!auth?.user) {
            return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
        }

        const { data } = await supabase
            .from("user_body_avatar_profiles")
            .select("*")
            .eq("user_id", auth.user.id)
            .maybeSingle();

        return NextResponse.json({ ok: true, avatar_profile: data ?? null });
    } catch (error) {
        console.error("avatar GET error:", error);
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

        const body = await request.json().catch(() => ({}));
        const view = normalizeView(body?.view);
        const dataUrl = String(body?.imageData ?? "");
        if (!view || !dataUrl) {
            return NextResponse.json({ ok: false, error: "view and imageData are required" }, { status: 400 });
        }

        const parsed = parseDataUrl(dataUrl);
        if (!parsed) {
            return NextResponse.json({ ok: false, error: "Invalid image data" }, { status: 400 });
        }

        const ext = extFromMime(parsed.mime);
        const buffer = Buffer.from(parsed.base64, "base64");
        const path = `avatars/${auth.user.id}/${view}-${Date.now()}.${ext}`;

        const { error: upErr } = await supabaseAdmin.storage
            .from(BUCKET)
            .upload(path, buffer, {
                contentType: parsed.mime,
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

        const nextViews = {
            ...(existing?.views ?? {}),
            [view]: publicUrl,
        };

        const { error: upsertErr } = await supabase
            .from("user_body_avatar_profiles")
            .upsert(
                {
                    user_id: auth.user.id,
                    views: nextViews,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: "user_id" }
            );

        if (upsertErr) {
            return NextResponse.json({ ok: false, error: upsertErr.message }, { status: 400 });
        }

        return NextResponse.json({ ok: true, url: publicUrl, views: nextViews });
    } catch (error) {
        console.error("avatar POST error:", error);
        return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
    }
}
