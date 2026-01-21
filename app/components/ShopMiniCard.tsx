// app/components/ShopMiniCard.tsx
"use client";

import Link from "next/link";

type Props = {
    slug: string;
    nameJa?: string | null;
    nameEn?: string | null;
    avatarUrl?: string | null;
    headline?: string | null;
    className?: string;
};

export default function ShopMiniCard({
    slug,
    nameJa,
    nameEn,
    avatarUrl,
    headline,
    className,
}: Props) {
    const name = (nameJa && nameJa.trim()) || (nameEn && nameEn.trim()) || slug;

    return (
        <Link
            href={`/shops/${slug}`}
            className={[
                "flex items-center gap-2 rounded-xl border bg-white/70 px-3 py-2 hover:bg-white",
                className ?? "",
            ].join(" ")}
        >
            {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={avatarUrl}
                    alt={name}
                    className="h-8 w-8 rounded-full border object-cover"
                />
            ) : (
                <div className="h-8 w-8 rounded-full border bg-neutral-100" />
            )}

            <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-neutral-900">{name}</div>
                {headline ? (
                    <div className="truncate text-xs text-neutral-600">{headline}</div>
                ) : (
                    <div className="text-xs text-neutral-400"> </div>
                )}
            </div>

            <div className="text-xs text-neutral-500">→</div>
        </Link>
    );
}
