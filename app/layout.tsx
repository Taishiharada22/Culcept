// app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import SiteHeader from "@/app/components/SiteHeader";

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
    description: "Culcept",
    openGraph: { title: "Culcept", description: "Culcept", siteName: "Culcept", type: "website" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="ja">
            <body>
                <SiteHeader />
                <div className="mx-auto max-w-6xl px-4 py-8">{children}</div>
            </body>
        </html>
    );
}
