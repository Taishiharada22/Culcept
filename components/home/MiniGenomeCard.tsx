"use client";

import Link from "next/link";
import Image from "next/image";
import { getCardTheme, getFigureSrc, getArchetypeDef } from "@/lib/genome/archetypeThemes";

/* ─── Mini 5-Axis Radar — ホログラフィック ─── */
const AXIS_LABELS = ["分", "慎", "社", "表", "独"]; // 分析・慎重・社交・表現・独立

function MiniRadar({ axes }: { axes: { analytical: number; cautious: number; social: number; expressive: number; independent: number } }) {
  const cx = 32, cy = 32, r = 24;
  const items = [
    { key: "analytical" as const, angle: -Math.PI / 2 },
    { key: "cautious" as const, angle: -Math.PI / 2 + (2 * Math.PI / 5) },
    { key: "social" as const, angle: -Math.PI / 2 + (4 * Math.PI / 5) },
    { key: "expressive" as const, angle: -Math.PI / 2 + (6 * Math.PI / 5) },
    { key: "independent" as const, angle: -Math.PI / 2 + (8 * Math.PI / 5) },
  ];
  const pts = items.map(({ key, angle }) => {
    const v = (axes[key] / 100) * r;
    return `${cx + v * Math.cos(angle)},${cy + v * Math.sin(angle)}`;
  }).join(" ");

  return (
    <svg viewBox="0 0 64 64" width={72} height={72} style={{ flexShrink: 0 }} role="img"
      aria-label={`分析力 ${axes.analytical}%, 慎重さ ${axes.cautious}%, 社交性 ${axes.social}%, 表現力 ${axes.expressive}%, 独立性 ${axes.independent}%`}>
      <defs>
        <radialGradient id="mini-glow">
          <stop offset="0%" stopColor="rgba(139,92,246,0.2)" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
      </defs>
      <circle cx={cx} cy={cy} r={r + 2} fill="url(#mini-glow)" />
      {/* Grid rings: 3 levels */}
      {[0.33, 0.66, 1.0].map((lv) => (
        <polygon key={lv}
          points={items.map(({ angle }) => `${cx + r * lv * Math.cos(angle)},${cy + r * lv * Math.sin(angle)}`).join(" ")}
          fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="0.5" />
      ))}
      {/* Axis labels */}
      {items.map(({ angle }, idx) => (
        <text key={`label-${idx}`}
          x={cx + (r + 7) * Math.cos(angle)}
          y={cy + (r + 7) * Math.sin(angle)}
          fontSize="5" fill="rgba(255,255,255,0.4)"
          textAnchor="middle" dominantBaseline="central"
        >
          {AXIS_LABELS[idx]}
        </text>
      ))}
      {/* Data polygon */}
      <polygon points={pts} fill="rgba(139,92,246,0.22)" stroke="rgba(139,92,246,0.75)" strokeWidth="1.0">
        <animate attributeName="opacity" values="0.7;1;0.7" dur="4s" repeatCount="indefinite" />
      </polygon>
      {/* Vertex dots */}
      {items.map(({ key, angle }, idx) => {
        const v = (axes[key] / 100) * r;
        return (
          <circle key={key}
            cx={cx + v * Math.cos(angle)} cy={cy + v * Math.sin(angle)}
            r="2" fill="rgba(139,92,246,0.8)">
            <animate attributeName="r" values="1.5;2.5;1.5" dur={`${3 + idx * 0.5}s`} repeatCount="indefinite" />
          </circle>
        );
      })}
    </svg>
  );
}

type Props = {
  archetypeName?: string | null;
  archetypeEmoji?: string | null;
  archetypeEnglishName?: string | null;
  archetypeCode?: string | null;
  shadowEnglishName?: string | null;
  shadowEmoji?: string | null;
  figureSrc?: string | null;
  coreValue?: string | null;
  dilemma?: string | null;
  currentInterest?: string | null;
  lastObservedAt?: string | null;
  radarAxes?: { analytical: number; cautious: number; social: number; expressive: number; independent: number } | null;
  completeness?: number;
};

