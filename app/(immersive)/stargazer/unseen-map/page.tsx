// app/stargazer/unseen-map/page.tsx
import type { Metadata } from "next";
import UnseenMapClient from "./UnseenMapClient";
import FeatureGateGuard from "../_shared/FeatureGateGuard";

export const metadata: Metadata = {
  title: "未知の地図 — Stargazer",
  description: "あなた自身という未踏の地図。霧を晴らし、自分の輪郭を浮かび上がらせる。",
};

export default function UnseenMapPage() {
  return (
    <FeatureGateGuard feature="unseen_map">
      <UnseenMapClient />
    </FeatureGateGuard>
  );
}
