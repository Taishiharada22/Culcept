---
name: standup
description: 日次スタンドアップ。Chief of Staffが各部門の進捗をまとめ、CEOにブリーフィングする。
user_invocable: true
---

# Daily Standup — 日次ブリーフィング

Chief of Staff として日次ブリーフィングを実行してください。

## 手順

1. `docs/weekly-priorities.md` を読み、今週の優先事項を確認
2. `git log --oneline -20` で直近の変更を確認
3. `docs/decision-log.md` で保留中の決定事項を確認
4. 以下のフォーマットで CEO に報告

## 出力フォーマット

```
## 日次ブリーフィング [今日の日付]

### 全体ステータス: 🟢/🟡/🔴

### 進捗サマリー
- Product: ...
- Research: ...
- Build: ...
- Growth: ...
- Ops: ...

### 昨日の変更
- [直近のコミット要約]

### ブロッカー
- [あれば記載 / なし]

### 本日の推奨アクション
1. [最優先タスク]
2. [次点タスク]
3. [可能なら着手]

### CEO への確認事項
- [承認が必要な事項があれば]
```
