# Contract Audit — API契約検証

Build Unit の構造監査官として、API層とUI層の間の契約整合性を検証してください。

対象: $ARGUMENTS

## 検証内容

### 1. レスポンス形状の一致

API route.ts の `NextResponse.json(...)` に渡されるオブジェクトの形状と、
UI 側の fetch 後に参照されるフィールド名を照合する。

**検出パターン:**
- **欠落**: UI が `data.xxx` を参照するが、API が `xxx` を返さない
- **余剰**: API が `xxx` を返すが、UI で一度も参照されない
- **型不一致**: API が number を返すが UI が string として扱っている
- **命名不一致**: API が `snake_case` で返し UI が `camelCase` で参照（変換なし）

### 2. リクエスト形状の一致

UI 側の fetch/POST body と、API 側の `request.json()` や searchParams で受け取る形状を照合する。

### 3. エラーレスポンスの一致

API が返すエラーフォーマットと、UI 側のエラーハンドリングが対応しているか。

## 手順

1. 対象 API エンドポイントの route.ts を読み、レスポンス構造を抽出
2. そのエンドポイントを呼び出す UI コードを特定（fetch URL で Grep）
3. UI 側でレスポンスから参照されるフィールドをリスト化
4. 差分を検出し、問題パターンに分類

## 出力フォーマット

```
## Contract Audit: {機能領域} [日付]

### サマリー
- 検査エンドポイント数: [N]
- 🟢 契約一致: [N]
- 🟡 軽微な不一致: [N]
- 🔴 重大な不一致: [N]

### 不一致詳細

#### 🔴 GET /api/stargazer/profile
**API が返すもの:**
{ "archetype": "...", "scores": [...], "updated_at": "..." }

**UI が期待するもの:**
{ "archetype": "...", "scores": [...], "updatedAt": "..." }

| フィールド | API側 | UI側 | 問題 |
|-----------|-------|------|------|
| updated_at / updatedAt | ○ snake_case | ○ camelCase | 命名不一致（変換なし） |
| deep_scores | ○ 返却あり | × 未参照 | 余剰 |
| displayName | × 返却なし | ○ 参照あり | 欠落（★ランタイムエラー） |

**影響**: displayName 欠落はランタイムで undefined 表示になる
**修正案**: API に displayName を追加、または UI 側で profile.name を使用

### 契約一覧

| エンドポイント | メソッド | 状態 | 不一致数 |
|--------------|---------|------|---------|
| /api/stargazer/profile | GET | 🔴 | 3 |
| /api/stargazer/observations | POST | 🟢 | 0 |
```

## 注意

- 動的レスポンス（条件分岐で返却フィールドが変わる）は全パターンを検査
- Supabase の `.select()` で指定されたカラムも API レスポンスの一部として扱う
- 🔴 は「ランタイムエラーになりうる」もの、🟡 は「動くが無駄がある」もの
