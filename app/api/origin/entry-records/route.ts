import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// GET — Entry Records を取得（直近 N 日分）
// クエリ: ?days=90 (default 90)
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const days = Number(req.nextUrl.searchParams.get("days") ?? "90");
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from("origin_entry_records")
      .select("date, category, note, recorded_at")
      .eq("user_id", user.id)
      .gte("date", cutoffStr)
      .order("date", { ascending: false });

    if (error) {
      // テーブル未作成（PGRST205）の場合は空配列を返す
      if (error.code === "PGRST205") {
        return NextResponse.json({ ok: true, records: [] });
      }
      console.error("[entry-records] GET error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // クライアント形式に変換
    const records = (data ?? []).map((r) => ({
      date: r.date,
      category: r.category,
      note: r.note ?? undefined,
      recordedAt: r.recorded_at,
    }));

    return NextResponse.json({ ok: true, records });
  } catch (e) {
    console.error("[entry-records] GET unexpected:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST — Entry Records を同期（upsert）
// Body: { records: EntryRecord[] }
// クライアントの localStorage レコードをサーバーに一括同期
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const records: Array<{
      date: string;
      category: string;
      note?: string;
      recordedAt: string;
    }> = body.records;

    if (!Array.isArray(records) || records.length === 0) {
      return NextResponse.json(
        { error: "records array required" },
        { status: 400 },
      );
    }

    // 100件上限（悪用防止）
    const limited = records.slice(0, 100);

    const rows = limited.map((r) => ({
      user_id: user.id,
      date: r.date,
      category: r.category,
      note: r.note || null,
      recorded_at: r.recordedAt,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from("origin_entry_records")
      .upsert(rows, { onConflict: "user_id,date" });

    if (error) {
      // テーブル未作成時は無視（次回migration適用後に同期される）
      if (error.code === "PGRST205") {
        return NextResponse.json({ ok: true, synced: 0, pending: true });
      }
      console.error("[entry-records] POST error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, synced: rows.length });
  } catch (e) {
    console.error("[entry-records] POST unexpected:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
