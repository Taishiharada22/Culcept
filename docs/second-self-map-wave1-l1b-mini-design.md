# Second Self Map — Wave 1 / L1-b mini design（OD 条件付きレパートリー belief）

> 2026-06-05 / **設計のみ・実装 GO 待ち** / 前提: L1-a（観測前方記録）実装済・データ蓄積中
> 正本 = local main `5f05391f`、L1-a は branch `claude/second-self-map-wave1-l1`。
> 上位: `docs/second-self-map-wave1-l1-mini-design.md`（L1 全体）。

---

## 0. 目的
L1-a が録り始めた観測ログ `{day, legKey, mode, timeband, weekday, originKey, destKey, privacyClass}` を使い、belief を **OD（場所ペア）× timeband × weekday** で条件付け、**legKey-cold な leg でも OD 一般化で surface** する。**v0 legKey belief を floor に退行ゼロ**。

## 1. データ源（L1-a 観測ログ）
- key `aneurasync.plan.map.mobilityObservation.v1`、`(day, legKey) → MobilityObservation`。
- OD belief は legKey でなく **odKey = `${originKey}__${destKey}`** で集約（観測内の place key を使う）。
- **redacted 観測（sensitive）は OD 集約から除外**（privacyClass="redacted" / originKey=destKey=null）。timeband/weekday は利用可。

## 2. クエリ（開いた leg・L1-a の observationContext を再利用）
- `odKey = normalize(originText)__normalize(destText)`（sensitive なら null → OD 不可 → legKey fallback）
- `timeband = toTimeband(toStartTime)` / `weekday = toWeekdayBucket(dayKey)`
- `legKey`（v0 fallback 用）

## 3. 階層 fallback（specific → general・最も特定的で十分なデータの層を採用）
```
L1: odKey × timeband × weekday   （最特定）
L2: odKey × weekday
L3: odKey × timeband
L4: odKey                         （場所一般化＝cross-instance）
──────────────  ↑ OD 層（L1-a 観測由来）
L5: legKey（= v0 weighted belief） ★退行ゼロの floor
L6: silent（cold）
```
- 各層の加重 total が閾値以上なら採用、未満なら次へ。
- ★floor=legKey(v0) → どの leg も v0 より surface が減らない（退行ゼロ）。
- 正式な partial-pooling（層間 shrinkage blend）は **L4 タスク**。L1-b は閾値 fallback に留める。

## 4. precision 整合（v0-F と一貫）
- OD 集約も **observation (day,legKey) × hypothesisFeedback (day,legKey) を JOIN** して precision 加重（selected1/confirmation1/correction2 を再利用）。
- ★mode の正本は selectedModeStore。observation.mode が `selectedModeStore[day][leg]` と不一致なら **stale として落とす**（L1-a の正本方針を履行）。

## 5. 出力 + 配線
- 出力は **同じ ModeBelief 型** → downstream（necessityGate / explanationCopy / mobilityGuidance / card）**不変**。
- pure 核 `buildRepertoireBelief(observations, feedback, selected, query) → ModeBelief`。
- loader `loadRepertoireBelief(query)`。MapTab: `loadWeightedModeBelief(legKey)` → `loadRepertoireBelief(query)`（v0 を内部 floor に含む・1 行 swap）。

## 6. pure 境界
- **pure**: scanObservations / odKey 構築 / 階層 group + 閾値選択 / precision JOIN / buildRepertoireBelief。
- **wiring（GO 待ち）**: MapTab の belief source swap。

## 7. 段階
- **L1-b-1 ✅ 実装済**（branch claude/second-self-map-wave1-l1・commit `d4952fae`・117 mobility test）: pure `buildRepertoireBelief` + loaders + tests（★empty obs → v0 完全同一＝退行ゼロ test PASS）。`precisionWeight` を beliefReadAdapter から export 再利用。
- **L1-b-2 ⏳ CEO 承認待ち**: MapTab belief swap（`loadWeightedModeBelief` → `loadRepertoireBelief`）＝**production 反映**（OD 一般化で legKey-cold leg が surface し得る・floor で退行なし）。Wave 1 GO の「UI本接続/production反映はCEO承認待ち」に従い gate。

## 8. リスク / 独立論点
| 論点 | 方針 |
|---|---|
| odKey が legKey を override するか | **legKey 強データ時は legKey 優先・cold 時のみ odKey fallback**（override しない）。override 型(blend) は L4 partial-pooling |
| 層分割で各 cell 希薄 | 閾値 fallback で粗へ・floor=legKey。正式 shrinkage は L4 |
| surface 条件変化 | floor=v0 で減らない・cold leg に surface が増える（改善）。正直に報告 |
| sensitive 漏れ | redacted は OD 集約から除外（L1-a で place key null） |
| place key crude（text 揺れ） | L1-a 正規化で吸収・placeId 昇格は別承認 |
| recency | L1-b に入れない（L3/selective forgetting・素朴 decay 禁止） |

## 9. CEO 判断点（L1-b 実装 GO 前）
1. legKey-vs-odKey 意味論：**legKey 優先＋cold 時 odKey fallback（override しない）** で良いか（blend は L4 へ）。
2. 階層の層順 + 採用閾値（例: 加重 total≥3 で採用）で良いか。
3. OD 集約も precision 加重（feedback JOIN）するか、まず uniform で始めるか。
4. timing：今 code を書く（empty obs→v0 fallback で無害）か、観測データが溜まってからか。

## 10. 参照
- L1 全体: `docs/second-self-map-wave1-l1-mini-design.md`
- v0-F（precision 加重）: `docs/second-self-map-v0f-mini-design.md`
- L1-a: `lib/plan/mobility/mobilityObservationStore.ts`（branch claude/second-self-map-wave1-l1）
