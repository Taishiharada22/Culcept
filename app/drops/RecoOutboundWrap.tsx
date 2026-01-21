// app/drops/RecoOutboundWrap.tsx
"use client";

import * as React from "react";
import OutboundLink from "@/app/drops/OutboundLink";
import { logRecoAction, WHERE } from "@/lib/recoLog";
import { logOutbound } from "@/lib/outbound";

export default function RecoOutboundWrap({
    impressionId,
    recoAction,
    meta,
    dropId,
    kind,
    url,
    className,
    children,
}: {
    impressionId: string | null;
    recoAction: "click" | "purchase";
    meta?: any;
    dropId: string;
    kind: "buy" | "link";
    url: string;
    className?: string;
    children: React.ReactNode;
}) {
    return (
        <span
            onClickCapture={() => {
                // 1) reco action（impressionIdがある時だけ）
                try {
                    if (impressionId) {
                        logRecoAction(impressionId, recoAction, {
                            ...(meta ?? {}),
                            where: kind === "buy" ? WHERE.OUTBOUND_BUY : WHERE.OUTBOUND_LINK,
                            outbound_kind: kind,
                            drop_id: dropId,
                            url,
                        });
                    }
                } catch { }

                // 2) outbound（impressionId不要）
                try {
                    logOutbound(dropId, kind, url);
                } catch { }
            }}
        >
            <OutboundLink dropId={dropId} kind={kind} url={url} className={className}>
                {children}
            </OutboundLink>
        </span>
    );
}
