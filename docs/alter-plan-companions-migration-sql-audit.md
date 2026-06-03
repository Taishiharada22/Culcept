# companions migration SQL Audit（apply 前・2026-06-02）

対象: `supabase/migrations/20260602100000_external_anchors_companions.sql`
判定: **SQL 単体としては静的監査 + ローカル実機検証ともに apply 安全**。ただし apply は CEO gate（本書は apply 可否判断の材料）。

> **⛔ remote apply 見送り（2026-06-02・decision-log 参照）**: remote apply の pre-check で前提崩壊を検出し STOP。① `.env.local` で compose flag が ON かつ remote project 接続、② remote に `external_anchors` テーブル本体（20260430100100）と RPC function（20260519100000）含む plan DB チェーン 8 本が**未適用**。companions は当該チェーン最後のリンクのため**単独 apply 不可**（`supabase db push` は pending 全体を適用）。本書の「apply 安全」は **SQL/migration 単体の正しさ**を指し、remote 適用準備が整ったことを意味しない。詳細: `docs/decision-log.md` 2026-06-02 エントリ。

> **補正履歴**: 初版（commit `5d592e2f` / 監査 `bd62b4d1`）では companions 抽出が非 string 要素を text 強制していた。CEO 指示により **defensive string-only 抽出**へ補正（jsonb string 要素のみ採用・number/boolean/object/array/null は無視・有効 string 0 件なら NULL）。本書は補正版を反映。

> **本監査では remote DB を一切変更していない。** ローカル検証は port 54322 のローカル Supabase（PG 17.6）に対し、全操作を単一トランザクション内で実行し **ROLLBACK**（永続化ゼロ）。migration の apply はしていない。

---

## 0. 監査方法
1. **静的 diff**: 原本 function（`20260519100000`）と新 function の実 SQL 行を機械 diff（コメント除外）。
2. **依存連鎖確認**: external_anchors 系 migration の timestamp 順序。
3. **ローカル実機検証**: 実 migration file を `\i` で取り込み、function compile + companions 抽出を edge ケース網羅でテスト → ROLLBACK。
4. **コード経路確認**: companions の producer / payload 条件付与 / 型整合 / tsc。

---

## 1. migration SQL 全文確認 — ✅
- `ALTER TABLE external_anchors ADD COLUMN IF NOT EXISTS companions TEXT[];` ＋ COMMENT。
- `CREATE OR REPLACE FUNCTION create_external_anchor_bundle(UUID, JSONB, JSONB) RETURNS JSONB`（冪等）。
- `REVOKE ALL ... FROM PUBLIC` / `GRANT EXECUTE ... TO authenticated` / COMMENT。
- 実機 `CREATE FUNCTION` 成功＝**plpgsql コンパイル通過**。

## 2. ADD COLUMN companions TEXT[] の安全性 — ✅
ローカル `information_schema.columns` 実測:

| column | udt_name | is_nullable | column_default |
|---|---|---|---|
| companions | `_text`(TEXT[]) | **YES** | **（なし）** |

- nullable / no default → 既存行は NULL 補完。PostgreSQL では「nullable・default なし」の ADD COLUMN は**カタログ更新のみ（テーブル書き換えなし）**、短時間の ACCESS EXCLUSIVE ロックのみ。
- `IF NOT EXISTS` で再実行安全。

## 3. function の引数・戻り値・呼び出し契約 不変 — ✅
原本 vs 新の実 SQL diff（コメント除外）は **完全に additive**:
```
+ ALTER TABLE ... ADD COLUMN companions  (前段)
  INSERT 列リスト: ... exception_dates  →  ... exception_dates, companions
  SELECT: exception_dates CASE の後に companions CASE を追加（string-only 抽出サブクエリ）
  COMMENT 文言更新
```
- signature `(p_user_id uuid, p_source jsonb, p_anchors jsonb) RETURNS jsonb` 不変（実機 `pg_proc` で確認）。
- `SECURITY INVOKER`（`prosecdef=f`）不変。auth check / source INSERT / 戻り値 `jsonb_build_object('source',...,'anchors',...)` / GRANT・REVOKE **すべて byte 一致**。
- 呼び出し側（`client.rpc("create_external_anchor_bundle", {p_user_id,p_source,p_anchors})`）は不変。companions は `p_anchors` 各要素の extra key として渡るのみ＝client 型（`Record<string,unknown>`）を壊さない（tsc 0 error）。

