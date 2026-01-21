import "server-only";

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/requireUser";
import ShopEditForm from "./ShopEditForm";

export const dynamic = "force-dynamic";

export default async function ShopEditPage({ params }: { params: Promise<{ slug: string }> }) {
    const p = await params;
    const slug = String(p?.slug ?? "").trim().toLowerCase();
    if (!slug || slug === "undefined") return notFound();

    const { supabase, user } = await requireUser(`/login?next=/shops/${slug}/edit`);

    const { data: shop, error } = await supabase
        .from("shops")
        .select("id,slug,owner_id,url,name_ja,name_en,headline,bio,avatar_url,style_tags,is_active,socials,created_at,updated_at")
        .eq("slug", slug)
        .eq("owner_id", user.id)
        .maybeSingle();

    if (error) throw error;
    if (!shop) return notFound();

    return (
        <main className="mx-auto max-w-5xl px-4 py-10">
            <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Link href="/drops" className="text-sm font-extrabold text-zinc-700 no-underline hover:text-zinc-950">
                        ← Drops
                    </Link>
                    <span className="text-xs font-semibold text-zinc-400">/</span>
                    <Link href={`/shops/${shop.slug}`} className="text-sm font-extrabold text-zinc-700 no-underline hover:text-zinc-950">
                        View
                    </Link>
                </div>
                <div className="text-xs font-semibold text-zinc-500">Shop Edit</div>
            </div>

            <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
                <h1 className="text-xl font-black tracking-tight">Shop Branding</h1>
                <p className="mt-1 text-xs font-semibold text-zinc-500">
                    プロフィール/ショップ説明/スタイルを簡易に整えて、買い手に「誰の店か」が伝わる状態にする
                </p>

                <div className="mt-5">
                    <ShopEditForm
                        slug={shop.slug}
                        defaults={{
                            name_ja: shop.name_ja ?? "",
                            name_en: shop.name_en ?? "",
                            headline: shop.headline ?? "",
                            bio: shop.bio ?? "",
                            avatar_url: shop.avatar_url ?? "",
                            style_tags: Array.isArray(shop.style_tags) ? shop.style_tags : [],
                            socials: (shop.socials ?? {}) as any,
                            is_active: !!shop.is_active,
                            url: shop.url ?? `/shops/${shop.slug}`,
                        }}
                    />
                </div>
            </section>
        </main>
    );
}
