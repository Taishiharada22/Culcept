# A1 —「あなたのペース」(S3) audit + mini-design（★設計上の重要発見あり）

> 2026-06-08 / Build Unit / roadmap v2.1 Phase A1（原典 Wave 2 残・Day Rehearsal 精度向上）。
> CEO 指示: 捏造せず・取れない場合は unknown / not_enough_signal・pure-first・UI は次判断。

---

## 1. ★audit の核心発見（捏造禁止ゆえ正直に）
**「あなたのペース＝実移動から個人化した移動時間」は、現状のデータでは直接は作れない。**
- ❌ **実到着/完了 timestamp が無い**: `completedAt/arrivedAt/actualStart/actualArrival/doneAt` 等 grep 0 件。**GPS も実到着も無い** → **真の移動所要（actual travel time）は観測不能**。
- `estimatedDurationMin`（transport/route）は **generic 見積**（Google/heuristic）であって個人値でない。
- `mobilityObservationStore`（L1-a）は mode/timeband/weekday/odKey を持つが **gap も estimate も持たない**。
- reality `behind_pace` は介入層(HELD)の DeviationKind enum で、利用可能な local actual データではない。

→ 距離→時間の捏造（HARD GATE 禁止）をしない限り、**measured pace（実速度）は出せない**。

## 2. では「何が観測できるか」（唯一の honest signal）
**ユーザーが各 leg に確保した「予定上の余白(gap)」と route estimate の関係**は観測可能：
- DayGraph の anchor 時刻 → 連続 anchor 間の gap（= その移動に充てた時間）。
- feasibility が既に算出: `slackMin / shortfallMin`（= gap − estimate）と `durationMin`（= estimate）と status。
- → **time-budget tendency**: その leg/OD で estimate より**多めに取る傾向 / 余裕なく取る傾向**。

★ただしこれは **「予定の組み方の癖」であって「実際の移動速度」ではない**（honest 区別）。かつ outcome（実際に間に合ったか）が無いので「tight でも本人は実は間に合う」かは判定できない。よって **弱い signal** であることを明記する。

## 3. mini-design（honest 版・案A: time-budget tendency pure layer）
S3 を「measured pace」でなく **「time-budget tendency（予定余白の傾向）」**として honest に再定義した pure 層：
```
PaceObservation = { legKey; odKey?; estimateMin; availableMin; mode }  // availableMin=その leg に確保した gap
personalPaceTendency(observations, config?) →
  { legKey/odKey; tendency: "allows_more" | "typical" | "allows_tight"; strength: enum; n } |
  { status: "not_enough_signal" | "unknown" }
```
- ratio = availableMin / estimateMin を leg/OD 単位で集約 → 一貫して >1+margin なら allows_more、<1−margin なら allows_tight、混在/中間は typical。
- ★readiness: 最低観測数（例 3）未満 or estimate 不在 → **not_enough_signal**。estimate が取れない leg は **unknown**。
- ★**生の分数を出さない**（tendency は enum・「○分速い」等の数値を作らない＝捏造回避）。trait にしない（per-leg/OD の傾向）。mode 固定化しない。
- Day Rehearsal への利用は **soft hint のみ**（「この区間は余白を多めに取る傾向」程度・estimate を hard 上書きしない）。

## 4. ★capture が未存在（重要・honest）
PaceObservation を貯める仕組みが**まだ無い**（observation store に gap/estimate なし）。よって：
- 本 pure layer は **computation のみ**（observations を引数で受ける・A0-1 と同型）。
- **capture（feasibility/DayGraph から PaceObservation を観測記録する配線）は別 slice**（observation store 拡張 or 新 store・MapTab 配線）＝次工程。
- capture 無しでは pure layer は data 0 → 当面 inert（A0-1 と同じ性質・蓄積で立ち上がる）。

## 5. ★CEO 判断点（設計の岐路・stop gate「既存設計と矛盾する発見」）
原典 S3「実移動から個人化した移動時間」の前提（actual signal）が**存在しない**ため、方向を選ぶ必要があります：
- **(A) honest tendency v0 を作る**: §3 の pure layer（time-budget tendency・unknown gate）。honest だが弱い signal + capture も要る。
- **(B) S3 を defer**: actual signal（将来の到着 capture 等）が出るまで保留。今は作らない（inert 回避）。
- **(C) S3 を別の観測可能で価値ある signal に reframe**: 例「予定の余白の取り方の癖」を Day Rehearsal の tight/breaks 感度の個人化に使う（ただし outcome 無しで限界あり）。

→ **私の推奨**: measured pace は不可と確定したので、原典の文言に固執せず **(A) を「time-budget tendency」として honest に作る**のが筋（pure-first・unknown gate・捏造なし・Day Rehearsal の soft 個人化に効く）。ただし capture が要るため value は蓄積後。**(B) defer も合理的**（より強い actual signal を待つ）。

## 6. 禁止遵守
距離→時間の捏造なし / mode 固定化なし / Google・external API なし / DB なし / production なし / Reality なし / notification なし / UI 実装なし / tsc cleanup なし。

## 7. backlog
- **warm day-briefing**（Day Rehearsal の 1 日を穏やかに語る UX）は **backlog**（CEO 指示・A1 で精度を上げた後に戻る）。
