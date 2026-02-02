// app/shops/me/shop-form.tsx
"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { shopFormAction, type ShopActionState } from "./actions";
import TagEditor from "./TagEditor";

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
        external_url?: string | null;
        avatar_url?: string | null;
        banner_url?: string | null;
        cover_url?: string | null;
        style_tags?: string[] | null;
        socials?: any;
        is_active?: boolean | null;
    };
}) {
    const router = useRouter();
    const sp = useSearchParams();

    const reset = sp.get("reset") === "1";
    const v = sp.get("v") ?? "";

    // ✅ reset=1 のときだけ、公開ステータス以外を空表示
    const viewDefaults = React.useMemo(() => {
        if (!reset) return defaults;

        return {
            ...defaults,
            slug: "",
            name_ja: "",
            name_en: "",
            headline: "",
            bio: "",
            url: "",
            external_url: "",
            style_tags: [],
            socials: {},
            // is_active は保持（新規は false を推奨）
        };
    }, [defaults, reset]);

    // ✅ reset をURLから外す（以後は普通表示）
    React.useEffect(() => {
        if (!reset) return;
        const next = new URLSearchParams(sp.toString());
        next.delete("reset");
        router.replace(`/shops/me?${next.toString()}`);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reset]);

    const initial: ShopActionState = { ok: true, error: null, message: null, fieldErrors: {} };
    const [state, formAction, pending] = (React as any).useActionState(shopFormAction, initial);

    const fieldErr = (k: string) => (state as any)?.fieldErrors?.[k] as string | undefined;

    const socials = viewDefaults.socials ?? {};

    // ✅ shopId / v が変わったらフォームを丸ごとリマウントして defaultValue を効かせる
    const formKey = `${shopId ?? "none"}:${v}`;

    return (
        <form key={formKey} action={formAction} className="grid gap-5">
            <input type="hidden" name="shop_id" value={shopId ?? ""} />

            {state?.error ? (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{state.error}</div>
            ) : null}

            {/* URLだけ手入力の導線 */}
            <section className="rounded-2xl border border-zinc-200 bg-white p-4 grid gap-3">
                <div className="flex items-end justify-between gap-3">
                    <div>
                        <div className="text-sm font-extrabold">① Website URL（ここだけ手入力）</div>
                        <div className="text-xs font-semibold text-zinc-600">URL保存 → AI生成で、残りは自動で埋まる。</div>
                    </div>

                    <label className="flex items-center gap-2 text-xs font-extrabold text-zinc-700">
                        <input name="overwrite" type="checkbox" value="1" className="h-4 w-4" />
                        上書き生成（既存テキストも置き換える）
                    </label>
                </div>

                <div className="grid gap-2">
                    <input
                        name="url"
                        defaultValue={String(viewDefaults.external_url ?? viewDefaults.url ?? "")}
                        className="rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                        placeholder="https://example.com"
                    />
                    {fieldErr("url") ? <div className="text-xs font-semibold text-red-700">{fieldErr("url")}</div> : null}
                </div>

                <div className="flex flex-wrap gap-2">
                    <button
                        type="submit"
                        name="_intent"
                        value="save_url"
                        disabled={pending || !shopId}
                        className="rounded-md border border-zinc-900 bg-white px-3 py-2 text-xs font-black text-zinc-900 hover:bg-zinc-50 disabled:opacity-60"
                    >
                        {pending ? "..." : "URLを保存"}
                    </button>

                    <button
                        type="submit"
                        name="_intent"
                        value="ai_generate"
                        disabled={pending || !shopId}
                        className="rounded-md bg-zinc-900 px-3 py-2 text-xs font-black text-white hover:bg-zinc-800 disabled:opacity-60"
                    >
                        {pending ? "Generating..." : "AI生成（URLから自動入力）"}
                    </button>

                    <button
                        type="submit"
                        name="_intent"
                        value="save_all"
                        disabled={pending || !shopId}
                        className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs font-black text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
                        title="手で微調整した内容を保存する"
                    >
                        {pending ? "..." : "（任意）手動保存"}
                    </button>
                </div>

                {!shopId ? (
                    <div className="text-xs font-semibold text-red-700">まず「＋ 新規ショップ」から下書きを作ってください。</div>
                ) : null}
            </section>

            {/* 公開ステータス */}
            <div className="grid gap-2">
                <label className="text-sm font-extrabold">公開ステータス</label>
                <label className="flex items-center gap-2 text-sm font-extrabold">
                    <input name="is_active" type="checkbox" defaultChecked={!!viewDefaults.is_active} className="h-4 w-4" />
                    Public（買い手に公開）
                </label>
                <div className="text-xs font-semibold text-zinc-500">
                    ※ 複数ショップを公開したいなら、DBの <span className="font-black">shops_one_active_per_owner</span> 制約を落とす必要あり（上のSQL）。
                </div>
            </div>

            {/* slug */}
            <div className="grid gap-2">
                <label className="text-sm font-extrabold">Shop slug（任意）</label>
                <input
                    name="slug"
                    defaultValue={String(viewDefaults.slug ?? "")}
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
                        defaultValue={String(viewDefaults.name_ja ?? "")}
                        className="rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                        placeholder="例: Culcept Vintage"
                    />
                    {fieldErr("name_ja") ? <div className="text-xs font-semibold text-red-700">{fieldErr("name_ja")}</div> : null}
                </div>

                <div className="grid gap-2">
                    <label className="text-sm font-extrabold">Shop name (EN)</label>
                    <input
                        name="name_en"
                        defaultValue={String(viewDefaults.name_en ?? "")}
                        className="rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                        placeholder="Optional"
                    />
                </div>
            </div>

            <div className="grid gap-2">
                <label className="text-sm font-extrabold">Headline</label>
                <input
                    name="headline"
                    defaultValue={String(viewDefaults.headline ?? "")}
                    className="rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                    placeholder="例: ミニマル×ストリートの“毎日着れる”古着"
                />
            </div>

            <div className="grid gap-2">
                <label className="text-sm font-extrabold">Bio</label>
                <textarea
                    name="bio"
                    defaultValue={String(viewDefaults.bio ?? "")}
                    className="min-h-[140px] rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                    placeholder="例: 身長/体型、普段の雰囲気、セレクト基準..."
                />
            </div>

            <div className="grid gap-2">
                <label className="text-sm font-extrabold">Style tags</label>
                <TagEditor key={`${formKey}:tags`} name="style_tags" defaultTags={viewDefaults.style_tags ?? []} />
            </div>

            {/* socials */}
            <div className="grid gap-3 md:grid-cols-2">
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
                            if (!x) return;

                            let cur: any = {};
                            try {
                                cur = x.value ? JSON.parse(x.value) : {};
                            } catch {
                                cur = {};
                            }
                            cur.instagram = e.currentTarget.value.trim();
                            x.value = JSON.stringify(cur);
                        }}
                    />
                </div>

                <div className="grid gap-2">
                    <label className="text-sm font-extrabold">X（Twitter）</label>
                    <input
                        defaultValue={String(socials.x ?? socials.twitter ?? "")}
                        className="rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                        placeholder="@..."
                        onBlur={(e) => {
                            const form = (e.currentTarget.closest("form") as HTMLFormElement) ?? null;
                            if (!form) return;
                            const x = form.querySelector('input[name="socials"]') as HTMLInputElement;
                            if (!x) return;

                            let cur: any = {};
                            try {
                                cur = x.value ? JSON.parse(x.value) : {};
                            } catch {
                                cur = {};
                            }
                            cur.x = e.currentTarget.value.trim();
                            x.value = JSON.stringify(cur);
                        }}
                    />
                </div>
            </div>

            <input type="hidden" name="socials" defaultValue={JSON.stringify(socials ?? {})} />

            {/* images */}
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

            <div className="text-xs font-semibold text-zinc-500">
                ※ 画像は「AI生成」でもURLから拾って自動で入ります（og:image / jsonld.logo 等）。
            </div>
        </form>
    );
}
