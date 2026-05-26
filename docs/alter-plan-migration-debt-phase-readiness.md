# Migration Debt Phase Readiness — 「次にどの道で解くか」 を決める 1 枚

**Date**: 2026-05-26
**Branch**: `feat/migration-debt-phase-readiness` (= main 派生、 独立)
**Status**: 🟡 readiness only (= docs-only、 実 apply なし、 起草後 再停止)
**Scope**: production 未適用 migration / staging 完全空 / 重複 timestamp の **解消方針 1 つ確定**

---

## 0. 背景 — なぜ本 readiness を書くか

### 0.1 P3-A-1 phase 着地から本 phase へ

P3-A-1 phase (= Google Calendar OAuth 連携) は **DB 非依存範囲で closeout 完了** (= 2026-05-26 freeze)。 phase 全体としては未完で、 **再開条件 Step 1 = migration debt phase の方針確定** が要求されている。

本 readiness は **「migration debt をどう解くか」 の判断材料を 1 つに固定する** ことが目的。 実 apply の実行は本 readiness 範囲外、 別 phase + CEO 慎重判断。

### 0.2 P3-A-1 freeze 不変原則 と 本 phase の関係

- P3-A-1 branch (= `feat/alter-plan-p3-a-1-google-readiness`) は freeze 中、 commit 追加なし
- 本 readiness は **別 branch** (= `feat/migration-debt-phase-readiness`、 main 派生) で起草
- 両 phase の参照は doc 経由で完結

### 0.3 本 readiness の不変原則

- docs-only
- 実 `supabase db push` 不実施
- production / staging への schema 変更 0
- 起草後 再停止 (= 採用方針確定 → 実行計画は別 phase)
- **「比較表」 で終わらせず、 推奨 scenario を 1 つ明記** する (= CEO 補正、 判断が散らない構造)

---

## 1. 現状再整理 (= 2026-05-26 read-only 確認結果)

### 1.1 重要な前提 (= 状況の本質)

> **現時点でデータ喪失の証拠はない。 発覚したのは environment の不同期である。**

これは debt の本質を表す:
- ❌ user data 破壊 / 消失 → 発生していない
- ❌ production の動作障害 → 発生していない
- ✅ main branch と production / staging の **migration history の不同期** が発覚しただけ
- ✅ 未適用 migration の中身は **schema 拡張 (= ADD COLUMN / ADD INDEX / 新 table)** が中心、 破壊系は確認なし

→ **慌てる必要はない、 ただし放置もしない**。 慎重判断で進める。

### 1.2 production (= Culcept Tokyo、 `aljavfujeqcwnqryjmhl`)

- 169 file 適用済
- **8 file 未適用** (= 6 timestamp、 重複 2 セット影響)

| # | Timestamp | File 名 | 重要度 |
|---|-----------|---------|------|
| 1 | `20260430100000` | `coalter_memory_items_realtime.sql` | mid (= coalter 機能) |
| 2 | `20260430100000` | **`external_anchors.sql`** | **CRITICAL** (= P3 全体 foundation) |
| 3 | `20260430110000` | `coalter_memory_items_replica_full.sql` | mid |
| 4 | `20260430110000` | `plan_drift_events.sql` | mid (= plan analytics) |
| 5 | `20260519100000` | `create_external_anchor_bundle.sql` | high (= P3 W1-Y RPC) |
| 6 | `20260520120000` | `coalter_mirror_app_settings.sql` | mid |
| 7 | `20260526100000` | `p3_ics_import.sql` | high (= P3-B fallback) |
| 8 | `20260526110000` | `p3_a_1_1_calendar_oauth.sql` | high (= P3-A-1 OAuth) |

### 1.3 staging (= culcept-staging Mumbai、 `hjcrvndumgiovyfdacwc`)

- **175 file 全て未適用** (= 完全空)
- dev project 作成のみで、 一度も migration apply されていない
- 「30+ 未適用」 という前回 認識は誤り、 **全件未適用** が正しい

### 1.4 Repo main (= migrations directory)

