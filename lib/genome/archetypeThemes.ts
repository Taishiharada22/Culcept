// lib/genome/archetypeThemes.ts
// 24アーキタイプの Genome Card 用ビジュアルテーマ
// archetypeTypes.ts の ColorGroup (Cognition×Emotion → 6 families) から自動生成

import {
  type ArchetypeCode,
  type ArchetypeDef,
  type ColorFamily,
  type ColorTone,
  getArchetypeByCode,
  getColorGroup,
  ARCHETYPE_DEFS,
} from "@/lib/stargazer/archetypeTypes";

/* ═══════════════════════════════════════════════
   カードテーマ定義
   ═══════════════════════════════════════════════ */
export interface CardTheme {
  gradient: string;       // カード背景グラデーション（ダーク）
  glow: string;           // 発光色 rgba
  accentHex: string;      // アクセント色 hex
  pattern: string;        // SVG path 紋様
  symbol: string;         // emoji
  english: string;        // 英名
  name: string;           // 日本語名
  code: ArchetypeCode;    // 4文字コード
  tagline: string;        // 一行説明
}

/* ── ColorFamily → ビジュアルパラメータ ── */
const FAMILY_COLORS: Record<ColorFamily, { base: string; glow: string; accent: string }> = {
  navy:    { base: "#1E3A5F", glow: "rgba(30,58,95,0.5)", accent: "#3B82F6" },
  magenta: { base: "#831843", glow: "rgba(217,70,239,0.5)", accent: "#D946EF" },
  indigo:  { base: "#312E81", glow: "rgba(99,102,241,0.5)", accent: "#6366F1" },
  orange:  { base: "#92400E", glow: "rgba(245,158,11,0.5)", accent: "#F59E0B" },
  emerald: { base: "#064E3B", glow: "rgba(16,185,129,0.5)", accent: "#10B981" },
  gold:    { base: "#713F12", glow: "rgba(234,179,8,0.5)", accent: "#EAB308" },
};

const TONE_GRADIENTS: Record<ColorTone, (base: string) => string> = {
  standard: (b) => `linear-gradient(135deg, ${adjustBrightness(b, -0.6)} 0%, ${b} 50%, ${adjustBrightness(b, -0.4)} 100%)`,
};

/* Emotion axis → 紋様パターン */
const EMOTION_PATTERNS: Record<string, string> = {
  C: "M10,10 L90,10 M10,30 L90,30 M10,50 L90,50 M10,70 L90,70 M10,90 L90,90",  // geometric lines — calm
  V: "M10,50 Q30,10 50,50 T90,50 M10,30 Q30,0 50,30 T90,30 M10,70 Q30,40 50,70 T90,70",  // organic curves — vivid
};

/* ═══════════════════════════════════════════════
   テーマ生成
   ═══════════════════════════════════════════════ */
function buildThemeForArchetype(def: ArchetypeDef): CardTheme {
  const colorGroup = getColorGroup(def.code);
  const fc = FAMILY_COLORS[colorGroup.family];
  const gradient = TONE_GRADIENTS[colorGroup.tone](fc.base);
  const pattern = EMOTION_PATTERNS[def.emotion] ?? EMOTION_PATTERNS.C;

  return {
    gradient,
    glow: fc.glow,
    accentHex: fc.accent,
    pattern,
    symbol: def.emoji,
    english: def.englishName,
    name: def.name,
    code: def.code,
    tagline: def.tagline,
  };
}

/* ── キャッシュ済みテーママップ ── */
const _themeCache = new Map<string, CardTheme>();

/** 英名→カタカナマッピング（DBに「インスペクター」等で保存されている場合の対応） */
const KATAKANA_MAP: Record<string, string> = {};
for (const d of ARCHETYPE_DEFS) {
  // 英名のカタカナ変換を手動登録する代わりに、englishNameをキーにして検索可能にする
  KATAKANA_MAP[d.englishName.toLowerCase()] = d.code;
}
// 日本語名→コードマッピング（24タイプ）
const KATAKANA_TO_CODE: Record<string, string> = {};
for (const d of ARCHETYPE_DEFS) {
  KATAKANA_TO_CODE[d.name] = d.code;
}

