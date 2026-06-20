// app/(culcept)/calendar/_components/travel/concierge/primitives.tsx
// Concierge Dashboard 共有プリミティブ＋デザイントークン（warm cream / muted gold / serif）。
"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import type { ReservationCategory, ReservationStatus } from "../../../_lib/travel/types";
import {
  ChevronLeft,
  BedIcon,
  ForkKnife,
  TrainFront,
  Sparkle,
  Sun,
  Cloud,
  Grid,
  CalendarIcon,
  Ticket,
  LocationNotes,
  Check,
} from "./icons";

/** Concierge 配色トークン（既存 design-tokens に warm 系が無いため本機能内で定義）。 */
export const T = {
  bg: "#f5efe6",
  bgWarm: "#efe7d8",
  card: "#fdfbf7",
  cardAlt: "#faf6ee",
  cardSunk: "#f3ecdd",
  border: "#e7ddca",
  borderSoft: "#efe7d6",
  gold: "#a98a55",
  goldDeep: "#8a7038",
  goldSoft: "#c9b485",
  goldBg: "#efe6d2",
  ink: "#3a352b",
  ink2: "#6a6051",
  ink3: "#9a8f78",
  line: "#dccfb6",
  green: "#5f8557",
  greenBg: "#e9f0e3",
  amber: "#b08a3e",
} as const;

export const GOLD_GRADIENT = `linear-gradient(135deg, ${T.gold} 0%, ${T.goldDeep} 100%)`;

/** 3段エレベーション（warm tone・世界観統一）。e1=補助 / e2=主役 hero / e3=モーダル。 */
export const ELEV = {
  e1: "0 2px 14px rgba(120,100,60,0.06)",
  e2: "0 8px 26px rgba(120,100,60,0.12), inset 0 1px 0 rgba(255,255,255,0.55)",
  e3: "0 18px 44px rgba(60,45,20,0.26)",
} as const;

/** gold tone の focus-visible リング（全 interactive 共通・キーボード操作配慮）。 */
export const FOCUS_RING = "outline-none focus-visible:ring-2 focus-visible:ring-[#c9b485] focus-visible:ring-offset-1 focus-visible:ring-offset-[#f5efe6]";

/** カード。warm ivory・細い warm border・soft shadow。interactive で hover/press の手応えを付与。 */
export function ConciergeCard({
  children,
  className = "",
  style,
  onClick,
  elevated = false,
  ariaLabel,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
  /** @deprecated affordance は onClick の有無で決まる。型互換のため残置。 */
  interactive?: boolean;
  elevated?: boolean;
  ariaLabel?: string;
}) {
  // クリック表現(cursor/hover/focus)と a11y(role/tab/key)は「実際に操作可能か(onClick 有無)」に一致させる。
  // interactive 単独（onClick 無し）でクリック風だけ付く落とし穴を排除。
  const operable = !!onClick;
  return (
    <div
      onClick={onClick}
      role={operable ? "button" : undefined}
      tabIndex={operable ? 0 : undefined}
      aria-label={ariaLabel}
      onKeyDown={
        operable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick!();
              }
            }
          : undefined
      }
      className={`rounded-[20px] border transition duration-150 ${
        operable ? `cursor-pointer hover:-translate-y-[1px] active:scale-[0.99] ${FOCUS_RING}` : ""
      } ${className}`}
      style={{
        background: T.card,
        borderColor: T.border,
        boxShadow: elevated ? ELEV.e2 : ELEV.e1,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** セクションラベル（small-caps 英字＋和文）。 */
export function SectionLabel({ en, ja, className = "" }: { en?: string; ja?: string; className?: string }) {
  return (
    <div className={className}>
      {en && (
        <div className="text-[11px] font-semibold uppercase" style={{ color: T.ink3, letterSpacing: "0.18em" }}>
          {en}
        </div>
      )}
      {ja && (
        <div className="text-[12px] mt-0.5" style={{ color: T.ink2 }}>
          {ja}
        </div>
      )}
    </div>
  );
}

/** カテゴリ chip（到着 / 観光 など）。 */
export function CategoryChip({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center rounded-[7px] border px-2 py-[3px] text-[11px] font-medium"
      style={{ borderColor: T.border, background: T.cardAlt, color: T.ink2 }}
    >
      {children}
    </span>
  );
}

/** 確定済み等のステータスバッジ。 */
export function StatusBadge({ status }: { status: ReservationStatus }) {
  const confirmed = status === "確定済み";
  const color = confirmed ? T.green : T.amber;
  const bg = confirmed ? T.greenBg : "#f3ecda";
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold"
      style={{ color, background: bg }}
    >
      {confirmed && <Check size={12} strokeWidth={2.4} />}
      {status}
    </span>
  );
}

/** gold 塗りの主 CTA。 */
export function GoldButton({
  children,
  onClick,
  full,
  size = "md",
  icon,
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  full?: boolean;
  size?: "sm" | "md";
  icon?: React.ReactNode;
  className?: string;
}) {
  const pad = size === "sm" ? "px-3 py-2 text-[12px]" : "px-4 py-2.5 text-[13px]";
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-1.5 rounded-xl font-medium transition active:scale-[0.98] ${pad} ${full ? "w-full" : ""} ${className}`}
      style={{ background: GOLD_GRADIENT, color: "#fdf8ee", boxShadow: "0 3px 12px rgba(138,112,56,0.25)" }}
    >
      {icon}
      {children}
    </button>
  );
}

/** outline の副 CTA。 */
export function OutlineButton({
  children,
  onClick,
  full,
  size = "md",
  icon,
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  full?: boolean;
  size?: "sm" | "md";
  icon?: React.ReactNode;
  className?: string;
}) {
  const pad = size === "sm" ? "px-3 py-2 text-[12px]" : "px-4 py-2.5 text-[13px]";
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-1.5 rounded-xl border font-medium transition active:scale-[0.98] ${pad} ${full ? "w-full" : ""} ${className}`}
      style={{ borderColor: T.border, background: T.card, color: T.ink2 }}
    >
      {icon}
      {children}
    </button>
  );
}

