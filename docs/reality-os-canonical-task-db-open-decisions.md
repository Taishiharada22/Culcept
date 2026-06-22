# Canonical Task Store — DB Open Decisions（CEO 裁定 pack）

- **作成日**: 2026-06-21
- **目的**: RO-9 / RO-10 / `sql.draft` で未確定/再確認の項目を、**CEO が裁定できる形**に集約。migration GO（`supabase/migrations/` 昇格）前の最終 gating doc。
- **状態**: docs-only。実装・SQL 作成・migration 昇格・DB 接続は一切なし。
- **出典**: 旧RO `42ab074bc` の `docs/reality-os-ro9-task-store-persistence-design.md` §11 / `docs/reality-os-ro10-canonical-task-migration-readiness.md` §12 / `docs/reality-os-ro10-canonical-task-migration.sql.draft`
- **本セッションでは扱わない**: CoAlter / Origin / Travel / root asset / UI 配線 / RO 残 pure kernel 全般

---

## 0. 凡例

各 openDecision を以下 7 フィールドで記載：
1. **決める項目** / 2. **推奨案** / 3. **根拠** / 4. **反対案** / 5. **影響範囲** / 6. **未決のまま進むリスク** / 7. **CEO 裁定欄**

**ステータス分類**:
- 🆕 **未確定**（CEO 新規裁定が必要）
- 🔁 **再確認**（draft で採用済・CEO 黙示承認 → 明示確認したい）
- 📦 **scope 外**（本セッションでは扱わない・別 GO を明示）

---

## 1. 🆕 table 名

1. **決める項目**: 新規 user-todo 永続 table の名前。
2. **推奨案**: **`canonical_tasks`**
3. **根拠**: kernel 型 `CanonicalTaskV0`（C1 carry 済）と naming 整合。`source_task_id` を salvage provenance として保持する設計（RO-9 §3 / sql.draft）と読みが揃う。
4. **反対案**: `plan_tasks`（plan ドメイン整合・短い）。ただし既存 `plan_seeds`（candidate seed＝別概念）と紛らわしい。
5. **影響範囲**: table 名・全 RLS policy 名・index 名・trigger 関数名・将来 repository 層の symbol。
6. **未決のまま進むリスク**: sql.draft が `canonical_tasks` で進んでおり、別名採用なら draft 書き直し＋RO-9/10 doc 整合修正が発生（migration apply 後の rename は重コスト）。
7. **CEO 裁定**: ☐ `canonical_tasks` / ☐ `plan_tasks` / ☐ 他: ___________

---

## 2. 🔁 soft archive 方針

1. **決める項目**: 完了/不要 task を **hard delete** か **soft archive (`archived_at`)** か。
2. **推奨案**: **soft archive（`archived_at timestamptz NULL`）**（=sql.draft 採用済の再確認）
3. **根拠**: completed/carriedFrom/motivation/completionFeel は深層観測の素材。hard delete は観測資産消失。CEO RO-10 既裁定。active 一覧は `WHERE archived_at IS NULL`（partial index あり）。
4. **反対案**: hard delete（ストレージ最小化）。ただし観測価値喪失と不可逆性が大きい。
5. **影響範囲**: schema（`archived_at` 列）/ index `idx_canonical_tasks_user_active`（partial）/ UI 既定 query / privacy 削除要求対応（archive vs purge の区別が要る）。
6. **未決のまま進むリスク**: 後から soft → hard 退避（archive データ消失）は不可逆。
7. **CEO 裁定**: ☐ soft archive（推奨確認） / ☐ hard delete / ☐ 他

---

## 3. 🆕 source_kind 初期値と将来値

1. **決める項目**: `source_kind` 列の許容値集合。
2. **推奨案**: 初期 = **`daily_orbit`**（OrbitTask salvage）。将来値 = **`manual`**（新 UI 入力）/ **`import`**（外部 import）。3値で CHECK 制約。
3. **根拠**: sql.draft の CHECK と RO-9 §11(4)。Origin 削除後の task 入力導線（`manual`）と外部システム取込（`import`）の余地を残す。
4. **反対案**: 1値固定（`daily_orbit` のみ）→ 後で CHECK 制約変更（重 migration）が要る。
5. **影響範囲**: CHECK 制約 / `UNIQUE(user_id, source_kind, source_task_id)` の dedup 粒度 / 将来の入力経路設計。
6. **未決のまま進むリスク**: 1値で固めると後の `manual`/`import` 追加が migration 化必要。3値固定なら additive で済む。
7. **CEO 裁定**: ☐ 3値推奨 / ☐ 1値固定 / ☐ 他値追加: ___________

