"use client";

/**
 * CoAlter AOO Phase B B-5b — Visible Mirror Surface (reflection-only UI)
 *
 * 正本:
 *   - 設計: docs/coalter-aoo-phase-b-mirror-channel-design.md (PR #164) §5 / §6.5
 *   - 実装計画: docs/coalter-aoo-phase-b-implementation-plan.md (PR #165) §2.5
 *
 * 役割 (B-5b 段階):
 *   visible Mirror text を**最小限・最も控えめに**表示する dumb component。
 *   logic は持たない (props in、JSX out、純粋な presentation 層)。
 *
 * 設計原則 (Phase B 北極星「黙る・誤読を避ける」):
 *   - **reflection-only**: 表示するのは text 1 つだけ
 *   - **Question / Proposal / Suggestion に見えない UI**:
 *       - input / form / select / textarea 系の HTML element は一切使わない
 *       - 二択 affordance (是非を問う / 採否を問う) なし
 *       - commit-style ボタン (進行 / 確定 を促す類) なし
 *       - retreat affordance (閉じる / 黙ってもらう) のみ提供
 *   - **aria-live="polite"**: screen reader を割り込まずに更新通知 (CEO 承認、a11y)
 *   - **graceful close**: 明示的 click 以外で dismiss しない (timeout 自動消失なし、
 *     overlay click / outside click 検知なし)
 *
 * No-Effect Contract:
 *   - state なし (props のみ)
 *   - effect なし
 *   - subscription なし
 *   - timer なし
 *   - storage / network 一切なし
 *   - logic 一切なし (handler 呼び出しのみ)
 *
 * test 検証:
 *   `data-testid="mirror-visible-surface"` で mount を query 可能。
 *   `data-testid="mirror-visible-close"` / `"mirror-visible-sleep"` で button 個別 query。
 *
 * 不可侵境界:
 *   - 既存 presence layer / observer layer / chat layer touch なし
 *   - B-1〜B-5a zero diff (本 component は新規)
 *   - `MirrorSurface.tsx` (B-1 hidden shell) 変更なし
 *   - input field / form / question affordance 一切なし
 */

import type { VisibleMirrorTemplateId } from "@/lib/coalter/mirror/visibleMirrorTypes";

export interface MirrorVisibleSurfaceProps {
  readonly text: string;
  readonly templateId: VisibleMirrorTemplateId;
  readonly onDismiss: () => void;
  readonly onSleepRequest: () => void;
}

/**
 * Visible Mirror Surface (reflection-only)。
 *
 * Renders:
 *   - container (aria-live="polite", aria-atomic="true")
 *   - text paragraph (template の hedged form 文字列)
 *   - 「閉じる」button (dismiss this Mirror only)
 *   - 「黙ってもらう」button (set sleep ON for the session)
 *
 * **絶対不変**:
 *   - text 入力系 HTML element 一切なし
 *   - 二択 affordance / commit-style ボタン なし
 *   - text は props.text をそのまま表示 (escape は React 標準、HTML injection 不可)
 */
export default function MirrorVisibleSurface(
  props: MirrorVisibleSurfaceProps,
): React.ReactElement {
  return (
    <aside
      data-testid="mirror-visible-surface"
      data-template-id={props.templateId}
      aria-live="polite"
      aria-atomic="true"
      role="status"
      style={{
        // 控えめな styling (glassmorphism 風)、外部 CSS 依存なし
        position: "fixed",
        bottom: "1.5rem",
        right: "1.5rem",
        maxWidth: "20rem",
        padding: "1rem 1.25rem",
        background: "rgba(255, 255, 255, 0.08)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        border: "1px solid rgba(255, 255, 255, 0.12)",
        borderRadius: "0.75rem",
        color: "rgba(255, 255, 255, 0.85)",
        fontSize: "0.875rem",
        lineHeight: 1.6,
        zIndex: 50,
        boxShadow: "0 4px 24px rgba(0, 0, 0, 0.12)",
      }}
    >
      <p
        data-testid="mirror-visible-text"
        style={{ margin: 0, marginBottom: "0.75rem", whiteSpace: "pre-wrap" }}
      >
        {props.text}
      </p>
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          justifyContent: "flex-end",
        }}
      >
        <button
          type="button"
          data-testid="mirror-visible-close"
          onClick={props.onDismiss}
          aria-label="閉じる"
          style={{
            background: "transparent",
            border: "1px solid rgba(255, 255, 255, 0.18)",
            color: "inherit",
            padding: "0.25rem 0.75rem",
            borderRadius: "0.5rem",
            fontSize: "0.75rem",
            cursor: "pointer",
          }}
        >
          閉じる
        </button>
        <button
          type="button"
          data-testid="mirror-visible-sleep"
          onClick={props.onSleepRequest}
          aria-label="このセッションで黙ってもらう"
          style={{
            background: "transparent",
            border: "1px solid rgba(255, 255, 255, 0.18)",
            color: "inherit",
            padding: "0.25rem 0.75rem",
            borderRadius: "0.5rem",
            fontSize: "0.75rem",
            cursor: "pointer",
          }}
        >
          黙ってもらう
        </button>
      </div>
    </aside>
  );
}
