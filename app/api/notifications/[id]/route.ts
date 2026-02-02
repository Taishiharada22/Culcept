// app/api/notifications/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * 特定の通知を取得
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();

        if (!auth?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { data: notification, error } = await supabase
            .from("notifications")
            .select("*")
            .eq("id", id)
            .eq("user_id", auth.user.id)
            .single();

        if (error || !notification) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }

        return NextResponse.json({ notification });
    } catch (error) {
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}

/**
 * 通知を既読にする
 */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();

        if (!auth?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { error } = await supabase
            .from("notifications")
            .update({ read_at: new Date().toISOString() })
            .eq("id", id)
            .eq("user_id", auth.user.id);

        if (error) {
            return NextResponse.json({ error: "Failed to update" }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}

/**
 * 通知を削除
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();

        if (!auth?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { error } = await supabase
            .from("notifications")
            .delete()
            .eq("id", id)
            .eq("user_id", auth.user.id);

        if (error) {
            return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}
