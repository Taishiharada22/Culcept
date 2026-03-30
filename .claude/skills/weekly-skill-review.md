---
name: weekly-skill-review
description: 週次でskill改善対象を1-3個選び、改善計画を立てる。
user_invocable: true
---

# Weekly Skill Review — 週次skill改善レビュー

## あなたの役割
Chief of Staff として、AI運営OSのskill品質を継続的に改善する。

## 手順

### 1. 改善シグナルの収集
以下のソースから改善シグナルを集める:

1. **Eval結果**: `docs/eval-results/` の最新結果からC以下のskill
2. **改善ログ**: `docs/skill-improvement-log.md` の 🔴 未対応エントリ
3. **CEO修正履歴**: 今週のgit logから、CEOがskill出力を手動修正した形跡
4. **使用頻度**: 今週実際に使われたskillで、期待と異なる出力があったもの

### 2. 改善優先順位の判定

以下の基準で優先度を付ける（高い順）:

| 優先度 | 基準 | 例 |
|--------|------|-----|
| P0 | CEOが手動で修正した（AIの出力が不適切だった） | tone-checkが命令口調を見逃した |
| P1 | Eval結果がD判定 | health-checkがエラーを報告できなかった |
| P2 | 同じ問題が2回以上発生 | standupが毎回冗長 |
| P3 | Eval結果がC判定 | feature-specの技術設計が薄い |
| P4 | 改善すればより有用になる（現状は動作する） | stargazer-statusに新機能が反映されていない |

### 3. 改善対象の選定
- 最大3 skillsを選定
- 各skillについて具体的な改善案を提示

### 4. 改善計画の作成

```
## 今週の改善対象（YYYY-MM-DD 週）

### 1. /skill-name — 問題の要約
- **優先度**: P?
- **問題**: 具体的に何が起きたか
- **改善案**: skill定義のどこをどう変えるか
- **期待効果**: 改善後にどう変わるか
- **確認方法**: 改善が成功したかをどう確認するか

### 2. ...
```

### 5. CEO承認
- 改善計画をCEOに提示
- 承認後、skill定義ファイル（`.claude/skills/*.md`）を更新
- 更新後 `docs/skill-improvement-log.md` のステータスを 🟢 に更新

## 注意事項
- 改善は最小限の変更で。skill定義の全面書き換えは避ける
- 改善の根拠を必ず示す（eval結果 or CEO修正 or 実例）
- 「なんとなく良くなりそう」な変更は行わない
