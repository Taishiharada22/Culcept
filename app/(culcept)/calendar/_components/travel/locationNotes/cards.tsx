// app/(culcept)/calendar/_components/travel/locationNotes/cards.tsx
// Location Notes 共有カード部品（hero / trip row / spot grid / source section / theme tile / chips）。
// Concept 12〜18 のカード意匠を集約。配色は concierge primitives の T トークンを使用。
"use client";

import * as React from "react";
import type { LocationItem, LocationSource, PreferenceChip, TravelTheme } from "../../../_lib/travel/types";
import { T, FOCUS_RING, ELEV } from "../concierge/primitives";
import { PhotoSlot } from "../PhotoSlot";
import { Star, Heart, ChevronRight, Plus, MapPin, Check, Clock } from "../concierge/icons";

/** カード全面をタップ可能にする共通 props（キーボード対応）。 */
function tapProps(onOpen?: () => void) {
  if (!onOpen) return {};
  return {
    onClick: onOpen,
    role: "button" as const,
    tabIndex: 0,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onOpen();
      }
    },
  };
}

// ---- source 配色（地元民=gold / 旅行者=slate）-------------------------------
const SOURCE_STYLE: Record<LocationSource, { label: string; fg: string; bg: string }> = {
  local: { label: "地元民", fg: T.goldDeep, bg: "#efe6d2" },
  traveler: { label: "旅行者", fg: "#5a6b86", bg: "#e6ebf2" },
};

/** 評価（gold star ＋数値＋件数）。rating<=0 はユーザー追加直後 → 「新規」。 */
export function Rating({ rating, count, size = 12 }: { rating: number; count?: number; size?: number }) {
  if (rating <= 0) {
    return <span className="inline-flex items-center gap-1 text-[10px] font-medium" style={{ color: T.ink3 }}><Star size={size} style={{ color: T.ink3 }} />新規</span>;
  }
  return (
    <span className="inline-flex items-center gap-1" style={{ color: T.ink2 }}>
      <Star size={size} filled style={{ color: T.gold }} />
      <span className="text-[12px] font-semibold" style={{ color: T.ink }}>{rating.toFixed(1)}</span>
      {count != null && count > 0 && <span className="text-[10px]" style={{ color: T.ink3 }}>({count.toLocaleString()})</span>}
    </span>
  );
}

/** 保存ハート（トグル）。 */
export function HeartButton({ active, onClick, size = 16 }: { active: boolean; onClick: () => void; size?: number }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      aria-label={active ? "保存済み" : "保存"}
      className="flex items-center justify-center rounded-full p-1.5 transition active:scale-90"
      style={{ background: "rgba(255,255,255,0.82)", color: active ? "#c2476b" : T.ink2 }}
    >
      <Heart size={size} filled={active} />
    </button>
  );
}

/** 地元民/旅行者 バッジ。 */
export function SourceBadge({ source }: { source: LocationSource }) {
  const s = SOURCE_STYLE[source];
  return (
    <span className="inline-flex items-center rounded-full px-2 py-[2px] text-[10px] font-semibold" style={{ color: s.fg, background: s.bg }}>
      {s.label}
    </span>
  );
}

