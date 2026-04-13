"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import type { QuickStatusResponse } from "@/app/api/rendezvous/quick-status/route";

// =============================================================================
// RendezvousQuickStatus
//
// Home 画面に表示するコンパクトな Rendezvous 通知カード。
// 3カテゴリ（恋愛 / カウンセラー / つながり）のステータスを表示。
// アクティブなものだけ表示し、何もなければ何もレンダリングしない。
// =============================================================================

type CategoryConfig = {
  key: "romance" | "counselor" | "connection";
  icon: string;
  label: string;
  href: string;
  accentColor: string;
};

const CATEGORIES: CategoryConfig[] = [
  {
    key: "romance",
    icon: "\u2764\uFE0F",
    label: "\u604B\u611B",
    href: "/rendezvous/romance",
    accentColor: "#E91E63",
  },
  {
    key: "counselor",
    icon: "\u267E\uFE0F",
    label: "\u30AB\u30A6\u30F3\u30BB\u30E9\u30FC",
    href: "/rendezvous/partner",
    accentColor: "#10B981",
  },
  {
    key: "connection",
    icon: "\uD83E\uDD1D",
    label: "\u3064\u306A\u304C\u308A",
    href: "/rendezvous/connection",
    accentColor: "#14B8A6",
  },
];

export default function RendezvousQuickStatus() {
  const [data, setData] = useState<QuickStatusResponse | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/rendezvous/quick-status", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        if (d?.ok) {
          setData({
            romance: d.romance ?? null,
            counselor: d.counselor ?? null,
            connection: d.connection ?? null,
          });
        }
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 表示すべきカードをフィルタリング
  const visibleCards = CATEGORIES.filter((cat) => {
    if (!data) return false;
    return data[cat.key] !== null;
  });

  // 何も表示するものがない場合はレンダリングしない
  if (!loaded || visibleCards.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="px-5 pb-3"
    >
      {/* セクションラベル */}
      <p
        className="text-[10px] font-medium tracking-wider mb-1.5 pl-1"
        style={{ color: "rgba(18, 24, 48, 0.35)" }}
      >
        Rendezvous
      </p>

      {/* カード群 */}
      <div className="flex flex-col gap-[1px] rounded-xl overflow-hidden">
        <AnimatePresence>
          {visibleCards.map((cat, i) => {
            const status = data![cat.key]!;
            const statusLabel =
              cat.key === "counselor"
                ? (status as { label: string }).label
                : (status as { label: string }).label;

            return (
              <motion.div
                key={cat.key}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{
                  duration: 0.25,
                  delay: i * 0.06,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                <Link
                  href={cat.href}
                  className="flex items-center h-[44px] px-3 transition-all active:scale-[0.99]"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    borderLeft: `2px solid ${cat.accentColor}`,
                    borderTop:
                      i > 0
                        ? "1px solid rgba(18, 24, 48, 0.04)"
                        : "none",
                  }}
                >
                  {/* アイコン + カテゴリ名 */}
                  <span className="text-[13px] mr-1.5 flex-shrink-0">
                    {cat.icon}
                  </span>
                  <span
                    className="text-[13px] font-medium flex-shrink-0"
                    style={{ color: "#121830" }}
                  >
                    {cat.label}
                  </span>

                  {/* ステータスラベル */}
                  <span
                    className="ml-auto text-[12px] mr-1"
                    style={{ color: "rgba(18, 24, 48, 0.5)" }}
                  >
                    {statusLabel}
                  </span>

                  {/* 矢印 */}
                  <span
                    className="text-[12px] flex-shrink-0"
                    style={{ color: "rgba(18, 24, 48, 0.25)" }}
                  >
                    {"\u2192"}
                  </span>
                </Link>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
