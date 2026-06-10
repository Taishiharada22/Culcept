# Life Ops — A-4-c18 Done Confirmation Slice Mini-Design（明示確認付き done・1 クリック write 禁止）

> 2026-06-11 / CEO・GPT GO。**絶対条件**: done 自動実行なし・1 クリック DB write なし・確認状態を挟む・server 再計算照合・
> client から handle/category/menu/writer DTO を送らない・server で c15 intent 再構築・done のみ cadenceEligible=true・
> production hard block。**禁止**: 自動 done・2 件以上 write・production write・PlanClient/R4/notification/external API/UI 本線/本線 merge/push/PR/merge。

---

## 1. 確認方式 3 案比較

| 案 | 安全性 | 複雑性 | 判定 |
|---|---|---|---|
| **① PRG 2 段階 confirm token** | 確認状態が URL に明示（リロード/戻る安全・PRG で再送防止）・client 無状態のまま server が全段再検証・stage-1 は write 経路を構造的に持たない | c17 の action/page/client に小追加のみ。token は stateless（`done:{candidateKey}`・非 PII lookup key のみ） | **採用** |
| ② 確認専用ページ | 分離は明確だが、三重 gate+auth を別 route に複製＝検査面が倍増 | route/page 追加・観測文脈から離脱 | 過剰 |
| ③ 同一ページ client state | 確認が client state に依存（リロードで消失）・useState が presentational lock 違反・server 側に「確認済み」の証跡が残らない | client 改造大 | 不採用 |

採用=①。**c17 PRG 設計と完全整合**（同じ server action・同じ redirect 規約・client は server-rendered props のみ）。

## 2. フロー（stage-1 → 確認表示 → stage-2）

```
1 回目: rail の 完了※（stage-1 submit・confirm field なし）
  → server action: done ∧ confirm 不在 → 候補再計算照合のみ・**write しない**
  → redirect ?lifeopsConfirm=done:{candidateKey}（PRG）
確認表示: page が token を parse → 現在の DTO rail に candidateKey が実在する時だけ pendingDone{key,label} を client へ
  → 「『◯◯』を完了として記録しますか？／次回の提案周期に影響します。／preview 限定です。本線には反映されません。」
  → [記録する]（hidden confirm=done:{key} + candidateKey + action=done）／[戻る]（plain link・write 経路なし）
2 回目: server action: done ∧ confirm 一致 ∧ 候補再照合 → c15 intent 再構築（cadenceEligible=true が正）
  → c9 writer（gate: master∧LIFEOPS_FEEDBACK_WRITE∧staging∧!production・cooldown）→ ?lifeopsFb=ok_done
```

- **token 検証**: `done:` prefix ∧ key 完全一致 ∧ **再計算した現在の Morning 代表に実在**。不一致/偽造/陳腐化 → invalid（write なし）。
  token の役割は誤操作防止の 2 gesture 強制（敵対防御は gate/auth/再照合が担う）— stateless で十分。
- routing は pure 関数 `routeLifeOpsActionRequest(reps, key, action, confirm)` に切り出し fake で全分岐 lock
  （c17 `resolveLifeOpsActionRequest` は**不変更**＝accept/later/dismiss 既存挙動 lock 維持）。

## 3. staging smoke
c13 の done/completion 1-row write smoke（`scripts/lifeops-feedback-write-smoke.ts`）を再実行（GPT 12 条件と同一検査:
staging/prod/service_role/before 0/1 件のみ/done/completion/lifeops/obs=1/**cadence=1**/cleanup→0/counts log のみ）。
confirm routing 自体は pure（fake 全分岐）・UI E2E は c17b と同形のため CEO dogfood（任意・別途）で十分。

## 4. 変更ファイル
lifeops-action-request.ts（token build/parse + route 関数追加・既存 resolve 不変更）／actions.ts（route 化+confirm 受領+ok_done）／
page（lifeopsConfirm parse→pendingDone 検証付き注入+ok_done token）／client（rail 完了※→stage-1 button[confirm なし]・確認 block・ok_done 文言）／
新 test `realityLifeopsDoneConfirmation.test.tsx`（GPT 14 lock）＋既存 source lock 3+2 file の two-stage 進化／docs/log。
