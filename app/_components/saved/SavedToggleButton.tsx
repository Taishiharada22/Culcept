// app/_components/saved/SavedToggleButton.tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

type ToggleRes = { ok: boolean; saved: boolean; error?: string };

export default function SavedToggleButton({
    kind,
    id,
    initialSaved,
    toggleAction,
    size = "md",
    className,
}: {
    kind: "drop" | "shop";
    id: string;
    initialSaved: boolean;
    toggleAction: (id: string) => Promise<ToggleRes>;
    size?: "sm" | "md";
    className?: string;
}) {
    const router = useRouter();
    const [saved, setSaved] = React.useState<boolean>(!!initialSaved);
    const [pending, startTransition] = React.useTransition();

    const btnSize = size === "sm" ? "h-9 w-9" : "h-10 w-10";
    const textSize = size === "sm" ? "text-[18px]" : "text-[20px]";

    function onClick(e: React.MouseEvent) {
        e.preventDefault();
        e.stopPropagation();
        if (pending) return;

        startTransition(async () => {
            const prev = saved;
            setSaved(!prev); // optimistic

            try {
                const res = await toggleAction(id);
                if (!res?.ok) {
                    setSaved(prev);
                    // UXは軽く（必要なら後でtoastに置換）
                    console.warn(`[SavedToggleButton] toggle failed: ${res?.error ?? "unknown"}`);
                    return;
                }

                setSaved(!!res.saved);
                // SSR一覧（/me/saved 等）を確実に同期
                router.refresh();
            } catch (err) {
                setSaved(prev);
                console.warn("[SavedToggleButton] toggle threw:", err);
            }
        });
    }

    return (
        <button
            type="button"
            aria-label={saved ? `Unsave ${kind}` : `Save ${kind}`}
            aria-pressed={saved}
            onClick={onClick}
            disabled={pending}
            className={[
                "grid place-items-center rounded-full border shadow-sm transition",
                "bg-white/95 backdrop-blur",
                "hover:scale-[1.02] active:scale-[0.98]",
                pending ? "opacity-60" : "",
                btnSize,
                className ?? "",
            ].join(" ")}
        >
            <span className={[textSize, "leading-none"].join(" ")}>{saved ? "♥" : "♡"}</span>
        </button>
    );
}
