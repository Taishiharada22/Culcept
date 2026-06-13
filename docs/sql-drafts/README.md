# docs/sql-drafts/ — 非実行 SQL ドラフト置き場

このディレクトリの `.sql` は **レビュー用ドラフト**であり、**migration ツールの対象外**。

- `supabase/migrations/` に置くと `supabase db reset` / apply で**誤適用**されるため、ここに隔離する。
- ここのファイルは apply / local reset / staging / production / `supabase gen types` の対象に **しない**。
- CEO GO 後、正式 migration にする際は `supabase/migrations/` へ移送し、その時点で timestamp を採り直す。

## 現在のドラフト
- `20260613120000_plan_coalter_session_messages_DRAFT.sql` — /plan CoAlter session message persistence（participant/session-rooted）。設計正本: [coalter-plan-session-message-schema-rls-design.md](../coalter-plan-session-message-schema-rls-design.md)。**NOT APPLIED**。
