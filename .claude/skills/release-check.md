---
name: release-check
description: リリース前チェックリスト。本番デプロイ前に必要な検証を一括実行し、Go/No-Go判定を出す。
user_invocable: true
---

# Release Check — リリース前チェックリスト

Build Unit の Release Manager として、本番デプロイ前のチェックを実行してください。

## 手順

1. 以下を並列で確認:
   - ビルドが通るか (`npx next build`)
   - 型エラーがないか (`npx tsc --noEmit`)
   - 未コミットの変更がないか (`git status`)
   - 最新の main との差分 (`git log --oneline -10`)
   - 新しい環境変数が追加されていないか（`.env.local` と `vercel.json` の差分）
   - 新しい DB マイグレーションがあるか (`supabase/migrations/` の未適用ファイル)

2. 以下のフォーマットで報告

## 出力フォーマット

```
## リリースチェック [今日の日付]

### Go / No-Go: :green_circle: GO / :red_circle: NO-GO

### チェック結果
| 項目 | 結果 | 詳細 |
|------|------|------|
| ビルド | :white_check_mark: / :x: | ... |
| 型チェック | :white_check_mark: / :x: | ... |
| 未コミット変更 | :white_check_mark: / :warning: | ... |
| 環境変数 | :white_check_mark: / :warning: | 新規: [あれば] |
| DBマイグレーション | :white_check_mark: / :warning: | 未適用: [あれば] |

### デプロイ対象の変更（直近コミット）
- [コミット要約]

### 要確認事項（CEO承認が必要）
- [ ] DBマイグレーション: [あれば内容]
- [ ] 新しい環境変数: [あれば変数名]
- [ ] 破壊的変更: [あれば内容]

### 手順（GOの場合）
1. [デプロイ手順]
```

## 注意
- **リリースチェックは報告のみ**。実際のデプロイは必ず CEO 承認後
- No-Go の場合は理由と解消に必要な作業を明示
- DBマイグレーションがある場合は必ず CEO 承認事項に含める
