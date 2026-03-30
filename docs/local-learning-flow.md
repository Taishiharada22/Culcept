# Local Learning Flow

> Aneurasync AI運営OS — ローカル運用でのスキル学習サイクル

最終更新: 2026-03-18

---

## 学習の仕組み

Claude Code をローカルで使うたびに、以下が蓄積・改善される:

```
[CEO の操作]
    ↓
[ログが残る場所]                    [学習に使われるもの]
────────────────────────────────    ─────────────────────────
会話ログ (.claude/projects/*)   →  CEO修正パターンの発見
git log (コミット履歴)           →  実際の変更と意思決定の記録
docs/decision-log.md            →  方針・判断の蓄積
docs/skill-improvement-log.md   →  skill改善の追跡
docs/eval-results/*.md          →  定量的な品質推移
memory/ ディレクトリ             →  永続的なコンテキスト記憶
```

### 何が「学習」になるか

| 行為 | 蓄積先 | 改善対象 |
|------|--------|----------|
| CEOがskill出力を修正 | improvement-log | skill定義 |
| CEOが「こうして」と指示 | memory (feedback型) | 全AIの振る舞い |
| `/run-evals` を実行 | eval-results/ | 低スコアskill |
| `/decision` で方針記録 | decision-log.md | 将来の判断コンテキスト |
| `/weekly-skill-review` を実行 | improvement-log | 選定されたskill |
| CLAUDE.md を更新 | CLAUDE.md | 全セッションの基盤ルール |

---

## 毎日の最小運用フロー

### 朝（2分）
```
/standup
```
→ 今日の優先事項を確認。出力に違和感があればその場で修正指示。

### 作業中（随時）
- skill を使うたびに、出力が期待通りか確認
- 期待と違ったら:
  1. その場で「こうじゃなくて、こうして」と修正指示
  2. Claude が memory に feedback として保存
  3. 汎用的な修正なら improvement-log にも記録

### 夕方/作業終了時（3分）
```
/decision [今日の重要な決定があれば記録]
```

### 金曜（5分）
```
/weekly-review
/run-evals
/weekly-skill-review
```
→ 週の振り返り → skill評価 → 改善対象の選定 → 承認 → skill更新

---

## 週次学習サイクル

```
月曜 ─── /weekly-planning → 今週の計画
  ↓
火-木 ── 通常作業 + skill使用 + 修正フィードバック蓄積
  ↓
金曜 ─── /weekly-review → 振り返り
  ↓      /run-evals → skill評価
  ↓      /weekly-skill-review → 改善対象選定
  ↓
土日 ─── 改善が承認されていればskill定義更新
  ↓
月曜 ─── 改善されたskillで新しい週を開始
```

---

## ログの場所と用途

| ログ | パス | 用途 |
|------|------|------|
| 会話ログ | `.claude/projects/-Users-haradataishi-Culcept/*.jsonl` | CEO修正パターン分析 |
| 永続記憶 | `.claude/projects/-Users-haradataishi-Culcept/memory/` | セッション跨ぎのコンテキスト |
| 意思決定 | `docs/decision-log.md` | 方針の一貫性確保 |
| 改善ログ | `docs/skill-improvement-log.md` | skill改善の追跡 |
| 評価結果 | `docs/eval-results/YYYY-MM-DD.md` | 品質の定量的推移 |
| Skill定義 | `.claude/skills/*.md` | AIの振る舞い定義 |
| Agent定義 | `.claude/agents/*.md` | 部門別AIの責務定義 |
| 基盤ルール | `CLAUDE.md` | 全セッション共通の指示 |

---

## 改善が反映される場所

CEO修正が最終的にどこに定着するか:

| 修正の種類 | 定着先 | 例 |
|-----------|--------|-----|
| 「このskillはこう返すべき」 | `.claude/skills/*.md` | /standupの出力形式変更 |
| 「いつもこうして」（汎用） | `memory/feedback_*.md` | 「要約は簡潔に」 |
| 「この方針で行く」 | `CLAUDE.md` or `docs/decision-log.md` | 「UIラベルは日本語」 |
| 「この部門はこう動くべき」 | `.claude/agents/*.md` | Build Unitの承認範囲変更 |

---

## 学習を加速するコツ

1. **修正は具体的に**: 「もっと良くして」ではなく「箇条書き3つ以内にして」
2. **理由も伝える**: 「冗長だから」→ feedback memoryに理由が残り、他skillにも適用される
3. **定期的に `/run-evals`**: 評価しないと改善対象が見えない
4. **improvement-log を見る**: 同じ問題が繰り返されていないか確認
5. **CLAUDE.md は最強の教師**: ここに書いたルールは全セッション・全skillに即座に反映される
