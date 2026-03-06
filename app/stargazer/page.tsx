// app/stargazer/page.tsx
// Stargazer — Aneurasync の新しい主体験
import type { Metadata } from "next";
import StargazerHome from "./StargazerHome";

export const metadata: Metadata = {
  title: "Stargazer — あなたの星を観測する",
  description: "人は、星です。Stargazerは、あなたの光を観測します。答えではなく、揺らぎまで読む。",
};

export default function StargazerPage() {
  return <StargazerHome />;
}
