import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * POST /api/origin/journal/photo
 * Upload a photo and attach it to a journal entry.
 * Expects multipart/form-data with fields: date, photo (file)
 * Design: "save first, add photo later" — photo can be added after journal is saved.
 */
export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const date = formData.get("date") as string;
  const photo = formData.get("photo") as File | null;

  if (!date) return NextResponse.json({ ok: false, error: "date required" }, { status: 400 });
  if (!photo) return NextResponse.json({ ok: false, error: "photo required" }, { status: 400 });

  // Validate file type
  if (!photo.type.startsWith("image/")) {
    return NextResponse.json({ ok: false, error: "only images allowed" }, { status: 400 });
  }

  // Max 5MB
  if (photo.size > 5 * 1024 * 1024) {
    return NextResponse.json({ ok: false, error: "max 5MB" }, { status: 400 });
  }

  const ext = photo.name.split(".").pop() || "jpg";
  const path = `journal/${user.id}/${date}.${ext}`;

  const buffer = Buffer.from(await photo.arrayBuffer());
  const { error: uploadError } = await supabase.storage
    .from("origin-journal-photos")
    .upload(path, buffer, {
      contentType: photo.type,
      upsert: true,
    });

  if (uploadError) {
    console.error("[journal/photo] upload error:", uploadError);
    return NextResponse.json({ ok: false, error: uploadError.message }, { status: 500 });
  }

  const { data: urlData } = supabase.storage
    .from("origin-journal-photos")
    .getPublicUrl(path);

  const photoUrl = urlData.publicUrl;

  // Update journal entry with photo URL
  const { error: updateError } = await supabase
    .from("origin_journal_entries")
    .update({ photo_url: photoUrl })
    .eq("user_id", user.id)
    .eq("date", date);

  if (updateError) {
    console.error("[journal/photo] update error:", updateError);
    return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, photo_url: photoUrl });
}

/**
 * DELETE /api/origin/journal/photo?date=YYYY-MM-DD
 * Remove photo from a journal entry.
 */
export async function DELETE(req: NextRequest) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const date = req.nextUrl.searchParams.get("date");
  if (!date) return NextResponse.json({ ok: false, error: "date required" }, { status: 400 });

  // Remove from storage (best-effort)
  const pathPrefix = `journal/${user.id}/${date}`;
  const { data: files } = await supabase.storage
    .from("origin-journal-photos")
    .list(`journal/${user.id}`, { search: date });
  if (files && files.length > 0) {
    await supabase.storage
      .from("origin-journal-photos")
      .remove(files.map((f) => `journal/${user.id}/${f.name}`));
  }

  // Clear photo_url in DB
  await supabase
    .from("origin_journal_entries")
    .update({ photo_url: null })
    .eq("user_id", user.id)
    .eq("date", date);

  return NextResponse.json({ ok: true });
}
