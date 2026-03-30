import Link from "next/link";
import RendezvousLayoutClient from "@/components/rendezvous/RendezvousLayoutClient";
import AtmosphereProvider from "@/components/rendezvous/AtmosphereProvider";

/**
 * Rendezvous layout wrapper (server component).
 * ライトウォーム環境 — 温もりと親密さの空間。
 */

export const metadata = {
  title: "Rendezvous | Aneurasync",
};

export default function RendezvousLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <AtmosphereProvider>
        <RendezvousLayoutClient>
          {/* Top nav bar — ライトガラス */}
          <nav
            style={{
              position: "sticky",
              top: 0,
              zIndex: 40,
              display: "flex",
              alignItems: "center",
              padding: "14px 20px",
              background: "rgba(255,255,255,0.82)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              borderBottom: "1px solid rgba(26,16,37,0.06)",
            }}
          >
            <Link
              href="/aneurasync"
              style={{
                fontSize: 12,
                color: "#A8A0B8",
                textDecoration: "none",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <svg
                width={14}
                height={14}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M15 18l-6-6 6-6" />
              </svg>
              戻る
            </Link>

            <span
              style={{
                flex: 1,
                textAlign: "center",
                fontSize: 11,
                fontWeight: 800,
                color: "#6B6580",
                letterSpacing: 4,
                textTransform: "uppercase",
              }}
            >
              Rendezvous
            </span>

            <div style={{ width: 40 }} />
          </nav>

          {children}
        </RendezvousLayoutClient>

        <footer style={{
          padding: "24px 16px",
          textAlign: "center",
          fontSize: 11,
          color: "#A8A0B8",
          position: "relative",
          zIndex: 2,
        }}>
          <div style={{ display: "flex", justifyContent: "center", gap: 16, flexWrap: "wrap" }}>
            <a href="/legal/terms" style={{ color: "#6B6580", textDecoration: "none" }}>利用規約</a>
            <a href="/legal/privacy" style={{ color: "#6B6580", textDecoration: "none" }}>プライバシーポリシー</a>
            <a href="/legal/commercial" style={{ color: "#6B6580", textDecoration: "none" }}>特定商取引法に基づく表記</a>
          </div>
          <p style={{ marginTop: 8 }}>&copy; 2026 Aneurasync</p>
        </footer>
      </AtmosphereProvider>
    </>
  );
}
