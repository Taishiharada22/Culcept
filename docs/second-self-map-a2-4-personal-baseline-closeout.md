# A2-4 — Personal Baseline Relativization（本人の「普段」基準・pure core）closeout + A2-5 計画

> 2026-06-09 / Build Unit / pure core・belief 非接触・後方互換・flag OFF ゆえ **main 直接着地**。

Personal Reality Graph の核を一段深く：context の「普段より」を**一般則でなくこの人の分布**で判定する。

---

## 1. 前提を疑った点（①）
A2-1〜3 の modifier は「普段より」を **絶対閾値**（packed→tightens 等）で判定していた。だが「普段」が一般則であって **この人の普段ではない**。packed が常態の人に packed は tightening でない。
→ Fleeson の density-distribution：today の意味は絶対値でなく「**その人の分布のどこか**」。これを実装する。

## 2. 実装した（A2-4 pure core）
- **`lib/plan/context/contextBaseline.ts`**: `buildDensityBaseline(densities)` → `{typical, n, sufficient}`。typical=厳密な最頻（**同率トップ=null＝断定しない**）。`sufficient = n≥minDays(5) ∧ typical≠null`（**薄いデータで personalize しない**）。
- **`buildContextModifier` に optional 第3引数 `baseline?: {density?}`** を **additive** 追加（不在/insufficient → 一般則＝**既存挙動完全不変**）:
  - `deriveDensityFactor`: baseline sufficient のとき density を **本人相対**化。`delta = rank(today) − rank(typical)`（sparse0/balanced1/packed2）。`delta=0 → factor なし`（あなたの普段通り＝語らない）。`|delta|=2→notable / =1→slight`。denser→tightens / lighter→eases。`grounding="personal"`、basis「あなたにしては予定が多め/少なめの日です」。
  - reason 文言も personal は「いつもより多め/少なめの予定」に（本人相対のニュアンス）。

## 3. ★安全境界（全 stop gate クリア）
- belief 上書き: ❌なし（baseline は決定時 read-only 計算・保存しない・store 不接触）。
- 偽数値: ❌なし（定性 + 実カウント n のみ・確率を作らない）。
- source 不明断定: ❌なし（density は observed・**sufficient gate で薄いデータは一般則に退避**・tie は null）。
- UI 表示: ❌なし（pure core のみ。既存 reason 行が render・wiring は A2-5・既存 flag 裏）。
- DB/external API: ❌なし。sensitive: ❌なし（density level のみ）。
- 後方互換: baseline 不在で **既存 33 tests 全 pass**（挙動不変を機械保証）。

## 4. テスト / tsc / lint
- 新規 **14 tests**（baseline builder 5：空/薄い/明確最頻/tie/config・相対化 9：不在 fallback/insufficient fallback/普段通り沈黙/delta±1±2/personal 文言）。context dir 計 **47 PASS**（既存 33 回帰なし）。
- 自変更 tsc footprint **0**（type-only 循環 import 健全）。eslint clean。

## 5. ★v0 制約（honest）
baseline の母集団は呼び出し側が渡す「見えている日々の density」（完全な履歴でない）。min 5 日 gate で薄さを防ぐが、window 外の傾向は反映しない。完全履歴化は将来（DB＝CEO 判断）。

---

## 6. A2-5 計画（次に自律実装）= CalendarTab で baseline を配線
- 内容: `CalendarTab` の `contextReason` useMemo（A2-3）内で、`dayGraphByDate` の各日の density を集めて `buildDensityBaseline` → `buildContextModifier(snapshot, undefined, {density: baseline})` に渡す。
- ★**既存 flag 裏**: `isContextModifierEnabled()` の gate 内でのみ baseline 計算（OFF＝計算もしない＝完全不変）。flag OFF のまま main 着地可（main 挙動不変）。
- 検証: density 収集が source=observed で正しいか・薄い window で general fallback するか（pure 部は A2-4 で担保済・wiring は smoke 観点提示）。
- ★flag ON 時に reason 文言が「いつもより多め」へ変わる＝**enable 前に再 smoke 推奨**（landing 自体は flag OFF で安全）。

### A2-5 後の見通し（stop 予測）
A2-5（wiring・flag 裏）まで自律可能。その先の A2 前進＝**weather 配線（external API gate）/ energy・travel baseline（同様の relativization 拡張は可能だが価値は density が最大）/ 完全履歴 baseline（DB gate）**。weather/DB は CEO 判断 stop gate。

---

## 次
A2-5（CalendarTab baseline 配線・flag OFF）を自律実装 → 監査 → 次計画。
