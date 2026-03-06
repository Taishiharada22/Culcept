// app/shops/me/analytics/page.tsx
import { supabaseServer } from "@/lib/supabase/server";
import AnalyticsDashboard from "@/components/seller/AnalyticsDashboard";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

function toYmd(d: Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

export default async function AnalyticsPage() {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();

    if (!auth?.user) {
        redirect("/login?next=/shops/me/analytics");
    }

    // 1) Shop analytics（ビュー想定）
    const { data: shopAnalytics } = await supabase
        .from("v_shop_analytics")
        .select("*")
        .eq("user_id", auth.user.id)
        .maybeSingle();

    // 2) 自分のdrops id一覧（in のサブクエリはSupabaseではできないので先に取得）
    const { data: myDrops, error: myDropsErr } = await supabase
        .from("drops")
        .select("id")
        .eq("user_id", auth.user.id);

    if (myDropsErr) {
        console.warn("drops id fetch error:", myDropsErr.message);
    }

    const productIds = (myDrops ?? []).map((x: any) => x?.id).filter(Boolean) as string[];

    // 3) Time series（過去90日）
    const fromDate = toYmd(new Date(Date.now() - 90 * 24 * 60 * 60 * 1000));

    const timeSeriesRes =
        productIds.length > 0
            ? await supabase
                .from("product_analytics")
                // NOTE: PostgREST の集計（.sum()）で date ごとに自動的にまとまるので .group() は不要
                .select(
                    "date, views:views_count.sum(), clicks:clicks_count.sum(), sales:purchases_count.sum(), revenue:revenue.sum()"
                )
                .gte("date", fromDate)
                .in("product_id", productIds)
                .order("date", { ascending: true })
            : ({ data: [], error: null } as any);

    if (timeSeriesRes?.error) {
        console.warn("time series fetch error:", timeSeriesRes.error.message);
    }

    const formattedTimeSeriesData = (timeSeriesRes?.data ?? []).map((d: any) => ({
        date: d.date,
        views: Number(d.views ?? 0),
        clicks: Number(d.clicks ?? 0),
        sales: Number(d.sales ?? 0),
        revenue: Number(d.revenue ?? 0),
    }));

    // 4) Top products（30d analytics をネストで取得 → JSでソート）
    const { data: topProductsRaw, error: topErr } = await supabase
        .from("drops")
        .select(
            `
        id,
        title,
        cover_image_url,
        analytics:v_product_analytics_30d(
          views_total,
          clicks_total,
          revenue_total
        )
      `
        )
        .eq("user_id", auth.user.id)
        .limit(50);

    if (topErr) {
        console.warn("top products fetch error:", topErr.message);
    }

    const topProductsSorted = (topProductsRaw ?? [])
        .map((p: any) => ({
            id: p.id,
            title: p.title,
            cover_image_url: p.cover_image_url,
            views: Number(p.analytics?.views_total ?? 0),
            clicks: Number(p.analytics?.clicks_total ?? 0),
            revenue: Number(p.analytics?.revenue_total ?? 0),
        }))
        .sort((a, b) => b.views - a.views)
        .slice(0, 10);

    // 5) analytics fallback
    const analytics = shopAnalytics || {
        total_products: 0,
        published_products: 0,
        total_views: 0,
        total_clicks: 0,
        total_sales: 0,
        total_revenue: 0,
        average_price: 0,
        follower_count: 0,
    };

    return (
        <div className="max-w-7xl mx-auto px-6 py-12">
            <AnalyticsDashboard
                analytics={analytics}
                timeSeriesData={formattedTimeSeriesData}
                topProducts={topProductsSorted}
            />
        </div>
    );
}
