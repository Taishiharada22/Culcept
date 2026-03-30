/**
 * Aneurasync Design Tokens — Single Source of Truth
 *
 * 設計思想: 「主役と脇役の明暗」
 * ─────────────────────────────
 * ユーザーが「今、何が大切か」を一瞬で判断できるように、
 * 視覚的な主従関係（hierarchy）をトークンレベルで定義する。
 *
 * - PRIMARY:  画面内で「今やるべきこと」に使う（1画面に1つ）
 * - ACCENT:   各ゾーンの識別色（セクション見出し、カードボーダー）
 * - MUTED:    脇役のUI要素（完了済み、補足情報、背景装飾）
 *
 * 使い方:
 *   主役 → HIERARCHY.primary のグラデーション・シャドウ・太字
 *   脇役 → HIERARCHY.supporting の薄い背景・細いボーダー・小さい文字
 *   完了 → HIERARCHY.completed の灰色・opacity低下
 */

// ════════════════════════════════════════════
// 1. CORE PALETTE — 5色だけで全画面を構成する
// ════════════════════════════════════════════

export const COLORS = {
  /** Observation / Primary Action — 最も目立つ色 */
  indigo: "#6366F1",
  /** Identity / Neural / Archetype — 深層・知的な印象 */
  violet: "#8B5CF6",
  /** Presence / Sync / Daily — 信頼・落ち着き */
  blue: "#3B82F6",
  /** Rendezvous / Connection — 温かみ・つながり */
  rose: "#EF4444",
  /** Exploration / Growth / Style — 活力・発見 */
  amber: "#F59E0B",
} as const;

// ════════════════════════════════════════════
// 2. SURFACES — 背景・カード・オーバーレイ
// ════════════════════════════════════════════

export const SURFACE = {
  /** ページ全体の背景（ライトモード統一） */
  bg: "#f8f6f3",
  /** セクション区切りの深い背景 */
  bgDeep: "#f0ede9",
  /** カード背景 */
  card: "#ffffff",
  /** ガラス効果オーバーレイ */
  glass: "rgba(255,255,255,0.88)",
  /** ガラス効果（軽い） */
  glassLight: "rgba(255,255,255,0.6)",
  /** ヘッダーのガラス効果 */
  headerGlass: "rgba(248,246,243,0.92)",
} as const;

// ════════════════════════════════════════════
// 3. TEXT — 4段階の文字色
// ════════════════════════════════════════════

export const TEXT = {
  /** 見出し・重要テキスト (13.5:1 on #fff) */
  primary: "#1a1a2e",
  /** 本文・説明テキスト (5.9:1 on #fff — WCAG AA) */
  secondary: "#3d3d5c",
  /** 補足・ラベル (4.5:1 on #fff — WCAG AA) */
  muted: "#555573",
  /** 無効・タイムスタンプ (3.2:1 on #fff — large text 18px+/装飾用途のみ) */
  disabled: "#717190",
} as const;

// ════════════════════════════════════════════
// 4. BORDER & SHADOW — 控えめな境界線
// ════════════════════════════════════════════

export const BORDER = {
  subtle: "rgba(0,0,0,0.04)",
  medium: "rgba(0,0,0,0.08)",
  strong: "rgba(0,0,0,0.12)",
} as const;

export const SHADOW = {
  /** カードの静止状態 */
  sm: "0 2px 12px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)",
  /** カードのホバー状態 */
  md: "0 8px 24px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.04)",
  /** フローティングUI（FAB、モーダル） */
  lg: "0 16px 48px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.06)",
  /** ドロップシャドウ（ポップアップ、フライアウト） */
  xl: "0 24px 64px rgba(0,0,0,0.16), 0 8px 24px rgba(0,0,0,0.08)",
} as const;

// ════════════════════════════════════════════
// 5. ZONES — ゾーン別アクセントカラー
//    各ゾーンは COLORS の1色をベースに派生
// ════════════════════════════════════════════

export type ZoneName = "presence" | "observation" | "identity" | "rendezvous" | "exploration";

