/**
 * Slice 1 — Calendar Outfit Dashboard scoped palette
 *
 * 設計方針:
 *   - 参照画像の lavender / 紫基調を **この dashboard 内に閉じた** Tailwind class 定数で表現。
 *   - global の `lib/design-tokens.ts` (warm-beige) には一切触れない (= scoped lavender)。
 *   - SYNC band の色 hint (caution=amber / risk=rose) は **この child file 内のみ**に存在する。
 *     CalendarTab.tsx 本体は amber/orange/red 禁止のため、band 色は必ずここを経由して描画する。
 *
 * 不変原則:
 *   - 色は「気付き」の濃淡であって警告ではない。drop-shadow / pulse / 強い枠線で煽らない。
 */

import type {
  CalendarOutfitBadgeTone,
  CalendarOutfitStatusTone,
  SyncBandKey,
} from "./types";

/** Dashboard 全体の lavender 基調 class 群 */
export const CAL_OUTFIT_PALETTE = {
  /** dashboard 全体の柔らかい背景グラデーション */
  pageGradient: "bg-gradient-to-b from-violet-50/80 via-white to-white",
  /** 標準カード (半透明 + うっすら紫枠 + 柔らかい紫影。 暗くしない) */
  card: "rounded-3xl border border-violet-100/70 bg-white/85 shadow-[0_4px_20px_-8px_rgba(91,33,182,0.15)] backdrop-blur-sm",
  /** 控えめカード (塗り弱め) */
  cardSoft: "rounded-2xl border border-violet-100/60 bg-violet-50/50",
  /** 見出し主色 */
  heading: "text-slate-800",
  /** 補助テキスト */
  subtle: "text-slate-500",
  /** アクセント (紫) */
  accent: "text-violet-600",
  /** アクセント弱 */
  accentSoft: "text-violet-400",
  /** SYNC ピル (band 非依存の基底、 画像準拠の薄紫ピル) */
  syncPill: "inline-flex items-center gap-1.5 rounded-full bg-violet-100/70 px-3 py-1 text-violet-700",
  /** section 間の余白（密度重視: 1 画面に収めるため詰める） */
  sectionGap: "space-y-3",
} as const;

/**
 * SYNC band の表示 spec (label + ピル class + dot class)。
 *
 * 実 engine の SYNC_BAND_LABELS (最適/良好/注意/要調整) と整合。
 * caution=amber / risk=rose は **意図的にここに閉じ込めている** (CalendarTab.tsx の色禁止と整合)。
 */
export const SYNC_BAND_VM: Record<
  SyncBandKey,
  { label: string; pill: string; dot: string }
> = {
  excellent: {
    label: "最適",
    pill: "bg-emerald-100/70 text-emerald-700",
    dot: "bg-emerald-400",
  },
  good: {
    label: "良好",
    pill: "bg-sky-100/70 text-sky-700",
    dot: "bg-sky-400",
  },
  caution: {
    label: "注意",
    pill: "bg-amber-100/70 text-amber-700",
    dot: "bg-amber-400",
  },
  risk: {
    label: "要調整",
    pill: "bg-rose-100/70 text-rose-700",
    dot: "bg-rose-400",
  },
};

/**
 * 状態トーン → 値テキストの色 class。
 *   ワードローブ分析の値 / 提案理由 factor の値の色分けに使う。
 *   caution の amber はここに閉じる (CalendarTab.tsx の amber 禁止と整合)。
 */
export const STATUS_TONE_TEXT: Record<CalendarOutfitStatusTone, string> = {
  good: "text-emerald-600",
  caution: "text-amber-600",
  accent: "text-violet-600",
  neutral: "text-slate-600",
};

/** 状態トーン → アイコン背景の soft ピル class (icon chip 用) */
export const STATUS_TONE_SOFT: Record<CalendarOutfitStatusTone, string> = {
  good: "bg-emerald-50 text-emerald-600",
  caution: "bg-amber-50 text-amber-600",
  accent: "bg-violet-50 text-violet-600",
  neutral: "bg-slate-50 text-slate-500",
};

/** 用途バッジのトーン → ピル class (オフィス向け / カフェ / ディナー) */
export const BADGE_TONE: Record<CalendarOutfitBadgeTone, string> = {
  violet: "bg-violet-100/80 text-violet-700",
  emerald: "bg-emerald-100/80 text-emerald-700",
  rose: "bg-rose-100/80 text-rose-700",
};
