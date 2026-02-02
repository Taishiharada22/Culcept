// app/search/page.tsx
import { supabaseServer } from "@/lib/supabase/server";
import AISearchBar from "@/components/search/AISearchBar";
import ProductCard from "@/components/products/ProductCard";

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
        <div className="max-w-7xl mx-auto px-6 py-12">
            <h1 className="text-5xl font-black mb-3">AI Search</h1>
            <p className="text-lg font-semibold text-slate-600 mb-8">
                Search using natural language
            </p>

            <div className="mb-12">
                <AISearchBar initialQuery={query} />
            </div>

            {interpretation && (
                <div className="mb-8 rounded-xl border-2 border-purple-200 bg-purple-50/50 p-6">
                    <h3 className="text-base font-black text-slate-900 mb-2">
                        Query Interpretation
                    </h3>
                    <div className="text-sm font-semibold text-slate-700 space-y-1">
                        <div>Intent: {interpretation.intent}</div>
                        {Object.keys(interpretation.extracted_filters).length > 0 && (
                            <div>
                                Filters: {JSON.stringify(interpretation.extracted_filters)}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {products.length > 0 ? (
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {products.map((product) => (
                        <div key={product.id}>
                            <ProductCard product={product} />
                            <div className="mt-2 text-xs font-semibold text-slate-600">
                                Match: {product.match_reason}
                            </div>
                        </div>
                    ))}
                </div>
            ) : query ? (
                <div className="text-center text-slate-600 py-16">
                    No products found for "{query}"
                </div>
            ) : null}
        </div>
    );
}