// app/ar-shop/page.tsx
import { Metadata } from "next";
import ARShopClient from "./ARShopClient";

export const metadata: Metadata = {
    title: "AR Space Shopping | Culcept",
    description: "3D空間でショッピング体験。商品を360度から確認できる没入型体験",
};

export default function ARShopPage() {
    return <ARShopClient />;
}
