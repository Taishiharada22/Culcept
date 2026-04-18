# Baseline 編集 + Alter 始終点接続 仕様書 v1.1

**作成**: 2026-04-18（v1 → v1.1 即日改訂）
**ステータス**: CEO 承認待ち
**スコープ**: /my-page から baseline を編集可能にする + Alter の 1 日の始終点として接続する

## 改訂履歴

- **v1.1（2026-04-18）**: GET response の未完了ユーザー挙動を明文化（`prefecture: string | null`, 200 固定）／ 認証失敗時は API が 401 JSON を返し client 側で redirect を決定する方針に変更
- **v1（2026-04-18）**: 初版

---

## 0. 背景

- `/baseline` は初回オンボーディングのみで、編集不可（`baseline_completed_at` が立つと `/` へ redirect）
- `/my-page` は baseline 値を取得すらしていない
- `todayOrigin.coords` / `currentLocation` は型定義のみ、実装プレースホルダ
- Alter 側の `locationResolver.resolveLayer1()` は `prefecture + city → coords` を既に解決できるため、穴は UI / 永続化のみ

## 1. DB Migration

ファイル: `supabase/migrations/20260418_baseline_edit_columns.sql`

```sql
ALTER TABLE profiles ADD COLUMN baseline_home_label TEXT;
ALTER TABLE profiles ADD COLUMN baseline_home_place_type TEXT
  NOT NULL DEFAULT 'home'
  CHECK (baseline_home_place_type IN ('home', 'other'));
ALTER TABLE profiles ADD COLUMN baseline_home_lat DECIMAL(9,6);
ALTER TABLE profiles ADD COLUMN baseline_home_lng DECIMAL(9,6);

COMMENT ON COLUMN profiles.baseline_home_label IS 'User label for their base (nullable, free text)';
COMMENT ON COLUMN profiles.baseline_home_place_type IS 'home = 生活の base / other = non-home base';
COMMENT ON COLUMN profiles.baseline_home_lat IS 'Resolved coordinate cache (municipality precision); NULL means fallback to prefecture at runtime';
COMMENT ON COLUMN profiles.baseline_home_lng IS 'See baseline_home_lat';
```

**原則**: `lat/lng` は source-of-truth ではなく `prefecture+city+label` の派生キャッシュ。再解決可能。

### 保留カラム（現時点で追加しない）

- `baseline_override_policy`: アプリ定数 `'explicit_only'` で固定、ユーザー差が不要
- `baseline_home_coords_source`: `city` NULL 判定で派生可能
- `baseline_home_resolved_at`: `profiles.updated_at` で代替可能

## 2. Backfill 方針

2 段構成:

### Step 1: ALTER（カラム追加）
DDL のみ。`DEFAULT 'home'` で全行の `place_type` が埋まる。

### Step 2: UPDATE backfill（idempotent）
```sql
UPDATE profiles
SET baseline_home_lat = <derived_lat>, baseline_home_lng = <derived_lng>
WHERE baseline_completed_at IS NOT NULL
  AND baseline_home_lat IS NULL
  AND prefecture IS NOT NULL
  AND city IS NOT NULL;
-- where getMunicipalityCoords(prefecture, city) returns non-null
```

- `label` は NULL のまま（初回 /my-page 編集で本人に聞く）
- 市区町村が `municipalityCoords` 未収録 → `lat/lng` NULL のまま（runtime prefecture fallback で動く）
- 全件埋め切り禁止（県庁所在地での強制 backfill は Alter 品質を劣化させる）

## 3. API

### `GET /api/baseline`

既存 POST と同一 route に GET を追加。**常に 200 を返し**、未完了ユーザーは nullable field で表現する。

**Response**（200 固定）:
```ts
{
  label: string | null,
  place_type: 'home' | 'other',       // default 'home' なので常に非 NULL
  prefecture: string | null,          // 未完了ユーザーは NULL
  city: string | null,
  coords: { lat: number, lng: number } | null,
  coords_status: 'resolved' | 'fallback' | 'unresolved',
  completed_at: string | null         // NULL = baseline 未完了の signal
}
```

