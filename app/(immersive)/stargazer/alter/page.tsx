// app/stargazer/alter/page.tsx
import type { Metadata } from "next";
import AlterClient from "./AlterClient";
import FeatureGateGuard from "../_shared/FeatureGateGuard";

export const metadata: Metadata = {
  title: "もうひとりの自分 — Stargazer",
  description: "もうひとりの自分との対話。あなたが見ないふりをしている、もうひとりのあなたと話す。",
};

export default function AlterPage() {
  return (
    <FeatureGateGuard feature="alter_dialogue">
      <AlterClient />
    </FeatureGateGuard>
  );
}
