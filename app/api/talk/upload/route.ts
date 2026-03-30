// POST /api/talk/upload — 画像アップロード（Supabase Storage）
import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export async function POST(req: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const threadId = formData.get("threadId") as string | null;

    if (!file || !threadId) {
      return NextResponse.json({ error: "Missing file or threadId" }, { status: 400 });
    }

    // バリデーション
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "画像ファイル(JPEG/PNG/WebP/GIF)のみ対応" }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "ファイルサイズは5MB以下にしてください" }, { status: 400 });
    }

    // ファイル名生成
    const ext = file.name.split(".").pop() ?? "jpg";
    const fileName = `${threadId}/${user.id}_${Date.now()}.${ext}`;

    // Supabase Storageにアップロード
    const { error: uploadError } = await supabase.storage
      .from("talk-media")
      .upload(fileName, file, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("upload error:", uploadError);
      return NextResponse.json({ error: "アップロードに失敗しました" }, { status: 500 });
    }

    // Public URLを取得
    const { data: urlData } = supabase.storage
      .from("talk-media")
      .getPublicUrl(fileName);

    return NextResponse.json({ ok: true, url: urlData.publicUrl });
  } catch (error) {
    console.error("talk/upload error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