/** 滞在目安（円形 outline バッジ）。 */
export function DurationBadge({ minutes }: { minutes: number }) {
  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      <span className="text-[9px] tracking-wide" style={{ color: T.ink3 }}>
        滞在目安
      </span>
      <span
        className="flex h-12 w-12 items-center justify-center rounded-full border text-[13px] font-semibold"
        style={{ borderColor: T.goldSoft, color: T.goldDeep, background: T.cardAlt }}
      >
        {minutes}分
      </span>
    </div>
  );
}

/** gold プログレスバー。markers=区切り目盛り（0〜1）。 */
export function ProgressBar({
  pct,
  className = "",
  height = 8,
  markers,
}: {
  pct: number;
  className?: string;
  height?: number;
  markers?: number[];
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div
      className={`relative w-full overflow-hidden rounded-full ${className}`}
      style={{ height, background: T.cardSunk }}
    >
      <div
        className="h-full rounded-full"
        style={{ width: `${clamped}%`, background: GOLD_GRADIENT }}
      />
      {markers?.map((m) => (
        <span
          key={m}
          className="absolute top-0 h-full w-px"
          style={{ left: `${m * 100}%`, background: "rgba(255,255,255,0.7)" }}
        />
      ))}
    </div>
  );
}

/** 画面ヘッダー（戻る＋serif タイトル＋右アクション）。 */
export function ConciergeHeader({
  title,
  subLabel,
  latinTitle,
  sansTitle,
  subCaps,
  onBack,
  right,
}: {
  title: string;
  subLabel?: string;
  latinTitle?: boolean;
  sansTitle?: boolean;
  subCaps?: boolean;
  onBack?: () => void;
  right?: React.ReactNode;
}) {
  return (
    <div
      className="sticky top-0 z-20 flex items-center px-2 py-3"
      style={{ background: `${T.bg}f0`, backdropFilter: "blur(8px)", borderBottom: `1px solid ${T.borderSoft}` }}
    >
      <button
        onClick={onBack}
        aria-label="戻る"
        className="flex h-9 w-9 items-center justify-center rounded-full"
        style={{ color: T.ink2 }}
      >
        <ChevronLeft size={22} />
      </button>
      <div className="flex-1 text-center leading-tight">
        <div
          className={sansTitle ? "font-sans text-[16px]" : latinTitle ? "font-serif-latin text-[22px]" : "font-serif text-[18px]"}
          style={{ color: T.ink, fontWeight: 600 }}
        >
          {title}
        </div>
        {subLabel && (
          <div
            className="text-[10px]"
            style={{ color: T.ink3, letterSpacing: subCaps ? "0.22em" : "0.04em", textTransform: subCaps ? "uppercase" : "none" }}
          >
            {subLabel}
          </div>
        )}
      </div>
      <div className="flex h-9 min-w-9 items-center justify-end gap-1 pr-1" style={{ color: T.ink2 }}>
        {right}
      </div>
    </div>
  );
}

/** 旅サマリーカード（③⑥ 上部・京都2泊3日＋期間＋旅程を確認）。 */
export function TripSummaryCard({
  thumb,
  title,
  meta,
  actionLabel = "旅程を確認",
  onAction,
}: {
  thumb?: React.ReactNode;
  title: string;
  meta: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <ConciergeCard className="flex items-center gap-3 p-3">
      {thumb}
      <div className="min-w-0 flex-1">
        <div className="font-serif text-[16px]" style={{ color: T.ink, fontWeight: 600 }}>
          {title}
        </div>
        <div className="text-[12px]" style={{ color: T.ink2 }}>
          {meta}
        </div>
      </div>
      <button
        onClick={onAction}
        className="shrink-0 rounded-lg border px-3 py-2 text-[12px] font-medium"
        style={{ borderColor: T.border, background: T.cardAlt, color: T.ink2 }}
      >
        {actionLabel}
      </button>
    </ConciergeCard>
  );
}

