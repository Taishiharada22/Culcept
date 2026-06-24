# Travel Connect — Freeze / Integration Handoff（E-7Z）

**作成日**: 2026-06-23
**ステータス**: 🧊 **FROZEN**（feature session 完了・統合セッションへ handoff）。production apply / deploy / staging dogfood / global flag ON は**未実施**。

---

## 1. branch / HEAD / base
- branch: `claude/travel-connect-on-a9eedce69-20260623`
- HEAD: **`21f791d76`**（= origin remote HEAD 一致）
- base: **`a9eedce69`**（新共通 base・CoAlter engine 系を含む main 系）。`a9eedce69..HEAD` = **27 commits**。
- 旧 freeze: `claude/travel-connect-finish-20260621` @ `4115ae77c`（backup ref `backup/travel-connect-before-a9eedce69-rebase-20260623`）。本 branch は旧成果を `a9eedce69` 上へ cherry-pick 載せ替えたもの（衝突ゼロ実績）。

## 2. 主要 commit（新しい順・抜粋）
- `21f791d76` E-6A — Supabase repo ON **write-path 修正**（破壊的 round-trip 根絶 + itinerary DB 到達）
- `ac7e15e06` safety fix — CLI runtime artifact untrack（**production project-ref 地雷除去**）
- `f66160248` E-5B local Supabase behavioral smoke PASS
- `2a6a7a369` / `715b42ede` E-5A retry / E-5A-R2（staging Travel 5本 apply 記録・CoAlter 3本 verbatim 取り込み）
- `48ad63429` E-3C-3 旅程追加 Supabase write（owner/可視 hardening）
- `0c7ff91a5` E-3B-1 location_note_saves INSERT hardening
- `447718bea` D — Travel/Location Notes Supabase schema（RLS test 7/7）
- `ebd8b1246` B — Travel UI 内側 localStorage 永続化
（Phase A=Travel Concierge UI 本体は base `a9eedce69` に既存＝UX-3a 由来）

## 3. 検証結果（local のみ・remote 不触）
- **fixture/localStorage UI smoke（E-5C-1）**: PASS（実ブラウザで `/plan`→CalendarTab→TravelDayDetail→Location Notes 到達・week/month 両表示・console error 0）。
- **local Supabase repo ON UI smoke（E-5C-2 → E-6A rerun）**: PASS。
  - TravelDayDetail DB read / Location Notes DB read（DB-origin を固有 title で実証）
  - save=`location_note_saves` のみ / user note=self_memo 1件のみ（published 不変・id 安定・重複なし）/ itinerary add=`travel_itinerary_items`+`location_note_to_itinerary` 到達 / reload 冪等
  - **console error 0**
- **tests**: 新規 unit 8 / 非DB regression 72 / opt-in IT 11（`RUN_TRAVEL_DB_IT=1`・local Supabase）全 PASS。
- **tsc**: baseline **55 維持**（修正ファイルに新規 error なし）。

## 4. E-6A write-path fix（重要・統合時 must-keep）
E-5C-2 で実 UI から検出した repo ON write の欠陥を root cause 3点で修正:
- `supabaseTravelPersonalStore.readUserNotes`: own 全 status → **self/self_memo/private に限定**（published を userItems に流入させない）。
- `supabaseTravelPersonalStore.writeUserNotes`: bulk delete+reinsert → **非破壊 append-only**（非 uuid の新規のみ insert・title dedup・delete 撤廃・published 不変更・id churn なし）。
- `tripDayAssembler`: **`TripDay.id = day.id`（DB uuid）** 付与 → itinerary write 配線（未設定だと currentDayId undefined で書込 skip）。
- `LocationNotesScreen`: data merge を **id dedup**（repo の own-private と readUserNotes の重複 → React duplicate-key/ setState-in-render を解消）。

## 5. staging 状態
- staging ref `hjcrvndumgiovyfdacwc` に Travel 5本（20260621100000–100400）+ CoAlter 3本（20260613120000/0615/0616）が **applied-both・remote-only 0**（E-7A migration list 再確認済）。
- 構造: 10 tables / RLS 10/10 / hardened INSERT policy 3（E-5A retry の dump 検証）。
- **staging dogfood 未実施**: 理由＝**`auth user required`**。staging auth が test email を「invalid」拒否し、許可手段（CEO 提供 test user / 既存 staging test user）が未提供。service_role 作成・prod user・auth 設定変更は禁止のため probe せず停止。

## 6. production 未実施確認
- production ref `aljavfujeqcwnqryjmhl`: **一切接続なし**。production apply / deploy / global flag ON / `flags.ts` default 変更: **未実施**。
- 全 Travel flag は env-gate・**default OFF**（`isTravelDayDetailEnabled` / `isTravelMapLiveEnabled` / `isTravelSupabaseRepoEnabled`）。

## 7. 統合セッションで取り込む対象
1. **Travel UI / repository / Supabase write fix**（`calendar/_components/travel/*`・`calendar/_lib/travel/*`）
2. **safety fix**（`ac7e15e06`: `supabase/.temp` `supabase/.branches` の .gitignore + untrack。**production project-ref 地雷**の恒久除去）
3. **CoAlter 3 migration の正規取り込み**（20260613120000/0615/0616・staging applied 済の verbatim・history 整合）
4. **Travel 5 migration**（20260621100000–100400）

## 8. 統合時に確認すべきこと
- **main との差分**: base `a9eedce69` から 27 commits。main が `a9eedce69` 以降に進んでいる場合は再 merge-base 確認。
- **他セッションの production 待ち成果との衝突**: 特に `migrations/`（global 資源）と `app/(culcept)/plan/*`（CoAlter engine 系）。Travel は `calendar/_components/travel`・`calendar/_lib/travel` が主で、CalendarTab.tsx のみ plan/tabs を触る（UX-3b travel button 配線）。本 branch では base の CoAlter 成果と**ファイル衝突なし**実績。
- **migration history**: CoAlter 3本は staging applied 済 verbatim ＝再 apply されない。Travel 5本も staging applied 済。統合後 main→staging/prod の history 整合を確認。
- **flags default OFF**: `flags.ts` の3 flag が default OFF であること（変更しない）。
- **`.temp` / `.branches` safety**: safety fix 取り込み後、fresh checkout で project-ref が展開されない（production-linked にならない）ことを確認。
- **tsc baseline**: 55 維持。
- **tests**: 非DB 72 + opt-in IT 11（local Supabase 要）。
- **UI smoke 再実行の要否**: 統合後の main 上で fixture UI smoke（最低限）+ repo ON local smoke（推奨）を再実行。

## 9. 禁止事項の明記（本 freeze 時点で未実施）
- production apply: **未実施**
- production deploy: **未実施**
- global flag ON / `flags.ts` default 変更: **未実施**
- staging dogfood（実 write）: **未実施**（auth user 不足）
- origin/main 更新・main 直 push・PR: **なし**

## 10. production へ進む前の条件（統合セッション側）
1. main へ統合（衝突確認・migration history 整合・flags OFF 維持）
2. 統合 main で tsc/tests/UI smoke 再 PASS
3. staging dogfood（**auth user 提供 + CEO GO**）で repo ON 実 write を実機確認（E-6A の非破壊チェック）
4. production apply（CLI prod re-link 二重確認 + backup + **CEO 明示 GO**）
5. flag 点火判断（段階・dogfood 後）
※ 1–5 はすべて統合セッション + CEO 承認案件。本 feature session では行わない。
