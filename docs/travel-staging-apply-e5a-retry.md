# Travel / Location Notes — Staging Apply 実行結果（Phase E-5A retry）

**実行日**: 2026-06-22
**結果**: ✅ **Travel 5本 staging apply 成功**（structural 検証 PASS）/ 行動 smoke は staging auth 制約で未実施（local で担保）
**production**: 完全不触。**staging ref のみ**（`hjcrvndumgiovyfdacwc`）。apply 後 unlink 済。

---

## 0. サマリ
E-5A-R2 で history 整合（CoAlter 3本 verbatim 取り込み）後、retry。最初の gate で **remote-only=0 / local-only=Travel 5本 / CoAlter 3本 applied-both** を確認 → `db push` で **Travel 5本のみ apply 成功**。staging に 10 table + RLS + hardened policy を確認。行動 RLS smoke は staging の auth が test email を拒否したため未実施（同一 schema の local IT 10 PASS で担保）。

## 1. 作業前 branch / HEAD / status
branch `claude/travel-connect-finish-20260621` / HEAD `24abc44a5` / source clean。

## 2. link 前 project-ref 不在
✅ absent。

## 3. link 後 project-ref 確認
`supabase link --project-ref hjcrvndumgiovyfdacwc` → `cat project-ref` = **`hjcrvndumgiovyfdacwc`（staging 完全一致・prod `aljavfujeqcwnqryjmhl` でない）** ✅

## 4. migration list（apply 前 gate）
- **remote-only = 0** ✅
- **local-only = Travel 5本のみ**（20260621100000/100100/100200/100300/100400）✅
- **CoAlter 3本 = applied-both**（20260613120000/20260615100000/20260616100000）✅

## 5. backup 結果
`supabase db dump --schema public -f backup/staging-schema-pre-e5a-retry.sql` 成功（616KB・read-only・**未 commit**）✅

## 6. db push 結果
✅ **成功**。`Applying migration 20260621100000..100400` → `Finished supabase db push`。NOTICE は冪等 `DROP ... IF EXISTS` ガードのみ。CoAlter 3本は remote 既存ゆえ **再 apply されず**、Travel 5本のみ apply。

## 7. migration list（apply 後）
Travel 5本すべて **applied-both**（Local+Remote）・**remote-only=0**。

## 8. tables / RLS / policies 確認（post-apply dump 検証）
- travel/location tables: **10**（travel_trips/days/photos/reservations/itinerary_items/movement_legs/memories・location_notes/saves/to_itinerary）✅
- RLS enabled: **10/10** ✅
- hardened INSERT policies: **3**（location_note_saves_owner_insert / travel_itinerary_items_owner_insert / location_note_to_itinerary_owner_insert・可視 EXISTS 条件付き）✅
- self_memo published 不可 check + unique（saves/to_itinerary/itinerary_day_note）= 4 一致 ✅

## 9. staging smoke 結果
- **structural（上記 §8）**: PASS。
- **behavioral（userA/userB visibility・write・RLS-negative）**: **staging 未実施**。理由＝staging auth が test email（`@example.com`）を "invalid" で拒否し、anon signUp でテストユーザーを作成できない（service_role での admin 作成は禁止）。throwaway smoke script は signUp 段階で停止＝**staging に行も書いていない**（汚染ゼロ）。
- behavioral RLS は **同一 migration の local IT で担保済**（E-3〜E-3C-3・opt-in IT 10 PASS：userA/userB visibility・save/userNote/itinerary write・他人 private note save/link 不可・他人 day 書込不可・self_memo published 不可）。staging は同じ migration を apply 済＝同一 policy。

## 10. cleanup 結果
behavioral smoke は signUp で停止し **データ未作成** → cleanup 対象なし。staging 汚染ゼロ。throwaway script 削除済。

## 11. unlink 結果
`supabase unlink` 成功 → `project-ref` **不在** ✅

## 12. remote production 不触確認
全工程 ref=`hjcrvndumgiovyfdacwc` のみ。production `aljavfujeqcwnqryjmhl` への接続・SQL：**一切なし**。

## 13. `.temp` / `.branches` / env / backup dump 未stage確認
✅ いずれも未 stage。backup dump（pre/post retry・各 616KB）は local untracked。

## 14. 作成した docs
本書 `docs/travel-staging-apply-e5a-retry.md`。

## 15. 残課題 / 未確認
- staging での behavioral RLS live 確認（auth が test email 拒否 → 有効 email ドメイン or 認証済みユーザーが要る・別 GO）
- flag ON dogfood（未実施）/ API route / production apply（すべて別 GO）

## 16. 次フェーズ候補（別 GO）
- staging での flag ON dogfood（有効ユーザーで実 UI smoke）
- API route / server fetch 配線
- production apply（CLI prod re-link は二重確認 + CEO GO・本 plan の prod 版が必要）
