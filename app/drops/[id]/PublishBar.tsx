"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// ✅ PublishBar は [id] 配下。setDropStatusAction は edit/actions.ts にあるのでここが正しい
import { setDropStatusAction } from "./edit/actions";

export default function PublishBar({
    dropId,
    status,
}: {
    dropId: string;
    status: "draft" | "published" | "sold" | string | null;
}) {
    const router = useRouter();
    const [pending, setPending] = React.useState(false);
    const isPublished = status === "published";

    return (
        <div className="rounded-2xl border bg-white p-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
                <div className="text-sm font-extrabold">公開状態</div>
                <div className="text-xs font-semibold text-zinc-600">
                    今：<span className="font-black">{String(status ?? "draft")}</span>
                </div>
            </div>

            <div className="flex items-center gap-2">
                <Link
                    href={`/drops/${dropId}`}
                    className="rounded-xl border px-3 py-2 text-sm font-extrabold hover:bg-zinc-50"
                >
                    View
                </Link>

                <button
                    disabled={pending}
                    onClick={async () => {
                        setPending(true);
                        try {
                            await setDropStatusAction(dropId, isPublished ? "draft" : "published");
                            router.push(`/drops/${dropId}`);
                            router.refresh();
                        } catch (e) {
                            console.error("setDropStatusAction failed:", e);
                            alert("公開状態の更新に失敗しました。コンソールのエラーを確認して。");
                        } finally {
                            setPending(false);
                        }
                    }}
                    className={[
                        "rounded-xl px-3 py-2 text-sm font-extrabold disabled:opacity-60",
                        isPublished
                            ? "border border-zinc-200 bg-white hover:bg-zinc-50"
                            : "bg-black text-white hover:opacity-90",
                    ].join(" ")}
                >
                    {pending ? "…" : isPublished ? "下書きに戻す" : "公開する"}
                </button>
            </div>
        </div>
    );
}
