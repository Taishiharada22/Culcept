# A3 What-if slice 3（candidate comparison）closeout + A3 全体まとめ

> 2026-06-09 / Build Unit。slice 3 着地（`7ede99cc`）。UI 表示 / Day Rehearsal 実反映は**次 CEO 判断まで停止**。

## 1. slice 3 結果（candidate comparison・着地）
- `scenarioComparison.ts`: 同じ 1 日を **手堅い（慎重）/ 現状 / 積極的（思い切った・冒険的）** の 3 診断レンズで
  `rehearseDay` を再実行し、見え方の違いを定性整理。★**予定変更案でなく診断上の比較シナリオ**。
- ★CEO 制約 全反映:
  - pure/read-only・UI なし・Day Rehearsal 本流反映なし・実 store/予定/input を mutate しない・**event duration/order 不触**（test 確認）。
  - **最適案/断定にしない**（neutral）・数字/%/score/probability なし・「失敗/危険/X分/30%/スコア」禁止（test 保証）。
  - **contrast gate**: protective↔aggressive の**独立 day-level 差**(outlook/peakStrain level/convergencePoints 件数/recoveryWindows 件数)が ≥2 整合時のみ `compared`。3 案ほぼ同じ→`identical` / unknown→`insufficient`（沈黙）。
- ★honesty 機構（数値捏造なし・slice 2 同型）: protective=tight を守る(insufficient→sufficient・null) / aggressive=余白薄く(sufficient→insufficient + recovery null) / baseline=現状。**observed margin の診断的再解釈**。
- 出力: protectiveNote「手堅い（慎重な）見方では、この前後の重なりは少なめに見えます」/ aggressiveNote「積極的（思い切った・冒険的な）見方では、後半の見通しが{magnitude}際どくなるかもしれません」。
- 10 tests・tsc footprint 0・dayRehearsal 216 PASS・flag `DAY_REHEARSAL_SCENARIO_COMPARISON_ENABLED=false`・未配線。

## 2. A3 全体まとめ（pure 層 完成）
| slice | 内容 | 状態 |
|---|---|---|
| slice 1 | qualitative magnitude 語彙（`whatIfMagnitude.ts`） | ✅ 着地 `7a59d931` |
| slice 2 | inverse what-if（`inverseWhatIf.ts`・守る意味の説明） | ✅ 着地 `898ccb45` |
| slice 3 | candidate comparison（`scenarioComparison.ts`・3 レンズ比較） | ✅ 着地 `7ede99cc` |
- 全 slice 共通: pure・read-only・**数値捏造なし**・**沈黙デフォルト**（coherence/contrast gate）・evidence trace・予定を動かさない・**全 flag OFF・未配線**。
- ★A3 の **pure 層は完成**。残るは配線（UI/Day Rehearsal 反映）= CEO stop gate。

## 3. UI 表示 / Day Rehearsal 実反映の次設計（★stop gate・実装は CEO 判断後）
- **UI 表示（次設計）**: inverse の「守る意味」+ comparison の「3 レンズ」を Day Rehearsal の Evidence 面に
  控えめ表示（reason-only・flag OFF/dev・沈黙原則・最適案/断定なし）。reason UI と同型で smoke→着地。
- **Day Rehearsal 本流反映（次設計）**: inverse/comparison を rehearsal 出力に統合（例: protect signal の
  説明強化）。★belief/予定を書き換えない・診断のみ・偽数値なし。実反映は CEO stop gate。
- どちらも **CEO 判断まで停止**。

## 4. Phase B/C/D との関係
- **Phase B（cross-day/早期警告）**: HOLD（Recovery Pattern audit で DB/speculative の stop gate）。A3 は **単日**の
  what-if で、B は cross-day。A3 の counterfactual 機構は将来 B の「この曜日に無理するとどうなるか」に転用余地。
- **Phase C（production/Reality/DB）**: HELD（GitHub/production 復帰待ち）。A3 は pure/local ゆえ C に依存しない。
  inverse の「守る意味」は将来 Reality の protect signal 説明に接続余地（C 承認後）。
- **Phase D/M5 鏡**: A3 + dogfood 蓄積後に再設計。A3 の「守る意味/3 レンズ」は鏡の自己理解素材の 1 つ。

## ★停止事項
A3 UI 表示 / Day Rehearsal 本流反映は **次 CEO 判断まで停止**。slice 1/2/3 とも未配線・flag OFF。

## 次
A3 pure 層 完成 → CEO 判断（A3 UI/Day Rehearsal 反映 or 別テーマ or dogfood 蓄積）。