/** 投稿者 by 行（色付き丸＋名前＋肩書）。 */
export function AuthorLine({ item, className = "" }: { item: LocationItem; className?: string }) {
  const s = SOURCE_STYLE[item.source];
  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 ${className}`} style={{ color: T.ink3 }}>
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold" style={{ color: s.fg, background: s.bg }}>
        {item.author.name.replace(/^(Kyoto Local|Traveler)\s*/i, "").charAt(0) || "・"}
      </span>
      <span className="truncate text-[10px]">by {item.author.name}</span>
    </span>
  );
}

/** 王道/穴場 chip（hero overlay 等）。 */
export function ClassChip({ label, tone = "gold" }: { label: string; tone?: "gold" | "ink" | "plain" }) {
  const styles =
    tone === "gold"
      ? { color: "#fdf8ee", background: "rgba(138,112,56,0.92)" }
      : tone === "ink"
      ? { color: "#f3efe6", background: "rgba(58,53,43,0.78)" }
      : { color: T.ink2, background: "rgba(255,255,255,0.85)" };
  return (
    <span className="inline-flex items-center rounded-full px-2.5 py-[3px] text-[10px] font-semibold" style={styles}>
      {label}
    </span>
  );
}

/** メタ chip（1泊2日・4スポット 等）。 */
export function MetaChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md border px-1.5 py-[2px] text-[10px]" style={{ borderColor: T.border, background: T.cardAlt, color: T.ink2 }}>
      {children}
    </span>
  );
}

/** セクション見出し（和文＋すべて見る）。 */
export function SectionHeading({ ja, icon, onMore, moreLabel = "すべて見る" }: { ja: string; icon?: React.ReactNode; onMore?: () => void; moreLabel?: string }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <div className="flex items-center gap-1.5">
        {icon}
        <h3 className="font-serif text-[14px]" style={{ color: T.ink, fontWeight: 600 }}>{ja}</h3>
      </div>
      {onMore && (
        <button onClick={onMore} className="inline-flex items-center gap-0.5 text-[11px]" style={{ color: T.gold }}>
          {moreLabel} <ChevronRight size={12} />
        </button>
      )}
    </div>
  );
}

function tripMeta(item: LocationItem): string[] {
  const out: string[] = [];
  if (item.durationLabel) out.push(item.durationLabel);
  if (item.spotCount) out.push(`${item.spotCount}スポット`);
  return out;
}

// ---------------------------------------------------------------------------
// Hero（旅行=stack / スポット・穴場=split / 王道=overlay の variant 切替）
// ---------------------------------------------------------------------------
function heroMeta(item: LocationItem): string[] {
  if (item.kind === "trip") {
    return [item.durationLabel, item.spotCount ? `${item.spotCount}スポット` : "", item.genre].filter(Boolean) as string[];
  }
  return [item.genre, item.hours ?? ""].filter(Boolean) as string[];
}

function sourceRecLabel(source: LocationSource): string {
  return source === "local" ? "地元民のおすすめ" : "旅行者のおすすめ";
}

export function HeroCard({
  item,
  badges = [],
  reasons,
  prefChips,
  showWhy = false,
  saved,
  added = false,
  onToggleSave,
  onAddToItinerary,
  onOpen,
  primaryLabel = "旅程に追加",
  variant = "stack",
  eyebrow,
}: {
  item: LocationItem;
  badges?: string[];
  reasons?: string[];
  prefChips?: PreferenceChip[];
  showWhy?: boolean;
  saved: boolean;
  added?: boolean;
  onToggleSave: () => void;
  onAddToItinerary: () => void;
  onOpen?: () => void;
  primaryLabel?: string;
  variant?: "stack" | "split" | "overlay";
  eyebrow?: string;
}) {
  const meta = heroMeta(item);
  const cta = (
    <div className="flex gap-2">
      <button
        onClick={onAddToItinerary}
        disabled={added}
        className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] font-semibold transition active:scale-[0.98] ${FOCUS_RING}`}
        style={added ? { background: T.greenBg, color: T.green } : { background: `linear-gradient(135deg, ${T.gold}, ${T.goldDeep})`, color: "#fdf8ee", boxShadow: "0 3px 12px rgba(138,112,56,0.25)" }}
      >
        {added ? <><Check size={15} /> 旅程に追加済み</> : <><Plus size={15} /> {primaryLabel}</>}
      </button>
      <button onClick={onToggleSave} aria-pressed={saved} className={`flex items-center justify-center gap-1.5 rounded-xl border px-5 py-2.5 text-[13px] font-medium transition active:scale-[0.98] ${FOCUS_RING}`} style={{ borderColor: T.border, background: saved ? T.goldBg : T.card, color: saved ? T.goldDeep : T.ink2 }}>
        <Heart size={15} filled={saved} /> {saved ? "保存済み" : "保存"}
      </button>
    </div>
  );

  // ── overlay（王道）：全面写真＋下グラデにテキストをオーバーレイ ──
  if (variant === "overlay") {
    return (
      <div className="overflow-hidden rounded-[20px] border" style={{ borderColor: T.border, background: T.card, boxShadow: ELEV.e2 }}>
        <div {...tapProps(onOpen)} className={`relative h-56 ${onOpen ? `cursor-pointer ${FOCUS_RING}` : ""}`} aria-label={onOpen ? `${item.title} の詳細を見る` : undefined}>
          <PhotoSlot photo={item.photo} rounded="rounded-none" className="h-full w-full" />
          <div className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(to top, rgba(28,22,14,0.82) 0%, rgba(28,22,14,0.10) 55%, rgba(28,22,14,0.18) 100%)" }} />
          <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">{badges.map((b, i) => <ClassChip key={b} label={b} tone={i === 0 ? "gold" : "plain"} />)}</div>
          <div className="absolute right-3 top-3"><HeartButton active={saved} onClick={onToggleSave} size={18} /></div>
          <div className="absolute inset-x-0 bottom-0 p-4">
            {eyebrow && <div className="mb-0.5 text-[11px]" style={{ color: "rgba(253,248,238,0.85)" }}>{eyebrow}</div>}
            <h2 className="font-serif text-[20px] leading-snug" style={{ color: "#fdf8ee", fontWeight: 700 }}>{item.title}</h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]" style={{ color: "rgba(253,248,238,0.92)" }}>
              <span className="inline-flex items-center gap-1"><Star size={12} filled style={{ color: T.goldSoft }} /><b className="font-semibold">{item.rating.toFixed(1)}</b>{item.ratingCount > 0 && <span style={{ color: "rgba(253,248,238,0.7)" }}>({item.ratingCount.toLocaleString()})</span>}</span>
              <span style={{ color: "rgba(253,248,238,0.5)" }}>·</span>
              <span>by {item.author.name}</span>
              <span className="rounded-full px-2 py-[2px] text-[10px] font-medium" style={{ background: "rgba(253,248,238,0.18)" }}>{sourceRecLabel(item.source)}</span>
            </div>
          </div>
        </div>
        <div className="p-3.5">
          <p className="text-[12px] leading-relaxed" style={{ color: T.ink2 }}>{item.description}</p>
          <div className="mt-3">{cta}</div>
        </div>
      </div>
    );
  }

  // ── split（スポット・穴場）：写真左＋本文右 ──
  if (variant === "split") {
    return (
      <div className="overflow-hidden rounded-[20px] border" style={{ borderColor: T.border, background: T.card, boxShadow: ELEV.e2 }}>
        <div className="flex gap-3 p-3.5">
          <div {...tapProps(onOpen)} className={`relative w-[42%] shrink-0 overflow-hidden rounded-2xl ${onOpen ? `cursor-pointer ${FOCUS_RING}` : ""}`} aria-label={onOpen ? `${item.title} の詳細を見る` : undefined}>
            <PhotoSlot photo={item.photo} rounded="rounded-2xl" className="h-full min-h-[152px] w-full" />
            <div className="absolute left-1.5 top-1.5 flex flex-col items-start gap-1">{badges.map((b, i) => <ClassChip key={b} label={b} tone={i === 0 ? "gold" : "ink"} />)}</div>
            <div className="absolute right-1.5 top-1.5"><HeartButton active={saved} onClick={onToggleSave} size={14} /></div>
          </div>
          <div className="min-w-0 flex-1">
            {eyebrow && <div className="text-[10.5px]" style={{ color: T.ink3 }}>{eyebrow}</div>}
            <h2 className="font-serif text-[17px] leading-snug" style={{ color: T.ink, fontWeight: 700 }}>{item.title}</h2>
            <div className="mt-1 flex items-center gap-1 text-[11.5px]" style={{ color: T.ink2 }}><MapPin size={11} /> {item.areaLabel}</div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              <Rating rating={item.rating} count={item.ratingCount} size={11} />
              {item.hours && <span className="inline-flex items-center gap-0.5 text-[10.5px]" style={{ color: T.ink2 }}><Clock size={10} /> {item.hours}</span>}
            </div>
            {showWhy ? (
              <div className="mt-2 grid gap-1.5">
                {item.whySpecial && <WhyPanel title="なぜ特別なのか" body={item.whySpecial} />}
                {item.whyHidden && <WhyPanel title="なぜ知られていないのか" body={item.whyHidden} />}
              </div>
            ) : (
              <p className="mt-1.5 text-[11px] leading-relaxed" style={{ color: T.ink2, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{item.description}</p>
            )}
          </div>
        </div>
        <div className="px-3.5 pb-3.5">{cta}</div>
      </div>
    );
  }

  // ── stack（旅行・既定）：写真上＋本文下 ──
  return (
    <div className="overflow-hidden rounded-[20px] border" style={{ borderColor: T.border, background: T.card, boxShadow: ELEV.e2 }}>
      <div {...tapProps(onOpen)} className={`relative ${onOpen ? `cursor-pointer ${FOCUS_RING}` : ""}`} aria-label={onOpen ? `${item.title} の詳細を見る` : undefined}>
        <PhotoSlot photo={item.photo} rounded="rounded-none" className="h-40 w-full" />
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">{badges.map((b, i) => <ClassChip key={b} label={b} tone={i === 0 ? "gold" : "ink"} />)}</div>
        <div className="absolute right-3 top-3"><HeartButton active={saved} onClick={onToggleSave} size={18} /></div>
        {item.matchPct != null && <div className="absolute bottom-3 left-3"><ClassChip label={`Match ${item.matchPct}%`} tone="gold" /></div>}
      </div>

      <div className="p-4">
        {eyebrow && <div className="text-[11px]" style={{ color: T.ink3 }}>{eyebrow}</div>}
        <h2 className="font-serif text-[19px] leading-snug" style={{ color: T.ink, fontWeight: 700 }}>{item.title}</h2>
        <div className="mt-1 flex items-center gap-1 text-[12px]" style={{ color: T.ink2 }}><MapPin size={12} /> {item.areaLabel}</div>

        {meta.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{meta.map((m) => <MetaChip key={m}>{m}</MetaChip>)}</div>}

        <div className="mt-2 flex items-center gap-2">
          <Rating rating={item.rating} count={item.ratingCount} />
          <span className="text-[11px]" style={{ color: T.ink3 }}>·</span>
          <AuthorLine item={item} />
        </div>

        {reasons && reasons.length > 0 && (
          <div className="mt-3 rounded-xl p-3" style={{ background: T.cardSunk }}>
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest" style={{ color: T.ink3 }}>おすすめの理由</div>
            <ul className="grid gap-1">
              {reasons.map((r) => (
                <li key={r} className="flex items-start gap-1.5 text-[12px]" style={{ color: T.ink2 }}>
                  <span className="mt-[5px] h-1 w-1 shrink-0 rounded-full" style={{ background: T.gold }} />{r}
                </li>
              ))}
            </ul>
          </div>
        )}

        {prefChips && prefChips.length > 0 && (
          <div className="mt-3">
            <div className="mb-1 text-[10px]" style={{ color: T.ink3 }}>あなたの好み</div>
            <div className="flex flex-wrap gap-1.5">
              {prefChips.map((c) => (
                <span key={c.label} className="rounded-full px-2.5 py-1 text-[11px] font-medium" style={c.active ? { background: T.goldBg, color: T.goldDeep } : { background: T.cardAlt, color: T.ink3, border: `1px solid ${T.border}` }}>{c.label}</span>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4">{cta}</div>
      </div>
    </div>
  );
}

function WhyPanel({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl p-2.5" style={{ background: T.cardSunk }}>
      <div className="text-[10px] font-semibold" style={{ color: T.goldDeep }}>{title}</div>
      <p className="mt-0.5 text-[11px] leading-relaxed" style={{ color: T.ink2 }}>{body}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trip row card（横スクロール・旅行プラン）
// ---------------------------------------------------------------------------
export function TripRowCard({ item, saved, added = false, onToggleSave, onAddToItinerary, onOpen }: { item: LocationItem; saved: boolean; added?: boolean; onToggleSave: () => void; onAddToItinerary: () => void; onOpen?: () => void }) {
  return (
    <div
      {...tapProps(onOpen)}
      className={`flex w-[168px] shrink-0 flex-col overflow-hidden rounded-2xl border transition duration-150 ${onOpen ? `cursor-pointer hover:-translate-y-[1px] hover:shadow-[0_8px_22px_rgba(120,100,60,0.12)] active:scale-[0.99] ${FOCUS_RING}` : ""}`}
      style={{ borderColor: T.border, background: T.card }}
      aria-label={onOpen ? `${item.title} の詳細` : undefined}
    >
      <div className="relative">
        <PhotoSlot photo={item.photo} rounded="rounded-none" className="h-24 w-full" />
        <div className="absolute right-1.5 top-1.5"><HeartButton active={saved} onClick={onToggleSave} size={13} /></div>
        {item.matchPct != null && <div className="absolute bottom-1.5 left-1.5"><ClassChip label={`${item.matchPct}%`} tone="gold" /></div>}
      </div>
      <div className="flex flex-1 flex-col p-2.5">
        <div className="font-serif text-[12.5px] font-semibold leading-snug" style={{ color: T.ink, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{item.title}</div>
        {item.description && <p className="mt-0.5 truncate text-[10px]" style={{ color: T.ink3 }}>{item.description}</p>}
        <div className="mt-1 flex flex-wrap gap-1">{tripMeta(item).map((m) => <MetaChip key={m}>{m}</MetaChip>)}</div>
        <div className="mt-1.5 flex items-center justify-between gap-1">
          <Rating rating={item.rating} count={item.ratingCount} size={11} />
        </div>
        <AuthorLine item={item} className="mt-1" />
        <button
          onClick={(e) => { e.stopPropagation(); onAddToItinerary(); }}
          disabled={added}
          className={`mt-2 inline-flex items-center justify-center gap-1 rounded-lg border py-1.5 text-[11px] font-medium transition active:scale-[0.98] ${FOCUS_RING}`}
          style={added ? { borderColor: T.greenBg, background: T.greenBg, color: T.green } : { borderColor: T.border, background: T.cardAlt, color: T.goldDeep }}
        >
          {added ? <><Check size={12} /> 追加済み</> : <><Plus size={12} /> 旅程に追加</>}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Spot grid card（グリッド・単体スポット）
// ---------------------------------------------------------------------------
export function SpotGridCard({ item, saved, onToggleSave, onOpen, showSource = true }: { item: LocationItem; saved: boolean; onToggleSave: () => void; onOpen?: () => void; showSource?: boolean }) {
  return (
    <div
      {...tapProps(onOpen)}
      className={`flex flex-col overflow-hidden rounded-2xl border transition duration-150 ${onOpen ? `cursor-pointer hover:-translate-y-[1px] hover:shadow-[0_8px_22px_rgba(120,100,60,0.12)] active:scale-[0.99] ${FOCUS_RING}` : ""}`}
      style={{ borderColor: T.border, background: T.card }}
      aria-label={onOpen ? `${item.title} の詳細` : undefined}
    >
      <div className="relative">
        <PhotoSlot photo={item.photo} rounded="rounded-none" className="h-20 w-full" />
        <div className="absolute left-1.5 top-1.5"><ClassChip label={item.genre} tone="plain" /></div>
        <div className="absolute right-1.5 top-1.5"><HeartButton active={saved} onClick={onToggleSave} size={13} /></div>
      </div>
      <div className="flex flex-1 flex-col p-2">
        <div className="font-serif text-[12px] font-semibold leading-snug" style={{ color: T.ink, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{item.title}</div>
        {item.description && <p className="mt-0.5 truncate text-[10px]" style={{ color: T.ink3 }}>{item.description}</p>}
        <div className="mt-auto flex items-center justify-between pt-1.5">
          <Rating rating={item.rating} size={11} />
          {showSource && <SourceBadge source={item.source} />}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Source section（地元民から / 旅行者から：見出し＋横スクロール）
// ---------------------------------------------------------------------------
export function HScroll({ children }: { children: React.ReactNode }) {
  return <div className="-mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1" style={{ scrollbarWidth: "none" }}>{children}</div>;
}

/** 2列グリッド（スポット用）。 */
export function Grid2({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-2.5">{children}</div>;
}

/** 空状態（その都道府県のノートが無い等）。 */
export function EmptyState({ title, body, actionLabel, onAction }: { title: string; body: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed px-6 py-12 text-center" style={{ borderColor: T.border, background: T.cardAlt }}>
      <MapPin size={26} style={{ color: T.ink3 }} />
      <div className="font-serif text-[15px]" style={{ color: T.ink, fontWeight: 600 }}>{title}</div>
      <p className="max-w-[260px] text-[12px] leading-relaxed" style={{ color: T.ink3 }}>{body}</p>
      {actionLabel && onAction && (
        <button onClick={onAction} className="mt-2 inline-flex items-center gap-1 rounded-full px-4 py-2 text-[12px] font-semibold" style={{ background: T.goldBg, color: T.goldDeep }}>
          <Plus size={13} /> {actionLabel}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Theme tile（Concept 17 すべてのテーマ）
// ---------------------------------------------------------------------------
export function ThemeTile({ theme, active, onClick }: { theme: TravelTheme; active?: boolean; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="relative aspect-[4/3] overflow-hidden rounded-xl border text-left" style={{ borderColor: active ? T.gold : T.border, boxShadow: active ? `0 0 0 1.5px ${T.gold}` : undefined }}>
      <PhotoSlot photo={theme.photo} rounded="rounded-none" className="absolute inset-0 h-full w-full" />
      <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(40,34,24,0.62) 0%, rgba(40,34,24,0.05) 60%)" }} />
      <span className="absolute bottom-1.5 left-2 right-2 truncate font-serif text-[12px] font-semibold" style={{ color: "#fdf8ee" }}>{theme.label}</span>
    </button>
  );
}
