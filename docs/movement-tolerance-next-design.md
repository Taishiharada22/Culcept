# Movement Tolerance 次設計 — UI 表示 + Day Rehearsal 反映（★design only・実装は CEO stop gate）

> 2026-06-09 / Build Unit。pure engine（`movementTolerance.ts` `b8a1f207`）+ A0 corroboration（`movementToleranceCorroboration.ts`）着地後の次設計。
> ★本書は **mini-design のみ**。UI 表示 / Day Rehearsal 実反映は CEO stop gate ゆえ **実装しない**。

---

## 0. 現状（pure 層・全 dormant）
- `movementTolerance.ts`: mode-effort の **行動シグナル（implicit）**→ 条件別 low-load skew（雨/雪/荒天/暑さ・夕方/夜・平日/週末）。本人 baseline 比・sufficient gate・観測トーン。
- `movementToleranceCorroboration.ts`: A0 reason の **自己申告（explicit）**→ global な physical-load 回避 corroboration（tired・条件非依存）。
- ★両者は **convergent evidence**（implicit×explicit）。だが store に条件 key が無く A0 は **条件別に結合できない**（global のみ）。

## 1. UI 表示 design（★stop gate＝user-facing UI・実装は CEO）
### どこに出すか（候補）
- **案A（推奨・最小）**: MapTab の Mobility Hypothesis Surface に **「移動の傾向」副行**を追加（per-leg 仮説の下・slate-400 1行）。既存 A2-7 weather note と同じ控えめ表示形。
- 案B: PRG/Second Self 自己理解ダッシュボードの 1 セクション（新サーフェス・大 UI＝別フェーズ）。
- 案C: 設定/振り返り内の静的セクション。

### 表示原則（既存 Place Affinity reason-only / A2-3 と同規律）
- flag default **OFF + dev-only** gate（`isXEnabled()=flag ∧ NODE_ENV!=="production"`）。
- `movementToleranceReasonLine`（条件別・implicit）と `movementToleranceCorroborationLine`（global・explicit）を **別々の行**で表示。
  - ★**融合禁止**: 「雨の日は…」（条件別・行動）と「疲れを理由に挙げる」（global・自己申告）を 1 文に混ぜない＝条件が自己申告で裏づいたと誤読させない（HONESTY 制約）。
- 観測トーン・**trait/人格化なし**・数字なし・ready/corroborate でなければ沈黙・read-only（mode/ranking/viability を変えない）。
- sensitive/redacted 由来は出さない（engine が mode のみ使用ゆえ場所 key 非露出）。

### 配線（実装時の seam・参考）
- `loadAllObservations()`（既存）→ `buildMovementTolerance` / `loadHypothesisFeedbackStore()`→ `buildMovementToleranceCorroboration`。
- 今日の予定 anchor から条件（timeband/weekday は derive・weather は `useTodayWeather` A2-6 再利用）を出し、該当条件の signal のみ surface（任意・全 signal 列挙でも可）。

## 2. Day Rehearsal 反映 design（★stop gate＝Day Rehearsal 実反映・実装は CEO）
### 何を変えるか
- Rehearsal（`rehearseDay` forward simulation）の **per-leg friction/strain 見積もり**に、移動耐性の **personal modifier** を **決定時のみ** かける。
- 条件: (movement tolerance ready) ∧ (該当 leg が high-effort mode＝walk/bicycle) ∧ (今日の条件が avoidsLoad signal に一致)。
- 効果: friction を **widenUncertainty**（「この条件は負荷を感じやすいかも」soft note）。★viability を hard に変えない・mode を変えない。

### ★A2 規律の踏襲（最重要）
- belief/正本を **書き戻さない**（modifier は決定時 overlay のみ）。
- 偽の確率/数値を作らない（定性 note・bounded）。
- sufficient gate（薄ければ一般則のまま＝personalize しない）。
- ★A0 corroboration は **rehearsal の条件別 friction には使わない**（global ゆえ条件に紐付かない）。使うなら「全体として負荷自己申告がある」程度の独立 note に留める。
- Life Ops に接続しない。

### 関係整理
- **personal pace（A1）** = 実移動**時間** → rehearsal の **所要時間**補正。
- **movement tolerance（本軸）** = 移動**負荷の選び方** → rehearsal の **friction/strain** 補正。
- **A2 context modifier** = 今日の文脈（天候/密度/energy）→ rehearsal 全体 tilt。
- → 3 つは別の補正点（時間・friction・全体 tilt）に作用。重複適用しないよう注入点を分離。

## 3. 関係: weather / timeband / density / place affinity
- weather/timeband/weekday = movement tolerance の条件（観測に在る）。
- **density** = MobilityObservation に無く対象外（将来 density tag 要・新規データ＝stop gate）。
- **place affinity** = 「どこが合うか」（場所軸）・直交。far place 回避は place affinity の距離信号で別途。movement tolerance は「移動の負荷形態の選び方」。

## 4. データ依存（両 design 共通）
- 両 signal とも **dogfood 蓄積待ち**: movement tolerance は MobilityObservation ≥8 + 条件下 ≥4。corroboration は A0 reason ≥5（A0 は triple-gate＝仮説表示→訂正→reason tap ゆえ特に sparse）。
- → enable は **蓄積後 + CEO 判断**。pure 層は先行着地済み（dormant・全 flag 概念上 OFF）。

## ★stop gate（本書で実装しないもの）
UI 表示（user-facing）/ Day Rehearsal 実反映 / 新規データ保存（density tag 等）/ Life Ops 接続 / DB / external API / 人格診断・trait 表現。

## 次
①UI 表示 or Day Rehearsal 反映の **実装は CEO 判断**（本 design 承認後）。
②次の pure 増分候補: mode-effort の距離交絡補正（personal pace duration / place 距離で補正＝要データ・設計）。
