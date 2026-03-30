// app/stargazer/_components/ArchetypeThemeProvider.tsx
// Stargazer v3 — ユーザーのアーキタイプに基づき全UIテーマを動的適用
// ページ全体の背景色 + CSS変数 + コンテキストを提供
"use client";

import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import type { ArchetypeCode } from "@/lib/stargazer/archetypeTypes";
import { getArchetypeByCode } from "@/lib/stargazer/archetypeTypes";
import { getArchetypeTheme, getCSSVariables, type ArchetypeTheme } from "@/lib/stargazer/archetypeThemes";

interface ArchetypeThemeContextValue {
  code: ArchetypeCode | null;
  theme: ArchetypeTheme | null;
  /** タイプ名 e.g. "錬金術師" */
  typeName: string;
  /** 英語名 e.g. "Alchemist" */
  englishName: string;
  /** タイプのemoji */
  emoji: string;
}

const ArchetypeThemeContext = createContext<ArchetypeThemeContextValue>({
  code: null,
  theme: null,
  typeName: "",
  englishName: "",
  emoji: "✦",
});

export function useArchetypeTheme() {
  return useContext(ArchetypeThemeContext);
}

interface Props {
  archetypeCode: ArchetypeCode | null;
  children: ReactNode;
}

export default function ArchetypeThemeProvider({ archetypeCode, children }: Props) {
  const contextValue = useMemo<ArchetypeThemeContextValue>(() => {
    if (!archetypeCode) {
      return { code: null, theme: null, typeName: "", englishName: "", emoji: "✦" };
    }
    const def = getArchetypeByCode(archetypeCode);
    const theme = getArchetypeTheme(archetypeCode);
    return {
      code: archetypeCode,
      theme,
      typeName: def?.name ?? "",
      englishName: def?.englishName ?? "",
      emoji: def?.emoji ?? "✦",
    };
  }, [archetypeCode]);

  // CSS Custom Properties をルートに適用 + ページ背景を変更
  useEffect(() => {
    if (!contextValue.theme) return;
    const vars = getCSSVariables(contextValue.theme);
    const root = document.documentElement;
    const keys = Object.keys(vars);

    // Set CSS variables
    for (const key of keys) {
      root.style.setProperty(key, vars[key]);
    }

    // Apply page-level background to body
    const prevBodyBg = document.body.style.background;
    document.body.style.background = `${contextValue.theme.palette.pageBg} !important`;

    // Apply to the stargazer shell's layer 0 (base gradient)
    const layer0 = document.querySelector<HTMLElement>(".stargazer-shell > .fixed.z-\\[0\\]");
    const prevLayer0Bg = layer0?.style.background ?? "";
    if (layer0) {
      const p = contextValue.theme.palette;
      layer0.style.background = `
        radial-gradient(ellipse 130% 70% at 50% 0%, ${p.nebulaColor} 0%, transparent 55%),
        radial-gradient(ellipse 80% 60% at 85% 15%, ${p.glow} 0%, transparent 50%),
        radial-gradient(ellipse 70% 50% at 10% 55%, ${p.nebulaColor} 0%, transparent 50%),
        linear-gradient(180deg, ${p.pageBg} 0%, ${p.pageBg} 100%)
      `;
    }

    // Apply to nebula glow blobs
    const nebulaBlobs = document.querySelectorAll<HTMLElement>(".sg-nebula-layer > div");
    const prevNebulaBgs: string[] = [];
    nebulaBlobs.forEach((blob, i) => {
      prevNebulaBgs[i] = blob.style.background;
      const p = contextValue.theme!.palette;
      if (i === 0) {
        blob.style.background = `radial-gradient(circle, ${p.nebulaColor} 0%, ${p.glow} 40%, transparent 70%)`;
      } else if (i === 1) {
        blob.style.background = `radial-gradient(circle, ${p.glow} 0%, transparent 70%)`;
      } else if (i === 2) {
        blob.style.background = `radial-gradient(circle, ${p.heroTint} 0%, transparent 70%)`;
      }
    });

    return () => {
      // Cleanup CSS variables
      for (const key of keys) {
        root.style.removeProperty(key);
      }
      // Restore body background
      document.body.style.background = prevBodyBg;
      // Restore layer 0
      if (layer0) layer0.style.background = prevLayer0Bg;
      // Restore nebula blobs
      nebulaBlobs.forEach((blob, i) => {
        blob.style.background = prevNebulaBgs[i] ?? "";
      });
    };
  }, [contextValue.theme]);

  return (
    <ArchetypeThemeContext.Provider value={contextValue}>
      {children}
    </ArchetypeThemeContext.Provider>
  );
}
