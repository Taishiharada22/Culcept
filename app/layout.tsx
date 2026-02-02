// app/layout.tsx
import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import SiteHeader from "@/app/components/SiteHeader";
import { supabaseServer } from "@/lib/supabase/server";
import { getMyShopId } from "@/lib/getMyShopId";
import { isAdminEmail } from "@/lib/auth/isAdmin";
import { PWAProvider } from "@/components/pwa";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getSiteUrl(): URL {
    const raw =
        (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim() ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
        "http://localhost:3000";

    try {
        if (!/^https?:\/\//i.test(raw)) return new URL(`https://${raw}`);
        return new URL(raw);
    } catch {
        return new URL("http://localhost:3000");
    }
}

export const metadata: Metadata = {
    metadataBase: getSiteUrl(),
    title: { default: "Culcept", template: "%s | Culcept" },
    description: "個人がブランドになる、新しい売買体験",
    manifest: "/manifest.json",
    themeColor: "#8b5cf6",
    appleWebApp: {
        capable: true,
        statusBarStyle: "default",
        title: "Culcept",
    },
    formatDetection: {
        telephone: false,
    },
    openGraph: {
        title: "Culcept",
        description: "個人がブランドになる、新しい売買体験",
        siteName: "Culcept",
        type: "website",
    },
};

export default async function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user ?? null;

    const isAuthenticated = !!user;

    // ✅ Admin判定
    const isAdmin = isAuthenticated ? isAdminEmail(user?.email ?? null) : false;

    /**
     * ✅ Seller判定（DB列揺れを吸収）
     * - owner_user_id / owner_id / user_id どれでもOK
     * - エラーが出ても seller=false のまま続行（従来方針）
     */
    let isSeller = false;
    if (user) {
        try {
            const shopId = await getMyShopId(user.id);
            isSeller = !!shopId;
        } catch (e: any) {
            console.warn("shops check error:", e?.message ?? String(e));
            isSeller = false;
        }
    }

    /**
     * ✅ 未読合計
     * v_conversation_unread_counts は recipient_id, unread_count
     */
    let unreadCount = 0;
    if (user) {
        const { data: rows, error: unreadErr } = await supabase
            .from("v_conversation_unread_counts")
            .select("unread_count")
            .eq("recipient_id", user.id);

        if (unreadErr) {
            console.warn("unread counts fetch error:", unreadErr.message);
        } else {
            unreadCount = (rows ?? []).reduce(
                (sum: number, r: any) => sum + Number(r?.unread_count ?? 0),
                0
            );
        }
    }

    return (
        <html lang="ja">
            <head>
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link
                    rel="preconnect"
                    href="https://fonts.gstatic.com"
                    crossOrigin="anonymous"
                />
                <link
                    href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=DM+Sans:wght@400;500;600;700&display=swap"
                    rel="stylesheet"
                />
                {/* PWA */}
                <link rel="apple-touch-icon" href="/icons/icon.svg" />
                <meta name="apple-mobile-web-app-capable" content="yes" />
                <meta name="apple-mobile-web-app-status-bar-style" content="default" />
                <meta name="mobile-web-app-capable" content="yes" />
            </head>

            <body>
                <PWAProvider>
                <SiteHeader />

                <div className="mx-auto max-w-6xl px-4 py-8">
                    {/* ✅ Navigation (Phase 4 + Phase 5 AI links) */}
                    <nav className="mb-6 flex flex-wrap items-center gap-3">
                        <Link
                            href="/drops"
                            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-800 shadow-sm no-underline hover:bg-slate-50"
                        >
                            Products
                        </Link>

                        <Link
                            href="/feed"
                            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-800 shadow-sm no-underline hover:bg-slate-50"
                        >
                            Feed
                        </Link>

                        {/* ✅ Start（直打ちしかできない問題を解消） */}
                        <Link
                            href="/start"
                            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-800 shadow-sm no-underline hover:bg-slate-50"
                        >
                            Start
                        </Link>

                        {/* ✅ Phase 5 AI機能リンク */}
                        <Link
                            href="/search"
                            className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-black text-emerald-800 shadow-sm no-underline hover:bg-emerald-100"
                        >
                            AI Search
                        </Link>

                        <Link
                            href="/visual-search"
                            className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-black text-emerald-800 shadow-sm no-underline hover:bg-emerald-100"
                        >
                            Visual Search
                        </Link>

                        {/* ✅ Admin（管理者のみ表示） */}
                        {isAuthenticated && isAdmin && (
                            <Link
                                href="/admin/cards"
                                className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-black text-amber-900 shadow-sm no-underline hover:bg-amber-100"
                            >
                                Admin
                            </Link>
                        )}

                        {isAuthenticated && isSeller && (
                            <>
                                <Link
                                    href="/shops/me/products"
                                    className="rounded-xl border border-purple-200 bg-purple-50 px-4 py-2 text-sm font-black text-purple-800 shadow-sm no-underline hover:bg-purple-100"
                                >
                                    My Products
                                </Link>

                                <Link
                                    href="/shops/me/analytics"
                                    className="rounded-xl border border-purple-200 bg-purple-50 px-4 py-2 text-sm font-black text-purple-800 shadow-sm no-underline hover:bg-purple-100"
                                >
                                    Analytics
                                </Link>
                            </>
                        )}

                        {isAuthenticated && (
                            <Link
                                href="/messages"
                                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-800 shadow-sm no-underline hover:bg-slate-50"
                            >
                                <span className="inline-flex items-center">
                                    Messages
                                    {unreadCount > 0 && (
                                        <span className="ml-2 rounded-full bg-red-500 px-2 py-0.5 text-xs font-black text-white">
                                            {unreadCount}
                                        </span>
                                    )}
                                </span>
                            </Link>
                        )}
                    </nav>

                    {children}
                </div>
                </PWAProvider>
            </body>
        </html>
    );
}
