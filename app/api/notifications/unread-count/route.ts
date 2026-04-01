import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();

        if (!auth?.user) {
            return NextResponse.json({ count: 0 });
        }

        const { count, error } = await supabase
            .from("notifications")
            .select("id", { count: "exact", head: true })
            .eq("user_id", auth.user.id)
            .is("read_at", null);

        if (error) {
            return NextResponse.json({ count: 0 });
        }

        return NextResponse.json({ count: count ?? 0 });
    } catch {
        return NextResponse.json({ count: 0 });
    }
}
