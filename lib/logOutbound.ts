"use client";

export type OutboundKind = "buy" | "link";

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

function safeStr(v: any, max = 2048) {
    const s = String(v ?? "").trim();
    return s.length > max ? s.slice(0, max) : s;
}

// ✅ これを呼べば /api/outbound に必ず投げる（失敗しても落とさない）
export function logOutbound(args: { dropId: string; kind: OutboundKind; url: string }) {
    try {
        const dropId = safeStr(args.dropId, 128);
        const kind = safeStr(args.kind, 16);
        const url = safeStr(args.url, 2048);
        if (!dropId || !url) return;
        postJson("/api/outbound", { dropId, kind, url });
    } catch { }
}
