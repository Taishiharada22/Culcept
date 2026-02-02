// app/drops/[id]/BuyButton.tsx
"use client";

import { useState } from "react";

export default function BuyButton({ dropId, sold }: { dropId: string; sold: boolean }) {
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    async function onBuy() {
        setErr(null);
        setLoading(true);
        try {
            const res = await fetch("/api/checkout/session", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ drop_id: dropId }),
            });
            const json = await res.json().catch(() => null);

            if (!res.ok || !json?.ok) {
                setErr(json?.error ?? `failed (${res.status})`);
                return;
            }
            if (json.url) {
                window.location.href = json.url;
            } else {
                setErr("missing_checkout_url");
            }
        } finally {
            setLoading(false);
        }
    }

    if (sold) {
        return (
            <button disabled className="w-full rounded-lg border px-4 py-3 font-bold opacity-60">
                SOLD OUT
            </button>
        );
    }

    return (
        <div className="space-y-2">
            <button
                onClick={onBuy}
                disabled={loading}
                className="w-full rounded-lg bg-black px-4 py-3 font-bold text-white disabled:opacity-60"
            >
                {loading ? "Redirecting..." : "購入する"}
            </button>
            {err && <p className="text-sm text-red-600">Error: {err}</p>}
        </div>
    );
}
