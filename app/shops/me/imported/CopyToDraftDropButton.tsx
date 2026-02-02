"use client";

import { useState } from "react";

export function CopyToDraftDropButton({ externalProductId }: { externalProductId: string }) {
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);

    async function onClick() {
        setLoading(true);
        setMsg(null);
        try {
            const res = await fetch("/api/external-shop/copy-to-drop", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ externalProductId }),
            });
            const json = await res.json().catch(() => null);

            if (!res.ok || !json?.ok) {
                setMsg(json?.error ?? "failed");
                return;
            }
            setMsg(json.already ? "すでに下書きDrop化済み" : "下書きDropを作成しました");

            // 作ったDropに飛びたいなら
            // if (json.dropId) window.location.href = `/drops/${json.dropId}`;
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="flex items-center gap-2">
            <button
                type="button"
                onClick={onClick}
                disabled={loading}
                className="rounded-md border px-3 py-1 text-sm"
            >
                {loading ? "作成中..." : "下書きDropにする"}
            </button>
            {msg ? <span className="text-xs opacity-70">{msg}</span> : null}
        </div>
    );
}
