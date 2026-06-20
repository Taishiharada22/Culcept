# Day Rehearsal Repair Candidate v0 — UI placement mini design（設計のみ・実装は次 GO）

> 2026-06-07 / **設計のみ・実装しない** / 前提: pure layer `generateDayRepairCandidates` が main live（`9c220da2`）。banner「なぜ?」+ 詰まり/一息 marker + per-marker「なぜ?」が既に live。

---

## 0. 目的
Day Rehearsal が出した read-only 対処候補を、**予定変更の実行に見えない**形で・既存 UI と重複せず・命令/警告/診断にならず提示する placement を確定する。

## 1. 既存 Day Rehearsal UI（重複回避のため整理）
| 層 | 何を出すか | 形 |
|---|---|---|
| day-level banner | outlook 1 行（holds/tight/breaks） | 常時（選択日） |
| banner「なぜ?」 | 根拠 = 観測/推定/未確定 | native `<details>`・default 閉 |
| timeline 詰まり/一息 marker | 「重なりやすい」「一息つけそう」 | transition 直後の always-on 行 |
| per-marker「なぜ?」 | convergence の factor 合成 | transition tap→expand 展開域に piggyback |
- ★ Repair 候補は新しい層 = **「どうする?」（対処の示唆）**。既存は全て「観測/診断（why/what is）」で、Repair は「what could help」＝**別レイヤー**なので重複しない（copy で why の再説明をしないこと）。

## 2. placement 候補（CEO 質問への回答）
| 案 | 形 | 評価 |
|---|---|---|
| **A. day-level「どうする?」disclosure（推奨・v0）** | banner 下に「なぜ?」と並ぶ **native `<details>`「どうする?」**（default 閉）。その日の候補を suggestion 行で列挙（最大 N） | ✅ **推奨**。1 disclosure 追加のみ・timeline/marker 不接触・「なぜ?」と同 pattern（default 閉・read-only）。reduce_density(day 全体)も per-step 候補も 1 箇所に集約。実装最小・layout 安全 |
| B. marker 展開内（per-marker「なぜ?」の隣） | transition tap→expand 域に候補行を追加 | ⏸ 後回し。展開域が feasibility + なぜ? + 対処 で**情報量過多**リスク。per-step 空間整合は良いが v0 には重い。day-level(A)が安定してから（「なぜ?」の day→per-marker 進化と同じ順） |
| C. 別画面/モーダル | 候補を別 UI に | ✗ 過剰。read-only 示唆に重い |
- **結論: A（day-level「どうする?」disclosure）から**。B は次フェーズ。

## 3. 候補数の上限
- **最大 3 件**（wall of suggestions 回避）。4 件以上なら優先度上位 3。
- 優先度（severity 順案）: `leave_earlier`(余白不足=最も actionable) > `protect_buffer`(重なり) > `confirm_uncertain`(未確定) > `use_recovery_window`(一息) > `reduce_density`(全体)。
- 0 件なら disclosure 自体を出さない（「なぜ?」が evidence 弱で出さないのと同様）。

## 4. copy / 表示形（命令・警告・診断・実行に見えない）
- 候補は **suggestion テキスト行のみ**（`generateDayRepairCandidates` の `suggestion`）。**ボタン/「適用」/チェックボックス等の実行 UI を一切置かない**（read-only＝予定変更に見えない最重要点）。
- 「どうする?」summary は中立（例:「どうする?」or「壊れにくくするには」←「壊れ」禁止なので「ゆとりを作るには」等）。
- 各候補は slate の小行（marker/feasibility と同階調 text-xs italic）。命令形（すべき/しろ）・警告（危険/警告）・診断（〜です断定）なし。pure layer の copy が既に suggestion トーン（「〜とよさそう」「〜かもしれません」）で禁止語なし。
- 生スコア・係数・内部点数を出さない（pure layer が既に出さない）。

## 5. evidence trace の見せ方
- v0 は **evidence を raw 表示しない**（suggestion テキストが user-facing な蒸留形。「なぜ?」も raw evidence を出さないのと同方針）。evidence trace は内部/テスト用に保持。
- 将来、候補ごとに軽い「なぜこの候補?」を出すなら別 slice（per-candidate disclosure・情報量管理込み）。

## 6. 既存との重複チェック
- banner「なぜ?」= why（観測/推定/未確定）/「どうする?」= 対処示唆 → レイヤーが違うので非重複。ただし copy で why を再説明しない（「移動の余白が少なめ」は「なぜ?」側・「どうする?」は「出発を早める余地」）。
- marker（重なり/一息）= ラベル /「どうする?」= 対処 → 非重複。use_recovery_window は marker「一息つけそう」と near だが、marker=事実提示・候補=活用示唆で別（重複感が出るなら use_recovery_window を v0 候補から外す選択も可・CEO 判断）。

## 7. 実装スケッチ（次 GO 時・UI 配線）
- `CalendarTab`: 既存 `dayRehearsal` + `recoverySteps`(WPM-2b raw slack) を `generateDayRepairCandidates(dayRehearsal, { recoverySteps })` に渡し候補配列を得る（additive・新 store/API なし）。最大 3 に絞る。
- `DayOutlookBanner`（or 近傍）: 候補があれば「どうする?」native `<details>`（default 閉）で suggestion 行を列挙。banner outlook 行・「なぜ?」は不変。
- read-only（予定変更/repair 実行/保存/DB なし）・timeline/marker 不接触。
- 検証: render contract test（disclosure default 閉・suggestion 行・**実行 UI 不在**・禁止語 grep・最大 3）+ CalendarTab wiring + tsc footprint 0。

## 8. CEO 判断点（実装 GO 前）
1. placement = **案A（day-level「どうする?」disclosure）**で良いか（B per-marker は後回し）。
2. 上限 = **最大 3 件**・優先度順で良いか。
3. evidence は **raw 非表示**（suggestion のみ）で良いか。
4. `use_recovery_window` を v0 候補に含めるか（marker「一息」と near・重複感の許容度）。
5. 「どうする?」summary 文言（命令/警告/診断でない中立語）。
