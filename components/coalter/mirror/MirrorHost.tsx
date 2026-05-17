"use client";

/**
 * CoAlter AOO Phase B — Mirror Channel Host Component (B-1)
 *
 * 正本:
 *   - 設計: docs/coalter-aoo-phase-b-mirror-channel-design.md (PR #164)
 *   - 実装計画: docs/coalter-aoo-phase-b-implementation-plan.md (PR #165)
 *
 * 役割 (B-1 段階):
 *   `MirrorSurface` を mount する **null-render wrapper component**。
 *   - flag OFF (既定) → `return null` (DOM 出力なし、完全 no-op)
 *   - flag ON → `<MirrorSurface />` (hidden shell only、視覚 0)
 *
 *   Phase A `components/coalter/observer/ObserverHost.tsx` の pattern を踏襲:
 *     ChatClient.tsx に最小差分 (≤ 5 行 = 1 import + 1 JSX mount) で mount する
 *     ため、UI 影響ゼロで Mirror Channel の足場を確立する。
 *
 * No-Effect Contract (B-1 preflight CEO 補正 4 反映):
 *   flag OFF 時:
 *     - DOM 出力 0
 *     - listener なし / state なし / effect なし / subscription なし
 *     - network なし / storage なし / timer なし / console なし
 *     - 既存 chat / presence state への mutation なし
 *     - runtime 影響最小 (flag 確認の同期 boolean 評価のみ)
 *
 *   flag ON 時 (B-1 段階):
 *     - DOM 出力 = `<MirrorSurface />` (hidden shell 1 個のみ)
 *     - 視覚 0 / a11y 中立
 *     - 上記 No-Effect Contract は維持
 *
 * 不可侵境界 (B-0 §9 / Phase A 継承):
 *   - lib/coalter/presence/ 全 30+ files 不可侵 (本 component から import しない)
 *   - app/components/chat/ 全 17 files 不可侵
 *   - lib/coalter/observer/ (Phase A) 不可侵 (本 component から import しない)
 *   - Production env 不可侵 (env 投入なし、default false)
 *   - Question / Proposal / Suggestion 自動発火禁止
 *
 * Phase B+ 計画 (本 component は MirrorSurface mount lifecycle のみ担当):
 *   - B-2: modeContext read path (`lib/coalter/mirror/modeContextReader.ts` 新規)
 *   - B-3: bucket inference pure logic (`lib/coalter/mirror/buckets/*` 新規)
 *   - B-4: ERV / Three-Gate / Counterfactual / Anticipatory Withdrawal / Diversity Quota
 *     (`lib/coalter/mirror/erv.ts` / `gates/*` / 等)
 *   - B-5: Mirror Surface 実描画 + Post-Speak Verification + Channel Lock + sleepDetector
 *   - 本 component は Speak logic を一切持たない (常に MirrorSurface mount のみ)
 *
 * Phase A ObserverHost との関係:
 *   - 別 component (subscription lifecycle と Mirror UI mount は責務分離)
 *   - ChatClient.tsx 内で sibling として配置
 *   - 互いに依存しない (両者が独立に lifecycle 管理)
 */

import { COALTER_FLAGS } from "@/lib/coalter/flags";
import MirrorSurface from "./MirrorSurface";

export default function MirrorHost() {
  if (!COALTER_FLAGS.mirrorChannelEnabled) {
    // flag OFF (既定): 真の no-op — DOM 出力なし、listener / state / effect / subscription / network / storage / timer / console すべてなし
    return null;
  }
  // flag ON (B-1 段階): hidden shell mount のみ
  // - B-2 以降で MirrorSurface に modeContext / bucket / Speak Decision の logic を段階追加するが、
  //   B-1 段階では shell は完全 hidden (visual 0 / a11y 中立)
  // - 可視 Mirror surface は B-5 で別 component として実装 (本 hidden shell は可視化せず)
  return <MirrorSurface />;
}
