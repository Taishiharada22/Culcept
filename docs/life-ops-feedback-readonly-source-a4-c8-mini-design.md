# Life Ops — A-4-c8 Feedback Read-only Source Gate Mini-Design（実データ read-only 第 1 段）

> 2026-06-11 / CEO・GPT 指示「最も安全な feedback/M1 reader 再利用 source だけから入る。default OFF・staging only・column restricted・no write/UI/notification」。
> **禁止**: calendar/deadline/cadence 本体・migration・write・notification・UI 本線・production enable・push/PR/merge。

---

## 1. Read-only audit 結果（既存 M1/feedback reader）

| # | 監査項目 | 結果 |
|---|---|---|
| 1 | reader の有無 | ✅ `supabase-prm-learning-event-reader.ts`（A1-7-26・server-only・**未配線**）`readEventRows()` が生 restricted row を返す＝**そのまま再利用可** |
| 2 | 読める column | `handle, action, desired_date, band, confidence_band, duration_min, source_kind, acted_at`（`PRM_LEARNING_EVENT_READ_COLUMNS`） |
| 3 | 読まない column | **raw / source_ref / user_id / id / signal**（select しない＝column-restricted・reader 内 lock） |
| 4 | scope | owner-RLS（`.eq(user_id)` + RLS）・`acted_at` 昇順・**LIMIT 500**（population read 防止）・fail-open [] |
| 5 | Life Ops 対応情報 | **★現 M1 row に lifeops category は無い**（handle は plan-seed 由来の opaque TEXT）。→ **handle namespace 規約**で解決（§2）。現行 row は lifeops 非該当＝adapter は honest に [] |
| 6 | PII/自由文リスク | `handle` が TEXT＝唯一の自由文経路 → **辞書 firewall**（§3）で構造的に遮断。他列は enum/数値/日付 |
| 7-8 | staging/production | reader は client 注入（環境非依存）。**gate（§4）**が staging allowlist ∧ production deny ∧ flag AND を担保 |
| 9 | flag | A-4-c7 の dormant flags を使用（master ∧ feedback・default OFF） |
| 10 | write path | reader は select/eq/order/limit のみ・本 slice も write 0 |

## 2. Handle namespace 規約（将来 write 側との契約）

- **`lifeops:{categoryId}` / `lifeops:{categoryId}:{menu}`**（例 `lifeops:beauty_salon:cut`・`lifeops:tax_filing`）。
- 将来の lifeops feedback write（別 gate）はこの handle で M1 に記録（action=accept/dismiss/later が schema 適合・**完了=accept は MVP proxy**）。
- 読み側は **prefix filter**＝plan-seed 由来 row と構造的に分離（誤混入ゼロ）。

## 3. 中間 DTO と PII firewall（自由文を一切通さない）

```ts
LifeOpsFeedbackObservation = { categoryId: LifeOpsCategoryId; menu: BeautyMenu|null; action: "accept"|"dismiss"|"later"; actedAtISO: string }
```
- **辞書 firewall**: handle を parse → `categoryId` が **L-1 辞書に存在**・menu が **enum（cut/color/treatment）** のときだけ通す。**不一致は黙って drop**（自由文/PII は出力に構造的に到達不能）。action も enum 検証。
- 出力は **enum + ISO 日付のみ**（raw row を Life Ops candidate に直接流さない）。
- `feedbackToTentativeCadence(observations)` → **accept のみ**・key ごと最新 1 件 → `CadenceObservation{lastCompletedAtISO}`。**accept=完了の proxy という前提を明示**（確定完了シグナルは将来）。dismiss/later は cadence に使わない（不要=将来の suppression 素材・後で=無変換）。unknown/低確度を**候補化しすぎない**設計。

## 4. Gate（default OFF・staging triple 同型・production hard block）

`isLifeOpsFeedbackReadAllowed({ master, feedback, supabaseUrl })` = `master===true ∧ feedback===true ∧ url∋staging(hjcr…) ∧ url∌production(aljav…)`。
- caller は `PLAN_FLAGS.lifeopsRealdataReadonly` / `lifeopsFeedbackReadonly`（**default OFF**）+ env URL を束ねて渡す。
- server-only wiring `createLifeOpsFeedbackReadonlySource(client, userId, env)`：gate false → **query せず []**（fail-closed-to-empty）・true → M1 reader → adapter。

## 5. cap pipeline との接続位置

`（本 source）feedbackObservations → toTentativeCadence → LifeOpsInputs.cadenceObservations へ merge → ①raw input cap → collector → ②pool cap → …`（A-4-c7 の順序の**最上流**・本 slice では merge 配線まではせず position を契約として固定）。

## 6. Staging smoke 方針

preflight（GO flag・staging allowlist・prod denylist・service_role fatal・env 充足）を script 内で全 PASS した場合のみ、**read-only・LIMIT 50・counts/shape のみ・PII を log に出さない** smoke を 1 回実行（既存 P-E/4-E パターン踏襲）。不確実性があれば実行せず停止。期待: 現行 M1 に lifeops prefix row は 0 → `total≥0・lifeops=0` が honest 結果。
