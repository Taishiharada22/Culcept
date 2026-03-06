// app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import SiteHeader from "@/app/components/SiteHeader";
import { supabaseServer } from "@/lib/supabase/server";
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
    const userName = user?.user_metadata?.name || user?.email || null;

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
                    <SiteHeader
                        isAuthenticated={isAuthenticated}
                        unreadCount={unreadCount}
                        userName={userName}
                    />

                    <div className="mx-auto max-w-6xl px-4 py-8">
                        {children}
                    </div>
                </PWAProvider>
            </body>
        </html>
    );
}
