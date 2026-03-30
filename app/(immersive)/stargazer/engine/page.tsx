// app/(immersive)/stargazer/engine/page.tsx
// 今日の自分 — Human OS Layer 3 最小UI
import type { Metadata } from "next";
import EngineClient from "./EngineClient";

export const metadata: Metadata = {
  title: "今日の自分 — Stargazer",
  description:
    "判断エンジン・Self vs Oracle・日々の介入。あなたの深層から、今日を生きるヒントを。",
};

export default function EnginePage() {
  return <EngineClient />;
}