export const ZONES: Record<ZoneName, {
  accent: string;
  /** カードの薄い背景（アクセントの8%不透明度相当） */
  light: string;
  /** カードの強い背景（dense variant用、アクセントの20%不透明度相当） */
  deep: string;
  /** ボックスシャドウに使うアクセント系色 */
  shadow: string;
  /** ゾーンの見出しに使うグラデーション */
  gradient: string;
}> = {
  presence: {
    accent: COLORS.blue,
    light: "#D6E4FF",
    deep: "#C2D6FF",
    shadow: "rgba(59,130,246,0.18)",
    gradient: `linear-gradient(135deg, ${COLORS.blue}, #60A5FA)`,
  },
  observation: {
    accent: COLORS.indigo,
    light: "#DBD8FF",
    deep: "#CCC8FF",
    shadow: "rgba(99,102,241,0.18)",
    gradient: `linear-gradient(135deg, ${COLORS.indigo}, #818CF8)`,
  },
  identity: {
    accent: COLORS.violet,
    light: "#E0D4FF",
    deep: "#D0C0FF",
    shadow: "rgba(139,92,246,0.18)",
    gradient: `linear-gradient(135deg, ${COLORS.violet}, #A78BFA)`,
  },
  rendezvous: {
    accent: COLORS.rose,
    light: "#FFD9D1",
    deep: "#FFC8BC",
    shadow: "rgba(239,68,68,0.18)",
    gradient: `linear-gradient(135deg, ${COLORS.rose}, #F87171)`,
  },
  exploration: {
    accent: COLORS.amber,
    light: "#FDEACC",
    deep: "#FBDFB5",
    shadow: "rgba(245,158,11,0.18)",
    gradient: `linear-gradient(135deg, ${COLORS.amber}, #FBBF24)`,
  },
};

// ════════════════════════════════════════════
// 6. HIERARCHY — 主役と脇役の明暗システム
//    「今やるべきこと」を視覚的に際立たせる
// ════════════════════════════════════════════

export const HIERARCHY = {
  /** ──── 主役: 画面内で最も目立つ1要素 ──── */
  primary: {
    /** CTAボタンの背景グラデーション */
    gradient: `linear-gradient(135deg, ${COLORS.indigo}, ${COLORS.violet})`,
    /** CTAボタンのシャドウ（色付き） */
    shadow: `0 8px 32px rgba(99,102,241,0.3), 0 2px 8px rgba(0,0,0,0.08)`,
    /** CTAボタンのホバーシャドウ */
    shadowHover: `0 12px 48px rgba(99,102,241,0.4), 0 4px 16px rgba(0,0,0,0.1)`,
    /** 主役テキストの色 */
    text: "#ffffff",
    /** 主役カードのボーダー */
    border: `1.5px solid rgba(99,102,241,0.3)`,
    /** 主役セクションの背景（微かなアクセント） */
    bg: `linear-gradient(145deg, rgba(99,102,241,0.06) 0%, #ffffff 40%, rgba(139,92,246,0.04) 100%)`,
  },

  /** ──── 脇役: 補助的な情報・セカンダリアクション ──── */
  supporting: {
    /** 脇役カードの背景 */
    bg: SURFACE.card,
    /** 脇役カードのボーダー（極めて控えめ） */
    border: `1px solid ${BORDER.subtle}`,
    /** 脇役カードのシャドウ */
    shadow: SHADOW.sm,
    /** 脇役テキストの色 */
    text: TEXT.secondary,
    /** 脇役のアクセント（薄い） */
    accent: "rgba(99,102,241,0.08)",
  },

  /** ──── 完了済み: 操作不要な要素 ──── */
  completed: {
    /** 完了カードの背景 */
    bg: "#f5f5f8",
    /** 完了カードのボーダー */
    border: "1px solid rgba(0,0,0,0.03)",
    /** 完了カードの不透明度 */
    opacity: 0.6,
    /** 完了テキストの色 */
    text: TEXT.muted,
  },

  /** ──── 緊急: 注意を引く必要がある要素 ──── */
  urgent: {
    /** ストリーク警告、期限切れ間近など */
    gradient: `linear-gradient(135deg, ${COLORS.rose}, #F87171)`,
    shadow: `0 8px 32px rgba(239,68,68,0.2), 0 2px 8px rgba(0,0,0,0.08)`,
    text: "#ffffff",
    /** パルスアニメーション用のシャドウ */
    pulseShadow: `0 0 0 4px rgba(239,68,68,0.15)`,
  },
} as const;

// ════════════════════════════════════════════
// 7. SPACING — 4px グリッド
// ════════════════════════════════════════════

