import Link from "next/link";
import type { ReactNode } from "react";

const palette = {
  page: "#fbfaf7",
  pageAccent: "#f1eadc",
  surface: "#ffffff",
  surfaceMuted: "#f8f5ee",
  border: "#e7e1d6",
  heading: "#1f2937",
  text: "#334155",
  muted: "#6b7280",
  accent: "#c96d4a",
  shadow: "0 24px 60px rgba(15, 23, 42, 0.08)",
} as const;

type LegalPageProps = {
  title: string;
  description: string;
  lastUpdated?: string;
  children: ReactNode;
};

export function LegalPage({
  title,
  description,
  lastUpdated,
    children,
}: LegalPageProps) {
  return (
    <main
      style={{
        minHeight: "100dvh",
        background: `linear-gradient(180deg, ${palette.page} 0%, ${palette.pageAccent} 100%)`,
        color: palette.text,
        padding: "56px 20px 96px",
      }}
    >
      <div
        style={{
          maxWidth: 920,
          margin: "0 auto",
        }}
      >
        <Link
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            color: palette.muted,
            fontSize: 14,
            fontWeight: 600,
            textDecoration: "none",
            marginBottom: 20,
          }}
        >
          <span aria-hidden="true">←</span>
          トップに戻る
        </Link>

        <article
          style={{
            background: palette.surface,
            border: `1px solid ${palette.border}`,
            borderRadius: 28,
            boxShadow: palette.shadow,
            padding: "clamp(28px, 4vw, 48px)",
          }}
        >
          <header style={{ marginBottom: 40 }}>
            <p
              style={{
                margin: 0,
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: palette.accent,
              }}
            >
              Aneurasync Legal
            </p>
            <h1
              style={{
                margin: "12px 0 10px",
                fontSize: "clamp(2.1rem, 5vw, 3.2rem)",
                lineHeight: 1.05,
                color: palette.heading,
              }}
            >
              {title}
            </h1>
            <p
              style={{
                margin: 0,
                fontSize: 15,
                lineHeight: 1.8,
                color: palette.muted,
              }}
            >
              {description}
            </p>
            {lastUpdated ? (
              <p
                style={{
                  margin: "18px 0 0",
                  fontSize: 13,
                  color: palette.muted,
                }}
              >
                最終更新日: {lastUpdated}
              </p>
            ) : null}
          </header>

          {children}
        </article>
      </div>
    </main>
  );
}

type LegalSectionProps = {
  title: string;
  first?: boolean;
  accent?: boolean;
  children: ReactNode;
};

export function LegalSection({
  title,
  first = false,
  accent = false,
  children,
}: LegalSectionProps) {
  return (
    <section
      style={{
        marginTop: first ? 0 : 36,
        paddingTop: first ? 0 : 32,
        borderTop: first ? "none" : `1px solid ${palette.border}`,
        ...(accent
          ? {
              borderLeft: `4px solid ${palette.accent}`,
              paddingLeft: 18,
            }
          : {}),
      }}
    >
      <h2
        style={{
          margin: "0 0 14px",
          fontSize: 22,
          lineHeight: 1.3,
          color: palette.heading,
        }}
      >
        {title}
      </h2>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          fontSize: 15,
          lineHeight: 1.85,
          color: palette.text,
        }}
      >
        {children}
      </div>
    </section>
  );
}

export function LegalParagraph({ children }: { children: ReactNode }) {
  return (
    <p
      style={{
        margin: 0,
        fontSize: 15,
        lineHeight: 1.85,
        color: palette.text,
      }}
    >
      {children}
    </p>
  );
}

export function LegalOrderedList({ children }: { children: ReactNode }) {
  return (
    <ol
      style={{
        margin: 0,
        listStyleType: "decimal",
        paddingLeft: 24,
        fontSize: 15,
        lineHeight: 1.85,
        color: palette.text,
      }}
    >
      {children}
    </ol>
  );
}

export function LegalUnorderedList({ children }: { children: ReactNode }) {
  return (
    <ul
      style={{
        margin: "4px 0",
        listStyleType: "disc",
        paddingLeft: 24,
        fontSize: 15,
        lineHeight: 1.85,
        color: palette.text,
      }}
    >
      {children}
    </ul>
  );
}

export function LegalListItem({ children }: { children: ReactNode }) {
  return <li style={{ marginBottom: 8 }}>{children}</li>;
}

export function LegalNote({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        padding: "14px 16px",
        borderRadius: 16,
        border: `1px solid ${palette.border}`,
        background: palette.surfaceMuted,
        color: palette.heading,
        fontSize: 14,
        lineHeight: 1.7,
        fontWeight: 600,
      }}
    >
      {children}
    </div>
  );
}

export function LegalTable({
  rows,
}: {
  rows: Array<{ label: string; value: ReactNode }>;
}) {
  return (
    <div
      style={{
        overflow: "hidden",
        borderRadius: 20,
        border: `1px solid ${palette.border}`,
        background: palette.surface,
      }}
    >
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
        }}
      >
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={row.label}
              style={{
                borderBottom:
                  index < rows.length - 1 ? `1px solid ${palette.border}` : "none",
              }}
            >
              <th
                style={{
                  width: "34%",
                  minWidth: 180,
                  padding: "18px 20px",
                  textAlign: "left",
                  verticalAlign: "top",
                  background: palette.surfaceMuted,
                  color: palette.heading,
                  fontSize: 14,
                  fontWeight: 700,
                }}
              >
                {row.label}
              </th>
              <td
                style={{
                  padding: "18px 20px",
                  color: palette.text,
                  fontSize: 14,
                  lineHeight: 1.8,
                }}
              >
                {row.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
