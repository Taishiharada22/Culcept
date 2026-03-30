// app/stargazer/signature/page.tsx
// Psyche Signature — 心の指紋
import type { Metadata } from "next";
import SignatureClient from "./SignatureClient";
import FeatureGateGuard from "../_shared/FeatureGateGuard";

export const metadata: Metadata = {
  title: "心の指紋 — Stargazer",
  description:
    "あなたの心理的指紋を視覚化し、共有する。",
};

export default function SignaturePage() {
  return (
    <FeatureGateGuard feature="psyche_signature">
      <SignatureClient />
    </FeatureGateGuard>
  );
}
