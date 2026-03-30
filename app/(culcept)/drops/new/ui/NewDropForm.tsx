// app/drops/new/ui/NewDropForm.tsx
"use client";

import * as React from "react";
import { createDropAction } from "../actions";

function TagEditor({ name }: { name: string }) {
    const [tags, setTags] = React.useState<string[]>([]);
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

export default function NewDropForm() {
    const initial = { ok: true, error: null, fieldErrors: {} as Record<string, string> };
    const [state, formAction, pending] = (React as any).useActionState(createDropAction, initial);

    const fe = (k: string) => (state?.fieldErrors?.[k] as string | undefined) ?? undefined;

    return (
        <form action={formAction} className="grid gap-4">
            {state?.error ? (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
                    {state.error}
                </div>
            ) : null}

            <div className="grid gap-2">
                <label className="text-sm font-extrabold">Title *</label>
                <input
                    name="title"
                    className="rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                    placeholder="e.g. Patagonia Retro-X"
                />
                {fe("title") ? <div className="text-xs font-semibold text-red-700">{fe("title")}</div> : null}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
                <div className="grid gap-2">
                    <label className="text-sm font-extrabold">Brand</label>
                    <input
                        name="brand"
                        className="rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                        placeholder="e.g. Nike"
                    />
                </div>

                <div className="grid gap-2">
                    <label className="text-sm font-extrabold">Size</label>
                    <input
                        name="size"
                        className="rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                        placeholder="e.g. M / 27cm"
                    />
                </div>

                <div className="grid gap-2">
                    <label className="text-sm font-extrabold">Condition</label>
                    <input
                        name="condition"
                        className="rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                        placeholder="e.g. Good / Used"
                    />
                </div>

                <div className="grid gap-2">
                    <label className="text-sm font-extrabold">Price (JPY)</label>
                    <input
                        name="price"
                        inputMode="numeric"
                        className="rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                        placeholder="e.g. 9800"
                    />
                    {fe("price") ? <div className="text-xs font-semibold text-red-700">{fe("price")}</div> : null}
                </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
                <div className="grid gap-2">
                    <label className="text-sm font-extrabold">Link</label>
                    <input
                        name="url"
                        className="rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                        placeholder="https://..."
                    />
                    {fe("url") ? <div className="text-xs font-semibold text-red-700">{fe("url")}</div> : null}
                </div>

                <div className="grid gap-2">
                    <label className="text-sm font-extrabold">Buy link</label>
                    <input
                        name="purchase_url"
                        className="rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                        placeholder="https://..."
                    />
                    {fe("purchase_url") ? <div className="text-xs font-semibold text-red-700">{fe("purchase_url")}</div> : null}
                </div>
            </div>

            <div className="grid gap-2">
                <label className="text-sm font-extrabold">Description</label>
                <textarea
                    name="description"
                    className="min-h-[120px] rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                    placeholder="素材感、スタイリング案、メモ..."
                />
            </div>

            <div className="grid gap-2">
                <label className="text-sm font-extrabold">Tags</label>
                <TagEditor name="tags" />
            </div>

            <div className="grid gap-2">
                <label className="text-sm font-extrabold">Images</label>
                <input
                    type="file"
                    name="images"
                    accept="image/jpeg,image/png,image/webp,image/*"
                    multiple
                    className="block w-full rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold"
                />
                <div className="text-xs font-semibold text-zinc-500">最大10枚（重すぎる場合は後で制限も追加できる）</div>
            </div>

            <div className="flex justify-end">
                <button
                    type="submit"
                    disabled={pending}
                    className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-extrabold text-white hover:bg-zinc-800 disabled:opacity-60"
                >
                    {pending ? "Creating..." : "Create"}
                </button>
            </div>
        </form>
    );
}