---

## 4. 🔁 due_time の timezone 扱い

1. **決める項目**: `due_time time` を tz 付きで持つか、naive time + projection で JST 合成か。
2. **推奨案**: **naive `time`（tz なし）+ projection 側で `+09:00` 合成**（=sql.draft 採用済の再確認）
3. **根拠**: kernel `dueTime: string|null`（HH:mm）と整合。RO-8 §4 と整合。Postgres `time` は tz 非保持で必要十分。
4. **反対案**: `timetz`（tz 付き）。ただし `time` 列に tz を載せる場面は少なく、過設計。
5. **影響範囲**: 列型 / projection 層の JST 合成 / 将来「tz 跨ぎ user」を扱う際の追加設計（v0 では非対応）。
6. **未決のまま進むリスク**: tz 跨ぎ user（海外移動・JST 外居住）は将来課題として持ち越し。v0 で約束しすぎると後で削るほうが難しい。
7. **CEO 裁定**: ☐ naive time（推奨確認） / ☐ timetz / ☐ 他

---

## 5. 🔁 recurring instance 永続方針

1. **決める項目**: recurrence を **定義のみ store** するか、**展開した instance も永続**するか。
2. **推奨案**: **定義のみ store**（`recurrence jsonb`）。instance は projection で算出（=sql.draft 採用済の再確認）
3. **根拠**: instance 永続は同一 task が複数行になり**二重正本化リスク**。RO-9 §11(6) 既裁定。kernel の `CanonicalTaskRecurrenceV0` も「定義」型。
4. **反対案**: instance も永続（完了状態の per-instance 記録が容易）。だが正本問題と冪等 migration の難度が跳ね上がる。
5. **影響範囲**: schema / migration extraction の複雑度 / per-instance 完了状態の表現方法（将来課題）。
6. **未決のまま進むリスク**: per-instance 完了の表現が決まらないまま UI 設計に進むと、completed フラグの解釈が分裂する。
7. **CEO 裁定**: ☐ 定義のみ（推奨確認） / ☐ instance も永続 / ☐ 他

---

## 6. 🆕 migration runner / service_role 不使用方針

1. **決める項目**: extraction → INSERT を実行する runner の種類。
2. **推奨案**: **owner 文脈 batch（user ごと auth context・RLS 準拠）**。**`service_role` / `SECURITY DEFINER` 不使用**。
3. **根拠**: RLS owner-only policy（sql.draft）と整合。service_role 経路は RLS bypass = 事故時の blast radius 最大。RD3x-ACTIVATE と同じ厳格度。
4. **反対案**: 管理 job（service_role）で全 user 一括移送。速度は出るが RLS bypass のため CEO 安全則違反。
5. **影響範囲**: migration 実行手順 / 失敗時 retry の粒度（user 単位） / 監査ログ。
6. **未決のまま進むリスク**: service_role 経路を許す決定が紛れると、staging dry-run も production も RLS 検証が無意味化。
7. **CEO 裁定**: ☐ owner batch + service_role 不使用（推奨確認） / ☐ 管理 job 許可 / ☐ 他

---

## 7. 🆕 parentId two-pass の保持方法

1. **決める項目**: 1st-pass で `parent_id=NULL` 挿入後、2nd-pass で `source_parent_id → 新 id` 解決する際の **source_parent_id 一時保持手段**。
2. **推奨案**: **一時列 `_source_parent_id text`（migration 後 DROP）**
3. **根拠**: staging table 方式は dedup 困難・管理対象テーブル増。一時列なら dry-run 検証も同一 table 内で完結。
4. **反対案**: staging table（`canonical_tasks_import` 等）方式。隔離は強いが運用複雑。
5. **影響範囲**: schema（一時列の有無）/ migration extraction SQL の構造 / DROP 漏れ時の schema 汚染。
6. **未決のまま進むリスク**: dry-run 直前まで決まらないと dry-run checklist が組めない。
7. **CEO 裁定**: ☐ 一時列（推奨） / ☐ staging table / ☐ 他

---

## 8. 📦 task 入力 UX（source_kind='manual'）

