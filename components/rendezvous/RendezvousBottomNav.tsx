"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { RV_COLORS } from "@/components/ui/rendezvous-design";

/**
 * Rendezvous ライトウォーム・ボトムナビゲーション
 * 白いピル型ナビゲーション
 */
export default function RendezvousBottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [totalUnread, setTotalUnread] = useState(0);

  useEffect(() => {
    let isMounted = true;

    async function fetchUnread() {
      try {
        const res = await fetch("/api/rendezvous/conversations");
        if (!res.ok) return;
        const data = await res.json();
        if (!isMounted) return;
        const conversations = data.conversations ?? [];
        const total = conversations.reduce(
          (sum: number, c: any) => sum + (c.unreadCount ?? 0),
          0,
        );
        setTotalUnread(total);
      } catch {
        // ignore
      }
    }

    fetchUnread();
    const interval = setInterval(fetchUnread, 30_000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const navItems = [
    { href: "/rendezvous", label: "ホーム", icon: "🌌" },
    { href: "/rendezvous/explore", label: "出会う", icon: "✨" },
    { href: "/rendezvous/stories", label: "チャット", icon: "💬", badge: totalUnread },
    { href: "/rendezvous/universe", label: "宇宙", icon: "🪐" },
    { href: "/rendezvous/settings", label: "設定", icon: "⚙️" },
  ];

  return (
    <footer className="fixed bottom-0 left-0 right-0 z-50 pointer-events-none">
      <div className="flex justify-center pb-6 px-4">
        <motion.nav
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3, type: "spring", stiffness: 100 }}
          className="pointer-events-auto flex items-center gap-1 rounded-full px-3 py-2"
          style={{
            backgroundColor: "rgba(255,255,255,0.92)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: `1px solid ${RV_COLORS.border}`,
            boxShadow: `0 8px 32px ${RV_COLORS.shadowDeep}`,
          }}
        >
          {navItems.map((item) => {
            const isActive = pathname === item.href ||
              (item.href !== "/rendezvous" && pathname.startsWith(item.href));
            const isHome = item.href === "/rendezvous" && pathname === "/rendezvous";

            return (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                className="relative flex flex-col items-center gap-0.5 px-3.5 py-1.5 rounded-full transition-all"
                style={{
                  backgroundColor: (isActive || isHome) ? RV_COLORS.surfaceMuted : "transparent",
                }}
              >
                <span
                  className="text-lg leading-none transition-all"
                  style={{
                    filter: (isActive || isHome) ? "none" : "grayscale(0.8) opacity(0.4)",
                    transform: (isActive || isHome) ? "scale(1.1)" : "scale(1)",
                  }}
                >
                  {item.icon}
                </span>
                <span
                  className="text-[9px] font-medium"
                  style={{
                    color: (isActive || isHome) ? RV_COLORS.text : RV_COLORS.textMuted,
                  }}
                >
                  {item.label}
                </span>

                {/* Unread badge */}
                {item.badge && item.badge > 0 ? (
                  <motion.div
                    className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] rounded-full flex items-center justify-center"
                    style={{
                      background: RV_COLORS.gradient,
                      boxShadow: `0 2px 8px ${RV_COLORS.primaryGlow}`,
                    }}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 500 }}
                  >
                    <span className="text-[8px] font-bold text-white leading-none px-1">
                      {item.badge > 99 ? "99+" : item.badge}
                    </span>
                  </motion.div>
                ) : null}
              </button>
            );
          })}
        </motion.nav>
      </div>
    </footer>
  );
}
