// app/drops/_components/DropForm.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import TagInput from "@/app/components/TagInput";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export type DropActionState = {
    ok: boolean;
    error: string | null;
    fieldErrors?: Record<string, string>;
};

type DropDefaults = {
    title?: string;
    brand?: string | null;
    size?: string | null;
    condition?: string | null;
    price?: number | null;
    url?: string | null;
    purchase_url?: string | null;
    description?: string | null;
    tags?: string[] | null;
};

export default function DropForm({
    mode,
    action,
    defaults,
    existingImages,
    backHref = "/drops",
    submitLabel,
}: {
    mode: "new" | "edit";
    action: (prev: DropActionState, formData: FormData) => Promise<DropActionState>;
    defaults?: DropDefaults;
    existingImages?: { id: string; public_url: string; sort: number }[];
    backHref?: string;
    submitLabel: string;
}) {
    const initial: DropActionState = { ok: true, error: null };
    const [state, formAction, pending] = (React as any).useActionState(action, initial);

    // 画像プレビュー（選択したファイル）
    const [previews, setPreviews] = React.useState<string[]>([]);
    React.useEffect(() => {
        return () => previews.forEach((u) => URL.revokeObjectURL(u));
    }, [previews]);

    const fieldErr = (k: string) => state?.fieldErrors?.[k];

    return (
        <main className="mx-auto max-w-3xl px-4 py-10">
            <div className="mb-4 flex items-center justify-between">
                <Link href={backHref} className="text-sm font-extrabold text-zinc-700 no-underline hover:text-zinc-950">
                    ← Back
                </Link>
                <div className="text-xs font-semibold text-zinc-500">{mode === "new" ? "Create" : "Edit"}</div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>{mode === "new" ? "New Drop" : "Edit Drop"}</CardTitle>
                </CardHeader>

                <CardContent>
                    {state?.error ? (
                        <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
                            {state.error}
                        </div>
                    ) : null}

                    <form action={formAction} className="grid gap-5">
                        {/* Title */}
                        <div className="grid gap-2">
                            <label className="text-sm font-extrabold">Title *</label>
                            <Input name="title" defaultValue={defaults?.title ?? ""} placeholder="e.g. Patagonia Retro-X" />
                            {fieldErr("title") ? (
                                <div className="text-xs font-semibold text-red-700">{fieldErr("title")}</div>
                            ) : (
                                <div className="text-xs font-semibold text-zinc-500">検索で一番効く。短くてもOK。</div>
                            )}
                        </div>

                        {/* Meta row */}
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="grid gap-2">
                                <label className="text-sm font-extrabold">Brand</label>
                                <Input name="brand" defaultValue={defaults?.brand ?? ""} placeholder="e.g. Nike" />
                            </div>
                            <div className="grid gap-2">
                                <label className="text-sm font-extrabold">Size</label>
                                <Input name="size" defaultValue={defaults?.size ?? ""} placeholder="e.g. M / 27cm" />
                            </div>
                            <div className="grid gap-2">
                                <label className="text-sm font-extrabold">Condition</label>
                                <Input name="condition" defaultValue={defaults?.condition ?? ""} placeholder="e.g. New / Good / Used" />
                            </div>
                            <div className="grid gap-2">
                                <label className="text-sm font-extrabold">Price (JPY)</label>
                                <Input
                                    name="price"
                                    defaultValue={defaults?.price ?? ""}
                                    placeholder="e.g. 9800"
                                    inputMode="numeric"
                                />
                                {fieldErr("price") ? <div className="text-xs font-semibold text-red-700">{fieldErr("price")}</div> : null}
                            </div>
                        </div>

                        {/* Links */}
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="grid gap-2">
                                <label className="text-sm font-extrabold">Link</label>
                                <Input name="url" defaultValue={defaults?.url ?? ""} placeholder="https://..." />
                                {fieldErr("url") ? <div className="text-xs font-semibold text-red-700">{fieldErr("url")}</div> : null}
                            </div>
                            <div className="grid gap-2">
                                <label className="text-sm font-extrabold">Buy link</label>
                                <Input name="purchase_url" defaultValue={defaults?.purchase_url ?? ""} placeholder="https://..." />
                                {fieldErr("purchase_url") ? (
                                    <div className="text-xs font-semibold text-red-700">{fieldErr("purchase_url")}</div>
                                ) : null}
                            </div>
                        </div>

                        {/* Description */}
                        <div className="grid gap-2">
                            <label className="text-sm font-extrabold">Description</label>
                            <Textarea name="description" defaultValue={defaults?.description ?? ""} placeholder="メモ、素材感、スタイリング案など" />
                        </div>

                        {/* Tags */}
                        <div className="grid gap-2">
                            <label className="text-sm font-extrabold">Tags</label>
                            <TagInput name="tags" defaultTags={defaults?.tags ?? []} />
                            <div className="text-xs font-semibold text-zinc-500">例：workwear, vintage, tech, minimalist…</div>
                        </div>

                        {/* Existing images */}
                        {mode === "edit" && existingImages && existingImages.length > 0 ? (
                            <div className="grid gap-2">
                                <label className="text-sm font-extrabold">Current images</label>
                                <div className="grid gap-3 md:grid-cols-3">
                                    {existingImages.map((im) => (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            key={im.id}
                                            src={im.public_url}
                                            alt="current"
                                            className="h-40 w-full rounded-lg border border-zinc-200 object-cover"
                                            loading="lazy"
                                        />
                                    ))}
                                </div>

                                <div className="mt-2 grid gap-2">
                                    <label className="text-sm font-extrabold">Image update mode</label>
                                    <div className="flex flex-wrap items-center gap-4 text-sm font-semibold text-zinc-700">
                                        <label className="flex items-center gap-2">
                                            <input type="radio" name="images_mode" value="replace" defaultChecked />
                                            Replace all
                                        </label>
                                        <label className="flex items-center gap-2">
                                            <input type="radio" name="images_mode" value="append" />
                                            Add more
                                        </label>
                                    </div>
                                    <div className="text-xs font-semibold text-zinc-500">
                                        ファイルを選んだ場合のみ反映。選ばなければ画像は変更されない。
                                    </div>
                                </div>
                            </div>
                        ) : null}

                        {/* Upload */}
                        <div className="grid gap-2">
                            <label className="text-sm font-extrabold">{mode === "new" ? "Images (optional)" : "Update images (optional)"}</label>
                            <Input
                                name="images"
                                type="file"
                                accept="image/*"
                                multiple
                                onChange={(e) => {
                                    const files = Array.from(e.currentTarget.files ?? []);
                                    previews.forEach((u) => URL.revokeObjectURL(u));
                                    setPreviews(files.slice(0, 12).map((f) => URL.createObjectURL(f)));
                                }}
                            />
                            {previews.length > 0 ? (
                                <div className="mt-2 grid gap-3 md:grid-cols-3">
                                    {previews.map((u) => (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img key={u} src={u} alt="preview" className="h-40 w-full rounded-lg border border-zinc-200 object-cover" />
                                    ))}
                                </div>
                            ) : null}
                            <div className="text-xs font-semibold text-zinc-500">最大12枚まで推奨（サクサク運用優先）。</div>
                        </div>

                        <div className="flex items-center justify-end gap-3">
                            <Button type="submit" disabled={pending}>
                                {pending ? "Saving..." : submitLabel}
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </main>
    );
}
