// app/api/og-image/route.tsx
import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);

    const title = searchParams.get("title") || "Culcept";
    const description = searchParams.get("description") || "個人がブランドになる、新しい売買体験";
    const image = searchParams.get("image") || "";
    const type = searchParams.get("type") || "default"; // card, shop, ranking

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
                                    Culcept
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
                            Culcept
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
