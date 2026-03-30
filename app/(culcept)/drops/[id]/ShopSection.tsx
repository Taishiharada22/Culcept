// app/drops/[id]/ShopSection.tsx
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import ShopMiniCard from "@/app/components/ShopMiniCard";

function yen(n: unknown): string | null {
    const num = typeof n === "number" ? n : Number(String(n ?? ""));
    if (!Number.isFinite(num)) return null;
    return "¥" + new Intl.NumberFormat("ja-JP").format(Math.round(num));
}

type Props = {
    dropId: string;
    shopSlug: string | null;
    shopNameJa?: string | null;
    shopNameEn?: string | null;
    shopAvatarUrl?: string | null;
    shopHeadline?: string | null;
};

type DropRow = {
    id: string;
    title: string | null;
    cover_image_url: string | null;
    display_price: number | null;
    hot_score: number | null;
    created_at: string;
};

export default async function ShopSection({
    dropId,
    shopSlug,
    shopNameJa,
    shopNameEn,
    shopAvatarUrl,
    shopHeadline,
}: Props) {
    if (!shopSlug) return null;

    const supabase = await supabaseServer();

    const { data: others, error } = await supabase
        .from("v_drops_ranked_30d_v2")
        .select("id, title, cover_image_url, display_price, hot_score, created_at")
        .eq("shop_slug", shopSlug)
        .neq("id", dropId)
        .order("hot_score", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(12)
        .returns<DropRow[]>();

    return (
        <section className="mt-8">
            <h3 className="text-base font-semibold">この商品は誰の店？</h3>

            <div className="mt-3">
                <ShopMiniCard
                    slug={shopSlug}
                    nameJa={shopNameJa}
                    nameEn={shopNameEn}
                    avatarUrl={shopAvatarUrl}
                    headline={shopHeadline}
                />
            </div>

            <div className="mt-8 flex items-baseline justify-between">
                <h3 className="text-base font-semibold">このショップの他の商品</h3>
                <Link href={`/shops/${shopSlug}`} className="text-sm text-neutral-600 hover:underline">
                    ショップを見る →
                </Link>
            </div>

            {error ? (
                <div className="mt-3 rounded-xl border bg-red-50 p-4 text-sm text-red-700">
                    {String(error.message ?? error)}
                </div>
            ) : !others || others.length === 0 ? (
                <div className="mt-3 rounded-xl border bg-neutral-50 p-6 text-sm text-neutral-600">
                    他の商品はまだありません。
                </div>
            ) : (
                <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3">
                    {others.map((d) => (
                        <Link
                            key={d.id}
                            href={`/drops/${d.id}`}
                            className="group overflow-hidden rounded-2xl border bg-white shadow-sm transition hover:shadow-md"
                        >
                            <div className="aspect-square w-full bg-neutral-100">
                                {d.cover_image_url ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={d.cover_image_url}
                                        alt={d.title ?? "Drop"}
                                        className="h-full w-full object-cover transition group-hover:scale-[1.02]"
                                    />
                                ) : null}
                            </div>
                            <div className="p-3">
                                <div className="line-clamp-2 text-sm font-medium text-neutral-900">
                                    {d.title ?? "Drop"}
                                </div>
                                <div className="mt-1 text-xs text-neutral-600">
                                    {yen(d.display_price ?? null) ?? " "}
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </section>
    );
}
