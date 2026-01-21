import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const BUCKET = process.env.SUPABASE_DROP_IMAGES_BUCKET ?? "drops";

function safeExt(fileName: string) {
    const ext = (fileName.split(".").pop() ?? "jpg").toLowerCase();
    const cleaned = ext.replace(/[^a-z0-9]/g, "");
    return cleaned || "jpg";
}

export async function POST(req: Request) {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const dropId = String(body?.dropId ?? "").trim();
    const fileName = String(body?.fileName ?? "").trim();
    const contentType = String(body?.contentType ?? "application/octet-stream");

    if (!dropId) return NextResponse.json({ ok: false, error: "dropId required" }, { status: 400 });
    if (!fileName) return NextResponse.json({ ok: false, error: "fileName required" }, { status: 400 });

    // 所有チェック
    const { data: drop } = await supabaseAdmin.from("drops").select("id, user_id").eq("id", dropId).maybeSingle();
    if (!drop || String((drop as any).user_id) !== user.id) {
        return NextResponse.json({ ok: false, error: "Drop not found" }, { status: 404 });
    }

    const ext = safeExt(fileName);
    // ✅ バケット drops の中は dropId/...
    const path = `${dropId}/${crypto.randomUUID()}.${ext}`;

    const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: false });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    // ✅ public bucket 前提で publicUrl も返す（ImageManager/DB登録に使う）
    const { data: pub } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);

    return NextResponse.json({
        ok: true,
        bucket: BUCKET,
        path,
        token: data.token,
        publicUrl: pub.publicUrl,
        contentType,
    });
}
