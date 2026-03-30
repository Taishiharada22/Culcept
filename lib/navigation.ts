/**
 * Aneurasync Navigation Config — Single Source of Truth
 *
 * 全ページで同じナビゲーション項目を使用する。
 * ページごとのローカル定義は禁止。
 */

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  badge?: number;
}

/** メインドック（下部ナビゲーション） — 5項目 */
export const MAIN_NAV: NavItem[] = [
  { href: "/", label: "ホーム", icon: "🏠" },
  { href: "/stargazer", label: "観測", icon: "✦" },
  { href: "/genome-card", label: "Genome", icon: "🧬" },
  { href: "/rendezvous", label: "Rendezvous", icon: "∞" },
  { href: "/my-page", label: "マイページ", icon: "👤" },
];

/** 探索ナビ（サブセクション） */
export const EXPLORE_NAV: NavItem[] = [
  { href: "/origin", label: "Origin", icon: "✦" },
  { href: "/calendar", label: "カレンダー", icon: "📅" },
  { href: "/sns/profile", label: "Presence", icon: "🪞" },
  { href: "/my-style", label: "Style", icon: "◆" },
];

/** ナビ項目のアクティブ判定 */
export function isNavActive(href: string, currentPath: string): boolean {
  if (href === "/") return currentPath === "/";
  return currentPath.startsWith(href);
}
