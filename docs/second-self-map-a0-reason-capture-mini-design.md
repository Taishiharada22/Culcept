# A0 — 理由観測（local reason capture）audit + mini-design

> 2026-06-08 / Build Unit / roadmap v2.1 Phase A0（★SOUL の起動点・S6/L2 の一部・master-design Wave 1）
> ★スコープ厳守（CEO 監査 v2.1）: **local reason capture に限定**。Alter 接続 / Stargazer 合流 / DB は A0 では一切やらない（後続 slice・Stargazer DB は production gated）。
> 本書は **audit + mini-design のみ**。実装は CEO GO 後。

---

## 1. なぜ A0 か（魂の起動点）
「移動が自己理解になる」（堀②・鏡）の 5 段は現状すべて未起動。**第一歩＝推奨と違う選択をした時の「なぜ」を捕捉すること**。これが無い限り Alter も鏡も永久に動かない。A0 は**その入力だけ**を作る（出力＝Alter/鏡 は後続）。

## 2. audit（実コード・現状）
- **correction signal は既に存在**: `MapTab.handleLegSelectWithFeedback`（L368）が mode 選択時に `buildFeedbackEntry({surfacedMode, chosenMode, readOnly})` → 仮説と違えば `explicitCorrection` を `hypothesisFeedbackStore` に保存（`saveHypothesisFeedback`）。
- **足りないのは reason だけ**: `HypothesisFeedbackEntry = {kind, surfacedMode, chosenMode}`。**reason field が無い**。
- **gate は既に正しい**: 仮説非表示（cold-start/low-signal/split/sensitive）/ readOnly は `buildFeedbackEntry` が null → 記録しない。reason もこの gate に**自動的に従う**（explicitCorrection が出た時のみ reason を問う）。
- **store は additive 可**: parse/validator は寛容化すれば旧 entry（reason なし）と後方互換。version bump 不要（optional field）。
- 結論: **A0 は既存フローに reason を差すだけ**。新エンジン・新 store・新 tap target 不要。

## 3. mini-design

### 3.1 スキーマ（additive・後方互換）
```ts
// hypothesisFeedbackStore.ts（既存に追加）
export type MobilityReason = "tired" | "scenery" | "cheap" | "hurry" | "mood"; // 疲れ/景色/安い/急ぎ/気分
export interface HypothesisFeedbackEntry {
  readonly kind: RecordedSignalKind;
  readonly surfacedMode: RouteTransportMode;
  readonly chosenMode: RouteTransportMode;
  readonly reason?: MobilityReason;   // ★A0 追加・optional（任意・後付け）
}
```
- `isFeedbackEntry` / `parseFeedbackStore`: `reason` が無効/不在なら**落として entry は有効**（後方互換・version 1 据置）。
- pure helper `withReason(entry, reason): HypothesisFeedbackEntry`（reason を載せた新 entry を返す・clear は reason 省略）。
- `setFeedbackReason(store, day, legKey, reason | null)`: 既存 entry を読み reason 更新（entry 不在なら no-op＝correction が無い所には付かない）。

### 3.2 UX（1-tap・任意・可逆・低侵襲）
- **発火条件**: 直近の選択が **explicitCorrection（仮説と違う mode を選んだ）時のみ**。confirmation / 仮説非表示 / readOnly では出さない。
- **表示**: 当該 leg card の直下に小さく 1 行 `なぜ変えた？` + chip ×5（疲れ/景色/安い/急ぎ/気分）+ さりげない dismiss（×）。**modal でない・blocking でない・必須でない**。
- **1-tap**: chip を押す → reason 記録 → chip 行が `理由: 疲れ` の極小表示に畳まれる（**再 tap で変更/解除＝可逆**）。
- **無視**: 押さなければ reason なしのまま（correction entry は既に保存済）。次操作 or 一定で静かに消える。

### 3.3 配線（最小）
- `hypothesisFeedbackStore.ts`: reason 追加 + withReason + setFeedbackReason + parse 寛容化（pure）。
- `MapTab.tsx`: explicitCorrection になった legKey を state で保持 → reason chip 行を表示 → `handleReasonSelect(legKey, reason)` で store 更新（既存 saveHypothesisFeedback 経路）。
- 新規 `components/plan/map/ReasonChips.tsx`（or MobilityLegCard 内に最小行）: chip 行（read-only でない唯一の操作＝1-tap reason）。
- ★**触らない**: selectedModeStore（正本不変）・belief（reason は belief を動かさない・A0 では学習しない）・Day Rehearsal・Alter・Stargazer・DB。

### 3.4 ★A0 のスコープ外（明示・後続 slice）
- reason → **Alter 接続**（「あなたは疲れた雨の日はタクシー」）= 別 slice（L2 後半）。
- reason → **Stargazer 合流**（mobility 軸・自己発見/M5）= production gated・moonshot。
- reason → **belief 学習への反映**（reason 別に精度を変える等）= 別 slice（要設計）。
- DB 永続化 = gated。
- A0 は **reason を local に捕捉・保存・表示（畳み）するだけ**。

## 4. ethos / HARD constraints
- **任意・可逆・低侵襲**（必須/modal/常時ではない・notification fatigue 回避）。
- **捏造しない**（reason は user の 1-tap のみ・自動推論しない）。
- **人格ラベルにしない**（reason は per-leg の文脈＝「この時はこう」・trait「あなたはこういう人」と言わない）。
- **sensitive / 仮説非表示 / readOnly では出さない**（既存 gate 継承）。
- **client-only / localStorage / DB なし / 後方互換**（旧 entry 有効）。

## 5. test 計画（実装時）
- pure: withReason / setFeedbackReason（entry 有/無・clear・caps 維持）/ parse 後方互換（reason 有/無/不正）/ MobilityReason validator。
- render contract: reason chips は explicitCorrection 時のみ表示 / confirmation・非表示・readOnly では非表示 / 1-tap で畳む / dismiss / modal でない・button 以外の強制 UI なし / 禁止語（人格ラベル）なし。
- tsc footprint 0・plan suite 回帰なし。

## 6. CEO 判断点
1. reason 語彙は **疲れ/景色/安い/急ぎ/気分** の 5 で良いか（「その他」を入れるか・i18n ラベル）。
2. UX は **explicitCorrection 時のみ自動表示**で良いか（or もっと控えめに「…」展開式にするか）。
3. A0 のスコープ＝**local reason capture のみ**で確定で良いか（Alter/Stargazer/DB は別 slice）。

## 7. 次
本 mini-design に GO 後、A0 を実装（pure → UI → test → tsc footprint 0 → local smoke 観点 → main 着地 → closeout）。それまで実装しない。
