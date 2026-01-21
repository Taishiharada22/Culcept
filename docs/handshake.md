# Culcept Handshake (引き継ぎ台帳)
最終更新: 2026-01-19

このファイルは「次のチャットでも、既存実装を正として *必ず修正ベースで* 進める」ための台帳。
※ 新規で作り直さない。既存ファイルをパッチで直す。

---

## 0. TL;DR（いまの状態）
- Next.js (App Router) + Supabase + Server Actions のMVPを進行中。
- Recommendations（seller/buyer）APIは動作確認済み:
  - `GET /api/recommendations?role=seller&limit=10` → `{ ok:true, items:[...] }` が返る
  - `POST /api/recommendations/rating` / `POST /api/recommendations/action` も 200 を確認済み（過去に 400/500 を踏んだ）
- `rec_version` 列が schema cache エラー原因になったことがある（列追加/整合必須）。

---

## 1. 技術スタック / ルール
- Next.js App Router（`app/` が正）
- Supabase:
  - `supabaseServer()`（ユーザーセッション用）
  - `supabaseAdmin`（service role / 管理用）
- 原則:
  - **既存コードが正**。似たファイルを新規作成しない。
  - 変更する時は **対象ファイルの全文 or 該当範囲** を出して、その上で差分修正。
  - APIのリクエスト/レスポンス形状は **このファイルが正**。

---

## 2. 重要パス（“正”のファイル一覧）
### Recommendations
- `app/api/recommendations/route.ts`（GET recommendations 本体）
- `app/api/recommendations/rating/route.ts`（POST rating）
- `app/api/recommendations/action/route.ts`（POST action）
- `app/components/RecommendationsClient.tsx`（buyer/seller共通UI。ログはUIを止めない方針）
- `app/shops/me/SellerRecoPanel.tsx`（seller向け簡易UIパネル）

### Shops / Drops
- `app/shops/me/page.tsx`（出品者ダッシュボード。Shop設定 + SellerRecoPanel + MyDrops）
- `app/shops/me/actions.ts`（upsert/toggleなど）
- `app/drops/page.tsx`（Drops一覧。`v_drops_ranked_30d_v2` を読む）
- `app/shops/[slug]/page.tsx`（Shop公開ページ。shops本体 or viewヘッダーから復元）

### Start
- `app/start/page.tsx`（RecommendationsClientを呼ぶ導線。importパス注意）

---

## 3. Recommendations API 仕様（絶対にここに合わせる）
### 3.1 GET: `/api/recommendations?role=seller|buyer&limit=number`
- query:
  - `role`: `"seller"` or `"buyer"`
  - `limit`: 例 5/10
- response（成功）:
```json
{
  "ok": true,
  "role": "seller",
  "recVersion": 1,
  "items": [
    {
      "impressionId": "uuid or null",
      "role": "seller",
      "recType": "seller_trend_size",
      "targetType": "insight",
      "targetId": null,
      "rank": 0,
      "explain": "optional",
      "payload": { "kind": "trend_size", "...": "..." }
    }
  ]
}
