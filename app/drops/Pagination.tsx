// app/drops/Pagination.tsx
import Link from "next/link";

export default function Pagination(props: {
    basePath: string;
    page: number;
    totalPages: number;
    queryString: string; // starts with &... or ""
}) {
    const { basePath, page, totalPages, queryString } = props;
    const prev = Math.max(1, page - 1);
    const next = Math.min(totalPages, page + 1);

    const makeHref = (p: number) => {
        const qs = new URLSearchParams();
        qs.set("page", String(p));
        const extra = queryString.startsWith("&") ? queryString.slice(1) : queryString;
        const full = [qs.toString(), extra].filter(Boolean).join("&");
        return `${basePath}?${full}`;
    };

    return (
        <div className="flex items-center justify-between gap-3 py-2">
            <Link
                href={makeHref(prev)}
                aria-disabled={page <= 1}
                className={[
                    "rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-extrabold no-underline",
                    page <= 1 ? "pointer-events-none opacity-50" : "hover:bg-zinc-50",
                ].join(" ")}
            >
                ← Prev
            </Link>

            <div className="text-xs font-semibold text-zinc-600">
                Page <span className="font-black">{page}</span> / {totalPages}
            </div>

            <Link
                href={makeHref(next)}
                aria-disabled={page >= totalPages}
                className={[
                    "rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-extrabold no-underline",
                    page >= totalPages ? "pointer-events-none opacity-50" : "hover:bg-zinc-50",
                ].join(" ")}
            >
                Next →
            </Link>
        </div>
    );
}
