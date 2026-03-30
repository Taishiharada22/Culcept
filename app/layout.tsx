// app/layout.tsx
import type { Metadata, Viewport } from "next";
import { Noto_Sans_JP, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import ServiceWorkerRegistration from "@/components/pwa/ServiceWorkerRegistration";
import InstallPrompt from "@/components/pwa/InstallPrompt";
import Providers from "./providers";

const fontSans = Noto_Sans_JP({
    subsets: ["latin"],
    weight: ["400", "500", "600", "700", "800", "900"],
    display: "swap",
    variable: "--font-sans",
});

const fontMono = JetBrains_Mono({
    subsets: ["latin"],
    weight: ["400", "500", "700"],
    display: "swap",
    variable: "--font-mono",
});

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
    title: { default: "Aneurasync", template: "%s | Aneurasync" },
    description: "あなたの本質を、観測しつづける。",
    manifest: "/manifest.json",
    icons: { icon: "/favicon.ico" },
    openGraph: {
        title: "Aneurasync",
        description: "あなたの本質を、観測しつづける。",
        siteName: "Aneurasync",
        type: "website",
    },
    other: {
        "apple-mobile-web-app-capable": "yes",
        "apple-mobile-web-app-status-bar-style": "default",
        "apple-mobile-web-app-title": "Aneurasync",
    },
};

export const viewport: Viewport = {
    themeColor: "#8B5CF6",
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="ja" className={`${fontSans.variable} ${fontMono.variable}`}>
            <head>
                <link
                    rel="preconnect"
                    href={process.env.NEXT_PUBLIC_SUPABASE_URL}
                    crossOrigin="anonymous"
                />
            </head>

            <body className={fontSans.className}>
                <Providers>
                    {children}
                </Providers>
                <ServiceWorkerRegistration />
                <InstallPrompt />
            </body>
        </html>
    );
}
