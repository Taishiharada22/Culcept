# C3 実行結果: participant send/write staging smoke PASS（docs-only 記録）

> base: local main `bcf84157c` / branch: `claude/coalter-logic-resume-20260621`
> 実行日: 2026-06-21 / staging `hjcrvndumgiovyfdacwc` のみ / production・性格・axis・Travel 不触
> 検証方法: psql・user-RLS（`SET ROLE authenticated` + jwt sub）・**全テスト transaction 内 ROLLBACK（純増書込ゼロ）**

## 達成
- ✅ 既存 `plan_coalter_message_insert_participant` policy で **participant message が user-RLS 経路で書ける**
- ✅ 非 participant / 他 session / author 詐称 / coalter 行 insert は **全て fail-closed**
- ✅ 冪等（partial unique）・read 反映を確認
- CoAlter generated message は書かない・C5 policy/brain には触れていない

## 使用した dummy
- session: `dddddddd-c2b0-4000-8000-000000000001`（C2-b seed・participant=self）
- participant user: `aneurasync@outlook.com`（staging 唯一 test account・identity のみ・personality 不読）
- 一時 2nd session `…0002`（other-session test 用・**作成→削除済み**）

## smoke 結果
| # | テスト | 期待 | 結果 |
|---|---|---|---|
| 1 | participant 自 session・self insert（author_kind='participant'・author_user_id=auth.uid()・visibility='shared'） | 成功 | ✅ INSERT 0 1 |
| 1-read | participant が新 message を read | 見える | ✅ count=3（2 seed+1） |
| 1-read | 非 participant が read | 0 | ✅ count=0（RLS） |
| 2 | 同 `client_message_id` 2回目 | unique violation | ✅ `uq_plan_coalter_msg_idempotency` 23505 |
| 3 | 非 participant insert | 拒否 | ✅ RLS policy violation |
| 4 | author 詐称（author_user_id≠auth.uid()） | 拒否 | ✅ RLS policy violation |
| 5 | coalter 行（author_kind='coalter'・author NULL） | 拒否 | ✅ RLS policy violation（coalter policy 不在＝C5 未着の確認） |
| 6 | 他 session（非 member の …0002） | 拒否 | ✅ RLS policy violation |
| count | 全 ROLLBACK 後 session1 件数 | 2（不変） | ✅ 2 |

## write/cleanup
- **純増書込ゼロ**: 全テストは BEGIN…ROLLBACK 内。正常系 insert も rollback。
- 一時 2nd session（…0002）は test 後 **DELETE 済み**（staging 限定）。
- 最終 staging state = C2-b と同一（session1・2 messages）。**追加 cleanup 不要**。

## 不触確認
- production 接続なし・production user data / Stargazer axis / personality / Travel personalization read なし。
- 触れたのは `plan_coalter_*` + `auth.users`(id 取得のみ・identity)。
- service_role / SECURITY DEFINER を app code に追加なし。Supabase db push / migration / db pull なし。
- DB password は smoke 用途のみ（ファイル/commit に未保存・secret hygiene 済）。

## C5 へ進めるか
✅ **participant write 経路は user-RLS で実機確認完了**。coalter 行 insert が現状 deny（C5 policy 未着）も確認済み。
→ C5（CoAlter response persistence・coalter-insert policy 追加 + brain→persist）に進める前提が揃った。
ただし C5 は **新 policy migration（別 gate）+ 残余リスク受容（participant が偽 coalter 行）**の CEO 判断が必要。
