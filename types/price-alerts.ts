// types/price-alerts.ts
export type PriceAlert = {
    id: string;
    user_id: string;
    product_id: string;
    target_price: number;
    current_price: number;
    is_active: boolean;
    triggered_at: string | null;
    created_at: string;

    // Join data
    product_title?: string | null;
    product_image?: string | null;
};

export type PriceAlertActionState = {
    ok: boolean;
    error: string | null;
    alert?: PriceAlert;
};

export type PriceHistory = {
    product_id: string;
    price: number;
    recorded_at: string;
};
