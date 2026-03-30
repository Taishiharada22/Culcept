// app/search/page.tsx
import AISearchBar from "@/components/search/AISearchBar";
import ProductCard from "@/components/products/ProductCard";
import SearchPageWrapper from "./SearchPageWrapper";

export default async function SearchPage({
    searchParams,
}: {
    searchParams?: Promise<{ q?: string }>;
}) {
    const sp = await searchParams;
    const query = sp?.q || "";

    let products: any[] = [];
    let interpretation: any = null;

    if (query) {
        const res = await fetch(
            `${process.env.NEXT_PUBLIC_APP_URL}/api/ai-search?q=${encodeURIComponent(query)}`,
            { cache: "no-store" }
        );

        if (res.ok) {
            const data = await res.json();
            products = data.products || [];
            interpretation = data.query_interpretation;
        }
    }

    return (
        <SearchPageWrapper
            query={query}
            products={products}
            interpretation={interpretation}
        />
    );
}
