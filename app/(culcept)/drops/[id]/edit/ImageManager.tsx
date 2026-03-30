// app/drops/[id]/edit/ImageManager.tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { DropActionState } from "../../new/type";
import { deleteDropImageAction, reorderDropImagesAction } from "./actions";

type Img = { id: string; public_url: string; sort: number };

function move<T>(arr: T[], from: number, to: number) {
    const a = arr.slice();
    const [x] = a.splice(from, 1);
    a.splice(to, 0, x);
    return a;
}

export default function ImageManager({ dropId, images }: { dropId: string; images: Img[] }) {
    const router = useRouter();

    const initial: DropActionState = { ok: true, error: null } as any;
    const [state, formAction, pending] = (React as any).useActionState(reorderDropImagesAction.bind(null, dropId), initial);

    const [items, setItems] = React.useState<Img[]>(images ?? []);
    React.useEffect(() => setItems(images ?? []), [images]);

    const [dragId, setDragId] = React.useState<string | null>(null);

    // ✅ “送信後の成功” だけを検知するためのフラグ
    const [didSubmit, setDidSubmit] = React.useState(false);
    React.useEffect(() => {
        // 初期状態 ok:true は無視、submit後に成功したらViewへ
        if (!didSubmit) return;
        if (pending) return;

        const ok = Boolean((state as any)?.ok);
        const nextPath = String((state as any)?.nextPath ?? "");
        if (ok && nextPath) {
            router.push(nextPath);
        }
    }, [didSubmit, pending, state, router]);

    const orderJson = JSON.stringify(items.map((x) => x.id));

    return (
        <div className="grid gap-4">
            {state?.error ? (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{(state as any).error}</div>
            ) : null}

            {/* ✅ 成功メッセージ（遷移が一瞬遅れても安心できる） */}
            {didSubmit && !pending && (state as any)?.ok && (state as any)?.message ? (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">
                    {(state as any).message} / 商品ページへ移動します…
                </div>
            ) : null}

            {items.length === 0 ? (
                <div className="text-sm font-semibold text-zinc-600">画像がありません。</div>
            ) : (
                <ul className="grid gap-3 md:grid-cols-3">
                    {items.map((im, idx) => (
                        <li
                            key={im.id}
                            draggable
                            onDragStart={() => setDragId(im.id)}
                            onDragEnd={() => setDragId(null)}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={() => {
                                if (!dragId) return;
                                const from = items.findIndex((x) => x.id === dragId);
                                const to = idx;
                                if (from < 0 || to < 0 || from === to) return;
                                setItems((p) => move(p, from, to));
                            }}
                            className={["overflow-hidden rounded-lg border border-zinc-200 bg-white", dragId === im.id ? "opacity-60" : "opacity-100"].join(" ")}
                            title="ドラッグで並び替え"
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={im.public_url} alt="img" className="h-44 w-full object-cover" loading="lazy" />
                            <div className="flex items-center justify-between gap-2 p-3">
                                <div className="text-xs font-extrabold text-zinc-700">#{idx + 1}</div>

                                <form action={deleteDropImageAction.bind(null, dropId, im.id)}>
                                    <button
                                        type="submit"
                                        className="rounded-md border border-zinc-200 bg-white px-3 py-1 text-xs font-extrabold text-zinc-700 hover:bg-zinc-50"
                                    >
                                        Delete
                                    </button>
                                </form>
                            </div>
                        </li>
                    ))}
                </ul>
            )}

            <form
                action={formAction}
                className="flex items-center justify-end gap-3"
                onSubmit={() => {
                    setDidSubmit(true);
                }}
            >
                <input type="hidden" name="order" value={orderJson} />

                <button
                    type="button"
                    onClick={() => setItems(images ?? [])}
                    className="rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-extrabold text-zinc-700 hover:bg-zinc-50"
                >
                    Reset
                </button>

                <button
                    type="submit"
                    disabled={pending || items.length === 0}
                    className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-extrabold text-white hover:bg-zinc-800 disabled:opacity-60"
                >
                    {pending ? "Saving..." : "Save order"}
                </button>
            </form>

            <div className="text-xs font-semibold text-zinc-500">ドラッグ → Save order。保存後は商品ページへ自動で移動。</div>
        </div>
    );
}
