# SR S-save-3 — staging save smoke readiness（在app入口→実保存・staging 限定・実行はまだ）

> 状態: **readiness（保存未実行）**。本書は「在app product 入口から `PLAN_SHIFT_IMPORT_SAVE=true`(staging のみ) で
> 実保存し、/plan 反映を確認し、必ず cleanup + env rollback する」smoke の手順・安全条件を整理する。
> **本 readiness では保存実行・RPC 実行・flag ON を一切行わない**（着手は CEO GO 後）。
> 前提: S-save-1B-exec で staging schema = **Case 2（適用済）**確定（`b04e3f45`）。S-save-2 saveEnabled 配線済（`21069426`）。
> S-save-1A payload CHECK-mirror 固定済（`da2d6aca`）。

---

## 0. このフェーズの正味の新規価値（scope を絞る）

**保存バックエンド自体は staging 実証済**: 2026-06-03 に combined 入力で 2025/6 を取込み、
`external_anchor_sources` + `external_anchors(19勤務)` + `plan_day_indicators(11休み/希望休)` の **atomic 30 行保存**を
CEO が元画像と全照合一致確認し、cleanup（0/0/0）+ env rollback 済（decision-log 2026-06-03）。

→ **RPC / 辞書変換 / 休み分離 / atomic / cleanup は証明済**。S-save-3 の新規価値は次に**限定**:
- **在app product 入口経路**（`PlanShiftImportEntry → ShiftDraftInApp → ShiftImportModal → 保存`）が、
  **S-save-2 の saveEnabled server→prop 配線** + **S-save-0 接続先 guard** を通して保存まで到達するか。
- = UI 配線（新規）の end-to-end 検証。危険な RPC 部分は再証明ではなく**回帰確認**。

---

## 1. `PLAN_SHIFT_IMPORT_SAVE=true` をどこで・どの範囲だけ ON にするか

- **inline env で dev server 起動時のみ**（`.env.local` は編集しない＝S3A-2-3 と同方針）。プロセス終了で消滅。
- smoke に必要な inline flag セット（4 つ）:
  | env | 値 | 役割 |
  |-----|----|----|
  | `NEXT_PUBLIC_PLAN_SHIFT_IMPORT_ENTRY_ENABLED` | `true` | 在app入口の表示（client-direct） |
  | `PLAN_SHIFT_DRAFT_LIVE_ENABLED` | `true` | live VLM flow（server→prop） |
  | `PLAN_SHIFT_VLM_INPUT_MODE` | `combined` | client==action の VLM 入力モード（既定 split のため明示必須） |
  | `PLAN_SHIFT_IMPORT_SAVE` | `true` | **保存有効化**（server→saveEnabled prop + action gate） |
- `.env.local`（CEO 管理）は **staging Supabase 接続** + `GEMINI_API_KEY`（既存）を供給。flag は触らない。
- **範囲**: local dev のみ・smoke 時間中のみ・**commit しない**・**production には絶対入れない**・終了後 rollback（§10）。

## 2. staging ref / production deny の再確認

- 起動前に `.env.local` の `NEXT_PUBLIC_SUPABASE_URL` が **staging（`hjcr…wc`）含有・production（`alja…hl`）非含有**を masked 確認（read-only grep・**値は出力しない**）。
- **多重防御**: S-save-0 の `isShiftImportSaveConnectionAllowed`（`NEXT_PUBLIC_SUPABASE_URL ?? SUPABASE_URL`）が runtime でも staging allowlist ∧ production deny を fail-closed 強制。万一 production を指していれば **save は `disabled` を返し DB write しない**。
- ログイン中アカウントが **staging のアカウント**であること（CEO）。
- production を指す状態では smoke を**開始しない**（guard が止めるが、その前に人手で確認）。

## 3. live VLM は再実行するのか / 既存 cells_loaded から保存するのか

- 在app product 経路（`ShiftDraftInApp`）は **cells_loaded に live VLM でしか到達しない**（fixture 経路は `saveEnabled=false` 固定で保存不可）。
- よって **live VLM を 1 回だけ実行**（画像→VLM→cells_loaded→確認画面）→ 保存。**連打しない**（CEO 禁止）。
- 画像は **検証済の 2025/6 SPRIX ロスター**（S3A-2-3 / 2026-06-03 と同一・既知の正解: 勤務19 / 休み10 / 候補1 / 要確認0 = day_indicator 11）。
- 確認画面で CEO が元画像と照合 → 一致を確認してから保存（不一致なら保存しない）。

## 4. save button が有効になる条件

`この内容で保存`（active CTA）が出る条件（全て満たす）:
1. `saveEnabled=true`（= `PLAN_SHIFT_IMPORT_SAVE=true` → server→prop で ShiftReviewGrid まで到達）。
2. state = `cells_loaded.reviewOpen`（確認画面が開いている）。
3. **要確認 0**（unresolved cell なし）。1 件でもあれば controller が disabled（差し戻し）。
4. `saveState = idle`（保存処理中でない）。
- flag OFF / 要確認あり の時は dormant placeholder「反映（次段で有効化）」または disabled（= 保存不可）。

