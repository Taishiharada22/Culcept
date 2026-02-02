// types/follows.ts
export type ShopFollow = {
    id: string;
    user_id: string;
    shop_slug: string;
    created_at: string;
};

export type FollowStats = {
    shop_slug: string;
    follower_count: number;
    following_count?: number; // ストアがフォローしてる数（将来用）
};

export type FollowActionState = {
    ok: boolean;
    error: string | null;
    isFollowing?: boolean;
};

export type UserFollow = {
    id: string;
    follower_id: string;
    following_id: string;
    created_at: string;
};
