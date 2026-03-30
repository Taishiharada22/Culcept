// app/stargazer/rhythm/page.tsx
// サーカディアンリズム分析 — 時間帯別の心理状態パターン
import type { Metadata } from "next";
import RhythmClient from "./RhythmClient";

export const metadata: Metadata = {
  title: "サーカディアンリズム — Stargazer",
  description: "あなたの時間帯別の心理状態パターンを可視化する。",
};

export default function RhythmPage() {
  return <RhythmClient />;
}
