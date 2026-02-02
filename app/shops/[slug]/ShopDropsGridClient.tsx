// app/shops/[slug]/ShopDropsGridClient.tsx
"use client";

import * as React from "react";
import DropCard from "@/app/drops/DropCard";

type ToggleRes = { ok: boolean; saved: boolean; error?: string };

export default function ShopDropsGridClient({
    drops,
    shopSlug,
    impressionId,
    showSave,
    savedDropIds,
    toggleSaveAction,
}: {
    drops: any[];
    shopSlug: string;
    impressionId: string;
    showSave: boolean;
    savedDropIds: string[];
    toggleSaveAction: (id: string) => Promise<ToggleRes>;
}) {
    const savedSet = React.useMemo(() => new Set(savedDropIds ?? []), [savedDropIds]);

    // DropCard に渡す “JSONメタ” だけ用意（関数は渡さない）
    const clickMeta = React.useMemo(
        () => ({
            where: "shop_drop_click",
            where_shop: "shop_drop_shop_click",
            shop_slug: shopSlug,
        }),
        [shopSlug]
    );

    return (
        <ul className="grid list-none gap-4 p-0 md:grid-cols-2 lg:grid-cols-3">
            {(drops ?? []).map((d: any) => (
                <DropCard
                    key={d.id}
                    d={d}
                    imp={impressionId}
                    clickMeta={clickMeta}
                    showSave={showSave}
                    initialSaved={savedSet.has(d.id)}
                    toggleSaveAction={toggleSaveAction}
                />
            ))}
        </ul>
    );
}
