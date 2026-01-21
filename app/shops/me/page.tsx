import Link from "next/link";
import { redirect } from "next/navigation";
import SellerRecoPanel from "./SellerRecoPanel";
import ShopForm from "./shop-form";
import { toggleShopActiveAction } from "./actions";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function MyShopPage() {
    const supabase = await supabaseServer();
    const { data } = await supabase.auth.getUser();
    const user = data?.user;
    if (!user) redirect("/login?next=/shops/me");

    const { data: shop } = await supabase
        .from("shops")
        .select("id,slug,name_ja,name_en,headline,bio,url,avatar_url,banner_url,style_tags,socials,is_active,created_at")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

    const { data: myDrops } = await supabase
        .from("drops")
        .select("id,created_at,title,brand,size,condition,price,purchase_url,url")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);

    return (
        <div className="space-y-10">
            {/* Header */}

            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold">My Shop</h1>
                    <p className="text-sm text-neutral-600 mt-1">出品者ダッシュボード（Shop管理 / Insight / Drops）</p>
                </div>
                <div className="flex gap-2">

                    <Link href="/shops/me/insights" className="rounded-xl border px-4 py-2 hover:bg-neutral-50">
                        Insights
                    </Link>
                    <Link href="/drops/new" className="rounded-xl bg-black text-white px-4 py-2 hover:opacity-90">
                        + 新規Drop
                    </Link>
                    {shop?.slug ? (
                        <Link href={`/shops/${shop.slug}`} className="rounded-xl border px-4 py-2 hover:bg-neutral-50">
                            公開ページを見る
                        </Link>
                    ) : null}
                </div>
            </div>

            {/* Seller reco */}
            <section className="space-y-3">
                <div className="flex items-baseline justify-between">
                    <h2 className="text-lg font-semibold">おすすめ（Seller Insight）</h2>
                    <span className="text-xs text-neutral-500">👍/保存/クリックが次の提案に効く</span>
                </div>
                <SellerRecoPanel />
            </section>

            {/* Shop editor */}
            <section className="space-y-3">
                <h2 className="text-lg font-semibold">Shop設定</h2>

                {shop?.id ? (
                    <div className="flex items-center gap-3">
                        <div className="text-sm text-neutral-700">
                            Status:{" "}
                            <span className={shop.is_active ? "text-green-700 font-semibold" : "text-neutral-500 font-semibold"}>
                                {shop.is_active ? "Active" : "Inactive"}
                            </span>
                        </div>

                        <form action={toggleShopActiveAction}>
                            <input type="hidden" name="shop_id" value={shop.id} />
                            <input type="hidden" name="next_active" value={shop.is_active ? "0" : "1"} />
                            <button className="rounded-xl border px-3 py-2 text-sm hover:bg-neutral-50">
                                {shop.is_active ? "非公開にする" : "公開する"}
                            </button>
                        </form>
                    </div>
                ) : (
                    <div className="text-sm text-neutral-600">まだShopがありません。まず作成してください。</div>
                )}

                <div className="rounded-2xl border bg-white p-5">
                    <ShopForm
                        shopId={shop?.id ?? null}
                        defaults={{
                            slug: shop?.slug ?? "",
                            name_ja: shop?.name_ja ?? "",
                            name_en: shop?.name_en ?? "",
                            headline: shop?.headline ?? "",
                            bio: (shop as any)?.bio ?? "",
                            url: (shop as any)?.url ?? "",
                            avatar_url: shop?.avatar_url ?? "",
                            banner_url: (shop as any)?.banner_url ?? "",
                            style_tags: (shop?.style_tags ?? []) as any,
                            socials: (shop as any)?.socials ?? {},
                            is_active: !!shop?.is_active,
                        }}
                    />
                </div>
            </section>

            {/* My drops */}
            <section className="space-y-3">
                <div className="flex items-baseline justify-between">
                    <h2 className="text-lg font-semibold">自分のDrops</h2>
                    <Link href="/drops/new" className="text-sm underline">
                        新規作成
                    </Link>
                </div>

                {myDrops?.length ? (
                    <div className="rounded-2xl border bg-white overflow-hidden">
                        <div className="divide-y">
                            {myDrops.map((d: any) => (
                                <div key={d.id} className="p-4 flex items-center justify-between gap-4">
                                    <div className="min-w-0">
                                        <div className="font-semibold break-words">{d.title ?? "(no title)"}</div>
                                        <div className="text-sm text-neutral-600 flex flex-wrap gap-x-3 gap-y-1 mt-1">
                                            {d.brand ? <span>{d.brand}</span> : null}
                                            {d.size ? <span>Size: {d.size}</span> : null}
                                            {d.condition ? <span>{d.condition}</span> : null}
                                            {d.price != null ? <span>¥{new Intl.NumberFormat("ja-JP").format(Number(d.price))}</span> : null}
                                        </div>
                                        <div className="text-xs text-neutral-500 mt-1">{String(d.created_at ?? "")}</div>
                                    </div>

                                    <div className="flex gap-2 shrink-0">
                                        <Link href={`/drops/${d.id}`} className="rounded-xl border px-3 py-2 text-sm hover:bg-neutral-50">
                                            公開
                                        </Link>
                                        <Link href={`/drops/${d.id}/edit`} className="rounded-xl border px-3 py-2 text-sm hover:bg-neutral-50">
                                            編集
                                        </Link>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="rounded-xl border p-5 text-sm text-neutral-600">
                        まだDropがありません。<Link className="underline" href="/drops/new">ここから作成</Link>。
                    </div>
                )}
            </section>
        </div>
    );
}