- **175 file** 全体
- **重複 timestamp 2 セット**:
  - `20260430100000_*` = `external_anchors.sql` + `coalter_memory_items_realtime.sql`
  - `20260430110000_*` = `plan_drift_events.sql` + `coalter_memory_items_replica_full.sql`
- supabase CLI は timestamp で order するため、 重複 timestamp は **どちらが先に apply されたか曖昧**

### 1.5 影響範囲

- P3 全体 (= `.ics` + Google OAuth) が production で動かない (= `external_anchors` 未適用)
- production smoke で観察された 「user_calendar_connections not found」 「not_configured」 は **全 expected**
- 既存 user 体験への影響は **なし** (= 既存機能は不変、 新規 P3 機能のみ degrade)

---

## 2. 4 Scenario 比較 + 推奨 1 つ明記

### 2.1 比較表

| Scenario | 内容 | 利点 | リスク | 実行時間 | reliability |
|----------|------|------|--------|---------|-----------|
| **A** | production 単独 apply (= staging skip、 6 timestamp 8 file を CLI で push) | 最短、 production が main 同期、 P3 機能が即動く | 重複 timestamp の順序が CLI 任せ (= alphabetical の可能性、 確実性低い)、 staging 検証なし、 もし 1 つの migration が壊れたら production 直撃 | 30 分 | ⚠️ 中 |
| **B** ✅ | staging 同期 → production 同期 (= staging に 175 file 一括 push → 検証 → production に 8 file push) | staging で先に試せる、 production 影響を予見可能、 staging が dev/test 環境として正常化 | 175 file 一括 staging push は時間 + リスク大、 既存 migration bug (= `notifications` table SQL error が local で発生) が staging でも再現する可能性 | 2-3 時間 | ✅ 高 |
| **C** | production 6 件のみ手動 SQL apply (= migration 単独、 psql 経由) | 最小限の apply、 staging に触らない | migration history table と齟齬、 supabase CLI が次回 push で 「remote 状態と migration table が一致しない」 エラー、 推奨されない | 1 時間 | ❌ 低 |
| **D** | 別 staging project 新規作成 (= `culcept-staging-v2`、 main 全 migration apply) | staging を clean state で再構築、 既存 staging の運用 debt を切り離す | 大ごと (= project 切替の手間)、 既存 staging 参照を更新する必要、 即時必要性なし | 半日 | ⚠️ 中 |

### 2.2 推奨 Scenario (= B、 CEO 補正反映)

🎯 **推奨: Scenario B (= staging 同期 → production 同期)**

#### 推奨理由 (= 3 行)

1. **production 影響を最小化** (= D-e 不変原則の精神を継続、 staging で先に検証してから production に向かう、 失敗時の rollback が容易)
2. **staging の dev/test 環境としての復活** (= 完全空 staging を main 同期することで本来の役割回復、 今後の検証基盤が整う = P3-A-1 再開後の sync persist / google_calendar 分離 等の検証にも活用可能)
3. **段階分割可能** (= 175 file 一括 staging push を 1 操作で行うが、 失敗時は 1 file 単位で原因特定可能、 production への push は 8 file のみで影響範囲が明確)

#### 不採用 Scenario の却下理由 (= 1 行ずつ)

- **A** ❌ 却下: staging 検証なしで production 直 push は CEO 不変原則 「production 直 push ではない」 に反する、 重複 timestamp 順序を確認せず流すのは reliability 低い
- **C** ❌ 却下: migration history table を手動で書き換えると supabase CLI が壊れる、 推奨されない managed pattern を採るのは future debt を増やすだけ
- **D** ❌ 却下: 新 staging project 新設は中長期的選択肢で即時必要性なし、 既存 staging 廃止判断は別 phase で扱える、 本 phase の主目的 「8 件 production 未適用の解消」 と直結しない

### 2.3 Scenario B 採用時の前提条件 (= 着手前確認)

