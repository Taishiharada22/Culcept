// app/me/alerts/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AlertsPage() {
    const supabase = await supabaseServer();

    // ✅ auth 取得（auth.user ではなく data.user）
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect("/login?next=/me/alerts");
    }

    // ✅ alerts を先に取得
    const { data: alertsRaw, error: alertsErr } = await supabase
        .from("price_alerts")
        .select("id, product_id, target_price, current_price, is_active, triggered_at, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

    if (alertsErr) {
        console.error("price_alerts fetch error:", alertsErr.message);
    }

    const alerts = alertsRaw ?? [];
    const productIds = Array.from(
        new Set(alerts.map((a: any) => String(a.product_id)).filter(Boolean))
    );

    // ✅ products を別クエリで取得（display_price は無いので price のみ）
    const { data: productsRaw, error: prodErr } = productIds.length
        ? await supabase
            .from("drops")
            .select("id, title, cover_image_url, price")
            .in("id", productIds)
        : { data: [], error: null as any };

    if (prodErr) {
        console.error("drops fetch error:", prodErr.message);
    }

    const productMap = new Map<string, any>((productsRaw ?? []).map((p: any) => [String(p.id), p]));

    return (
        <div className="max-w-4xl mx-auto px-6 py-12">
            <h1 className="text-4xl font-black mb-8">Price Alerts</h1>

            {alerts.length === 0 ? (
                <div className="rounded-2xl border bg-white p-6 text-sm font-semibold text-zinc-700">
                    まだアラートがありません。
                </div>
            ) : (
                <div className="space-y-4">
                    {alerts.map((alert: any) => {
                        const product = productMap.get(String(alert.product_id));
                        if (!product) {
                            // 商品が削除された等（FKでCASCADEなら本来消えるが念のため）
                            return null;
                        }

                        const currentPrice = Number(product.price ?? alert.current_price ?? 0) || 0;
                        const targetPrice = Number(alert.target_price ?? 0) || 0;
                        const triggered = alert.triggered_at != null || alert.is_active === false;

                        return (
                            <Link
                                key={alert.id}
                                href={`/drops/${product.id}`}
                                className="block rounded-xl border-2 border-slate-200 bg-white p-6 transition-all hover:shadow-lg no-underline"
                            >
                                <div className="flex items-center gap-4">
                                    {product.cover_image_url ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={product.cover_image_url}
                                            alt={product.title}
                                            className="h-20 w-20 rounded-lg object-cover"
                                        />
                                    ) : (
                                        <div className="h-20 w-20 rounded-lg bg-slate-100 border" />
                                    )}

                                    <div className="flex-1">
                                        <h3 className="text-lg font-black text-slate-900 mb-2">{product.title}</h3>

                                        <div className="flex items-center gap-4 text-sm font-bold">
                                            <span className={triggered ? "text-teal-600" : "text-slate-600"}>
                                                Target: ¥{targetPrice.toLocaleString()}
                                            </span>
                                            <span className="text-slate-400">→</span>
                                            <span className="text-slate-900">
                                                Current: ¥{currentPrice.toLocaleString()}
                                            </span>
                                        </div>

                                        {triggered ? (
                                            <div className="mt-2 rounded-lg bg-teal-100 border border-teal-300 px-3 py-1 text-xs font-black text-teal-700 inline-block">
                                                🎉 Price dropped!
                                            </div>
                                        ) : (
                                            <div className="mt-2 text-xs font-bold text-slate-500">
                                                Active
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
