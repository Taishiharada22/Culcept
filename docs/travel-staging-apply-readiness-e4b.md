# Travel / Location Notes — Staging Apply Readiness Plan（Phase E-4B）

**作成日**: 2026-06-22
**ステータス**: 📐 readiness plan（docs-only）。**staging / production / remote DB に一切触れない。本書では実行しない。**
**前提**: 5 migrations は local db reset + opt-in RLS IT で検証済（E-3〜E-3C-3）。staging apply は **CEO explicit GO 必須**。

---

## 0. 一行サマリ
local 検証済みの Travel/Location Notes migration **5本**を staging（`hjcrvndumgiovyfdacwc`）へ apply するための手順・ref 安全ゲート・backup/forward-fix・smoke・risk・go/no-go を文書化。**production（`aljavfujeqcwnqryjmhl`）には絶対 link しない**。実行は別 GO。

---

## 1. migration inventory（対象 5本・依存順）

| 順 | ファイル | 目的 | local 実績 |
|---|---|---|---|
| 1 | `20260621100000_create_travel_core.sql` | travel_trips/days/photos/reservations/itinerary_items + trigger + owner-only RLS | db reset 適用・RLS 7/7（D-close） |
| 2 | `20260621100100_create_travel_movement_memories.sql` | travel_movement_legs / travel_memories | 同上 |
| 3 | `20260621100200_create_location_notes.sql` | location_notes(+saves/+to_itinerary)・公開 select policy・self_memo published 不可 check | 同上 |
| 4 | `20260621100300_harden_location_note_saves_insert.sql` | saves INSERT を可視 note のみに hardening（FK/RLS バイパス封鎖） | E-3B-1 IT 実証 |
| 5 | `20260621100400_harden_itinerary_link_insert.sql` | itinerary_items=自分の day のみ / note_to_itinerary=可視 note∧自分 day∧自分 item | E-3C-3 IT 実証 |

**依存順序（厳守）**: 1 → 2 → 3 → 4 → 5。
- 2 は 1 の travel_days/trips に依存。3 は 1 の travel_photos/itinerary_items（FK source_location_note_id 後付け）に依存。
- 4 は 3 の location_note_saves に依存。5 は 1 の itinerary_items + 3 の location_note_to_itinerary に依存。
- ファイル名の timestamp 昇順＝Supabase の適用順＝依存順で一致（並べ替え不要）。

> 注: 4/5 は既存 INSERT policy を drop→recreate（forward）。3 までで作った policy を「より厳しく」上書きするのみ。

---

## 2. ref safety plan（最重要）

| 環境 | project ref | 方針 |
|---|---|---|
| staging | `hjcrvndumgiovyfdacwc` | apply 対象（GO 後） |
| **production** | `aljavfujeqcwnqryjmhl` | 🔴 **絶対 link 禁止**（`.env.local` の `SHIFT_SMOKE_PROD_URL_DENY` と一致＝既知の deny ref） |

ゲート:
1. apply 前: `supabase/.temp/project-ref` が **存在しない（unlinked）** ことを確認。
2. `supabase link --project-ref hjcrvndumgiovyfdacwc` の **直後に** `cat supabase/.temp/project-ref` で **`hjcrvndumgiovyfdacwc` と一致**を二重確認。`aljavfujeqcwnqryjmhl` なら **即中止**。
3. apply 後: **必ず `supabase unlink`** → `project-ref` 不在を再確認。
4. `supabase/.temp/*`・`.branches` は **commit しない**（`.gitignore`/stage 対象外を維持。本セッションの運用と同じ）。
5. push/whole-branch merge は別 GO（本作業に含めない）。

---

## 3. backup / restore 方針

- **apply 前（staging）**:
  - schema snapshot: `supabase db dump --schema public -f backup/staging-schema-pre-e4b.sql`（link 済 staging に対し・**local backup/ ディレクトリ・remote へ書かない**）。
  - migration history 確認: `supabase migration list`（local と staging の差分・未適用 5本のみが出る想定）。
  - 既存データ量の把握（travel_*/location_notes が空 or 既存か）。
- **production**: 本フェーズ・本 apply の **対象外**（一切触れない）。
- **rollback でなく forward-fix 原則**: 問題時は destructive な down/DROP を staging で叩かず、**修正 migration を新規追加**して前進。各 migration の SQL 冒頭にある `-- rollback / down` コメントは緊急時の参考に留め、**安易な DROP は禁止**（特に create 系 1〜3）。
- 4/5（policy hardening）の forward-fix: policy が厳しすぎ/緩すぎなら、新 migration で `DROP POLICY ... ; CREATE POLICY ...` を再定義（drop→recreate は policy のみ・データ非破壊）。

---

## 4. apply plan（手順案・**本フェーズでは実行しない**）

