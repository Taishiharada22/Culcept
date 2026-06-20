# SR S-save-4 — 同月再取り込み replace/supersede smoke readiness（staging 限定・実行はまだ）

> 状態: **readiness（smoke 未実行）**。本書は「同月再取り込みで ①二重化しない ②前回 shift_image だけ置換 ③他 source を壊さない
> ④手動印は安全に止まる(conflict)」を staging でどう検証するかを整理する。**DB write / 保存実行 / flag ON は本 readiness では行わない**。
> 前提: S-save-3 PASS（在app経路 1 回保存・`99594c26`）。RPC は staging 適用済（S-save-1B-exec Case 2）。
> 根拠: RPC `import_shift_roster`（migration `20260531100000`）の range-scoped replace + manual conflict + source GC ロジック。

---

## 0. RPC の replace/conflict 挙動（根拠・migration 20260531100000）

1 トランザクション all-or-nothing。順序:
1. **owner guard** + advisory lock（同月二重 submit 直列化）。
2. **INSERT range 強制**（範囲外 date があれば RAISE）+ **duplicate 防御**（同日重複 RAISE）。
3. **conflict 検出**: 新 indicator の date に `plan_day_indicators.source_type='manual'` があれば → `{status:'conflict', dates}` を返し **何も書かない**（手動休みを黙って上書きしない）。
4. **range-scoped replace**（conflict なしの時のみ）:
   - DELETE `plan_day_indicators` WHERE `user_id` ∧ `source_type='shift_image'` ∧ `date ∈ [start,end)`。
   - DELETE `external_anchors` WHERE `user_id` ∧ `date ∈ [start,end)` ∧ `source_id ∈ (shift_image sources)`。
5. **source GC**: 子（anchors/indicators）を失った `shift_image` source を削除。
6. **INSERT** 新 source + anchors + indicators。

→ **置換対象 = user × shift_image × importRange のみ**。manual / Google / ICS / Microsoft / 他月は **構造的に不可触**（DELETE が source_type/ range scoped）。

---

## 1. 何を replace 対象にするか
- `user_id` 一致 ∧ `source_type='shift_image'` ∧ `date ∈ [range_start, range_end)` の **anchors と day_indicators**。
- 子を失った `shift_image` source（GC）。

## 2. 何を replace 対象にしないか
- **他 source_type**: `manual` / `google_calendar` / `microsoft_calendar` / `ics` / `pdf` / `image` / `chat` / `template`（DELETE は `source_type='shift_image'` scoped）。
- **他月**: importRange 外の date（`date ∈ [start,end)` scoped）。同じ shift_image でも別月は触らない。
- **手動 day_indicator**: range 内でも `source_type='manual'` は DELETE しない（conflict で止まるか、非重複日なら保持）。

## 3. 1 回目保存の期待件数（S-save-4A 基準）
clean 状態から 2025/6 を保存:
```
source(shift_image) = 1
external_anchors    = 19（±VLM 変動）
plan_day_indicators = 11（off 10 + off_request 1・±VLM 変動）
```

## 4. 2 回目保存の期待件数（S-save-4A 核心）
同じ 2025/6 をもう一度保存:
```
source(shift_image) = 1   ← 2 にならない（旧 source GC・新 source 1 件）
external_anchors    ≈ 19  ← 38 にならない（range-replace）
plan_day_indicators ≈ 11  ← 22 にならない（range-replace）
```
- **核心の合否**: `anchors=38 / indicators=22 / source=2` の **二重化が起きないこと**（厳密一致でなく no-doubling で判定）。
- 2 回目 save の `result.summary` に `deletedAnchors>0` / `deletedIndicators>0`（前回分を置換した証跡）。
- **VLM 変動の扱い**: 2 回目の読み取りが微妙に変わっても（例 18/19）、判定は **二重化していないか**で行う（exact 一致は求めない）。`source_id` は再取込で**入れ替わる**（GC+新規）= 正常（display は source_id 非依存）。

## 5. 二重化していないことの SQL 確認（read-only・staging）
2 回目保存後:
```sql
SELECT
  (SELECT count(*) FROM external_anchor_sources WHERE source_type='shift_image') AS sources,        -- 期待 1
  (SELECT count(*) FROM external_anchors a JOIN external_anchor_sources s ON s.id=a.source_id
     WHERE s.source_type='shift_image') AS anchors,                                                  -- 期待 ~19（≠38）
  (SELECT count(*) FROM plan_day_indicators WHERE source_type='shift_image') AS indicators;          -- 期待 ~11（≠22）
```
合否: `sources=1` ∧ `anchors` が 1 か月分（≒19・2倍でない）∧ `indicators` が 1 か月分（≒11・2倍でない）。

