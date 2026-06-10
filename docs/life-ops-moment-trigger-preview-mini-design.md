# Life Ops — Moment Trigger Preview Pure Connector Mini-Design（本流セッション）

> 2026-06-10 / 本流（横 R2 統合）/ CEO・GPT 指示「R4 本線接続の前段として、Moment Trigger で出せる候補を pure に判定する preview VM。通知しない」。
> 前提: placement✅ compose✅ Briefing preview✅。**R4 本線接続・通知・UI・実データ源・外部 API・production・push/PR/merge は禁止**。

---

## 0. 設計原則（前提を疑った結果）

- **R4 本体は非 import**: R4 の `TriggerKind` union に lifeops 種を足す＝R4 本体変更（禁止）。よって**並行 pure 層**として独立 module を作り、R4 の**思想と語彙だけ**揃える（silence-by-default・**cap 1**・`surfaced`/`silencedCount` 命名・配送しない）。
- **入力は「選ばれた tier の composed」**: Moment は「ユーザーが今日採用した案」の文脈で鳴る。tier 差は**入力選択で自然に反映**（protect tier なら protect lane しか入っていない）。
- **`Date.now()` 禁止**: `nowMinute` 注入（test 固定）。pure・状態なし＝cooldown は「**既出 key の exclude 注入**」で表現（§6/§8）。

## 1. trigger 候補にするタイミング
| kind | 条件 | 文言方向 |
|---|---|---|
| `window_open` | nowMinute ∈ [start, end) ∧ **残り時間 ≥ coarseMinutes**（入りきらない窓では鳴らさない） | 「今なら〜入れやすそうです」 |
| `window_approaching` | start − LEAD(既定 30 分) ≤ now < start | 「この後の空き時間に〜入れられそうです」 |
| `deadline_pressure` | **overflow のうち deadline kind のみ**・窓 timing は同上・fitting が何も鳴らない時の fallback | 「期日が近い〜だけ、すきまで少し進めておくと安心です」 |
- 窓外は鳴らさない（`outside_window` で沈黙）。event_prep 近接は**優先度**（fitting 順=urgency 順）で表現し、別 timing は作らない（シンプル）。

## 2. focus_work / recovery を邪魔しない抑制
- nowMinute が選択 tier の `focus_work`／`recovery` block 内 → **全 lifeops trigger を抑制**（`suppression: "focus_block"|"recovery_block"`・surfaced=null・eligible は silenced に計上）。集中と回復は Life Ops より優先（compose と同じ価値判断）。

## 3. tier 差の反映
- 入力 = `ComposedDayProposal`（選択 tier）。lane 包含は compose 済みなので Moment 側に tier 分岐ロジックを**持たない**（protect の日は protect lane しか来ない）。

## 4. riskFlags / permission 注意
- surfaced 1 件に対し **L-8a（confirmationNote + riskNotes）を public API で再利用**・cap 2・dedupe。「予約や購入が要るものは確認してから」系は文言でなく cautions に分離。

## 5. 通知ではなく preview VM
- 出力 `LifeOpsMomentTriggerPreviewVm { surfaced|null, silencedCount, suppressedReasons[], suppression|null }`。**配送・通知・UI・本線接続なし**（source-contract 固定）。

## 6. trigger しすぎない pure 設計（cooldown 相当）
- **cap 1**（R4 と同じ silence-by-default）。
- 状態を持てない pure の cooldown = caller が `excludeKeys`（既出候補 key）を注入 → `already_surfaced` で沈黙。1 評価 1 件・再評価でも exclude が効く。
- 鳴る窓が timing 条件で自然に限定（approaching は 30 分帯のみ）。

## 7. 非断定文言
- 「今やれ」ではなく「今なら入れやすそうです」「この後に入れられそうです」「少し進めておくと安心です」。**すべき/必ず/しなければ/してください は test 禁止**（briefing と同じロック）。

## 8. Morning Briefing との重複制御
- key = `category:menu`（**縦 collector の dedup key と同一定義**）。caller（将来の本線）が briefing で出した key を `excludeKeys` に渡す契約。helper `lifeOpsMomentKey(candidate)` を export。

## 9. overflow / alsoAvailable の扱い
- overflow: **deadline kind のみ** fallback で trigger 可（§1・「入らない日でも期日だけは守る」）。他 kind の overflow は鳴らさない（その日の形を尊重）。
- alsoAvailable（unplaced）: **扱わない**（窓がない＝moment の根拠がない・朝の briefing の領分）。

## 10. source-contract（test 固定）
- no notification / no UI(React) / no DB / no fetch / no `Date.now` / **no R4 import（trigger-）** / no collector・engine import / L-8a 再利用は public API のみ。
- VM に HH:MM 文字列を出さない（moment は「今」の文脈・時刻表記不要＝偽精密回避）・placeQuery 非表示。

## 実装
- `lib/plan/reality/lifeops/lifeops-moment-preview.ts`（pure）: `buildLifeOpsMomentPreview({ composedTier, nowMinute, excludeKeys?, leadMinutes? }) → LifeOpsMomentTriggerPreviewVm` + `lifeOpsMomentKey(c)`。
- tests: 実 chain（collector→placement→generator→compose→moment）+ 手組み（抑制 block・overflow fallback・窓端）。

## stop
R4 本線接続 / 通知 / React UI / Morning 本線 / DB / API / 実データ源 / production / push / PR / merge。
