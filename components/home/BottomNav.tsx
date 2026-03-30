"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MAIN_NAV, isNavActive } from "@/lib/navigation";
import { useCeoCheck } from "@/hooks/useCeoCheck";

export default function BottomNav() {
  const pathname = usePathname();
  const isCeo = useCeoCheck();

  const items = isCeo
    ? [...MAIN_NAV, { href: "/ceo", label: "CEO", icon: "⚙" }]
    : MAIN_NAV;

  return (
    <nav
      aria-label="メインナビゲーション"
      className="fixed bottom-0 left-0 right-0 z-80 flex h-[60px] items-center border-t border-black/[0.06] bg-white/80 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]"
    >
      {items.map((item) => {
        const active = isNavActive(item.href, pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
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
    </nav>
  );
}