採用が確定したら、 実行 phase の readiness で詳細化:
- **前提 a**: staging に **既存 user data がない / 無視できる** ことを確認 (= dev project、 通常 user 0)
- **前提 b**: **重複 timestamp は rename せずに保持** (= production 既適用は触らない、 §3 参照)
- **前提 c**: 既存 migration の `notifications` table SQL error が staging で再現するか **試行で確認** (= local 起動失敗の原因、 staging で何が起きるかは未知)
- **前提 d**: staging push 完了後、 production への 8 file push は **CEO 個別承認** (= 「production 直 push ではない」 を厳守、 各 file 内容 1 通り review 後に承認)

### 2.4 Scenario B 段階分割 案 (= 実行 phase で詳細化)

```
Stage B1: staging 一括 push (= 175 file、 ~1 時間)
  - supabase link --project-ref hjcrvndumgiovyfdacwc
  - supabase db push --dry-run (= 確認)
  - supabase db push (= 実行)
  - 失敗時 → 失敗 file 特定 → fix → 再実行

Stage B2: staging 検証 (= ~30 分)
  - 新 table 存在確認 (= user_calendar_connections / external_anchors / 等)
  - RLS policy 動作確認
  - 既存 user 体験 regression なし確認 (= staging に user data なしなら 即座 PASS)

Stage B3: production 8 file push (= CEO 個別承認、 ~30 分)
  - supabase link --project-ref aljavfujeqcwnqryjmhl
  - 8 file の SQL を 1 通り review
  - supabase db push (= 8 file のみ、 既存 169 file は touch せず)
  - 失敗時 → rollback 検討 (= ALTER 系は逆 ALTER 可能)

Stage B4: 完了確認 + link 元復帰
  - production migration list で 8 file の REMOTE 列に日時表示確認
  - link 状態 final 確認
  - decision-log + closeout doc 更新
```

各 Stage は **CEO 個別 GO** + 別 readiness 起草で詳細化。

---

## 3. 重複 timestamp 解消方針 (= sub-question、 §2 と独立判断)

### 3.1 現状

repo main に 2 セットの重複 timestamp:
- `20260430100000_external_anchors.sql` + `20260430100000_coalter_memory_items_realtime.sql`
- `20260430110000_plan_drift_events.sql` + `20260430110000_coalter_memory_items_replica_full.sql`

production は 169 file 適用済だが、 これらは未適用 (= production にも、 staging にも未存在)。

### 3.2 解消案

| 案 | 内容 | 利点 | リスク |
|---|------|------|--------|
| **保持** ✅ 推奨 | 重複 timestamp のまま保持、 CLI の order (= alphabetical fallback) に任せる | production 既適用の migration を rename せず → history mismatch リスク 0、 シンプル | CLI の order が将来変わる可能性は低いが 0 ではない、 alphabetical の場合 `coalter_*` が `external_*` / `plan_*` より先になる (= 通常無害だが確認必要) |
| 後者 rename | 後者 file を `20260430100001_*` / `20260430110001_*` に rename | order 明確化、 future 同 issue 防止 | production に未適用とはいえ rename は staging との順序整合に影響する可能性、 commit history が複雑化 |

### 3.3 推奨: **保持**

理由:
- production 既適用 migration を rename しないルールを徹底
- 4 file はすべて未適用なので 「先後どちらでも data 結果は同じ」 (= ADD COLUMN / 新 table は順序に依存しない場合が多い、 ただし要確認)
- 仮に CLI の order が alphabetical なら:
  - `20260430100000_coalter_memory_items_realtime` → `20260430100000_external_anchors`
  - `20260430110000_coalter_memory_items_replica_full` → `20260430110000_plan_drift_events`
- これらが互いに依存しないなら順序問題なし

### 3.4 採用前確認 (= 実行 phase で対応)

- 4 file の **SQL 内容 review** で順序依存性確認 (= 例: 一方が他方の table を参照する FK 等の有無)
- 確認結果次第で 「保持」 / 「rename」 最終判断
- 本 readiness では推奨 「保持」 で確定、 SQL review は実行 phase で実施

---

## 4. CEO 判断必要事項 list

本 readiness を **採用** / **補正** のため、 以下を CEO 判断:

### 4.1 主判断

