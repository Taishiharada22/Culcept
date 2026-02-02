// app/api/messages/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/messages?conversation_id=xxx - 会話のメッセージ一覧取得
 */
export async function GET(req: NextRequest) {
    try {
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();

        if (!auth?.user) {
            return NextResponse.json(
                { ok: false, error: "Not authenticated" },
                { status: 401 }
            );
        }

        const { searchParams } = new URL(req.url);
        const conversationId = searchParams.get("conversation_id");

        if (!conversationId) {
            return NextResponse.json(
                { ok: false, error: "Missing conversation_id" },
                { status: 400 }
            );
        }

        // Get messages with sender info
        const { data: messages, error } = await supabase
            .from("messages")
            .select(`
                *,
                sender:sender_id (
                    id,
                    raw_user_meta_data
                )
            `)
            .eq("conversation_id", conversationId)
            .order("created_at", { ascending: true });

        if (error) {
            throw error;
        }

        // Format messages
        const formatted = (messages || []).map((m: any) => ({
            ...m,
            sender_name: m.sender?.raw_user_meta_data?.name || null,
            sender_avatar: m.sender?.raw_user_meta_data?.avatar_url || null,
        }));

        // Mark as read
        await supabase
            .from("messages")
            .update({ is_read: true })
            .eq("conversation_id", conversationId)
            .eq("recipient_id", auth.user.id)
            .eq("is_read", false);

        return NextResponse.json({ ok: true, messages: formatted });
    } catch (err: any) {
        console.error("GET /api/messages error:", err);
        return NextResponse.json(
            { ok: false, error: err.message || "Internal server error" },
            { status: 500 }
        );
    }
}

/**
 * POST /api/messages - メッセージ送信
 */
export async function POST(req: NextRequest) {
    try {
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();

        if (!auth?.user) {
            return NextResponse.json(
                { ok: false, error: "Not authenticated" },
                { status: 401 }
            );
        }

        const body = await req.json();
        const { conversation_id, product_id, recipient_id, content } = body;

        if (!content || typeof content !== "string" || !content.trim()) {
            return NextResponse.json(
                { ok: false, error: "Invalid content" },
                { status: 400 }
            );
        }

        // If conversation_id is provided, use it
        let convId = conversation_id;
        let recipId = recipient_id;

        if (!convId) {
            // Create new conversation
            if (!product_id || !recipient_id) {
                return NextResponse.json(
                    { ok: false, error: "Missing product_id or recipient_id" },
                    { status: 400 }
                );
            }

            // Check if conversation already exists
            const { data: existing } = await supabase
                .from("conversations")
                .select("id")
                .eq("product_id", product_id)
                .or(`buyer_id.eq.${auth.user.id},seller_id.eq.${auth.user.id}`)
                .maybeSingle();

            if (existing) {
                convId = existing.id;
            } else {
                // Create new conversation
                const { data: newConv, error: convErr } = await supabase
                    .from("conversations")
                    .insert({
                        product_id,
                        buyer_id: auth.user.id,
                        seller_id: recipient_id,
                    })
                    .select()
                    .single();

                if (convErr) {
                    throw convErr;
                }

                convId = newConv.id;
            }
        } else {
            // Get conversation to find recipient
            const { data: conv, error: convErr } = await supabase
                .from("conversations")
                .select("buyer_id,seller_id")
                .eq("id", conversation_id)
                .single();

            if (convErr || !conv) {
                return NextResponse.json(
                    { ok: false, error: "Conversation not found" },
                    { status: 404 }
                );
            }

            recipId = conv.buyer_id === auth.user.id ? conv.seller_id : conv.buyer_id;
        }

        // Insert message
        const { data: message, error: insertErr } = await supabase
            .from("messages")
            .insert({
                conversation_id: convId,
                sender_id: auth.user.id,
                recipient_id: recipId,
                content: content.trim(),
            })
            .select()
            .single();

        if (insertErr) {
            throw insertErr;
        }

        // Update conversation last_message_at
        await supabase
            .from("conversations")
            .update({ last_message_at: new Date().toISOString() })
            .eq("id", convId);

        return NextResponse.json({ ok: true, message });
    } catch (err: any) {
        console.error("POST /api/messages error:", err);
        return NextResponse.json(
            { ok: false, error: err.message || "Internal server error" },
            { status: 500 }
        );
    }
}