export const SPACE = {
  /** 4px — アイコンとテキストの間 */
  xs: 4,
  /** 8px — 同一グループ内の要素間 */
  sm: 8,
  /** 12px — 小カード内部padding */
  md: 12,
  /** 16px — 標準padding */
  lg: 16,
  /** 20px — カード内padding（標準） */
  xl: 20,
  /** 24px — セクション内余白 */
  "2xl": 24,
  /** 32px — セクション間余白（小） */
  "3xl": 32,
  /** 40px — セクション間余白（中） */
  "4xl": 40,
  /** 48px — セクション間余白（大） */
  "5xl": 48,
  /** 64px — ページ区切り */
  "6xl": 64,
} as const;

// ════════════════════════════════════════════
// 8. RADII — 角丸
// ════════════════════════════════════════════

export const RADII = {
  /** 8px — バッジ、小さなインプット */
  sm: 8,
  /** 12px — ボタン、タブ */
  md: 12,
  /** 16px — カード（コンパクト） */
  lg: 16,
  /** 20px — カード（標準） */
  xl: 20,
  /** 24px — カード（大） */
  "2xl": 24,
  /** 完全な丸 */
  full: 9999,
} as const;

// ════════════════════════════════════════════
// 9. TYPOGRAPHY — フォントファミリーとサイズ
// ════════════════════════════════════════════

export const FONT = {
  /** メインフォント（Noto Sans JP — next/font/google で読み込み） */
  sans: "var(--font-sans, 'Noto Sans JP', -apple-system, BlinkMacSystemFont, sans-serif)",
  /** 等幅フォント（数値・コード・ラベル） */
  mono: "var(--font-mono, 'JetBrains Mono', 'SF Mono', monospace)",
} as const;

/** タイプスケール: モバイルファースト */
export const TYPE = {
  /** 9px — 極小ラベル（NEURAL WHISPER等のシステムラベル） */
  "2xs": { size: 9, weight: 700, tracking: "0.15em" },
  /** 11px — 補助テキスト、タイムスタンプ */
  xs: { size: 11, weight: 500, tracking: "normal" },
  /** 13px — 本文（小） */
  sm: { size: 13, weight: 400, tracking: "normal" },
  /** 15px — 本文（標準） */
  base: { size: 15, weight: 400, tracking: "normal" },
  /** 18px — セクション見出し */
  lg: { size: 18, weight: 700, tracking: "-0.02em" },
  /** 24px — ページ見出し */
  xl: { size: 24, weight: 800, tracking: "-0.03em" },
  /** 32px — ヒーロー見出し */
  "2xl": { size: 32, weight: 900, tracking: "-0.03em" },
} as const;

// ════════════════════════════════════════════
// 10. MOTION — アニメーション速度・イージング
// ════════════════════════════════════════════

export const MOTION = {
  /** 0.15s — ホバー、フォーカス等の即時反応 */
  fast: "0.15s ease",
  /** 0.3s — カード遷移、フェードイン */
  normal: "0.3s ease",
  /** 0.5s — セクション遷移、モーダル */
  slow: "0.5s ease",
  /** Framer Motion のスプリング設定 */
  spring: { type: "spring" as const, stiffness: 300, damping: 25 },
  /** Framer Motion のスプリング（ゆるめ） */
  springSoft: { type: "spring" as const, stiffness: 200, damping: 20 },
} as const;

// ════════════════════════════════════════════
// 11. BREAKPOINTS — レスポンシブ
// ════════════════════════════════════════════

export const BREAKPOINT = {
  sm: 480,
  md: 768,
  lg: 1024,
  xl: 1280,
} as const;

// ════════════════════════════════════════════
// 12. HELPER — ゾーンアクセントの CSS 生成
// ════════════════════════════════════════════

/** ゾーンカードのスタイルを返す（主役/脇役に応じて強度を変える） */
export function zoneCardStyle(
  zone: ZoneName,
  role: "primary" | "supporting" | "completed" = "supporting",
): React.CSSProperties {
  const z = ZONES[zone];
  switch (role) {
    case "primary":
      return {
        borderRadius: RADII.xl,
        background: HIERARCHY.primary.bg,
        border: HIERARCHY.primary.border,
        boxShadow: `${SHADOW.md}, 0 0 0 1px ${z.shadow}`,
        padding: SPACE.xl,
      };
    case "completed":
      return {
        borderRadius: RADII.xl,
        background: HIERARCHY.completed.bg,
        border: HIERARCHY.completed.border,
        opacity: HIERARCHY.completed.opacity,
        padding: SPACE.xl,
      };
    default:
      return {
        borderRadius: RADII.xl,
        background: SURFACE.card,
        border: HIERARCHY.supporting.border,
        boxShadow: SHADOW.sm,
        padding: SPACE.xl,
      };
  }
}
