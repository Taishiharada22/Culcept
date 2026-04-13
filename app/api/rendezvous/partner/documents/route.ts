import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type {
  PartnerDocumentType,
  PartnerDocumentStatus,
  PartnerDocumentStatuses,
} from "@/lib/rendezvous/verificationLevel";

// ── 定数 ──

const VALID_DOCUMENT_TYPES: PartnerDocumentType[] = [
  "single_status",
  "income",
  "education",
  "employment",
];

// identity は既存の identity-verify API で扱うため除外
function isValidDocType(t: string): t is PartnerDocumentType {
  return (VALID_DOCUMENT_TYPES as string[]).includes(t);
}

// ── ヘルパー: partner_document_statuses を安全に取得 ──

async function getDocumentStatuses(
  userId: string,
): Promise<PartnerDocumentStatuses> {
  const { data } = await supabaseAdmin
    .from("rendezvous_profiles")
    .select("partner_document_statuses")
    .eq("user_id", userId)
    .single();

  // カラムが存在しない場合や null の場合は空オブジェクトを返す
  if (!data || !data.partner_document_statuses) return {};
  return data.partner_document_statuses as PartnerDocumentStatuses;
}

// ── GET: 書類ステータス一覧 ──

export async function GET() {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = auth.user.id;

    // identity の review_status を取得
    const { data: profile } = await supabaseAdmin
      .from("rendezvous_profiles")
      .select("review_status, partner_document_statuses")
      .eq("user_id", userId)
      .single();

    const identityStatus: PartnerDocumentStatus =
      mapReviewStatus(profile?.review_status);

    const docStatuses: PartnerDocumentStatuses =
      (profile?.partner_document_statuses as PartnerDocumentStatuses) ?? {};

    // 各書類の状態を返す
    const documents = [
      {
        type: "identity" as PartnerDocumentType,
        status: identityStatus,
      },
      ...VALID_DOCUMENT_TYPES.map((type) => ({
        type,
        status: (docStatuses[type] ?? "not_submitted") as PartnerDocumentStatus,
      })),
    ];

    return NextResponse.json({ ok: true, documents });
  } catch (err) {
    console.error("[partner/documents] GET error:", err);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 },
    );
  }
}

// ── POST: 書類アップロード ──

export async function POST(request: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = auth.user.id;

    const formData = await request.formData();
    const documentType = formData.get("documentType") as string | null;
    const documentImage = formData.get("documentImage") as File | null;

    if (!documentType || !isValidDocType(documentType)) {
      return NextResponse.json(
        { error: "有効な書類種別を指定してください" },
        { status: 400 },
      );
    }

    if (!documentImage) {
      return NextResponse.json(
        { error: "書類画像をアップロードしてください" },
        { status: 400 },
      );
    }

    // ファイルサイズ上限: 10MB
    if (documentImage.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: "ファイルサイズは10MB以内にしてください" },
        { status: 400 },
      );
    }

    // 画像をストレージにアップロード
    const ts = Date.now();
    const storagePath = `${userId}/partner_${documentType}_${ts}.jpg`;
    const buffer = Buffer.from(await documentImage.arrayBuffer());

    const { error: uploadErr } = await supabaseAdmin.storage
      .from("identity-verification")
      .upload(storagePath, buffer, {
        contentType: documentImage.type || "image/jpeg",
        upsert: false,
      });

    if (uploadErr) {
      console.error("[partner/documents] upload error:", uploadErr);
      return NextResponse.json(
        { error: "書類のアップロードに失敗しました" },
        { status: 500 },
      );
    }

    // partner_document_statuses を更新
    const currentStatuses = await getDocumentStatuses(userId);
    const updatedStatuses: PartnerDocumentStatuses = {
      ...currentStatuses,
      [documentType]: "pending" as PartnerDocumentStatus,
    };

    const { error: updateErr } = await supabaseAdmin
      .from("rendezvous_profiles")
      .update({ partner_document_statuses: updatedStatuses })
      .eq("user_id", userId);

    if (updateErr) {
      console.error("[partner/documents] update error:", updateErr);
      // partner_document_statuses カラムが存在しない場合のフォールバック
      // カラム不在時は graceful に扱う（ステータスは返すが永続化されない）
      console.warn(
        "[partner/documents] partner_document_statuses column may not exist yet. Status stored in-memory only.",
      );
    }

    // 監査ログ
    await supabaseAdmin
      .from("verification_audit_logs")
      .insert({
        user_id: userId,
        action: "submit",
        old_value: { document_type: documentType, status: currentStatuses[documentType] ?? "not_submitted" },
        new_value: { document_type: documentType, status: "pending", path: storagePath },
      })
      .then(({ error }) => {
        if (error) console.warn("[partner/documents] audit log write failed:", error);
      });

    return NextResponse.json({
      ok: true,
      document: { type: documentType, status: "pending" },
    });
  } catch (err) {
    console.error("[partner/documents] POST error:", err);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 },
    );
  }
}

// ── ヘルパー: DB の review_status → PartnerDocumentStatus ──

function mapReviewStatus(raw: string | null | undefined): PartnerDocumentStatus {
  if (raw === "approved") return "approved";
  if (raw === "pending") return "pending";
  if (raw === "rejected") return "rejected";
  return "not_submitted";
}
