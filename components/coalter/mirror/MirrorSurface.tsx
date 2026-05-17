"use client";

/**
 * CoAlter AOO Phase B — Mirror Surface (B-1 shell)
 *
 * 正本:
 *   - 設計: docs/coalter-aoo-phase-b-mirror-channel-design.md (PR #164)
 *   - 実装計画: docs/coalter-aoo-phase-b-implementation-plan.md (PR #165)
 *
 * B-1 段階の役割 (**hidden shell only**):
 *   完全に hidden な空 div を 1 個だけ mount する。
 *
 *   - visual: hidden 属性 + display:none で完全非表示
 *   - a11y: aria-hidden="true" でアクセシビリティツリーから除外
 *   - textContent: 空 (children なし)
 *   - focusable element: なし (空 div のため自然に non-focusable)
 *
 * No-Effect Contract (B-1 preflight CEO 補正 4 反映):
 *   - listener なし (addEventListener / onXxx props なし)
 *   - state なし (useState / useReducer なし)
 *   - effect なし (useEffect / useLayoutEffect なし)
 *   - subscription なし
 *   - network なし (fetch / axios / supabase なし)
 *   - storage なし (localStorage / sessionStorage / cookie / IndexedDB なし)
 *   - timer なし (setTimeout / setInterval / requestAnimationFrame なし)
 *   - console なし
 *   - 既存 chat / presence state への mutation なし
 *
 * test 検証:
 *   `data-testid="mirror-surface-shell"` で mount を query 可能
 *
 * **Phase B+ 計画 (重要、CEO 補正 1 反映): この hidden shell をそのまま可視化はしない / 内部 logic 追加もしない**:
 *   - B-2 〜 B-4 の logic は **`lib/coalter/mirror/*` の pure / read layer** に置く
 *     (例: B-2 modeContextReader, B-3 buckets/*, B-4 erv / gates / decisionEngine 等)
 *   - **MirrorSurface には B-2 〜 B-4 全期間で内部 logic / state / effect / subscription を一切追加しない**
 *     (引き続き hidden shell のまま、`lib/coalter/mirror/*` の logic は本 component から参照しない)
 *   - B-5 canary: 可視 Mirror surface を**別 component として新規実装**
 *     (本 hidden shell をそのまま CSS で visible にする方針は禁止、
 *      a11y / focus / animation / focus trap 等の責務が別領域のため)
 *   - 本 hidden shell は B-1 段階の "mount 拠点 / test marker" 専用、B-2 〜 B-4 でも同形状で維持
 *
 * 不可侵境界 (B-0 §9 / Phase A 継承):
 *   - lib/coalter/presence/ 全 30+ files 不可侵
 *   - app/components/chat/ 全 17 files 不可侵
 *   - Production env 不可侵
 *   - Question / Proposal / Suggestion 自動発火禁止
 *   - Mirror = reflection 限定 (B-5 以降の Mirror 出力時も grammar 制約あり)
 */

export default function MirrorSurface() {
  return (
    <div
      data-testid="mirror-surface-shell"
      aria-hidden="true"
      hidden
      style={{ display: "none" }}
    />
  );
}
