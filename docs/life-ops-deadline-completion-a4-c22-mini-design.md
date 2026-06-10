# Life Ops — A-4-c22 Deadline Completion Consumption Mini-Design（preview only・presentation suppression）

> 2026-06-11 / CEO・GPT GO（c21 finding 起点）。**やらないこと**: deadlineObservations の DB 更新・source of truth の完了化・
> calendar/free text 推定・permanent completion semantics・本線 card・PlanClient・R4・notification・production・push/PR/merge。

---

## 1. 設計整理（GPT 10 点への回答）

1. **deadline 候補の識別**: `candidate.dueReason.kind === "deadline"`（型判別のみ・文字列推定なし）。
2. **done feedback の読み方**: c8 DTO `LifeOpsFeedbackObservation[]`（既存 gated read の出力・raw row 不使用）を入力し、
   helper 内部で **action==="done" のみ**採用・key ごと最新 1 件・**辞書 roundtrip 再検証**（build→parse・偽装 drop）。
3. **一致条件**: key=`${categoryId}:${menu ?? ""}` の完全一致（deadline 候補は通常 menu=null）。
4. **cycle との違い**: cycle 候補は c14/c20 の cadence merge が担当（lastCompleted 更新→within に戻り自然に出ない）。
   本 helper は **kind==="deadline" だけ**を対象にし、cycle/event_prep は素通し（二重処理禁止）。
5. **適用位置**: `collector 後 → ★completion suppression → pool cap → placement → compose → briefing/moment`。
   placement 前＝Morning/Moment/全 tier が同一の抑制済み集合を見る（「Morning だけ隠れて Moment に残る」ズレが構造的に不可能）。
   抑制で空いた枠は pool cap が他候補に回せる（順序の副次的利点）。
6. **presentation suppression であること**: 入力（deadlineObservations/DB）は不変更。done row が消えれば（cleanup）次 render で候補は**自動的に戻る**。
7. **cleanup 後に戻る**: doneFeedback=[] → 抑制 0 → DTO は従来と完全一致（JSON equal を test 固定）。
8. **stale done の扱い（永久抑制の禁止）**: **occurrence window 照合**を採用。
   候補自身が持つ `daysUntilDeadline` と `leadDays` から今回 occurrence の窓開始
   `windowStartMs = nowMs + (daysUntilDeadline − leadDays) × DAY` を導出し、**doneAt ≥ windowStart の done だけ**が抑制に使える。
   去年の tax_filing done（窓開始より遥か前）は無視（test 固定）。lookback は lead 日数+超過分で自然に有界＝永久抑制が構造的に不可能。
9. **同一 key の複数 deadline 候補**: collector が key dedup 済みのため高々 1 件（本 helper は一致全件を抑制する実装＝将来 dedup が変わっても安全）。
10. **integrationMeta**: `suppressedDeadlineCount`（**数のみ**・key/label/reason 文字列は出さない）。

## 2. Helper（pure）

```ts
applyLifeOpsCompletionSuppression({ candidates, doneFeedback, nowMs })
  → { candidates: 残存, suppressedDeadlineCount }
```
- accept/later/dismiss は**絶対に**抑制に使わない（action enum filter・test 固定）。
- 入力候補のうち kind≠deadline は無条件 keep。unknown category/enum 外 menu の done は roundtrip で drop。

## 3. 配線（gate）
新 flag なし: 入力は既存 gated read（master ∧ LIFEOPS_FEEDBACK_READONLY）の observations を再利用（c20 と同じ「query 増えない」原則）。
read gate OFF → doneFeedback=[] → 抑制 0（default OFF 挙動は自動成立）。page と actions の**両方**に同一注入（表示と server 照合の候補集合がズレない・static test）。
client には観測用に counts 行（fbCad/realCad/suppressed・数のみ）を preview meta に追加（c22b の CEO 観測点）。

## 4. CEO operator smoke（c22b・別 checklist）
c21 と同形: before 全 0 → 確定申告に done → after counts（obs=1/realCad=1）→ rerender で**確定申告が代表から消える**+meta 抑制=1 →
他 deadline（免許/パスポート）は残る → cleanup → 候補が戻る・全 0。
