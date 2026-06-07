# Day Rehearsal — local diagnostic batch closeout（Batch 1-4 ロードマップ完了）

> 2026-06-08 / Build Unit / CEO 方針「main 統合以降に念密に作った診断層プランを全て高品質で完遂」
> 原典ロードマップ §2: Batch1 full-path 精度 → Batch2 InnerWeather energy → Batch3 marker 精緻化 → Batch4 What-if。
> 個別 closeout: `…-fullpath-batch1-closeout.md` / `…-energy-batch2-closeout.md` / `…-batch3-f1-closeout.md` / `…-batch4-whatif-audit.md`。

---

## 総括
Day Rehearsal（「未来の自分が先に今日を試す」**read-only 診断層**・最適化/予定変更でない）の原典ロードマップを **Batch 1-4 すべて完遂**。各 batch は audit→実装→test→main 着地→closeout（または audit→NO-GO 実証）を高品質で実施。

| Batch | 内容 | 状態 | main |
|---|---|---|---|
| 1 | full-path 精度（実 transport + raw feasibility・Option D → 実値） | ✅ activation 済 | `bcfca834`→`c60eb3ae` |
| 2 | InnerWeather energy（状態次元・有界 −25%・null degrade） | ✅ activation 済 | `d5e88970`→`deef2b45` |
| 3 | marker 精緻化（F1: convergence 見出しの factor 別出し分け） | ✅ smoke PASS 着地 | `af6c30c3` |
| 4 | What-if Preview UI（別 UI を候補下に出す案） | ★audited **NO-GO**（value は v1 で達成済） | — |

## 各 batch の本質
- **Batch 1 full-path**: 診断が real（実 transport + raw feasibility）に。protect_buffer 到達・friction 可変・convergence/recovery 正確。生数値は UI 非表示（ethos 維持）。
- **Batch 2 energy**: 状態次元を導入。実エンジン再現で energy が過悲観の原因でないことを実測（有界・null degrade・leak なし）。
- **Batch 3 F1**: full-path 後に露呈した UX mismatch（余白あるのに「重なりやすい」）を factor 別見出しで解消。診断ロジック不変・text-only。strain 飽和/threshold/magnitude/marker 抑制は CEO 原則（固定値→実データ後較正）+ ethos ゆえ defer（backlog）。
- **Batch 4**: 別 preview UI は候補文と重複（v1 で value 統合済）+ full-path 恩恵なし（candidate-only）→ NO-GO。**what-if 価値は v1 で達成済**。

## 横断的に守った原則（ethos）
- read-only 診断（最適化/自動リスケ/予定変更/apply/save なし）。
- 生スコア・内部数値・level 名・confidence 数値を UI に出さない。仮説トーン（〜かもしれません/〜そう）。
- evidence trace（known/unknown/inferred）必須・捏造しない・unknown は unknown。
- observed > inferred。各 batch zero-conflict / zero-loss / tsc footprint 0（total 55 baseline 不変）で main 着地。

## 残件
- **calibration backlog（実データ後・CEO gate）**: strain 飽和（budget/threshold/飽和カーブ）・convergence magnitude tier・marker 密度抑制・recovery magnitude・energy weight・convergence factors≥2 条件。`second-self-map-calibration-backlog.md`。
- **HOLD（production 不可・GitHub 不可）**: Reality/介入層 track（別所有・別 session）。
- **次フェーズ（CEO・2026-06-08）**: 本格 What-if / Draft Preview v0 — 候補を仮採用したら 1 日の見通しがどう変わるかを**予定変更なしで pure simulation**する土台（`previewRepairSimulation`）。診断層の自然な発展（「候補を見せる」→「候補を試算する」）。

## 状態
- **Day Rehearsal 診断層ロードマップ（Batch 1-4）完了**。
- 次 = What-if / Draft Preview v0 の audit → pure layer 実装（UI 配線は別判断）。
