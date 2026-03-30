---
name: orphan-audit
description: 孤立コード検出。DBカラム・APIエンドポイント・型定義・コンポーネントの中で、どこからも参照されない孤立要素を特定する。
user_invocable: true
---

# Orphan Audit — 孤立コード検出

Build Unit の構造監査官として、プロジェクト内の孤立要素を検出してください。

## 引数

- 検査対象（任意）: `db`, `api`, `types`, `components`, `all`（デフォルト: `all`）

## 検査カテゴリ

### 1. DB孤立カラム（stored but never returned/consumed）

- `supabase/migrations/` で定義されたカラムのうち、`lib/` や `app/api/` で一度も SELECT/参照されないもの
- 検索: カラム名（snake_case）でプロジェクト全体を grep
- 除外: `id`, `created_at`, `updated_at` 等の共通カラム

### 2. API孤立エンドポイント（returned but never consumed by UI）

- `app/api/` で定義されたエンドポイントのうち、`app/` や `components/` の fetch/useSWR で一度も呼ばれないもの
- 検索: API パスをクライアントコードで grep
- cron エンドポイント (`app/api/cron/`) は除外（サーバー側で呼ばれるため）

### 3. 型孤立定義（defined but never used）

- `types/` で export された型のうち、他ファイルで import されないもの
- 検索: 型名でプロジェクト全体を grep

### 4. コンポーネント孤立（rendered nowhere）

- `components/` で export されたコンポーネントのうち、他ファイルで import されないもの
- `app/` の page/layout で直接使われないもの

### 5. lib孤立関数（consumed by nobody）

- `lib/` で export された関数のうち、他ファイルで import されないもの

## 手順

1. 各カテゴリの候補を収集（Glob + Read で対象ファイルを特定）
2. 各候補について Grep でプロジェクト全体を検索
3. 参照が見つからないものを孤立としてリスト化
4. 孤立の原因を推定（削除漏れ、未実装、将来用途）

## 出力フォーマット

```
## Orphan Audit [日付]

### サマリー
| カテゴリ | 検査数 | 孤立数 | 孤立率 |
|---------|--------|--------|--------|
| DBカラム | N | N | N% |
| APIエンドポイント | N | N | N% |
| 型定義 | N | N | N% |
| コンポーネント | N | N | N% |
| lib関数 | N | N | N% |

### 🔴 削除候補（高確信で不要）
| 種別 | 名前 | 定義場所 | 理由 |
|------|------|---------|------|
| API | /api/xxx | app/api/xxx/route.ts | クライアント参照ゼロ、関連機能も削除済み |

### 🟡 要確認（参照不明だが意図的かもしれない）
| 種別 | 名前 | 定義場所 | 推定理由 |
|------|------|---------|---------|
| DBカラム | xxx_flag | migration ... | 将来用途の可能性 |

### 🟢 検出なし
[孤立がないカテゴリを記載]
```

## 注意

- git status で D (deleted) になっているファイルは検査対象外
- 動的 import や文字列結合による参照は検出しづらいので「検出限界」として明記
- cron ジョブ、webhook、外部からの呼び出しは孤立ではない（除外理由を記載）
- 大量検出時は種別ごとに上位10件のみ詳細表示
