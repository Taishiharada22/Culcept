# Place Affinity dogfood 有効化（reason flag=true・ranking OFF・production hard block）closeout

> 2026-06-09 / Build Unit / CEO 判断「dogfood 有効化（データ貯め）」。A2 dogfood 有効化と同型。

---

## 何をしたか
- `PLACE_AFFINITY_REASON_UI_ENABLED` を **`true`**（reason-only の dogfood 有効化）。
- ★`PLACE_AFFINITY_RANKING_ENABLED` は **OFF 維持**（順位は変えない）。
- gate `isPlaceAffinityReasonEnabled() = flag && process.env.NODE_ENV !== "production"` 不変。
  → **dev/dogfood: reason 表示 + safety journal 蓄積 ON ／ production: hard block で OFF**。

## ★production 安全性（最重要）
- flag=true を commit しても、**production では `NODE_ENV==="production"` により発火しない**（hard block）。production 挙動は一切変わらない。production 露出は別途 CEO 判断。
- ★**ranking flag は OFF 維持**＝候補の順位は変わらない（reason 表示と safety journal 蓄積のみ）。最も安全な観測姿勢。

## dev/dogfood で起きること
- 場所候補に「よく行く / この時間帯・週末 / 雨雪荒天暑い の日に選ばれやすい場所のようです」reason（観測が一致したとき・薄ければ沈黙）。
- shadow ranking 観測（dev console・順位不変）+ **safety journal 蓄積**（派生サマリーのみ・raw なし）。
- ★順位は変えない（ranking OFF）。

## 次（蓄積→検証→ranking 検討）
dogfood で使い続けて観測を貯める → `assessPlaceAffinitySafety` が `stable_safe`（≥10 ∧ excessiveShift ゼロ）になったら ranking flag の有効化を CEO 判断。

## smoke / テスト
- flag test を vi.stubEnv で更新（reason flag=true ∧ 非prod→ON ∧ prod→hard block OFF・ranking flag は OFF 維持）。reasonUi 15 PASS・compose dir PASS・tsc footprint 0・eslint clean。
- 有効化 smoke: flag=true で server-health（後述）。

## rollback
- 違和感あれば `PLACE_AFFINITY_REASON_UI_ENABLED = false` の 1 行で即無効化。
