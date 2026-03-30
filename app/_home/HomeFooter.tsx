"use client";

import Link from "next/link";
import { C } from "./constants";

/**
 * HomeFooter — 法的リンクのみ。
 * ナビゲーションドックは BottomNav（固定下部）に一本化済み。
 * 二重ナビ防止のため、ここにはドックを置かない。
 */
export default function HomeFooter() {
  return (
    <footer style={{ padding: "20px 16px 32px", textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "center", gap: 16, flexWrap: "wrap" }}>
        <Link href="/legal/terms" style={{ fontSize: 11, color: C.t4, textDecoration: "none" }}>利用規約</Link>
        <Link href="/legal/privacy" style={{ fontSize: 11, color: C.t4, textDecoration: "none" }}>プライバシーポリシー</Link>
        <Link href="/legal/commercial" style={{ fontSize: 11, color: C.t4, textDecoration: "none" }}>特定商取引法に基づく表記</Link>
      </div>
      <p style={{ marginTop: 6, fontSize: 11, color: C.t4 }}>&copy; 2026 Aneurasync</p>
    </footer>
  );
}
