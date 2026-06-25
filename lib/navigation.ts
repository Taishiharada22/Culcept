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

/** 「他」メニューの中身
 *  2026-06-25（CEO 判断）: Presence(/sns/profile)・外見分析(/body-color/avatar) は **凍結**のため除外。
 *  - Presence は起動しない（useRequireBaseline の star_map 救済欠落で /baseline 弾き）が、修正でなく凍結方針。
 *  - 外見分析 も凍結予定。
 *  - 残すのは Genome(/aneurasync/genome) のみ。/ceo は HomeQuickAccess 側で CEO 判定時に別途付与（不変）。
 *  凍結 route 本体（/sns/profile・/body-color/*）は削除せず残置（nav から外すだけ＝直 URL は引き続き存在）。
 */
export const HOME_MORE_NAV: NavItem[] = [
  { href: "/aneurasync/genome", label: "Genome", icon: "🧬" },
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
