// lib/aneurasync/dimensions.ts
// Stub: personality dimension types for the Aneurasync system

export type DimensionCategory =
  | "aesthetic"
  | "behavioral"
  | "cognitive"
  | "emotional"
  | "social"
  | string;

export type DimensionScore = {
  dimension: string;
  category: DimensionCategory;
  score: number;
  confidence: number;
  evidenceCount: number;
};
