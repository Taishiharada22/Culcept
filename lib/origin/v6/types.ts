// lib/origin/v6/types.ts
// Life Map v6 — Japan-map-based life roadmap type system
//
// Core concept: life chapters are placed on a Japan map.
// A main road connects them. Theme branches grow from each chapter.

/* ─── Themes (branch categories) ─── */

export const THEMES = [
  "emotion",
  "relationship",
  "work",
  "challenge",
  "self",
  "direction",
  "romance",
  "learning",
] as const;
export type ThemeType = (typeof THEMES)[number];

export const THEME_META: Record<
  ThemeType,
  { label: string; icon: string; color: string; colorLight: string }
> = {
  emotion:      { label: "感情",     icon: "💭", color: "#C08050", colorLight: "#F0D8B8" },
  relationship: { label: "人間関係", icon: "🤝", color: "#5A8AA0", colorLight: "#A0CCE0" },
  work:         { label: "仕事・学業", icon: "🔑", color: "#5A8A5A", colorLight: "#A0C8A0" },
  challenge:    { label: "挑戦",     icon: "🔥", color: "#B06050", colorLight: "#E0A090" },
  self:         { label: "自己認識", icon: "🪞", color: "#806090", colorLight: "#C0A0D0" },
  direction:    { label: "方向性",   icon: "🧭", color: "#A09040", colorLight: "#D8C880" },
  romance:      { label: "恋愛",     icon: "💕", color: "#C06080", colorLight: "#E8A0B8" },
  learning:     { label: "学び",     icon: "📖", color: "#4080A0", colorLight: "#90B8D0" },
};

/* ─── Chapter definition ─── */

export type ChapterDef = {
  id: string;
  label: string;
  icon: string;
  ageHint: string;
  order: number;
  /** Position on the Japan map (SVG coordinates, 0-1000 range) */
  mapX: number;
  mapY: number;
};

/* ─── Chapter status ─── */

export type ChapterStatus = "locked" | "available" | "in_progress" | "complete";

/* ─── Branch answer ─── */

export type BranchAnswer = {
  questionId: string;
  selectedOptionId: string;
  selectedLabel: string;
  depth: number;
  answeredAt: string;
};

/* ─── Sub-node on a branch (generated from answers) ─── */

export type BranchNode = {
  id: string;
  label: string;
  icon: string;
  depth: number;
};

/* ─── Per-chapter progress (persisted) ─── */

export type ChapterProgress = {
  status: ChapterStatus;
  branches: Partial<Record<ThemeType, BranchAnswer[]>>;
};

/* ─── Full save data ─── */

export type RoadmapSave = {
  version: 6;
  chapters: Record<string, ChapterProgress>;
  originChapterId: string;
  createdAt: string;
  updatedAt: string;
};
