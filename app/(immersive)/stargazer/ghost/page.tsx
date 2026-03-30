// app/stargazer/ghost/page.tsx
// Ghost Resonance — 似た星の共鳴
import type { Metadata } from "next";
import GhostClient from "./GhostClient";
import FeatureGateGuard from "../_shared/FeatureGateGuard";

export const metadata: Metadata = {
  title: "似た星の共鳴 — Stargazer",
  description:
    "あなたと同じパターンを持つ匿名の誰かの存在を感じる。",
};

export default function GhostPage() {
  return (
    <FeatureGateGuard feature="ghost_resonance">
      <GhostClient />
    </FeatureGateGuard>
  );
}
