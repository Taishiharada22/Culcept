// components/products/RelatedProducts.tsx
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { Product } from "@/types/product";

function fmt(n: unknown) {
    const num = typeof n === "number" ? n : Number(String(n ?? ""));
    if (!Number.isFinite(num)) return "";
    return Math.round(num).toLocaleString("ja-JP");
}

type RelatedProductsProps = {
    currentProduct: {
        id: string;
        brand: string | null;
        tags: string[] | null;
        size: string | null;
        shop_slug: string | null;
    };
    limit?: number;
};

export default async function RelatedProducts({
    currentProduct,
    limit = 12
}: RelatedProductsProps) {
    const supabase = await supabaseServer();

    // Build query for related products
    let query = supabase
        .from("v_drops_ranked_30d_v2")
        .select(
            "id,title,brand,size,price,cover_image_url,display_price,shop_slug,shop_name_ja,shop_name_en,shop_avatar_url,tags"
        )
        .neq("id", currentProduct.id)
        .order("hot_score", { ascending: false })
        .limit(limit);

    // Priority 1: Same brand
    if (currentProduct.brand) {
        query = query.ilike("brand", `%${currentProduct.brand}%`);
    }
    // Priority 2: Same shop (if no brand match)
    else if (currentProduct.shop_slug) {
        query = query.eq("shop_slug", currentProduct.shop_slug);
    }
    // Priority 3: Similar tags
    else if (currentProduct.tags && currentProduct.tags.length > 0) {
        query = query.overlaps("tags", currentProduct.tags);
    }
    // Fallback: Same size
    else if (currentProduct.size) {
        query = query.eq("size", currentProduct.size);
    }

    const { data, error } = await query;

    if (error || !data || data.length === 0) {
        return null;
    }

    return (
        <section className="rounded-3xl border-2 border-slate-200 bg-white p-6 shadow-lg">
            <div className="mb-6">
                <h3 className="text-2xl font-black text-slate-900 mb-2">
                    You Might Also Like
                </h3>
                <p className="text-sm font-semibold text-slate-600">
                    Similar products based on brand, style, and category
                </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {data.map((product: any) => (
                    <Link
                        key={product.id}
                        href={`/products/${product.id}`}
                        className="group block no-underline"
                    >
                        <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white transition-all duration-300 hover:shadow-xl hover:-translate-y-1">
                            {/* Image */}
                            <div className="relative aspect-square overflow-hidden bg-slate-100">
                                {product.cover_image_url ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={product.cover_image_url}
                                        alt={product.title}
                                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                                        loading="lazy"
                                    />
                                ) : (
                                    <div className="flex h-full w-full items-center justify-center text-5xl opacity-10">
                                        📦
                                    </div>
                                )}

                                {/* Hover Overlay */}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                            </div>

                            {/* Content */}
                            <div className="p-4 space-y-2">
                                {/* Shop Badge */}
                                {product.shop_slug && (
                                    <div className="flex items-center gap-1.5">
                                        {product.shop_avatar_url ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                                src={product.shop_avatar_url}
                                                alt=""
                                                className="h-4 w-4 rounded-full border border-slate-200 object-cover"
                                                loading="lazy"
                                            />
                                        ) : null}
                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide truncate">
                                            {product.shop_name_ja || product.shop_name_en || product.shop_slug}
                                        </span>
                                    </div>
                                )}

                                {/* Title */}
                                <h4 className="line-clamp-2 text-sm font-bold text-slate-900 leading-snug min-h-[2.5rem]">
                                    {product.title}
                                </h4>

                                {/* Meta */}
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide truncate">
                                        {product.brand || product.size || " "}
                                    </span>

                                    {(product.display_price ?? product.price) != null && (
                                        <span className="shrink-0 rounded-lg bg-gradient-to-r from-orange-500 to-orange-600 px-2.5 py-1 text-xs font-black text-white">
                                            ¥{fmt(product.display_price ?? product.price)}
                                        </span>
                                    )}
                                </div>

                                {/* Tags */}
                                {product.tags && product.tags.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                        {product.tags.slice(0, 2).map((tag: string) => (
                                            <span
                                                key={tag}
                                                className="text-[9px] font-bold text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded uppercase tracking-wide"
                                            >
                                                {tag}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </article>
                    </Link>
                ))}
            </div>

            {/* View All Link */}
            {currentProduct.brand && (
                <div className="mt-6 text-center">
                    <Link
                        href={`/products?brand=${encodeURIComponent(currentProduct.brand)}`}
                        className="inline-block rounded-xl border-2 border-slate-200 bg-white px-6 py-3 text-sm font-black text-slate-700 transition-all hover:border-orange-400 hover:text-orange-600 no-underline"
                    >
                        View All {currentProduct.brand} Products →
                    </Link>
                </div>
            )}
        </section>
    );
}
