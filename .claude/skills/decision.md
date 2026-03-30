---
name: decision
description: 意思決定の記録。重要な決定をdecision-logに記録する。
user_invocable: true
---

# Decision — 意思決定記録

重要な意思決定を `docs/decision-log.md` に記録してください。

## 手順

1. ユーザーの入力から決定内容を整理
2. 以下のフォーマットで `docs/decision-log.md` に追記
3. 関連する `docs/weekly-priorities.md` があれば更新

## 記録フォーマット

```
### [YYYY-MM-DD] [タイトル]
- **部門**: [Product / Research / Build / Growth / Ops / Chief of Staff]
- **決定内容**: [何を決めたか]
- **理由**: [なぜその決定か]
- **承認**: [CEO / 自律]
- **ステータス**: [実行済 / 保留 / 却下]
```

ユーザーが引数として決定内容を渡した場合は、それを元に記録してください。
引数がない場合は、直前の会話の内容から決定事項を抽出して記録してください。
