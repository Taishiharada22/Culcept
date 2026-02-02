// types/messages.ts
export type Message = {
    id: string;
    conversation_id: string;
    sender_id: string;
    recipient_id: string;
    product_id: string | null;
    content: string;
    is_read: boolean;
    created_at: string;

    // Join data
    sender_name?: string | null;
    sender_avatar?: string | null;
    product_title?: string | null;
    product_image?: string | null;
};

export type Conversation = {
    id: string;
    product_id: string | null;
    buyer_id: string;
    seller_id: string;
    last_message_at: string;
    created_at: string;

    // Join data
    other_user_id?: string;
    other_user_name?: string | null;
    other_user_avatar?: string | null;
    product_title?: string | null;
    product_image?: string | null;
    unread_count?: number;
    last_message?: string | null;
};

export type MessageActionState = {
    ok: boolean;
    error: string | null;
    message?: Message;
};
