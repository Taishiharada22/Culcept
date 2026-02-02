// types/reviews.ts
export type Review = {
    id: string;
    product_id: string;
    user_id: string;
    rating: number; // 1-5
    title: string | null;
    content: string | null;
    verified_purchase: boolean;
    helpful_count: number;
    created_at: string;
    updated_at: string;

    // Join data
    user_name?: string | null;
    user_avatar?: string | null;
    product_title?: string | null;
};

export type ReviewStats = {
    product_id: string;
    total_reviews: number;
    average_rating: number;
    rating_distribution: {
        1: number;
        2: number;
        3: number;
        4: number;
        5: number;
    };
};

export type ReviewFormData = {
    product_id: string;
    rating: number;
    title?: string;
    content?: string;
};

export type ReviewActionState = {
    ok: boolean;
    error: string | null;
    review?: Review;
};
