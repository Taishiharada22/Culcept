"use client";

/**
 * ShiftImportEntryInner — 在 app シフト表取込 入口の本体（S2）
 *
 * button → ShiftImportModal（確認画面 = ShiftReviewGrid）。
 * flag gating は親 `PlanShiftImportEntry` が担当（本体は常時 render = test 可能）。
 *
 * 安全設計（CEO 2026-06-04・gate 分離）:
 *   - **cells は fixture 注入**（`buildShiftFixture`）→ **live VLM を発火させない**（S2 段階）。
 *   - **`saveEnabled={false}`** → ShiftImportModal の保存 controller は disabled → **DB write しない**。
 *   - 実 VLM 抽出 / 保存は後段（別 gate: `PLAN_SHIFT_IMPORT_SAVE` / VLM live）で接続する。
 */

import { useMemo, useState } from "react";

import { buildShiftFixture } from "@/lib/plan/shift/devFixtureHost";
import { ShiftImportModal } from "./ShiftImportModal";

export function ShiftImportEntryInner({ now }: { now?: Date }) {
  const [open, setOpen] = useState(false);
  // 確認画面に流す cells（fixture・live VLM 非依存・deterministic）。now は test 注入可。
  const fixture = useMemo(() => buildShiftFixture(now ?? new Date()), [now]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="plan-shift-import-entry"
        aria-label="シフト表（画像・PDF）を取り込む"
        className="text-[10px] px-2 py-1 rounded-md text-indigo-600 hover:text-purple-700 hover:bg-indigo-50 transition-colors inline-flex items-center gap-1.5 font-medium"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect
            x="3"
            y="4"
            width="18"
            height="16"
            rx="2"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path d="M3 9h18M9 4v16" stroke="currentColor" strokeWidth="2" />
        </svg>
        <span>シフト表</span>
      </button>

      <ShiftImportModal
        open={open}
        year={fixture.year}
        month={fixture.month}
        cells={fixture.cells}
        saveEnabled={false}
        riskReviewEnabled
        onSuccess={() => setOpen(false)}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
