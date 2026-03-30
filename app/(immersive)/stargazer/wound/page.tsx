// app/stargazer/wound/page.tsx
// 苦しみの構造ページ — Layer 4: なぜ同じパターンを繰り返すのか
import type { Metadata } from "next";
import WoundClient from "./WoundClient";

export const metadata: Metadata = {
  title: "苦しみの構造 — Stargazer",
  description: "なぜ同じパターンを繰り返すのか。傷の構造を観測する。",
};

export default function WoundPage() {
  return <WoundClient />;
}
