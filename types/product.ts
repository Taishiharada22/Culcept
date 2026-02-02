// types/product.ts
// ✅ Drop → Product に完全移行

export type ProductStatus = "draft" | "published" | "sold" | "archived";

export type SaleMode = "fixed" | "auction";

export type ProductCondition = "damaged" | "well" | "good" | "almost_new";

export type ProductSize = "S" | "M" | "L" | "LL";

export type Product = {
    id: string;
    created_at: string;
    updated_at?: string;

    // Basic Info
    title: string;
    slug: string;
    description: string | null;

    // Metadata
    brand: string | null;
    size: ProductSize | string | null;
    condition: ProductCondition | string | null;
    tags: string[] | null;

    // Pricing
    price: number | null;
    display_price?: number | null;

    // Auction
    sale_mode: SaleMode | null;
    buy_now_price: number | null;
    auction_floor_price: number | null;
    auction_end_at: string | null;
    auction_allow_buy_now: boolean | null;
    auction_status: string | null;
    accepted_bid_id: string | null;
    highest_bid_30d?: number | null;
    is_auction_live?: boolean | null;

    // Media
    cover_image_url: string | null;

    // Links
    url: string | null;
    purchase_url: string | null;

    // Ownership
    user_id: string | null;
    shop_id: string | null;
    display_name?: string | null;

    // Shop Info (from joins)
    shop_slug?: string | null;
    shop_name_ja?: string | null;
    shop_name_en?: string | null;
    shop_avatar_url?: string | null;
    shop_headline?: string | null;

    // Status
    status?: ProductStatus | null;
    sold_at: string | null;
    is_sold: boolean | null;

    // Analytics
    hot_score?: number | null;
    clicks_total_30d?: number;
    clicks_buy_30d?: number;
    clicks_link_30d?: number;
    saves_count?: number;
};

export type ProductImage = {
    id: string;
    product_id: string;
    public_url: string;
    path: string;
    sort: number;
    created_at?: string;
};

export type ProductBid = {
    id: string;
    product_id: string;
    bidder_user_id: string;
    amount: number;
    status: "active" | "accepted" | "rejected" | "withdrawn";
    created_at: string;
};

// Form types
export type ProductFormData = {
    title: string;
    brand?: string;
    size?: string;
    condition?: string;
    price?: number;
    url?: string;
    purchase_url?: string;
    description?: string;
    tags?: string[];

    // Auction fields
    sale_mode?: SaleMode;
    auction_floor_price?: number;
    auction_end_at?: string;
    auction_allow_buy_now?: boolean;
    buy_now_price?: number;
};

export type ProductActionState = {
    ok: boolean;
    error: string | null;
    message?: string | null;
    fieldErrors?: Record<string, string | undefined>;
};

// Collection (Saved) types
export type SavedProduct = {
    id: string;
    user_id: string;
    product_id: string;
    created_at: string;
};

// Filter types
export type ProductFilters = {
    q?: string;
    shop?: string;
    brand?: string;
    size?: string;
    condition?: string;
    tags?: string[];
    minPrice?: number;
    maxPrice?: number;
    hasImage?: boolean;
    hasBuy?: boolean;
    saleMode?: SaleMode;
    sort?: "new" | "old" | "popular" | "price_asc" | "price_desc";
    mine?: boolean;
};

// Analytics types
export type ProductAnalytics = {
    product_id: string;
    views_total: number;
    views_7d: number;
    views_30d: number;
    clicks_total: number;
    clicks_buy: number;
    clicks_link: number;
    saves_count: number;
    last_viewed_at: string | null;
};
