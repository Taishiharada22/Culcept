import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isCeoEmail } from "@/lib/auth/isCeo";

/**
 * GET /api/ceo/verification-signed-url?path=<storage_path>
 * CEO専用: identity-verification バケットの signed URL を生成する。
 * 有効期限 5分。
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user || !isCeoEmail(auth.user.email)) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const path = request.nextUrl.searchParams.get("path");
    if (!path) {
      return NextResponse.json(
        { ok: false, error: "path parameter required" },
        { status: 400 },
      );
    }

    // パストラバーサル防止: ".." を含むパスを拒否
    if (path.includes("..")) {
      return NextResponse.json(
        { ok: false, error: "Invalid path" },
        { status: 400 },
      );
    }

    const { data, error } = await supabaseAdmin.storage
      .from("identity-verification")
      .createSignedUrl(path, 300); // 5分有効

    if (error) {
      // ファイルが存在しない場合は 404（ユーザーがアップロード前 or 削除済み）
      const isNotFound =
        (error as any).statusCode === "404" ||
        (error as any).status === 400 ||
        error.message?.includes("not found");
      if (isNotFound) {
        console.warn("[ceo/verification-signed-url] file not found:", path);
        return NextResponse.json(
          { ok: false, error: "File not found" },
          { status: 404 },
        );
      }
      console.error("[ceo/verification-signed-url] error:", error);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, url: data.signedUrl });
  } catch (err: unknown) {
    console.error("[ceo/verification-signed-url] error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Error" },
      { status: 500 },
    );
  }
}
