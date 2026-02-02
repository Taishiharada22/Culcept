// app/drops/DropFilters.tsx
"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Props = {
    q: string;
    brand: string;
    size: string;
    condition: string;
    tags: string;
    min: string;
    max: string;
    hasImage: string;
    hasBuy: string;
    sort: string;
    mine: string;
};

export default function DropsFilters(p: Props) {
    const router = useRouter();
    const sp = useSearchParams();

    const [q, setQ] = React.useState(p.q ?? "");
    const [brand, setBrand] = React.useState(p.brand ?? "");
    const [size, setSize] = React.useState(p.size ?? "");
    const [condition, setCondition] = React.useState(p.condition ?? "");
    const [tags, setTags] = React.useState(p.tags ?? "");
    const [min, setMin] = React.useState(p.min ?? "");
    const [max, setMax] = React.useState(p.max ?? "");
    const [hasImage, setHasImage] = React.useState(p.hasImage === "1");
    const [hasBuy, setHasBuy] = React.useState(p.hasBuy === "1");
    const [sort, setSort] = React.useState(p.sort ?? "new");
    const [mine, setMine] = React.useState(p.mine === "1");

    function go(next?: Partial<Record<string, string>>) {
        const qs = new URLSearchParams(sp?.toString() ?? "");

        const setOrDel = (k: string, v: string) => {
            const x = (v ?? "").trim();
            if (!x) qs.delete(k);
            else qs.set(k, x);
        };

        setOrDel("q", next?.q ?? q);
        setOrDel("brand", next?.brand ?? brand);
        setOrDel("size", next?.size ?? size);
        setOrDel("condition", next?.condition ?? condition);
        setOrDel("tags", next?.tags ?? tags);
        setOrDel("min", next?.min ?? min);
        setOrDel("max", next?.max ?? max);

        if ((next?.hasImage ?? (hasImage ? "1" : "")) === "1") qs.set("hasImage", "1");
        else qs.delete("hasImage");

        if ((next?.hasBuy ?? (hasBuy ? "1" : "")) === "1") qs.set("hasBuy", "1");
        else qs.delete("hasBuy");

        const s = next?.sort ?? sort;
        if (s && s !== "new") qs.set("sort", s);
        else qs.delete("sort");

        if ((next?.mine ?? (mine ? "1" : "")) === "1") qs.set("mine", "1");
        else qs.delete("mine");

        qs.delete("page"); // フィルタ変更時は1ページ目へ
        router.push(`/drops?${qs.toString()}`);
    }

    return (
        <div className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="grid gap-2 md:grid-cols-3">
                <input
                    value={q}
                    onChange={(e) => setQ(e.currentTarget.value)}
                    onKeyDown={(e) => e.key === "Enter" && go()}
                    placeholder="Search title/description..."
                    className="rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                />
                <input
                    value={brand}
                    onChange={(e) => setBrand(e.currentTarget.value)}
                    onKeyDown={(e) => e.key === "Enter" && go()}
                    placeholder="Brand"
                    className="rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                />
                <input
                    value={tags}
                    onChange={(e) => setTags(e.currentTarget.value)}
                    onKeyDown={(e) => e.key === "Enter" && go()}
                    placeholder="Tags (comma) e.g. vintage,workwear"
                    className="rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                />
            </div>

            <div className="grid gap-2 md:grid-cols-4">
                <input
                    value={size}
                    onChange={(e) => setSize(e.currentTarget.value)}
                    onKeyDown={(e) => e.key === "Enter" && go()}
                    placeholder="Size"
                    className="rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                />
                <input
                    value={condition}
                    onChange={(e) => setCondition(e.currentTarget.value)}
                    onKeyDown={(e) => e.key === "Enter" && go()}
                    placeholder="Condition"
                    className="rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                />
                <input
                    value={min}
                    onChange={(e) => setMin(e.currentTarget.value)}
                    onKeyDown={(e) => e.key === "Enter" && go()}
                    placeholder="Min price"
                    inputMode="numeric"
                    className="rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                />
                <input
                    value={max}
                    onChange={(e) => setMax(e.currentTarget.value)}
                    onKeyDown={(e) => e.key === "Enter" && go()}
                    placeholder="Max price"
                    inputMode="numeric"
                    className="rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 text-xs font-semibold text-zinc-700">
                        <input type="checkbox" checked={hasImage} onChange={(e) => { setHasImage(e.target.checked); }} />
                        Has image
                    </label>
                    <label className="flex items-center gap-2 text-xs font-semibold text-zinc-700">
                        <input type="checkbox" checked={hasBuy} onChange={(e) => { setHasBuy(e.target.checked); }} />
                        Has buy link
                    </label>
                    <label className="flex items-center gap-2 text-xs font-semibold text-zinc-700">
                        <input type="checkbox" checked={mine} onChange={(e) => { setMine(e.target.checked); }} />
                        Mine
                    </label>

                    <select
                        value={sort}
                        onChange={(e) => { setSort(e.currentTarget.value); }}
                        className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs font-black text-zinc-800"
                    >
                        <option value="new">New</option>
                        <option value="popular">Popular (30d)</option>
                        <option value="old">Old</option>
                        <option value="price_asc">Price ↑</option>
                        <option value="price_desc">Price ↓</option>
                    </select>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => go()}
                        className="rounded-md bg-zinc-900 px-4 py-2 text-xs font-black text-white hover:bg-zinc-800"
                    >
                        Apply
                    </button>
                    <button
                        type="button"
                        onClick={() => router.push("/drops")}
                        className="rounded-md border border-zinc-200 bg-white px-4 py-2 text-xs font-black text-zinc-700 hover:bg-zinc-50"
                    >
                        Reset
                    </button>
                </div>
            </div>

            {/* Applyはチェック状態を反映させる */}
            <div className="hidden">
                {/* no-op */}
            </div>

            {/* checkbox state を apply に乗せる */}
            <script
                dangerouslySetInnerHTML={{
                    __html: "",
                }}
            />
        </div>
    );
}
