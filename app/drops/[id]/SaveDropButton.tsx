"use client";

import * as React from "react";
import { toggleSavedDropAction } from "@/app/_actions/saved";

export default function SaveDropButton({
    dropId,
    initialSaved,
}: {
    dropId: string;
    initialSaved: boolean;
}) {
    const [saved, setSaved] = React.useState<boolean>(!!initialSaved);
    const [pending, startTransition] = React.useTransition();
    const [err, setErr] = React.useState<string | null>(null);

    return (
        <div className="grid gap-2">
            {err ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-extrabold text-red-700">
                    {err}
                </div>
            ) : null}

            <button
                type="button"
                disabled={pending}
                onClick={() => {
                    setErr(null);
                    startTransition(async () => {
                        const res = await toggleSavedDropAction(dropId);

                        if (!res?.ok) {
                            // ✅ res.error が undefined の可能性があるので string に確定させる
                            setErr(res?.error ?? "保存処理に失敗しました。");
                            return;
                        }

                        setSaved(!!res.saved);
                    });
                }}
                className={[
                    "rounded-xl px-3 py-2 text-sm font-extrabold disabled:opacity-60",
                    saved
                        ? "border border-zinc-200 bg-white hover:bg-zinc-50"
                        : "bg-zinc-900 text-white hover:bg-zinc-800",
                ].join(" ")}
            >
                {pending ? "…" : saved ? "Saved（解除）" : "♡ Save"}
            </button>
        </div>
    );
}