1. **決める項目**: Origin 削除後の canonical task 入力導線（新 UI）。
2. **推奨案**: **本セッション scope 外**として明示分離。RO-9/10 既裁定どおり別 GO。
3. **根拠**: 本セッションは **migration / persistence のみ**。UX は kernel 永続化後の別 product GO。スコープ汚染防止。
4. **反対案**: 同セッションで合わせて決める → スコープ膨張・UI 配線禁止則違反。
5. **影響範囲**: 別 GO セッションの責務範囲 / `source_kind='manual'` の活用タイミング。
6. **未決のまま進むリスク**: scope 混線で「migration GO」と「UI GO」が同じ判断と誤認される。
7. **CEO 裁定**: ☐ scope 外で明示分離（推奨） / ☐ 本セッションに取り込む

---

## 9. 🆕 archive 自動化規則

1. **決める項目**: 完了 task を **自動 archive** するか、するなら遅延（即時 / N 日後）。
2. **推奨案**: **v0 = 手動 archive のみ**（自動化なし）
3. **根拠**: RO-10 §12(4)。観測価値の高い完了 task を自動消すと、UX が「消えた」感覚になりやすい。手動で挙動と需要を観察してから自動化を決める。
4. **反対案**: 完了即時 archive / 7日後 archive 等。
5. **影響範囲**: kernel/UI の表示 default / 観測データ滞留期間 / Archive 一覧 UX。
6. **未決のまま進むリスク**: 自動化前提で UI 設計が進むと、後の方針変更で見え方が大きく変わる。
7. **CEO 裁定**: ☐ v0 手動のみ（推奨） / ☐ 完了即時 archive / ☐ N日後 archive（N=___）/ ☐ 他

---

## 10. 🔁 staging dry-run 必須条件

1. **決める項目**: production apply 前の staging dry-run で**必ず通すべき条件**の集合。
2. **推奨案**: **RO-10 §7 の 11 step を必須・順序固定**（=既定の再確認）
   1) `.sql.draft` → `supabase/migrations/<ts>_canonical_tasks.sql` rename（**CEO GO 後のみ**）
   2) staging で CREATE TABLE + RLS + trigger 適用
   3) migration-check skill 走査（RLS漏れ/破壊変更/依存順序）
   4) extraction [E2] audit（total/skipped 計測・**SELECT のみ**）
   5) extraction [E1] INSERT（`ON CONFLICT DO NOTHING`）→ 件数照合
   6) **dedup 検証**: 2 回目 INSERT が 0
   7) parentId two-pass [E3] 実行 → dangling 件数照合
   8) **RLS smoke**（§11）
   9) **projection 検証**: DB行 → `CanonicalTaskV0` → `projectCanonicalTaskToRealityNode` → `taskRealityNodeViolations=[]`
   10) **rollback リハーサル**（§12）
   11) CEO に dry-run 結果（件数/skip/dedup/dangling/RLS）報告 → production apply GO 判断
3. **根拠**: RO-10 readiness の核。staging で**冪等性・dedup・dangling・RLS・projection**の 5 不変条件を全て実証してから production。
4. **反対案**: 一部省略（時短）。だが冪等性 or RLS 抜けは production で復旧不可級。
5. **影響範囲**: dry-run の所要時間 / production GO 判断材料 / 監査記録。
6. **未決のまま進むリスク**: staging が緩いと production apply で初めて欠陥に出会う。
7. **CEO 裁定**: ☐ 11 step 必須・順序固定（推奨確認） / ☐ 緩和（緩和項目: ___________）

---

## 11. 🔁 RLS smoke 条件

1. **決める項目**: dry-run §10-(8) の RLS smoke として**必ず通すべき検証**。
2. **推奨案**: **owner-only 4 policy（SELECT/INSERT/UPDATE/DELETE）について、以下 3 ケースを必須**：
   - (a) STAGING_USER_A が自分の task を read/write できる
   - (b) STAGING_USER_A が **STAGING_USER_B の task を read/write できない**
   - (c) production-url は dry-run スクリプトから **reject**（誤接続防御）
3. **根拠**: sql.draft の RLS は owner-only・`auth.uid()=user_id`。`service_role` 経由は非使用前提。3 ケースで「読める」「他者は読めない」「production に届かない」を実証。
4. **反対案**: (a) のみで済ます（時短）。だが (b) 抜けは**他 user データ漏洩**、(c) 抜けは**production 直撃**。
5. **影響範囲**: dry-run スクリプトの構成 / staging ユーザ 2 アカウント準備。
6. **未決のまま進むリスク**: RLS の non-functional 部分（隔離・誤接続）が production まで残る。
7. **CEO 裁定**: ☐ (a)(b)(c) 必須（推奨） / ☐ (a)(b) のみ / ☐ 他

---

## 12. 🔁 rollback rehearsal 条件

