// lib/stargazer/archetypeThemes.ts
// Stargazer v4 — Light-Mode Visual Theme System for 24 Personality Archetypes
// 6 color groups = Cognition(3) × Emotion(2)
// All palettes designed for light backgrounds matching the Stargazer glassmorphism aesthetic

import type {
  ArchetypeCode,
  CognitionCode,
  EmotionCode,
  SocialCode,
  ExecutionCode,
  ColorFamily,
} from "./archetypeTypes";
import { parseArchetypeCode } from "./archetypeTypes";

// Legacy type aliases
type Layer1Code = CognitionCode;
type Layer3Code = SocialCode;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Interfaces
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface ColorPalette {
  primary: string;
  secondary: string;
  accent: string;
  pageBg: string;
  nebulaColor: string;
  glow: string;
  text: string;
  textMuted: string;
  textLabel: string;
  surface: string;
  surfaceElevated: string;
  border: string;
  heroTint: string;
}

export type AnimationTempo = "slow" | "medium" | "fast";
export type AnimationStyle =
  | "pulse" | "wave" | "orbit" | "breathe" | "spark"
  | "float" | "ripple" | "fade" | "shift";

export interface GradientSet {
  hero: string;
  card: string;
  button: string;
}

export interface ArchetypeTheme {
  code: ArchetypeCode;
  palette: ColorPalette;
  gradient: GradientSet;
  animation: {
    tempo: AnimationTempo;
    style: AnimationStyle;
    particleCount: number;
  };
  typography: {
    headingWeight: number;
    bodyWeight: number;
    letterSpacing: string;
  };
  glassEffect: {
    blur: string;
    opacity: number;
    borderOpacity: number;
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Color Palettes — 6 Groups (Cognition × Emotion) — LIGHT MODE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type ColorGroupKey = `${CognitionCode}_${EmotionCode}`;

const COLOR_PALETTES: Record<ColorGroupKey, ColorPalette> = {
  // ── Navy (A×C / Architects / 分析×静) ──────────────
  A_C: {
    primary: "#1E3A5F",
    secondary: "#2563EB",
    accent: "#1D4ED8",
    pageBg: "#F0F4FA",
    nebulaColor: "rgba(30, 58, 95, 0.06)",
    glow: "rgba(37, 99, 235, 0.10)",
    text: "rgba(15, 23, 42, 0.88)",
    textMuted: "rgba(71, 85, 105, 0.60)",
    textLabel: "rgba(29, 78, 216, 0.72)",
    surface: "rgba(240, 244, 250, 0.85)",
    surfaceElevated: "rgba(245, 248, 255, 0.90)",
    border: "rgba(37, 99, 235, 0.12)",
    heroTint: "rgba(30, 58, 95, 0.06)",
  },

  // ── Magenta (A×V / Ignitors / 分析×動) ──────────────
  A_V: {
    primary: "#9D174D",
    secondary: "#DB2777",
    accent: "#BE185D",
    pageBg: "#FDF2F8",
    nebulaColor: "rgba(157, 23, 77, 0.06)",
    glow: "rgba(219, 39, 119, 0.10)",
    text: "rgba(45, 15, 30, 0.88)",
    textMuted: "rgba(120, 70, 95, 0.60)",
    textLabel: "rgba(190, 24, 93, 0.72)",
    surface: "rgba(253, 242, 248, 0.85)",
    surfaceElevated: "rgba(255, 246, 251, 0.90)",
    border: "rgba(219, 39, 119, 0.12)",
    heroTint: "rgba(157, 23, 77, 0.06)",
  },

  // ── Indigo (N×C / Oracles / 直感×静) ──────────────
  N_C: {
    primary: "#4338CA",
    secondary: "#6366F1",
    accent: "#4F46E5",
    pageBg: "#EEF2FF",
    nebulaColor: "rgba(67, 56, 202, 0.06)",
    glow: "rgba(99, 102, 241, 0.10)",
    text: "rgba(30, 27, 75, 0.88)",
    textMuted: "rgba(100, 95, 145, 0.60)",
    textLabel: "rgba(79, 70, 229, 0.72)",
    surface: "rgba(238, 242, 255, 0.85)",
    surfaceElevated: "rgba(243, 246, 255, 0.90)",
    border: "rgba(99, 102, 241, 0.12)",
    heroTint: "rgba(67, 56, 202, 0.06)",
  },

  // ── Orange (N×V / Catalysts / 直感×動) ──────────────
  N_V: {
    primary: "#C2410C",
    secondary: "#EA580C",
    accent: "#DC2626",
    pageBg: "#FFF7ED",
    nebulaColor: "rgba(194, 65, 12, 0.07)",
    glow: "rgba(234, 88, 12, 0.12)",
    text: "rgba(50, 30, 10, 0.88)",
    textMuted: "rgba(130, 90, 55, 0.60)",
    textLabel: "rgba(194, 65, 12, 0.72)",
    surface: "rgba(255, 247, 237, 0.85)",
    surfaceElevated: "rgba(255, 250, 243, 0.90)",
    border: "rgba(234, 88, 12, 0.15)",
    heroTint: "rgba(194, 65, 12, 0.07)",
  },

  // ── Emerald (S×C / Artisans / 体感×静) ──────────────
  S_C: {
    primary: "#047857",
    secondary: "#10B981",
    accent: "#059669",
    pageBg: "#ECFDF5",
    nebulaColor: "rgba(4, 120, 87, 0.06)",
    glow: "rgba(16, 185, 129, 0.10)",
    text: "rgba(6, 40, 30, 0.88)",
    textMuted: "rgba(55, 110, 90, 0.60)",
    textLabel: "rgba(5, 150, 105, 0.72)",
    surface: "rgba(236, 253, 245, 0.85)",
    surfaceElevated: "rgba(242, 255, 248, 0.90)",
    border: "rgba(16, 185, 129, 0.12)",
    heroTint: "rgba(4, 120, 87, 0.06)",
  },

  // ── Gold (S×V / Dynamos / 体感×動) ──────────────
  S_V: {
    primary: "#B45309",
    secondary: "#F59E0B",
    accent: "#D97706",
    pageBg: "#FFFBEB",
    nebulaColor: "rgba(180, 83, 9, 0.07)",
    glow: "rgba(245, 158, 11, 0.12)",
    text: "rgba(45, 35, 15, 0.88)",
    textMuted: "rgba(120, 100, 55, 0.60)",
    textLabel: "rgba(217, 119, 6, 0.72)",
    surface: "rgba(255, 251, 235, 0.85)",
    surfaceElevated: "rgba(255, 253, 243, 0.90)",
    border: "rgba(245, 158, 11, 0.15)",
    heroTint: "rgba(180, 83, 9, 0.07)",
  },
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Animations — per Emotion axis (感情の動き方)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface AnimationConfig {
  tempo: AnimationTempo;
  style: AnimationStyle;
  particleCount: number;
}

const EMOTION_ANIMATIONS: Record<EmotionCode, AnimationConfig> = {
  C: { tempo: "slow", style: "breathe", particleCount: 6 },
  V: { tempo: "fast", style: "spark", particleCount: 12 },
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Typography — per Cognition axis (認知スタイル)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface TypographyConfig {
  headingWeight: number;
  bodyWeight: number;
  letterSpacing: string;
}

const COGNITION_TYPOGRAPHY: Record<CognitionCode, TypographyConfig> = {
  A: { headingWeight: 700, bodyWeight: 400, letterSpacing: "0.02em" },
  N: { headingWeight: 600, bodyWeight: 400, letterSpacing: "0.01em" },
  S: { headingWeight: 500, bodyWeight: 400, letterSpacing: "0em" },
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Glass Effects — per Execution axis (実行スタイル)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface GlassConfig {
  blur: string;
  opacity: number;
  borderOpacity: number;
}

const EXECUTION_GLASS: Record<ExecutionCode, GlassConfig> = {
  O: { blur: "16px", opacity: 0.85, borderOpacity: 0.15 },
  X: { blur: "12px", opacity: 0.80, borderOpacity: 0.18 },
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Gradient Builder
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function buildGradients(palette: ColorPalette): GradientSet {
  return {
    hero: `linear-gradient(145deg, ${palette.heroTint} 0%, ${palette.surface} 50%, ${palette.pageBg} 100%)`,
    card: `linear-gradient(145deg, rgba(255,255,255,0.92) 0%, ${palette.surface} 100%)`,
    button: `linear-gradient(135deg, ${palette.primary} 0%, ${palette.accent} 100%)`,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Theme Builder
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function getArchetypeTheme(code: ArchetypeCode | string): ArchetypeTheme {
  const { cognition, emotion, execution } = parseArchetypeCode(code);
  const groupKey = `${cognition}_${emotion}` as ColorGroupKey;

  const palette = COLOR_PALETTES[groupKey];

  return {
    code: code as ArchetypeCode,
    palette,
    gradient: buildGradients(palette),
    animation: { ...EMOTION_ANIMATIONS[emotion] },
    typography: { ...COGNITION_TYPOGRAPHY[cognition] },
    glassEffect: { ...EXECUTION_GLASS[execution] },
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CSS Custom Properties
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function getCSSVariables(
  theme: ArchetypeTheme,
): Record<string, string> {
  const { palette, animation, typography, glassEffect } = theme;

  const tempoMs =
    animation.tempo === "fast"
      ? "800ms"
      : animation.tempo === "medium"
        ? "1600ms"
        : "2400ms";

  return {
    // Palette
    "--sg-primary": palette.primary,
    "--sg-secondary": palette.secondary,
    "--sg-accent": palette.accent,
    "--sg-page-bg": palette.pageBg,
    "--sg-nebula-color": palette.nebulaColor,
    "--sg-glow": palette.glow,
    "--sg-text": palette.text,
    "--sg-text-muted": palette.textMuted,
    "--sg-text-label": palette.textLabel,
    "--sg-surface": palette.surface,
    "--sg-border": palette.border,
    "--sg-hero-tint": palette.heroTint,

    // Animation
    "--sg-animation-tempo": tempoMs,
    "--sg-animation-style": animation.style,
    "--sg-particle-count": String(animation.particleCount),

    // Typography
    "--sg-heading-weight": String(typography.headingWeight),
    "--sg-body-weight": String(typography.bodyWeight),
    "--sg-letter-spacing": typography.letterSpacing,

    // Glass
    "--sg-blur": glassEffect.blur,
    "--sg-opacity": String(glassEffect.opacity),
    "--sg-border-opacity": String(glassEffect.borderOpacity),
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Get the color family name for a given archetype code */
export function getColorFamilyName(code: ArchetypeCode | string): ColorFamily {
  const { cognition, emotion } = parseArchetypeCode(code);
  const groupKey = `${cognition}_${emotion}` as ColorGroupKey;
  const familyMap: Record<ColorGroupKey, ColorFamily> = {
    A_C: "navy",
    A_V: "magenta",
    N_C: "indigo",
    N_V: "orange",
    S_C: "emerald",
    S_V: "gold",
  };
  return familyMap[groupKey];
}

/** All 6 group keys */
export const COLOR_GROUP_KEYS: ColorGroupKey[] = [
  "A_C", "A_V", "N_C", "N_V", "S_C", "S_V",
];
