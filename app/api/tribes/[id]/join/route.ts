import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { getStyleDrive } from "@/lib/styleDrive";

export const runtime = "nodejs";

async function ensureAuth() {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    return auth?.user ?? null;
}

export async function POST(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    if (!getStyleDrive(id)) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const user = await ensureAuth();
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ joined: true });
}

export async function DELETE(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    if (!getStyleDrive(id)) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const user = await ensureAuth();
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ joined: false });
}
