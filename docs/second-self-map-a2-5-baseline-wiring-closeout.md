# A2-5 — Personal Baseline の CalendarTab 配線（既存 flag 裏・flag OFF）closeout

> 2026-06-09 / Build Unit / 既存 flag 裏・OFF で完全不変ゆえ **main 直接着地**（flag ON 時のみ文言が本人相対化）。

---

## 実装した
- `CalendarTab` の `contextReason` useMemo（A2-3）内で、`dayGraphByDate` の各日の `graph.attributes.density` を集め `buildDensityBaseline(densities)` → `buildContextModifier(snapshot, undefined, {density: baseline})` に供給。
- import `buildDensityBaseline` 追加。memo 依存に `dayGraphByDate` 追加。

## ★安全境界
- **既存 flag 裏**: 計算は `isContextModifierEnabled()` の gate 内（早期 return より後）。flag OFF → null → baseline 計算も走らない＝**main 完全不変**。
- baseline は **見えている日々の density のみ**（read-only・observed）。薄い(<5日)/tie は `sufficient=false` → 一般則 fallback（A2-4 で担保・断定しない）。
- belief/DB/external API 非接触。reason は copy のみ（viability/strain 不変）。

## テスト / tsc / lint
- context dir **47 PASS**（pure core 不変）。CalendarTab eslint clean（exhaustive-deps 含む）。自変更 tsc footprint **0**（baseline 55）。
- ★A2-5 は flag OFF で main 挙動不変ゆえ、A2-3 が同一 render パスを smoke 済み + tsc/eslint green を以て直接着地（冗長 smoke 省略）。

## ★enable 前 smoke 観点（flag ON で CEO 確認・有効化時）
flag ON で /plan Calendar:
1. **普段 packed の人が packed の日** → 文脈行が**出ない**（あなたの普段通り＝沈黙）か。
2. **普段 sparse の人が packed の日**（見えている日々が sparse 優勢）→「今日はいつもより多めの予定があるので…」が出るか。
3. 見えている日が **<5日** → 一般則（「予定の詰まり」）に fallback するか。
4. 既存表示が壊れていないか。

---

## ★A2 の到達点 = 安全側 pure/UI 層の天井
A2 全層が揃った: **core（A2-1）+ bridge（A2-2）+ 実 UI 表示（A2-3）+ 本人 baseline 相対化（A2-4）+ 配線（A2-5）**。全 flag OFF で休眠。

残る A2 前進は **すべて CEO 判断 / 新規データ基盤**:
1. **A2 機能の有効化**（dogfood で flag ON）= user-facing 有効化・CEO 判断。
2. **weather 配線**（jma → snapshot.weather）= external API stop gate・CEO。
3. **energy/travel baseline・完全履歴 baseline** = 履歴データが local scope 外（density のみ multi-day が dayGraphByDate にある）。energy 履歴/travel 履歴は DB or 新規蓄積＝CEO。
4. **personal grounding 拡張**（条件×行動の紐付け学習）= 条件別データ捕捉＝sensitive/外部＝CEO。

→ AI が安全に先行実装できる A2 pure/UI 層は**出尽くした**。自律バッチはここで stop し、CEO の方針を仰ぐ。
