// components/home/HomeQuickAccess.tsx
// Home用クイックアクセスバー — 共通QuickAccessBar使用
"use client";

import { HOME_QUICK_NAV, HOME_MORE_NAV } from "@/lib/navigation";
import { useCeoCheck } from "@/hooks/useCeoCheck";
import QuickAccessBar from "./QuickAccessBar";

export default function HomeQuickAccess() {
  const isCeo = useCeoCheck();

  const moreItems = isCeo
    ? [...HOME_MORE_NAV, { href: "/ceo", label: "CEO", icon: "⚙" }]
    : HOME_MORE_NAV;

  return (
    <QuickAccessBar
      items={HOME_QUICK_NAV}
      moreItems={moreItems}
      variant="default"
    />
  );
}