**完了判定は `completed_at !== null` で行う**（`prefecture !== null` は補助的シグナル）。

`coords_status` は response 組み立て時に derive:
- `lat/lng` あり → `resolved`
- `lat/lng` NULL かつ `prefecture` 有効（非 NULL かつ PREFECTURES 含有）→ `fallback`（runtime で prefecture coords に解決される）
- `prefecture` NULL or 無効 → `unresolved`（未完了ユーザー or 破損データ）

**未完了ユーザーへの UI 側挙動**: /my-page は `completed_at === null` を検出したら baseline セクションを「baseline を先に完了してください」hint に差し替える（詳細は §4）。

### `PATCH /api/baseline`

**Request**（全 field optional、差分のみ送信可）:
```ts
{
  label?: string | null,          // max 40 chars
  place_type?: 'home' | 'other',
  prefecture?: string,            // PREFECTURES 列挙
  city?: string | null,
}
```

**Validation**（既存 POST の検証ロジックを流用 + 追加）:
- `prefecture`: PREFECTURES リストに含まれる
- `place_type`: `'home' | 'other'` 列挙
- `label`: NULL 可、非 NULL 時は 1〜40 chars

**処理**:
1. `prefecture` か `city` が変わった場合のみ `getMunicipalityCoords(prefecture, city)` を呼ぶ。成功時 `lat/lng` 更新、失敗時 `lat/lng = NULL`
2. `label` / `place_type` 単独変更では coords 再解決しない
3. `baseline_completed_at` は触らない（編集で再評価しない）

**Response**: `GET` と同 shape（更新後の値）

## 4. /my-page UI 文言と保存フロー

### 表示セクション（`MyPageClient.tsx` に追加）

```
━━ ベース（1日の始点・終点） ━━
🏠 {displayLabel}
   {prefecture}{city ? ' ' + city : ''}
   {coordsStatusBadge?}
   [編集]

{silent assumption 可視化行（既存ユーザーのみ）}
```

#### `displayLabel` 導出ルール

| `label` | `place_type` | 表示 |
|---------|--------------|-----|
| 非 NULL | any | `label` そのまま |
| NULL | `home` | **「自宅」** |
| NULL | `other` | **「居住地」** |

#### `coordsStatusBadge`

| `coords_status` | 表示 |
|---|---|
| `resolved` | 表示なし（デフォルト状態） |
| `fallback` | 淡色バッジ「市区町村未解決・県の中心で動きます」 |
| `unresolved` | 警告バッジ「位置情報を設定してください」（編集導線強調） |

#### Silent assumption 可視化

`label === null && baseline_completed_at !== null` の場合、表示下に淡色で 1 行:
> 「現在は『自宅』として扱っています。変更できます。」

### 編集フロー

「編集」ボタン → モーダル（1 画面、4 項目）:

```
┌─ ベースを編集 ──────────────┐
│ ラベル（任意）               │
│   [自宅 / 実家 など         ] │
│                             │
│ 種別                         │
│   (●) 自宅（home）           │
│   ( ) その他（other）         │
│                             │
│ 都道府県                     │
│   [ セレクト              v ]│
│                             │
│ 市区町村（任意）              │
│   [                        ] │
│                             │
│ [キャンセル]      [保存]     │
└──────────────────────────────┘
```

保存ボタン → `PATCH /api/baseline` →

| 結果 | UI 挙動 |
|---|---|
| 成功（`resolved`） | toast「ベースを更新しました」、モーダル閉じる |
| 成功（`fallback`） | toast「ベースを更新しました。市区町村の詳細位置は未解決なので、県の中心をプランの起点として使います」、モーダル閉じる |
| 失敗（validation / 500） | モーダル内エラー表示、入力値保持 |

## 5. Alter 接続点

