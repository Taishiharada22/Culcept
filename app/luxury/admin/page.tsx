// app/luxury/admin/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isAdminEmail } from "@/lib/auth/isAdmin";
import {
    LightBackground,
    GlassCard,
    GlassNavbar,
    GlassInput,
    GlassButton,
} from "@/components/ui/glassmorphism-design";
import { updateLuxuryLaneShopAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function LuxuryAdminPage({
    searchParams,
}: {
    searchParams: Promise<{ saved?: string; error?: string }>;
}) {
    const sp = await searchParams;
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();

    if (!auth?.user) {
        redirect("/login?next=/luxury/admin");
    }

    if (!isAdminEmail(auth.user.email)) {
        return (
            <LightBackground>
                <div className="min-h-screen flex items-center justify-center px-4">
                    <GlassCard className="p-8 max-w-md text-center">
                        <h1 className="text-xl font-bold text-gray-800 mb-2">アクセス権限がありません</h1>
                        <p className="text-gray-500 text-sm">管理者のみアクセスできます。</p>
                        <div className="mt-6">
                            <GlassButton href="/luxury" variant="secondary" size="sm">
                                Luxuryへ戻る
                            </GlassButton>
                        </div>
                    </GlassCard>
                </div>
            </LightBackground>
        );
    }

    const { data: lanes } = await supabaseAdmin
        .from("luxury_lanes")
        .select("lane_id,name_ja,name_en,icon_emoji,color_primary,shop_url,shop_slug,display_order")
        .order("display_order", { ascending: true });

    return (
        <LightBackground>
            <GlassNavbar>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Link
                            href="/luxury"
                            className="w-10 h-10 rounded-xl bg-white/60 border border-white/70 flex items-center justify-center text-gray-500 hover:bg-white/80 transition-all"
                        >
                            ←
                        </Link>
                        <div>
                            <h1 className="text-lg font-bold text-gray-800">Luxury Shops 管理</h1>
                            <p className="text-xs text-gray-400">ブランドの公式URL/ショップURLを紐付けます</p>
                        </div>
                    </div>
                </div>
            </GlassNavbar>

            <div className="h-24" />

            <main className="max-w-5xl mx-auto px-4 pb-28 space-y-6">
                {sp?.saved && (
                    <GlassCard className="p-4 border border-emerald-200 bg-emerald-50 text-emerald-700 text-sm">
                        保存しました
                    </GlassCard>
                )}
                {sp?.error && (
                    <GlassCard className="p-4 border border-rose-200 bg-rose-50 text-rose-700 text-sm">
                        {decodeURIComponent(sp.error)}
                    </GlassCard>
                )}

                <GlassCard className="p-5">
                    <div className="text-sm text-gray-600">
                        `shop_url` は外部サイトへのリンクに使用されます。`shop_slug` は内部の `/shops/{slug}` へ
                        飛ばしたい場合に使います（任意）。
                    </div>
                </GlassCard>

                <div className="space-y-4">
                    {(lanes ?? []).map((lane: any) => (
                        <GlassCard key={lane.lane_id} className="p-5">
                            <form action={updateLuxuryLaneShopAction} className="grid gap-4 sm:grid-cols-[1fr_2fr_1fr_auto] items-end">
                                <input type="hidden" name="lane_id" value={lane.lane_id} />

                                <div className="flex items-center gap-3">
                                    <div
                                        className="w-10 h-10 rounded-xl flex items-center justify-center text-lg"
                                        style={{ backgroundColor: `${lane.color_primary ?? "#999"}20` }}
                                    >
                                        {lane.icon_emoji ?? "💎"}
                                    </div>
                                    <div>
                                        <div className="text-sm font-semibold text-gray-800">
                                            {lane.name_ja ?? lane.lane_id}
                                        </div>
                                        <div className="text-xs text-gray-400">{lane.name_en ?? ""}</div>
                                    </div>
                                </div>

                                <div className="flex flex-col gap-1">
                                    <label className="text-xs font-medium text-gray-500">shop_url</label>
                                    <GlassInput name="shop_url" defaultValue={lane.shop_url ?? ""} placeholder="https://brand.com" />
                                </div>

                                <div className="flex flex-col gap-1">
                                    <label className="text-xs font-medium text-gray-500">shop_slug (optional)</label>
                                    <GlassInput name="shop_slug" defaultValue={lane.shop_slug ?? ""} placeholder="internal-shop-slug" />
                                </div>

                                <div className="flex justify-end">
                                    <GlassButton type="submit" size="sm">
                                        保存
                                    </GlassButton>
                                </div>
                            </form>
                        </GlassCard>
                    ))}
                </div>
            </main>
        </LightBackground>
    );
}
