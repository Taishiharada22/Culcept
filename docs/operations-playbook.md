# Operations Playbook — 日次・週次の運用手順

## 日次オペレーション

### 朝のブリーフィング（CEO → Chief of Staff）

CEO が Claude Code を開き、以下のいずれかで開始:

```
/standup
```

Chief of Staff が以下を実行:
1. `docs/weekly-priorities.md` の進捗確認
2. 前日の変更差分サマリー（git log）
3. ブロッカーの有無を報告
4. 本日の推奨アクション提案

**出力形式**:
```
## 日次ブリーフィング [YYYY-MM-DD]

### 進捗サマリー
- 🟢 Product: ...
- 🟡 Build: ...

### 昨日の変更
- [commit hash] ...

### ブロッカー
- なし / [内容]

### 本日の推奨アクション
1. ...
2. ...
```

---

### 部門別タスク実行

CEO が特定部門に指示を出す場合:

```
/product [指示内容]    … Product Unit が対応
/research [テーマ]     … Research Unit が調査
/build [実装内容]      … Build Unit が実装
/growth [施策内容]     … Growth Unit が対応
/ops [対応内容]        … Ops Unit が対応
```

各部門は:
1. 指示を受領し、アプローチを提案
2. CEO 承認後に実行（自律実行可の範囲は即実行）
3. 完了後に結果を報告
4. 必要に応じて `docs/decision-log.md` に記録

---

## 週次オペレーション

### 月曜: 週次計画（Weekly Planning）

```
/weekly-planning
```

Chief of Staff が:
1. 先週の振り返り（完了 / 未完了 / 学び）
2. 今週の優先事項を提案
3. `docs/weekly-priorities.md` を更新（CEO 承認後）

### 金曜: 週次レビュー（Weekly Review）

```
/weekly-review
```

Chief of Staff が:
1. 今週の成果サマリー
2. 各部門のステータス
3. 来週への申し送り事項
4. `docs/decision-log.md` の週次まとめ

---

## 承認フロー

### CEO 承認が必要な行動

```
[部門名] が [アクション] を提案します。

■ 内容: ...
■ 理由: ...
■ リスク: ...
■ 代替案: ...

→ 承認しますか？ (yes / no / 修正指示)
```

CEO が `yes` → 実行 → 結果報告 → decision-log 記録
CEO が `no` → 理由を記録 → 代替案を検討
CEO が修正指示 → 修正後に再提案

---

## エスカレーション基準

以下の場合は即座に CEO に報告:
- 本番環境の障害・エラー
- セキュリティに関わる問題
- ユーザーデータの損失リスク
- 予算・課金に影響する問題
- 法的リスクの発見
