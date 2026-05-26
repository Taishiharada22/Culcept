# Migration Apply Plan — production 未適用 / staging 空 / 重複 timestamp の整理

**Date**: 2026-05-26
**Status**: 🟡 計画整理のみ (= D-e 採用、 実 apply 不実施)
**Scope**: **P3 範囲外の運用 debt 整理**、 実行は別 phase で CEO 慎重判断

---

## 0. 背景 — D-e 採用に至るまで

CEO 「P3-A-1-1 の migration apply (= D)」 着手 → ① 前提を疑え に従って read-only 確認 → **production / staging 両方が main と未同期** が判明。

CEO 分岐ルール:
- production が main と同期済み = Yes → D-a (= staging を main 同期)
- production が未同期 = **No → D-e (= apply 止めて計画整理)** ✅

本文書は D-e の **計画整理 (= 別 phase 着手前の判断材料)** を提供する。 実 apply の実行は本文書範囲外。

---

## 1. 現状 (= 2026-05-26 read-only 確認)

### 1.1 Production (= Culcept Tokyo、 `aljavfujeqcwnqryjmhl`)

- **169 file 適用済**
- **8 file 未適用** (= 6 timestamp、 うち 2 timestamp は file 重複):

| # | Timestamp | File 名 | 内容 |
|---|-----------|---------|------|
| 1 | `20260430100000` | `coalter_memory_items_realtime.sql` | Coalter memory realtime |
| 2 | `20260430100000` | **`external_anchors.sql`** | **P3 foundation** (= external_anchors / external_anchor_sources table) |
| 3 | `20260430110000` | `coalter_memory_items_replica_full.sql` | Coalter memory replica |
| 4 | `20260430110000` | `plan_drift_events.sql` | Plan drift events table |
| 5 | `20260519100000` | `create_external_anchor_bundle.sql` | W1-Y RPC (= P3 が使用) |
| 6 | `20260520120000` | `coalter_mirror_app_settings.sql` | Coalter mirror settings |
| 7 | `20260526100000` | `p3_ics_import.sql` | P3-B `.ics` import |
| 8 | `20260526110000` | `p3_a_1_1_calendar_oauth.sql` | P3-A-1-1-a Calendar OAuth (= 本 phase) |

### 1.2 Staging (= culcept-staging Mumbai、 `hjcrvndumgiovyfdacwc`)

- **175 file 全て未適用** (= 完全空)
- dev project 作成のみで、 一度も migration apply されていない
- 「30+ 未適用」 と前回 (= B1 試行 dry-run) 認識したが、 実は **全件未適用** が正しい

### 1.3 Repo main migrations directory

- **175 file** in `supabase/migrations/`
- **重複 timestamp 2 セット**:
  - `20260430100000_*` → `external_anchors` + `coalter_memory_items_realtime` (= 2 file 同 timestamp)
  - `20260430110000_*` → `plan_drift_events` + `coalter_memory_items_replica_full` (= 2 file 同 timestamp)
- supabase CLI は migration_table で order を timestamp で管理するため、 重複 timestamp は **どちらが先に apply されたか曖昧**

---

## 2. 重要な含意 (= P3 状態への影響)

### 2.1 P3 全体 (= `.ics` + Google OAuth) の前提 が production に未適用

- `20260430100000_external_anchors.sql` (= external_anchors / external_anchor_sources table) が production に **未適用**
- P3 の **全機能** は production で動かない (= DB がない)
- 現状 production smoke で観察された 「`user_calendar_connections` not found」 「`not_configured`」 は **全て expected**

### 2.2 P3-A-1-1 の各 commit の production 実 動作状況

| Sub-phase | 実装 | production 実 動作 |
|-----------|------|---------|
| `c6d607ab` (= connect route) | state 生成 + Google OAuth URL redirect | ✅ 動く (= env が無いため degrade redirect、 banner で表示) |
| `b1272a86` (= callback route) | state verify + token exchange + DB persist | ❌ 動かない (= DB なし、 env なし) |
| `7aa63fdb` (= status/disconnect + modal toggle) | DB query / DB delete | ✅ fail-safe で動く (= status が常に `connected: false`、 disconnect が idempotent) |
| `139aebde` (= CalendarConnectBanner) | URL query → banner | ✅ 動く (= DB 不要、 client-side) |

### 2.3 依存関係

```
20260430100000_external_anchors.sql
    ↓ (前提)
20260519100000_create_external_anchor_bundle.sql
    ↓ (前提)
20260526100000_p3_ics_import.sql (= P3-B)
20260526110000_p3_a_1_1_calendar_oauth.sql (= P3-A-1-1-a)
```

- `external_anchors` table が無いと、 P3 全体が動かない
- W1-Y RPC は `external_anchors` を参照
- P3-B / P3-A-1-1-a は両方とも `external_anchors` + RPC の上に構築

---

## 3. シナリオ別 適用判断材料

### Scenario A: production 単独 apply (= staging skip)

**手順**:
1. CEO が手動で `supabase db push --linked` (= production linked 状態)
2. 6 timestamp が順次 apply
3. 重複 timestamp は CLI が file 名 alphabetical or 取り込み順で順序決定

**利点**: 最短、 production が main 同期される、 P3 が production で実 動作

**リスク**:
- 重複 timestamp の順序が 曖昧 (= `external_anchors` と `coalter_memory_items_realtime` のどちらが先?)
- production data に対する ADD COLUMN / ADD INDEX 系は安全だが、 CHECK 制約変更で既存 row が違反すれば失敗
- staging が空のままなので、 検証環境がない

**推奨**: ⚠️ 重複 timestamp の順序確認 + 個別 file レビュー後に CEO 慎重判断

### Scenario B: staging 同期 → production 同期 (= 順序)

