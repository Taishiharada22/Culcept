// app/try-on/page.tsx
import TryOnPageClient from "./TryOnPageClient";

export const metadata = {
    title: "AI Virtual Try-On | Culcept",
    description: "AIバーチャル試着で購入前にコーディネートをチェック",
};

export default function TryOnPage() {
    return <TryOnPageClient />;
}
