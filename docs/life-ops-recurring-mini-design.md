# Life Ops 縦拡張 — recurring 時間構造 + 事務 recurring mini-design【pure 実装可・実データ源はゲート】

> 2026-06-09 / Life Ops 縦トラック（branch `claude/life-ops-vertical`）
> 参照: boundary §2 L-1〜L-3 / Appendix A.6 群4・A.8 / candidate-types / deadline-engine（類似）/ category-model。
> **CEO 指示**: local のみで進められる範囲を計画＆実装継続。縦拡張は凍結解除（local-only・pure）。実データ源/横接続/外部前は停止。横非 import 継続。

---

## 0. 一行
**4 つ目の時間構造「recurring（毎月/毎年の繰り返し日）」**を pure engine で追加し、**事務 recurring（家賃/クレカ/サブスク・毎月）**を候補化する。1 engine で将来の関係（誕生日/記念日・毎年）も解錠。

## 1. 設計判断（前提を疑った結果）
- **既存 3 時間構造**: cadence(前回→経過)・event(イベント近接)・deadline(固定期日→逆算)。recurring は **「繰り返す期日」**＝deadline と似るが**次の発生を自動算出**（過ぎたら次の月/年へ）。overdue 概念なし（次は常に upcoming）。
- **monthly + annual を 1 engine**: 家賃=毎月 dayOfMonth / 誕生日=毎年 month-day。共通「次の発生日まで N 日」。**本スコープは monthly カテゴリのみ実装**・annual は engine で対応＋テストのみ（関係カテゴリは次スライス）。
- **日付は注入**: dayOfMonth/month-day は per-user（実データ＝注入）。category は recurrence 種別と leadDays（default）を持つ。

## 2. 型 / API（実装 `lib/lifeops/recurrence-model.ts`）
```ts
export type RecurrencePhase = "unknown" | "upcoming" | "within_lead";
export type Recurrence =
  | { readonly kind: "monthly"; readonly dayOfMonth: number }        // 1-31（月末超は当月末にクランプ）
  | { readonly kind: "annual"; readonly month: number; readonly day: number }; // month 1-12
export interface RecurringObservation { readonly categoryId: string; readonly recurrence: Recurrence; }
export interface RecurringStatus { readonly phase: RecurrencePhase; readonly daysUntilNext: number | null; readonly leadDays: number; }
export function nextOccurrenceISO(recurrence: Recurrence, nowISO: string): string | null; // pure・UTC
export function computeRecurringStatus(leadDays: number, recurrence: Recurrence, nowISO: string): RecurringStatus;
export function generateRecurringCandidates(observations, leadDaysOf, nowISO): readonly LifeOpsCandidate[];
```
- **pure・deterministic**: `Date.now`/argless `new Date()` 不使用。`Date.parse(now)`＋`Date.UTC(y,m,d)`／`new Date(ms)`（引数あり=可）で UTC 計算。

## 3. 次発生の算出（pure・UTC・月末クランプ）
```
now = Date.parse(nowISO) → UTC y/m/d
monthly(D): 当月候補 = Date.UTC(y, m, min(D, 当月日数)); 当月候補 ≥ now → それ / else 翌月の同様
annual(M,D): 当年候補 = Date.UTC(y, M-1, min(D, 当月日数)); ≥ now → それ / else 翌年
daysUntilNext = round((next - now)/86400000)
phase: next 不正→unknown / daysUntilNext ≤ leadDays → within_lead / else upcoming
```
当月日数 = `new Date(Date.UTC(y, m+1, 0)).getUTCDate()`（月末クランプ：31日指定でも 2月は28/29 に）。

## 4. 候補化（within_lead のみ）+ dueReason 拡張
- `generateRecurringCandidates`: within_lead のみ候補化（upcoming/unknown は出さない）。daysUntilNext 昇順。
- `candidate-types`: `RecurringDueReason { kind:"recurring"; daysUntilNext; leadDays; recurrenceLabel }` を **DueReason union に追加**。`dueReasonPhase`→undefined（cadence phase なし）。
- 波及（外科的）: `card-presenter.reasonText/urgency`（recurring 文言・「もうすぐ◯日」）/ `collector`（recurringObservations 入力 + generateRecurringCandidates）。permission は hint/risk で既存通り。

## 5. L-1 拡張（money_admin recurring・毎月）
| id | label | group | cyclic | maxLevelHint | risk | placeQuery | mvp |
|---|---|---|---|---|---|---|---|
| rent | 家賃の引き落とし | money_admin | false | L1 | [] | null | false |
| card_payment | カードの引き落とし | money_admin | false | L1 | [] | null | false |
| subscription_review | サブスクの見直し | money_admin | false | L1 | [] | null | false |
- A.8「家賃=通知確認のみ/サブスク=見直し提案のみ」→ **L1**。leadDays: rent=3 / card_payment=3 / subscription_review=7。

## 6. 厳守 / 非スコープ
- pure・deterministic・**横エンジン非 import**・no-DB・no-UI(React は L-8 既存が VM 経由で表示)・no-外部・**日付は注入**（実収集=CEO ゲート）・barrel 非 export。
- **非スコープ（後続/ゲート）**: 関係 annual カテゴリ（誕生日/記念日・次スライス）・実データ源（引き落とし日/更新日の実収集=CEO ゲート）・横R2 配置・通知配送（本流）。

## 7. テスト
- recurrence-model: monthly 次発生（当月/翌月・月末クランプ 31→2月）・annual 次発生（当年/翌年）・within_lead/upcoming/unknown 境界・daysUntilNext。
- generateRecurringCandidates: within_lead→候補・upcoming/不正→skip・昇順。
- 拡張: L-1 money_admin 3 追加・collector に recurring 合流・card-presenter recurring 文言。回帰（全 lifeops）green・tsc footprint 0。

## 8. 停止
本スコープ着地後、関係 annual カテゴリ（次スライス・local 可）/ 家事・成長（local 可）を継続。実データ源・横配置・通知は停止（ゲート/本流）。