## 5. `import_shift_roster` RPC 実行条件

`この内容で保存` 押下 → `requestSave`(controller) → `importShiftRosterAction` → `runShiftImportSave` の gate を**全通過時のみ** RPC 実行:
```
flag(PLAN_SHIFT_IMPORT_SAVE=true)
  → S-save-0 接続先 guard(staging allowlist ∧ production deny)
  → auth(staging ログイン userId)
  → year/month 妥当
  → projection(unresolved 0)
  → repo.saveShiftImportBundle → RPC import_shift_roster(staging)
```
- いずれかで失敗 → RPC 未到達 or 安全 result（§11）。RPC 実行 = staging への 1 トランザクション all-or-nothing。

## 6. 保存後に確認する SQL（read-only・Dashboard・staging）

保存後、Dashboard SQL Editor（staging 目視）で **SELECT のみ**確認（`:uid` = staging テストユーザー UUID）:
```sql
-- 新規 shift_image source（1 件・original_filename のみ）
SELECT id, source_type, original_filename, created_at
FROM external_anchor_sources
WHERE user_id = :uid AND source_type = 'shift_image'
ORDER BY created_at DESC;

-- work anchors（期待 19・rigidity hard・date が 2025-06 範囲）
SELECT count(*) AS anchors,
       min(date) AS d_min, max(date) AS d_max,
       bool_and(rigidity IN ('hard','soft')) AS rigidity_ok,
       bool_and(anchor_kind = 'one_off') AS kind_ok
FROM external_anchors
WHERE user_id = :uid
  AND source_id IN (SELECT id FROM external_anchor_sources WHERE user_id=:uid AND source_type='shift_image')
  AND date >= '2025-06-01' AND date < '2025-07-01';

-- day_indicators（期待 11 = off 10 + off_request 1・label 非空）
SELECT kind, count(*) AS n, bool_and(btrim(label) <> '') AS label_ok
FROM plan_day_indicators
WHERE user_id = :uid AND source_type = 'shift_image'
  AND date >= '2025-06-01' AND date < '2025-07-01'
GROUP BY kind ORDER BY kind;
```
- 期待: anchors=19 / rigidity_ok=true / kind_ok=true、day_indicators: off=10 + off_request=1 / label_ok=true。
- 2026-06-03 実測（19勤務 + 11休み/希望休）と一致すれば在app経路の保存が正しいと判定。

## 7. /plan month grid での反映確認方法

- **権威ある反映確認 = §6 の DB SQL**（行が staging に存在＝反映の真）。
- **視覚反映 = /plan の月 grid を 2025年6月へ navigate** して目視（勤務=時間付きイベント / 休み=「休み」/ 希望休=「希望休」を元画像と照合）。
- **依存（要事前確認）**: 今日(2026-06-04)から見て **2025/6 は過去**。/plan 既定の週 window(今日±7日)では出ない → **月 grid view + 過去月 navigation が 2025/6 に到達できるか**を smoke 前に確認する（2026-06-03 UX gap 指摘の領域。M3 月 grid 構築済）。到達不可なら dev-month-grid preview route（task #228）で代替確認、または §6 SQL を権威確認とする。
- **禁止**: 保存成功後の**自動月grid遷移 seam 実装**（CEO 禁止）。遷移は CEO が手動で行う。

## 8. 同月再取り込み replace / supersede 確認

- 1 回目保存後、**同じ 2025/6 を在app経路でもう一度**（live VLM 2 回目＝単発・連打でない）→ 保存。
- RPC の **range-scoped replace** を確認:
  - 保存 result.summary の `deletedAnchors` / `deletedIndicators` が **> 0**（前回 shift_image 分を置換）。
  - §6 SQL の件数が **二重化しない**（anchors=19 / indicators=11 のまま・**source_id は新しい 1 件**・旧 source は GC）。
  - 他 source（Google/manual 等があれば）**不変**。
- = 在app経路でも 2026-06-03 と同じ replace が効くことの回帰確認。
- （任意）conflict: 手動 day_indicator のある日を含む月で再取込 → `conflict` 返却で**無保存**（手動印保持）を確認。

## 9. cleanup SQL（保存成功後・必須）

smoke 後、staging のテスト保存を**必ず**削除（2026-06-03 と同手順・`:uid` 限定）:
```sql
DELETE FROM external_anchors a
USING external_anchor_sources s
WHERE a.source_id = s.id AND s.user_id = :uid AND s.source_type = 'shift_image';
DELETE FROM plan_day_indicators WHERE user_id = :uid AND source_type = 'shift_image';
DELETE FROM external_anchor_sources s
WHERE s.user_id = :uid AND s.source_type = 'shift_image'
  AND NOT EXISTS (SELECT 1 FROM external_anchors a WHERE a.source_id = s.id)
  AND NOT EXISTS (SELECT 1 FROM plan_day_indicators d WHERE d.source_id = s.id);
```
- 削除後 **0/0/0 確認**（§6 SQL の count が全て 0）。staging を smoke 前状態に戻す。

