# A2-2 — Context Modifier pure connection layer closeout + A2-3 計画（★UI 表示 stop gate）

> 2026-06-09 / Build Unit / pure glue・belief/UI/DB 非接触・flag OFF ゆえ **main 直接着地**。

---

## 実装した（A2-2 pure connection layer）

`lib/plan/context/contextBridge.ts`（pure・A2-1 core を /plan に繋ぐ glue・render なし）:

1. **`buildDayContextSnapshot(primitives)`** — /plan の一次情報（density / baseEnergyLevel / 当日 travel 分）から **day-level** ContextSnapshot を組む。
   - ★source を事実に即して付与（density/travelLoad=observed・energy=derived）。
   - ★weather は /plan 未配線ゆえ載せない（external API gate を踏まない・degrade）。
   - ★既知 travel 0 件 → travelLoad を載せない（捏造しない）。travelLoad は既知分のみ合計→light(<30)/moderate/heavy(≥90)。
   - ★point-level 信号（timeBand/positionInDay）は day-level に乗せない（過剰主張回避・leg 用は将来）。
2. **`contextToDecisionContext(snapshot)`** — snapshot.weather を既存 `mobilityHypothesis.DecisionContext` へ投影。出所不明 weather は渡さない。cold/normal→normal。★`todayLikelyMode` を変えない既存 guardrail を保持（mobility 側）。
3. **`buildContextOutlook(modifier)`** — modifier → UI 向け view-model `{ reasonLine, softenConfidence, knownSignalCount }`。★`softenConfidence` は **copy を控えめにするだけ**で DayRehearsal の数値（viability/strain）に触れない。

## ★安全境界（全 stop gate クリア）
- belief: read も write もしない（一次情報＝引数のみ・store 非接触）。
- 偽数値: なし（snapshot は category・outlook は定性 + reason 文字列）。travelLoad は既知分の実合計のみ。
- source 断定回避: 出所不明 weather は投影しない。
- sensitive: snapshot/primitives に場所/同伴者なし。
- UI/DB/API: render なし・DB なし・jma 呼ばない・flag OFF。

## テスト / tsc / lint
- 新規 **11 tests PASS**（snapshot 組み立て・travelLoad 閾値/既知のみ・round-trip・DecisionContext 投影・outlook view-model）。
- context dir 計 **33 PASS**（A2-1 22 + A2-2 11）。自変更 tsc footprint **0**（baseline 55）。eslint clean。

---

## A2-3 計画 + ★判断 = **UI 表示 stop gate（CEO 判断）**

### A2-3: context reason の実 UI 表示 + 決定路配線
- 内容: `CalendarTab` で `buildDayContextSnapshot → buildContextModifier → buildContextOutlook` を決定時に計算し、**`DayOutlookBanner` の reason 行に `reasonLine` を追記**（softenConfidence 時は「今日は当てにくい」を添える）。MapTab では `contextToDecisionContext` を `buildMobilityHypothesis` に供給（既存 contextNote 路）。
- gate: `isContextModifierEnabled()`（flag ∧ 非 production）。necessity gate（knownSignalCount≥1 ∧ reasonLine≠null）でのみ表示。沈黙原則。

### ★stop 判断 = ここで自律を止める（UI 表示 stop gate）
- A2-3 は **ユーザーに見える文言を実際に render** する＝CEO stop gate「UI 表示が必要になりそう」に明確に該当。
- 加えて user-facing ゆえ **branch + 実機 smoke** が要る（過去の user-facing 着地パターン）。
- → ★**A2-3 は自律で進めない。pure 基盤（A2-1 core + A2-2 bridge）を main 着地させ、UI 表示は CEO 判断**。

### A2 の到達点（honest）
- **A2 pure 層は完成**: core（snapshot 型 / modifier / reason）+ bridge（plan→snapshot / mobility 投影 / outlook view-model）。全 pure・belief 非接触・flag OFF で dormant。
- 次の実質前進は全て **CEO 判断 or データ/配線**:
  1. **A2-3 実 UI 表示**（DayOutlookBanner 追記）= UI stop gate（branch+smoke・CEO）。
  2. **weather 配線**（jma → snapshot.weather）= external API stop gate（CEO）。
  3. **personal grounding**（general 一般則 → 本人の条件別観測で grounding:"personal" 化）= 条件別データ捕捉が要る（weather/state を移動に紐付け＝capture 設計・sensitive/外部依存の検討＝CEO）。

## ★まとめ
A2 の安全側 pure 基盤（条件付けエンジン + plan 接続 glue）は出尽くした。全 flag OFF で休眠。次は **UI 表示（A2-3）/ weather 配線 / personal 化** のいずれも CEO 判断 or 新規データ捕捉が前提。自律バッチはここで **stop** し、CEO の方針（A2-3 UI を実機 smoke 込みで進めるか / weather 配線を許すか / 別テーマか）を仰ぐ。
