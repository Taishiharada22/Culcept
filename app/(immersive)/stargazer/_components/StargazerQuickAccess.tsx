// app/(immersive)/stargazer/_components/StargazerQuickAccess.tsx
// Stargazer用クイックアクセスバー — 共通QuickAccessBar使用
"use client";

import { HOME_MORE_NAV } from "@/lib/navigation";
import { useCeoCheck } from "@/hooks/useCeoCheck";
import QuickAccessBar from "@/components/home/QuickAccessBar";

const STARGAZER_QUICK_NAV = [
  { href: "/calendar", label: "コーデ", icon: "👔" },
  { href: "/", label: "ホーム", icon: "🏠" },
  { href: "/origin", label: "日記", icon: "📓" },
  { href: "/talk", label: "トーク", icon: "💬" },
  { href: "/rendezvous", label: "出会う", icon: "🤝" },
];

export default function StargazerQuickAccess() {
  const isCeo = useCeoCheck();

  const moreItems = isCeo
    ? [...HOME_MORE_NAV, { href: "/ceo", label: "CEO", icon: "⚙" }]
    : HOME_MORE_NAV;

  return (
    <QuickAccessBar
      items={STARGAZER_QUICK_NAV}
      moreItems={moreItems}
      variant="stargazer"
    />
  );
}