/** 下部ナビ（5タブ）。 */
const NAV_TABS: { key: string; label: string; Icon: (p: { size?: number; strokeWidth?: number }) => React.ReactElement }[] = [
  { key: "dashboard", label: "ダッシュボード", Icon: Grid },
  { key: "schedule", label: "スケジュール", Icon: CalendarIcon },
  { key: "reservations", label: "予約", Icon: Ticket },
  { key: "locationNotes", label: "Location Notes", Icon: LocationNotes },
];
export function TravelBottomNav({ active, onSelect }: { active: string; onSelect: (key: string) => void }) {
  return (
    <div
      className="flex items-stretch justify-around px-1 pt-2 pb-[max(8px,env(safe-area-inset-bottom))]"
      style={{ background: `${T.card}f5`, backdropFilter: "blur(10px)", borderTop: `1px solid ${T.borderSoft}` }}
    >
      {NAV_TABS.map(({ key, label, Icon }) => {
        const on = active === key;
        return (
          <button
            key={key}
            onClick={() => onSelect(key)}
            className="flex flex-1 flex-col items-center gap-1 py-1"
            style={{ color: on ? T.goldDeep : T.ink3 }}
          >
            <Icon size={20} strokeWidth={on ? 1.9 : 1.5} />
            <span className="text-[9px]" style={{ fontWeight: on ? 700 : 500 }}>
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** 天気グリフ。 */
export function WeatherGlyph({ icon, size = 20, className = "" }: { icon: string; size?: number; className?: string }) {
  if (icon === "cloud" || icon === "rain") return <Cloud size={size} className={className} />;
  return <Sun size={size} className={className} />;
}

/** 予約カテゴリ → 円形アバターアイコン。 */
export function ReservationCategoryIcon({ category, size = 18 }: { category: ReservationCategory; size?: number }) {
  if (category === "宿泊") return <BedIcon size={size} />;
  if (category === "食事") return <ForkKnife size={size} />;
  if (category === "交通") return <TrainFront size={size} />;
  return <Sparkle size={size} />;
}

/** 円形カテゴリアバター（dark gold 背景）。 */
export function CategoryAvatar({ category }: { category: ReservationCategory }) {
  return (
    <div
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
      style={{ background: GOLD_GRADIENT, color: "#fdf8ee" }}
    >
      <ReservationCategoryIcon category={category} size={17} />
    </div>
  );
}

/** 価格レベル（¥¥¥¥ のうち使用分を gold）。 */
export function PriceLevelText({ level }: { level: string }) {
  const used = level.length;
  return (
    <span className="text-[13px] font-semibold tracking-tight">
      <span style={{ color: T.goldDeep }}>{"¥".repeat(used)}</span>
      <span style={{ color: T.ink3 }}>{"¥".repeat(Math.max(0, 4 - used))}</span>
    </span>
  );
}

/**
 * 共通ボトムシート（都道府県ピッカー・詳細シート等で再利用）。
 * overflow コンテナにクリップされない fixed レイヤ。scrim タップ / Escape で閉じる。
 */
export function BottomSheet({
  open,
  onClose,
  children,
  title,
  maxHeightVh = 88,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  maxHeightVh?: number;
}) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation(); // 親（TravelDayDetail）の Escape→overlay 閉じを抑止し、シートのみ閉じる
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  // framer-motion の transform を持つ祖先を escape するため body 直下へ portal（fixed をビューポート基準に）。
  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[70]"
            style={{ background: "rgba(40,32,18,0.42)", backdropFilter: "blur(2px)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            className="fixed inset-x-0 bottom-0 z-[71] mx-auto w-full max-w-[480px] overflow-hidden rounded-t-[24px]"
            style={{ background: T.bg, boxShadow: ELEV.e3 }}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 34, stiffness: 340 }}
          >
            <div className="flex flex-col" style={{ maxHeight: `${maxHeightVh}vh` }}>
              <div className="flex shrink-0 items-center justify-center pt-2.5">
                <span className="h-1 w-9 rounded-full" style={{ background: T.line }} />
              </div>
              {title && (
                <div className="shrink-0 px-5 pb-2 pt-1.5 text-center font-serif text-[15px]" style={{ color: T.ink, fontWeight: 600 }}>
                  {title}
                </div>
              )}
              <div className="overflow-y-auto overscroll-contain px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-1">
                {children}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** shimmer skeleton（main 接続後の非同期取得 placeholder）。reduced-motion は globals.css で無効化。 */
export function SkeletonBlock({ className = "", rounded = "rounded-xl" }: { className?: string; rounded?: string }) {
  return (
    <div
      className={`animate-travel-shimmer ${rounded} ${className}`}
      style={{
        backgroundImage: `linear-gradient(90deg, ${T.cardSunk} 25%, ${T.cardAlt} 50%, ${T.cardSunk} 75%)`,
        backgroundSize: "200% 100%",
      }}
      aria-hidden
    />
  );
}
