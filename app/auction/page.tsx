// app/auction/page.tsx
import { Metadata } from "next";
import AuctionPageClient from "./AuctionPageClient";

export const metadata: Metadata = {
    title: "ライブオークション | Culcept",
    description: "リアルタイムで入札！限定アイテムをオークションで手に入れよう",
};

export default function AuctionPage() {
    return <AuctionPageClient />;
}
