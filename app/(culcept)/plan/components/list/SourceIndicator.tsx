/**
 * Phase 3-N List impl sub-phase 6 — SourceIndicator component (= first-pass、 第 7 補正 #1 多軸表現専用化)
 *
 * 設計原則 (= Spec audit §3.1 + §5.6 + 第 12 補正 #2 hierarchy + 第 14 補正 first-pass):
 *   - 第 7 補正 #1 多軸表現: 色 + アイコン + (full のみ) 状態ラベル
 *   - variant compact (= main card 主表示): 2 軸 (= 色 + icon)、 label なし
 *   - variant full (= 詳細 sheet / 競合 modal): 3 軸 (= 色 + icon + label)
 *
 *   - 第 12 補正 #2 hierarchy (= accepted Alter generated の dot 消滅):
 *     - compact: dot 表示なし (= main card 主表示で目立たせない、 user_owned と同等)
 *     - full: 「Alter 提案を受け入れ済」 caption (= 詳細 sheet で由来を表示)
 *
 *   - 第 12 補正 #1 用語: provenance (= origin)、 derivation (= clonedFrom) 混在禁止 (= 本 component は origin のみ扱う)
 *   - 第 11 補正 #1 UI 責務分離: 本 component は origin axis のみ、 authority / clonedFrom は別表現
 *
 *   - 規約 24-extended: 本 component は非 interactive (= focus 不要)
 *   - a11y: 色 + icon の 2 軸併用 (= 色覚多様性対応)、 aria-label 必須
 *
 * 設計書:
 *   - Spec audit §3.1 + §5.6 + §19.10.2 + §19.13
 *   - lib/plan/list/sourceProvenance.ts (= SourceModel 2 軸モデル)
 */

import { type ReactNode } from "react";
import { type SourceModel } from "@/lib/plan/list/sourceProvenance";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SourceIndicator component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type SourceIndicatorProps = {
  readonly sourceModel: SourceModel;
  /** compact (= main card 2 軸) / full (= 詳細 sheet 3 軸) */
  readonly variant: 'compact' | 'full';
};

/**
 * SourceIndicator — origin axis 表示専用 component
 *
 * variant 別表示 (= Spec §3.1):
 *   - compact: 色 dot + emoji icon (= main card 主表示、 label 出さない)
 *   - full: 色 dot + emoji icon + 状態ラベル caption (= 詳細 sheet で完全情報)
 *
 * 各 source の visual:
 *   - user origin: 全 variant で null (= default、 visual noise 回避)
 *   - imported: slate-500 dot + 📄 + (full) 「${importedFrom}から」
 *   - alter_proposed: indigo-400 dot + ✨ + (full) 「提案中」
 *   - alter_accepted: compact で null (= 第 12 補正 #2 dot 消滅)、 full で 「Alter 提案を受け入れ済」 caption
 */
export function SourceIndicator({ sourceModel, variant }: SourceIndicatorProps): ReactNode {
  // user origin (= 純粋 user 作成 / imported からの複製も origin 'user'):
  //   - 第 12 補正 #2: clonedFrom 関連表示は main card に出さない (= 本 component の責務範囲外)
  //   - default なので全 variant で null
  if (sourceModel.origin === 'user') {
    return null;
  }

  // imported origin (= import_locked or user_owned):
  if (sourceModel.origin === 'imported') {
    const ariaLabel = `source: ${sourceModel.importedFrom} imported`;
    return (
      <span
        className="inline-flex items-center gap-1"
        data-testid="plan-list-source-indicator-imported"
      >
        <span
          className="inline-block w-2 h-2 rounded-full bg-slate-500"
          aria-hidden="true"
        />
        <span role="img" aria-label={ariaLabel}>📄</span>
        {variant === 'full' && (
          <span className="text-xs text-slate-500">{sourceModel.importedFrom}から</span>
        )}
      </span>
    );
  }

  // alter_generated origin:
  if (sourceModel.authority === 'proposed') {
    return (
      <span
        className="inline-flex items-center gap-1"
        data-testid="plan-list-source-indicator-alter-proposed"
      >
        <span
          className="inline-block w-2 h-2 rounded-full bg-indigo-400"
          aria-hidden="true"
        />
        <span role="img" aria-label="source: Alter proposed">✨</span>
        {variant === 'full' && (
          <span className="text-xs text-indigo-600">提案中</span>
        )}
      </span>
    );
  }

  // alter_generated + user_owned (= accepted、 第 8 補正 #2 acceptedAt 保持):
  //   - 第 12 補正 #2: main card (= compact) で dot 消滅、 user_owned と同等表示
  //   - full (= 詳細 sheet) で caption 表示 (= 由来は永遠保持)
  if (variant === 'compact') {
    return null;
  }
  return (
    <span
      className="text-xs text-slate-500"
      data-testid="plan-list-source-indicator-alter-accepted"
    >
      Alter 提案を受け入れ済
    </span>
  );
}
