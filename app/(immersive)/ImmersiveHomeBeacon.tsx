"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** ホームビーコン — オンボーディング中は非表示 */
export default function ImmersiveHomeBeacon() {
  const pathname = usePathname();

  // オンボーディング中は非表示
  if (pathname === "/onboarding") return null;

  return (
    <Link
      href="/"
      aria-label="ホームに戻る"
      className="fixed top-2 left-2 z-50 flex h-auto items-center gap-1.5 rounded-full px-2.5 py-1.5 backdrop-blur-xl shadow-lg transition-all hover:scale-105"
      style={{
        background: "rgba(128,128,128,0.18)",
        border: "1px solid rgba(128,128,128,0.3)",
        color: "rgba(200,200,200,0.9)",
      }}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10 2L4 8l6 6" />
      </svg>
      <span className="text-xs font-medium">ホーム</span>
    </Link>
  );
}
