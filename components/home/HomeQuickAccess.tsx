"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { HOME_QUICK_NAV, HOME_MORE_NAV, isNavActive } from "@/lib/navigation";
import { useCeoCheck } from "@/hooks/useCeoCheck";
import { AnimatePresence, motion } from "framer-motion";

export default function HomeQuickAccess() {
  const pathname = usePathname();
  const isCeo = useCeoCheck();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  // 外側タップで閉じる
  useEffect(() => {
    if (!moreOpen) return;
    const handler = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [moreOpen]);

  const moreItems = isCeo
    ? [...HOME_MORE_NAV, { href: "/ceo", label: "CEO", icon: "⚙" }]
    : HOME_MORE_NAV;

  return (
    <nav
      aria-label="クイックアクセス"
      className="border-t border-black/[0.06] bg-white/80 backdrop-blur-xl"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {/* More 展開パネル */}
      <AnimatePresence>
        {moreOpen && (
          <motion.div
            ref={moreRef}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2 }}
            className="absolute bottom-full left-0 right-0 px-4 pb-2"
          >
            <div
              className="rounded-xl p-3 flex gap-2 justify-center"
              style={{
                background: "rgba(255,255,255,0.95)",
                border: "1px solid rgba(0,0,0,0.06)",
                boxShadow: "0 -4px 20px rgba(0,0,0,0.08)",
                backdropFilter: "blur(12px)",
              }}
            >
              {moreItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  className="flex flex-col items-center gap-1 px-4 py-2 rounded-lg transition-all active:scale-95"
                  style={{ background: "rgba(99,102,241,0.04)" }}
                >
                  <span className="text-lg">{item.icon}</span>
                  <span className="text-[10px] font-medium text-text2">{item.label}</span>
                </Link>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* メインナビ行 */}
      <div className="flex items-center h-[56px]">
        {HOME_QUICK_NAV.map((item) => {
          const active = isNavActive(item.href, pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              className={[
                "flex flex-1 flex-col items-center justify-center gap-0.5 transition-transform duration-150 active:scale-95",
                active ? "text-indigo-600" : "text-gray-500",
              ].join(" ")}
            >
              <span className="relative text-lg leading-none">
                {item.icon}
                {active && (
                  <span className="absolute -bottom-1.5 left-1/2 h-[3px] w-[3px] -translate-x-1/2 rounded-full bg-indigo-600" />
                )}
              </span>
              <span className="text-[10px] font-medium leading-none">
                {item.label}
              </span>
            </Link>
          );
        })}

        {/* 「他」ボタン */}
        <button
          onClick={() => setMoreOpen((v) => !v)}
          aria-label="その他"
          aria-expanded={moreOpen}
          className={[
            "flex flex-1 flex-col items-center justify-center gap-0.5 transition-transform duration-150 active:scale-95",
            moreOpen ? "text-indigo-600" : "text-gray-500",
          ].join(" ")}
        >
          <span className="text-lg leading-none">⋯</span>
          <span className="text-[10px] font-medium leading-none">他</span>
        </button>
      </div>
    </nav>
  );
}
