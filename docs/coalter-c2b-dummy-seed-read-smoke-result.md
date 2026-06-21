# C2-b 実行結果: CoAlter dummy seed + RLS read smoke PASS（docs-only 記録）

> base: local main `bcf84157c` / branch: `claude/coalter-logic-resume-20260621`
> 実行日: 2026-06-21 / staging `hjcrvndumgiovyfdacwc` のみ / production 不触

## 達成
- ✅ **dummy seed**（staging・架空データ・plan_coalter_* + auth.users(id) FK のみ）
- ✅ **RLS read smoke PASS**（participant 読める / 非 participant fail-closed）
- 性格/axis/HDM/Travel personalization・production を一切参照せず（CoAlter 会話テーブルのみ）

## seed した dummy data（staging-only・架空）
| table | 内容 |
|---|---|
| `plan_coalter_sessions` | 1件: id=`dddddddd-c2b0-4000-8000-000000000001`・mode='daily'・plan_window=`{"date":"2026-07-01"}`・created_by=staging test user |
| `plan_coalter_session_participants` | 1件（solo）: user_id=staging test user・source_kind='self' |
| `plan_coalter_session_messages` | 2件: 架空 body「週末どこか行きたいね」「いいね、近場で」・author_kind='participant' |
| `plan_coalter_session_read_cursors` | seed せず |

- auth user = `aneurasync@outlook.com`（staging 唯一の test account・**identity のみ**・personality 不読）。
- body は完全な**架空**（どの実会話でもない・観測に流さない）。CoAlter message は seed せず。

## RLS read smoke 結果（psql・SET ROLE authenticated + jwt sub・read-only）
| 主体 | messages | session | participants | 判定 |
|---|---|---|---|---|
| participant（auth.uid=seeded user） | 2 | 1 | 1 | ✅ 読める（member） |
| 非 participant（別 uid） | 0 | 0 | — | ✅ RLS fail-closed |

→ RLS SELECT policy（message/session=member・participant=own-row）が staging 実機で**設計通り動作**。

## カバレッジと境界
- **DB 層 RLS smoke は完遂**（staging 固有の検証）。
- API route 層（`PLAN_COALTER_READ_LOCAL` flag gate → `auth.getUser` → store → 同 RLS SELECT）は
  flag/store の **unit test 済** + 本 RLS 実機証明で担保。**full dev-server + auth ログインの end-to-end smoke は未実施**（必要なら follow-up）。
- **write は seed の INSERT のみ**（postgres ロール手動・RLS bypass の privileged seed）。
  POST/send・CoAlter response 保存・user-RLS write・service_role/SECURITY DEFINER は一切なし。

## 後始末
- dummy seed は staging に**残置**（smoke 再実行・後続 C5 の足場）。clean up（DELETE）は未実施・CEO 指示があれば
  `dddddddd-c2b0-…` 一式を DELETE 可能（staging 限定）。

## 次
- C2 系（read 経路）はこれで実機確認完了。次は **C3（send preview）/ C5（response persistence・coalter insert RLS 設計）/ C6（projection）** が候補。
  いずれも別 CEO gate（write/policy/privacy）。
