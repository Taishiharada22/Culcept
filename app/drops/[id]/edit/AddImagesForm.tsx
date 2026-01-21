// app/drops/[id]/edit/AddImagesForm.tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { registerDropImagesAction } from "./actions";

const MAX_TOTAL = 10;
const MAX_MB_PER_FILE = 20;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

type SignedRes =
    | { ok: true; bucket: string; path: string; token: string; publicUrl: string }
    | { ok: false; error: string };

function mb(n: number) {
    return Math.round((n / 1024 / 1024) * 10) / 10;
}

function encodePathKeepSlashes(p: string) {
    return p
        .split("/")
        .map((seg) => encodeURIComponent(seg))
        .join("/");
}

export default function AddImagesForm({ dropId, currentCount }: { dropId: string; currentCount: number }) {
    const router = useRouter();
    const [error, setError] = React.useState<string | null>(null);
    const [pending, setPending] = React.useState(false);
    const [files, setFiles] = React.useState<File[]>([]);
    const [previews, setPreviews] = React.useState<string[]>([]);
    const inputRef = React.useRef<HTMLInputElement | null>(null);

    React.useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabase = React.useMemo(() => {
        const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
        return createClient(supabaseUrl, key, {
            auth: { persistSession: false, autoRefreshToken: false },
        });
    }, [supabaseUrl]);

    const remaining = Math.max(0, MAX_TOTAL - currentCount);
    const maxPick = Math.min(remaining, 10);

    async function sign(file: File): Promise<SignedRes> {
        const res = await fetch("/api/uploads/drop-images", {
            method: "POST",
            headers: { "content-type": "application/json" },
            cache: "no-store",
            body: JSON.stringify({
                dropId,
                fileName: file.name,
                contentType: file.type || "image/jpeg",
            }),
        });
        const json = (await res.json().catch(() => null)) as any;
        if (!res.ok || !json?.ok) return { ok: false, error: json?.error ?? "sign failed" };
        return json as SignedRes;
    }

    async function uploadSigned(s: Extract<SignedRes, { ok: true }>, file: File) {
        // 1) supabase-js に uploadToSignedUrl があるならそれを使う
        const api: any = supabase.storage.from(s.bucket);
        if (typeof api.uploadToSignedUrl === "function") {
            const { error: upErr } = await api.uploadToSignedUrl(s.path, s.token, file, {
                contentType: file.type || "image/jpeg",
                upsert: false,
            });
            if (upErr) throw new Error(upErr.message);
            return;
        }

        // 2) 無い場合は fetch フォールバック（署名URLの形式）
        // NOTE: path のスラッシュを %2F にすると InvalidSignature になり得るので「スラッシュ保持」でエンコード
        const safePath = encodePathKeepSlashes(s.path);
        const url = `${supabaseUrl}/storage/v1/object/upload/sign/${s.bucket}/${safePath}?token=${encodeURIComponent(s.token)}`;

        const put = await fetch(url, {
            method: "PUT",
            headers: {
                "content-type": file.type || "image/jpeg",
            },
            body: file,
        });

        if (!put.ok) {
            const text = await put.text().catch(() => "");
            throw new Error(`signed upload failed (${put.status}): ${text || "unknown"}`);
        }
    }

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);

        if (!files.length) return setError("画像を選択して");
        if (files.length > maxPick) return setError(`追加できるのは最大 ${maxPick} 枚（今 ${currentCount} 枚）`);

        const badType = files.find((f) => f.type && !ALLOWED_MIME.has(String(f.type).toLowerCase()));
        if (badType) return setError(`"${badType.name}" は非対応形式（jpg/png/webp のみ）`);

        const tooBig = files.find((f) => f.size > MAX_MB_PER_FILE * 1024 * 1024);
        if (tooBig) return setError(`"${tooBig.name}" が大きすぎる（${MAX_MB_PER_FILE}MB以下 / 今 ${mb(tooBig.size)}MB）`);

        setPending(true);
        try {
            const uploaded: { path: string; publicUrl: string }[] = [];

            for (const f of files) {
                const s = await sign(f);
                if (!s.ok) throw new Error(s.error);

                await uploadSigned(s, f);
                uploaded.push({ path: s.path, publicUrl: s.publicUrl });
            }

            // ✅ DB登録（これが無いと編集画面の images が増えない）
            const st = await registerDropImagesAction(dropId, uploaded);
            if (!st?.ok) throw new Error(st?.error ?? "register failed");

            router.refresh();

            // clear
            previews.forEach((u) => URL.revokeObjectURL(u));
            setPreviews([]);
            setFiles([]);
            if (inputRef.current) inputRef.current.value = "";
        } catch (err: any) {
            setError(String(err?.message ?? err));
        } finally {
            setPending(false);
        }
    }

    return (
        <form onSubmit={onSubmit} className="grid gap-4">
            {error ? (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700 whitespace-pre-wrap">
                    {error}
                </div>
            ) : null}

            <div className="text-xs font-semibold text-zinc-600">
                現在 <span className="font-black">{currentCount}</span> 枚 / 最大{MAX_TOTAL}枚（追加可能:{" "}
                <span className="font-black">{remaining}</span>）
            </div>

            <div className="grid gap-2">
                <label className="text-sm font-extrabold">Images</label>
                <input
                    ref={inputRef}
                    type="file"
                    name="images"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    disabled={pending || remaining <= 0}
                    onChange={(e) => {
                        const picked = Array.from(e.currentTarget.files ?? []).slice(0, maxPick);
                        previews.forEach((u) => URL.revokeObjectURL(u));
                        setFiles(picked);
                        setPreviews(picked.map((f) => URL.createObjectURL(f)));
                    }}
                    className="block w-full rounded-md border border-zinc-200 px-3 py-2 text-sm font-semibold disabled:opacity-60"
                />
                <div className="text-xs font-semibold text-zinc-500">
                    jpg/png/webp、最大{maxPick}枚、1枚{MAX_MB_PER_FILE}MB以下
                </div>
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
