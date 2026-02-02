// app/messages/page.tsx
import { supabaseServer } from "@/lib/supabase/server";
import MessageCenter from "@/components/messages/MessageCenter";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function MessagesPage() {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();

    if (!auth?.user) {
        redirect("/login?next=/messages");
    }

    const userId = auth.user.id;

    // 自分が参加している会話を取得
    const { data: conversations, error } = await supabase
        .from("conversations")
        .select(
            `
        *,
        product:product_id(id,title,cover_image_url),
        buyer:buyer_id(id,raw_user_meta_data),
        seller:seller_id(id,raw_user_meta_data),
        unread:v_conversation_unread_counts!inner(unread_count)
      `
        )
        .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
        .order("last_message_at", { ascending: false });

    if (error) {
        console.warn("conversations fetch error:", error.message);
    }

    // Format conversations
    const formattedConversations = (conversations || []).map((conv: any) => {
        const isBuyer = conv?.buyer_id === userId;
        const otherUser = isBuyer ? conv?.seller : conv?.buyer;

        return {
            id: conv?.id,
            product_id: conv?.product_id,
            buyer_id: conv?.buyer_id,
            seller_id: conv?.seller_id,
            last_message_at: conv?.last_message_at,
            created_at: conv?.created_at,

            // ✅ isUser ではなく isBuyer を使う
            other_user_id: isBuyer ? conv?.seller_id : conv?.buyer_id,
            other_user_name: otherUser?.raw_user_meta_data?.name || null,
            other_user_avatar: otherUser?.raw_user_meta_data?.avatar_url || null,

            product_title: conv?.product?.title || null,
            product_image: conv?.product?.cover_image_url || null,

            // unread は join の仕方によって配列/単体どちらもあり得るので両対応
            unread_count: Array.isArray(conv?.unread)
                ? conv.unread?.[0]?.unread_count ?? 0
                : conv?.unread?.unread_count ?? 0,
        };
    });

    return (
        <div className="max-w-7xl mx-auto px-6 py-12">
            <h1 className="text-4xl font-black mb-8">Messages</h1>

            <MessageCenter conversations={formattedConversations} userId={userId} />
        </div>
    );
}
