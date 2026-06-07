"use client";
/**
 * /plan/dev-reflected-item — A1-6-12（#3）reflected consumed item の **MorningPlanCard 描画検証** preview
 *   （dev/staging 限定・render-only・real route/DB 不使用・fixture のみ）
 *
 * 目的: consumed seed → reflected `PlanItem`（A1-6-7 + A1-6-12 sharpness）が **実 `MorningPlanCard`** で
 *   generic label を**捨てず**自然に描画されることを目視/screenshot 検証する。
 *   既存の candidate preview（§9.14/§9.15）は簡易 `<li>` render で MorningPlanCard を通さないため
 *   「13:00 午後の予定（60分）」に見えるが、live card は slot モデルで描画する＝本 preview で live 相当を確認。
 *
 * 検証点: reflected 行が「午後の予定（60分）」を表示するか（旧: sharpness 未設定→`[時間未確定] [内容暫定]`＝label 破棄）。
 * **製品の入口ではない**（一般非公開・Home 非経由）。
 */

import MorningPlanCard from "@/components/home/morning/MorningPlanCard";
import { consumedSeedToMorningPlanItem } from "@/lib/plan/reality/consumed-seed-morning-reflection";
import type { MorningPlan, PlanItem, DayConditions } from "@/lib/alter-morning/types";

const PREVIEW_DATE = "2026-06-15";

function buildPlan(): MorningPlan {
  // REAL reflection helper（A1-6-7 + A1-6-12 sharpness）で reflected item を生成。
  const reflected = consumedSeedToMorningPlanItem({
    handle: "c1:" + "1".repeat(64),
    status: "consumed",
    durationMin: 60,
    date: PREVIEW_DATE,
    band: "afternoon",
    actionShape: null,
  });
  // 比較用の通常 fixed item（sharp 時刻/内容）。
  const fixed: PlanItem = {
    id: "fixed-1",
    kind: "fixed",
    text: "ミーティング",
    what: "ミーティング",
    startTime: "10:00",
    durationMin: 60,
    durationSource: "user",
    fixedStart: true,
    whenSharpness: "fixed",
    whatSharpness: "fixed",
    whereSharpness: "missing",
    confirmationState: "confirmed",
    orderHint: 0,
    sourceTurnIndex: 0,
    completed: false,
  };
  const items: PlanItem[] = reflected ? [fixed, reflected] : [fixed];
  return {
    date: PREVIEW_DATE,
    items,
    dayConditions: {} as DayConditions,
    createdAt: `${PREVIEW_DATE}T00:00:00Z`,
    confirmed: false,
  };
}

export function ReflectedItemPreviewClient() {
  const plan = buildPlan();
  return (
    <div className="mx-auto max-w-md px-4 py-6 text-gray-800">
      <h1 className="text-lg font-bold">Reflected Item — MorningPlanCard 描画検証</h1>
      <p className="mt-1 text-[12px] text-gray-500">
        A1-6-12（#3）・dev/staging 限定・<b>render-only</b>。consumed seed → reflected item（<b>実 reflection helper</b>）を
        <b>実 MorningPlanCard</b> で描画。reflected 行が「午後の予定（60分）」を<b>捨てず</b>表示するか確認
        （旧: sharpness 未設定→ <code>[時間未確定] [内容暫定]</code>）。
      </p>
      <div className="mt-4" data-testid="reflected-item-card">
        <MorningPlanCard plan={plan} onConfirm={() => {}} onRequestChange={() => {}} />
      </div>
    </div>
  );
}
