// lib/origin/lifeTypes.ts
// Shared types for Origin features

export type OriginRootScene = {
  id: string;
  label: string;
  period: string;
  description: string | null;
  createdAt: string;
};

export type OriginInfluence = {
  id: string;
  label: string;
  type: "person" | "event" | "place" | "idea" | "media";
  impact: number; // 1-5
  note: string | null;
  createdAt: string;
};
