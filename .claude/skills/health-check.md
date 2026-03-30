---
name: health-check
description: プロジェクト健全性チェック。ビルド・型チェック・テスト・lint を一括実行し結果をサマリーする。
user_invocable: true
---

# Health Check — プロジェクト健全性チェック

Build Unit の QA として、プロジェクトの健全性を一括チェックしてください。

## 手順

1. 以下のコマンドを**並列で**実行し、結果を収集:
   - `npx next build --no-lint 2>&1 | tail -30` （ビルド確認）
   - `npx tsc --noEmit 2>&1 | tail -50` （型チェック）
   - `npx next lint 2>&1 | tail -30` （lint、eslint.config.mjs があれば）
   - `npm test 2>&1 | tail -30` （テスト、vitest.config.ts があれば）

2. 各チェックの結果を以下のフォーマットでまとめる

## 出力フォーマット

```
## Health Check [今日の日付]

| チェック | 結果 | 詳細 |
|---------|------|------|
| ビルド | :white_check_mark: / :x: | エラー数、警告数 |
| 型チェック | :white_check_mark: / :x: | エラー箇所の要約 |
| Lint | :white_check_mark: / :x: / スキップ | 警告・エラー数 |
| テスト | :white_check_mark: / :x: / スキップ | pass/fail 数 |

### 要対応（あれば）
1. [最重要の問題]
2. [次に重要な問題]

### 全体ステータス: :green_circle: / :yellow_circle: / :red_circle:
```

## 注意
- ビルドに5分以上かかる場合はタイムアウトとして報告
- エラーが大量の場合は上位10件に絞って報告
- 修正は提案のみ。実行は CEO 承認後
