# Life Ops ⇄ 横 R2 統合契約（縦の出口 spec・本流調整用）【縦側 ready・横配線は本流】

> 2026-06-09 / Life Ops 縦トラック（branch `claude/life-ops-vertical`）
> 参照: `docs/life-ops-boundary-and-handoff.md` §4 統合契約 / candidate-collector.ts / candidate-types.ts。
> **状態**: 縦側の出口（`collectLifeOpsCandidates`）は実装・テスト済。**横 R2 の受け口（empty-day plan builder）は main 未実装**（`emptyDayObservation.ts` は検出のみ・`LifeOpsCandidate` を consume する R2 は 0 件）。
> **本 doc は本流（横エンジン）セッション向けの seam spec**。横 R2 配線は本流が実装（Life Ops は横を import/変更しない）。

---

## 0. seam（1 関数で受け渡し）
```
Life Ops 縦（このトラック）                     横 R2（本流・empty-day plan builder）
collectLifeOpsCandidates(inputs, nowISO)  ──▶  R2 が consume し、1 日に配置・3 案化・window 確定
  : readonly LifeOpsCandidate[]                  （Life Ops は配置/window/通知を作らない）
```
- 横 R2 は **`@/lib/lifeops/candidate-collector` の `collectLifeOpsCandidates` だけ** import すればよい（個別 4 経路を知らなくてよい）。
- Life Ops は横 R2 を **import しない・呼ばない**（境界）。依存方向は **横→縦の一方向**。

## 1. 縦の出力型（`candidate-types.ts`・正本）
```ts
interface LifeOpsCandidate {
  category: LifeOpsCategoryId;          // 20 カテゴリ（美容/準備/買い物/事務）
  menu: BeautyMenu | null;              // 美容のみ cut/color、他 null
  dueReason: CycleDueReason | EventPrepDueReason | DeadlineDueReason; // 下記 §2
  suggestedWindow: null;                // ★R2 が予定/移動/天気から確定する（縦は null）
  placeQuery: string | null;            // 店舗検索語ヒント（"美容室"等・null=店舗不要）。実検索は L-6
  permissionLevelHint: "L0".."L5";      // 縦の既定ヒント。★L-7 が正本確定（横 R5 と整合）
  riskFlags: readonly LifeOpsRiskFlag[];// 自動予約抑止の素（appearance_change/cancellation_fee/health_sensitive 等）
}
```
入力 `LifeOpsInputs`（全て**注入**・横/縦どちらが集めるかは別途・実データ源は CEO ゲート）:
`cadenceObservations`(前回完了日) / `upcomingEvents`(近接イベント) / `deadlineObservations`(期日)。

## 2. dueReason 解釈ガイド（横/presenter が文言化・縦は事実のみ）
| kind | 意味 | 主フィールド | 文言の方向（断定しない） |
|---|---|---|---|
| `cycle` | 周期で整えどき | elapsedDays / typicalIntervalDays / phase(beyond_typical\|well_beyond) | 「前回◯日・標準約◯日」 |
| `event_prep` | イベント前準備 | eventKind / daysUntilEvent / recommendedLeadDays / cyclePhase?(美容前倒し時のみ) | 「◯日後の面接前・数日前が自然」 |
| `deadline` | 期限もの | daysUntilDeadline / leadDays / overdue | 「期日まで◯日／期日を過ぎている」 |

## 3. 横 R2 がやること / Life Ops に期待しないこと
**R2 がやる**: ①candidate を 1 日の空き・予定・移動・天気・記憶(R1)から**配置**し `suggestedWindow` を確定 ②**3 案（守る/楽/攻める）**化 ③recommended-first 提示 ④R4 が trigger/通知。
**Life Ops に期待しない（縦は持たない）**: 配置ロジック・window 確定・3 案・記憶/移動/天気の統合・通知・UI・外部 API・予約・実データ収集。

## 4. permissionLevelHint と L-7
縦の `permissionLevelHint` は **非正本ヒント**（cosmetic L3/medical・admin L1/upkeep L2）。カテゴリ別 Permission の正本は **L-7**（横 R5 汎用 Level を特殊化）。R2/L-7 はこのヒントを出発点に、`riskFlags`（§安全設計）で Phase3-4（入力補助/自動予約）を gate（CEO ゲート）。

## 5. 本流への申し送り（調整事項）
1. 横 R2（empty-day plan builder that consumes `LifeOpsCandidate[]`）を**本流が実装**。縦は `collectLifeOpsCandidates` を提供済。
2. 入力（observations/events）の**実データ源**（前回完了日・calendar イベント・期日）は別 slice・**新規収集は CEO ゲート**（calendar 推定は誤検出多く保留）。当面は注入で結合テスト可能。
3. `LifeOpsCandidate` 型に横 R2 が追加で必要とする情報があれば、`candidate-types.ts`（縦正本）に追記を縦へ依頼（横で別型を作らない＝二重定義回避）。

---
**縦側 ready / 横配線は停止**: `collectLifeOpsCandidates` 実装・84 tests PASS。横 R2 の実配線は本流の設計レビュー後（CEO 指示）。
