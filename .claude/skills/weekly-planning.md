---
name: weekly-planning
description: 週次計画。先週の振り返りと今週の優先事項を策定する。
user_invocable: true
---

# Weekly Planning — 週次計画

Chief of Staff として週次計画を実行してください。

## 手順

1. `docs/weekly-priorities.md` を読み、先週の完了/未完了を確認
2. `git log --oneline --since="7 days ago"` で先週の変更を確認
3. `docs/decision-log.md` で保留事項を確認
4. 各部門の今週の優先事項を提案
5. CEO 承認後に `docs/weekly-priorities.md` を更新

## 出力フォーマット

```
## 週次計画 [今週の日付範囲]

### 先週の振り返り
#### 完了
- ...
#### 未完了（持ち越し）
- ...
#### 学び
- ...

### 今週の優先事項（提案）

#### Chief of Staff
1. ...

#### Product Unit
1. ...

#### Research Unit
1. ...

#### Build Unit
1. ...

#### Growth & Ops Unit
1. ...

### CEO への確認事項
- [承認が必要な事項]
```

→ CEO が承認したら `docs/weekly-priorities.md` を更新してください。
