// app/drops/RecoImpressionPing.tsx
"use client";

import * as React from "react";
import { logRecoAction } from "@/lib/recoLog";

type Action = "save" | "click" | "purchase" | "skip";

function safeKey(s: string) {
    return s.replace(/[^a-zA-Z0-9:_-]/g, "");
}

export default function RecoImpressionPing({
    impressionId,
    action = "click",
    meta,
    onceKey,
}: {
    impressionId: string | null;
    action?: Action;
    meta?: any;
    onceKey?: string; // where などで明示してもOK
}) {
    const firedRef = React.useRef(false);

    React.useEffect(() => {
        if (!impressionId) return;
        if (firedRef.current) return;

        const k = safeKey(onceKey ?? `reco_ping:${impressionId}:${action}:${meta?.where ?? ""}`);
        try {
            if (typeof sessionStorage !== "undefined") {
                if (sessionStorage.getItem(k) === "1") return;
                sessionStorage.setItem(k, "1");
            }
        } catch {
            // storage不可でも続行（重複しても致命的ではない）
        }

        firedRef.current = true;
        logRecoAction(impressionId, action, meta ?? {});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [impressionId]);

    return null;
}
