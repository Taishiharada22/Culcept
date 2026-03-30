// app/drops/OutboundLink.tsx
"use client";

import * as React from "react";
import { logOutbound } from "@/lib/outbound";

export default function OutboundLink({
    dropId,
    kind,
    url,
    className,
    children,
}: {
    dropId: string;
    kind: "buy" | "link";
    url: string;
    className?: string;
    children: React.ReactNode;
}) {
    return (
        <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className={className}
            onClick={() => {
                // ✅ 遷移を止めずに裏でログだけ打つ
                try {
                    logOutbound(dropId, kind, url);
                } catch { }
            }}
        >
            {children}
        </a>
    );
}
