"use client";

import { motion } from "framer-motion";
import Link from "next/link";

type Props = {
  contradiction?: { text: string; href?: string } | null;
  blindSpot?: { message: string; tone?: string } | null;
  temporalDelta?: { deltaNarrative: string } | null;
};

const mono = "'JetBrains Mono','SF Mono',monospace";

function truncate(s: string, max = 60) {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

type RowProps = {
  icon: string;
  text: string;
  link?: { label: string; href: string };
  index: number;
};

function DiscoveryRow({ icon, text, link, index }: RowProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: 0.06 * index, ease: "easeOut" }}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "10px 0",
        ...(index > 0
          ? { borderTop: "1px solid rgba(0,0,0,0.06)" }
          : {}),
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: "#6366F1",
          flexShrink: 0,
          marginTop: 6,
        }}
      />
      <span style={{ fontSize: 15, lineHeight: 1.2, flexShrink: 0 }}>
        {icon}
      </span>
      <span
        style={{
          fontSize: 13,
          color: "#3a3a52",
          lineHeight: 1.5,
          flex: 1,
          minWidth: 0,
        }}
      >
        {truncate(text)}
      </span>
      {link && (
        <Link
          href={link.href}
          style={{
            fontSize: 11,
            fontFamily: mono,
            color: "#6366F1",
            whiteSpace: "nowrap",
            textDecoration: "none",
            flexShrink: 0,
            marginTop: 1,
          }}
        >
          {link.label}
        </Link>
      )}
    </motion.div>
  );
}

export default function DailyDiscoveriesCard({
  contradiction,
  blindSpot,
  temporalDelta,
}: Props) {
  const rows: RowProps[] = [];

  if (contradiction?.text) {
    rows.push({
      icon: "🔀",
      text: contradiction.text,
      link: {
        label: "深掘り →",
        href: contradiction.href ?? "/stargazer",
      },
      index: rows.length,
    });
  }

  if (blindSpot?.message) {
    rows.push({
      icon: "👁",
      text: blindSpot.message,
      link: { label: "深掘り →", href: "/stargazer" },
      index: rows.length,
    });
  }

  if (temporalDelta?.deltaNarrative) {
    rows.push({
      icon: "📊",
      text: temporalDelta.deltaNarrative,
      index: rows.length,
    });
  }

  if (rows.length === 0) return null;

  return (
    <div
      style={{
        borderRadius: 10,
        background: "transparent",
        borderLeft: "2px solid rgba(99,102,241,0.15)",
        padding: "8px 14px 8px",
      }}
    >
      <div
        style={{
          fontFamily: mono,
          fontSize: 9,
          letterSpacing: 2,
          color: "#6366F1",
          textTransform: "uppercase" as const,
          marginBottom: 2,
        }}
      >
        TODAY&apos;S DISCOVERIES
      </div>
      <div
        style={{
          fontSize: 12,
          color: "#4a4a68",
          marginBottom: 8,
        }}
      >
        今日の発見
      </div>

      {rows.map((row) => (
        <DiscoveryRow key={row.icon} {...row} />
      ))}
    </div>
  );
}
