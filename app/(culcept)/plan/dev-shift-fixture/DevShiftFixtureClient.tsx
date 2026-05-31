"use client";

/**
 * DevShiftFixtureClient — fixture host の client wrapper（SR E2a）
 *
 * ShiftImportModal を fixture cells で mount し、保存成功時に /plan へ遷移する。
 * /plan が mount で anchors + dayIndicators を refetch → 勤務 anchor + 休みバッジが表示される。
 *
 * **製品本流入口ではない**（dev/staging 限定 host の UI）。
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

import { ShiftImportModal } from "../components/ShiftImportModal";
import type { ShiftReviewCell } from "@/lib/plan/shift/shiftReviewClassification";

export function DevShiftFixtureClient({
  year,
  month,
  cells,
  saveEnabled,
}: {
  year: number;
  month: number;
  cells: ShiftReviewCell[];
  saveEnabled: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(true);

  return (
    <div
      data-testid="dev-shift-fixture-host"
      className="min-h-screen bg-slate-50 p-4"
    >
      <div className="mx-auto max-w-md">
        <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
          ⚠ staging/dev 限定の <b>fixture 検証 host</b> です（製品の取り込み入口ではありません）。
          fixture cells で「保存 → /plan 表示」の決定論ループを確認します。
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          data-testid="dev-shift-fixture-open"
          className="mb-3 rounded-lg bg-sky-500 px-3 py-1.5 text-sm text-white"
        >
          fixture を開く
        </button>

        <ShiftImportModal
          open={open}
          year={year}
          month={month}
          cells={cells}
          source={{ originalFilename: "dev-fixture" }}
          saveEnabled={saveEnabled}
          onSuccess={() => {
            // 保存成功 → /plan へ（mount で anchors + dayIndicators refetch → 休みバッジ表示）
            setOpen(false);
            router.push("/plan");
          }}
          onClose={() => setOpen(false)}
        />
      </div>
    </div>
  );
}
