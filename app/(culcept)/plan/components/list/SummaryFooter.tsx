/**
 * Phase 3-N List impl sub-phase 8c — SummaryFooter component (= 解釈レイヤーの器)
 *
 * 設計原則 (= CEO + GPT 合議 2026-05-24 8c redefine + 追加補正):
 *   - 8c は「解釈レイヤーの器」 まで実装、 score 算出 / 数値表示 / 強い評価 0
 *   - 4 領域 構造:
 *     - 左: **視覚サマリー枠** (= 円形 SVG indicator、 数値なし、 固定 segment 色)
 *     - 中央: **中立状態名** (= 「集中と休息のリズム」)
 *     - 右: **観測寄り 一言解釈** (= 「集中する時間と、 ひと息つく時間が交互に入っています」)
 *     - 末尾: **subtle CTA** (= 「リズムを整えるヒント >」)
 *
 *   - 文体方針 (= GPT 補正):
 *     - 「ましょう」 OK (= mock 文体準拠)
 *     - 強い命令形 (= 「しなさい」 「しろ」) 0
 *     - 評価形容詞 (= 「最適」 「重要」 「良いプラン」) 0
 *     - 状態描写 / 観測寄り (= 評価装置ではなく 静かな解釈の器)
 *
 *   - 規約 24-extended (= focus-visible:border-slate-300、 CTA button)
 *
 * 8c でやらない (= 凍結維持):
 *   - score 算出 logic (= 78% 等)
 *   - 数値表示
 *   - 強い評価文
 *   - LLM 接続
 *
 * 設計書:
 *   - decision-log (= sub-phase 8c readiness + GPT 補正)
 *   - mock 画像 (= 78% balance card の構造のみ流用)
 */

import { type ReactNode } from "react";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 固定 copy (= 8c 「器」 として deterministic、 score 計算なし、 中立)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 中立状態名 (= 「リズム」 の観測、 評価語ではない)
 */
export const SUMMARY_FOOTER_STATE_LABEL = '集中と休息のリズム' as const;

/**
 * 観測寄り 一言解釈 (= 状態描写、 評価しない)
 */
export const SUMMARY_FOOTER_INTERPRETATION =
  '集中する時間と、ひと息つく時間が交互に入っています' as const;

/**
 * subtle CTA label (= 強くない押し感、 observation の入口)
 */
export const SUMMARY_FOOTER_CTA_LABEL = 'リズムを整えるヒント' as const;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SummaryRingIcon (= 視覚サマリー枠、 inline SVG、 固定、 数値なし)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 円形 indicator (= 4 segment 色で cafe/meal/work/home を象徴、 score 表現なし)
 *
 * - 外側 light gray ring (= 全体 sketch)
 * - 内側 4 arc (= cafe indigo / meal orange / work blue / home emerald)、 各 90° 等分割
 * - 数値 / 進捗表現なし (= 「固定的な視覚サマリーの器」 通り)
 */
function SummaryRingIcon({ size = 40 }: { size?: number }): ReactNode {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-hidden="true"
      className="flex-shrink-0"
    >
      {/* 外枠 (= light gray 全周) */}
      <circle
        cx="24"
        cy="24"
        r="20"
        fill="none"
        stroke="rgb(226 232 240)"
        strokeWidth="4"
      />
      {/* 上 cafe (= indigo)、 90° */}
      <path
        d="M 24 4 A 20 20 0 0 1 44 24"
        stroke="rgb(99 102 241)"
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
      />
      {/* 右 meal (= orange)、 90° */}
      <path
        d="M 44 24 A 20 20 0 0 1 24 44"
        stroke="rgb(249 115 22)"
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
      />
      {/* 下 work (= blue)、 90° */}
      <path
        d="M 24 44 A 20 20 0 0 1 4 24"
        stroke="rgb(59 130 246)"
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
      />
      {/* 左 home (= emerald)、 90° */}
      <path
        d="M 4 24 A 20 20 0 0 1 24 4"
        stroke="rgb(16 185 129)"
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SummaryFooter component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type SummaryFooterProps = {
  /**
   * CTA tap handler (= 8c では optional、 詳細 sheet 起動 / 別 view 遷移 等)
   *
   * undefined OK = button disabled 風 styling
   */
  readonly onCtaTap?: () => void;
};

/**
 * SummaryFooter — 1 日全体の解釈レイヤーの器 (= 8c)
 *
 * 構造 (= mock 整合):
 *   - container: rounded-2xl border bg-white shadow-sm (= card-like)
 *   - 左: SummaryRingIcon (= 円形 indicator 視覚枠)
 *   - 中央: 状態名 (= text-sm font-medium、 中立)
 *   - 右: 一言解釈 (= text-xs text-slate-500、 観測寄り)
 *   - 末尾右: subtle CTA (= text-xs text-indigo-600 + ›)
 *
 * 8c 範囲:
 *   - 数値 0 / score 0 / 強い評価 0
 *   - 固定 copy (= constants 経由)
 *   - 押し感 subtle (= CTA 「強くない押し」)
 */
export function SummaryFooter({ onCtaTap }: SummaryFooterProps): ReactNode {
  return (
    <section
      data-testid="plan-list-summary-footer"
      aria-label="1日全体の解釈"
      className={[
        "mx-auto max-w-3xl",
        "flex items-center gap-3",
        "rounded-2xl border border-slate-100 bg-white shadow-sm",
        "px-4 py-3",
      ].join(" ")}
    >
      {/* 左: 視覚サマリー枠 (= 円形、 数値なし) */}
      <SummaryRingIcon size={40} />

      {/* 中央 + 右: 状態名 + 一言解釈 (= 縦並び flex-1) */}
      <div className="flex-1 min-w-0">
        <p
          className="text-sm font-medium text-slate-700"
          data-testid="plan-list-summary-footer-state"
        >
          {SUMMARY_FOOTER_STATE_LABEL}
        </p>
        <p
          className="text-xs text-slate-500 mt-0.5"
          data-testid="plan-list-summary-footer-interpretation"
        >
          {SUMMARY_FOOTER_INTERPRETATION}
        </p>
      </div>

      {/* 末尾: subtle CTA (= 規約 24-extended focus-visible:border-slate-300) */}
      <button
        type="button"
        onClick={onCtaTap}
        data-testid="plan-list-summary-footer-cta"
        className={[
          "flex-shrink-0",
          "text-xs text-indigo-600",
          "rounded-md",
          "px-2 py-1",
          "border border-transparent",
          "transition-colors duration-150",
          "hover:bg-slate-50",
          "focus:outline-none focus-visible:border-slate-300",
        ].join(" ")}
        aria-label={SUMMARY_FOOTER_CTA_LABEL}
      >
        {SUMMARY_FOOTER_CTA_LABEL} ›
      </button>
    </section>
  );
}
