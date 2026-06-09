# A3 Day Rehearsal soft connection — mini-design（★設計のみ・実装しない）

> 2026-06-09 / Build Unit / CEO 指示。A3（inverse / comparison）を Day Rehearsal の**表示文脈**へもう一段近づける場合の安全形。
> ★copy / explanation 接続のみ。scoring / marker / repair candidate **生成**には使わない。診断値を変えない。
> ★user-facing 表示の変更は次 CEO 判断まで停止（本 doc は判断材料）。

---

## 0. 現状（dogfood 中の配置）
- A3 行は banner 直下の独立ブロック（`plan-day-outlook-a3`・最大 2 行・comparison 優先→inverse fallback）。
- 既存の文脈面: 「なぜ?」disclosure（observed/inferred/uncertain）・「どうするとよさそう?」（repair 候補 + leave_earlier の what-if v0 1 行 `simulationLineByKind`）。

## 1. soft connection 案（いずれも copy のみ・диагностика値不変）

### 案 A（推奨・最小）: inverse を repair 候補の下に「対応付け」
- repair 候補のうち **protect_buffer / use_recovery_window** の suggestion 直下に、**その候補が指す step** の inverse「守る意味」1 行を添える。
- 実装形: 既存 `simulationLineByKind`（leave_earlier 用）と**対称の `inverseLineByKind` map** を CalendarTab で構築 → banner の repair `<li>` 内で表示。生成系（generateDayRepairCandidates）には一切触れない。
- ★対象 step 連動: 現状の「最初に protect_matters になる保護 1 件」でなく **candidate.targetStepIndex** で対応付け（文脈密着・誤対応排除）。
- 効果: 「どうするとよさそう?」を開いた人だけが「守る意味」を見る（banner 直下より控えめ・回答が質問の隣に並ぶ）。

### 案 B: comparison を「なぜ?」disclosure 内へ移設
- comparison 2 行を banner 直下から「なぜ?」`<details>` 内（observed/inferred 行の後）へ移す。
- 効果: default 閉ゆえ**見たい人だけ**見る（出すぎリスク最小化）。トレードオフ: 発見性が下がる＝dogfood 観測（出現頻度・納得感）が貯まりにくい。

### 案 C: 現状維持 + 案 A 追加（ハイブリッド）
- comparison は banner 直下のまま（日の「見え方」は day-level 情報ゆえ表で良い）、inverse のみ案 A で repair 候補へ。
- 効果: day-level（comparison）と candidate-level（inverse）の**スコープ整合**が最も良い。

## 2. ★不変条件（全案共通・HARD）
- `rehearseDay` 入出力・viability/strain/convergence・repair candidate **生成**・優先度付け・marker は**一切変更しない**（A3 は純粋 read の copy のみ）。
- 数字/%/score/確率なし・最適案/断定なし・沈黙原則（insufficient/identical/resilient は何も出さない）。
- flag 体系は現行（INVERSE / SCENARIO_COMPARISON・production hard block）を流用。追加 flag 不要。
- 予定変更に見える UI（button/適用）を置かない。

## 3. 推奨と判断点
- **推奨: 案 C**（inverse=candidate-level へ・comparison=day-level のまま）。スコープが正しく、変更も map 1 つ + 表示位置のみ（小）。
- **CEO 判断点**: ①dogfood で A3 行の「出すぎ/物足りなさ」をもう数日観察してから決めるか、すぐ移すか。②inverse の対象選定を candidate 連動に変えることの是非（現状: 最初の protect_matters）。
- **実装規模**: 小（CalendarTab の map 構築 + banner の表示位置・pure 層不変・tests は render-contract 追加のみ）。

## ★stop gate
本流反映（scoring/marker/生成への接続）/ user-facing 表示変更の実装（本 doc の案 A/B/C 含む）は **CEO GO まで停止**。

## 次
dogfood 観測（7 日判断）→ CEO が案 A/B/C/現状維持を選択 → 実装 GO。
