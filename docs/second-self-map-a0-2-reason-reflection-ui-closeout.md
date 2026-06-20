# A0-2 — reason reflection UI closeout（established のみ・穏やかな 1 行）

> 2026-06-08 / Build Unit / CEO smoke PASS。魂（移動が自己理解になる）の可視化第一歩。
> mini-design: `…-a0-2-reason-reflection-ui-mini-design.md`。pure 基盤: A0-1（`mobilityReasonInsight`）。

---

## 1. 何を実装したか
- `reasonReflectionLine(insight)`（pure・mobilityReasonInsight）: **established insight のみ** 1 行を返す。「その他」reason・emerging・not_enough・null は **null（沈黙）**。仮説トーン「この区間では、◯◯を理由に △△ を選ぶことがあるようです」・**強語(しがち/よく/いつも/あなたは)なし・生数値なし・per-leg・trait でない**。
- `loadHypothesisFeedbackStore()`（store 全体 loader）。
- `MobilityLegCard`: `reasonReflection` prop → from→to 直下に小さい inline 1 行・**local dismiss（key で leg ごと reset）・readOnly 非表示・modal/toast でない**。
- `MapTab`: established insight を `buildReasonInsightForLeg → reasonReflectionLine` で計算（**readOnly/sensitive は沈黙**）。

## 2. 何を実装していないか（scope 厳守）
- emerging 表示（除外・established のみ）/ Alter / Stargazer / DB / belief 反映 / reason→recommendation 反映。

## 3. 検証
- pure RR1-RR6（established のみ / emerging→null / not_enough→null / 「その他」→null / 禁止語なし・仮説トーン・per-leg）。
- render RUI1-RUI6（供給時のみ表示 / null 沈黙 / **readOnly 非表示** / modal でない / dismiss / 禁止語・警告色なし）。
- main で **98 PASS**（A0-2 + insight + helpers）・**tsc footprint 0（total 55）**。

## 4. production / DB / env / GitHub 不接触
- localStorage 読みのみ・DB/network/env/外部API/Alter/Stargazer/Reality なし・push/PR/deploy なし。

## 5. HARD GATE 全 PASS
- sparse/emerging で表示しない（established のみ）/ 人格診断でない（per-leg・強語なし）/ belief 上書きしない / per-leg 境界明確 / dismiss は local state のみ（複雑化なし）。

## 6. 着地（★JST 保全に注意して着地）
- main 着地: **`dad0fd59`**。A0-2 branch（`dacce503`・base はJST前）を **`git cherry-pick`** で JST-main に重ね、git 3-way merge で **JST（`0630f306`）を保持したまま** A0-2 を適用（MapTab auto-merge・非競合）。
- 検証: main MapTab に jstTodayUtcMidnight（JST）×3 ＋ reasonReflection（A0-2）×5 が共存・smoke-force 混入なし（0）。
- code branch: `claude/dr-a0-reflection-ui`（`dacce503`・保持）。

## 7. smoke（CEO PASS・2026-06-08）
一時 smoke-force（reflection 仮注入・未 commit）で reflection 行を在地確認 → CEO PASS。smoke-force は main 非接触（cherry-pick は clean commit から）。

## 8. 状態と次
- **魂の第一歩（capture→insight→reflection）が established で live**。ただし reason は sparse ゆえ初期はほぼ出ない（蓄積で立ち上がる）。
- 次: 次バッチ計画（CEO 報告にて提示）。Alter/Stargazer 合流（full 鏡）は gated。
