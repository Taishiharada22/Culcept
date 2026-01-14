"use client";

import * as React from "react";
import type { DropActionState } from "../../new/type";
import { addDropImagesAction } from "./actions";

export default function AddImagesForm({ dropId, currentCount }: { dropId: string; currentCount: number }) {
    const initial: DropActionState = { ok: true, error: null } as any;
    const [state, formAction, pending] = (React as any).useActionState(addDropImagesAction.bind(null, dropId), initial);

    const [previews, setPreviews] = React.useState<string[]>([]);
    React.useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

    return (
        <form action={formAction} className="grid gap-4">
            {state?.error ? (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{state.error}</div>
            ) : null}

            <div className="text-xs font-semibold text-zinc-600">
                現在 <span className="font-black">{currentCount}</span> 枚 / 最大10枚
            </div>

            <div className="grid gap-2">
                <label className="text-sm font-extrabold">Images</label>
                <input
                    type="file"
                    name="images"
                    accept="image/jpeg,image/png,image/webp,image/*"
                    multiple
                    onChange={(e) => {
                        const files = Array.from(e.currentTarget.files ?? []).slice(0, 10);
                        previews.forEach((u) => URL.revokeObjectURL(u));
                        setPreviews(files.map((f) => URL.createObjectURL(f)));
                    }}
                    className="block w-full rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold"
                />
                <div className="text-xs font-semibold text-zinc-500">jpg/png/webp、1枚6MB以下</div>
            </div>

            {previews.length > 0 ? (
                <div className="grid gap-3 md:grid-cols-3">
                    {previews.map((u) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={u} src={u} alt="preview" className="h-40 w-full rounded-lg border border-zinc-200 object-cover" />
                    ))}
                </div>
            ) : null}

            <div className="flex justify-end">
                <button
                    type="submit"
                    disabled={pending}
                    className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-extrabold text-white hover:bg-zinc-800 disabled:opacity-60"
                >
                    {pending ? "Uploading..." : "Add images"}
                </button>
            </div>
        </form>
    );
}
