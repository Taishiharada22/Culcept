// app/stargazer/page.tsx
// Stargazer — Aneurasync の新しい主体験
import type { Metadata } from "next";
import { Suspense } from "react";
import StargazerHome from "./StargazerHome";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Stargazer — あなたの星を観測する",
  description: "人は、星です。Stargazerは、あなたの性格を深層から観測します。答えではなく、揺らぎまで読む。",
};

export default function StargazerPage() {
  return (
    <Suspense>
      <StargazerHome />
    </Suspense>
  );
}
