// app/shops/me/imported/page.tsx
import { supabaseServer } from "@/lib/supabase/server";
import { CopyToDraftDropButton } from "./CopyToDraftDropButton";

export const dynamic = "force-dynamic";

export default async function ImportedProductsPage() {
    const sb = await supabaseServer();
    const { data: userRes } = await sb.auth.getUser();
    const user = userRes?.user;
    if (!user) return <div className="p-6">Unauthorized</div>;

    const { data: shops } = await sb
        .from("external_shops")
        .select("id, shop_url, last_imported_at")
        .eq("owner_user_id", user.id)
        .order("last_imported_at", { ascending: false });

    const shopIds = (shops ?? []).map((s) => s.id);

    const { data: products } = shopIds.length
        ? await sb
            .from("external_products")
            .select("id, shop_id, title, price, currency, image_urls, product_url, source_url, fetched_at")
            .in("shop_id", shopIds)
            .order("fetched_at", { ascending: false })
            .limit(200)
        : { data: [] as any[] };

    return (
        <div className="p-6 space-y-4">
            <h1 className="text-xl font-semibold">Imported Products</h1>

            {(!products || products.length === 0) ? (
                <div className="opacity-70">まだ取り込みがありません。</div>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {products.map((p) => (
                        <div key={p.id} className="rounded-xl border p-4 space-y-2">
                            {Array.isArray(p.image_urls) && p.image_urls[0] ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={p.image_urls[0]} alt="" className="w-full aspect-square object-cover rounded-lg border" />
                            ) : null}

                            <div className="font-medium line-clamp-2">{p.title ?? "(no title)"}</div>

                            <div className="text-sm opacity-80">
                                {p.price != null ? `${p.price} ${p.currency ?? ""}` : "price: -"}
                            </div>

                            <div className="text-xs opacity-60 break-all">
                                <div>source: <a className="underline" href={p.source_url ?? p.product_url ?? ""} target="_blank" rel="noreferrer">
                                    {p.source_url ?? p.product_url ?? ""}
                                </a></div>
                            </div>

                            <CopyToDraftDropButton externalProductId={p.id} />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