1. **決める項目**: dry-run §10-(10) で実証すべき rollback の挙動。
2. **推奨案**: **staging で以下 4 点を実証**：
   - (a) `DROP TABLE public.canonical_tasks CASCADE;` で table が消えること
   - (b) `DROP FUNCTION public.set_canonical_task_updated_at();` で trigger 関数が消えること
   - (c) `daily_orbit_state` が**不変**（行数・JSON 完全一致）
   - (d) DROP 後の再 apply（再 CREATE）が冪等に成功
3. **根拠**: sql.draft の Rollback 節と整合。元データ `daily_orbit_state` は read-only extraction ゆえ非破壊。rollback 後の再 apply 成功が「中断 → 再 run 安全」の前提。
4. **反対案**: (d) を省く。だが migration 中断時に再 run が壊れたら復旧手段が無い。
5. **影響範囲**: rollback 手順書 / 中断時 SOP / 監査記録。
6. **未決のまま進むリスク**: 中断時に「戻す/再開する」のどちらも手順未確定なら GO 判断不能。
7. **CEO 裁定**: ☐ 4 点必須（推奨） / ☐ 緩和: ___________

---

## 13. 🆕 production apply gate

1. **決める項目**: production apply の最終 gate 条件。
2. **推奨案**: **以下 全 6 条件 AND**：
   - (a) §10 staging dry-run 11 step 全 PASS（記録あり）
   - (b) §11 RLS smoke 3 ケース全 PASS
   - (c) §12 rollback 4 点全 PASS
   - (d) §1-§9 openDecisions が **全て CEO 裁定済**
   - (e) production の **link 状態を二重確認**（`cat supabase/.temp/project-ref` が production ref と一致・誤 worktree でない）
   - (f) **CEO 明示 GO**（口頭/text）+ backup（`pg_dump` 等）取得
3. **根拠**: RD3x-ACTIVATE 厳格度＋RO-10 §11（apply 未実行確認）。本 migration は **observation 資産を扱う**ため事故の blast radius が大きい。
4. **反対案**: (e)(f) のみで省略（高速）。だが過去事故（production-link worktree 残存）の再発リスク。
5. **影響範囲**: production apply の意思決定プロトコル / 監査ログ / CEO 承認形式。
6. **未決のまま進むリスク**: gate が緩いと「staging OK→そのまま production」が起きて事故源化。
7. **CEO 裁定**: ☐ 6 条件 AND（推奨） / ☐ (e)(f) のみ / ☐ 他: ___________

---

## まとめ: 未裁定一覧（13項目）

| # | 項目 | 種別 | 推奨案要約 |
|---|---|---|---|
| 1 | table 名 | 🆕 | `canonical_tasks` |
| 2 | soft archive | 🔁 | soft archive（archived_at） |
| 3 | source_kind | 🆕 | 3値（daily_orbit/manual/import） |
| 4 | due_time tz | 🔁 | naive time + projection JST 合成 |
| 5 | recurring instance | 🔁 | 定義のみ store |
| 6 | migration runner | 🆕 | owner batch + service_role 不使用 |
| 7 | parentId two-pass | 🆕 | 一時列 `_source_parent_id`（DROP） |
| 8 | task input UX | 📦 | scope 外（別 GO） |
| 9 | archive 自動化 | 🆕 | v0 手動のみ |
| 10 | staging dry-run | 🔁 | RO-10 §7 11 step 必須 |
| 11 | RLS smoke | 🔁 | (a)(b)(c) 3 ケース必須 |
| 12 | rollback rehearsal | 🔁 | 4 点必須 |
| 13 | production apply gate | 🆕 | 6 条件 AND |

**migration 化前に必要な CEO 判断 = 全 13 項目の裁定欄記入。**
裁定後の次段階 = `.sql.draft` を `supabase/migrations/<ts>_canonical_tasks.sql` へ昇格（**裁定 + CEO GO 後のみ**）。

---

## 停止条件

本 docs（R2）で停止。以下は本 doc では**しない**：
- `supabase/migrations/` への .sql 追加
- SQL 草案修正（裁定結果に応じた草案改訂は別 commit/別 GO）
- `db push` / `migration up` / `repair` / `pull` / direct SQL
- INSERT/UPDATE/DELETE / seed / Docker・local Supabase start
- production 接続 / UI 配線 / featureFlags 変更 / decision-log 変更

裁定が揃ったら、別 GO で「sql.draft 改訂 → staging dry-run 準備（実行はさらに別 GO）」へ進む。
