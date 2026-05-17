"use client";

/**
 * CoAlter AOO Phase B B-5b — Sleep UI Toggle (session-local sleep control)
 *
 * 正本:
 *   - 設計: docs/coalter-aoo-phase-b-mirror-channel-design.md (PR #164) §6.7 / §10.3
 *   - 実装計画: docs/coalter-aoo-phase-b-implementation-plan.md (PR #165) §2.5
 *
 * 役割 (B-5b 段階):
 *   ユーザーが Mirror を session-local に「黙ってもらう / 再開する」 toggle button。
 *   logic は持たない (props in、JSX out、純粋な presentation 層)。
 *
 * 設計原則:
 *   - **session-local のみ**: sleepStore は module-level boolean、persistence なし
 *     (cross-session、cross-tab に持ち越さない、page reload で reset)
 *   - **明示的 toggle**: hover / focus / scroll 等の implicit trigger なし
 *   - **raw text なし**: input field / textarea / chat input 一切なし
 *   - **静かな UI**: 巨大な notification なし、控えめなボタン (1 個 only)
 *
 * No-Effect Contract:
 *   - state なし (props のみ)
 *   - effect なし
 *   - subscription なし
 *   - storage / network 一切なし
 *
 * test 検証:
 *   `data-testid="mirror-sleep-toggle"` で mount を query 可能。
 *   `data-sleep-on` 属性で current state を確認可能。
 *
 * 不可侵境界:
 *   - 既存 presence layer / observer layer / chat layer touch なし
 *   - B-1〜B-5a zero diff (本 component は新規)
 *   - input / form / select / textarea 一切なし
 */

export interface SleepUIToggleProps {
  readonly sleepOn: boolean;
  readonly onSleepRequest: () => void;
  readonly onSleepResume: () => void;
}

/**
 * Sleep UI Toggle (session-local boolean)。
 *
 * sleep OFF → ボタン: 「観察を控えてもらう」 (click で sleepStore set true)
 * sleep ON → ボタン: 「観察を再開する」 (click で sleepStore set false)
 *
 * **絶対不変**:
 *   - 1 button のみ
 *   - text 入力 / form 一切なし
 *   - 自動 toggle / hover toggle 一切なし
 */
export default function SleepUIToggle(
  props: SleepUIToggleProps,
): React.ReactElement {
  const label = props.sleepOn ? "観察を再開する" : "観察を控えてもらう";
  const handler = props.sleepOn ? props.onSleepResume : props.onSleepRequest;
  return (
    <button
      type="button"
      data-testid="mirror-sleep-toggle"
      data-sleep-on={String(props.sleepOn)}
      onClick={handler}
      aria-pressed={props.sleepOn}
      aria-label={label}
      style={{
        position: "fixed",
        bottom: "1.5rem",
        left: "1.5rem",
        padding: "0.375rem 0.875rem",
        background: "rgba(255, 255, 255, 0.06)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        borderRadius: "0.5rem",
        color: "rgba(255, 255, 255, 0.7)",
        fontSize: "0.75rem",
        cursor: "pointer",
        zIndex: 49,
      }}
    >
      {label}
    </button>
  );
}
