# A2-3 — Context reason の実 UI 表示 closeout（user-facing・flag OFF commit・CEO smoke 待ち）

> 2026-06-09 / Build Unit / user-facing ゆえ **branch + flag-ON smoke override → CEO smoke → flag OFF で main 着地**。
> ★**実 flag ON は main に commit しない**（A1-6b/A1-7/A1-9 と同じ）。

---

## 実装した（A2-3 UI 表示 + 決定路配線）

- **`DayOutlookBanner`**: optional prop `contextReason?: string | null` を追加。非 null のとき outlook copy の直下に「今日の文脈 · {reason}」を slate 中立・read-only で 1 行表示。null/未指定 → 非表示（沈黙・既存挙動完全不変）。outlook=unknown → banner ごと非表示（contextReason 供給でも出ない）。
- **`CalendarTab`**: `contextReason` useMemo を追加。`rehearsalInput` の `density / baseEnergyLevel / 各 transition の travelMin（既知のみ）` から `buildDayContextSnapshot → buildContextModifier → buildContextOutlook().reasonLine`。`isContextModifierEnabled()`（flag ∧ 非 production）でのみ計算、それ以外は null。banner に prop 供給。

## ★安全境界（全 stop gate 準拠）
- **flag OFF / production**: `isContextModifierEnabled()`=false → contextReason=null → banner は従来通り（DayOutlookBanner も CalendarTab も完全不変）。実 flag ON は **commit しない**。
- **belief 不変**: snapshot は rehearsalInput（引数）からのみ。store 非接触。
- **数値判定に影響しない**: contextReason は **copy のみ**。viability/strain/repair など rehearsal の判定・数値に一切触れない（型でも DayRehearsal を受け取らない別 prop）。
- **偽数値なし / sensitive-free**: reasonLine は contextReasonLine（pure・数字フリー・場所/同伴者なし・仮説トーン）の出力そのまま。
- DB / external API なし。

## テスト / tsc / lint
- DayOutlookBanner render contract に **CTX1-5** 追加（文脈行表示 / null 非表示 / unknown 非表示 / slate・禁止語/数字なし / 実行 UI なし）。banner 計 **32 PASS**。
- context dir **33 PASS**。eslint clean（touched 3 ファイル）。自変更 tsc footprint **0**（baseline 55）。

## smoke 観点（★CEO 実機確認をお願いしたい点）
flag ON（dev override・uncommitted）で /plan Calendar を開き:
1. **予定が詰まった日**（packed）or **energy 低記録**の日 → outlook の下に「今日の文脈 · 今日は予定の詰まり…普段より少し余白を見ておくと安心かもしれません。」が出るか。
2. **普通の日**（balanced・条件薄い）→ 文脈行が **出ない**（沈黙）か。
3. 文言が **仮説トーン・数字なし・場所/同伴者なし**で、断定/警告に見えないか。
4. 既存の「今日の見通し」「なぜ?」「どうするとよさそう?」が**壊れていない**か。
5. flag を OFF に戻すと文脈行が**消える**（＝完全不変）か。

→ smoke で違和感があれば即修正。PASS なら flag OFF のまま main 着地。

---

## 次
CEO smoke PASS 後: override を OFF へ戻し、flag OFF の commit を main へ cherry-pick。次の A2 前進（weather 配線 / personal 化）は別 stop gate（CEO）。