/** コンステレーションラベル（日本語名/英名/カタカナ）またはコードからテーマを取得 */
export function getCardTheme(labelOrCode: string | null | undefined): CardTheme {
  if (!labelOrCode) return DEFAULT_THEME;

  // キャッシュ
  const cached = _themeCache.get(labelOrCode);
  if (cached) return cached;

  // コードで検索
  let def = getArchetypeByCode(labelOrCode as ArchetypeCode);

  // 日本語名で検索
  if (!def) {
    def = ARCHETYPE_DEFS.find((a) => a.name === labelOrCode);
  }

  // 英名で検索
  if (!def) {
    def = ARCHETYPE_DEFS.find((a) => a.englishName.toLowerCase() === labelOrCode.toLowerCase());
  }

  // カタカナ表記で検索
  if (!def) {
    const code = KATAKANA_TO_CODE[labelOrCode];
    if (code) def = getArchetypeByCode(code as ArchetypeCode);
  }

  if (!def) return DEFAULT_THEME;

  const theme = buildThemeForArchetype(def);
  _themeCache.set(labelOrCode, theme);
  _themeCache.set(def.code, theme);
  _themeCache.set(def.name, theme);
  return theme;
}

/** アーキタイプ定義を名前/コード/カタカナから取得 */
export function getArchetypeDef(labelOrCode: string | null | undefined): ArchetypeDef | undefined {
  if (!labelOrCode) return undefined;
  let def = getArchetypeByCode(labelOrCode as ArchetypeCode);
  if (!def) def = ARCHETYPE_DEFS.find((a) => a.name === labelOrCode);
  if (!def) def = ARCHETYPE_DEFS.find((a) => a.englishName.toLowerCase() === labelOrCode.toLowerCase());
  if (!def) {
    const code = KATAKANA_TO_CODE[labelOrCode];
    if (code) def = getArchetypeByCode(code as ArchetypeCode);
  }
  return def;
}

/** フィギュア画像パスを取得（フォールバック付き） */
export function getFigureSrc(def: ArchetypeDef | undefined): string | null {
  if (!def) return null;

  // 既存画像とのマッピング
  const FIGURE_MAP: Record<string, string> = {
    commander: "commander1", architect: "architect1", pioneer: "pioneer1",
    captain: "captain1", sage: "sage", oracle: "oracle",
    healer: "healer", guardian: "guardian", mentor: "mentor",
    tactician: "tactician", catalyst: "catalyst", dynamo: "dynamo",
    empath: "empath", maestro: "maestro", forger: "forger",
  };

  const key = def.englishName.toLowerCase();
  const mapped = FIGURE_MAP[key];
  if (mapped) return `/samples/figure/${mapped}.png`;

  // Cognition軸でフォールバック
  const COGNITION_FALLBACK: Record<string, string> = {
    A: "commander1",  // Analytical → commander系
    N: "oracle",      // iNtuitive → oracle系
    S: "guardian",    // Sensory → guardian系
  };
  const fallback = COGNITION_FALLBACK[def.cognition];
  return fallback ? `/samples/figure/${fallback}.png` : null;
}

/* ── デフォルトテーマ（未判定時） ── */
export const DEFAULT_THEME: CardTheme = {
  gradient: "linear-gradient(135deg, #0c0818 0%, #16103a 40%, #1a1248 60%, #0e0a20 100%)",
  glow: "rgba(139,92,246,0.3)",
  accentHex: "#8B5CF6",
  pattern: "M50,50 m-30,0 a30,30 0 1,1 60,0 a30,30 0 1,1 -60,0 M50,50 m-15,0 a15,15 0 1,1 30,0 a15,15 0 1,1 -30,0",
  symbol: "✦",
  english: "Emerging",
  name: "プロフィール観測中",
  code: "ACIO" as ArchetypeCode,
  tagline: "観測を重ねるたびに、あなたの輪郭が浮かび上がる",
};

/* ── ヘルパー ── */
function adjustBrightness(hex: string, factor: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const adjust = (c: number) => Math.max(0, Math.min(255, Math.round(c + c * factor)));
  return `#${adjust(r).toString(16).padStart(2, "0")}${adjust(g).toString(16).padStart(2, "0")}${adjust(b).toString(16).padStart(2, "0")}`;
}