**手順**:
1. staging を main 同期 (= 175 file 一括 apply)
2. staging で P3 動作確認 (= local 起動の失敗が staging で再現するか含めて)
3. 問題なければ production の 6 件 apply

**利点**: staging で検証可能、 production への影響を予見可能

**リスク**:
- staging 一括 apply は 「production にも未適用な migration」 を staging に先行 apply する
- staging で **既存 migration の bug** (= local 起動で発生した `notifications` table SQL error) が再現すれば、 production にも同じ bug が及ぶ
- 175 file の一括 apply は時間 + リスク大

**推奨**: ✅ 安全策として推奨、 ただし 175 件は段階分割を検討

### Scenario C: production の 6 件のみ手動 apply (= migration 単独)

**手順**:
1. CEO が手動で 6 file の SQL を順次実行 (= psql 経由、 supabase CLI を使わず)
2. supabase migration history table も手動更新

**利点**: 最小限の apply、 staging に触らない

**リスク**:
- migration history table の手動更新は人為的ミスのリスク
- supabase CLI の次回 push で 「remote 状態と migration table が一致しない」 エラーが出る可能性
- 推奨されない (= migration management が壊れる)

**推奨**: ❌ 非推奨

### Scenario D: 全部止めて、 別 staging project を作る

**手順**:
1. 新規 Supabase project (= 例 `culcept-staging-v2`) を作成
2. 新規 project に main 全 migration apply (= clean state)
3. 既存 staging (= culcept-staging) は廃止 or 別用途
4. production はそのまま (= 6 件未適用)

**利点**: staging を clean state で再構築、 既存 staging の運用 debt を切り離す

**リスク**: 大ごと (= project 切替の手間)、 既存 staging の参照を更新する必要

**推奨**: ⚠️ 中長期的な選択肢、 即決ではない

---

## 4. 重複 timestamp の解消方針 (= P3 範囲外、 別 phase)

repo main に 2 セットの重複 timestamp が存在:
- `20260430100000_external_anchors.sql` + `20260430100000_coalter_memory_items_realtime.sql`
- `20260430110000_plan_drift_events.sql` + `20260430110000_coalter_memory_items_replica_full.sql`

**解消案**:
1. **timestamp rename** (= 後者を 1 秒 後ろにずらす、 例 `20260430100001` / `20260430110001`)
   - 利点: clean、 ordering 明確化
   - リスク: production 既に適用済の migration を rename すると history mismatch
2. **そのまま保持** (= 現状維持)
   - 利点: production に影響なし
   - リスク: 将来同 issue が再発

**判断**: production に既適用なら rename 不可、 未適用 (= 本件の場合) なら rename 可。 ただし P3 範囲外、 別 phase で CEO 判断。

---

## 5. P3 側の DB 非依存 進行範囲 (= CEO 確定 2026-05-26)

CEO 「P3 は DB 非依存部分だけ前に進める」 に従い、 以下は本 phase で **継続可能**:

### 5.1 P3-A-1-2 initial sync (= 次着手候補)

DB 非依存で実装できる範囲:
- `lib/oauth/googleCalendarEvents.ts` (= GET events API helper、 fetch mockable)
- `lib/oauth/icsEventMapper.ts` (= Google events → ExternalAnchor 変換、 pure)
- unit tests (= fetch mock + transform 純関数 test)
- 範囲外: DB persist (= `external_anchors` insert は migration apply 後)

### 5.2 P3-A-1-1-e token refresh helper

DB 非依存:
- `lib/oauth/refreshGoogleAccessToken.ts` (= refresh_token → access_token、 fetch mockable、 pure)
- unit tests (= mock)
- 範囲外: 実 DB 経由の refresh_token 取り出し + DB write (= apply 後)

### 5.3 P3-A-1-1-g 設定画面 (= 連携セクション)

DB 非依存で実装できる範囲:
- UI component (= マイページ > 設定 > 連携)
- subscriptions toggle UI (= local state 操作のみ)
- 範囲外: 実 DB 接続 = `user_calendar_subscriptions` 読み書き

### 5.4 D-e で除外される範囲 (= apply 後の phase)

- 実 OAuth flow の DB persist 検証 (= callback 完了 → DB write 確認)
- 初回 pattern card v1 (= DB から calendar list 読んで pattern 計算)
- subscriptions の per-calendar toggle 実 動作

---

## 6. 着手禁止事項 (= D-e の不変原則)

- staging / production への `supabase db push` を実行しない
- migration debt の解消を本 P3 phase に混ぜない
- 重複 timestamp の rename を本 phase で行わない
- production への migration file の手動 SQL 適用を行わない

---

## 7. CEO 判断必要事項 (= 別 phase で扱う)

⬜ **migration debt 解消 phase の起動タイミング** (= P3 完了後 / Phase Next 前 / 別 priority)
⬜ **採用 Scenario** (= A / B / C / D / 補正)
⬜ **重複 timestamp 解消方針** (= rename / そのまま保持)
⬜ **staging 同期の優先度** (= dev/test 環境が空のまま運用継続するか)

これらは本 P3-A-1-1 の責務ではなく、 環境管理 debt 解消の別 phase。

---

## 8. 参照

- `docs/decision-log.md` (= 2026-05-26 entry、 D-e 採用記録)
- `docs/alter-plan-p3-a-1-1-oauth-scaffold-readiness.md` (= 親 readiness、 db push HOLD 明示)
- `supabase/migrations/20260526110000_p3_a_1_1_calendar_oauth.sql` (= P3-A-1-1-a draft、 未 apply)
- CEO 確定 (= 2026-05-26): 「実 apply は止める、 状況を記録する、 P3 は DB 非依存部分だけ前に進める」
