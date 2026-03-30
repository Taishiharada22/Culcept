// app/stargazer/dreams/page.tsx
// 夢日記 — 夢の中のシンボルから無意識のメッセージを読み解く
import type { Metadata } from "next";
import DreamsClient from "./DreamsClient";

export const metadata: Metadata = {
  title: "夢日記 — Stargazer",
  description: "夢の中のシンボルから、無意識のメッセージを読み解く。",
};

export default function DreamsPage() {
  return <DreamsClient />;
}
