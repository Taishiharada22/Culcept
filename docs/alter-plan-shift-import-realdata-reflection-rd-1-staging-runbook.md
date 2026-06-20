# SR RD-1: Layer A staging validation detailed runbook（docs-only）

> 区分: **detailed runbook（docs-only）**。**実 save / DB write / VLM 実行 / dev server 起動 すべて未実施**。
> branch: `feat/plan-shift-import-realdata-reflection`（base `72d49987`・stacked）。
> 目的: **staging で実シフト画像 import → save → DB 差分 → /api/plan/anchors → /plan 反映 → cleanup → rollback** を実行可能な手順書として確定する。**実行は RD-2・別 GO**。

---

## 1. Preflight（**実行前に毎回・全項目 ✓ で進む**）

### 1.1 repo / branch
```
git branch --show-current        # → feat/plan-shift-import-realdata-reflection
git status --short --untracked-files=all
                                  # → clean（既存 untracked dev-month-grid/* のみ）
git log --oneline --max-count=3  # → e6a49095 → 72d49987 → ...
```

### 1.2 接続先（**staging 限定・production deny**）
```
[1] .env.local の SUPABASE_URL / SUPABASE_PROJECT_REF を read（編集しない）
[2] echo $STAGING_PROJECT_REF / $PRODUCTION_PROJECT_REF を確認
[3] 現在の connectionUrl が STAGING_PROJECT_REF 一致を確認
[4] PRODUCTION_PROJECT_REF と一致 → 即停止（S-save-0 guard が fail-closed で止めるが事前にも確認）
[5] supabase status / supabase link で linked project が staging を確認（read-only）
```

**判定**: ① staging ref 一致 / ② production ref 不一致 / ③ S-save-0 guard が staging-allow + production-deny で fail-closed である両方を読取確認。

### 1.3 env（**process env のみ・.env.local 非編集**）
- RD-1 中は **env を設定しない**（docs のみ）。RD-2 実行時に process env として渡す（§2 参照）。
- `.env.local` への**恒久追加は禁止**。

### 1.4 user_id
```
[1] staging で認証する user の email / id を確認
[2] staging 自分の user_id を memo（cleanup と一致確認に使う）
[3] 他 user の row には触れない原則
[4] allowlist 運用がある場合は本人が allowlist 内であることを確認
```

### 1.5 before snapshot（**read-only SELECT・cleanup と diff のため**）
```sql
-- §1.5-A external_anchor_sources（自分の・shift_image のみ）
SELECT id, source_type, captured_at, original_filename
FROM external_anchor_sources
WHERE user_id = '<staging_user_id>'
  AND source_type = 'shift_image'
ORDER BY captured_at DESC;

-- §1.5-B external_anchors（自分の・既存）
SELECT COUNT(*) AS anchor_count
FROM external_anchors
WHERE user_id = '<staging_user_id>';

-- §1.5-C plan_day_indicators（自分の・既存）
SELECT COUNT(*) AS indicator_count
FROM plan_day_indicators
WHERE user_id = '<staging_user_id>';

-- §1.5-D API snapshot
curl -s -b "<auth_cookie>" 'http://localhost:3000/api/plan/anchors' \
  | jq '{sources_n: (.data.sources|length), anchors_n: (.data.anchors|length), indicators_n: (.data.dayIndicators|length)}'
```

→ 結果を runbook 実行記録に残す（diff 比較用）。

---

## 2. 実行 env（**RD-2 候補・RD-1 では起動しない**）

```
PLAN_SHIFT_IMPORT_SAVE=true                            # 保存 enable（staging のみ）
PLAN_SHIFT_DRAFT_LIVE_ENABLED=true                     # in-app live draft flow
NEXT_PUBLIC_PLAN_SHIFT_IMPORT_ENTRY_ENABLED=true       # 取込 entry 可視化
NEXT_PUBLIC_PLAN_CALENDAR_MONTH_GRID_ENABLED=true      # 月 view（反映確認）
```

注意:
- すべて **process env のみ**（npm script の前に prefix で渡す）。`.env.local` 非編集。
- `PLAN_SHIFT_A4_VISUAL_SMOKE_PREVIEW` は本 runbook では **OFF**（A4 smoke 用・本 runbook 範囲外）。
- 接続先 SUPABASE_URL は **staging を指す既存 .env.local 設定を読むのみ**（編集なし）。

