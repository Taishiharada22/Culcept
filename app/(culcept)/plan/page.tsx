/**
 * /plan — Alter Plan View (W1-5 本実装)
 *
 * Server Component: feature flag + auth gate のみ。実 data fetch は client 側
 * （cookie auth + GET /api/plan/anchors の RLS-aware path）。
 *
 * 設計書: docs/alter-plan-w15-ui-mini-design.md
 *
 * Flow:
 *   1. PLAN_FLAGS.planRouteLive === false → notFound（本番 default）
 *   2. auth 未認証 → /login?next=/plan
 *   3. anonymous user → AnonymousRegistrationPage で誘導
 *   4. それ以外 → PlanClient（client root）に委譲
 *
 * 表示制御 props は `buildPlanClientFeatureProps()`（planClientFeatureProps.ts）に集約し、
 * Home swipe pane（app/(culcept)/page.tsx）と同一 source of truth を共有する（HOME-SWIPE-PLAN-PARITY・2026-06-25）。
 * 本 route は displayMode="route" のみ指定が異なる。
 *
 * 範囲外:
 *   - Home / MAIN_NAV 変更
 *   - baseline 強制（Alter Plan は baseline 不要、固定予定は baseline 前にも持ちうる）
 *   - DraftPlan generator
 *   - W1-6 passive drift logging
 *   - W1-8 Home 導線
 */

import { notFound, redirect } from "next/navigation";

import { supabaseServer } from "@/lib/supabase/server";
import { PLAN_FLAGS } from "@/lib/plan/featureFlags";
import AnonymousRegistrationPage from "@/components/auth/AnonymousRegistrationPage";

import PlanClient from "./PlanClient";
import { buildPlanClientFeatureProps } from "./planClientFeatureProps";

export const dynamic = "force-dynamic";

export default async function PlanPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  // 1. Feature flag gate (W1-2 から継承)
  if (!PLAN_FLAGS.planRouteLive) {
    notFound();
  }

  // 2. Auth gate (W1-5 で追加)
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();

  if (!auth?.user) {
    redirect("/login?next=/plan");
  }

  if (auth.user.is_anonymous) {
    return <AnonymousRegistrationPage featureName="Plan" />;
  }

  // 3. 表示制御 props（route / pane 共有 source of truth）。displayMode のみ route 固有。
  const sp = await searchParams;
  const featureProps = await buildPlanClientFeatureProps(supabase, auth.user.id, sp);

  return <PlanClient displayMode="route" {...featureProps} />;
}
