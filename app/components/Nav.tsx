"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { useFormStatus } from "react-dom";

function LocaleButton({ value, label }: { value: "en" | "ja"; label: string }) {
    const { pending } = useFormStatus();
    return (
        <button
            type="submit"
            name="locale"
            value={value}
            disabled={pending}
            style={{
                padding: "6px 10px",
                border: "1px solid #ddd",
                opacity: pending ? 0.6 : 1
            }}
        >
            {label}
        </button>
    );
}

export default function Nav({ action }: { action: (fd: FormData) => Promise<void> }) {
    const t = useTranslations("Nav");
    const pathname = usePathname();

    const item = (href: string, text: string) => (
        <Link
            href={href}
            style={{
                padding: "8px 10px",
                borderBottom: pathname === href ? "2px solid #000" : "2px solid transparent"
            }}
        >
            {text}
        </Link>
    );

    return (
        <header style={{ borderBottom: "1px solid #eee" }}>
            <div style={{ maxWidth: 860, margin: "0 auto", padding: 16, display: "flex", gap: 12, alignItems: "center" }}>
                <Link href="/" style={{ fontWeight: 900 }}>Culcept</Link>
                <nav style={{ display: "flex", gap: 10, marginLeft: 12 }}>
                    {item("/match", t("match"))}
                    {item("/shops", t("shops"))}
                    {item("/drops", t("drops"))}
                </nav>

                <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                    <form action={action} style={{ display: "flex", gap: 8 }}>
                        <LocaleButton value="en" label="EN" />
                        <LocaleButton value="ja" label="JA" />
                    </form>
                </div>
            </div>
        </header>
    );
}
