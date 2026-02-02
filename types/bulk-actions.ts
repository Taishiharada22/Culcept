// types/bulk-actions.ts
export type BulkAction =
    | "publish"
    | "unpublish"
    | "delete"
    | "update_price"
    | "update_tags"
    | "update_status";

export type BulkActionState = {
    ok: boolean;
    error: string | null;
    processed?: number;
    failed?: number;
    details?: Array<{
        id: string;
        success: boolean;
        error?: string;
    }>;
};

export type BulkPriceUpdate = {
    type: "fixed" | "percentage";
    value: number; // absolute price or percentage (e.g., -10 for 10% off)
};

export type BulkTagUpdate = {
    action: "add" | "remove" | "replace";
    tags: string[];
};
