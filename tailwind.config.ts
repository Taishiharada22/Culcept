// tailwind.config.ts
// Colors sourced directly from lib/design-tokens.ts (Single Source of Truth)
import type { Config } from "tailwindcss";
import { COLORS, SURFACE, TEXT, BORDER, ZONES } from "./lib/design-tokens";

export default {
    darkMode: "class",
    content: [
        "./app/**/*.{js,ts,jsx,tsx,mdx}",
        "./components/**/*.{js,ts,jsx,tsx,mdx}",
        "./lib/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            // ── Core Palette (from design-tokens.ts — Single Source of Truth) ──
            colors: {
                // 5 accent colors
                indigo: COLORS.indigo,
                violet: COLORS.violet,
                blue: COLORS.blue,
                rose: COLORS.rose,
                amber: COLORS.amber,
                // Surfaces
                bg: SURFACE.bg,
                "bg-deep": SURFACE.bgDeep,
                surface: SURFACE.card,
                // Text hierarchy
                text1: TEXT.primary,
                text2: TEXT.secondary,
                text3: TEXT.muted,
                text4: TEXT.disabled,
                // Borders
                "border-subtle": BORDER.subtle,
                "border-medium": BORDER.medium,
                // Zone accents (light tints for backgrounds)
                "zone-observation": ZONES.observation.light,
                "zone-identity": ZONES.identity.light,
                "zone-presence": ZONES.presence.light,
                "zone-rendezvous": ZONES.rendezvous.light,
                "zone-exploration": ZONES.exploration.light,
            },
            // ── Typography ──
            fontFamily: {
                sans: ["var(--font-sans)", "Noto Sans JP", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
                mono: ["var(--font-mono)", "JetBrains Mono", "SF Mono", "monospace"],
                // UX-3: Concierge 世界観（travel UI 限定の font-serif / font-serif-latin）。既存 sans/mono 不変。
                serif: ["var(--font-serif)", "Noto Serif JP", "Hiragino Mincho ProN", "YuMincho", "serif"],
                "serif-latin": ["var(--font-serif-latin)", "var(--font-serif)", "Georgia", "serif"],
            },
            // ── Spacing & Radius ──
            borderRadius: {
                "2xl": "1.5rem",
                xl: "1.25rem",
                lg: "1rem",
                md: "0.75rem",
                sm: "0.5rem",
            },
            // ── Shadows (hierarchy-aware) ──
            boxShadow: {
                soft: "0 8px 30px rgba(0,0,0,0.08)",
                card: "0 2px 12px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)",
                "card-hover": "0 8px 24px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.04)",
                float: "0 16px 48px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.06)",
                popup: "0 24px 64px rgba(0,0,0,0.16), 0 8px 24px rgba(0,0,0,0.08)",
                // Primary CTA glow
                "primary-glow": "0 8px 32px rgba(99,102,241,0.3), 0 2px 8px rgba(0,0,0,0.08)",
                "primary-glow-hover": "0 12px 48px rgba(99,102,241,0.4), 0 4px 16px rgba(0,0,0,0.1)",
                // Zone accent shadows
                "zone-observation": "0 4px 20px rgba(99,102,241,0.18)",
                "zone-identity": "0 4px 20px rgba(139,92,246,0.18)",
                "zone-presence": "0 4px 20px rgba(59,130,246,0.18)",
                "zone-rendezvous": "0 4px 20px rgba(239,68,68,0.18)",
                "zone-exploration": "0 4px 20px rgba(245,158,11,0.18)",
            },
        },
    },
    plugins: [require("tailwindcss-animate")],
} satisfies Config;
