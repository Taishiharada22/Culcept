# Travel / Location Notes — Staging Behavioral Smoke（Phase E-5B）

**実行日**: 2026-06-22
**結果**: 🛑 **AUTH USER REQUIRED（behavioral smoke 未実施・auth path 確保できず）** — staging に書込みゼロ・production 不触・unlink 済。
**前提**: staging schema/RLS/policies は E-5A retry で構造確認済（10 tables・RLS 10/10・hardened INSERT policy 3・check/unique）。

---

## 0. サマリ
staging 上で実 auth user による behavioral RLS smoke を試みたが、**有効な認証 user を安全に確保できなかった**ため、
ゲートに従い未実施で停止。staging auth は anon signUp の test email を「invalid」で拒否し、唯一通る可能性のある
real-provider 系は使用禁止（本番メールユーザー使用）かつ確認メール必須（session 無し＝削除不能 residue）。
**汚染ゼロ**（拒否は account 作成前）・production 完全不触。

## 1. branch / HEAD / status
`claude/travel-connect-finish-20260621` / HEAD `fdf3e6169` / source clean。

## 2. link 前 project-ref absent
✅ absent。

## 3. link 後 project-ref 確認
`supabase link --project-ref hjcrvndumgiovyfdacwc` → `cat project-ref` = **`hjcrvndumgiovyfdacwc`（staging 完全一致・prod `aljavfujeqcwnqryjmhl` でない）** ✅

## 4. auth path 結果
許可された 3 path を評価:
1. **CEO 提供の staging test user / email**: 本依頼に提供なし → 使用不可。
2. **staging auth が受理する有効ドメインで anon signUp**: bounded probe を実施。
   - `@example.com`（E-5A retry 時）→ **REJECTED**「Email address ... is invalid」（account 未作成）。
   - `@e5bsmoke.dev`（E-5B probe・1 回）→ **REJECTED** 同上（account 未作成）。
   - → staging はテスト用ドメインの anon signUp を拒否。通る可能性があるのは real-provider（gmail/outlook 等）のみだが、
     **本番メールユーザー使用は禁止**、かつ確認メール必須で session が得られず **削除不能 residue** になるため使用しない。
3. **既存 staging test user（CEO 許可）**: 提供なし → 使用不可。

→ **有効な auth path なし**。service_role admin 作成は禁止。**「auth user required」で停止**。

## 5. behavioral smoke 結果
**未実施**（auth path 無し）。throwaway probe は signUp 拒否で停止＝staging に **1 行も書いていない**（seed なし）。

## 6. RLS negative 結果
**未実施**（同上）。※同一 migration の **local IT で担保済**（E-3〜E-3C-3・opt-in IT 10 PASS：
userA/userB visibility・save/userNote/itinerary write・他人 private note read/save/link 不可・他人 day/itinerary 書込不可・
published+approved+未削除のみ cross-user 可視・self_memo published 不可）。staging は同一 policy を apply 済。

## 7. cleanup 結果
作成データなし → cleanup 対象なし。**staging 汚染ゼロ**（probe は account 作成前に拒否）。residue: なし。throwaway probe script は削除済。

## 8. unlink 結果
`supabase unlink` 成功 → `project-ref` **不在** ✅

## 9. remote production 不触確認
全工程 ref=`hjcrvndumgiovyfdacwc` のみ。production `aljavfujeqcwnqryjmhl` 接続・SQL：**一切なし**。

## 10. `.temp` / `.branches` / env / throwaway / backup dump 未stage確認
✅ いずれも未 stage。throwaway probe（`e5b_authprobe.mjs`）削除済・backup dump は local untracked。

## 11. 未確認事項（残）
- staging behavioral RLS の **live 確認**（要 有効 auth user）。
- flag ON dogfood / API route / production apply（すべて別 GO）。

## 12. 次フェーズ候補（CEO 判断）
staging behavioral smoke を実施するには、以下のいずれかの提供が必要（次フェーズ前提）:
- (a) CEO が staging で受理される **test email / 認証済みユーザー（userA/userB 2 名）** を提供、または
- (b) staging auth の受理 email ドメイン（allowlist）を CEO が共有、または
- (c) staging auth の email 確認を一時 OFF にする等は **auth 設定変更＝禁止**（無断不可・CEO 操作領域）。
→ 上記が揃えば E-5B 再実行（behavioral smoke）。揃わなければ behavioral は local 担保に留め、次は別軸（API route 等）。
