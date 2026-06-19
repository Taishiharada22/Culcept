/**
 * /plan/dev-alter-tab — Session B Alter Tab UI mock preview（dev/staging 限定・mock のみ・保存なし）
 *
 * 正本: docs/handoff-session-b-ui.md「Preview 方法」/ docs/alter-tab-visual-contract.md
 *
 * 三重ガード（dev preview 共通規約・NODE_ENV に頼らない。dev-reality-pipeline と同じ helper / env 変数を共有）:
 *   ① REALITY_CANDIDATE_ACTIONS_DEV_HOST === "true"（明示 opt-in・既定 false で dormant）
 *   ② supabase URL が staging ref を含む（allowlist）
 *   ③ supabase URL が production ref を含まない（deny）
 *   → 欠ければ notFound()。production env では未設定のため構造的に不可視。
 *
 * 厳守:
 *  - mock ViewModel のみ render（fetch / Supabase / localStorage / featureFlags 接続なし・保存なし）
 *  - どこからもリンクしない（variant 切替の自己リンクのみ）
 *  - PlanClient / グローバルナビ / 他タブに不接触
 */

import { notFound } from "next/navigation";
import { isCandidateActionsPreviewHostAllowed } from "@/lib/plan/reality/candidateActionsPreviewHost";
import { PLAN_FLAGS } from "@/lib/plan/featureFlags";
import { supabaseServer } from "@/lib/supabase/server";
import { createSupabaseExternalAnchorRepository } from "@/lib/plan/external-anchor-repository-supabase";
import { buildOperatorDayRealPayload, realDayPayloadLeakViolations } from "@/lib/plan/realityCore/operatorDayPreview";
import { makeRealityInstantJst } from "@/lib/plan/realityCore/realityInstant";
import { createSupabaseOperatorDurationSeedReader, type DurationConfirmationReadClient } from "@/lib/plan/reality/integration/duration-confirmation-source";
import { AlterDevSafeStatus } from "./AlterDevSafeStatus";
import { AlterTabBody } from "../components/alter/AlterTabBody";
import { buildScreenViewModel, jstNowMinutes } from "../components/alter/screenViewModel";
import overPng from "../components/alter/assets/over.png";
import {
  MOCK_ALTER_BATTERY_VM,
  MOCK_VM_ANSWERED,
  MOCK_VM_CARRIED_OVER,
  MOCK_VM_COLD_START,
  MOCK_VM_NIGHT_FOLLOWUP,
  MOCK_VM_NIGHT_MAIN,
  MOCK_VM_UNKNOWN_BRAIN,
  MOCK_VM_VISUAL,
} from "../components/alter/__mocks__/alterBatteryViewModel.mock";

export const dynamic = "force-dynamic";

const VARIANTS = {
  morning: { vm: MOCK_ALTER_BATTERY_VM, label: "朝（Reveal あり）" },
  visual: { vm: MOCK_VM_VISUAL, label: "理想比較（検証用）" },
  night: { vm: MOCK_VM_NIGHT_MAIN, label: "夜（Night Check 主問）" },
  followup: { vm: MOCK_VM_NIGHT_FOLLOWUP, label: "夜（followup）" },
  answered: { vm: MOCK_VM_ANSWERED, label: "夜（回答済み）" },
  carried: { vm: MOCK_VM_CARRIED_OVER, label: "朝（繰り越し）" },
  unknown: { vm: MOCK_VM_UNKNOWN_BRAIN, label: "脳 unknown" },
  coldstart: { vm: MOCK_VM_COLD_START, label: "コールドスタート" },
} as const;

type VariantKey = keyof typeof VARIANTS;

