"use client";

import * as React from "react";

export default function ImageModalGallery(props: {
    title: string;
    images: Array<{ id: string; public_url: string }>;
}) {
    const [open, setOpen] = React.useState(false);
    const [idx, setIdx] = React.useState(0);

    const imgs = props.images ?? [];

    const show = (i: number) => {
        setIdx(i);
        setOpen(true);
    };

    const close = () => setOpen(false);

    const cur = imgs[idx]?.public_url ?? "";

    return (
        <div className="grid gap-3">
            {imgs.length === 0 ? (
                <div className="rounded-lg border border-zinc-200 bg-white p-4 text-sm font-semibold text-zinc-600">
                    No images.
                </div>
            ) : (
                <ul className="grid list-none gap-3 p-0 md:grid-cols-3">
                    {imgs.map((x, i) => (
                        <li key={x.id} className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={x.public_url}
                                alt={props.title}
                                className="h-44 w-full cursor-pointer object-cover"
                                loading="lazy"
                                onClick={() => show(i)}
                            />
                        </li>
                    ))}
                </ul>
            )}

            {open ? (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
                    onClick={close}
                    role="dialog"
                    aria-modal="true"
                >
                    <div className="max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between gap-3 border-b border-zinc-200 p-3">
                            <div className="text-sm font-extrabold text-zinc-800">
                                {idx + 1} / {imgs.length}
                            </div>
                            <button
                                onClick={close}
                                className="rounded-md border border-zinc-200 bg-white px-3 py-1 text-sm font-extrabold text-zinc-700 hover:bg-zinc-50"
                            >
                                Close
                            </button>
                        </div>

                        <div className="grid place-items-center bg-black">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={cur} alt={props.title} className="max-h-[82vh] w-auto object-contain" />
                        </div>

                        <div className="flex items-center justify-between gap-3 border-t border-zinc-200 p-3">
                            <button
                                disabled={idx <= 0}
                                onClick={() => setIdx((p) => Math.max(0, p - 1))}
                                className="rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-extrabold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                            >
                                ← Prev
                            </button>
                            <button
                                disabled={idx >= imgs.length - 1}
                                onClick={() => setIdx((p) => Math.min(imgs.length - 1, p + 1))}
                                className="rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-extrabold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                            >
                                Next →
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