---

## 3. save 手順（**RD-2 で実行・1〜6 を順守**）

```
[1] dev server 起動
    PLAN_SHIFT_IMPORT_SAVE=true \
    PLAN_SHIFT_DRAFT_LIVE_ENABLED=true \
    NEXT_PUBLIC_PLAN_SHIFT_IMPORT_ENTRY_ENABLED=true \
    NEXT_PUBLIC_PLAN_CALENDAR_MONTH_GRID_ENABLED=true \
    NODE_OPTIONS=--max-old-space-size=4096 npx next dev --webpack
    → ready 確認（Local: http://localhost:3000）

[2] 認証済みブラウザで /plan を開く（staging user でログイン済）
    → 取込 entry が可視（NEXT_PUBLIC_..._ENTRY_ENABLED=true）

[3] シフト画像 import（取込 entry → 画像投入）
    → live draft で extraction（VLM 経路は必要時のみ）

[4] review 画面で確認
    → cell / 校正 / 警告（A4 mismatch / A1 confusable / A2 person row）
    → row label / 確信度 / 取り違え疑い 確認
    → 元画像 inline 照合（S3A-2-4）

[5] 保存
    → save action 起動 → S-save-0 guard 通過確認（log で staging-allow 検出）
    → import_shift_roster RPC → external_anchor_sources + external_anchors + plan_day_indicators
    → 保存後の returned source_id を memo（cleanup 用）

[6] 保存後の UI 表示
    → /plan に戻る or refresh
    → §4 / §5 へ
```

---

## 4. DB / API 確認（**read-only SELECT + API**）

### 4.1 external_anchor_sources
```sql
SELECT id, source_type, captured_at, original_filename
FROM external_anchor_sources
WHERE user_id = '<staging_user_id>'
  AND source_type = 'shift_image'
ORDER BY captured_at DESC
LIMIT 5;
```
**確認**: 直近 1 件で source_type='shift_image' / source_id（=後で cleanup）が取れる。

### 4.2 external_anchors（勤務）
```sql
SELECT id, source_id, anchor_kind, date, start_time, end_time, title, rigidity
FROM external_anchors
WHERE user_id = '<staging_user_id>'
  AND source_id = '<source_id>'
ORDER BY date, start_time;
```
**確認**: 勤務日に anchor_kind='one_off' で行が入る・source_id 一致・title/start_time が review と一致。

### 4.3 plan_day_indicators（休み / 希望休）
```sql
SELECT date, kind, label, source_id
FROM plan_day_indicators
WHERE user_id = '<staging_user_id>'
  AND source_id = '<source_id>'
ORDER BY date;
```
**確認**: 休み日に kind='off'・希望休に kind='off_request' が入る・label が review と一致。

### 4.4 /api/plan/anchors
```
curl -s -b "<auth_cookie>" 'http://localhost:3000/api/plan/anchors' \
  | jq '{sources, anchors_n: (.data.anchors|length), indicators_n: (.data.dayIndicators|length)}'
```
**確認**:
- sources に新 source_id で `sourceType: "shift_image"` が含まれる
- anchors に勤務行が含まれる（sourceId が一致）
- dayIndicators に休み行が含まれる（sourceType='shift_image' で読み戻し）

### 4.5 sourceId ↔ source_type 対応
```
const importedSet = shiftImageSourceIds(state.sources)
   → 新 source_id を含む（B-1 helper）
```
→ /plan の marker 経路（B-1）が新データを拾うことを確認。

---

## 5. /plan reflection 確認（auth ブラウザ）

### 5.1 week view（CalendarTab）
- 勤務日に **density indicator**（per-anchor では week では出ない / day-level は出る）
- 休み日に **dot**（H=rose / BD=slate / HREQ=violet）
- 取込日（shift_image source の anchor / indicator）に **小さい「取」**（day-level）
- non-shift_image の日 には marker なし
- 月送り（◀▶）でも崩れない

