"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * ホームビーコン — immersive ページ左上の「ホーム」ボタン
 *
 * 表示制御はサーバーサイドゲート（page.tsx）に一本化。
 * / への到達可否は DB (stargazer_star_maps) で判定済みなので、
 * クライアント側では「/stargazer ページ上では常に非表示」のみ適用。
 * （/stargazer に到達できるユーザーは全員 stargazer フロー継続中）
 */
export default function ImmersiveHomeBeacon() {
  const pathname = usePathname();

  // /onboarding 中・/stargazer 中は非表示（サーバーゲートと整合）
  if (pathname === "/onboarding") return null;
  if (pathname === "/stargazer") return null;

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
