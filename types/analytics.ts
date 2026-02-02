// types/analytics.ts
export type AnalyticsTimeRange = "7d" | "30d" | "90d" | "all";

export type ProductAnalytics = {
    product_id: string;
    views_total: number;
    views_7d: number;
    views_30d: number;
    clicks_total: number;
    clicks_buy: number;
    clicks_link: number;
    saves_count: number;
    conversion_rate: number;
};

export type ShopAnalytics = {
    total_products: number;
    published_products: number;
    total_views: number;
    total_clicks: number;
    total_sales: number;
    total_revenue: number;
    average_price: number;
    follower_count: number;
};

export type TimeSeriesData = {
    date: string;
    views: number;
    clicks: number;
    sales: number;
    revenue: number;
};

export type TopProduct = {
    id: string;
    title: string;
    cover_image_url: string | null;
    views: number;
    clicks: number;
    revenue: number;
};
