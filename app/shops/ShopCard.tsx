// app/shops/ShopCard.tsx
import Link from "next/link";

type ShopLike = {
    slug: string;
    name_ja: string | null;
    name_en: string | null;
    avatar_url: string | null;
    headline: string | null;
    style_tags?: string[] | null;
    cover_url?: string | null;
    banner_url?: string | null;
};

function pickName(s: ShopLike) {
    return s.name_ja || s.name_en || s.slug;
}

export default function ShopCard({ s }: { s: ShopLike }) {
    const name = pickName(s);
    const cover = s.cover_url || s.banner_url || "";

    return (
        <Link
            href={`/shops/${s.slug}`}
            className="group overflow-hidden rounded-2xl border bg-white shadow-sm no-underline transition hover:shadow-md"
        >
            {cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={cover} alt="cover" className="h-28 w-full object-cover" loading="lazy" />
            ) : (
                <div className="h-28 w-full bg-zinc-50" />
            )}

            <div className="p-4">
                <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {s.avatar_url ? (
                        <img src={s.avatar_url} alt="avatar" className="h-12 w-12 rounded-xl border border-zinc-200 object-cover" />
                    ) : (
                        <div className="h-12 w-12 rounded-xl border border-zinc-200 bg-zinc-50" />
                    )}

                    <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-extrabold text-zinc-900">{name}</div>
                        {s.headline ? (
                            <div className="mt-1 line-clamp-2 text-xs font-semibold text-zinc-600">{s.headline}</div>
                        ) : (
                            <div className="mt-1 text-xs font-semibold text-zinc-400">（headline 未設定）</div>
                        )}
                    </div>
                </div>

                {Array.isArray(s.style_tags) && s.style_tags.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                        {s.style_tags.slice(0, 8).map((t) => (
                            <span key={t} className="rounded-full border bg-white px-2 py-1 text-[11px] font-black text-zinc-700">
                                #{t}
                            </span>
                        ))}
                    </div>
                ) : null}

                <div className="mt-3 text-[11px] font-semibold text-zinc-500">/shops/{s.slug}</div>
            </div>
        </Link>
    );
}
