/**
 * B-2 取込 source marker visual smoke — dev preview route（**強い gate**）
 *
 * gate（両方必須・default OFF）:
 *   ① PLAN_SHIFT_SOURCE_MARKER_VISUAL_SMOKE_PREVIEW === "true"（専用 flag・本番 flag と混ぜない）
 *   ② NODE_ENV !== "production"（production deny）
 *   → 欠ければ notFound()。production env では常に notFound（未設定 + production deny）。
 *
 * 用途: shift_image 由来の「取込」marker を合成 fixture で週/日/月 view 一括目視。
 * VLM / DB write / 保存 非接触。auth(proxy.ts) 配下（CEO 認証ブラウザ前提）・proxy.ts は触らない。
 */
import { notFound } from "next/navigation";

import { isSourceMarkerSmokeEnabled } from "./sourceMarkerSmokeGate";
import { DevSourceMarkerSmokeClient } from "./DevSourceMarkerSmokeClient";

export default function DevSourceMarkerSmokePage() {
  if (
    !isSourceMarkerSmokeEnabled({
      flag: process.env.PLAN_SHIFT_SOURCE_MARKER_VISUAL_SMOKE_PREVIEW,
      nodeEnv: process.env.NODE_ENV,
    })
  ) {
    notFound();
  }
  return <DevSourceMarkerSmokeClient />;
}