### 5.2 day view（FlowTab）
- 勤務 anchor が **EventCard** で表示
- 休み / 希望休 が **DayIndicatorBadge** で表示
- shift_image 勤務 EventCard の tertiary に「**取込**」
- shift_image 休み badge の隣に「**取込**」
- manual の予定 / 非取込休みには marker **なし**
- 既存の勤務コード / 休み表示が消えない

### 5.3 month view（MonthGridView・flag ON 時のみ）
- 6×7 grid（前後月 dim・selected ring・today border）
- 勤務日 cell に **勤務 code chip**（E/N/L/G/E-18・rawCode は anchor.title から resolver 経由）
- 休み日 cell に **休み chip**（H/HREQ/BD）
- 取込日 cell に「**取込**」marker
- non-shift_image の日には marker なし
- chip が狭すぎず読める

### 5.4 反映する API レイヤー
- `/api/plan/anchors` GET の response が PlanClient に流れ → CalendarTab / FlowTab / MonthGridView の prop に分配
- `shiftImageSourceIds` が新 source_id を集合化 → 3 view に marker が出る
- `dayIndicatorByIso` が新 indicators を index 化

---

## 6. cleanup（**source_id 起点・blanket 禁止**）

### 6.1 cleanup 対象の特定
```
[A] §3 [5] の save 結果から取得した source_id を確定
[B] §1.5-A の before snapshot と比較し、本 smoke で増えた source_id のみが cleanup 対象
[C] user_id = staging 自分の id と一致を毎回確認
```

### 6.2 dry-run SELECT COUNT（**DELETE 前に必ず**）
```sql
-- §6.2-A 削除予定 anchor 件数
SELECT COUNT(*) AS to_delete_anchors
FROM external_anchors
WHERE user_id = '<staging_user_id>'
  AND source_id = '<source_id>';

-- §6.2-B 削除予定 indicator 件数
SELECT COUNT(*) AS to_delete_indicators
FROM plan_day_indicators
WHERE user_id = '<staging_user_id>'
  AND source_id = '<source_id>';

-- §6.2-C 削除予定 source（必ず 1 件）
SELECT COUNT(*) AS to_delete_sources
FROM external_anchor_sources
WHERE user_id = '<staging_user_id>'
  AND id = '<source_id>';
```
→ 件数が想定値（§4 で確認した件数）と一致しなければ **DELETE せず停止**（§8 を参照）。

### 6.3 DELETE 手順（**順序厳守**）
```sql
-- §6.3-A 勤務 anchor を先に削除
DELETE FROM external_anchors
WHERE user_id = '<staging_user_id>'
  AND source_id = '<source_id>';

-- §6.3-B 休み / 希望休 indicator を削除
DELETE FROM plan_day_indicators
WHERE user_id = '<staging_user_id>'
  AND source_id = '<source_id>';

-- §6.3-C source 本体を削除
DELETE FROM external_anchor_sources
WHERE user_id = '<staging_user_id>'
  AND id = '<source_id>';
```
**禁止**:
- `DELETE WHERE source_type='shift_image'` だけの広範囲削除
- `user_id` 句なしの DELETE
- `source_id` / `id` 句なしの DELETE
- 他 user の row を消す可能性のあるクエリ

### 6.4 after snapshot
```sql
-- §6.4-A source が消えた確認
SELECT COUNT(*) FROM external_anchor_sources
WHERE user_id = '<staging_user_id>' AND id = '<source_id>';   -- → 0 期待

-- §6.4-B anchors 残骸ゼロ
SELECT COUNT(*) FROM external_anchors
WHERE user_id = '<staging_user_id>' AND source_id = '<source_id>';   -- → 0 期待

-- §6.4-C indicators 残骸ゼロ
SELECT COUNT(*) FROM plan_day_indicators
WHERE user_id = '<staging_user_id>' AND source_id = '<source_id>';   -- → 0 期待
```

### 6.5 API after snapshot
```
curl -s -b "<auth_cookie>" 'http://localhost:3000/api/plan/anchors' \
  | jq '{sources_n: (.data.sources|length), anchors_n: (.data.anchors|length), indicators_n: (.data.dayIndicators|length)}'
```
→ §1.5-D の before snapshot と一致（cleanup 前の状態に戻った）ことを確認。

