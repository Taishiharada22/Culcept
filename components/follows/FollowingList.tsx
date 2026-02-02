// components/follows/FollowingList.tsx
import Link from "next/link";
import FollowButton from "./FollowButton";

type Shop = {
    slug: string;
    name_ja: string | null;
    name_en: string | null;
    avatar_url: string | null;
    headline: string | null;
    follower_count: number;
    product_count: number;
};

type Props = {
    shops: Shop[];
    userFollowingSlugs: string[];
};

export default function FollowingList({ shops, userFollowingSlugs }: Props) {
    if (shops.length === 0) {
        return (
            <div className="rounded-2xl border-2 border-slate-200 bg-gradient-to-br from-slate-50 to-white p-16 text-center">
                <div className="text-7xl mb-4 opacity-20">🏪</div>
                <h3 className="text-2xl font-black text-slate-900 mb-2">
                    Not Following Anyone Yet
                </h3>
                <p className="text-base font-semibold text-slate-600">
                    Discover stores and follow them to see their latest products
                </p>
            </div>
        );
    }

    return (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {shops.map((shop) => (
                <article
                    key={shop.slug}
                    className="rounded-2xl border-2 border-slate-200 bg-white p-6 shadow-sm transition-all hover:shadow-lg hover:-translate-y-1"
                >
                    <Link
                        href={`/shops/${shop.slug}`}
                        className="block no-underline mb-4"
                    >
                        {/* Avatar */}
                        <div className="flex items-center gap-3 mb-3">
                            {shop.avatar_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                    src={shop.avatar_url}
                                    alt={shop.name_ja || shop.name_en || shop.slug}
                                    className="h-16 w-16 rounded-full border-2 border-slate-200 object-cover"
                                />
                            ) : (
                                <div className="h-16 w-16 rounded-full border-2 border-slate-200 bg-gradient-to-br from-purple-100 to-purple-200 flex items-center justify-center text-2xl font-black text-purple-600">
                                    {(shop.name_ja || shop.name_en || shop.slug)[0].toUpperCase()}
                                </div>
                            )}

                            <div className="flex-1 min-w-0">
                                <h3 className="text-lg font-black text-slate-900 truncate">
                                    {shop.name_ja || shop.name_en || shop.slug}
                                </h3>
                                <div className="text-xs font-semibold text-slate-500">
                                    {shop.product_count} products
                                </div>
                            </div>
                        </div>

                        {/* Headline */}
                        {shop.headline && (
                            <p className="text-sm font-semibold text-slate-600 line-clamp-2 mb-3">
                                {shop.headline}
                            </p>
                        )}
                    </Link>

                    {/* Follow Button */}
                    <FollowButton
                        shopSlug={shop.slug}
                        initialFollowing={userFollowingSlugs.includes(shop.slug)}
                        followerCount={shop.follower_count}
                        size="sm"
                        showCount={false}
                    />
                </article>
            ))}
        </div>
    );
}
