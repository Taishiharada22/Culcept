# Alter Life Context v2 — コンテキスト活用 + 証拠蓄積

## Phase 1 からの進化

| Phase 1 | Phase 2 |
|---------|---------|
| シグナル抽出 → fire-and-forget 保存 | 抽出 → 保存 → 判断時に参照 |
| 単発保存（重複排除はメッセージ内のみ） | 既存シグナルとの照合 → evidence_count インクリメント |
| confidence は固定値 | 複数回確認で confidence が上昇 |
| possibly_stale なし | 30日ルールで自動フラグ |
| 矛盾検出なし | 既存コンテキストとの矛盾を検出 |

## 1. Context-Aware Judgment（コンテキスト参照判断）

### 判断時のコンテキスト注入

```typescript
// route.ts 内
// 判断前に、ユーザーの Life Context を取得
const lifeContext = await fetchActiveLifeContext(userId);
// → confidence >= 0.4 && possibly_stale === false のもののみ

// プロンプトに注入（Trust gate 付き）
if (lifeContext.length > 0 && trustLevel >= 1) {
  const contextHints = formatContextForPrompt(lifeContext);
  // systemPrompt に追加
}
```

### プロンプト注入形式

**NG（分析の暴露）**:
```
ユーザーデータ: 母親との関係に問題あり (confidence: 0.6)
```

**OK（自然な参照）**:
```
以前の会話から、この人には実家の母親のことを気にかけている面がある。
ただし断定はせず、関連する話題が出たときに自然に参照する程度にとどめる。
```

### 注入ルール

| 条件 | 注入可否 |
|------|---------|
| confidence < 0.4 | 注入しない |
| possibly_stale = true | 注入しない |
| source = "alter_inferred" && evidence_count < 2 | 注入しない |
| temporality = "momentary" | 注入しない（一時的情報は判断に使わない） |
| trustLevel < 1 | 注入しない |
| 上記全てクリア | 注入可。ただしプロンプト内で「断定しない」制約を付与 |

## 2. Evidence Accumulation（証拠蓄積）

### 既存シグナルとの照合フロー

```
extractLifeContextSignals(message)
         │
         ▼ newSignals
    ┌────────────────────────┐
    │ DB から既存シグナル取得   │
    │ (同一 user_id)          │
    └────────┬───────────────┘
             │
             ▼ 照合
    ┌────────────────────────┐
    │ 同一 content が存在？    │
    │ → YES: evidence_count++ │
    │        last_confirmed = now │
    │        possibly_stale = false │
    │        confidence = min(0.9, confidence + 0.1) │
    │ → NO:  新規 INSERT       │
    └────────────────────────┘
```

### Confidence 上昇ルール

| 初期 confidence | evidence_count | 更新後 confidence |
|----------------|----------------|-----------------|
| 0.3 | 2 | 0.4 |
| 0.4 | 3 | 0.5 |
| 0.5 | 4 | 0.6 |
| 0.5 | 5+ | 0.7 |

**上限**: 0.9（user_stated でも完全な確信は持たない）

### 照合の粒度

完全一致ではなく、意味的な同一性を判定:

```typescript
function isSameContext(existing: string, incoming: string): boolean {
  // 正規化: ひらがな→カタカナ、全角→半角、「さん」「くん」等の敬称除去
  const normalize = (s: string) => s
    .replace(/[さくちゃ]ん$/g, "")
    .replace(/お([母父兄姉])/g, "$1");

  return normalize(existing) === normalize(incoming);
}
```

## 3. Staleness Detection（鮮度管理）

### 自動フラグ

```sql
-- 日次バッチ or API呼び出し時にチェック
UPDATE stargazer_alter_context
SET possibly_stale = true
WHERE last_confirmed < now() - interval '30 days'
  AND possibly_stale = false;
```

### 鮮度確認プロンプト

`possibly_stale = true` のコンテキストが判断に関連する場合、
Alter が自然に確認を挟む:

```
「そういえば、〇〇の件って今もそんな感じ？」
```

- presentation_type: `casual_check`
- 1セッションにつき最大1回
- ユーザーが確認 → `last_confirmed` 更新、`possibly_stale = false`
- ユーザーが否定 → `source` を `"contradicted"` に変更

## 4. Contradiction Detection（矛盾検出）

### 検出対象

| パターン | 例 |
|---------|---|
| 居住の矛盾 | 「一人暮らし」→（後日）「実家で母と」 |
| 関係性の矛盾 | 「彼女いない」→（後日）「彼女が〜」 |
| 状況の矛盾 | 「転職した」→（後日）「まだ同じ会社で」 |

### 矛盾検出ロジック

```typescript
function detectContradiction(
  existing: LifeContextEntry,
  incoming: Partial<UnderstandingUnit>,
): "contradiction" | "update" | "coexist" {
  // 同一カテゴリ + 同一 content で source が異なる場合
  if (existing.category === incoming.category) {
    // 居住系: 「一人暮らし」vs「実家」は矛盾
    if (existing.category === "environment" &&
        isContradictoryEnvironment(existing.content, incoming.content ?? "")) {
      return "contradiction";
    }
    // 人物系: 「いない」vs「いる」は矛盾
    if (existing.category === "person" &&
        isContradictoryPerson(existing.content, incoming.content ?? "")) {
      return "contradiction";
    }
  }
  // 同一 content の更新（evidence 蓄積）
  if (isSameContext(existing.content, incoming.content ?? "")) {
    return "update";
  }
  // 異なるコンテキスト（共存可能）
  return "coexist";
}
```

### 矛盾時の処理

1. 既存エントリの `source` を `"contradicted"` に変更
2. 新しいエントリを `user_stated` (or `user_implied`) で保存
3. `confidence` は新エントリの方を高く設定（最新情報を優先）
4. analytics に `"life_context_contradiction"` イベントを記録

## 5. DB スキーマ

`stargazer_alter_context` テーブル（`alter-phase2-design.md` 参照）

### RLS ポリシー
```sql
-- ユーザーは自分のコンテキストのみ読み書き可能
CREATE POLICY "Users can read own context"
  ON stargazer_alter_context FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own context"
  ON stargazer_alter_context FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own context"
  ON stargazer_alter_context FOR UPDATE
  USING (auth.uid() = user_id);
```

## 実装ステップ

1. **DB migration**: `stargazer_alter_context` テーブル作成
2. **保存ロジック改修**: fire-and-forget → 既存照合 + evidence 蓄積
3. **取得 API**: 判断前にアクティブなコンテキストを取得するクエリ
4. **プロンプト注入**: Trust gate + confidence gate 付きで判断プロンプトに追加
5. **鮮度チェック**: API 呼び出し時に30日ルールを適用
6. **矛盾検出**: 保存前に既存コンテキストと照合