## 6. old source GC の確認
```sql
-- shift_image source は常に 1 件のみ（旧 source が GC され残骸ゼロ）
SELECT id, created_at FROM external_anchor_sources WHERE source_type='shift_image' ORDER BY created_at DESC;
-- 子なし shift_image source が無い（GC 漏れ検出）
SELECT s.id FROM external_anchor_sources s
WHERE s.source_type='shift_image'
  AND NOT EXISTS (SELECT 1 FROM external_anchors a WHERE a.source_id=s.id)
  AND NOT EXISTS (SELECT 1 FROM plan_day_indicators d WHERE d.source_id=s.id);  -- 期待 0 行
```

## 7. manual / Google / ICS / Microsoft 由来を壊さない確認方法
- **構造保証**: RPC の DELETE は `source_type='shift_image'` scoped → 他 source は触らない（unit test 済）。
- **経験的確認（before/after 不変）**: shift import の前後で **非 shift_image 件数が不変**を確認:
```sql
SELECT s.source_type, count(*) AS anchors
FROM external_anchors a JOIN external_anchor_sources s ON s.id=a.source_id
WHERE s.source_type <> 'shift_image'
GROUP BY s.source_type ORDER BY s.source_type;
SELECT source_type, count(*) AS indicators
FROM plan_day_indicators WHERE source_type <> 'shift_image'
GROUP BY source_type ORDER BY source_type;
```
- **強化（任意）**: S-save-4B の manual fixture を **import work 日（indicator を書かない日）** に置けば、import 後も manual が**保持**されることを確認できる（range-replace は manual を消さない）。staging に Google/ICS/MS 実データが無ければ「構造保証 + manual fixture 保持」で代替。

## 8. manual conflict の確認方法（S-save-4B・⚠ fixture は厳密に）
**目的**: 手動休みのある日を含む取り込み → `conflict` で**無書込**・手動保持。

**fixture seed（distinctive label で後始末を正確に）**:
```sql
-- :uid = S-save-3 で確認した staging テストユーザー（6599c0e4-… 等）。import が indicator を書く OFF 日に置く。
INSERT INTO plan_day_indicators (user_id, date, kind, label, counts_as_public_holiday, source_type)
VALUES (:uid, '2025-06-02', 'off', 'S-save-4B-fixture', false, 'manual');
```
- ⚠ **label を一意マーカー `S-save-4B-fixture` にする**（後で**この行だけ**を正確に削除するため。実 manual データを巻き込まない）。
- CHECK 充足: `kind='off'` ∧ `label` 非空 ∧ `source_type='manual'`（→ source_id NULL 許容）∧ off は `counts_as_public_holiday=false` 可。
- 2025-06-02 は image で BD（休み→ import が day_indicator を書く日）→ conflict 条件成立。

**conflict test**: 在app経路で 2025/6 を取込 → 確認画面（要確認0）→ 保存押下 → **期待 = conflict**（UI に「手動で設定した休みと重なる日があります」相当）。

**期待結果（conflict）**:
```
保存は成功しない（conflict 返却）
shift_image source = 0（何も書かれていない）
manual fixture（2025-06-02・label='S-save-4B-fixture'）は残る
```
確認 SQL:
```sql
SELECT count(*) FROM external_anchor_sources WHERE source_type='shift_image';                 -- 期待 0
SELECT date, kind, label FROM plan_day_indicators
WHERE source_type='manual' AND label='S-save-4B-fixture';                                       -- 1 行残存
```

## 9. cleanup SQL
**S-save-4A 後**（shift_image を 0/0/0）:
```sql
DELETE FROM external_anchors a USING external_anchor_sources s
WHERE a.source_id=s.id AND s.source_type='shift_image';
DELETE FROM plan_day_indicators WHERE source_type='shift_image';
DELETE FROM external_anchor_sources s WHERE s.source_type='shift_image'
  AND NOT EXISTS (SELECT 1 FROM external_anchors a WHERE a.source_id=s.id)
  AND NOT EXISTS (SELECT 1 FROM plan_day_indicators d WHERE d.source_id=s.id);
```
**S-save-4B 後**（manual fixture を**正確に**削除・実データ非巻き込み）:
```sql
DELETE FROM plan_day_indicators
WHERE user_id=:uid AND source_type='manual' AND date='2025-06-02' AND label='S-save-4B-fixture';
-- 念のため shift_image も 0 確認（4B は本来 0 書込）
DELETE FROM external_anchors a USING external_anchor_sources s
WHERE a.source_id=s.id AND s.source_type='shift_image';
DELETE FROM plan_day_indicators WHERE source_type='shift_image';
```
最終確認: `shift_image` sources/anchors/indicators = 0 ∧ `label='S-save-4B-fixture'` の行 = 0。

