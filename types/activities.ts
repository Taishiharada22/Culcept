// types/activities.ts
export type ActivityType =
    | "new_product"
    | "review"
    | "purchase"
    | "follow"
    | "price_drop";

export type Activity = {
    id: string;
    user_id: string;
    activity_type: ActivityType;
    product_id: string | null;
    shop_slug: string | null;
    metadata: Record<string, any> | null;
    created_at: string;

    // Join data
    user_name?: string | null;
    user_avatar?: string | null;
    product_title?: string | null;
    product_image?: string | null;
    shop_name?: string | null;
};

export type ActivityFeedItem = Activity & {
    display_text: string;
    action_url: string;
};
