// app/start/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import RecommendationsClient from "@/app/components/RecommendationsClient";
import BuyerSwipeClient from "@/app/components/BuyerSwipeClient";

export const dynamic = "force-dynamic";

export default async function StartPage() {
    const supabase = await supabaseServer();
    const { data } = await supabase.auth.getUser();
    const user = data?.user;
    if (!user) redirect("/login?next=/start");

    const { data: myShop } = await supabase
        .from("shops")
        .select("id, slug, is_active")
        .eq("owner_id", user.id)
        .maybeSingle();

    const isSeller = !!myShop?.id;

    return (
        <div className="grid gap-6">
            <div className="flex items-center justify-between gap-3">
                <h1 className="text-2xl font-extrabold">Start</h1>
                <div className="flex gap-2">
                    <Link href="/Products" className="rounded-xl border px-4 py-2 hover:bg-zinc-50 font-extrabold text-sm">
                        Products
                    </Link>
                    <Link href="/me/saved" className="rounded-xl border px-4 py-2 hover:bg-zinc-50 font-extrabold text-sm">
                        Saved
                    </Link>
                </div>
            </div>

            {isSeller ? (
                <div className="grid gap-3">
                    <div className="rounded-2xl border bg-white p-5">
                        <div className="text-sm font-extrabold text-zinc-900">Seller mode</div>
                        <div className="mt-2 text-sm font-semibold text-zinc-600">まずは Insights を回して、出品改善のヒントを集めよう。</div>
                        <div className="mt-4 flex flex-wrap gap-2">
                            <Link href="/shops/me/insights" className="rounded-xl bg-black text-white px-4 py-2 font-extrabold text-sm hover:opacity-90">
                                Go to Insights
                            </Link>
                            <Link href={`/shops/${myShop?.slug ?? ""}`} className="rounded-xl border px-4 py-2 font-extrabold text-sm hover:bg-zinc-50">
                                My Shop
                            </Link>
                        </div>
                    </div>

                    {/* sellerにも出したいなら有効化 */}
                    {/* <BuyerSwipeClient limit={25} /> */}
                </div>
            ) : (
                <div className="grid gap-3">
                    <div className="rounded-2xl border bg-white p-5">
                        <div className="text-sm font-extrabold text-zinc-900">Buyer mode</div>
                        <div className="mt-2 text-sm font-semibold text-zinc-600">ここで Like/Skip/Save を回すほど精度が上がる。</div>
                    </div>

                    {/* ✅ Swipeカード */}
                    <BuyerSwipeClient limit={25} />

                    {/* 既存の推薦も残すなら下も */}
                    <RecommendationsClient role="buyer" limit={10} />
                </div>
            )}
        </div>
    );
}
