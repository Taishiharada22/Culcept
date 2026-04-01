import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const VALID_DOC_TYPES = ["drivers_license", "passport", "my_number_card"] as const;
type DocType = (typeof VALID_DOC_TYPES)[number];

/**
 * POST /api/rendezvous/identity-verify
 * 本人確認書類 + セルフィーをアップロードし、審査待ちにする
 */
export async function POST(request: NextRequest) {
  try {
    // --- Auth ---
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    const userId = auth.user.id;

    // --- Parse multipart form data ---
    const formData = await request.formData();
    const documentImage = formData.get("documentImage") as File | null;
    const selfieImage = formData.get("selfieImage") as File | null;
    const documentType = formData.get("documentType") as string | null;
    const birthDate = formData.get("birthDate") as string | null;

    // --- Validate inputs ---
    if (!documentImage || !selfieImage) {
      return NextResponse.json(
        { ok: false, error: "本人確認書類とセルフィーの両方をアップロードしてください" },
        { status: 400 },
      );
    }

    if (!documentType || !VALID_DOC_TYPES.includes(documentType as DocType)) {
      return NextResponse.json(
        { ok: false, error: "有効な本人確認書類の種別を選択してください" },
        { status: 400 },
      );
    }

    if (!birthDate) {
      return NextResponse.json(
        { ok: false, error: "生年月日を入力してください" },
        { status: 400 },
      );
    }

    const bd = new Date(birthDate);
    if (isNaN(bd.getTime())) {
      return NextResponse.json({ ok: false, error: "無効な日付です" }, { status: 400 });
    }

    // Age check: must be 18+
    const today = new Date();
    let age = today.getFullYear() - bd.getFullYear();
    const monthDiff = today.getMonth() - bd.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < bd.getDate())) {
      age--;
    }
    if (age < 18) {
      return NextResponse.json(
        { ok: false, error: "Rendezvousのご利用には18歳以上であることが必要です" },
        { status: 400 },
      );
    }

    // --- Upload images to Supabase Storage ---
    const ts = Date.now();
    const docPath = `${userId}/document_${ts}.jpg`;
    const selfiePath = `${userId}/selfie_${ts}.jpg`;

    const docBuffer = Buffer.from(await documentImage.arrayBuffer());
    const selfieBuffer = Buffer.from(await selfieImage.arrayBuffer());

    const { error: docUploadErr } = await supabaseAdmin.storage
      .from("identity-verification")
      .upload(docPath, docBuffer, {
        contentType: documentImage.type || "image/jpeg",
        upsert: false,
      });

    if (docUploadErr) {
      console.error("[identity-verify] document upload error:", docUploadErr);
      return NextResponse.json(
        { ok: false, error: "書類のアップロードに失敗しました" },
        { status: 500 },
      );
    }

    const { error: selfieUploadErr } = await supabaseAdmin.storage
      .from("identity-verification")
      .upload(selfiePath, selfieBuffer, {
        contentType: selfieImage.type || "image/jpeg",
        upsert: false,
      });

    if (selfieUploadErr) {
      console.error("[identity-verify] selfie upload error:", selfieUploadErr);
      // Clean up the already-uploaded document
      await supabaseAdmin.storage.from("identity-verification").remove([docPath]);
      return NextResponse.json(
        { ok: false, error: "セルフィーのアップロードに失敗しました" },
        { status: 500 },
      );
    }

    // --- Update rendezvous_profiles ---
    const now = new Date().toISOString();
    const { data: updated, error: updateErr } = await supabaseAdmin
      .from("rendezvous_profiles")
      .update({
        verification_status: "pending",   // ユーザー向け: 確認中
        review_status: "pending",          // 管理側: 審査中
        verification_submitted_at: now,
        id_document_path: docPath,
        selfie_path: selfiePath,
        document_type: documentType,
        birth_date: birthDate,
        manual_review_required: true,
      })
      .eq("user_id", userId)
      .select("user_id");

    if (updateErr) {
      console.error("[identity-verify] update error:", updateErr);
      await supabaseAdmin.storage
        .from("identity-verification")
        .remove([docPath, selfiePath]);
      return NextResponse.json({ ok: false, error: updateErr.message }, { status: 500 });
    }

    // 更新が0行 = rendezvous_profiles の行が存在しない
    if (!updated || updated.length === 0) {
      console.error("[identity-verify] update matched 0 rows for user:", userId);
      await supabaseAdmin.storage
        .from("identity-verification")
        .remove([docPath, selfiePath]);
      return NextResponse.json(
        { ok: false, error: "プロフィールが見つかりません。先にオンボーディングを完了してください。" },
        { status: 400 },
      );
    }

    // Audit log: submission
    await supabaseAdmin.from("verification_audit_logs").insert({
      user_id: userId,
      action: "submit",
      old_value: null,
      new_value: { verification_status: "pending", review_status: "pending", document_type: documentType },
    }).then(({ error }) => {
      if (error) console.warn("[identity-verify] audit log write failed:", error);
    });

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error("[identity-verify] error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
