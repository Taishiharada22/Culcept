// app/stargazer/oracle/page.tsx
// Decision Oracle — 選択の予測
import type { Metadata } from "next";
import OracleClient from "./OracleClient";

export const metadata: Metadata = {
  title: "選択の予測 — Stargazer",
  description:
    "あなたの決断パターンを予測し、もうひとりの選択と理想の選択を照らし出す。",
};

export default function OraclePage() {
  return <OracleClient />;
}