export default function MiniGenomeCard({
  archetypeName,
  archetypeEmoji,
  archetypeEnglishName,
  archetypeCode,
  shadowEnglishName,
  shadowEmoji,
  figureSrc,
  coreValue,
  radarAxes,
  completeness,
}: Props) {
  const hasData = !!archetypeName;
  const theme = getCardTheme(archetypeName);
  const def = getArchetypeDef(archetypeName);
  const imgSrc = figureSrc ?? getFigureSrc(def);
  const symbol = theme.symbol;
  const glow = theme.glow;

  return (
    <Link
      href="/genome-card"
      className="genome-card-holo"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "16px 14px 12px",
        borderRadius: 20,
        background: hasData
          ? "linear-gradient(155deg, rgba(18,12,38,0.96) 0%, rgba(35,24,68,0.92) 50%, rgba(15,10,32,0.96) 100%)"
          : "linear-gradient(155deg, rgba(40,36,58,0.5) 0%, rgba(30,28,48,0.4) 100%)",
        border: hasData ? `1px solid ${glow.replace("0.4", "0.2")}` : "1px solid rgba(150,150,170,0.1)",
        boxShadow: hasData
          ? `0 10px 32px rgba(28,12,55,0.4), 0 0 0 1px ${glow.replace("0.4", "0.03")}, inset 0 1px 0 rgba(255,255,255,0.04)`
          : "0 4px 12px rgba(0,0,0,0.08)",
        textDecoration: "none",
        color: "#fff",
        width: "100%",
        flexShrink: 0,
        position: "relative",
        overflow: "hidden",
        animation: hasData ? "genome-card-breathe 8s ease-in-out infinite" : undefined,
      }}
    >
      {/* Ambient glow */}
      {hasData && (
        <div style={{
          position: "absolute", top: -20, left: "50%", transform: "translateX(-50%)",
          width: 100, height: 100, borderRadius: "50%",
          background: `radial-gradient(circle, ${glow.replace("0.4", "0.08")}, transparent 70%)`,
          pointerEvents: "none",
        }} />
      )}

      {/* Character figure */}
      {imgSrc ? (
        <div style={{
          width: 52, height: 52, borderRadius: 14, overflow: "hidden",
          position: "relative",
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.06)",
          boxShadow: `0 4px 16px rgba(0,0,0,0.3), 0 0 8px ${glow.replace("0.4", "0.1")}`,
          marginBottom: 8,
          animation: "genome-float-slow 6s ease-in-out infinite",
        }}>
          <Image src={imgSrc} alt={archetypeName ?? ""} fill sizes="52px" style={{ objectFit: "cover" }} />
          {/* Symbol overlay */}
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 20, opacity: 0.1, color: "white",
            filter: `drop-shadow(0 0 4px ${glow})`,
          }}>
            {symbol}
          </div>
        </div>
      ) : (
        <div style={{
          width: 52, height: 52, borderRadius: 14,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.06)",
          fontSize: 22, marginBottom: 8,
          filter: `drop-shadow(0 0 6px ${glow})`,
          animation: "genome-float-slow 6s ease-in-out infinite",
        }}>
          {symbol}
        </div>
      )}

      {/* English Name + Code */}
      {archetypeEnglishName ? (
        <div style={{ textAlign: "center", marginBottom: 2 }}>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: -0.3, textShadow: `0 0 12px ${glow}` }}>
            {archetypeEnglishName}
          </div>
          {archetypeCode && (
            <div style={{ fontSize: 8, color: "rgba(255,255,255,0.25)", fontFamily: "monospace", marginTop: 1, letterSpacing: "0.1em" }}>
              {archetypeCode}
            </div>
          )}
        </div>
      ) : (
        <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 4, letterSpacing: -0.3, textAlign: "center", color: "rgba(255,255,255,0.4)" }}>
          未観測
        </div>
      )}

      {/* Shadow badge */}
      {shadowEnglishName && (
        <div style={{
          display: "flex", alignItems: "center", gap: 3,
          fontSize: 8, color: "rgba(255,255,255,0.25)", marginBottom: 4,
        }}>
          <span>⇄</span>
          <span>{shadowEmoji}</span>
          <span>{shadowEnglishName}</span>
        </div>
      )}

      {/* Radar chart */}
      {radarAxes ? (
        <div style={{ marginBottom: 6 }}>
          <MiniRadar axes={radarAxes} />
        </div>
      ) : (
        <div style={{ fontSize: 8, color: "rgba(255,255,255,0.2)", textAlign: "center", lineHeight: 1.4, marginBottom: 4, padding: "8px 0" }}>
          観測を重ねると<br />チャートが現れる
        </div>
      )}

      {/* Core value */}
      {coreValue && (
        <div style={{
          fontSize: 8, color: "rgba(255,255,255,0.35)", lineHeight: 1.4, textAlign: "center",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", width: "100%",
        }}>
          {coreValue}
        </div>
      )}

      {/* Completeness bar */}
      {typeof completeness === "number" && (
        <div style={{ width: "100%", marginTop: 8 }}>
          <div style={{ height: 2, borderRadius: 1, background: "rgba(255,255,255,0.04)", overflow: "hidden" }}>
            <div style={{
              height: "100%", width: `${completeness}%`, borderRadius: 1,
              background: `linear-gradient(90deg, ${glow.replace("0.4", "0.5")}, ${glow.replace("0.4", "0.2")})`,
              boxShadow: `0 0 4px ${glow.replace("0.4", "0.2")}`,
              transition: "width 0.8s ease",
            }} />
          </div>
        </div>
      )}
    </Link>
  );
}