## 4. exception_dates 既存処理 不破壊 — ✅
- diff は exception_dates CASE を 1 行も変更せず、その後に companions CASE を追加するだけ。
- 実機 TEST A: 同一 anchor に `companions:["佐藤","鈴木"]` ＋ `exception_dates:["2026-06-09"]` → 両方正しく永続（`{佐藤,鈴木}` / `{2026-06-09}`）。

## 5. companions が jsonb array 以外なら無視 — ✅
抽出ロジック（**defensive string-only**）:
```sql
CASE WHEN a ? 'companions' AND jsonb_typeof(a->'companions') = 'array' THEN (
  SELECT array_agg(elem #>> '{}' ORDER BY ord)
  FROM jsonb_array_elements(a->'companions') WITH ORDINALITY AS t(elem, ord)
  WHERE jsonb_typeof(elem) = 'string'
) ELSE NULL END
```
実機（1 bundle・9 ケース・全 `pass=t`）:

| 入力 | 結果 |
|---|---|
| `["佐藤","鈴木"]` | `{佐藤,鈴木}` |
| key 欠落 | NULL |
| `"佐藤"`（string scalar・非 array） | NULL |
| `{"a":1}`（object） | NULL |
| `[]`（空配列） | **NULL**（有効 string 0 件）|

→ array 以外は NULL。array でも有効 string が 0 件なら NULL（空配列にしない）。

## 6. non-string 要素の扱い — ✅（補正: string のみ採用）
**CEO 指示の補正**: companions は参加者「名」配列。DB function 側でも defensive に **jsonb string 要素のみ採用**し、number / boolean / object / array / null 要素は**無視**。

実機（全 `pass=t`）:

| 入力 | 補正前 | 補正後 |
|---|---|---|
| `["佐藤",1,true,null]` | `{佐藤,1,true,NULL}` | **`{佐藤}`** |
| `[1,true,null]`（string 0 件） | （非 string も text 化） | **NULL** |
| `["佐藤",{"x":1},["y"],"鈴木"]` | （object/array も text 化） | **`{佐藤,鈴木}`**（順序保持） |

仕組み: `WHERE jsonb_typeof(elem)='string'` で型フィルタ → `elem #>> '{}'` で jsonb string scalar を unquote → `array_agg`（0 件→NULL）。SQL error は発生しない。
※ アプリ層 validation（`external-anchor-input.ts`）も非 string 要素を `invalid_format` で弾く。**二層で一致**（非 string は永続化されない）。

## 7. RPC / direct insert 両経路で migration 未適用環境を壊さない — ✅（運用制約 1 件）
**前提（grep 実測）**: plan ドメインで companions を非空にセットするのは **compose フローのみ**（`composeDraft` / `ComposeFormPanel` / converter / form builder）。legacy modal・ics・calendar 同期は `emptyAnchorFormState()`＝`companions:[]` のままで、builder の `length>0` ガードにより payload に **含まれない**。`alter-morning`/`coalter` の companions は別ドメイン（external_anchors 非接触）。

- **RPC 経路（旧 function 在）**: 実機 item7 で、companions-unaware な旧 function に companions 付き payload を渡しても **無視・persist せず・error なし**（旧 function は既知キーしか読まない）。
- **RPC 経路（function 不在）**: `shouldFallbackFromRpcError`（PGRST202 / 42883 / "could not find the function" のみ）で direct insert に fallback。
- **direct insert 経路**: payload は companions を `length>0` の時だけ含む（`anchorInsertPayload`）。列なし環境で companions を送れば `42703 undefined_column` で失敗するが、**companions が非空 ⟹ compose フロー ⟹ compose flag ON ⟹（本制約）migration 適用済**。よって未適用環境で direct insert に companions が乗ることは正しい運用順序では発生しない。
- **新 function 自身**: 同一 migration file 内で ADD COLUMN を CREATE OR REPLACE FUNCTION の**前**に実行。1 トランザクションのため、function が列不在を参照する瞬間は存在しない。

