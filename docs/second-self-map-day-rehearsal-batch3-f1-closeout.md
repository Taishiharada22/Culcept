# Day Rehearsal Batch 3 F1 — convergence marker 見出しの factor 別出し分け closeout

> 2026-06-08 / Build Unit / CEO・GPT GO + smoke PASS
> 原典ロードマップ §2: Batch1 full-path → Batch2 energy → **Batch3 marker 精緻化** → Batch4 What-if UI。
> 関連: `second-self-map-calibration-backlog.md`（Batch 3 baseline 所見）/ `second-self-map-day-rehearsal-per-marker-why-closeout.md`（factor 配線の前提）。

---

## 1. 背景（full-path activation 後に露呈した UX mismatch）
full-path activation 後、CEO smoke スクショ（6/8 packed な実在の日）で **convergence marker の見出しが factor 非依存で一律「この前後は予定が重なりやすいかもしれません」** であることが問題化。
- 「ミーティング→ディナー」区間は **余白 145 分（buffer sufficient）** なのに、strain_high + friction_high の 2 factor で convergence high → marker「重なりやすい」。
- 「重なりやすい」は本来 buffer_short（時間が重なる）の語。余白が十分あるのに「重なりやすい」は**余白と矛盾**。why 行（explainConvergenceMarker）は factor 別で正直だが、**見出しが一律ゆえ矛盾**して見えた。

## 2. ★Batch 3 のスコープ確定（deep research + 独立検証）
5 視点 workflow + adversarial 批判 + 自己再検証で、**Batch 3 を F1 のみに絞る**ことが CEO/GPT 承認で確定。理由は **CEO ご自身の原則**に根ざす:
- strain 飽和の budget/threshold 調整・magnitude tier・marker 抑制は **実データ無しの magic number 弄り**＝calibration backlog §0「固定値運用→実データ後較正」の違反 + ethos（シグナル隠し）リスク。
- ★独立発見: convergence marker は **必ず factor≥2**（engine: `factors.length>=2 ? "high"`・marker は high のみ）→ workflow の「friction 単独抑制」案はそのケースが marker を出さず**無意味**。
- ★独立発見: 「3/3 marker の警告だらけ感」の正体は『3 個』でなく『3 個とも同一文』→ **factor 別見出し（F1）で各 marker が別々の正確な文になれば density 感の大半が解消**。能動的抑制は不要かつシグナル隠しリスク。
- defer（backlog 記録済）: strain 飽和 / 数値 magnitude / marker 抑制 / recovery magnitude。

## 3. 実装（surgical・text-only・診断ロジック不変）
- `lib/plan/dayRehearsal/dayRehearsal.ts`: pure helper `buildConvergenceMarkerHeadline(factors)` を追加。
  - `buffer_short` を含む → 「この前後は予定が重なりやすいかもしれません」（既存維持・時間が重なりうる＝正しい）。
  - `buffer_short` なし（strain+friction）→ 「この前後は移動と予定が立て込みやすいかもしれません」。
  - ★CEO/GPT 確定コピー: 「重なりやすい」は no-buffer で使わない・「詰まりやすい」も避ける（やや警告的）。
  - 空 factors → 既存文へ degrade（marker 非消失・実際は marker は factor≥2 でのみ出る）。
- `app/(culcept)/plan/components/DayGraphTimeline.tsx`: `ConvergenceMarkerLine` に `factors?` prop を追加し見出しを出し分け（aria-label も同期）。call site で `factors={convergenceFactors}`（既存 `convergenceFactorsByTransitionIndex` を再利用＝per-marker why と同一 source）。factor 不在は既存文へ degrade。
- ★**診断ロジック不変**: convergence 判定 / level / marker の有無 / 色（slate）/ layout は一切変えない。**見出しの語だけ** factor に忠実化。

## 4. 検証
- 新規 unit **MH1-MH8**（buildConvergenceMarkerHeadline 全 factor 組合せ・空 degrade・「詰まり」不使用・仮説トーン・生数値/level/警告語なし）。
- render contract **F1-a〜e**（buffer→重なりやすい / no-buffer→立て込みやすい / factors 不在 degrade / **HARD GATE: marker 数不変** / no-buffer も仮説トーン・警告色なし）+ 構造 invariant 2 件。
- **plan suite 5091 PASS**・**tsc footprint 0（total 55 baseline 不変）**。
- main worktree で **101 PASS 再確認**（zero-loss）。

## 5. HARD GATE（CEO 指定）全 PASS
| gate | 結果 |
|---|---|
| factor が取れない場合は停止 | PASS（convergenceSteps と convergenceFactorsByTransitionIndex は同一 convergencePoints から構築＝整合・万一 undefined は既存文 degrade で marker 非消失） |
| copy が警告/診断/断定っぽくなる | PASS（仮説トーン「かもしれません」・禁止語 grep 通過） |
| marker が消える/増える | PASS（F1-d: buffer/no-buffer で marker 数同一） |
| layout が崩れる | PASS（text-only・同一 `<li>`/class/slate-400） |

## 6. smoke（CEO PASS・2026-06-08）
6/8 の日で: 余白145分の区間が「重なりやすい」→「移動と予定が立て込みやすい」に変化・矛盾解消。不足10/40分は「重なりやすい」据置。marker 数/位置/色/layout 不変。CEO PASS。

## 7. 着地・ブランチ
- main 着地: **`af6c30c3`**（親 `3c856dd4`・zero-conflict 検証済＝F1 4 ファイルのみ・A1-6-8 等の混入なし）。
- code branch: `claude/dr-batch3-f1`（HEAD `dab4c58a`・保持）。

## 8. 状態
- **Batch 3 完了**（F1 集約・実装 + smoke + main 着地 + closeout）。defer 項目は backlog（実データ後・CEO gate）。
- 次: **Batch 4 What-if Preview UI（audit-first）**。candidate↔preview 重複の再確認 + full-path 後の preview 価値 + 非冗長で安全な形があるか → GO/NO-GO。
- HOLD（production 不可）: Reality/介入層。push/Vercel/GitHub 禁止遵守。
