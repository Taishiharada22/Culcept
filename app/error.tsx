"use client";

import { useEffect } from "react";

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error("GLOBAL_ERROR:", error);
    }, [error]);

    return (
        <main style={{ maxWidth: 860, margin: "40px auto", padding: 16 }}>
            <h1 style={{ fontSize: 22, fontWeight: 800 }}>Application Error</h1>
            <p style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>
                {error?.message || "(no message) — open DevTools Console"}
            </p>
            {error?.digest ? (
                <p style={{ marginTop: 8, opacity: 0.7 }}>digest: {error.digest}</p>
            ) : null}
            <button style={{ marginTop: 16, padding: 12 }} onClick={() => reset()}>
                Retry
            </button>
        </main>
    );
}
