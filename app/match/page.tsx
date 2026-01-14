"use client";
import { useTranslations } from "next-intl";

export default function MatchPage() {
    const t = useTranslations("Match");
    return (
        <main style={{ maxWidth: 860, margin: "40px auto", padding: 16 }}>
            <h1 style={{ fontSize: 28, fontWeight: 800 }}>{t("title")}</h1>
            <p style={{ marginTop: 12 }}>{t("streetClassic")}</p>
            <p>{t("minimalLoud")}</p>
            <p>{t("modernVintage")}</p>
            <button style={{ marginTop: 16, padding: 12, fontWeight: 700 }}>{t("cta")}</button>
        </main>
    );
}
