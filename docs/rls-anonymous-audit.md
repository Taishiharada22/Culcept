# RLS 匿名ユーザー監査報告

> 作成日: 2026-04-04
> 対象: Stargazer 後ログイン型フローにおける匿名ユーザーの RLS 通過確認

## 前提

- 匿名ユーザーは `auth.users` に `is_anonymous = true` で登録される
- Supabase 上のロールは `authenticated`（正規ユーザーと同一）
- `auth.uid()` は匿名ユーザーでも正常に値を返す

## Stargazer 関連テーブル — 監査結果

### 対象テーブルと必要な操作

| テーブル | 匿名で必要な操作 | RLS ポリシー | 結果 |
|---------|----------------|-------------|------|
| `stargazer_observations` | INSERT, SELECT (own) | `auth.uid() = user_id` | PASS |
| `stargazer_axis_snapshots` | INSERT, SELECT (own) | `auth.uid() = user_id` | PASS |
| `stargazer_daily_states` | INSERT, SELECT, UPDATE (own) | `auth.uid() = user_id` | PASS |
| `stargazer_context_profiles` | SELECT (own) | `auth.uid() = user_id` | PASS |
| `stargazer_question_pool` | SELECT (active) | `is_active = true` | PASS（公開読み取り） |
| `stargazer_question_shown` | INSERT, SELECT, UPDATE (own) | `auth.uid() = user_id` | PASS |
| `stargazer_behavioral_signals` | INSERT, SELECT (own) | `auth.uid() = user_id` | PASS |
| `stargazer_analytics` | INSERT, SELECT (own) | `auth.uid() = user_id` | PASS |
| `stargazer_psyche_signatures` | SELECT (shared) | 公開読み取り（共有分） | PASS |
| `stargazer_footprint_summaries` | INSERT, SELECT (own) | `auth.uid() = user_id` | PASS |
| `stargazer_mirror_snapshots` | INSERT, SELECT (own) | `auth.uid() = user_id` | PASS |

### 結論

全 Stargazer テーブルの RLS ポリシーは `auth.uid() = user_id` パターンで統一されており、匿名ユーザーも `authenticated` ロールを持つため **全操作が正常に通過する**。

`is_anonymous` チェックを含む RLS ポリシーは存在しない。匿名ユーザーと正規ユーザーの権限は同一であり、データ分離は `user_id` ベースで保証されている。

## API エンドポイント — 匿名ユーザー対応

| API | 匿名での動作 | 確認根拠 |
|-----|------------|---------|
| `POST /api/stargazer/observe` | INSERT 可能 | RLS `auth.uid() = user_id` |
| `GET /api/stargazer/profile` | 制限レスポンス（`isAnonymous: true`） | `profile/route.ts:822-853` で `user.is_anonymous` 分岐 |
| `POST /api/auth/merge-anonymous` | merge 実行可能 | `supabaseAdmin` 使用のため RLS 不要 |
| `GET /api/auth/anonymous-session` | Feature flag 確認 | 認証不要 |

## 注意事項

### 1. `stargazer_profiles` / `stargazer_observations` の RLS 確認

これらのテーブルは ALTER 文で列追加されているが、CREATE POLICY が明示的に見つからない migration がある。実 DB で `SELECT * FROM pg_policies WHERE tablename = 'stargazer_observations'` を実行して最終確認を推奨する。

### 2. `profiles` テーブルの自動生成トリガー

匿名ユーザー作成時に `profiles` テーブルへのレコード自動生成トリガーが migration 内で確認できなかった。merge 処理（`mergeAnonymousData.ts`）は `supabaseAdmin` を使用しているため RLS をバイパスするが、`profiles` レコードが存在しない場合に `is_merged` フラグの更新が失敗する可能性がある。

**対応**: merge 処理内で `profiles` レコードの存在を事前確認し、なければ作成するロジックを追加するか、auth trigger の有無を本番 DB で確認する。

### 3. 匿名データ TTL

`anonymous_users_to_cleanup` VIEW は `20260401100000_anonymous_auth_support.sql` で定義済み。30日超の未昇格匿名ユーザーを対象としている。週次バッチジョブは Phase 2（Stream B）で実装予定。

## 検証方法

本監査は migration ファイルの静的解析に基づく。本番デプロイ前に以下の動的検証を実施すること:

1. Supabase local で匿名ユーザーを作成し、`stargazer_observations` に INSERT → SELECT
2. `stargazer_profiles` の SELECT が匿名 user_id で通過するか確認
3. merge 処理の全フローを実行し、データ移管が正常に完了するか確認
4. `pg_policies` テーブルを直接クエリし、全ポリシーを最終確認
