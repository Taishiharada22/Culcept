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
                    justifyContent: "center",
                    padding: 72,
                    background: "white",
                }}
            >
                <div style={{ fontSize: 64, fontWeight: 900, letterSpacing: -1 }}>Culcept</div>
                <div style={{ marginTop: 16, fontSize: 28, opacity: 0.75 }}>
                    Curated drops and styling ideas.
                </div>
                <div style={{ marginTop: 40, fontSize: 18, opacity: 0.55 }}>
                    culcept — drops / tags / share
                </div>
            </div>
        ),
        size
    );
}
