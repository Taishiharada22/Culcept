// app/stargazer/values/page.tsx
// 価値観の発見 — Layer 5（サーバーコンポーネント）
import type { Metadata } from "next";
import ValuesClient from "./ValuesClient";

export const metadata: Metadata = {
  title: "価値観の発見 — Stargazer",
  description:
    "選択パターンから、あなたが無意識に優先している価値観を浮かび上がらせる。",
};

export default function ValuesPage() {
  return <ValuesClient />;
}
