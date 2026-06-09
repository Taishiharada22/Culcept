"use client";
/**
 * Life Ops L-8b — dev preview（**世界観確認用・fixture・nav 非登録・本番導線でない**）
 *
 * 設計: docs/life-ops-l8-ui-mini-design.md §6
 * 役割: 縦パイプライン（collector → presenter）の **注入 fixture** を LifeOpsCardList で描画し、preview/世界観を確認する。
 *   **実データ非接続**（固定 fixture）・本配置（Home/横R2 への組込み）は別。Date.now 不使用（固定 now）。
 */

import { collectLifeOpsCandidates, type LifeOpsInputs } from "@/lib/lifeops/candidate-collector";
import { toLifeOpsCardViewModels } from "@/lib/lifeops/card-presenter";
import { LifeOpsCardList } from "@/components/lifeops/LifeOpsCardList";

const NOW = "2026-06-12T00:00:00Z";

// 現実的な週次スナップショット（lifeOpsIntegration.test.ts と同型・固定 fixture）
const FIXTURE: LifeOpsInputs = {
  cadenceObservations: [
    { categoryId: "beauty_salon", menu: "cut", lastCompletedAtISO: "2026-05-08" }, // nearing → イベント前倒し
    { categoryId: "beauty_salon", menu: "color", lastCompletedAtISO: "2026-04-10" }, // beyond → 周期
    { categoryId: "groceries", lastCompletedAtISO: "2026-06-07" }, // beyond → 周期
  ],
  upcomingEvents: [
    { kind: "interview", startISO: "2026-06-17" },
    { kind: "trip", startISO: "2026-06-15" },
  ],
  deadlineObservations: [
    { categoryId: "license_renewal", deadlineISO: "2026-07-05" }, // within_lead
    { categoryId: "tax_filing", deadlineISO: "2026-06-05" }, // overdue
  ],
};

const ITEMS = toLifeOpsCardViewModels(collectLifeOpsCandidates(FIXTURE, NOW));

export default function LifeOpsPreviewPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50 px-5 py-10">
      <div className="mx-auto max-w-md">
        <p className="text-xs font-medium tracking-wide text-slate-400">PREVIEW · 世界観確認用</p>
        <h1 className="mt-1 text-xl font-semibold text-slate-900">今日、整えておくと自然なこと</h1>
        <p className="mt-1.5 text-sm text-slate-500">あなたの予定と周期から、先回りして見つけました。</p>
        <div className="mt-6">
          <LifeOpsCardList items={ITEMS} />
        </div>
      </div>
    </main>
  );
}
