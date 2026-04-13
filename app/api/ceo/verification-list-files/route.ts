import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isCeoEmail } from "@/lib/auth/isCeo";

/**
 * GET /api/ceo/verification-list-files?prefix=<storage_prefix>
 * CEO専用: identity-verification バケット内のファイル一覧を取得する。
 * prefix例: "userId/partner_single_status_"
 * 返却: { ok: true, files: ["userId/partner_single_status_1712345678.jpg", ...] }
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

    const prefix = request.nextUrl.searchParams.get("prefix");
    if (!prefix) {
      return NextResponse.json(
        { ok: false, error: "prefix parameter required" },
        { status: 400 },
      );
    }

    // パストラバーサル防止
    if (prefix.includes("..")) {
      return NextResponse.json(
        { ok: false, error: "Invalid prefix" },
        { status: 400 },
      );
    }

    // prefix からフォルダとファイルプレフィックスを分離
    // 例: "abc123/partner_single_status_" → folder="abc123", search="partner_single_status_"
    const lastSlash = prefix.lastIndexOf("/");
    const folder = lastSlash >= 0 ? prefix.slice(0, lastSlash) : "";
    const filePrefix = lastSlash >= 0 ? prefix.slice(lastSlash + 1) : prefix;

    const { data, error } = await supabaseAdmin.storage
      .from("identity-verification")
      .list(folder, {
        limit: 20,
        sortBy: { column: "created_at", order: "asc" },
      });

    if (error) {
      console.error("[ceo/verification-list-files] error:", error);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 },
      );
    }

    // filePrefix でフィルタして完全パスを返す
    const files = (data ?? [])
      .filter((f) => f.name.startsWith(filePrefix))
      .map((f) => (folder ? `${folder}/${f.name}` : f.name));

    return NextResponse.json({ ok: true, files });
  } catch (err: unknown) {
    console.error("[ceo/verification-list-files] error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Error" },
      { status: 500 },
    );
  }
}
