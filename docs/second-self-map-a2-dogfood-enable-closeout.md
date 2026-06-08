# A2 Context Modifier — dogfood 有効化 closeout（flag=true・production hard block）

> 2026-06-09 / Build Unit / CEO 判断「A2 を dogfood 有効化」。**production hard block ゆえ dev/dogfood のみ ON・production 非発火**。

---

## 何をしたか
- `DAY_REHEARSAL_CONTEXT_MODIFIER_ENABLED` を **`true`** に（dogfood 有効化）。
- gate `isContextModifierEnabled() = flag && process.env.NODE_ENV !== "production"` は不変。
  → **dev/dogfood（非 production）: ON ／ production: hard block で OFF**。

## ★production 安全性（最重要）
- flag=true を commit しても、**production では `NODE_ENV==="production"` により発火しない**（gate の hard block）。
- production への露出は **別途 CEO 判断**（本 commit は production 挙動を一切変えない）。
- 「実 flag ON は production に出さない」規律の趣旨（production 保護）を hard block が構造的に担保。

## 有効化で dev/dogfood に出るもの
- /plan Calendar の `DayOutlookBanner`（outlook 表示時）の直下に「今日の文脈 · …」reason 行。
- ★**copy のみ**（viability/strain など rehearsal の数値判定は不変）。本人 baseline 相対（A2-4/A2-5）で
  「あなたの普段通り」の日は沈黙・逸脱時のみ「いつもより多め/少なめの予定…」。
- belief/DB/external API 非接触は維持（A2 全層が pure/read-only）。

## smoke / テスト
- **dogfood 有効化 smoke PASS**: flag=true で `PORT=3024 npm run dev` → Ready 4.2s・/plan 307・compile error なし。
- flag test 更新（`flag=true` ∧ 非 production→ON ∧ **production→hard block で OFF** を機械検証）。context dir **47 PASS**。tsc footprint 0・eslint clean。

## 他 flag は OFF 維持
- `DAY_REHEARSAL_PERSONAL_PACE_ENABLED` / `GPS_CAPTURE` / `PACE_SHADOW` は **OFF のまま**（A2 のみ有効化）。

## ロールバック
- 違和感があれば `DAY_REHEARSAL_CONTEXT_MODIFIER_ENABLED = false` に戻すだけ（1 行・即時無効化・他に副作用なし）。

---

## 次
CEO が dev/dogfood で A2 の本人相対 reason を実体験。production 露出は別 CEO 判断。weather 配線/履歴 baseline は引き続き stop gate。
