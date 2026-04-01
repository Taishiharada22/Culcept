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

/** メインドック（下部ナビゲーション） — 5項目（旧構成、他ページで参照中） */
export const MAIN_NAV: NavItem[] = [
  { href: "/", label: "ホーム", icon: "🏠" },
  { href: "/stargazer", label: "観測", icon: "✦" },
  { href: "/talk", label: "メッセージ", icon: "💬" },
  { href: "/rendezvous", label: "Rendezvous", icon: "∞" },
  { href: "/my-page", label: "マイページ", icon: "👤" },
];

/** Home専用クイックアクセス — 5項目（Alter主役Home用） */
export const HOME_QUICK_NAV: NavItem[] = [
  { href: "/calendar", label: "コーデ", icon: "👔" },
  { href: "/stargazer", label: "観測", icon: "🧠" },
  { href: "/origin", label: "日記", icon: "📓" },
  { href: "/talk", label: "トーク", icon: "💬" },
  { href: "/rendezvous", label: "出会う", icon: "🤝" },
];

/** 「他」メニューの中身 */
export const HOME_MORE_NAV: NavItem[] = [
  { href: "/body-color/avatar", label: "外見分析", icon: "🎨" },
  { href: "/aneurasync/genome", label: "Genome", icon: "🧬" },
  { href: "/sns/profile", label: "Presence", icon: "🪞" },
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
