"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";

/**
 * コンテキストブレッドクラム
 *
 * パスから自動的にブレッドクラムを生成。
 * 各ページの日本語名はルートマップから取得。
 */

const ROUTE_NAMES: Record<string, string> = {
  "": "ホーム",
  stargazer: "Stargazer",
  rendezvous: "Rendezvous",
  "genome-card": "Genome Card",
  genome: "Genome",
  "my-page": "マイページ",
  calendar: "カレンダー",
  origin: "Origin",
  sns: "SNS",
  profile: "Presence",
  "my-style": "My Style",
  onboarding: "はじめに",
  battle: "Battle",
  drops: "ドロップ",
  shops: "ショップ",
  ranking: "ランキング",
  luxury: "Luxury",
  settings: "設定",
  notifications: "通知",
  weather: "Inner Weather",
  prophecy: "予言",
  alter: "Alter",
  predictions: "予測",
  aneurasync: "Aneurasync",
  phenotype: "Phenotype",
  body: "ボディ",
  color: "カラー",
  diagnosis: "診断",
  edit: "編集",
  new: "新規作成",
  result: "結果",
  compare: "比較",
  talk: "トーク",
  explore: "探索",
  favorites: "お気に入り",
  saved: "保存済み",
  search: "検索",
  feed: "フィード",
  social: "ソーシャル",
  live: "ライブ",
  me: "マイページ",
  my: "マイページ",
  orders: "注文",
  messages: "メッセージ",
  "body-color": "ボディカラー",
  "style-drive": "Style Drive",
  "style-profile": "Style Profile",
  "style-quiz": "Style Quiz",
  "try-on": "試着",
  wardrobe: "ワードローブ",
  "for-you": "あなたへ",
  collab: "コラボ",
  coordinate: "コーディネート",
  admin: "管理",
  legal: "法的情報",
  terms: "利用規約",
  privacy: "プライバシー",
  commercial: "特定商取引法",
};

interface BreadcrumbProps {
  /** Override automatic breadcrumb with custom items */
  items?: { label: string; href?: string }[];
  /** Hide on home page */
  hideOnHome?: boolean;
  /** Light theme (for dark backgrounds) */
  light?: boolean;
}

export function Breadcrumb({
  items,
  hideOnHome = true,
  light = false,
}: BreadcrumbProps) {
  const pathname = usePathname();

  // Don't show on home
  if (hideOnHome && pathname === "/") return null;

  // Rendezvous has its own navigation — breadcrumb is noise there
  if (pathname.startsWith("/rendezvous")) return null;

  const crumbs = items ?? generateBreadcrumbs(pathname);
  if (crumbs.length <= 1) return null;

  return (
    <motion.nav
      aria-label="パンくずリスト"
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="flex items-center gap-1.5 text-xs font-medium px-4 py-2 overflow-x-auto"
    >
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <span key={i} className="flex items-center gap-1.5 whitespace-nowrap">
            {i > 0 && (
              <span className={light ? "text-white/30" : "text-slate-300"}>
                ›
              </span>
            )}
            {crumb.href && !isLast ? (
              <Link
                href={crumb.href}
                className={
                  light
                    ? "text-white/60 hover:text-white/90 transition-colors"
                    : "text-slate-500 hover:text-slate-800 transition-colors"
                }
              >
                {crumb.label}
              </Link>
            ) : (
              <span
                className={
                  isLast
                    ? light
                      ? "text-white/90"
                      : "text-slate-800"
                    : light
                      ? "text-white/60"
                      : "text-slate-500"
                }
              >
                {crumb.label}
              </span>
            )}
          </span>
        );
      })}
    </motion.nav>
  );
}

function generateBreadcrumbs(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  // Remove route group prefixes like (culcept), (immersive), (legal)
  const cleaned = segments.filter((s) => !s.startsWith("("));

  const crumbs: { label: string; href: string }[] = [
    { label: "ホーム", href: "/" },
  ];
  let path = "";

  for (const segment of cleaned) {
    path += `/${segment}`;
    // Skip dynamic segments (UUIDs, numeric IDs)
    if (segment.match(/^[0-9a-f-]{8,}$/i) || segment.match(/^\d+$/)) {
      crumbs.push({ label: "詳細", href: path });
    } else {
      crumbs.push({
        label: ROUTE_NAMES[segment] ?? segment,
        href: path,
      });
    }
  }

  return crumbs;
}
