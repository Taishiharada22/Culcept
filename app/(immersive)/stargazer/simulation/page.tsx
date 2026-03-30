// app/stargazer/simulation/page.tsx
import type { Metadata } from "next";
import SimulationClient from "./SimulationClient";

export const metadata: Metadata = {
  title: "変容シミュレーション — Stargazer",
  description: "もし自分が変わったら。その可能性を体験する。",
};

export default function SimulationPage() {
  return <SimulationClient />;
}