⬜ **Scenario 採用**: B 採用 (= 推奨) / A or C or D に補正 / 補正案
⬜ **重複 timestamp**: 保持 (= 推奨) / rename / SQL review 後判断
⬜ **実行 phase 着手タイミング**: 即時 / 別優先後 / P3-A-1 再開 (= Step 2 apply 方針確定) を待たず本 phase 単独実行可

### 4.2 副判断 (= Scenario B 採用時のみ)

⬜ **Stage B1 (= staging 一括 push)** の着手 GO 条件: AI 自律 or CEO 個別承認
⬜ **Stage B2 (= staging 検証)** の検証項目: 新 table 確認のみ / regression test 全件 / 個別判断
⬜ **Stage B3 (= production 8 file push)** の承認方式: 1 file ずつ承認 / 8 file 一括承認 / その他
⬜ **既存 `notifications` table SQL error** の扱い: staging 試行で確認 / 事前修正 / 無視

### 4.3 別 phase 接続

⬜ **P3-A-1 再開の条件**: 本 readiness 確定 + Step 2 (= apply 方針) + Step 3 (= DB persist / sync / sourceType 分離)、 各 step 別 readiness か、 統合 readiness か

---

## 5. 着手禁止事項 (= 本 readiness 不変原則)

- ❌ `supabase db push` を本 readiness 起草中に実行しない
- ❌ production / staging への schema 変更を本 readiness 起草中に行わない
- ❌ 重複 timestamp の rename を本 readiness 起草中に行わない
- ❌ migration file の手動 SQL 適用を行わない
- ❌ P3-A-1 branch に commit 追加しない (= freeze 不変原則)
- ❌ 本 readiness の内容を **「Scenario 採用前」 に逸脱** しない (= scope creep 防止)

実行 phase は別 readiness + CEO 個別 GO 制。

---

## 6. 参照

- `docs/alter-plan-p3-a-1-closeout.md` (= P3-A-1 freeze 状態、 再開条件 3 step、 P3-A-1 branch にあり)
- `docs/alter-plan-migration-apply-plan.md` (= D-e 採用時起草、 4 scenario の初期整理、 P3-A-1 branch にあり)
- `docs/decision-log.md` (= 2026-05-26 entry、 D-e + sourceType 流用 + 着地宣言 等、 P3-A-1 branch にあり)
- `docs/alter-plan-phase-next-1-rhythm-baseline-readiness.md` (= Phase Next-1 readiness、 migration apply 後の活用先、 P3-A-1 branch にあり)

注: 上記参照 doc は **P3-A-1 branch にあって main にはない**。 本 readiness は main 派生 branch だが、 内容は P3-A-1 branch の状態を前提とする (= read-only 確認結果 + closeout 内容を本 readiness §1 に再整理済)。

---

## 7. 不変原則 (= 本 readiness 自身の)

- 本 readiness は **docs-only**、 起草 commit 着地で停止
- 採用方針確定 → 実行 phase の readiness は **別途起草** (= CEO 個別 GO)
- 本 readiness 確定後の追加要素を 「本 readiness 範囲」 として書き加えない (= scope creep 防止)
- 必要に応じて補正 readiness (= v1.1 等) を起草

---

## 8. 次の動き (= CEO 判断後)

### Path α: Scenario B 採用 + 全 stage 一括方針確定
→ Stage B1〜B4 を統合 readiness で起草 → 各 stage の着手 GO 取得 → 実行 phase

### Path β: Scenario B 採用 + stage 別 readiness
→ Stage B1 から順次 readiness 起草 → 各 stage の着手 GO 取得 → 実行 → 次 stage

### Path γ: Scenario 補正 / 別案
→ CEO 指示に従い別 readiness

### Path δ: 着手延期
→ 本 readiness は採用済として凍結、 別優先 phase に移行 → 後日再開

---

## 9. 結論 (= 本 readiness の core)

**「Scenario B (= staging 同期 → production 同期) を採用し、 段階分割で安全に解消する」 を推奨。 重複 timestamp は保持で進める。 ただし採用は CEO 確定、 実行は別 phase。**

これにより、 P3-A-1 phase の再開条件 Step 1 が確定し、 Step 2 (= apply 方針確定) + Step 3 (= DB persist / sync / sourceType 分離) に進める基盤が整う。