## 10. env rollback
- inline `PLAN_SHIFT_IMPORT_SAVE=true` は dev server プロセス内のみ → **server 停止で消失**。`.env.local` は `=false`（dormant）のまま（編集しない）。
- rollback 後、保存ボタンが dormant placeholder「反映（次段で有効化）」へ戻ることを確認。

## 11. 失敗時の rollback / cleanup
- RPC は **all-or-nothing**（途中失敗で全 rollback）→ **partial write は構造的に不可**。
- 失敗時は §9 の cleanup を流して shift_image 0/0/0 + fixture 削除を保証。
- **4B の fixture を残したまま中断しない**（必ず label 指定 DELETE で除去）。中断時も §9 4B-cleanup を実行。
- 失敗分類（VLM 1 回・連打しない）: `invalid_input` / `VLM timeout` / `safe error` / `cells malformed` / `save disabled` / `guard blocked` / `RPC failed` / `conflict(4B では期待)` / `duplicate`。

## 12. raw画像 / base64 / VLM raw response を残さないこと
- 保存 payload は cells→anchors/indicators のみ。`p_source`=ファイル名文字列のみ（在app経路は現状 `null`）。画像/base64/VLM raw は **送信も保存もしない**（S-save-3 で `original_filename=null` 確認済）。
- fixture/cleanup SQL にも raw を含めない。decision-log にも raw を記録しない。

---

## 13. smoke 2 段階手順（CEO GO 後・staging 限定・各段で停止）

### S-save-4A（replace / source GC）
1. Pre-flight: 接続先 staging（masked）/ production deny / `.env.local` PLAN_SHIFT_IMPORT_SAVE=false（pre-flight 再確認）。
2. clean 確認（shift_image 0/0/0）。
3. inline 4 flag で dev server 起動（私）。
4. **1 回目**: 在app入口→2025/6 画像→live VLM(1回)→確認(要確認0・CEO 照合)→保存 → §3 期待件数を SQL 確認。
5. **2 回目**: 同じ 2025/6 を再度→live VLM(1回)→確認→保存 → §5/§6 SQL で **no-doubling + GC** 確認。
6. §9-4A cleanup（0/0/0）→ server 停止（rollback）→ 記録。

### S-save-4B（manual conflict）— 4A PASS 後の別段
1. Pre-flight 同上 + clean（shift_image 0）。
2. §8 manual fixture seed（`label='S-save-4B-fixture'`・2025-06-02）。
3. dev server 起動（私）。
4. 在app入口→2025/6→live VLM(1回)→確認→保存 → **conflict 返却**を確認（保存されない）。
5. §8 確認 SQL（shift_image=0 ∧ fixture 残存）。
6. §9-4B cleanup（fixture を label 指定で正確に削除 + shift_image 0）→ server 停止 → 記録。

## 14. 申し送り（独立判断・rule ②）
- **conflict 保護は非対称**: RPC は **manual day_indicator（休み）** のみ conflict 保護。**manual work anchor（external_anchors）** は import work と**共存**し得る（range-replace は manual anchor を消さない・conflict も見ない）。4B は設計された休み conflict を検証する。manual work 重複の扱いは将来課題（別途）。
- **source_id 不安定**: 再取込ごとに source GC+新規で `source_id` が変わる（display は非依存で問題なし。provenance のみ留意）。
- **original_filename=null**: 在app経路は uploaded ファイル名を保存していない（小欠落・blocker でない。将来 source metadata polish: file name / captured month / import mode を残す。raw 画像/base64 は保存しない方針維持）。

## 15. scope / 禁止
- staging 限定。`PLAN_SHIFT_IMPORT_SAVE=true` は smoke 中 inline のみ・終了後 rollback。各段で cleanup。
- **禁止**: production / push・PR・GitHub・deploy / M3-c auto-open seam / 保存成功後の自動月grid遷移 / VLM 連打 / raw画像・base64・VLM raw の commit・保存 / `.env.local` 編集 / manual fixture の blanket DELETE（必ず label 指定）。
- **本 readiness では smoke を実行しない**（4A/4B 着手は CEO 個別 GO 後）。

## 16. 次工程順序
```
S-save-4 readiness（本書）          ← docs-only・smoke なし
S-save-4A smoke（CEO GO 後）         ← replace / source GC（同月2回保存・no-doubling）
S-save-4B smoke（4A PASS 後・CEO GO） ← manual conflict（fixture→conflict→無書込→fixture保持）
S-geo deterministic geometry readiness  ← 照合 UX 強化（その後）
```
