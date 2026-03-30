// app/stargazer/transform/page.tsx
// Layer 6: 変容の可能性 — サーバーコンポーネント
import type { Metadata } from "next";
import TransformClient from "./TransformClient";

export const metadata: Metadata = {
  title: "変容の可能性 — Stargazer",
  description:
    "「変わりたい」という意図を観測し、変容の可能性を探索する。",
};

export default function TransformPage() {
  return <TransformClient />;
}
