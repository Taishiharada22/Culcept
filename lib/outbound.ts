// lib/outbound.ts
"use client";

function postJson(url: string, body: any) {
    const payload = JSON.stringify(body);

    // 1) sendBeacon
    try {
        if (typeof navigator !== "undefined" && "sendBeacon" in navigator) {
            const blob = new Blob([payload], { type: "application/json" });
            (navigator as any).sendBeacon(url, blob);
            return;
        }
    } catch { }

    // 2) fetch keepalive
    try {
        fetch(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: payload,
            keepalive: true,
        }).catch(() => { });
    } catch { }
}

export function logOutbound(dropId: string, kind: "buy" | "link", url: string) {
    if (!dropId || !url) return;
    try {
        postJson("/api/outbound", { dropId, kind, url });
    } catch { }
}
