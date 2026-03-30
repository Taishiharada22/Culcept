// app/stargazer/blind-spot/page.tsx
// Blind Spot Drop — 見えない自分（サーバーコンポーネント）
import type { Metadata } from "next";
import BlindSpotClient from "./BlindSpotClient";
import FeatureGateGuard from "../_shared/FeatureGateGuard";

export const metadata: Metadata = {
  title: "見えない自分 — Stargazer",
  description:
    "毎日ひとつ、あなたが自分自身から隠しているものを言葉にして届ける。",
};

export default function BlindSpotPage() {
  return (
    <FeatureGateGuard feature="blind_spot">
      <BlindSpotClient />
    </FeatureGateGuard>
  );
}
