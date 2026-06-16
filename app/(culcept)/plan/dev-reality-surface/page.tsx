/**
 * /plan/dev-reality-surface — RJ2g Internal Dogfood Preview
 *   （**operator-only / dev-preview / read-only / pull / no-notification / no-production**）
 *
 * 設計: docs/reality-surface-dogfood-preview-boundary-rj2g-0.md（RJ2g-0）/ CEO RJ2g 実装 GO（2026-06-14）
 *
 * 目的: RJ2 chain（RJ2a–2f）の出力（consumer view / copy / delivery 可否）を operator が **観測するだけ** の read-only 面。
 *   **plan を書き換えない・通知しない・apply しない・配信しない（deliveredNow=false）・user-facing でない**。
 *
 * 三重ガード（既存 dev-preview 共通・dev-reality-pipeline と同型）:
 *   ① host 三重ガード（REALITY_CANDIDATE_ACTIONS_DEV_HOST + staging ref + production deny）→ notFound（production 構造的不可視）
 *   ② flag REALITY_SURFACE_PREVIEW（server default OFF・NEXT_PUBLIC なし）→ OFF なら chain 非実行
 *   ③ operator auth（owner-RLS・service_role 不使用）→ 非 operator は chain 非実行
 *
 * 厳守:
 *   - client には **safe payload（RealitySurfaceDogfoodPreviewPayloadV0）のみ**渡す（internal object/trace/id 不渡し）。
 *   - **read-only**（v0 は DB read なし・代表シナリオ pure・write/seed/apply/notification なし）。
 *   - **token leak guard**（fail-closed・leak 検出 or 0 件で Disabled）。**deliveredNow=false 維持**。
 *   - disabled path（flag OFF / host NG / 非 operator）は **chain を一切走らせない**（client を render しない）。
 */

import { notFound } from "next/navigation";
import { isCandidateActionsPreviewHostAllowed } from "@/lib/plan/reality/candidateActionsPreviewHost";
import { PLAN_FLAGS } from "@/lib/plan/featureFlags";
import { supabaseServer } from "@/lib/supabase/server";
import { createSupabaseExternalAnchorRepository } from "@/lib/plan/external-anchor-repository-supabase";
import { buildDogfoodPreviewScenarios, dogfoodPayloadLeakViolations } from "@/lib/plan/realityCore/dogfoodPreview";
import { buildOperatorDayRealPayload, realDayPayloadLeakViolations, type RealDaySurfacePayloadV0 } from "@/lib/plan/realityCore/operatorDayPreview";
import { makeRealityInstantJst } from "@/lib/plan/realityCore/realityInstant";
import { createSupabaseOperatorDurationSeedReader, type DurationConfirmationReadClient } from "@/lib/plan/reality/integration/duration-confirmation-source";
import { RealitySurfaceDogfoodClient } from "./RealitySurfaceDogfoodClient";

export const dynamic = "force-dynamic";

function Disabled({ reason }: { reason: string }) {
  return (
    <div className="mx-auto max-w-md px-4 py-6 text-gray-600" data-testid="reality-surface-disabled">
      <h1 className="text-lg font-bold">Reality Surface dogfood（operator-only・read-only）</h1>
      <p className="mt-2 text-[12px] text-gray-500">{reason}</p>
    </div>
  );
}

export default async function DevRealitySurfacePage() {
  // ① host 三重ガード → notFound（production 構造的不可視）。
  if (
    !isCandidateActionsPreviewHostAllowed({
      hostMode: process.env.REALITY_CANDIDATE_ACTIONS_DEV_HOST,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL,
    })
  ) {
    notFound();
  }

  // ② flag（server default OFF・NEXT_PUBLIC なし）→ OFF なら chain 非実行。
  if (!PLAN_FLAGS.realitySurfacePreview) {
    return <Disabled reason="REALITY_SURFACE_PREVIEW=OFF（観測しません）。" />;
  }

  // ③ operator auth（owner-RLS・service_role 不使用）→ 非 operator は chain 非実行。
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return <Disabled reason="operator 未ログイン（観測しません）。" />;
  }

  // ── 代表シナリオ（pure・**DB read なし**・read-only）。reference instant は constant（決定論的）──
  let payload;
  try {
    payload = await buildDogfoodPreviewScenarios(new Date(Date.UTC(2026, 5, 12, 0, 0)));
  } catch {
    return <Disabled reason="preview 入力なし（観測しません）。" />;
  }

  // token leak guard（fail-closed）+ data なしは何も出さない。
  if (payload.scenarios.length === 0 || dogfoodPayloadLeakViolations(payload).length > 0) {
    return <Disabled reason="preview 利用不可（leak guard / no data）。" />;
  }

  // ── RD1a: operator 当日 one-off の real-data section（read-only・listAnchors select のみ・recurring 除外・fallback なし）──
  // listAnchors は注入（owner-RLS・service_role 不使用）。referenceInstant は server now（JST v0）。
  const anchorRepo = createSupabaseExternalAnchorRepository(supabase);
  // RD3x-ACTIVATE-1: operator preview real read 注入（**flag-gated・operator preview path のみ・owner-RLS の user-session
  //   client・service_role 不使用**）。OFF（本番デフォルト）→ 注入せず leaveByComputedPresent=false（read もしない）。
  //   reader は raw row/durationValue/exact timestamp を client に出さない（buildOperatorDayRealPayload が safe boolean に潰す）。
  const refUtc = new Date();
  const subjectiveDate = makeRealityInstantJst(refUtc).subjectiveDate;
  // supabase client（user-session・RLS）を structural read client として渡す（深い型展開[TS2589]回避の cast・service_role でない）。
  const seedReader = createSupabaseOperatorDurationSeedReader(supabase as unknown as DurationConfirmationReadClient);
  let realPayload: RealDaySurfacePayloadV0 | null = await buildOperatorDayRealPayload(
    { operatorUserId: user.id, referenceInstantUtc: refUtc },
    PLAN_FLAGS.realityOperatorPreviewLeaveBy
      ? {
          listAnchors: (uid) => anchorRepo.listAnchors(uid),
          listDurationConfirmations: (uid) => seedReader.listActiveByOwnerForDate(uid, subjectiveDate),
        }
      : { listAnchors: (uid) => anchorRepo.listAnchors(uid) },
  );
  // page 側でも leak guard（fail-closed・defense in depth）。leak 検出時は real section を出さない（fixture へ fallback しない）。
  if (realDayPayloadLeakViolations(realPayload).length > 0) {
    realPayload = null;
  }

  // client には safe payload のみ（internal object を渡さない）。fixture と real は client で明確に分離表示。
  return <RealitySurfaceDogfoodClient payload={payload} realPayload={realPayload} />;
}
