// app/shops/[slug]/edit/ShopEditForm.tsx
"use client";

import * as React from "react";
import { updateShopAction } from "./actions";

type ActionState = {
    ok: boolean;
    error: string | null;
    message?: string | null;
    fieldErrors?: Record<string, string | undefined>;
};

function tagsToText(tags: string[]) {
    return (tags ?? []).join(", ");
}
function textToTags(raw: string) {
    const parts = String(raw ?? "")
        .split(/[,\n]/g)
        .map((s) => s.trim().replace(/\s+/g, " ").toLowerCase())
        .filter(Boolean);

    const out: string[] = [];
    for (const t of parts) {
        if (out.includes(t)) continue;
        out.push(t);
        if (out.length >= 20) break;
    }
    return out;
}

export default function ShopEditForm({
    slug,
    defaults,
}: {
    slug: string;
    defaults: {
        name_ja: string;
        name_en: string;
        headline: string;
        bio: string;
        avatar_url: string;
        style_tags: string[];
        socials: { instagram?: string; x?: string; youtube?: string; tiktok?: string; website?: string };
        is_active: boolean;
        url: string;
    };
}) {
    const initial: ActionState = { ok: true, error: null };
    const [state, formAction, pending] = (React as any).useActionState(updateShopAction.bind(null, slug), initial);

    const fieldErr = (k: string) => (state as any)?.fieldErrors?.[k] as string | undefined;
    const msg = (state as any)?.message as string | undefined;

    const [tagsText, setTagsText] = React.useState(tagsToText(defaults.style_tags ?? []));

    return (
        <form action={formAction} className="grid gap-4">
            {state?.error ? (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{state.error}</div>
            ) : null}

            {msg && state?.ok ? (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{msg}</div>
            ) : null}

            <div className="grid gap-2">
                <label className="text-sm font-extrabold">Shop URL（内部）</label>
                <input
                    name="url"
                    defaultValue={defaults.url}
                    className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-semibold outline-none"
                    readOnly
                />
                <div className="text-xs font-semibold text-zinc-500">url は NOT NULL。今は内部URL固定（あとで外部URLにしてもOK）</div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
                <div className="grid gap-2">
                    <label className="text-sm font-extrabold">Shop name (JA)</label>
                    <input
                        name="name_ja"
                        defaultValue={defaults.name_ja}
                        className="rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                        placeholder="例：タイシ古着店"
                    />
                    {fieldErr("name_ja") ? <div className="text-xs font-semibold text-red-700">{fieldErr("name_ja")}</div> : null}
                </div>

                <div className="grid gap-2">
                    <label className="text-sm font-extrabold">Shop name (EN)</label>
                    <input
                        name="name_en"
                        defaultValue={defaults.name_en}
                        className="rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                        placeholder="e.g. Taishi Archive"
                    />
                </div>
            </div>

            <div className="grid gap-2">
                <label className="text-sm font-extrabold">Headline（1行キャッチ）</label>
                <input
                    name="headline"
                    defaultValue={defaults.headline}
                    className="rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                    placeholder="例：ミリタリー×ワークの古着、無骨に整える"
                />
                {fieldErr("headline") ? <div className="text-xs font-semibold text-red-700">{fieldErr("headline")}</div> : null}
            </div>

            <div className="grid gap-2">
                <label className="text-sm font-extrabold">Bio（プロフィール/店の説明）</label>
                <textarea
                    name="bio"
                    defaultValue={defaults.bio}
                    className="min-h-[140px] rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                    placeholder="例：都内で古着を集めてます。サイズ感・着用感を丁寧に記載。スタイルは…"
                />
                {fieldErr("bio") ? <div className="text-xs font-semibold text-red-700">{fieldErr("bio")}</div> : null}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
                <div className="grid gap-2">
                    <label className="text-sm font-extrabold">Avatar URL（画像）</label>
                    <input
                        name="avatar_url"
                        defaultValue={defaults.avatar_url}
                        className="rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                        placeholder="https://..."
                    />
                </div>

                <div className="grid gap-2">
                    <label className="text-sm font-extrabold">Style tags（カンマ区切り）</label>
                    <input
                        value={tagsText}
                        onChange={(e) => setTagsText(e.currentTarget.value)}
                        className="rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                        placeholder="vintage, workwear, minimalist..."
                    />
                    <input type="hidden" name="style_tags" value={JSON.stringify(textToTags(tagsText))} />
                </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
                <div className="grid gap-2">
                    <label className="text-sm font-extrabold">Instagram</label>
                    <input
                        name="instagram"
                        defaultValue={defaults.socials?.instagram ?? ""}
                        className="rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                        placeholder="https://instagram.com/..."
                    />
                </div>
                <div className="grid gap-2">
                    <label className="text-sm font-extrabold">X</label>
                    <input
                        name="x"
                        defaultValue={defaults.socials?.x ?? ""}
                        className="rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                        placeholder="https://x.com/..."
                    />
                </div>
                <div className="grid gap-2">
                    <label className="text-sm font-extrabold">YouTube</label>
                    <input
                        name="youtube"
                        defaultValue={defaults.socials?.youtube ?? ""}
                        className="rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                        placeholder="https://youtube.com/..."
                    />
                </div>
                <div className="grid gap-2">
                    <label className="text-sm font-extrabold">Website</label>
                    <input
                        name="website"
                        defaultValue={defaults.socials?.website ?? ""}
                        className="rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                        placeholder="https://..."
                    />
                </div>
            </div>

            <label className="flex items-center gap-2 text-sm font-extrabold">
                <input name="is_active" type="checkbox" defaultChecked={!!defaults.is_active} className="h-4 w-4" />
                Shop公開（ONで買い手に表示）
            </label>

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
