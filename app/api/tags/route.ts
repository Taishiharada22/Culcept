import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const q = String(searchParams.get("q") ?? "").trim();

    const supabase = await supabaseServer();
    const { data, error } = await supabase.rpc("search_tags", { prefix: q, lim: 12 });

    if (error) {
        return NextResponse.json({ ok: false, error: error.message, tags: [] }, { status: 500 });
    }

    const tags = (data ?? []).map((x: any) => String(x.tag ?? "")).filter(Boolean);
    return NextResponse.json({ ok: true, tags });
}
