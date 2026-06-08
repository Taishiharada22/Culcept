# Life Ops 縦拡張 — Deadline model（期限逆算）+ 事務の期限もの mini-design【pure 実装可・横/UI/外部停止】

> 2026-06-09 / Life Ops 縦トラック（branch `claude/life-ops-vertical`）
> 参照: boundary §2 L-1・§4 / Appendix A.6 群4・A.8 / L-2 cadence・L-4 event mini-design。
> **CEO 指示**: ④事務/⑤関係/家事へ縦拡張。pure 実装が安全なら実装まで。横/UI/外部/実データ前は停止。

---

## 0. 一行
Life Ops に **deadline model（期日からの逆算）** を新規導入し、**事務の期限もの**（免許/パスポート/税金）を「期日まで N 日 → 準備候補」化する。cadence（経過ベース）と別の時間構造。家事/関係は次 slice。

## 1. 前提を疑った設計判断（時間構造の分類）
| 時間構造 | 例 | model | 状態 |
|---|---|---|---|
| **cadence**（前回→経過） | 美容/買い物/洗濯/掃除/久々連絡 | L-2（実装済） | 美容/買い物 done・家事/久々連絡は cadence 流用で後続 |
| **deadline**（期日→逆算） | 免許/パスポート/税金/記念日 | **本 slice 新規** | 事務の期限もの MVP |
| **recurring**（毎月固定日） | 家賃/クレカ/サブスク | 後続 | — |
| **fixed-weekday**（曜日固定） | ゴミ出し | 後続 | — |
- deadline は L-4 の `daysUntilEvent`（逆算）に近いが、L-4=外部イベント、deadline=**事務そのものの期日**。dueReason は別 kind。

## 2. L-1 拡張（`category-model.ts`・money_admin 群・期限もの 3）
```ts
export type MoneyAdminCategoryId = "license_renewal" | "passport_renewal" | "tax_filing";
export type LifeOpsCategoryId = … | MoneyAdminCategoryId;
```
| id | label | group | cyclic | maxLevelHint | risk | placeQuery | mvp |
|---|---|---|---|---|---|---|---|
| license_renewal | 免許の更新 | money_admin | false | L1 | [] | null | false |
| passport_renewal | パスポートの更新 | money_admin | false | L1 | [] | null | false |
| tax_filing | 確定申告 | money_admin | false | L1 | [] | null | false |
- A.8「家賃/税金=通知確認のみ」→ **L1（通知中心）**。cyclic=false（周期でなく期日）。家賃/クレカ/サブスク（recurring）は後続。

## 3. Deadline model（新規 `deadline-engine.ts`・pure）
```ts
export type DeadlinePhase = "unknown" | "not_yet" | "within_lead" | "overdue";
export interface DeadlineSpec { categoryId: LifeOpsCategoryId; leadDays: number; } // 期日の何日前から準備期
export interface DeadlineObservation { categoryId: string; deadlineISO: string | null; } // 期日（注入・null=不明）
export interface DeadlineStatus { phase: DeadlinePhase; daysUntilDeadline: number | null; leadDays: number; }
export function computeDeadlineStatus(spec, deadlineISO|null, nowISO): DeadlineStatus;
export function generateDeadlineCandidates(observations, nowISO): readonly LifeOpsCandidate[];
```
MVP deadline specs（leadDays）: license_renewal=30 / passport_renewal=60 / tax_filing=21。

## 4. phase 計算（断定しない・unknown 優先）
```
deadlineISO null / 不正 → unknown
daysUntil = daysBetween(now, deadline)   (L-2 helper 再利用)
daysUntil < 0            → overdue（期日超過・事実）
0 ≤ daysUntil ≤ leadDays → within_lead（準備期）
daysUntil > leadDays     → not_yet
```
候補化: **within_lead / overdue のみ**。not_yet/unknown は出さない。overdue も「期日を過ぎている」事実提示（断定でなく）。

## 5. 型 / dueReason 拡張（`candidate-types.ts`）
```ts
export interface DeadlineDueReason { kind: "deadline"; daysUntilDeadline: number; leadDays: number; overdue: boolean; }
export type DueReason = CycleDueReason | EventPrepDueReason | DeadlineDueReason;
```
`dueReasonPhase` は deadline → undefined（経過段階の概念なし）。candidate は placeQuery=null/level=L1/risk=[]（L-1 から）・menu=null・suggestedWindow=null（横 R2）。

## 6. 厳守 / 非スコープ
- pure・deterministic（now 注入）・**deadline 注入**（実データ源/calendar 非接触）・横エンジン非 import・barrel 非 export。
- **非スコープ**: 家事(cadence 流用)・久々連絡(cadence・**下書きのみ/勝手に連絡しない**)・記念日(deadline 流用だが関係は別 slice)・recurring(家賃/クレカ/サブスク)・ゴミ出し(曜日)・横接続/UI/通知/外部/実データ源。

## 7. テスト
- L-1: money_admin 3 カテゴリ・cyclic=false・L1。件数 17→20。
- deadline-engine: computeDeadlineStatus（unknown/not_yet/within_lead/overdue 境界）・generateDeadlineCandidates（within_lead/overdue 候補化・not_yet/unknown skip・昇順）。
- 回帰: L-1/L-2/L-3/L-4 不変（deadline は別経路）。

## 8. 停止
実装着地後、横 R2 接続/UI/通知/実データ源 前は設計レビュー（CEO 指示）。次の縦候補は家事(cadence)・⑤関係(連絡=下書きのみ)・recurring(家賃等)。
