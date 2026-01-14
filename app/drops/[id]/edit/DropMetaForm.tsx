"use client";

import * as React from "react";
import type { DropActionState } from "../../new/type";
import { updateDropMetaAction } from "./actions";

function TagEditor({ name, defaultTags }: { name: string; defaultTags: string[] }) {
    const [tags, setTags] = React.useState<string[]>(defaultTags ?? []);
    const [v, setV] = React.useState("");

    const add = (raw: string) => {
        const t = raw.trim().replace(/\s+/g, " ").toLowerCase();
        if (!t) return;
        if (tags.includes(t)) return;
        if (tags.length >= 15) return;
        setTags((p) => [...p, t]);
    };

    const remove = (t: string) => setTags((p) => p.filter((x) => x !== t));

    return (
        <div className="grid gap-2">
            <input type="hidden" name={name} value={JSON.stringify(tags)} />
            <div className="flex flex-wrap gap-2">
                {tags.map((t) => (
                    <button
                        key={t}
                        type="button"
                        onClick={() => remove(t)}
                        className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-extrabold text-zinc-700 hover:bg-zinc-50"
                        title="クリックで削除"
                    >
                        #{t}
                    </button>
                ))}
            </div>

            <div className="flex gap-2">
                <input
                    value={v}
                    onChange={(e) => setV(e.currentTarget.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            add(v);
                            setV("");
                        }
                    }}
                    placeholder="タグを入力して Enter（例: vintage / workwear）"
                    className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                />
                <button
                    type="button"
                    onClick={() => {
                        add(v);
                        setV("");
                    }}
                    className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-extrabold text-white hover:bg-zinc-800"
                >
                    Add
                </button>
            </div>

            <div className="text-xs font-semibold text-zinc-500">最大15個。重複は自動で弾く。</div>
        </div>
    );
}

export default function DropMetaForm({
    dropId,
    defaults,
}: {
    dropId: string;
    defaults: {
        title: string;
        brand: string;
        size: string;
        condition: string;
        price: string | number;
        url: string;
        purchase_url: string;
        description: string;
        tags: string[];
    };
}) {
    const initial: DropActionState = { ok: true, error: null } as any;
    const [state, formAction, pending] = (React as any).useActionState(updateDropMetaAction.bind(null, dropId), initial);

    const fieldErr = (k: string) => (state as any)?.fieldErrors?.[k] as string | undefined;
    const msg = (state as any)?.message as string | undefined;

    return (
        <form action={formAction} className="grid gap-4">
            {state?.error ? (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
                    {state.error}
                </div>
            ) : null}

            {msg && state?.ok ? (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">
                    {msg}
                </div>
            ) : null}

            <div className="grid gap-2">
                <label className="text-sm font-extrabold">Title *</label>
                <input
                    name="title"
                    defaultValue={defaults.title}
                    className="rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                    placeholder="e.g. Patagonia Retro-X"
                />
                {fieldErr("title") ? <div className="text-xs font-semibold text-red-700">{fieldErr("title")}</div> : null}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
                <div className="grid gap-2">
                    <label className="text-sm font-extrabold">Brand</label>
                    <input
                        name="brand"
                        defaultValue={defaults.brand}
                        className="rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                        placeholder="e.g. Nike"
                    />
                </div>

                <div className="grid gap-2">
                    <label className="text-sm font-extrabold">Size</label>
                    <input
                        name="size"
                        defaultValue={defaults.size}
                        className="rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                        placeholder="e.g. M / 27cm"
                    />
                </div>

                <div className="grid gap-2">
                    <label className="text-sm font-extrabold">Condition</label>
                    <input
                        name="condition"
                        defaultValue={defaults.condition}
                        className="rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                        placeholder="e.g. Good / Used"
                    />
                </div>

                <div className="grid gap-2">
                    <label className="text-sm font-extrabold">Price (JPY)</label>
                    <input
                        name="price"
                        defaultValue={String(defaults.price ?? "")}
                        inputMode="numeric"
                        className="rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                        placeholder="e.g. 9800"
                    />
                    {fieldErr("price") ? <div className="text-xs font-semibold text-red-700">{fieldErr("price")}</div> : null}
                </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
                <div className="grid gap-2">
                    <label className="text-sm font-extrabold">Link</label>
                    <input
                        name="url"
                        defaultValue={defaults.url}
                        className="rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                        placeholder="https://..."
                    />
                    {fieldErr("url") ? <div className="text-xs font-semibold text-red-700">{fieldErr("url")}</div> : null}
                </div>

                <div className="grid gap-2">
                    <label className="text-sm font-extrabold">Buy link</label>
                    <input
                        name="purchase_url"
                        defaultValue={defaults.purchase_url}
                        className="rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                        placeholder="https://..."
                    />
                    {fieldErr("purchase_url") ? <div className="text-xs font-semibold text-red-700">{fieldErr("purchase_url")}</div> : null}
                </div>
            </div>

            <div className="grid gap-2">
                <label className="text-sm font-extrabold">Description</label>
                <textarea
                    name="description"
                    defaultValue={defaults.description}
                    className="min-h-[120px] rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                    placeholder="素材感、スタイリング案、メモ..."
                />
            </div>

            <div className="grid gap-2">
                <label className="text-sm font-extrabold">Tags</label>
                <TagEditor name="tags" defaultTags={defaults.tags ?? []} />
            </div>

            <div className="flex justify-end">
                <button
                    type="submit"
                    disabled={pending}
                    className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-extrabold text-white hover:bg-zinc-800 disabled:opacity-60"
                >
                    {pending ? "Saving..." : "Save meta"}
                </button>
            </div>
        </form>
    );
}
