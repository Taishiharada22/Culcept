// app/start/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import RecommendationsClient from "@/app/components/RecommendationsClient";
import BuyerSwipeClient from "@/app/components/BuyerSwipeClient";
import StartPageWrapper from "./StartPageWrapper";

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
        <StartPageWrapper>
            {isSeller ? (
                <div className="grid gap-4">
                    {/* Seller Mode Card */}
                    <div className="relative rounded-3xl overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/20 via-orange-500/10 to-transparent" />
                        <div className="absolute inset-0 bg-white/5 backdrop-blur-xl" />
                        <div className="relative p-6">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-2xl">
                                    💼
                                </div>
                                <div>
                                    <h2 className="text-xl font-black text-white">Seller Mode</h2>
                                    <p className="text-white/60 text-sm">出品者として活動中</p>
                                </div>
                            </div>
                            <p className="text-white/70 text-sm mb-4">
                                Insightsを確認して、出品改善のヒントを集めましょう。
                            </p>
                            <div className="flex flex-wrap gap-3">
                                <Link
                                    href="/shops/me/insights"
                                    className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 rounded-full font-bold text-sm shadow-lg shadow-amber-500/30 hover:shadow-xl transition-all"
                                >
                                    📊 Go to Insights
                                </Link>
                                <Link
                                    href={`/shops/${myShop?.slug ?? ""}`}
                                    className="px-5 py-2.5 bg-white/10 backdrop-blur-sm rounded-full font-medium text-sm hover:bg-white/20 transition-all border border-white/20"
                                >
                                    🏪 My Shop
                                </Link>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="grid gap-4">
                    {/* Buyer Mode Card */}
                    <div className="relative rounded-3xl overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-br from-purple-500/20 via-pink-500/10 to-transparent" />
                        <div className="absolute inset-0 bg-white/5 backdrop-blur-xl" />
                        <div className="relative p-6">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-2xl">
                                    👆
                                </div>
                                <div>
                                    <h2 className="text-xl font-black text-white">Swipe to Learn</h2>
                                    <p className="text-white/60 text-sm">AIがあなたの好みを学習中</p>
                                </div>
                            </div>
                            <p className="text-white/70 text-sm">
                                Like/Skip/Saveを繰り返すほど、AIの精度が上がります。
                            </p>
                        </div>
                    </div>

                    {/* Swipe Cards */}
                    <BuyerSwipeClient limit={25} />

                    {/* Recommendations */}
                    <RecommendationsClient role="buyer" limit={10} />
                </div>
            )}
        </StartPageWrapper>
    );
}
