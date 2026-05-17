"use client";

/**
 * CoAlter AOO Phase B — Mirror Channel Host Component (B-1 + B-5a + B-5b)
 *
 * 正本:
 *   - 設計: docs/coalter-aoo-phase-b-mirror-channel-design.md (PR #164)
 *   - 実装計画: docs/coalter-aoo-phase-b-implementation-plan.md (PR #165)
 *
 * 役割:
 *   - B-1 (確定): `MirrorSurface` (hidden shell) を mount。flag OFF で完全 no-op。
 *   - B-5a (確定): `useMirrorEngine()` で shadow mode engine 実行 + diagnostic snapshot。
 *   - B-5b (本 PR): visible Mirror surface + sleep control を mount。
 *       - `<MirrorVisibleSurface />`: engine が visible candidate を出した時のみ render
 *           (sleep / cap / 7-layer verification を通過した State Mirror text のみ)
 *       - `<SleepUIToggle />`: ユーザーが session-local に sleep ON/OFF を toggle
 *       - flag OFF なら全 visible component 一切 mount しない
 *       - env 投入は B-5c。flag OFF (env 未投入) なら DOM 出力は **B-1 hidden shell のみ**
 *
 *   Phase A `components/coalter/observer/ObserverHost.tsx` の pattern を踏襲:
 *     ChatClient.tsx に最小差分 (1 import + 1 JSX mount) で mount する
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
 * Phase B+ 計画 (CEO 補正 1 反映: 本 component は B-5 まで最小 composition boundary に留める):
 *   - **B-2 〜 B-4 の logic はすべて `lib/coalter/mirror/*` の pure / read layer に新設**
 *     (UI component には logic を入れない、関心分離の原則):
 *     - B-2: modeContext read path (`lib/coalter/mirror/modeContextReader.ts` 新規)
 *     - B-3: bucket inference pure logic (`lib/coalter/mirror/buckets/*` 新規)
 *     - B-4: ERV / Three-Gate / Counterfactual / Anticipatory Withdrawal / Diversity Quota
 *       (`lib/coalter/mirror/erv.ts` / `gates/*` / `decisionEngine.ts` / 等)
 *   - **B-2 〜 B-4 では MirrorHost / MirrorSurface に diff を入れない**
 *     (本 component は flag 確認 + hidden MirrorSurface mount のみを担当)
 *   - B-5 canary: 可視 Mirror surface を**別 component として新規実装**
 *     (Post-Speak Verification / Channel Lock / sleepDetector も `lib/coalter/mirror/*` に配置)
 *     - B-5 で本 component が可視 surface を mount するための **最小拡張**を初めて検討
 *       (本 hidden shell の CSS で可視化はしない、別 component に切り替える)
 *   - 本 component は Speak logic を一切持たない (常に hidden shell mount のみ、B-5 までは現状形)
 *
 * Phase A ObserverHost との関係:
 *   - 別 component (subscription lifecycle と Mirror UI mount は責務分離)
 *   - ChatClient.tsx 内で sibling として配置
 *   - 互いに依存しない (両者が独立に lifecycle 管理)
 */

import { COALTER_FLAGS } from "@/lib/coalter/flags";
import { useMirrorEngine } from "@/hooks/useMirrorEngine";
import MirrorSurface from "./MirrorSurface";
import MirrorVisibleSurface from "./MirrorVisibleSurface";
import SleepUIToggle from "./SleepUIToggle";

export default function MirrorHost() {
  // B-5a + B-5b:
  //   - shadow mode engine 実行 (mount 1 回、flag OFF 時は hook 内 early return)
  //   - B-5b: visible candidate evaluation を hook 内で実施 (sleep / cap / verification 通過時のみ)
  //   - 4 層 flag gating defense の L4: hook 内で flag OFF → engine 一切呼ばない
  //   - 戻り値:
  //       - visible: 表示すべき text (null なら表示なし)
  //       - sleepOn: 現在の sleep 状態
  //       - onDismiss / onSleepRequest / onSleepResume: handlers
  const engine = useMirrorEngine();

  if (!COALTER_FLAGS.mirrorChannelEnabled) {
    // flag OFF (既定): 真の no-op — DOM 出力なし、listener / state / effect / subscription / network / storage / timer / console すべてなし
    return null;
  }

  // flag ON:
  //   - MirrorSurface (B-1 hidden shell、不変、test marker / mount 拠点)
  //   - MirrorVisibleSurface (B-5b、visible なら mount。reflection-only、Question/Proposal/Suggestion なし)
  //   - SleepUIToggle (B-5b、いつでも sleep 制御。session-local、persistence なし)
  //
  // env 投入は B-5c。本 component が flag ON でも、`NEXT_PUBLIC_COALTER_MIRROR_CHANNEL_ENABLED`
  // env が "true" でなければ flag は false のため、Production / Preview ともに DOM 出力なし。
  return (
    <>
      <MirrorSurface />
      {engine.visible ? (
        <MirrorVisibleSurface
          text={engine.visible.text}
          templateId={engine.visible.templateId}
          onDismiss={engine.onDismiss}
          onSleepRequest={engine.onSleepRequest}
        />
      ) : null}
      <SleepUIToggle
        sleepOn={engine.sleepOn}
        onSleepRequest={engine.onSleepRequest}
        onSleepResume={engine.onSleepResume}
      />
    </>
  );
}
