# Life Ops — A-4-c14 Feedback → Cadence Merge Mini-Design（preview/fixture/staging read-only 限定）

> 2026-06-11 / CEO・GPT 指示「done feedback を `LifeOpsInputs.cadenceObservations` へ安全合流。UI/本線 Plan には入らない」。
> **禁止**: write/UI/notification/production enable/本線 Plan。flag は default OFF・production 常 false。

---

## 1. 設計（flow と merge 規則）

```
done feedback（c8 read-only source・gated）→ feedbackToCadence（done のみ・c13）
  → ★mergeCadenceIntoLifeOpsInputs（本 slice・pure）→ LifeOpsInputs.cadenceObservations
  → raw input cap（最上流・c7 順序）→ collector → placement/compose/briefing/moment preview
```

- **merge 規則（key = categoryId:menu）**: 同 key は **lastCompletedAtISO の新しい方が勝つ**（feedback done は事実・宣言より新しければ更新／宣言の方が新しければ宣言維持）。`null`（unknown）は日付に必ず負ける。union は両方残す。
- **0 件は静かに**: feedback 0 → **inputs を同一参照で返す**（no-op・決定論）。
- **merge 位置**: `computeLifeOpsPreviewDto` 内で **`capRawLifeOpsInputs` の直前**（cap pipeline 最上流＝c7/c8 契約どおり・static order test で固定）。

## 2. 接続範囲（preview compute / page）

- compute: 追加 optional 引数 `feedbackCadence?: readonly CadenceObservation[]`（**pure 維持**＝注入）。`integrationMeta.feedbackCadenceCount`（数のみ）で可視化。
- page（dev-reality-pipeline・server）: **gated 実 read**＝`createLifeOpsFeedbackReadonlySource(supabase, user.id, { master: PLAN_FLAGS.lifeopsRealdataReadonly, feedback: PLAN_FLAGS.lifeopsFeedbackReadonly, supabaseUrl })`→`feedbackToCadence`→compute へ渡す。**flags default OFF → source は query せず [] → 既定挙動は完全不変**。production は gate で常 false。

## 3. 維持する不変条件
done のみ cadence / accept・dismiss・later 不使用（c13 lock）／二重識別（prefix ∧ source_kind・**双方向 drop を test 追加**）／raw row を candidate へ直接流さない（CadenceObservation=enum+ISO のみ）／PII・free text・user_id・id 非搬出／unknown・0 件は空配列／5 層 cap は merge の**後段**で全て有効。

## 4. Staging read-only smoke
c13 cleanup 済みで実データ 0 件想定 → 既存 c8 readonly smoke を **cadence count 検証付き**に拡張して 1 回実行（counts/boolean のみ・write 0・cleanup 不要）。期待: total=0/lifeops=0/observations=0/**cadence=0**（honest zero）。done row の再 write は**しない**（feedback 由来 cadence の候補反映は fake/fixture test で証明）。

## 5. 変更ファイル
新 `lifeops-feedback-cadence-merge.ts`（pure helper）／compute（arg+merge+meta count）／page（gated read 合流）／c8 readonly smoke（cadence count）／tests（merge unit・compute 反映・0 件・cap 順序・二重識別双方向）／docs/log。
