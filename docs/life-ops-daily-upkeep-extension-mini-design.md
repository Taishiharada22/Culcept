# Life Ops daily_upkeep 拡張（②買い物/日用品）mini-design【pure 実装可・横/UI/外部は停止】

> 2026-06-09 / Life Ops 縦トラック（branch `claude/life-ops-vertical`）
> 参照: boundary §2 L-1・L-2・§4 / Appendix A.6 群2・A.8・A.9② / L-1〜L-4 mini-design。
> **CEO 指示**: ②買い物/日用品（daily_upkeep）へ縦拡張。pure 実装が安全なら実装まで。横接続/UI/通知/外部/実データ前は停止。

---

## 0. 一行
daily_upkeep（生活維持）群の **補充系 2 カテゴリ**（食料品/日用品）を L-1 に足し、L-2 に補充 cadence を足す。**L-3 が自動で「そろそろ補充」候補を出す**（cadence agnostic・L-3 改変不要）。L-4(a) は body_appearance のみ前倒しに絞る修正のみ。

## 1. 前提を疑った設計判断
- **補充=cadence 流用**: 食料品/日用品は「前回購入→消費し切る間隔」＝美容と同じ interval cadence 構造。**L-2/L-3 がそのまま効く**。
- **後続に回す**: 家事（洗濯/掃除）=頻度別ロジック・**ゴミ出し=曜日固定**（interval でない）・不定期（クリーニング/フィルタ/不用品）=周期曖昧。MVP は補充系のみ（③シンプル）。
- **L-4(a) 誤動作の発見**: cadence agnostic ゆえ daily_upkeep を L-4(a) に渡すと「面接前に食料品を nearing 前倒し」になる。→ **L-4(a) を body_appearance 群のみ前倒し**に絞る（外科的フィルタ）。daily_upkeep は周期(L-3)でのみ出す。

## 2. L-1 拡張（`category-model.ts`・daily_upkeep 群 2 カテゴリ）
```ts
export type DailyUpkeepCategoryId = "groceries" | "daily_necessities";
export type LifeOpsCategoryId = BodyAppearanceCategoryId | PreEventPrepCategoryId | DailyUpkeepCategoryId;
```
| id | label | group | cyclic | maxLevelHint | risk | placeQuery | mvp |
|---|---|---|---|---|---|---|---|
| groceries | 食料品の買い物 | daily_upkeep | true | L2 | [] | スーパー | false |
| daily_necessities | 日用品の補充 | daily_upkeep | true | L2 | [] | ドラッグストア | false |
- A.8: スーパー=買い物候補+寄るタイミング / 日用品=補充リマインド+購入候補 → **L2（候補提案）**。purchase 導線は L-6（CEO ゲート）。

## 3. L-2 拡張（`cadence-model.ts`・補充 cadence）
| categoryId | menu | typicalIntervalDays | nearing | beyond |
|---|---|---|---|---|
| groceries | null | 4（生鮮は数日・週1-2回が一般） | 0.8 | 1.0 |
| daily_necessities | null | 14（日用品は約2週間） | 0.8 | 1.0 |
- default。個人の買い物ペース学習は L-9 が override（美容と同じ構造）。`MVP_CADENCES` に追加（listMvpCadences は美容3+買い物2=5）。

## 4. L-4(a) 外科的修正（`event-preparation.ts`）
`generateEventPrepCandidates`: observation の categoryId → `getCategorySpec(id).group === "body_appearance"` のみ前倒し対象（daily_upkeep/その他群は skip）。→ 「外見イベント前倒し」は美容に限定。daily_upkeep は L-3（周期）でのみ候補化。

## 5. L-3 は自動対応（改変なし）
`generateLifeOpsCandidates` は cadence agnostic。daily_upkeep observation（categoryId=groceries 等・lastCompletedAt=前回購入日）を渡せば、beyond_typical 以上で cycle 候補を生成。placeQuery/level/risk は L-1 から自動。**L-3 ファイル不変**。

## 6. 厳守 / 非スコープ
- pure・no-DB・no-external-API・no-UI・observation/events 注入（実データ源/calendar 非接触）・横エンジン非 import・barrel 非 export。
- **非スコープ**: 家事(洗濯/掃除)・ゴミ出し(曜日固定)・不定期(クリーニング/フィルタ/不用品)・**購入導線(L-6 ゲート)**・「ついで動線」最適化(横 R2+場所軸)・横接続/UI/通知/実データ源。

## 7. テスト
- L-1: daily_upkeep 2 カテゴリ・group・cyclic=true・level L2・placeQuery 文字列。件数 15→17。
- L-2: groceries(4)/daily_necessities(14) cadence・listMvpCadences=5。
- L-3 回帰+新規: daily_upkeep observation が beyond で cycle 候補化（categoryagnostic 実証）。美容回帰不変。
- L-4(a) 回帰+新規: 美容は前倒し継続・**daily_upkeep を渡しても前倒しされない**（group フィルタ）。
- L-4(b)/既存: 不変。

## 8. 停止
実装着地後、横 R2 接続/購入導線(L-6)/UI/通知/実データ源 前は設計レビュー（CEO 指示）。次の縦候補は家事/曜日固定ゴミ出し（別ロジック）or L-5 Morning Briefing（横接続・監査）。
