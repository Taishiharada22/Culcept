// app/shops/new/NewShopForm.tsx
"use client";

import * as React from "react";
import { createShopAction } from "./actions";

type ActionState = {
    ok: boolean;
    error: string | null;
    message?: string | null;
    fieldErrors?: Record<string, string | undefined>;
};

export default function NewShopForm() {
    const initial: ActionState = { ok: true, error: null };
    const [state, formAction, pending] = (React as any).useActionState(createShopAction, initial);

    const fieldErr = (k: string) => (state as any)?.fieldErrors?.[k] as string | undefined;

    return (
        <form action={formAction} className="grid gap-4">
            {state?.error ? (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
                    {state.error}
                </div>
            ) : null}

            <div className="grid gap-2">
                <label className="text-sm font-extrabold">Shop slug *</label>
                <input
                    name="slug"
                    className="rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                    placeholder="例: taishi-vintage（a-z0-9 と -）"
                />
                {fieldErr("slug") ? <div className="text-xs font-semibold text-red-700">{fieldErr("slug")}</div> : null}
                <div className="text-xs font-semibold text-zinc-500">
                    URLが <span className="font-black">/shops/slug</span> になる。後から変えない前提が安全。
                </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
                <div className="grid gap-2">
                    <label className="text-sm font-extrabold">Name (JA)</label>
                    <input
                        name="name_ja"
                        className="rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                        placeholder="例: タイシ古着店"
                    />
                    {fieldErr("name_ja") ? <div className="text-xs font-semibold text-red-700">{fieldErr("name_ja")}</div> : null}
                </div>

                <div className="grid gap-2">
                    <label className="text-sm font-extrabold">Name (EN)</label>
                    <input
                        name="name_en"
                        className="rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                        placeholder="e.g. TAISHI ARCHIVE"
                    />
                </div>
            </div>

            <div className="grid gap-2">
                <label className="text-sm font-extrabold">Headline</label>
                <input
                    name="headline"
                    className="rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                    placeholder="例: Workwear中心。状態とストーリー重視。"
                />
            </div>

            <div className="grid gap-2">
                <label className="text-sm font-extrabold">Bio（簡易プロフィール）</label>
                <textarea
                    name="bio"
                    className="min-h-[140px] rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                    placeholder="例: 自分のスタイル / サイズ感 / どういう服を集めてるか / どう着るか など"
                />
            </div>

            <div className="grid gap-2">
                <label className="text-sm font-extrabold">Avatar URL</label>
                <input
                    name="avatar_url"
                    className="rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                    placeholder="https://...（後で画像アップロード対応もできる）"
                />
            </div>

            <div className="grid gap-2">
                <label className="text-sm font-extrabold">Style tags（カンマ区切り）</label>
                <input
                    name="style_tags"
                    className="rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-zinc-900"
                    placeholder="vintage, workwear, minimal, street..."
                />
                <div className="text-xs font-semibold text-zinc-500">最大20個。買い手が「この店っぽい」を一瞬で理解できる。</div>
            </div>

            <div className="flex justify-end gap-2">
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
