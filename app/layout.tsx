// app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";

// ここは「絶対に valid URL」にする（空文字/不正でも落とさない）
function getSiteUrl(): URL {
    const raw =
        (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim() ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
        "http://localhost:3000";

    try {
        // raw が "culcept.com" みたいに scheme無しでも救う
        if (!/^https?:\/\//i.test(raw)) return new URL(`https://${raw}`);
        return new URL(raw);
    } catch {
        return new URL("http://localhost:3000");
    }
}

export const metadata: Metadata = {
    metadataBase: getSiteUrl(),
    title: {
        default: "Culcept",
        template: "%s | Culcept",
    },
    description: "Culcept",
    openGraph: {
        title: "Culcept",
        description: "Culcept",
        siteName: "Culcept",
        type: "website",
    },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="ja">
            <body>{children}</body>
        </html>
    );
}
