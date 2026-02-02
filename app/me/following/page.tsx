// app/me/following/page.tsx
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import FollowingList from "@/components/follows/FollowingList";

export const dynamic = "force-dynamic";

export default async function FollowingPage() {
    const supabase = await supabaseServer();

    // ✅ auth.user の取り方を正しく（型エラー回避）
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect("/login?next=/me/following");
    }

    // ✅ フォロー中のslug一覧（JOINに依存しない）
    const { data: follows, error: followsErr } = await supabase
        .from("shop_follows")
        .select("shop_slug, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

    if (followsErr) {
        // ここは好みで notFound や error UI にしてもOK
        console.error("shop_follows fetch error:", followsErr.message);
    }

    const slugs = (follows ?? []).map((f: any) => String(f.shop_slug)).filter(Boolean);

    if (slugs.length === 0) {
        return (
            <div className="max-w-7xl mx-auto px-6 py-12">
                <h1 className="text-4xl font-black mb-8">Following</h1>
                <div className="rounded-2xl border bg-white p-6 text-sm font-semibold text-zinc-700">
                    まだフォローしているショップがありません。
                </div>
            </div>
        );
    }

    // ✅ shops を別クエリで取得（FK無しでも確実に動く）
    const { data: shopsRaw, error: shopsErr } = await supabase
        .from("shops")
        .select("slug,name_ja,name_en,avatar_url,headline,is_active")
        .in("slug", slugs);

    if (shopsErr) {
        console.error("shops fetch error:", shopsErr.message);
    }

    // slug順（フォロー順）に並べ替え
    const shopMap = new Map<string, any>((shopsRaw ?? []).map((s: any) => [String(s.slug), s]));
    const shopsBase = slugs.map((s) => shopMap.get(s)).filter(Boolean);

    // ✅ フォロワー数を一括で取得（0フォロワーは行が無いので注意）
    const { data: statsRows, error: statsErr } = await supabase
        .from("v_shop_follower_stats")
        .select("shop_slug,follower_count")
        .in("shop_slug", slugs);

    if (statsErr) {
        console.error("v_shop_follower_stats fetch error:", statsErr.message);
    }

    const followerMap = new Map<string, number>(
        (statsRows ?? []).map((r: any) => [String(r.shop_slug), Number(r.follower_count ?? 0) || 0])
    );

    // ✅ product数（drops数）を追加（status は approved）
    // ※ group count をSQL無しで一括は難しいので、ここは並列で数える
    const shops = await Promise.all(
        shopsBase.map(async (shop: any) => {
            const slug = String(shop.slug);

            const { count, error: cntErr } = await supabase
                .from("drops")
                .select("id", { count: "exact", head: true })
                .eq("shop_slug", slug)
                .eq("status", "approved"); // ← "published" ではなく approved

            if (cntErr) {
                console.error("drops count error:", cntErr.message);
            }

            return {
                ...shop,
                follower_count: followerMap.get(slug) ?? 0,
                product_count: count ?? 0,
            };
        })
    );

    return (
        <div className="max-w-7xl mx-auto px-6 py-12">
            <h1 className="text-4xl font-black mb-8">Following</h1>

            <FollowingList
                shops={shops}
                userFollowingSlugs={(follows ?? []).map((f: any) => String(f.shop_slug))}
            />
        </div>
    );
}