### 既存で足りる部分（追加実装不要）

- `locationResolver.resolveLayer1()` が `prefecture/city` 経由で coords 解決する構造は完成
- `EndpointAnchor` / `currentLocation` / `todayOrigin` 型定義済み
- 優先順位制御（Layer 2 explicit > Layer 2 inferred > Layer 1 city > Layer 1 prefecture）は既に実装

### 本仕様書で追加する実装

- `locationResolver.resolveLayer1()` に **cache 短絡パス** を追加:
  - `profiles.baseline_home_lat/lng` が present → これを Layer 1 city coords として即返す（`sourceLabel` に `label` を反映）
  - NULL → 既存の city/prefecture resolution パスに落ちる
- `ResolvedOrigin.sourceLabel` に `label` を反映（Alter Narration が「{label} から」「{label} へ」と呼べるように）

### 本仕様書ではやらない（vNext Comprehension Layer）

- 明示上書き発話検出（「今ここにいる」「ここに帰る」「ホテルに泊まる」）
- 曖昧表現（「家に帰るかも」等）を uncertainty に倒す判定
- baseline と override の優先順位制御（vNext 設計書 §1-1 に既に定義）

## 6. 非スコープ（本仕様書で実装しない）

| 項目 | 格納先 |
|---|---|
| **geolocation API**（現在地取得） | 将来実装（補助位置のみ、主情報源にしない） |
| **リコメンド範囲拡張** | vNext Recommendation Sub-Design |
| **非首都圏チェーン店優先**（東京/大阪/福岡/札幌/名古屋以外） | 同上 |
| **hotel 恒久保存 UI** | vNext Comprehension Layer（発話由来の per-day override） |
| **多拠点 baseline** | 将来別機能（trip mode 等） |
| **`override_policy` カラム** | アプリ定数 `'explicit_only'` で固定 |
| **`coords_source` / `resolved_at` カラム** | 派生で十分、追加しない |

## 7. 失敗時ポリシー

| Case | DB | API Response | UI | Alter 挙動 |
|---|---|---|---|---|
| **A. coords 解決失敗**（municipality 未収録） | `prefecture/city` 保存成功、`lat/lng = NULL` | `coords: null, coords_status: 'fallback'` | toast「市区町村の詳細位置は未解決…」＋ `fallback` バッジ | runtime resolver が prefecture で動くため機能劣化なし |
| **B. API validation 失敗** | 更新なし | 400 + エラーメッセージ | フィールド脇にエラー表示、モーダル保持 | — |
| **C. 認証失敗** | — | 401 + JSON body `{ error: 'unauthorized' }` | Client（/my-page）が 401 を検知したら `/login` に遷移（API 側 redirect はしない） | — |
| **D. DB 書き込み失敗** | 更新なし | 500 | toast「保存に失敗しました。時間をおいて再度お試しください」／ モーダル閉じない、入力保持 | — |
| **E. 同一ユーザー 2 タブ編集** | Last-write-wins、`updated_at` 更新 | 最新値 | 別タブは次回操作時に最新値が見える（optimistic UI） | — |

---

## 実装順序

本仕様書承認後、以下の順で進める:

1. **Migration**（Step 1: ALTER → Step 2: Backfill SQL の準備）
2. **API 拡張**（GET 追加 + PATCH 追加、既存 POST 検証ロジック流用）
3. **`locationResolver` cache 短絡パス追加**
4. **`/my-page` UI 実装**（表示セクション → 編集モーダル）
5. **E2E 動作確認**（既存ユーザー / 新規ユーザー / coords fallback / エラー各種）

各ステップは個別コミット。migration 実行は CEO 承認必須（CLAUDE.md Operating Rule 1）。

## CEO 判断事項

1. この仕様書 v1 で **実装着手可** か
2. DB migration の実行タイミング: **本仕様書承認と同時** か、**実装完了後に別途承認** か
3. 次回追記が発生した場合は v1.1 として更新、履歴は git に残す
