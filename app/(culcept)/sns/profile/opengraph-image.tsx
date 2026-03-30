import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Presence — あなたの人物像";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OGImage() {
    return new ImageResponse(
        (
            <div
                style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "linear-gradient(135deg, #f8fafc 0%, #ede9fe 50%, #fce7f3 100%)",
                    fontFamily: "sans-serif",
                }}
            >
                {/* Aura circle */}
                <div
                    style={{
                        width: 160,
                        height: 160,
                        borderRadius: "50%",
                        background: "linear-gradient(135deg, #7dd3fc, #a78bfa, #f9a8d4)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: 3,
                    }}
                >
                    <div
                        style={{
                            width: "100%",
                            height: "100%",
                            borderRadius: "50%",
                            background: "white",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                        }}
                    >
                        <div style={{ fontSize: 48, fontWeight: 900, color: "#0f172a" }}>
                            🪞
                        </div>
                    </div>
                </div>

                {/* Title */}
                <div
                    style={{
                        marginTop: 32,
                        fontSize: 48,
                        fontWeight: 900,
                        color: "#0f172a",
                        textAlign: "center",
                        letterSpacing: "-0.03em",
                    }}
                >
                    Presence
                </div>

                {/* Subtitle */}
                <div
                    style={{
                        marginTop: 12,
                        fontSize: 24,
                        color: "#64748b",
                        textAlign: "center",
                    }}
                >
                    他者から見た、あなたの人物像
                </div>

                {/* Brand */}
                <div
                    style={{
                        marginTop: 32,
                        fontSize: 16,
                        fontWeight: 700,
                        color: "#8b5cf6",
                        letterSpacing: "0.15em",
                    }}
                >
                    ANEURASYNC
                </div>
            </div>
        ),
        { ...size }
    );
}
