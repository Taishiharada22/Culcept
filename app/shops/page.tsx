// app/shops/page.tsx
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type ShopRow = {
    slug: string;
    name_ja: string | null;
    name_en: string | null;
    avatar_url: string | null;
    headline: string | null;
    style_tags: string[] | null;
    cover_url: string | null;
    banner_url: string | null;
    is_active: boolean | null;
};

function pickName(s: ShopRow) {
    return s.name_ja || s.name_en || s.slug;
}

type SP = Record<string, string | string[] | undefined>;
function spStr(v: unknown) {
    return String(Array.isArray(v) ? v[0] : v ?? "").trim();
}

export default async function ShopsPage({ searchParams }: { searchParams: Promise<SP> }) {
    const sp = (await searchParams) ?? {};
    const q = spStr(sp.q);
    const tag = spStr(sp.tag);

    const supabase = await supabaseServer();

    let query = supabase
        .from("shops")
        .select("slug,name_ja,name_en,avatar_url,headline,style_tags,cover_url,banner_url,is_active")
        .eq("is_active", true)
        .limit(60);

    if (q) {
        const safe = q.slice(0, 50).replace(/[(),]/g, " ").trim();
        const like = `%${safe.replace(/[%_]/g, "")}%`;
        if (safe) query = query.or(`name_ja.ilike.${like},name_en.ilike.${like},headline.ilike.${like}`);
    }

    if (tag) {
        query = query.contains("style_tags", [tag]);
    }

    const { data, error } = await query;
    const shops = (data ?? []) as ShopRow[];

    // タグ候補（表示中ショップから集計）
    const tagCounts = new Map<string, number>();
    for (const s of shops) {
        const arr = Array.isArray(s.style_tags) ? s.style_tags : [];
        for (const t of arr) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
    }
    const topTags = [...tagCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([t]) => t);

    return (
        <main className="mx-auto max-w-6xl py-2 grid gap-6">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-extrabold tracking-tight">Shops</h1>
                    <p className="mt-1 text-xs font-semibold text-zinc-600">“誰の店か” から選ぶ。世界観 → Drops。</p>
                    <div className="mt-3">
                        <Link
                            href="/shops/me"
                            className="inline-flex rounded-md bg-zinc-900 px-3 py-2 text-xs font-black text-white no-underline hover:bg-zinc-800"
                        >
                            Create / Edit my shop →
                        </Link>
                    </div>
                </div>

                <form className="flex items-center gap-2" action="/shops" method="get">
                    <input
                        name="q"
                        defaultValue={q}
                        placeholder="search shop..."
                        className="w-56 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                    />
                    {tag ? <input type="hidden" name="tag" value={tag} /> : null}
                    <button className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-extrabold text-white hover:bg-zinc-800" type="submit">
                        Search
                    </button>
                </form>
            </div>

            {topTags.length ? (
                <div className="flex flex-wrap gap-2">
                    <Link
                        href={`/shops${q ? `?q=${encodeURIComponent(q)}` : ""}`}
                        className={[
                            "rounded-full border px-3 py-1 text-xs font-black no-underline",
                            tag ? "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50" : "border-zinc-900 bg-zinc-900 text-white",
                        ].join(" ")}
                    >
                        All
                    </Link>

                    {topTags.map((t) => {
                        const href = `/shops?${new URLSearchParams({ ...(q ? { q } : {}), tag: t }).toString()}`;
                        const active = tag === t;
                        return (
                            <Link
                                key={t}
                                href={href}
                                className={[
                                    "rounded-full border px-3 py-1 text-xs font-black no-underline",
                                    active ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
                                ].join(" ")}
                            >
                                #{t}
                            </Link>
                        );
                    })}
                </div>
            ) : null}

            {error ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error.message}</div>
            ) : shops.length === 0 ? (
                <div className="rounded-xl border bg-white p-8 text-sm font-semibold text-zinc-600">ショップがまだありません。</div>
            ) : (
                <div className="grid gap-4 md:grid-cols-2">
                    {shops.map((s) => {
                        const name = pickName(s);
                        const cover = s.cover_url || s.banner_url || "";
                        const tags = Array.isArray(s.style_tags) ? s.style_tags : [];

                        return (
                            <Link
                                key={s.slug}
                                href={`/shops/${s.slug}`}
                                className="group overflow-hidden rounded-2xl border bg-white shadow-sm no-underline transition hover:shadow-md"
                            >
                                <div className="h-28 w-full bg-zinc-100">
                                    {cover ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={cover} alt="cover" className="h-full w-full object-cover" />
                                    ) : null}
                                </div>

                                <div className="p-5">
                                    <div className="flex items-start gap-3">
                                        <div className="shrink-0">
                                            {s.avatar_url ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={s.avatar_url} alt={name} className="h-12 w-12 rounded-full border border-zinc-200 object-cover" />
                                            ) : (
                                                <div className="h-12 w-12 rounded-full border border-zinc-200 bg-zinc-50" />
                                            )}
                                        </div>

                                        <div className="min-w-0 flex-1">
                                            <div className="truncate text-base font-extrabold text-zinc-900">{name}</div>
                                            <div className="mt-1 line-clamp-1 text-xs font-semibold text-zinc-600">{s.headline ?? " "}</div>

                                            {tags.length ? (
                                                <div className="mt-3 flex flex-wrap gap-2">
                                                    {tags.slice(0, 6).map((t) => (
                                                        <span key={t} className="rounded-full border border-zinc-200 bg-white px-2 py-1 text-[11px] font-black text-zinc-700">
                                                            #{t}
                                                        </span>
                                                    ))}
                                                </div>
                                            ) : null}

                                            <div className="mt-4 text-xs font-extrabold text-zinc-400 group-hover:text-zinc-600">View shop →</div>
                                        </div>
                                    </div>
                                </div>
                            </Link>
                        );
                    })}
                </div>
            )}
        </main>
    );
}
