import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

/**
 * PATCH /api/rendezvous/photos/[photoId]
 * 写真の並び替え・プライマリ設定
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ photoId: string }> },
) {
  try {
    const { photoId } = await params;
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user)
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const userId = auth.user.id;

    // Verify ownership
    const { data: photo } = await supabaseAdmin
      .from("rendezvous_photos")
      .select("id, user_id")
      .eq("id", photoId)
      .single();

    if (!photo || photo.user_id !== userId)
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    const body = await request.json();
    const updates: Record<string, unknown> = {};

    if (typeof body.displayOrder === "number") {
      updates.display_order = body.displayOrder;
    }
    if (typeof body.isPrimary === "boolean") {
      updates.is_primary = body.isPrimary;
      // If setting as primary, unset other primaries
      if (body.isPrimary) {
        await supabaseAdmin
          .from("rendezvous_photos")
          .update({ is_primary: false })
          .eq("user_id", userId)
          .neq("id", photoId);
      }
    }

    if (Object.keys(updates).length === 0)
      return NextResponse.json({ ok: false, error: "No updates" }, { status: 400 });

    const { error } = await supabaseAdmin
      .from("rendezvous_photos")
      .update(updates)
      .eq("id", photoId);

    if (error)
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[rendezvous/photos/[photoId]] PATCH error:", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}

/**
 * DELETE /api/rendezvous/photos/[photoId]
 * 写真の削除
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ photoId: string }> },
) {
  try {
    const { photoId } = await params;
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user)
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const userId = auth.user.id;

    // Verify ownership and get storage path
    const { data: photo } = await supabaseAdmin
      .from("rendezvous_photos")
      .select("id, user_id, storage_path, is_primary")
      .eq("id", photoId)
      .single();

    if (!photo || photo.user_id !== userId)
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    // Delete from storage
    await supabaseAdmin.storage.from("rendezvous-photos").remove([photo.storage_path]);

    // Delete DB record
    await supabaseAdmin.from("rendezvous_photos").delete().eq("id", photoId);

    // Reorder remaining photos and set new primary if needed
    const { data: remaining } = await supabaseAdmin
      .from("rendezvous_photos")
      .select("id, display_order")
      .eq("user_id", userId)
      .order("display_order");

    if (remaining && remaining.length > 0) {
      for (let i = 0; i < remaining.length; i++) {
        await supabaseAdmin
          .from("rendezvous_photos")
          .update({ display_order: i, is_primary: i === 0 })
          .eq("id", remaining[i].id);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[rendezvous/photos/[photoId]] DELETE error:", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
