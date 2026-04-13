import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  validatePhotoFile,
  validatePhotoCount,
  MAX_PHOTOS_PER_USER,
} from "@/lib/rendezvous/photoValidation";

export const runtime = "nodejs";

const VALID_SLOTS = ["atmosphere", "face", "best", "current"] as const;
type SlotType = (typeof VALID_SLOTS)[number];

/** Map slot → disclosure phase */
const SLOT_DISCLOSURE_PHASE: Record<SlotType, number> = {
  atmosphere: 0,
  best: 1,
  face: 2,
  current: 2, // verification only, never shown to matches
};

/**
 * GET /api/rendezvous/photos
 * 自分の写真一覧を取得
 */
export async function GET() {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user)
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const { data: photos, error } = await supabaseAdmin
      .from("rendezvous_photos")
      .select("id, storage_path, display_order, is_primary, slot_type, disclosure_phase, created_at")
      .eq("user_id", auth.user.id)
      .order("display_order");

    if (error)
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    const items = (photos ?? []).map((row: any) => {
      const { data: urlData } = supabaseAdmin.storage
        .from("rendezvous-photos")
        .getPublicUrl(row.storage_path);
      return {
        id: row.id,
        url: urlData?.publicUrl ?? "",
        displayOrder: row.display_order,
        isPrimary: row.is_primary,
        slotType: row.slot_type,
        disclosurePhase: row.disclosure_phase,
        createdAt: row.created_at,
      };
    });

    return NextResponse.json({ ok: true, photos: items });
  } catch (err: any) {
    console.error("[rendezvous/photos] GET error:", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}

/**
 * POST /api/rendezvous/photos
 * 写真アップロード（サーバーサイドバリデーション付き）
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user)
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const userId = auth.user.id;

    // Count existing photos
    const { count } = await supabaseAdmin
      .from("rendezvous_photos")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);

    const countCheck = validatePhotoCount(count ?? 0);
    if (!countCheck.valid)
      return NextResponse.json({ ok: false, error: countCheck.error }, { status: 400 });

    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file)
      return NextResponse.json({ ok: false, error: "ファイルが必要です" }, { status: 400 });

    // Validate slot type
    const slotType = formData.get("slotType") as string | null;
    if (slotType && !VALID_SLOTS.includes(slotType as SlotType) && slotType !== "id_document") {
      return NextResponse.json({ ok: false, error: "Invalid slot type" }, { status: 400 });
    }

    // Validate file
    const fileCheck = validatePhotoFile(file.type, file.size);
    if (!fileCheck.valid)
      return NextResponse.json({ ok: false, error: fileCheck.error }, { status: 400 });

    // Upload to Supabase Storage
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const prefix = slotType ? `${userId}/${slotType}` : `${userId}/${Date.now()}`;
    const storagePath = `${prefix}_${Date.now()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadErr } = await supabaseAdmin.storage
      .from("rendezvous-photos")
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadErr) {
      console.error("[rendezvous/photos] upload error:", uploadErr);
      return NextResponse.json({ ok: false, error: "アップロードに失敗しました" }, { status: 500 });
    }

    // Determine disclosure phase from slot type
    const disclosurePhase = slotType && VALID_SLOTS.includes(slotType as SlotType)
      ? SLOT_DISCLOSURE_PHASE[slotType as SlotType]
      : 0;

    // Look up existing slot photo (if any) BEFORE insert — deletion happens AFTER new record succeeds
    let existingSlotPhoto: { id: string; storage_path: string } | null = null;
    if (slotType && VALID_SLOTS.includes(slotType as SlotType)) {
      const { data: existing } = await supabaseAdmin
        .from("rendezvous_photos")
        .select("id, storage_path")
        .eq("user_id", userId)
        .eq("slot_type", slotType)
        .maybeSingle();

      existingSlotPhoto = existing ?? null;

      // Delete old DB record first (to avoid unique constraint issues),
      // but keep the storage file until new photo is confirmed saved
      if (existingSlotPhoto) {
        await supabaseAdmin
          .from("rendezvous_photos")
          .delete()
          .eq("id", existingSlotPhoto.id);
      }
    }

    // Insert DB record
    const newOrder = count ?? 0;
    const { data: row, error: dbErr } = await supabaseAdmin
      .from("rendezvous_photos")
      .insert({
        user_id: userId,
        storage_path: storagePath,
        display_order: newOrder,
        is_primary: newOrder === 0,
        ...(slotType && VALID_SLOTS.includes(slotType as SlotType)
          ? { slot_type: slotType, disclosure_phase: disclosurePhase }
          : {}),
      })
      .select("id, storage_path, display_order, is_primary, slot_type, disclosure_phase, created_at")
      .single();

    if (dbErr) {
      // Cleanup uploaded file
      await supabaseAdmin.storage.from("rendezvous-photos").remove([storagePath]);
      return NextResponse.json({ ok: false, error: dbErr.message }, { status: 500 });
    }

    // New photo saved successfully — now clean up old slot storage file
    if (existingSlotPhoto) {
      await supabaseAdmin.storage
        .from("rendezvous-photos")
        .remove([existingSlotPhoto.storage_path]);
    }

    const { data: urlData } = supabaseAdmin.storage
      .from("rendezvous-photos")
      .getPublicUrl(storagePath);

    return NextResponse.json({
      ok: true,
      photo: {
        id: row.id,
        url: urlData?.publicUrl ?? "",
        displayOrder: row.display_order,
        isPrimary: row.is_primary,
        slotType: row.slot_type,
        disclosurePhase: row.disclosure_phase,
        createdAt: row.created_at,
      },
    });
  } catch (err: any) {
    console.error("[rendezvous/photos] POST error:", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