## 10. env rollback

- dev server を停止（inline flag は프로세스消滅で消える）。
- `.env.local` を **編集していない**ことを確認（`PLAN_SHIFT_IMPORT_SAVE` 不在 or `=false`）。
- flag なしで再起動 → `saveEnabled=false` dormant に戻る → 確認画面の保存ボタンが disabled placeholder「反映（次段で有効化）」へ戻ることを確認。
- これで本番既定（保存 dormant）に復帰。

## 11. 失敗時の rollback / partial write 対応

- **partial write は構造的に起きない**: RPC は **1 トランザクション all-or-nothing**（migration `20260531100000` 設計・途中失敗で全 rollback）。失敗時 DB は**無変更**。
- action は raw を含まない安全 result を返す: `disabled` / `unauthenticated` / `invalid` / `unresolved`(差し戻し) / `conflict` / `duplicate` / `error`。
- 失敗時の確認: §6 SQL を流し **行が 0**（何も書かれていない）ことを確認。
- smoke 中断時: §9 cleanup を流して stray 行ゼロを保証してから終了。

## 12. raw画像 / base64 / VLM raw response を保存しないこと

- 保存 payload は **cells（date, rawCode）→ projection → anchors/indicators** のみ。
  - `p_source` = `{ originalFilename? }`（**ファイル名文字列のみ**・画像なし）。
  - `p_anchors` = `{date,title,startTime,endTime,rigidity}`。
  - `p_indicators` = `{date,kind,label,countsAsPublicHoliday,rawCode,semanticType}`（`rawCode` は "H"/"N" 等の**シフトコード**・画像でない）。
- 画像は **client の ObjectURL のみ**（action に送らない）。base64/dataURL 不使用（S3A-2-2-2 不変）。
- 確認: §6 SQL で `external_anchor_sources` に画像/base64 列がない（`original_filename` のみ）・`plan_day_indicators.raw_code` がコード文字列であることを目視。**raw 画像/base64/VLM raw response は commit も保存もしない**。

---

## 13. smoke 実行手順（CEO GO 後・staging 限定）

1. **Pre-flight（read-only）**: §2 で `.env.local` の Supabase URL = staging（masked）/ production 非含有 / staging ログインを確認。
2. **任意の補助確認**: §0 の rigidity CHECK 値を read-only SELECT（必須でない）:
   ```sql
   SELECT conname, pg_get_constraintdef(c.oid) AS def
   FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
   JOIN pg_namespace n ON n.oid=t.relnamespace
   WHERE n.nspname='public' AND t.relname='external_anchors'
     AND c.contype='c' AND c.conname LIKE '%rigidity%';
   -- 期待: CHECK (rigidity = ANY (ARRAY['hard'::text, 'soft'::text]))
   ```
3. **起動**: Claude が §1 の 4 flag を inline で `next dev` 起動（`.env.local` 非編集）。
4. **取込→確認**: 在app入口「シフト表」→ 2025/6 画像 → live VLM(1 回) → 確認画面で CEO が元画像照合（要確認0 を確認）。
5. **保存**: `この内容で保存` 押下 → result ok を確認。
6. **確認**: §6 DB SQL（19/11・rigidity/label ok）+ §7 /plan 月 grid 目視（2025/6 到達可なら）。
7. **再取込**: §8 同月 replace 確認（deleted>0・件数不二重化）。
8. **cleanup**: §9 で 0/0/0。
9. **rollback**: §10 で flag なし再起動 → dormant 復帰。
10. **報告**: 実行結果を docs/decision-log に記録（CEO 確認）。

## 14. scope / 禁止

- **staging 限定**。`PLAN_SHIFT_IMPORT_SAVE=true` は smoke 中だけ inline・終了後必ず rollback。保存成功後は必ず cleanup。
- **禁止**: production / 本番 DB write / push・PR・GitHub・deploy / M3-c auto-open seam / **保存成功後の自動月grid遷移実装** / VLM 再実行の連打 / raw画像・base64・VLM raw response の commit・保存 / `.env.local` 編集 / 接続先が production を指す状態での保存。

## 15. 次工程順序

```
S-save-3: staging save smoke（在app経路・本書）  ← CEO GO 後に実行
S-save-4: 実画像→確認→保存→/plan 月 grid 反映 の通し（本書 §13 と統合可）
S-save-5: cleanup / env rollback の最終確認（§9/§10）
```
（注: 2026-06-03 で save backend は実証済のため、S-save-3 と S-save-4 は実質統合した 1 回の通し smoke で足りる可能性が高い。分割是非は CEO 判断。）
