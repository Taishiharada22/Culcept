// app/api/og-image/route.tsx
import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import {
    ARCHETYPE_DEFS,
    getArchetypeByCode,
    getColorGroup,
    type ArchetypeCode,
} from "@/lib/stargazer/archetypeTypes";

export const runtime = "edge";

// ColorGroup → gradient mapping
const GRADIENTS: Record<string, { from: string; to: string }> = {
    "purple-bright": { from: "#7C3AED", to: "#A855F7" },
    "purple-medium": { from: "#6D28D9", to: "#8B5CF6" },
    "purple-deep":   { from: "#4C1D95", to: "#6D28D9" },
    "amber-bright":  { from: "#D97706", to: "#F59E0B" },
    "amber-medium":  { from: "#B45309", to: "#D97706" },
    "amber-deep":    { from: "#92400E", to: "#B45309" },
    "teal-bright":   { from: "#0D9488", to: "#14B8A6" },
    "teal-medium":   { from: "#0F766E", to: "#0D9488" },
    "teal-deep":     { from: "#115E59", to: "#0F766E" },
};

function getGradient(code: ArchetypeCode) {
    const cg = getColorGroup(code);
    const key = `${cg.family}-${cg.tone}`;
    return GRADIENTS[key] ?? GRADIENTS["purple-medium"];
}

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);

    const title = searchParams.get("title") || "Aneurasync";
    const description = searchParams.get("description") || "自分でも気づいていない自分を、観測する";
    const image = searchParams.get("image") || "";
    const type = searchParams.get("type") || "default"; // card, shop, ranking, archetype, oracle
    const code = searchParams.get("code") || "";
    const name = searchParams.get("name") || "";

    // ━━━ Genome Card OG Image ━━━
    if (type === "genome-card" && code) {
        const def = getArchetypeByCode(code as ArchetypeCode);
        if (def) {
            const grad = getGradient(def.code);
            return new ImageResponse(
                (
                    <div style={{
                        height: "100%", width: "100%", display: "flex", flexDirection: "column",
                        alignItems: "center", justifyContent: "center",
                        background: `linear-gradient(135deg, ${grad.from} 0%, ${grad.to} 100%)`,
                        fontFamily: "sans-serif",
                    }}>
                        <div style={{ fontSize: 80, marginBottom: 16 }}>{def.emoji}</div>
                        <div style={{ fontSize: 56, fontWeight: 800, color: "white", marginBottom: 8 }}>
                            {def.name}
                        </div>
                        <div style={{ fontSize: 24, color: "rgba(255,255,255,0.6)", letterSpacing: "0.1em", marginBottom: 24 }}>
                            {def.englishName} — {def.code}
                        </div>
                        {name && (
                            <div style={{ fontSize: 20, color: "rgba(255,255,255,0.5)", marginBottom: 16 }}>
                                {name}
                            </div>
                        )}
                        <div style={{
                            fontSize: 16, color: "rgba(255,255,255,0.4)", maxWidth: 500,
                            textAlign: "center", lineHeight: 1.6, fontStyle: "italic",
                        }}>
                            「{def.tagline}」
                        </div>
                        <div style={{
                            position: "absolute", bottom: 40, fontSize: 14,
                            color: "rgba(255,255,255,0.3)", letterSpacing: "0.15em",
                        }}>
                            ANEURASYNC — GENOME CARD
                        </div>
                    </div>
                ),
                { width: 1200, height: 630 },
            );
        }
    }

    // ━━━ Archetype OG Image ━━━
    if (type === "archetype" && code) {
        const def = getArchetypeByCode(code as ArchetypeCode);
        if (def) {
            const grad = getGradient(def.code);
            const anotherSelf = getArchetypeByCode(def.shadowCode);
            return new ImageResponse(
                (
                    <div style={{
                        height: "100%", width: "100%", display: "flex", flexDirection: "column",
                        alignItems: "center", justifyContent: "center",
                        background: `linear-gradient(145deg, ${grad.from}, ${grad.to}, #0a0a1a)`,
                        padding: "60px",
                    }}>
                        <div style={{ fontSize: "120px", marginBottom: "8px" }}>{def.emoji}</div>
                        <div style={{
                            fontSize: "64px", fontWeight: "bold", color: "white",
                            letterSpacing: "-1px", marginBottom: "8px",
                        }}>
                            {def.englishName}
                        </div>
                        <div style={{
                            fontSize: "28px", color: "rgba(255,255,255,0.6)",
                            fontFamily: "monospace", marginBottom: "24px",
                        }}>
                            {def.code} — {def.name}
                        </div>
                        <div style={{
                            fontSize: "26px", color: "rgba(255,255,255,0.85)",
                            textAlign: "center", maxWidth: "900px", lineHeight: 1.6,
                            marginBottom: "32px",
                        }}>
                            {def.tagline.length > 60 ? def.tagline.slice(0, 60) + "…" : def.tagline}
                        </div>
                        {anotherSelf && (
                            <div style={{
                                display: "flex", alignItems: "center", gap: "12px",
                                fontSize: "22px", color: "rgba(255,255,255,0.5)",
                            }}>
                                <span>もうひとりの自分</span>
                                <span style={{ fontSize: "28px" }}>{anotherSelf.emoji}</span>
                                <span style={{ color: "rgba(255,255,255,0.7)" }}>{anotherSelf.englishName}</span>
                            </div>
                        )}
                        <div style={{
                            position: "absolute", bottom: "40px",
                            display: "flex", alignItems: "center", gap: "8px",
                            fontSize: "20px", color: "rgba(255,255,255,0.35)",
                        }}>
                            <span>Aneurasync</span>
                            <span>—</span>
                            <span>深層自己観測</span>
                        </div>
                    </div>
                ),
                { width: 1200, height: 630 },
            );
        }
    }

    // ━━━ Oracle Card OG Image ━━━
    if (type === "oracle") {
        const oracleText = searchParams.get("text") || "自分でも気づいていない自分を、観測する";
        const archetypeLabel = searchParams.get("label") || "";
        return new ImageResponse(
            (
                <div style={{
                    height: "100%", width: "100%", display: "flex", flexDirection: "column",
                    alignItems: "center", justifyContent: "center",
                    background: "linear-gradient(160deg, #0a0a1a, #1a0a2a, #0a1a2a)",
                    padding: "60px",
                }}>
                    <div style={{
                        fontSize: "16px", letterSpacing: "6px", color: "rgba(255,255,255,0.4)",
                        marginBottom: "40px", textTransform: "uppercase" as const,
                    }}>
                        ✦ Daily Oracle ✦
                    </div>
                    <div style={{
                        fontSize: "36px", color: "rgba(255,255,255,0.9)",
                        textAlign: "center", maxWidth: "900px", lineHeight: 1.8,
                        marginBottom: "40px", fontWeight: "500",
                    }}>
                        「{oracleText}」
                    </div>
                    <div style={{
                        width: "60px", height: "1px",
                        background: "rgba(255,255,255,0.2)", marginBottom: "32px",
                    }} />
                    {archetypeLabel && (
                        <div style={{
                            fontSize: "22px", color: "rgba(255,255,255,0.5)",
                            marginBottom: "8px",
                        }}>
                            {archetypeLabel}
                        </div>
                    )}
                    <div style={{
                        position: "absolute", bottom: "40px",
                        fontSize: "18px", color: "rgba(255,255,255,0.25)",
                    }}>
                        aneurasync.app
                    </div>
                </div>
            ),
            { width: 1200, height: 630 },
        );
    }

    return new ImageResponse(
        (
            <div
                style={{
                    height: "100%",
                    width: "100%",
                    display: "flex",
                    flexDirection: "column",
                    backgroundColor: "#1a1a1a",
                    padding: "40px",
                }}
            >
                {type === "card" && image ? (
                    // カード用OGP
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "center",
                            height: "100%",
                            gap: "40px",
                        }}
                    >
                        <div
                            style={{
                                display: "flex",
                                width: "400px",
                                height: "400px",
                                borderRadius: "24px",
                                overflow: "hidden",
                                boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
                            }}
                        >
                            <img
                                src={image}
                                style={{
                                    width: "100%",
                                    height: "100%",
                                    objectFit: "cover",
                                }}
                            />
                        </div>
                        <div
                            style={{
                                display: "flex",
                                flexDirection: "column",
                                justifyContent: "center",
                                maxWidth: "400px",
                            }}
                        >
                            <div
                                style={{
                                    fontSize: "48px",
                                    fontWeight: "bold",
                                    color: "white",
                                    lineHeight: 1.2,
                                    marginBottom: "16px",
                                }}
                            >
                                {title}
                            </div>
                            <div
                                style={{
                                    fontSize: "24px",
                                    color: "#999",
                                }}
                            >
                                {description}
                            </div>
                            <div
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    marginTop: "32px",
                                    gap: "8px",
                                }}
                            >
                                <div
                                    style={{
                                        fontSize: "24px",
                                        color: "#8b5cf6",
                                        fontWeight: "bold",
                                    }}
                                >
                                    Aneurasync
                                </div>
                            </div>
                        </div>
                    </div>
                ) : type === "ranking" ? (
                    // ランキング用OGP
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            height: "100%",
                        }}
                    >
                        <div
                            style={{
                                fontSize: "80px",
                                marginBottom: "20px",
                            }}
                        >
                            🏆
                        </div>
                        <div
                            style={{
                                fontSize: "56px",
                                fontWeight: "bold",
                                color: "white",
                                textAlign: "center",
                            }}
                        >
                            {title}
                        </div>
                        <div
                            style={{
                                fontSize: "28px",
                                color: "#999",
                                marginTop: "16px",
                            }}
                        >
                            {description}
                        </div>
                        <div
                            style={{
                                display: "flex",
                                marginTop: "40px",
                                gap: "16px",
                            }}
                        >
                            <span style={{ fontSize: "40px" }}>🥇</span>
                            <span style={{ fontSize: "40px" }}>🥈</span>
                            <span style={{ fontSize: "40px" }}>🥉</span>
                        </div>
                    </div>
                ) : (
                    // デフォルトOGP
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            height: "100%",
                        }}
                    >
                        <div
                            style={{
                                fontSize: "72px",
                                fontWeight: "bold",
                                background: "linear-gradient(135deg, #8b5cf6, #ec4899)",
                                backgroundClip: "text",
                                color: "transparent",
                                marginBottom: "24px",
                            }}
                        >
                            Aneurasync
                        </div>
                        <div
                            style={{
                                fontSize: "36px",
                                color: "white",
                                textAlign: "center",
                                maxWidth: "800px",
                            }}
                        >
                            {title}
                        </div>
                        <div
                            style={{
                                fontSize: "24px",
                                color: "#999",
                                marginTop: "16px",
                                textAlign: "center",
                            }}
                        >
                            {description}
                        </div>
                    </div>
                )}
            </div>
        ),
        {
            width: 1200,
            height: 630,
        }
    );
}
