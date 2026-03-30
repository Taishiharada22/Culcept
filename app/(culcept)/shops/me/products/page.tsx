// app/shops/me/products/page.tsx
import { supabaseServer } from "@/lib/supabase/server";
import ProductSelectionGrid from "@/components/seller/ProductSelectionGrid";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function MyProductsPage() {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();

    if (!auth?.user) {
        redirect("/login?next=/shops/me/products");
    }

    // 自分の商品を取得
    const { data: products } = await supabase
        .from("drops")
        .select("id,title,price,cover_image_url,status,created_at")
        .eq("user_id", auth.user.id)
        .order("created_at", { ascending: false });

    const { data: myShop } = await supabase
        .from("shops")
        .select("id,slug,name_ja,name_en,status,is_active")
        .eq("owner_id", auth.user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    const shopName = myShop?.name_ja || myShop?.name_en || "My Shop";
    const isPublished = myShop?.status === "published" || !!myShop?.is_active;
    const shopHref = myShop?.slug
        ? isPublished
            ? `/shops/${myShop.slug}`
            : `/shops/me?shop_id=${encodeURIComponent(String(myShop.id))}`
        : "/shops/me";
    const productCount = products?.length ?? 0;
    const draftCount = (products ?? []).filter((product) => product.status !== "published").length;

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
            <section className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <div className="text-xs font-bold tracking-[0.2em] uppercase text-slate-400">Seller Nav</div>
                    <h1 className="mt-1 text-3xl font-black text-slate-900">出品</h1>
                    <p className="mt-2 text-sm text-slate-600">
                        ショップへ移動、新規出品、既存商品の編集をここからまとめて進めます。
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-2 py-2">
                    <Link
                        href="/shops/me/products"
                        className="rounded-full bg-slate-900 px-4 py-2 text-sm font-bold text-white no-underline"
                    >
                        出品
                    </Link>
                    <Link
                        href="/shops"
                        className="rounded-full px-4 py-2 text-sm font-semibold text-slate-600 no-underline hover:text-slate-900"
                    >
                        Vintage
                    </Link>
                    <Link
                        href="/shops/luxury"
                        className="rounded-full px-4 py-2 text-sm font-semibold text-slate-600 no-underline hover:text-slate-900"
                    >
                        Luxury
                    </Link>
                </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-[1.4fr,1fr]">
                <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 p-6 text-white shadow-xl">
                    <div className="text-xs font-bold tracking-[0.2em] uppercase text-indigo-300">Seller Studio</div>
                    <div className="mt-2 text-3xl font-black">ショップと出品をまとめて管理</div>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                        「ショップへ行く」からショップ側へ移動できます。新しい商品は「新規出品」、既存商品はこの下の一覧から「編集」に入れます。
                    </p>

                    <div className="mt-5 flex flex-wrap gap-3">
                        <Link
                            href={shopHref}
                            className="rounded-2xl bg-white px-5 py-3 text-sm font-bold text-slate-900 no-underline shadow-lg hover:bg-slate-100"
                        >
                            ショップへ行く
                        </Link>
                        <Link
                            href="/drops/new"
                            className="rounded-2xl border border-white/30 px-5 py-3 text-sm font-bold text-white no-underline hover:bg-white/10"
                        >
                            新規出品
                        </Link>
                    </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
                    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Shop</div>
                        <div className="mt-2 text-xl font-black text-slate-900">{shopName}</div>
                        <div className="mt-2 text-sm text-slate-500">
                            {myShop
                                ? isPublished
                                    ? "公開中のショップへ移動できます。"
                                    : "ショップは下書きです。管理画面へ移動します。"
                                : "まだショップがない場合は管理画面から作成できます。"}
                        </div>
                    </div>
                    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Products</div>
                        <div className="mt-2 text-3xl font-black text-slate-900">{productCount}</div>
                        <div className="mt-2 text-sm text-slate-500">現在の出品数</div>
                    </div>
                    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Edit</div>
                        <div className="mt-2 text-3xl font-black text-slate-900">{draftCount}</div>
                        <div className="mt-2 text-sm text-slate-500">編集・見直し中の商品</div>
                    </div>
                </div>
            </section>

            <section id="product-grid" className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <div className="text-sm font-bold text-slate-900">既存商品の編集</div>
                        <div className="text-sm text-slate-500">
                            下のカードから詳細確認と編集に入れます。
                        </div>
                    </div>
                </div>
                <ProductSelectionGrid products={products || []} />
            </section>
        </div>
    );
}