```
# 0. 事前（local・GO 後に実施）
git branch --show-current && git status --short      # clean / 正ブランチ
test -f supabase/.temp/project-ref && echo LINKED || echo unlinked   # unlinked であること
docker version --format '{{.Server.Version}}'         # daemon 応答

# 1. staging link（直後に二重確認）
supabase link --project-ref hjcrvndumgiovyfdacwc
cat supabase/.temp/project-ref                        # ← hjcrvndumgiovyfdacwc 厳密一致。違えば即 unlink+中止

# 2. apply 前確認
supabase migration list                               # 未適用=5本（100000..100400）のみ
supabase db dump --schema public -f backup/staging-schema-pre-e4b.sql   # backup

# 3. apply（staging）
supabase db push                                      # 5本を昇順 apply

# 4. apply 後確認
supabase migration list                               # 5本 applied
#   → §5 staging smoke（read-only SQL / opt-in IT を staging 向けに）

# 5. link 解除（必須）
supabase unlink
test -f supabase/.temp/project-ref && echo "🔴STILL LINKED" || echo "✅ unlinked"
```
- **production 不触確認**: 全工程で ref=`hjcrvndumgiovyfdacwc` のみ。`aljavfujeqcwnqryjmhl` が現れたら即中止。
- `.temp` 変更は commit しない。

---

## 5. staging smoke plan（apply 後・read 中心 + 限定 write）

read-only SQL（staging・link 済 or psql）:
- tables exist: `SELECT tablename FROM pg_tables WHERE schemaname='public' AND (tablename LIKE 'travel_%' OR tablename LIKE 'location_note%')` → 10。
- RLS enabled: `SELECT relname, relrowsecurity FROM pg_class WHERE ...` → 全 t。
- policies exist: `SELECT polname FROM pg_policy WHERE ...`（saves/itinerary の hardened INSERT 含む）。
- check/unique: `pg_constraint`（self_memo published 不可・各 unique）。

挙動 smoke（**staging 用 opt-in IT を別途・テストユーザーで**・本番ユーザー非使用）:
- userA/userB visibility（location_notes / saves / itinerary）。
- getTripDay read（seed→組み立て）。
- LocationNotes read（own / published+approved）。
- save / userNote / itinerary write（owner・hardened policy 効）。
- 他人 private note save/link 不可・他人 day 書込不可（E-3B-1/E-3C-3 と同型を staging で再確認）。
- flag OFF default 確認（アプリ側 `NEXT_PUBLIC_PLAN_TRAVEL_SUPABASE_REPO_ENABLED` 未設定＝OFF）。
- **flag ON dogfood は別 GO**（本 smoke では点火しない）。

smoke 後: テストユーザー/seed を cleanup（cascade）。staging データ汚染を残さない。

---

## 6. risk register

| risk | 影響 | 緩和 |
|---|---|---|
| wrong ref link（prod 誤 link） | 🔴 production 直撃 | link 直後 `cat project-ref` 二重確認・deny ref 一致で即中止・apply 前 unlinked 確認 |
| RLS leakage | 他ユーザーデータ漏洩 | apply 後 pg_policy 確認 + userA/userB smoke（hardened 含む） |
| migration partial apply | schema 中途半端 | apply 前 backup + `migration list` 差分確認・失敗時 forward-fix migration |
| staging data pollution | テストごみ残留 | テストユーザー限定・smoke 後 cleanup（cascade） |
| public published visibility | 未完成の公開導線が露出 | published は Phase G まで運用しない（policy はあるが feed UI なし・flag OFF） |
| photo metadata | 捏造/blob 漏れ | photo_id=null 既定・写真アップロード未実装（E-3B/3C で確認済） |
| local/prod env 混線 | 誤接続 | apply は CLI link（`.env.local` は staging URL）・unlink 徹底・`.temp` commit 禁止 |
| `.temp` commit 事故 | ref 履歴混入 | stage 個別指定・`.temp`/`.branches` 除外運用継続 |

---

## 7. go / no-go checklist（apply 実行の前提・全て満たすこと）

- [ ] Docker daemon 応答（`docker version` Server 出力）
- [ ] CLI 利用可（`supabase --version`）
- [ ] branch = 正（`claude/travel-connect-finish-20260621` 等）・`git status` clean
- [ ] origin/main 不触（push/PR/deploy しない）
- [ ] apply 前 `supabase/.temp/project-ref` **unlinked**
- [ ] backup 取得（`backup/staging-schema-pre-e4b.sql`）
- [ ] staging ref = `hjcrvndumgiovyfdacwc` を link 直後に二重確認（prod `aljavfujeqcwnqryjmhl` でない）
- [ ] **CEO explicit GO**（staging apply は承認案件）
- [ ] stop conditions（下記）に該当しないこと

### stop conditions（発生したら即中止・unlink・報告）
- project-ref が `aljavfujeqcwnqryjmhl`（prod）になった
- `migration list` の差分が想定（5本）と違う
- apply が部分失敗した
- RLS/policy smoke が期待と違う（他人データが見える/書ける）
- backup が取れない
- `.temp`/env を commit しそうになった
- production への接続が要求された

---

## 8. 本フェーズ（E-4B）でやらないこと
staging apply / production apply / `supabase db push` / remote SQL / link / unlink / backup 実行 / seed / flag 点火 / Calendar 本切替 / API route / push。**すべて別 GO**。本書は計画の文書化のみ。

## 9. 次フェーズ候補
- **E-5（別 GO・実行）**: 本 plan に従い staging apply（CEO GO + 二重確認ゲート）→ staging smoke。
- その後: 認証済み環境での flag ON live dogfood → production apply（さらに別 GO）。
