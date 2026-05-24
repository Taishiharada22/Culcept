/**
 * Phase 3-N List impl sub-phase 6 — ExecutionLayerChip component (= first-pass、 IA 拘束 #6 軽いサイン専用化)
 *
 * 設計原則 (= Spec audit §5.7 + IA 拘束 #6 + 第 8 補正 #3 + 第 14 補正 first-pass + 第 15 補正範囲制限):
 *   - 「準備 N / 事後 M」 compound 表示 (= text-xs + text-slate-500)
 *   - counts 0 件 / 空: 非表示 (= IA #8 「出さないイベント」 整合)
 *   - tap → 詳細 sheet (= 但し sub-phase 6 first-pass では onTap optional、 actual sheet 起動 logic は sub-phase 7+)
 *
 *   - 第 8 補正 #3 first-pass: card 上の軽い chip + detail 内の置き場所 + provenance 表示の枠まで
 *     → 本 component は **card 上の軽い chip のみ**。 detail 内 / 学習ループ本実装は sub-phase 7+
 *
 *   - 規約 24-extended: focus-visible:border-slate-300 (= interactive、 button)
 *   - 第 11 補正 #1 UI 責務分離: 本 component は execution axis のみ、 source / authority 無関係
 *   - a11y: aria-label で「execution layer: 準備 3 / 事後 1」 等の説明
 *
 * 設計書:
 *   - Spec audit §5.7 + §19.13
 *   - IA Audit §2.2 #6 (= 軽いサイン spec)
 *   - lib/plan/list/types.ts (= EventCardViewModel.executionLayerCounts)
 */

import { type ReactNode } from "react";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ExecutionLayerChip component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type ExecutionLayerCounts = {
  readonly preparation?: number;
  readonly post?: number;
};

export type ExecutionLayerChipProps = {
  readonly counts: ExecutionLayerCounts;
  /**
   * onTap (= optional、 sub-phase 7+ で詳細 sheet 起動接続予定)
   *
   * 本 sub-phase 6 (= first-pass) では undefined OK
   */
  readonly onTap?: () => void;
};

/**
 * ExecutionLayerChip — IA #6 軽いサイン専用 component
 *
 * compound 表示:
 *   - 「準備 N / 事後 M」 (= 各 counts > 0 の項目のみ slash 区切り)
 *   - 全 counts 0 or undefined: null return (= 出さない)
 *
 * interactive (= button、 onTap optional):
 *   - 規約 24-extended: focus-visible:border-slate-300
 *   - hover:bg-slate-50 (= subtle)
 */
export function ExecutionLayerChip({ counts, onTap }: ExecutionLayerChipProps): ReactNode {
  const parts: string[] = [];
  if (counts.preparation !== undefined && counts.preparation > 0) {
    parts.push(`準備 ${counts.preparation}`);
  }
  if (counts.post !== undefined && counts.post > 0) {
    parts.push(`事後 ${counts.post}`);
  }

  if (parts.length === 0) {
    return null;
  }

  const label = parts.join(' / ');

  return (
    <button
      type="button"
      onClick={onTap}
      data-testid="plan-list-execution-chip"
      className={[
        "text-xs text-slate-500",
        "rounded",
        "px-2 py-1",
        "border border-transparent",
        "transition-colors duration-150",
        "hover:bg-slate-50",
        "focus:outline-none focus-visible:border-slate-300",
      ].join(" ")}
      aria-label={`execution layer: ${label}`}
    >
      {label}
    </button>
  );
}
