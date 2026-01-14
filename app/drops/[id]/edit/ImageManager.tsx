"use client";

import * as React from "react";
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
    const initial: DropActionState = { ok: true, error: null } as any;
    const [state, formAction, pending] = (React as any).useActionState(reorderDropImagesAction.bind(null, dropId), initial);

    const [items, setItems] = React.useState<Img[]>(images ?? []);
    React.useEffect(() => setItems(images ?? []), [images]);

    const [dragId, setDragId] = React.useState<string | null>(null);

    const orderJson = JSON.stringify(items.map((x) => x.id));

    return (
        <div className="grid gap-4">
            {state?.error ? (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{state.error}</div>
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
                            className={[
                                "overflow-hidden rounded-lg border border-zinc-200 bg-white",
                                dragId === im.id ? "opacity-60" : "opacity-100",
                            ].join(" ")}
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

            <form action={formAction} className="flex items-center justify-end gap-3">
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

            <div className="text-xs font-semibold text-zinc-500">ドラッグ → Save order。Deleteは即反映（Storageも削除）。</div>
        </div>
    );
}
