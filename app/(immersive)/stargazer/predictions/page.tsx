// app/stargazer/predictions/page.tsx
// 予測履歴ページ — Server Component wrapper
import type { Metadata } from "next";
import PredictionsClient from "./PredictionsClient";

export const metadata: Metadata = {
  title: "予測履歴 | Stargazer",
  description: "過去の予測と的中率を確認する",
};

export default function PredictionsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-50">
      <PredictionsClient />
    </div>
  );
}
