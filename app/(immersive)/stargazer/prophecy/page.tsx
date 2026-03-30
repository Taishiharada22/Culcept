// app/stargazer/prophecy/page.tsx
// Stargazer Daily Prophecy — 今日の予言
import type { Metadata } from "next";
import ProphecyClient from "./ProphecyClient";
import FeatureGateGuard from "../_shared/FeatureGateGuard";

export const metadata: Metadata = {
  title: "今日の予言 — Stargazer",
  description:
    "毎朝、Stargazer があなたの行動を1つ予測する。夜に検証し、自己理解を深める。",
};

export default function ProphecyPage() {
  return (
    <FeatureGateGuard feature="prophecy">
      <ProphecyClient />
    </FeatureGateGuard>
  );
}
