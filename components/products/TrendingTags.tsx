// components/products/TrendingTags.tsx
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { TrendingUp } from "lucide-react";

export default async function TrendingTags({ limit = 12 }: { limit?: number }) {
    const supabase = await supabaseServer();

    // Get all products with tags from the last 30 days
    const { data } = await supabase
        .from("v_drops_ranked_30d_v2")
        .select("tags,hot_score")
        .not("tags", "is", null)
        .order("hot_score", { ascending: false })
        .limit(200);

    if (!data || data.length === 0) return null;

    // Count tag frequency weighted by hot_score
    const tagScores = new Map<string, number>();

    data.forEach((product: any) => {
        const tags = Array.isArray(product.tags) ? product.tags : [];
        const score = Number(product.hot_score || 0);

        tags.forEach((tag: string) => {
            const t = String(tag).trim();
            if (t) {
                tagScores.set(t, (tagScores.get(t) || 0) + score);
            }
        });
    });

    // Sort by score and take top N
    const trending = Array.from(tagScores.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([tag]) => tag);

    if (trending.length === 0) return null;

    return (
        <section className="rounded-3xl border-2 border-slate-200 bg-gradient-to-br from-white to-orange-50/20 p-6 shadow-lg">
            <div className="flex items-center gap-3 mb-6">
                <div className="rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 p-2.5">
                    <TrendingUp className="h-5 w-5 text-white" />
                </div>
                <div>
                    <h3 className="text-lg font-black text-slate-900">Trending Now</h3>
                    <p className="text-xs font-semibold text-slate-500">
                        Popular tags this week
                    </p>
                </div>
            </div>

            <div className="flex flex-wrap gap-2">
                {trending.map((tag, idx) => (
                    <Link
                        key={tag}
                        href={`/products?tags=${encodeURIComponent(tag)}`}
                        className="group relative overflow-hidden rounded-xl border-2 border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition-all duration-200 hover:border-orange-400 hover:text-orange-600 hover:shadow-lg hover:-translate-y-0.5 no-underline"
                        style={{
                            animation: `fadeInUp 0.4s ease-out ${idx * 0.05}s forwards`,
                            opacity: 0,
                        }}
                    >
                        <style jsx>{`
                            @keyframes fadeInUp {
                                from {
                                    opacity: 0;
                                    transform: translateY(10px);
                                }
                                to {
                                    opacity: 1;
                                    transform: translateY(0);
                                }
                            }
                        `}</style>

                        {/* Animated background on hover */}
                        <div className="absolute inset-0 bg-gradient-to-r from-orange-400/0 via-orange-400/10 to-orange-400/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />

                        <span className="relative flex items-center gap-1.5">
                            #{tag}
                            {idx < 3 && (
                                <span className="text-[10px] font-black text-orange-500">
                                    🔥
                                </span>
                            )}
                        </span>
                    </Link>
                ))}
            </div>

            <div className="mt-6 pt-6 border-t border-slate-200">
                <Link
                    href="/products?sort=popular"
                    className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 px-6 py-3 text-sm font-black text-white shadow-lg transition-all duration-200 hover:shadow-xl hover:scale-105 no-underline"
                >
                    <TrendingUp className="h-4 w-4" />
                    Explore Popular Products
                </Link>
            </div>
        </section>
    );
}
