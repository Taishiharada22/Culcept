// components/products/RecentlyViewedTracker.tsx
"use client";

import * as React from "react";

const MAX_RECENT = 20;
const STORAGE_KEY = "culcept_recently_viewed";

export type RecentProduct = {
    id: string;
    title: string;
    cover_image_url: string | null;
    price: number | null;
    shop_slug: string | null;
    viewedAt: number;
};

export function useRecentlyViewed() {
    const [recent, setRecent] = React.useState<RecentProduct[]>([]);

    // Load from localStorage on mount
    React.useEffect(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored) as RecentProduct[];
                // Sort by viewedAt descending
                const sorted = parsed.sort((a, b) => b.viewedAt - a.viewedAt);
                setRecent(sorted.slice(0, MAX_RECENT));
            }
        } catch (err) {
            console.warn("Failed to load recently viewed:", err);
        }
    }, []);

    const addToRecent = React.useCallback((product: Omit<RecentProduct, "viewedAt">) => {
        setRecent(prev => {
            // Remove if already exists
            const filtered = prev.filter(p => p.id !== product.id);

            // Add to front
            const updated = [
                { ...product, viewedAt: Date.now() },
                ...filtered,
            ].slice(0, MAX_RECENT);

            // Save to localStorage
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
            } catch (err) {
                console.warn("Failed to save recently viewed:", err);
            }

            return updated;
        });
    }, []);

    const clearRecent = React.useCallback(() => {
        setRecent([]);
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch (err) {
            console.warn("Failed to clear recently viewed:", err);
        }
    }, []);

    return { recent, addToRecent, clearRecent };
}

// Component to track product view
export default function RecentlyViewedTracker({
    product,
}: {
    product: {
        id: string;
        title: string;
        cover_image_url: string | null;
        price: number | null;
        shop_slug?: string | null;
    };
}) {
    const { addToRecent } = useRecentlyViewed();

    React.useEffect(() => {
        // Add to recently viewed after a short delay (user actually viewing)
        const timer = setTimeout(() => {
            addToRecent({
                id: product.id,
                title: product.title,
                cover_image_url: product.cover_image_url,
                price: product.price,
                shop_slug: product.shop_slug ?? null,
            });
        }, 2000); // 2 second delay

        return () => clearTimeout(timer);
    }, [product, addToRecent]);

    return null;
}