> **🔑 運用制約（唯一）: migration apply は compose flag（`PLAN_COMPOSE_TIMELINE_ENABLED`）有効化より前。** 逆順だと「旧 function: companions 黙殺（save 成功・データ欠落）」または「function 不在→direct insert で 42703 失敗」。migration header に明記済。

## 8. generated types / handwritten types 整合 — ✅
- 本リポジトリに **generated Supabase 型（database.types.ts 等）は存在しない**。`lib/plan` は generated `Database[...]` を参照せず、`ExternalAnchorRow` を**手書き**。
- 追加した手書き型（`ExternalAnchorBase` / `CreateExternalAnchorInputBase` / `AnchorFormState` / `ExternalAnchorRow.companions?: string[]|null`）は相互整合。`row.companions` は列 absent 環境で `undefined`→ `!= null` ガードで skip（後方互換）。
- tsc: baseline 1112 維持・自ファイル 0 error。

## 9. apply 後に必要な test / smoke 手順 — 下記 §11

---

## 10. 付随観測（スコープ外・今回いじらない）
1. **external_uid は RPC 経路で永続化されない（既存 gap）**: `20260526100000` が `external_uid` 列を追加したが function を更新しなかったため、現行 RPC は external_uid を INSERT しない（direct insert 経路のみ persist）。本 migration も external_uid を**追加しない**＝**現行挙動と一致・回帰なし**。スコープ拡大しない方針に従い触らない（別途 CEO 判断）。
2. **明示的 `companions:[]` / string 0 件の array は NULL**（補正後・空配列 persist しない）。アプリは `length>0` で空配列を payload から除外するため正常系でも発生しない。

---

## 11. apply 手順 & apply 後 smoke（CEO GO 後に実施）
**apply（CEO 承認後）**:
1. 順序前提: `20260430100100`（table）→ `20260519100000`（function）→ `20260526100000`（external_uid）→ `20260529*`（calendar types）→ **`20260602100000`（本件）**。supabase は timestamp 順に pending を適用するため、`supabase db push` で自然に整合（remote が途中状態でも前進適用）。
2. **apply 前に実 deploy 済 function を確認**: `pg_get_functiondef('create_external_anchor_bundle'::regproc)` が `20260519100000` と一致するか（手動パッチ差分がないか）。差異あれば本 CREATE OR REPLACE がそれを上書きする点を要評価。

**apply 後 smoke**:
1. 列存在: `\d external_anchors` に `companions text[]`。
2. function: `\df create_external_anchor_bundle`（1 個・引数不変）。
3. RPC 往復: companions 付き anchor を `create_external_anchor_bundle` で INSERT → 返却 jsonb の `anchors[0].companions` に配列が乗る（rowToAnchor が読む source）。
4. アプリ E2E（flag ON・**migration 適用後**）: compose で「誰と?」入力 → 完了 → reload → companions 再現。
5. 回帰: companions 無しの通常 anchor / exception_dates 付き recurring が従来通り保存される。

**Rollback**（破壊的・companions データ消失）:
```sql
-- 旧 function に戻す（20260519100000 の本体を CREATE OR REPLACE）
-- その後:
ALTER TABLE external_anchors DROP COLUMN IF EXISTS companions;
```

---

## 12. 結論
- 9 項目すべて PASS（静的 + ローカル実機）。SQL 監査上、apply は安全。
- **GO 判断は CEO。** 唯一の運用制約 = **migration を compose flag より先に適用**。
- 本書はコードのみ（migration apply・remote 変更・flag 有効化なし）。
