"use client";

import * as React from "react";
import { updateMyShopAction, type ShopActionState } from "./actions";

function TagEditor({ name, defaultTags }: { name: string; defaultTags: string[] }) {
    const [tags, setTags] = React.useState<string[]>(defaultTags ?? []);
    const [v, setV] = React.useState("");

    const add = (raw: string) => {
        const t = raw.trim().replace(/\s+/g, " ").toLowerCase();
        if (!t) return;
        if (tags.includes(t)) return;
        if (tags.length >= 12) return;
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
                        {t}
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
                    placeholder="スタイルタグ（例: minimal / street / archive）"
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
            <div className="text-xs font-semibold text-zinc-500">最大12個。買い手が「店の雰囲気」を掴むため。</div>
        </div>
    );
}

export default function ShopForm({
    shopId,
    defaults,
}: {
    shopId: string | null;
    defaults: {
        slug?: string | null;
        name_ja?: string | null;
        name_en?: string | null;
        headline?: string | null;
        bio?: string | null;
        url?: string | null;
        avatar_url?: string | null;
        banner_url?: string | null;
        style_tags?: string[] | null;
        socials?: any;
        is_active?: boolean | null;
    };
}) {
    const initial: ShopActionState = { ok: true, error: null, message: null, fieldErrors: {} };
    const [state, formAction, pending] = (React as any).useActionState(updateMyShopAction, initial);

    const fieldErr = (k: string) => (state as any)?.fieldErrors?.[k] as string | undefined;
    const msg = (state as any)?.message as string | undefined;

    const socials = defaults.socials ?? {};

    return (
        <form action={formAction} className="grid gap-4">
            <input type="hidden" name="shop_id" value={shopId ?? ""} />

            {state?.error ? (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{state.error}</div>
            ) : null}
            {msg && state?.ok ? (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{msg}</div>
            ) : null}

            <div className="grid gap-2">
                <label className="text-sm font-extrabold">公開ステータス</label>
                <label className="flex items-center gap-2 text-sm font-extrabold">
                    <input name="is_active" type="checkbox" defaultChecked={!!defaults.is_active} className="h-4 w-4" />
                    Public（買い手に公開）
                </label>
            </div>

            <div className="grid gap-2">
                <label className="text-sm font-extrabold">Shop slug（任意）</label>
                <input
                    name="slug"
                    defaultValue={String(defaults.slug ?? "")}
                    className="rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                    placeholder="e.g. taishi-store（空なら自動生成）"
                />
                {fieldErr("slug") ? <div className="text-xs font-semibold text-red-700">{fieldErr("slug")}</div> : null}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
                <div className="grid gap-2">
                    <label className="text-sm font-extrabold">Shop name (JA) *</label>
                    <input
                        name="name_ja"
                        defaultValue={String(defaults.name_ja ?? "")}
                        className="rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                        placeholder="例: Culcept Vintage"
                    />
                    {fieldErr("name_ja") ? <div className="text-xs font-semibold text-red-700">{fieldErr("name_ja")}</div> : null}
                </div>

                <div className="grid gap-2">
                    <label className="text-sm font-extrabold">Shop name (EN)</label>
                    <input
                        name="name_en"
                        defaultValue={String(defaults.name_en ?? "")}
                        className="rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                        placeholder="Optional"
                    />
                </div>
            </div>

            <div className="grid gap-2">
                <label className="text-sm font-extrabold">Headline</label>
                <input
                    name="headline"
                    defaultValue={String(defaults.headline ?? "")}
                    className="rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                    placeholder="例: ミニマル×ストリートの“毎日着れる”古着"
                />
            </div>

            <div className="grid gap-2">
                <label className="text-sm font-extrabold">Bio</label>
                <textarea
                    name="bio"
                    defaultValue={String(defaults.bio ?? "")}
                    className="min-h-[140px] rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                    placeholder="例: 身長/体型、普段の雰囲気、セレクト基準..."
                />
            </div>

            <div className="grid gap-2">
                <label className="text-sm font-extrabold">Style tags</label>
                <TagEditor name="style_tags" defaultTags={defaults.style_tags ?? []} />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
                <div className="grid gap-2">
                    <label className="text-sm font-extrabold">Website</label>
                    <input
                        name="url"
                        defaultValue={String(defaults.url ?? "")}
                        className="rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                        placeholder="https://..."
                    />
                    {fieldErr("url") ? <div className="text-xs font-semibold text-red-700">{fieldErr("url")}</div> : null}
                </div>

                <div className="grid gap-2">
                    <label className="text-sm font-extrabold">Instagram</label>
                    <input
                        defaultValue={String(socials.instagram ?? "")}
                        className="rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                        placeholder="@..."
                        onBlur={(e) => {
                            const form = (e.currentTarget.closest("form") as HTMLFormElement) ?? null;
                            if (!form) return;
                            const x = form.querySelector('input[name="socials"]') as HTMLInputElement;
                            const cur = x?.value ? JSON.parse(x.value) : {};
                            cur.instagram = e.currentTarget.value.trim();
                            x.value = JSON.stringify(cur);
                        }}
                    />
                </div>
            </div>

            <input type="hidden" name="socials" defaultValue={JSON.stringify(socials)} />

            <div className="grid gap-3 md:grid-cols-2">
                <div className="grid gap-2">
                    <label className="text-sm font-extrabold">Avatar（任意）</label>
                    <input name="avatar" type="file" accept="image/*" className="text-sm font-semibold" />
                    {defaults.avatar_url ? <div className="text-xs font-semibold text-zinc-500">現在: 設定済み</div> : null}
                </div>
                <div className="grid gap-2">
                    <label className="text-sm font-extrabold">Banner（任意）</label>
                    <input name="banner" type="file" accept="image/*" className="text-sm font-semibold" />
                    {defaults.banner_url ? <div className="text-xs font-semibold text-zinc-500">現在: 設定済み</div> : null}
                </div>
            </div>

            <div className="flex justify-end">
                <button
                    type="submit"
                    disabled={pending}
                    className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-extrabold text-white hover:bg-zinc-800 disabled:opacity-60"
                >
                    {pending ? "Saving..." : "Save shop"}
                </button>
            </div>
        </form>
    );
}
