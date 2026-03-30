// app/stargazer/flexibility/page.tsx
// 心理的柔軟性ページ — ACT Hexaflex サーバーコンポーネント

import type { Metadata } from "next";
import FlexibilityClient from "./FlexibilityClient";

export const metadata: Metadata = {
  title: "心理的柔軟性 — Stargazer",
  description:
    "ACT Hexaflexに基づく6つの心理的柔軟性プロセスを観測する。",
};

export default function FlexibilityPage() {
  return <FlexibilityClient />;
}
