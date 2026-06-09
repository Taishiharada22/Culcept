# A3 What-if 深化 — mini-design（提出）+ slice 1 実装

> 2026-06-09 / Build Unit / Phase A 残。pure・local・read-only・新規データ/DB/UI/external なし・Day Rehearsal 実反映なし。

既存 Day Rehearsal（forward simulation）に **(1) inverse what-if / (2) candidate comparison / (3) qualitative magnitude** を pure で足す。★UI 表示・Day Rehearsal 実反映は**次判断まで停止**。

---

## 0. audit 要約（既存資産）
- `rehearseDay(input, config)` は **pure**（DB/Date/network なし・予定を動かさない）→ **counterfactual に 2 回呼べる**。
- 既存 what-if: `dayRepairSimulation.ts`（`previewRepairSimulation`＝before/after 再シミュレーション・`resolveBufferAt` で input 分岐）。candidate: `dayRepairCandidates.ts`（protect/leave_earlier/use_recovery 等）。preview: `dayRepairPreview.ts`（level のみ・数字なし）。
- 出力は **level enum**（`EstimateLevel = low/moderate/high/unknown`）+ **evidence trace**（basis/known/unknown/inferred）。生 score は内部のみ。outlook = `holds/tight/breaks/unknown`。
- 既存定性語彙: `EstimateLevel` / contextModifier の `slight|notable`。★**偽数値・係数・確率はコードベースに存在しない**（再利用で捏造ゼロ）。
- ★audit verdict: 3 サブ領域とも **pure/local/read-only で構築可・新規データ/DB なし**。ただし **coherence/contrast/sufficient gate + 定性のみ出力**を設計から強制。

## 1. (3) qualitative magnitude ＝ ★**foundation・slice 1（本 doc で実装）**
- 既存 `EstimateLevel` を定性大きさ語へ写像する**共有語彙**（inverse/comparison が再利用）。
- `whatIfMagnitude.ts`: `magnitudeWord(level)` → 少し/中程度/大きめ・**unknown→null（沈黙）**。`outlookWorseningWord(before,after)` → **悪化方向のみ**(1 段=中程度/2 段=大きめ)・改善/同等/unknown→null。
- ★**偽数値・係数・確率なし**（出力は語のみ）・hedge は consumer 側・**数字を一切含まない**（test で保証）。
- pure・rehearsal 非結合・新規データなし。**slice 1 として着地**。

## 2. (1) inverse what-if ＝ slice 2（★設計・rehearsal core を触るため CEO レビュー後に実装）
- 「protect/recovery を守らない場合に何が悪化しそうか」を **counterfactual 再シミュレーション**で読む。
- `previewInverseProtectionEffect(input, target, config)`: target の保護を外した input を作り（slack→0 / recovery gap 縮小）`rehearseDay` を before/after 2 回 → 比較。
- ★**coherence gate**: level shift（convergence/strain 上昇）or outlook 悪化が**整合して起きた時のみ** emit。起きなければ「resilient/uncertain」（沈黙）。
- 出力: `{status: "worsens_without"|"resilient"|"uncertain", magnitude(語), evidence}`・★**断定しない**(「守らないと、この区間が中程度、慌ただしくなりそうです」hedge)・「X 分悪化」等の数字**禁止**。
- flag `DAY_REHEARSAL_INVERSE_ENABLED=false`。新規データ/DB なし。★rehearsal core の counterfactual 意味づけが correctness-sensitive → **CEO レビュー後に実装**。

## 3. (2) candidate comparison ＝ slice 3（★設計・data-thinness 注意・CEO レビュー後）
- 守り/楽/攻め（defensive/balanced/aggressive）の input 分岐を `rehearseDay` × 3 → **定性比較**。
- stance modifier: defensive=recovery を守る / balanced=現状 / aggressive=recovery を消費（★event duration は sacred・add/remove/reschedule しない・travelMin/slack/recovery 閾値のみ soft 変更）。
- ★**contrast gate**: 3 stance の outlook/convergence が**全て同一なら emit しない**（`{identical:true}`・無情報ノイズ回避）。
- 出力: 定性比較（「守りの方がこの区間の重なりは少なめ」）・★**delta 数字禁止**（level 比較のみ）。
- flag `DAY_REHEARSAL_SCENARIO_COMPARISON_ENABLED=false`。data 薄で全 stance 同一になりがち → contrast gate で沈黙。

## 4. ★全 slice 共通の HARD GATE（CEO 制約）
- 出力文字列に **数字・%・係数・確率を一切出さない**（grep `[0-9]` = 0）。
- coherence/contrast/sufficient gate（薄い/無差は沈黙）。evidence trace 必須。
- pure・read-only・予定を動かさない・新規データ/DB/external/Life Ops なし。
- ★UI 表示・Day Rehearsal 実反映は**次判断まで停止**（stop gate）。

## 5. 進め方 / stop gate
- slice 1（magnitude vocab）= 本 doc で実装→tests→tsc→main着地。
- slice 2/3（inverse/comparison）= 本設計を **CEO レビュー後**に実装（rehearsal core counterfactual ゆえ）。
- stop gate: UI 表示 / Day Rehearsal 実反映 / 新規データ / DB / production / Life Ops / 偽数値・過剰 magnitude / data 薄 speculative。

## 次
slice 1 着地 → CEO 設計レビュー → slice 2（inverse what-if）実装。
