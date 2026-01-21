// app/drops/RecoNavLink.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { logRecoAction } from "@/lib/recoLog";

type Action = "save" | "click" | "purchase" | "skip";

function appendImp(href: string, imp: string) {
    try {
        const u = new URL(href, "http://local");
        u.searchParams.set("imp", imp);
        return u.pathname + (u.search ? u.search : "") + (u.hash ? u.hash : "");
    } catch {
        // 失敗時は雑に付ける
        const sep = href.includes("?") ? "&" : "?";
        return `${href}${sep}imp=${encodeURIComponent(imp)}`;
    }
}

export default function RecoNavLink({
    impressionId,
    action = "click",
    meta,
    href,
    className,
    children,
    appendImpToHref = false,
}: {
    impressionId: string | null;
    action?: Action;
    meta?: any;
    href: string;
    className?: string;
    children: React.ReactNode;
    appendImpToHref?: boolean; // Drop詳細で imp を使うなら true
}) {
    const finalHref =
        appendImpToHref && impressionId ? appendImp(href, impressionId) : href;

    return (
        <Link
            href={finalHref}
            className={className}
            onClickCapture={() => {
                if (!impressionId) return;
                logRecoAction(impressionId, action, {
                    ...(meta ?? {}),
                    where: meta?.where ?? "internal_nav",
                    href: finalHref,
                });
            }}
        >
            {children}
        </Link>
    );
}