### 6.6 env rollback / dev server 停止
```
[1] dev server 停止（kill PID + lsof 確認）
[2] 一時 env は process スコープ消滅で自動的に消える
[3] .env.local 非編集を最終確認（git diff .env.local が空）
[4] git status clean を確認
```

---

## 7. PASS / FAIL 基準

### 7.1 PASS（全項目 ✓）
```
- save 成功（S-save-0 guard 通過・RPC exit 0・returned source_id 受領）
- external_anchors / plan_day_indicators / external_anchor_sources が想定件数で作成
- /api/plan/anchors に sources（shift_image）/ anchors / dayIndicators が出る
- week view に勤務 density + 休み dot + 取込「取」marker（取込日のみ）
- day view に EventCard + 休み badge + 取込「取込」marker
- month view に勤務 code chip + 休み chip + 取込「取込」marker
- non-shift には marker なし（regression）
- cleanup 完了 → staging が before 状態へ復帰
- raw 画像 / base64 / VLM raw response は DB にも payload にも非保存（座標・コードメタのみ）
```

### 7.2 FAIL（**ひとつでも → 停止 + 報告**）
```
- 接続先が production ref（即停止・cleanup 不要・report のみ）
- user_id 不一致（即停止・cleanup 触らず・report）
- save 失敗（再試行せず停止・log 記録）
- cleanup 対象 source_id 不明（DELETE せず停止）
- raw / base64 / VLM raw response が DB / payload / log に残った疑い
- marker が誤表示（non-shift に出る or shift で出ない）
- DB に残骸が残る（cleanup 後の after snapshot で 0 にならない）
```

---

## 8. Rollback / stop 条件（**判断時に毎回確認**）

```
[Stop-1] 接続先が production ref とわかった瞬間
         → 即停止・cleanup せず・user 操作なし・report のみ

[Stop-2] user_id 不一致
         → 即停止・cleanup せず（他 user の row 操作リスク）

[Stop-3] cleanup 対象 source_id が不明 / before snapshot と一致しない
         → DELETE せず停止・手動 review に escalate

[Stop-4] save 失敗 / generic error
         → 保存再試行せず停止・log 取得・cleanup 可能なら実行

[Stop-5] VLM raw / base64 / 画像 binary が log / DB / payload に出る兆候
         → 即停止・該当 log を保護・root cause 調査

[Stop-6] /api/plan/anchors の response に予期しない他 user データ
         → 即停止・auth context を疑う

[General] 何かおかしいと判断したら、書き込みを止め、SELECT / 読取のみで状態を観察する
```

---

## 9. 禁止事項（RD-1 中も RD-2 実行時も厳守）

```
- production / production ref 接続
- push / PR / merge / deploy / Vercel env 変更
- DB write を伴う SQL を gate 前に実行
- VLM 再実行（必要時のみ・raw 非保存原則を守る）
- raw 画像 / base64 / VLM raw response の commit
- .env.local 編集
- PLAN_SHIFT_IMPORT_SAVE=true の恒久化
- proxy.ts 変更 / auth 例外追加
- productization branch / month-grid-reflection branch への直接追加
- blanket DELETE（source_id / user_id なし）
```

---

## 10. RD-2 に進む前の CEO 判断項目

```
[1] RD-1 runbook の §1-§8 内容に CEO 合意があるか
[2] staging 接続先と staging user_id の確定
[3] cleanup SQL の content review（特に §6.3 DELETE 3 連）
[4] PASS / FAIL 基準（§7）の CEO 合意
[5] Stop 条件（§8）に対する CEO の追加条件 / 削除があるか
[6] RD-2 実行を background dev server で行うか foreground かの方針
[7] 認証ブラウザ visual smoke を CEO 自身が行うか
[8] RD-2 失敗時の escalation 経路（誰に何を report するか）
```

---

## 結論
- 本 runbook は **staging で実 save → /plan 反映 → cleanup までを実行可能な docs**。
- **本書は docs-only。実 save / DB write / VLM 実行 / dev server 起動 すべて未実施**。
- 次は CEO が §10 を確認 → RD-2（staging 実行・別 GO）または RD-3（Layer B production path・GitHub 復旧後）を判断。
