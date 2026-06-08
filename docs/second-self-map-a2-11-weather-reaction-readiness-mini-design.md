# A2-11 — Weather Reaction Readiness / Personal Overlay mini-design + pure engine（★live 反映しない）

> 2026-06-09 / Build Unit / 設計 + pure engine 実装（未配線）。★実 personal 反映（UI/決定）は **しない**（実測データ + CEO 判断）。

A2-10 で貯め始めた weatherKind 付き観測から「この人は天気で行動を変えるか」を判定する readiness/overlay。

---

## 1. 目的 + 信号設計（前提を疑う）
本人 weather reaction の最も honest な信号 ＝ **OD ごとの mode 選択が天気で変わるか**。
「雨の日はこの区間で電車に寄る／普段は自転車」のような **観測パターン**（trait でなく if-then の行動）。

## 2. 実装した（pure engine・★未配線）
`lib/plan/mobility/weatherReactionReadiness.ts`:
- `buildWeatherReactionReadiness(observations[1 OD分], weather, config)` → `{status, weather, nUnderWeather, nBaseline, leansToward?, usualMode?}`。
- status: `not_enough`（weather 下 or baseline が minObs 未満）/ `no_personal_signal`（modal が baseline と同じ・tie）/ `personal_reaction`（weather 下 modal ≠ baseline modal → leansToward）。
- ★weatherKind 無し / redacted 観測は集計から除外（A2-10 で redacted は weatherKind を持たない）。
- ★**偽数値なし**（status + 実カウント n + 定性 modal のみ）・確率/係数なし。pure・store 非 write。
- ★**live 反映しない**（UI/決定に未配線）。9 tests。

## 3. 設計判断（精査）
### 3-1. readiness 閾値
- `minObs=4`（weather 下・baseline の双方）。薄いデータで personalize しない（density baseline と同思想）。固定・較正 backlog。
### 3-2. 一般則 vs 本人固有の優先順位
- `personal_reaction`（sufficient ∧ modal 差あり）→ **本人固有を優先**（grounding="personal"）。
- `no_personal_signal` / `not_enough` → **一般則（A2-8）に fallback**（personal を捏造しない）。
### 3-3. thin data fallback
- not_enough → 一般則 weather（雨/雪/荒天/暑さ→tightens slight）。沈黙でなく一般則に委ねる。
### 3-4. ★UI 文言（人格診断にしない）
- ✅ 観測トーン・leg 単位・仮説: 「雨の日は、この区間では電車を選ぶことが多いようです」。
- ❌ trait/人格ラベル: 「あなたは雨を避けるタイプ」「out-of-door 嫌い」等は **禁止**（既存 mobility hypothesis の observed-not-trait 原則を継承）。
- ❌ 偽の確率/件数を文言に出さない。

## 4. ★stop（ここまで・live 反映しない）
本 engine を **live 反映**（決定/UI に配線）するには:
- **実測データが要る**（weatherKind 付き観測が OD ごとに minObs 貯まる＝A2-10 capture の蓄積を待つ）。
- **personal weather reaction の UI 表示**＝stop gate（CEO）。
- enable は CEO 判断（A2 の段階的有効化方針）。
→ ★engine は **未配線で着地**し、live 反映は実測データ蓄積 + CEO enable まで止める（CEO 明示「実 personal反映はまだ止める」）。

## 5. A2 の到達点
- **A2 weather: 一般則（A2-1〜8）+ capture（A2-10）+ personal readiness engine（A2-11・未配線）** まで完成。
- ★残るのは **実測データ依存 + CEO 判断のみ**:
  1. weatherKind 観測の蓄積（A2-10 capture を dogfood で貯める・実データ）。
  2. personal overlay の live 反映（UI 表示 + 決定配線）＝CEO enable + UI stop gate。
  3. production 露出＝CEO/法務。
→ 「実測データが必要なもの」を除けば、**A2 の安全に自律実装できる範囲はここで完了**。

---

## 次
A2-11 engine 着地（未配線）。実 personal 反映は実データ蓄積 + CEO 判断。A2 weather トラックは（実データ依存を除き）完了。
