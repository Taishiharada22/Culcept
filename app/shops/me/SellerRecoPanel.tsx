// app/shops/me/SellerRecoPanel.tsx
"use client";

import RecommendationsClient from "@/app/components/RecommendationsClient";

export default function SellerRecoPanel() {
    return <RecommendationsClient role="seller" limit={10} />;
}
