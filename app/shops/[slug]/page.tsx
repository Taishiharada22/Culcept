// app/shops/[slug]/page.tsx
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import FollowButton from "@/components/follows/FollowButton";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
function spStr(v: unknown) {
    return String(Array.isArray(v) ? v[0] : v ?? "").trim();
}

export default async function ShopSlugPage({
    params,
    searchParams,
}: {
    params: Promise<{ slug: string }> | { slug: string };
    searchParams: Promise<SP> | SP;
}) {
    const p = await (params as any);
    const sp = (await (searchParams as any)) ?? {};

    const slug = String(p?.slug ?? "").trim();
    if (!slug) notFound();

    const preview = spStr((sp as any).preview) === "1";
    const shopId = spStr((sp as any).shop_id);

    // --- 通常（公開ページ） ---
    if (!preview) {
        const { data: shop } = await supabaseAdmin
            .from("shops")
            .select(
                "id,slug,name_ja,name_en,headline,bio,url,external_url,avatar_url,banner_url,cover_url,style_tags,is_active,status"
            )
            .eq("slug", slug)
            .eq("is_active", true)
            .maybeSingle();

        if (!shop?.id) notFound();

        // ✅ auth + follow状態/フォロワー数（表示だけ）
        const supabase = await supabaseServer();
        const { data: auth } = await supabase.auth.getUser();
        const user = auth?.user ?? null;

        // フォロワー数（0件だとビューに行が無いので maybeSingle）
        const { data: stats } = await supabase
            .from("v_shop_follower_stats")
            .select("follower_count")
            .eq("shop_slug", slug)
            .maybeSingle();

        const followerCount = Number((stats as any)?.follower_count ?? 0) || 0;

        // フォロー中か
        let isFollowing = false;
        if (user) {
            const { data: follow } = await supabase
                .from("shop_follows")
                .select("id")
                .eq("user_id", user.id)
                .eq("shop_slug", slug)
                .maybeSingle();

            isFollowing = !!follow?.id;
        }

        const name = shop.name_ja || shop.name_en || shop.slug;
        const cover = shop.cover_url || shop.banner_url || "";

        return (
            <main className="mx-auto max-w-6xl py-2 grid gap-6">
                <header className="rounded-2xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
                    <div className="h-44 w-full bg-zinc-100">
                        {cover ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={cover} alt="cover" className="h-full w-full object-cover" />
                        ) : null}
                    </div>

                    <div className="p-5 grid gap-4">
                        <div className="flex items-start gap-4">
                            <div className="shrink-0">
                                {shop.avatar_url ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={shop.avatar_url}
                                        alt={name}
                                        className="h-16 w-16 rounded-2xl border border-zinc-200 object-cover"
                                    />
                                ) : (
                                    <div className="h-16 w-16 rounded-2xl border border-zinc-200 bg-zinc-50" />
                                )}
                            </div>

                            <div className="min-w-0 flex-1">
                                <div className="text-2xl font-extrabold tracking-tight">{name}</div>
                                {shop.headline ? (
                                    <div className="mt-1 text-sm font-semibold text-zinc-600">{shop.headline}</div>
                                ) : null}

                                <div className="mt-3 flex flex-wrap gap-2">
                                    {Array.isArray(shop.style_tags) &&
                                        (shop.style_tags as string[]).slice(0, 12).map((t) => (
                                            <span
                                                key={t}
                                                className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-black text-zinc-700"
                                            >
                                                #{String(t).toLowerCase()}
                                            </span>
                                        ))}
                                </div>
                            </div>

                            <div className="flex flex-col items-end gap-2">
                                <Link
                                    href="/shops"
                                    className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs font-black text-zinc-700 no-underline hover:bg-zinc-50"
                                >
                                    Shopsへ →
                                </Link>

                                {shop.url || shop.external_url ? (
                                    <a
                                        href={String(shop.url || shop.external_url)}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="rounded-md bg-zinc-900 px-3 py-2 text-xs font-black text-white no-underline hover:bg-zinc-800"
                                    >
                                        Website →
                                    </a>
                                ) : null}

                                {/* ✅ フォローボタン（ログイン時のみ表示） */}
                                {user ? (
                                    <FollowButton
                                        shopSlug={slug}
                                        initialFollowing={isFollowing}
                                        followerCount={followerCount}
                                        size="lg"
                                    />
                                ) : null}
                            </div>
                        </div>

                        {shop.bio ? (
                            <p className="whitespace-pre-wrap text-sm font-semibold text-zinc-800">{shop.bio}</p>
                        ) : null}
                    </div>
                </header>
            </main>
        );
    }

    // --- preview（オーナー閲覧。draftでもOK） ---
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;

    if (!user) {
        const next = `/shops/${encodeURIComponent(slug)}?preview=1${shopId ? `&shop_id=${encodeURIComponent(shopId)}` : ""
            }`;
        redirect(`/login?next=${encodeURIComponent(next)}`);
    }

    const baseQ = supabaseAdmin
        .from("shops")
        .select(
            "id,slug,name_ja,name_en,headline,bio,url,external_url,avatar_url,banner_url,cover_url,style_tags,is_active,status,owner_id"
        )
        .eq("owner_id", user!.id);

    const { data: shop } = shopId
        ? await baseQ.eq("id", shopId).maybeSingle()
        : await baseQ.eq("slug", slug).maybeSingle();

    if (!shop?.id) notFound();

    const name = shop.name_ja || shop.name_en || shop.slug;
    const cover = shop.cover_url || shop.banner_url || "";

    return (
        <main className="mx-auto max-w-6xl py-2 grid gap-4">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-extrabold text-amber-900">
                Preview mode（オーナー閲覧） / status: {shop.status} / active: {String(shop.is_active)}
            </div>

            <header className="rounded-2xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
                <div className="h-44 w-full bg-zinc-100">
                    {cover ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={cover} alt="cover" className="h-full w-full object-cover" />
                    ) : null}
                </div>

                <div className="p-5 grid gap-4">
                    <div className="flex items-start gap-4">
                        <div className="shrink-0">
                            {shop.avatar_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                    src={shop.avatar_url}
                                    alt={name}
                                    className="h-16 w-16 rounded-2xl border border-zinc-200 object-cover"
                                />
                            ) : (
                                <div className="h-16 w-16 rounded-2xl border border-zinc-200 bg-zinc-50" />
                            )}
                        </div>

                        <div className="min-w-0 flex-1">
                            <div className="text-2xl font-extrabold tracking-tight">{name}</div>
                            {shop.headline ? (
                                <div className="mt-1 text-sm font-semibold text-zinc-600">{shop.headline}</div>
                            ) : null}

                            <div className="mt-3 flex flex-wrap gap-2">
                                {Array.isArray(shop.style_tags) &&
                                    (shop.style_tags as string[]).slice(0, 12).map((t) => (
                                        <span
                                            key={t}
                                            className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-black text-zinc-700"
                                        >
                                            #{String(t).toLowerCase()}
                                        </span>
                                    ))}
                            </div>
                        </div>

                        <div className="flex flex-col items-end gap-2">
                            <Link
                                href={`/shops/me?shop_id=${encodeURIComponent(String(shop.id))}`}
                                className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs font-black text-zinc-700 no-underline hover:bg-zinc-50"
                            >
                                編集へ戻る →
                            </Link>

                            {shop.url || shop.external_url ? (
                                <a
                                    href={String(shop.url || shop.external_url)}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="rounded-md bg-zinc-900 px-3 py-2 text-xs font-black text-white no-underline hover:bg-zinc-800"
                                >
                                    Website →
                                </a>
                            ) : null}
                        </div>
                    </div>

                    {shop.bio ? (
                        <p className="whitespace-pre-wrap text-sm font-semibold text-zinc-800">{shop.bio}</p>
                    ) : null}
                </div>
            </header>
        </main>
    );
}
