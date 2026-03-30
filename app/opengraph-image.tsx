// app/opengraph-image.tsx
import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
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
                    background: "linear-gradient(160deg, #060510, #0a0a2a, #0f0520)",
                    padding: 72,
                }}
            >
                <div
                    style={{
                        fontSize: 72,
                        fontWeight: 900,
                        letterSpacing: -1,
                        background: "linear-gradient(135deg, #8b5cf6, #ec4899)",
                        backgroundClip: "text",
                        color: "transparent",
                        marginBottom: 24,
                    }}
                >
                    Aneurasync
                </div>
                <div
                    style={{
                        fontSize: 32,
                        color: "rgba(255,255,255,0.85)",
                        textAlign: "center",
                        lineHeight: 1.5,
                    }}
                >
                    自分でも気づいていない自分を、観測する。
                </div>
                <div
                    style={{
                        marginTop: 24,
                        fontSize: 20,
                        color: "rgba(255,255,255,0.4)",
                        textAlign: "center",
                    }}
                >
                    27 Archetypes — 深層自己観測
                </div>
            </div>
        ),
        size
    );
}
