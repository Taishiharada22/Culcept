"use client";

import * as React from "react";

function uniq(arr: string[]) {
    const out: string[] = [];
    for (const x of arr) if (x && !out.includes(x)) out.push(x);
    return out;
}

function norm(s: string) {
    return s.trim().replace(/\s+/g, " ").toLowerCase();
}

function parseCommaList(s: string) {
    return s
        .split(",")
        .map((x) => norm(x))
        .filter(Boolean)
        .slice(0, 10);
}

export default function DropsFilters(props: {
    q: string;
    brand: string;
    size: string;
    condition: string;
    tags: string; // comma-separated
    min: string;
    max: string;
    hasImage: string;
    hasBuy: string;
    sort: string;
    mine: string;
}) {
    const [brand, setBrand] = React.useState(props.brand ?? "");
    const [tagsText, setTagsText] = React.useState(props.tags ?? "");

    const [brandSug, setBrandSug] = React.useState<string[]>([]);
    const [tagSug, setTagSug] = React.useState<string[]>([]);
    const [loadingBrand, setLoadingBrand] = React.useState(false);
    const [loadingTag, setLoadingTag] = React.useState(false);

    React.useEffect(() => {
        setBrand(props.brand ?? "");
        setTagsText(props.tags ?? "");
    }, [props.brand, props.tags]);

    // brand suggest
    React.useEffect(() => {
        const q = norm(brand);
        if (!q) {
            setBrandSug([]);
            return;
        }
        const ac = new AbortController();
        setLoadingBrand(true);
        fetch(`/api/suggest?kind=brand&q=${encodeURIComponent(q)}`, { signal: ac.signal })
            .then((r) => r.json())
            .then((j) => setBrandSug(Array.isArray(j?.items) ? j.items : []))
            .catch(() => { })
            .finally(() => setLoadingBrand(false));
        return () => ac.abort();
    }, [brand]);

    // tag suggest（最後に入力してるトークンで絞る）
    React.useEffect(() => {
        const parts = parseCommaList(tagsText);
        const lastRaw = tagsText.split(",").pop() ?? "";
        const last = norm(lastRaw);
        if (!last) {
            setTagSug([]);
            return;
        }
        const ac = new AbortController();
        setLoadingTag(true);
        fetch(`/api/suggest?kind=tag&q=${encodeURIComponent(last)}`, { signal: ac.signal })
            .then((r) => r.json())
            .then((j) => setTagSug(Array.isArray(j?.items) ? j.items : []))
            .catch(() => { })
            .finally(() => setLoadingTag(false));
        return () => ac.abort();
    }, [tagsText]);

    const addTag = (t: string) => {
        const cur = parseCommaList(tagsText);
        const next = uniq([...cur, norm(t)]).slice(0, 10);
        setTagsText(next.join(","));
    };

    return (
        <form method="get" action="/drops" className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="grid gap-3 md:grid-cols-3">
                <input
                    name="q"
                    defaultValue={props.q}
                    placeholder="Search (title/description)"
                    className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                />

                <div className="relative">
                    <input
                        name="brand"
                        value={brand}
                        onChange={(e) => setBrand(e.currentTarget.value)}
                        placeholder="Brand"
                        className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                    />
                    {(loadingBrand || brandSug.length > 0) && (
                        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-10 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg">
                            {loadingBrand ? (
                                <div className="px-3 py-2 text-xs font-semibold text-zinc-500">loading...</div>
                            ) : (
                                <ul className="max-h-56 list-none overflow-auto p-0">
                                    {brandSug.map((b) => (
                                        <li key={b}>
                                            <button
                                                type="button"
                                                onClick={() => setBrand(b)}
                                                className="block w-full px-3 py-2 text-left text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                                            >
                                                {b}
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}
                </div>

                <div className="relative">
                    <input
                        name="tags"
                        value={tagsText}
                        onChange={(e) => setTagsText(e.currentTarget.value)}
                        placeholder="Tags (comma) e.g. vintage,workwear"
                        className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                    />

                    {(loadingTag || tagSug.length > 0) && (
                        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-10 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg">
                            {loadingTag ? (
                                <div className="px-3 py-2 text-xs font-semibold text-zinc-500">loading...</div>
                            ) : (
                                <ul className="max-h-56 list-none overflow-auto p-0">
                                    {tagSug.map((t) => (
                                        <li key={t}>
                                            <button
                                                type="button"
                                                onClick={() => addTag(t)}
                                                className="block w-full px-3 py-2 text-left text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                                            >
                                                #{t}
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
                <input
                    name="size"
                    defaultValue={props.size}
                    placeholder="Size"
                    className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                />
                <input
                    name="condition"
                    defaultValue={props.condition}
                    placeholder="Condition"
                    className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                />
                <input
                    name="min"
                    defaultValue={props.min}
                    placeholder="Min price"
                    inputMode="numeric"
                    className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                />
                <input
                    name="max"
                    defaultValue={props.max}
                    placeholder="Max price"
                    inputMode="numeric"
                    className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 text-xs font-extrabold text-zinc-700">
                        <input type="checkbox" name="hasImage" value="1" defaultChecked={props.hasImage === "1"} />
                        has image
                    </label>
                    <label className="flex items-center gap-2 text-xs font-extrabold text-zinc-700">
                        <input type="checkbox" name="hasBuy" value="1" defaultChecked={props.hasBuy === "1"} />
                        has buy link
                    </label>
                    <label className="flex items-center gap-2 text-xs font-extrabold text-zinc-700">
                        <input type="checkbox" name="mine" value="1" defaultChecked={props.mine === "1"} />
                        mine
                    </label>
                </div>

                <div className="flex items-center gap-3">
                    <select
                        name="sort"
                        defaultValue={props.sort || "new"}
                        className="rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold"
                    >
                        <option value="new">Newest</option>
                        <option value="old">Oldest</option>
                        <option value="price_asc">Price: low → high</option>
                        <option value="price_desc">Price: high → low</option>
                    </select>

                    <button
                        type="submit"
                        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-extrabold text-white hover:bg-zinc-800"
                    >
                        Apply
                    </button>

                    <a
                        href="/drops"
                        className="rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-extrabold text-zinc-700 no-underline hover:bg-zinc-50"
                    >
                        Reset
                    </a>
                </div>
            </div>
        </form>
    );
}