export default async function DevAlterTabPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // 三重ガード（明示 flag + staging allowlist + production deny）
  if (
    !isCandidateActionsPreviewHostAllowed({
      hostMode: process.env.REALITY_CANDIDATE_ACTIONS_DEV_HOST,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL,
    })
  ) {
    notFound();
  }

  // RD3x-P6: Alter dev-only safe boolean status（**flag-gated・operator-only・default OFF・production OFF**）。
  //   OFF（本番デフォルト）→ status band 非 render（既存 mock preview 完全不変・byte 同一）。ON → operator real payload の
  //   **safe DTO（leaveByComputedPresent）だけ**読む。internal object/ref/exact instant は読まない（payload に無い）。
  //   read-only・DB write/localStorage/notification/action なし。MovementReality/Feasibility/Risk/Permission は不変（読むだけ）。
  let showSafeStatus = false;
  let leaveByComputedPresent = false;
  if (PLAN_FLAGS.realityOperatorPreviewLeaveBy) {
    try {
      const supabase = await supabaseServer();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const anchorRepo = createSupabaseExternalAnchorRepository(supabase);
        const refUtc = new Date();
        const subjectiveDate = makeRealityInstantJst(refUtc).subjectiveDate;
        const seedReader = createSupabaseOperatorDurationSeedReader(supabase as unknown as DurationConfirmationReadClient);
        const rp = await buildOperatorDayRealPayload(
          { operatorUserId: user.id, referenceInstantUtc: refUtc },
          {
            listAnchors: (uid) => anchorRepo.listAnchors(uid),
            listDurationConfirmations: (uid) => seedReader.listActiveByOwnerForDate(uid, subjectiveDate),
          },
        );
        // page 側 leak guard（fail-closed）。leak 検出時は status を出さない（safe boolean のみ取り出す）。
        if (realDayPayloadLeakViolations(rp).length === 0) {
          showSafeStatus = true;
          leaveByComputedPresent = rp.leaveByComputedPresent;
        }
      }
    } catch {
      showSafeStatus = false; // read/auth 失敗は非表示（mock preview は継続）
    }
  }

  const sp = await searchParams;
  const requested = typeof sp.v === "string" ? sp.v : "morning";
  const variantKey: VariantKey = requested in VARIANTS ? (requested as VariantKey) : "morning";
  const variant = VARIANTS[variantKey];
  // 位置合わせ用 overlay（dev 専用・一時利用）: ?overlay=0.5&oy=-120
  const overlayOpacity = typeof sp.overlay === "string" ? Math.min(Math.max(parseFloat(sp.overlay) || 0, 0), 1) : 0;
  const overlayY = typeof sp.oy === "string" ? parseInt(sp.oy, 10) || 0 : 0;

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-indigo-50/60 via-white to-purple-50/40">
      {/* RD3x-P6: Alter dev-only safe boolean status（flag ON ∧ operator ∧ leak 0 のときのみ・schema-state boolean のみ） */}
      {showSafeStatus && <AlterDevSafeStatus present={leaveByComputedPresent} />}

      {/* dev 専用 variant 切替バー（製品 UI ではない） */}
      <div className="border-b border-amber-200 bg-amber-50 px-3 py-2">
        <p className="text-[10px] font-medium text-amber-700">
          dev preview（mock のみ・保存なし）— variant: {variant.label}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {(Object.keys(VARIANTS) as VariantKey[]).map((key) => (
            <a
              key={key}
              href={`/plan/dev-alter-tab?v=${key}`}
              className={`rounded-full border px-2 py-0.5 text-[10px] ${
                key === variantKey
                  ? "border-amber-400 bg-amber-100 font-semibold text-amber-800"
                  : "border-amber-200 bg-white text-amber-600"
              }`}
            >
              {VARIANTS[key].label}
            </a>
          ))}
        </div>
      </div>

      {/* B13: チャット欄廃止 / B14: now マーカーは日本時間（force-dynamic で都度評価） */}
      <AlterTabBody screen={buildScreenViewModel(variant.vm, { nowMinJst: jstNowMinutes(new Date()) })} />

      {/* over.png 半透明 overlay（dev 位置合わせ専用。本番背景貼りではない） */}
      {overlayOpacity > 0 && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={overPng.src}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 z-[100] w-[390px] max-w-none -translate-x-1/2"
          style={{ top: overlayY, opacity: overlayOpacity }}
        />
      )}
    </div>
  );
}
