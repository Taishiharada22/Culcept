# Signal Trace — 単一シグナル追跡

Build Unit の構造監査官として、指定されたシグナル（データフィールド/概念）を全層で追跡してください。

対象シグナル: $ARGUMENTS

## 手順

### Step 1: 起点の特定

指定されたシグナル名で以下を検索:
1. `supabase/migrations/` — カラム定義（snake_case）
2. `types/` — TypeScript 型定義（camelCase / snake_case 両方）
3. `app/api/` — API レスポンス/リクエスト
4. `lib/` — ロジック内での参照
5. `app/`, `components/` — UI 内での参照

命名揺れ（camelCase ↔ snake_case、略称、別名）も考慮して検索する。

### Step 2: フロー図の構築

見つかった全参照箇所を、データの流れ順に並べる:

```
[DB] テーブル.カラム
  ↓ (SELECT by)
[API] route.ts L:XX → レスポンスフィールド名
  ↓ (fetch by)
[Logic] lib/xxx.ts L:XX → 変数名 → 加工内容
  ↓ (props / state)
[UI] components/xxx.tsx L:XX → 表示形式
```

### Step 3: 断線・変換・分岐の検出

- **断線**: フローが途切れている箇所（例: API で返すが UI で使わない）
- **変換**: 値が変換されている箇所（例: score → ランク文字列、enum → 日本語ラベル）
- **分岐**: 同じシグナルが複数経路で流れている箇所
- **シャドウ**: 同名の別データが混在している箇所

## 出力フォーマット

```
## Signal Trace: {シグナル名} [日付]

### フロー図

[DB] stargazer_profiles.compatibility_score (float8)
  ↓ SELECT in lib/stargazer/compatibility.ts:42
[Logic] calculateScore() → normalizedScore (0-100に正規化)
  ↓ return in app/api/stargazer/compatibility/route.ts:28
[API] GET /api/stargazer/compatibility → { score: number }
  ↓ fetch in components/stargazer/CompatibilityCard.tsx:15
[UI] <span>{score}%</span> ← ★ここで rendered

### カバレッジ

| 段階 | 状態 | 場所 | 備考 |
|------|------|------|------|
| defined | ○ | types/stargazer.ts:12 | StargazerProfile.compatibility_score |
| stored | ○ | migration 20260316... | stargazer_profiles.compatibility_score |
| returned | ○ | /api/stargazer/compatibility | { score } |
| consumed | ○ | lib/stargazer/compatibility.ts:42 | 正規化処理 |
| rendered | ○/× | [場所 or "未検出"] | [表示形式] |

### 問題検出

- 🔴 [断線があれば記載]
- 🟡 [変換ロスや型不一致があれば記載]
- ℹ️ [分岐やシャドウがあれば記載]

### 関連シグナル
- [同じテーブル/APIで一緒に流れる関連フィールド]
```

## 注意

- 命名揺れは必ず考慮する（例: `personal_color` → `personalColor` → `color`）
- 1つのシグナルに集中して深く追跡する。広く浅くは `/coverage-audit` の仕事
- 変換箇所では入力値と出力値の型・範囲も記録する
