"use client";

import * as React from "react";
import type { ActionState } from "../types";

const MAX_TAGS = 12;

function normalizeSlug(raw: string) {
    return raw.trim().toLowerCase().replace(/\s+/g, "-");
}

function extFromType(mime: string) {
    if (mime === "image/jpeg") return "jpg";
    if (mime === "image/png") return "png";
    if (mime === "image/webp") return "webp";
    return "img";
}

function TagEditor({ name, defaultTags }: { name: string; defaultTags: string[] }) {
    const [tags, setTags] = React.useState<string[]>(defaultTags ?? []);
    const [v, setV] = React.useState("");

    const add = (raw: string) => {
        const t = raw.trim().replace(/\s+/g, " ").toLowerCase();
        if (!t) return;
        if (tags.includes(t)) return;
        if (tags.length >= MAX_TAGS) return;
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
                    placeholder="styleタグ（例: minimal / street / archive）"
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
            <div className="text-xs font-semibold text-zinc-500">最大{MAX_TAGS}個。重複は弾く。</div>
        </div>
    );
}

export default function ShopForm({
    action,
    defaults,
    submitLabel,
}: {
    action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
    submitLabel: string;
    defaults: {
        slug: string;
        name_ja: string;
        name_en: string;
        headline: string;
        bio: string;
        style_tags: string[];
        is_active: boolean;
        avatar_url: string | null;
        cover_url: string | null;
    };
}) {
    const initial: ActionState = { ok: true, error: null, message: null, fieldErrors: {} };
    const [state, formAction, pending] = (React as any).useActionState(action, initial);

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
                <label className="text-sm font-extrabold">Shop slug *</label>
                <input
                    name="slug"
                    defaultValue={defaults.slug}
                    onBlur={(e) => (e.currentTarget.value = normalizeSlug(e.currentTarget.value))}
                    className="rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                    placeholder="例: taishi-archive"
                />
                {fieldErr("slug") ? <div className="text-xs font-semibold text-red-700">{fieldErr("slug")}</div> : null}
                <div className="text-xs font-semibold text-zinc-500">英小文字/数字/ハイフンのみ（例: my-shop）。URLは /shops/&lt;slug&gt;</div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
                <div className="grid gap-2">
                    <label className="text-sm font-extrabold">Shop name (JA)</label>
                    <input
                        name="name_ja"
                        defaultValue={defaults.name_ja}
                        className="rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                        placeholder="例: タイシ古着店"
                    />
                </div>
                <div className="grid gap-2">
                    <label className="text-sm font-extrabold">Shop name (EN)</label>
                    <input
                        name="name_en"
                        defaultValue={defaults.name_en}
                        className="rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                        placeholder="例: Taishi Archive"
                    />
                </div>
            </div>

            <div className="grid gap-2">
                <label className="text-sm font-extrabold">Headline</label>
                <input
                    name="headline"
                    defaultValue={defaults.headline}
                    className="rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                    placeholder="例: ミニマル×ワークの一点モノ"
                />
            </div>

            <div className="grid gap-2">
                <label className="text-sm font-extrabold">Bio</label>
                <textarea
                    name="bio"
                    defaultValue={defaults.bio}
                    className="min-h-[140px] rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                    placeholder="自分のスタイル/仕入れ基準/サイズ感の考え方/発送方針など"
                />
            </div>

            <div className="grid gap-2">
                <label className="text-sm font-extrabold">Style tags</label>
                <TagEditor name="style_tags" defaultTags={defaults.style_tags ?? []} />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
                <div className="grid gap-2">
                    <label className="text-sm font-extrabold">Avatar image</label>
                    <input name="avatar" type="file" accept="image/jpeg,image/png,image/webp" className="text-sm font-semibold" />
                    {defaults.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={defaults.avatar_url} alt="avatar" className="h-16 w-16 rounded-2xl border border-zinc-200 object-cover" />
                    ) : null}
                    {fieldErr("avatar") ? <div className="text-xs font-semibold text-red-700">{fieldErr("avatar")}</div> : null}
                </div>

                <div className="grid gap-2">
                    <label className="text-sm font-extrabold">Cover image</label>
                    <input name="cover" type="file" accept="image/jpeg,image/png,image/webp" className="text-sm font-semibold" />
                    {defaults.cover_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={defaults.cover_url} alt="cover" className="h-16 w-full rounded-2xl border border-zinc-200 object-cover" />
                    ) : null}
                    {fieldErr("cover") ? <div className="text-xs font-semibold text-red-700">{fieldErr("cover")}</div> : null}
                </div>
            </div>

            <label className="flex items-center gap-2 text-sm font-extrabold">
                <input name="is_active" type="checkbox" defaultChecked={!!defaults.is_active} className="h-4 w-4" />
                公開する（買い手に表示）
            </label>

            <div className="flex justify-end">
                <button
                    type="submit"
                    disabled={pending}
                    className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-extrabold text-white hover:bg-zinc-800 disabled:opacity-60"
                >
                    {pending ? "Saving..." : submitLabel}
                </button>
            </div>
        </form>
    );
}
