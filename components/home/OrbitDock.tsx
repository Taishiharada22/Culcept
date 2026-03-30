"use client";

import Link from "next/link";
import { motion } from "framer-motion";

export type OrbitItem = {
  key: string;
  icon: string;
  label: string;
  color: string;
  /** 0–100 */
  progress: number;
  href: string;
  /** 状態テキスト（例: "今日の1問あり"） */
  status?: string;
  /** 主役（毎日使う）か準主役（初期設定寄り）か */
  tier: "primary" | "secondary";
  /** 今日使用済み */
  usedToday?: boolean;
  /** パルスレベル */
  pulse?: "strong" | "medium" | "soft" | "none";
};

type Props = {
  items: OrbitItem[];
};

export default function OrbitDock({ items }: Props) {
  const primaries = items.filter((i) => i.tier === "primary");
  const secondaries = items.filter((i) => i.tier === "secondary");

  return (
    <section className="px-4 pt-2 pb-2">
      {/* ─── Primary row: 毎日の導線 ─── */}
      <div className="flex gap-2 mb-3">
        {primaries.map((item, i) => (
          <PrimaryNode key={item.key} item={item} delay={i * 0.06} />
        ))}
      </div>

      {/* ─── Secondary row: 基盤設定（視覚的に従属） ─── */}
      <div className="flex items-center gap-1.5 mb-1 px-1">
        <span
          className="text-[8px] tracking-widest uppercase"
          style={{ color: "#8B5CF6", opacity: 0.45 }}
        >
          設定
        </span>
        <div className="flex-1 h-px bg-black/[0.05]" />
      </div>

      <div className="flex gap-1.5 px-1">
        {secondaries.map((item, i) => (
          <FoundationNode key={item.key} item={item} delay={i * 0.05 + 0.2} />
        ))}
      </div>
    </section>
  );
}

/* ═══ Primary Node — 毎日の導線（コンパクト） ═══ */
function PrimaryNode({ item, delay }: { item: OrbitItem; delay: number }) {
  const hasPulse = item.pulse === "strong" || item.pulse === "medium";
  const active = !item.usedToday;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3 }}
      className="flex-1 min-w-0"
    >
      <Link
        href={item.href}
        className="flex items-center gap-2.5 rounded-xl transition-all duration-200 relative overflow-hidden active:scale-[0.97]"
        style={{
          padding: "12px 14px",
          background: active
            ? `linear-gradient(150deg, ${item.color}12, rgba(255,255,255,0.92))`
            : "rgba(255,255,255,0.6)",
          border: `1.5px solid ${item.color}${active ? "30" : "14"}`,
          boxShadow: hasPulse && active
            ? `0 3px 14px ${item.color}18`
            : "0 1px 5px rgba(0,0,0,0.04)",
        }}
      >
        {/* Pulse dot */}
        {hasPulse && active && (
          <span
            className="absolute rounded-full"
            style={{
              top: 7,
              right: 7,
              width: 6,
              height: 6,
              background: item.color,
              boxShadow: `0 0 8px ${item.color}70`,
              animation: "orbit-pulse 2s ease-in-out infinite",
            }}
          />
        )}

        {/* Used-today check */}
        {item.usedToday && (
          <span
            className="absolute flex items-center justify-center"
            style={{
              top: 6,
              right: 7,
              fontSize: 9,
              color: item.color,
              fontWeight: 700,
            }}
          >
            ✓
          </span>
        )}

        {/* Icon */}
        <span className="text-xl leading-none flex-shrink-0">{item.icon}</span>

        {/* Label + Status */}
        <div className="flex-1 min-w-0">
          <span className="text-[12px] font-bold text-text1 block truncate">
            {item.label}
          </span>
          {item.status && (
            <p
              className="text-[10px] truncate"
              style={{ color: active ? "#4a4a68" : "#8888a0" }}
            >
              {item.status}
            </p>
          )}
        </div>
      </Link>
    </motion.div>
  );
}

/* ═══ Foundation Node — 基盤設定（控えめ・従属的） ═══ */
function FoundationNode({ item, delay }: { item: OrbitItem; delay: number }) {
  const isSetup = (item.progress ?? 0) === 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 3 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.2 }}
      className="flex-1 min-w-0"
    >
      <Link
        href={item.href}
        className="flex items-center gap-2 rounded-lg transition-all duration-200 active:scale-[0.97]"
        style={{
          padding: "7px 10px",
          background: "rgba(255,255,255,0.55)",
          border: "1px solid rgba(0,0,0,0.06)",
          boxShadow: "none",
        }}
      >
        {/* Icon — very muted */}
        <div
          className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
          style={{ background: `${item.color}06` }}
        >
          <span className="text-xs leading-none" style={{ opacity: 0.6 }}>{item.icon}</span>
        </div>

        {/* Label only — minimal */}
        <span
          className="text-[10px] truncate block"
          style={{ color: "#666", fontWeight: 500 }}
        >
          {item.status ?? item.label}
        </span>

        {/* Right: subtle progress or arrow */}
        {item.progress > 0 ? (
          <span
            className="text-[7px] font-mono flex-shrink-0 ml-auto"
            style={{ color: item.color, opacity: 0.45 }}
          >
            {item.progress}%
          </span>
        ) : isSetup ? (
          <span
            className="text-[7px] flex-shrink-0 ml-auto"
            style={{ color: "#aaa", opacity: 0.45 }}
          >
            →
          </span>
        ) : null}
      </Link>
    </motion.div>
  );
}
