/**
 * Plan Page (Wave 1 / W1-2 — shell skeleton)
 *
 * Plan route の server entry point。feature flag で表示制御する。
 *   PLAN_FLAGS.planRouteLive = false → notFound()（本番デフォルト）
 *   PLAN_FLAGS.planRouteLive = true  → PlanShell を描画
 *
 * 含めない（W1-2 範囲外）:
 *   - 実データ取得（API / DB / Supabase）
 *   - auth / redirect（W1-4 以降）
 *   - Home 接続 / 横スワイプ（W1-8）
 *   - Map SDK
 *   - コーデカレンダー統合（lib/shared/wearEvents 等）
 *
 * 設計書: docs/alter-plan-foundation-design.md §8, §9.2 (W1-2)
 */

import { notFound } from "next/navigation";
import { PLAN_FLAGS } from "@/lib/plan/featureFlags";
import { PlanShell } from "./PlanShell";

export const dynamic = "force-dynamic";

export default function PlanPage() {
  if (!PLAN_FLAGS.planRouteLive) {
    notFound();
  }

  return <PlanShell />;
}
