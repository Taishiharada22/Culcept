# Life Ops — A-4-c20 Cadence Real Read-only Wiring Mini-Design（preview only・合成層）

> 2026-06-11 / CEO・GPT GO。**禁止**: calendar title/free text/店舗名/placeQuery/raw event name 推定・LLM 分類・external API・
> 書き込み・PlanClient/本線 card/UI 本線/writer 変更/notification/R4/production/migration/push/PR/merge。

---

## 1. Source audit（read-only・migrations 全 CREATE TABLE 走査）

| source | 構造 | 判定 | 理由 |
|---|---|---|---|
| **M1 `prm_learning_events` の lifeops **done**** | handle=`lifeops:{cat}[:{menu}]`（辞書 firewall）・action/signal enum・c11 CHECK 済 | **採用（唯一）** | 明示 user 操作の完了事実・PII 構造遮断済・c8 column-restricted reader 既存 |
| `calendar_events` | `event_type TEXT`（**CHECK なし自由 TEXT**）+ event_name/notes 自由文 | **不採用** | enum 保証がなく categoryId 変換は実質 free text 推定（禁止系）。将来 enum CHECK + 完了 flag が入れば再訪 |
| habit / routine / visit / completion 系 table | — | 不採用 | **存在しない**（全 migration 走査で 0 件） |
| `wear_events` 等 closet 系 | 構造化 | 不採用 | 着用履歴=Life Ops category でない（domain 不一致） |
| localStorage 系（swipe 等） | — | 不採用 | server から読めない（client-only） |
| stargazer `completion_rate` | signal enum 値 | 不採用 | 観測領域が別（質問応答 metrics） |
| deadline 系 | — | 対象外 | cadence でなく deadlineObservations の領分 |

**結論**: 今日の安全な real cadence source は **feedback_done のみ**。c20 は「**合成層（multi-source composer）**」を実装し、
feed 1 本目=feedback_done で稼働・将来 source（構造化完了 table・L-9 個人実績）はこの層に plug する。
**新規 DB query は 0**（既存 c8 gated read の observations を再利用）＝読む column は c8 の column-restricted のまま増えない。

## 2. DTO（中間・raw を candidate へ直接流さない）

```ts
LifeOpsCadenceRealObservation = {
  categoryId, menu,                       // 辞書 enum（出口で roundtrip 再検証）
  lastCompletedAtISO,                     // 事実のみ
  confidence: "high"|"medium"|"low",      // feedback_done=high（明示操作）
  source: "feedback_done",                // 将来: "structured_completion" 等が増える
  freshness: "fresh"|"stale"|"unknown",   // L-2 spec 比: elapsed ≤ 3×typicalInterval→fresh / 超→stale / spec なし→unknown
}
```
- **足切りは confidence のみ**（low → inputs に流さない=「強く候補化しない」#7 の実装）。freshness は観測 metadata
  （古い完了日は事実であり、候補化判断は L-2 beyond 比率と cap が既に bound する）。
- 出口 `realCadenceToCadenceObservations` で **辞書 roundtrip 再検証**（c15 と同じ build→parse・不一致 drop）→ `CadenceObservation[]`。

## 3. merge / cap 接続位置（c14 維持）

```
inputs(fixture/将来実) → merge(feedbackCadence・c14 不変更) → merge(realCadence・c20) → capRawLifeOpsInputs → collector → …
```
- 同一 key 衝突は **latest lastCompletedAtISO 勝ち**（c14 `mergeCadenceIntoLifeOpsInputs` を逐次適用＝結合的・順序不変）。
- 衝突観測: `cadenceSourceConflictCount`（feedback と real の同 key・異 ISO の数・**counts のみ**）+ `realCadenceCount` を integrationMeta に追加。

## 4. flag / gate
`isLifeOpsCadenceReadAllowed({master, cadence, supabaseUrl})` = `LIFEOPS_REALDATA_READONLY` ∧ `LIFEOPS_CADENCE_READONLY`（c7 dormant の初 wiring）∧ staging allowlist ∧ production deny。default OFF・`LIFEOPS_MAINLINE` とは独立（c20 は preview-only・page 表示自体は REALITY_PIPELINE_PREVIEW 配下）。
今日の feed は c8 read 経由のため、**live 反映は実質 master∧feedback∧cadence**（独自 query を持たない合成層・将来 source が独自 gate を足す）。

## 5. 接続範囲
preview compute に optional `realCadence` 注入（page の gated 合成）。本線/PlanClient/R4/notification/writer 不接触。
smoke=既存 readonly smoke を real 層 counts 付きに拡張（read-only・LIMIT・counts のみ・write 0・cleanup 不要）。

## 6. 変更ファイル
新 `lifeops-cadence-real-source.ts`（pure 合成層）／compute（realCadence merge+meta 2 counts）／page（cadence gate 合成）／
readonly smoke 拡張／新 test `realityLifeopsCadenceRealSource.test.ts`（GPT 14 lock）／docs/log。
