# Culcept API仕様書

## Base URL

```
開発: http://localhost:3000/api
本番: https://culcept.vercel.app/api
```

## 認証

Supabase Auth を使用。リクエストヘッダーに認証トークンを含める。

```
Authorization: Bearer <access_token>
```

## エンドポイント一覧

### 推薦系

| Method | Endpoint | 説明 |
|--------|----------|------|
| GET | /recommendations | 推薦カード取得 |
| POST | /recommendations/action | アクション記録 |
| POST | /recommendations/rating | 評価記録 |
| POST | /recommendations/reset-seen | 既読リセット |

### カード系

| Method | Endpoint | 説明 |
|--------|----------|------|
| GET | /swipe/cards | カード直接取得 |

### 管理系

| Method | Endpoint | 説明 |
|--------|----------|------|
| GET | /health | ヘルスチェック |

## エラーレスポンス

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message"
  }
}
```

### エラーコード

| コード | 説明 |
|--------|------|
| UNAUTHORIZED | 認証エラー |
| NOT_FOUND | リソースが見つからない |
| VALIDATION_ERROR | バリデーションエラー |
| RATE_LIMITED | レート制限 |
| INTERNAL_ERROR | 内部エラー |
