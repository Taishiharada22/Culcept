# A1-14 — Dogfood Activation Smoke closeout（★gate safety PASS・actual activation でない）

> 2026-06-09 / Build Unit / local 一時 ON smoke。★**実 flag ON は main に入れない**。本着地は flag OFF 維持の記録のみ。

---

## smoke 結果 = ★gate safety PASS（actual activation PASS ではない）
- local/dev で **`DAY_REHEARSAL_PACE_SHADOW_ENABLED=true`**（uncommitted・worktree 限定）にして smoke。
- **条件未充足**（dogfood 実データ無し）のため **`DAY_REHEARSAL_PERSONAL_PACE_ENABLED=true` には進まなかった**（CEO 指示）。
- 確認できたこと（**gate が正しく止める** = safety PASS）:
  - shadow report パネルが dev のみ出る（flag OFF/一般ユーザー非表示）。
  - データ無し → readiness=not_enough・dogfood checklist 4 項目 ✗ → **dogfood: not_ready**・stability=insufficient。
  - ＝**データ無しでは ON できない**（opt-in / activation 区間 / shadow 安全 / 記録の質 / 複数日 stability の gate が全て効く）。
  - raw 数値（pace ratio/friction/GPS 座標）は出ない（status/level/件数/badge のみ）。
- ★これは「安全装置が条件未充足を正しく弾く」ことの PASS であり、実反映の挙動 PASS ではない。実反映は実 dogfood データ蓄積（capture 増）後・CEO 判断で別途。

## 安全（遵守）
- ★**実 flag ON を main に commit しない**：smoke override（shadow=true）は worktree 限定の uncommitted・**戻し済（全 flag OFF）**。
- `DAY_REHEARSAL_PERSONAL_PACE_ENABLED` は終始 OFF（実反映せず）。
- main 着地は **flag OFF 維持の記録（本 closeout）+ A1-15 mini-design + A1-15 安全コード（pure helper）** のみ。

## 次（実 dogfood activation の前提・runbook 再掲）
実 1 日 dogfood activation（`PERSONAL_PACE_ENABLED=true`）は **dogfood: ready_for_dogfood かつ stability: stable_safe** を満たして初めて・本人 dev で・CEO 判断。違和感で即 flag OFF。

## 次フェーズ
A1-15（canary entry readiness・pure helper 実装）。`…-a1-15-canary-readiness-closeout.md`。
