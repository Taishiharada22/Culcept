"use client";

import Link from "next/link";
import { motion } from "framer-motion";

interface DailyRitualItem {
  key: string;
  icon: string;
  label: string;
  sublabel: string;
  description: string;
  href: string;
  streak: number;
  completed: boolean;
  accentColor: string;
}

interface Props {
  items?: DailyRitualItem[];
  innerWeather?: { emoji?: string; label?: string; message?: string } | null;
  sgObservationCount?: number;
}

const defaultItems: DailyRitualItem[] = [
  {
    key: "daily-obs",
    icon: "✦",
    label: "観測",
    sublabel: "今日の問い",
    description: "今日の問いに答える",
    href: "/stargazer?tab=observe",
    streak: 0,
    completed: false,
    accentColor: "#6366F1",
  },
  {
    key: "origin-log",
    icon: "🌍",
    label: "Origin",
    sublabel: "今日の記録",
    description: "今日の記録",
    href: "/origin",
    streak: 0,
    completed: false,
    accentColor: "#EAB308",
  },
  {
    key: "coord-calendar",
    icon: "📅",
    label: "Coord",
    sublabel: "コーデ記録",
    description: "今日のコーデ",
    href: "/calendar",
    streak: 0,
    completed: false,
    accentColor: "#14B8A6",
  },
];

export default function DailyRitualZone({ items, innerWeather, sgObservationCount }: Props) {
  const rituals = items ?? defaultItems;

  return (
    <section className="px-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold" style={{ color: "#1a1a2e" }}>
          今日の観測
        </h2>
        {innerWeather?.emoji && (
          <span className="text-xs" style={{ color: "#8888a0" }}>
            内面天気: {innerWeather.emoji} {innerWeather.label}
          </span>
        )}
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
        {rituals.map((item, i) => (
          <motion.div
            key={item.key}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06, duration: 0.22 }}
          >
            <Link
              href={item.href}
              className="block"
              style={{
                minWidth: 140,
                borderRadius: 16,
                background: item.completed
                  ? `linear-gradient(145deg, ${item.accentColor}18 0%, #ffffff 60%)`
                  : `linear-gradient(145deg, #ffffff 0%, ${item.accentColor}08 100%)`,
                border: `1.5px solid ${item.accentColor}${item.completed ? "40" : "20"}`,
                boxShadow: item.completed
                  ? "none"
                  : `0 2px 8px ${item.accentColor}15, 0 0 0 0 ${item.accentColor}00`,
                padding: "14px 12px",
                textDecoration: "none",
                transition: "transform 0.2s, box-shadow 0.2s",
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">{item.icon}</span>
                <div>
                  <p className="text-xs font-bold" style={{ color: "#1a1a2e" }}>{item.label}</p>
                  <p className="text-[10px]" style={{ color: "#8888a0" }}>{item.sublabel}</p>
                </div>
              </div>

              <p className="text-xs mb-2" style={{ color: "#4a4a68" }}>
                {item.description}
              </p>

              <div className="flex items-center justify-between">
                {item.completed ? (
                  <span className="text-[10px] font-medium" style={{ color: item.accentColor }}>
                    ✓ 完了
                  </span>
                ) : (
                  <span
                    className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                    style={{
                      background: `${item.accentColor}15`,
                      color: item.accentColor,
                    }}
                  >
                    答える
                  </span>
                )}
                {item.streak > 0 && (
                  <span className="text-[10px]" style={{ color: "#F59E0B" }}>
                    🔥 {item.streak}日
                  </span>
                )}
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
