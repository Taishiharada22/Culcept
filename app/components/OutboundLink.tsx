"use client";

import * as React from "react";

type Props = {
    dropId: string;
    kind: "buy" | "link";
    href: string;
    className?: string;
    children: React.ReactNode;
};

export default function OutboundLink({ dropId, kind, href, className, children }: Props) {
    const onClick = React.useCallback(() => {
        try {
            const payload = JSON.stringify({ dropId, kind, url: href });
            // 可能なら sendBeacon（タブ遷移/新規タブでも落ちにくい）
            if (navigator.sendBeacon) {
                const blob = new Blob([payload], { type: "application/json" });
                navigator.sendBeacon("/api/outbound", blob);
                return;
            }
            // fallback
            fetch("/api/outbound", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: payload,
                keepalive: true,
            }).catch(() => { });
        } catch {
            // noop
        }
    }, [dropId, kind, href]);

    return (
        <a
            href={href}
            target="_blank"
            rel="noreferrer"
            onClick={onClick}
            className={className}
        >
            {children}
        </a>
    );
}
