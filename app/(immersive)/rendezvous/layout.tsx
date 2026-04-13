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
          {/* Top nav bar — ミニマル */}
          <nav
            style={{
              position: "sticky",
              top: 0,
              zIndex: 40,
              display: "flex",
              alignItems: "center",
              padding: "6px 16px",
              background: "transparent",
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
              ホーム
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

            <Link
              href="/rendezvous/mirror"
              style={{
                position: "absolute",
                right: 16,
                width: 32,
                height: 32,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(26,16,37,0.05)",
                textDecoration: "none",
                fontSize: 14,
              }}
              aria-label="マイページ"
            >
              <svg
                width={16}
                height={16}
                viewBox="0 0 24 24"
                fill="none"
                stroke="#6B6580"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </Link>
          </nav>

          {children}
        </RendezvousLayoutClient>

        {/* Legal links removed from layout — accessible via マイページ/settings */}
      </AtmosphereProvider>
    </>
  );
}
