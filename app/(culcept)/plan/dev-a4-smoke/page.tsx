/**
 * SR A4 visual smoke — dev preview route（**auth 回避のため強い gate**）
 *
 * gate（両方必須・default OFF）:
 *   ① PLAN_SHIFT_A4_VISUAL_SMOKE_PREVIEW === "true"（専用 flag・本番 flag と混ぜない）
 *   ② NODE_ENV !== "production"（production deny）
 *   → 欠ければ notFound()。production env では常に notFound（未設定 + production deny）。
 *
 * 用途: A4-3 の warning/cell amber を合成 fixture で実ブラウザ確認（V-2 Playwright）。VLM/保存/DB 非接触。
 */
import { notFound } from "next/navigation";

import { isA4SmokePreviewEnabled } from "./a4SmokeGate";
import { DevA4SmokeClient } from "./DevA4SmokeClient";

export default function DevA4SmokePage() {
  if (
    !isA4SmokePreviewEnabled({
      flag: process.env.PLAN_SHIFT_A4_VISUAL_SMOKE_PREVIEW,
      nodeEnv: process.env.NODE_ENV,
    })
  ) {
    notFound();
  }
  return <DevA4SmokeClient />;
}
