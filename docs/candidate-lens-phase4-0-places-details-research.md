# Candidate Lens — P4-0: Places Details 事前調査レポート（read-only / research-only）

> ステータス: **調査のみ完了（docs-only）**。実 API 呼び出し・key/env/GCP 変更・課金操作・code 実装・DB・永続キャッシュ・production 有効化は**一切行っていない**。
> CEO GO: 2026-06-16「P4-0 read-only 調査のみ GO」。本レポートで停止。**P4-a 以降は別 GO**。
> ★料金・無料枠・規約は Google が変更しうる。下記は調査時点の公式ドキュメント値であり、**実装直前に再確認**する前提。

---

## 1. 参照した公式ドキュメント URL

| # | 内容 | URL |
|---|---|---|
| D1 | Place Details (New) 概要 | https://developers.google.com/maps/documentation/places/web-service/place-details |
| D2 | Place Data Fields (New)（field→SKU マッピング） | https://developers.google.com/maps/documentation/places/web-service/data-fields |
| D3 | Place Photos (New) | https://developers.google.com/maps/documentation/places/web-service/place-photos |
| D4 | Places API Usage and Billing | https://developers.google.com/maps/documentation/places/web-service/usage-and-billing |
| D5 | Core services pricing list（単価・無料枠） | https://developers.google.com/maps/billing-and-pricing/pricing |
| D6 | Pricing overview（$200 credit→free cap 移行） | https://developers.google.com/maps/billing-and-pricing/overview |
| D7 | Policies and attributions for Places API（attribution / caching） | https://developers.google.com/maps/documentation/places/web-service/policies |
| D8 | Place IDs（placeId 保存・refresh） | https://developers.google.com/maps/documentation/places/web-service/place-id |
| D9 | Maps Platform Service Specific Terms | https://cloud.google.com/maps-platform/terms/maps-service-terms |

---

## 2. SKU / tier ごとの課金影響（最重要・調査の核）

### 2.1 field → SKU マッピング（D2・New Place Details）
| フィールド | SKU tier |
|---|---|
| `id` / `name` / **`photos`** | **Place Details Essentials (IDs Only)** ＝ **無料・無制限** |
| `formattedAddress` / `shortFormattedAddress` / `location` / `types` | Place Details Essentials |
| `displayName` / `primaryType` / `businessStatus` / `googleMapsUri` / **`accessibilityOptions`** | Place Details Pro |
| **`regularOpeningHours` / `currentOpeningHours`** / `priceLevel` / `rating` / `userRatingCount` / `websiteUri` / `nationalPhoneNumber` | **Place Details Enterprise** |
| `takeout` / `delivery` / `dineIn` / `reservable` / `servesCoffee` / `goodForChildren` / `restroom` / `outdoorSeating` / `reviews` … 各種「公式属性 boolean」 | **Place Details Enterprise + Atmosphere** |

### 2.2 課金ルール（D4・★設計の急所）
> 「You are billed at the **highest SKU applicable to your request**.」
> ＝ 1 回の Details 呼び出しで複数 tier のフィールドを混ぜると、**最も高い tier で全体が課金**される。

- 含意1: `id,photos` だけなら **IDs Only ＝ $0**（写真メタは無料で取れる）。
- 含意2: そこに `regularOpeningHours`（Enterprise）を足すと **その call は Enterprise 課金**。
- 含意3: `takeout` 等（Enterprise+Atmosphere）を 1 つでも混ぜると **全体が最上位 $25/1000 に跳ねる**。
  → **公式属性（Enterprise+Atmosphere）は最小 P4 から除外**するのが正。

### 2.3 単価・無料枠（D5・調査時点・0–100K tier）
| SKU | 単価（per 1,000・0–100K） | 月次無料枠 | P4 での用途 |
|---|---|---|---|
| Place Details Essentials (IDs Only) | **$0（課金なし）** | 無制限 | `id,photos`（写真メタ取得） |
| Place Details Essentials | $5.00 | 10,000 | （P4 不使用） |
| Place Details Pro | $17.00 | 5,000 | （P4 不使用予定） |
| **Place Details Enterprise** | **$20.00**（$0.020/call） | **1,000** | 営業時間 |
| Place Details Enterprise + Atmosphere | $25.00 | 1,000 | （P4 除外推奨：公式属性） |
| **Place Photos** | **$7.00**（$0.007/call） | **1,000** | 写真メディア（バイト） |
| Text Search Pro（参考・既存検索） | $32.00（$0.032/call） | 5,000 | 既存 `searchPlacesByText`（P4 と無関係に既発生） |

> ★$200/月クレジットは 2025-02-28 で終了し、2025-03-01 から **SKU 別の月次無料枠**に移行（D6）。
> 上位 tier は無料枠が小さい（Enterprise / +Atmosphere / Photos はいずれも **1,000/月**）。

---

## 3. Details で使う最小 field mask 案

honesty で実値化できるのは **写真・営業時間**のみ（雰囲気/Wi-Fi/電源/静かは API 非提供＝未確認据置）。tier 別に 2 案。

- **案A（写真のみ・最安）**: `X-Goog-FieldMask: id,photos`
  - 課金 = **IDs Only ＝ $0**（写真メタ：`photos[].name` ＋ `photos[].authorAttributions`）。
  - 営業時間は未確認のまま。最も保守的。
- **案B（写真＋営業時間・推奨）**: `X-Goog-FieldMask: id,photos,regularOpeningHours`
  - 課金 = **Enterprise $0.020/call**（写真メタは同 call に同梱され追加課金なし）。
  - 営業時間（`openNow` / `weekdayDescriptions`）→ ③比較表の「営業時間」を**確認済みに昇格**。
- **除外（公式属性）**: `takeout` 等の boolean は **Enterprise+Atmosphere $0.025** に全体が跳ねるため**最小 P4 では取得しない**。必要になれば**別 call（field mask 分離）**で隔離し、別 GO で判断。

> ★既存 Text Search 接続案（最適化・要検証）: 現行 `searchPlacesByText` の `SEARCH_FIELD_MASK` に **`places.photos` を追加**すれば、**検索レスポンスに写真メタが同梱**され、Details の追加 call すら不要になる可能性（Text Search の tier を上げない範囲で）。tier 影響を P4-a 実装前に要確認。

---

## 4. Photos で使う最小 field mask 案 / 取得方式（D3）

Place Photos は「field mask」ではなく、**Details/Search 側で `photos` を要求 → 返ってきた `photos[].name` を media エンドポイントに渡す**二段構え。
- メディア取得: `GET https://places.googleapis.com/v1/{photo.name}/media?maxWidthPx={W}`
  - `photo.name` 形式 = `places/{PLACE_ID}/photos/{PHOTO_RESOURCE}`
  - `maxWidthPx` / `maxHeightPx` は **1〜4800** の整数。**タイル幅相当（例 400px 前後）に上限**指定（過大取得・コスト/帯域抑制）。
  - 認証 = `key=API_KEY`（または `X-Goog-Api-Key` ヘッダ）。
  - **`skipHttpRedirect=true`** → 画像バイトへ 302 する代わりに **`photoUri` を含む JSON** を返す。
    → これを使えば**サーバで画像バイトを中継・保存せず**、URL を `<img>` で**都度表示**できる（規約のキャッシュ制約に最も適合）。
- 1 place につき最大 10 枚。P4 は **タイル 1 枚のみ**（②開封時）取得。

---

## 5. コスト試算（1セッション / 1日 / 1ヶ月）

> ★前提（仮定・要 CEO 確認）: 現フェーズは招待制・少人数検証（CLAUDE.md「少人数の初期検証ユーザー獲得は行う」）。
> ② 詳細/③比較を開いた時だけ Details/Photo 発火。①browse では発火しない。セッション内 memo で重複排除。
> 1 セッション = 候補レンズで②を 1 回開く ≈ Details 1 + Photo media 1。

### 5.1 1 セッション単価（無料枠超過後の限界費用）
| 構成 | Details | Photo | 合計/セッション |
|---|---|---|---|
| 案A 写真のみ | $0（IDs Only） | $0.007 | **≈ $0.007** |
| 案B 写真＋営業時間 | $0.020（Enterprise） | $0.007 | **≈ $0.027** |
（無料枠内なら実質 $0。既存 Text Search の $0.032/検索は P4 と無関係に元から発生。）

### 5.2 規模別 月次試算（30日・②開封のみ課金対象）
| 規模 | 月間 ②開封 ≒ call 数 | 案A 写真のみ | 案B 写真＋営業時間 |
|---|---|---|---|
| 招待 ~10人 × 2/日 | ~600/月 | Photo<1,000無料 → **$0** | Enterprise<1,000＋Photo<1,000 → **$0** |
| ~30人 × 2/日 | ~1,800/月 | Photo (1,800−1,000)=800×$0.007 → **≈$5.6** | Enterprise 800×$0.020 ＋ Photo 800×$0.007 → **≈$21.6** |
| ~100人 × 3/日 | ~9,000/月 | Photo 8,000×$0.007 → **≈$56** | Enterprise 8,000×$0.020 ＋ Photo 8,000×$0.007 → **≈$216** |

**結論**: 招待制・少人数（≲20人）の検証段階では、案A・案B いずれも **Google 無料枠内 ≈ $0/月** に収まる見込み。スケール時のみ上表の課金が発生。案A（写真のみ）は Details が IDs-Only 無料のため極めて安価。
※実額は GCP 請求アカウント・実 ②開封率・実ユーザー数で変動。**実装後に GCP 予算アラートで監視**する前提。

---

## 6. attribution 表示要件（D7）

- **写真**: `authorAttributions` に値があれば、画像を表示する**全箇所で撮影者の attribution を併記**必須（`displayName`＋プロフィール `uri` リンク＋`photoUri`）。→ ①②③ の写真タイルに caption slot を**最初から組み込む**。
- **Google ロゴ / "Powered by Google"**: attribution は可能な限り **Google Maps ロゴ（最小 16dp）**。スペース制約時は **"Google Maps" テキスト**（Roboto 400・12–16sp・**ローカライズ/改変禁止**）。
- **reviews は使わない**ため review attribution は対象外（公式属性・reviews を取得しない方針＝§3）。
- 出典表示は **法務確認（G4）**の対象。UI に attribution を後付けにしない。

---

## 7. キャッシュ方針（D7 / D8）

- **原則: Places コンテンツ（名称・住所・営業時間・写真バイト等）は cache/store 禁止**（規約の例外を除く）。
- **placeId のみ例外** = 無期限保存可。ただし **12ヶ月超は refresh 推奨**（古い ID は Details 404 リスク）。
- **P4 既定方針 = 永続キャッシュしない**:
  - Details/Photo 結果は **セッション内メモリのみ**（タブを閉じれば消滅）。localStorage / DB / Supabase / ファイルに**書かない**。
  - 写真は **`skipHttpRedirect` の `photoUri` を `<img>` で都度表示**（バイトを保存・再配布しない）。
  - 保存してよいのは候補が既に持つ **placeId だけ**。
- 永続キャッシュ（コスト削減目的）は **既定で不実装**。必要時のみ **別 GO・法務承認前提（P4-d）**。
- ※ Phase 3 Preference 観測は opaque hash のみ保存で元々 Places コンテンツ非保存 → 本方針と矛盾なし。

---

## 8. 既存 Text Search との接続点（確認済み）

- 経路: `PlaceCandidatesPanel` → POST `/api/plan/places/search` → `route.ts` → `searchPlacesByText`（`placesApiClient.ts`）→ `results[]`。
- ★`app/api/plan/places/search/route.ts:272` が `placeId: p.id`（= Google `places.id` 素通し）。
  → 候補の `LensCandidate.placeId` は**実在 Google Place ID**。Place Details `/v1/places/{placeId}` を**そのまま叩ける**（合成 ID 問題なし・配線準備済み）。
- 既存基盤の再利用点: base URL・`X-Goog-Api-Key`/`X-Goog-FieldMask`・キーをログに出さない設計・`!res.ok`→throw→fail-open・privacy-safe payload。
- 最適化候補（§3 末尾）: 既存 `SEARCH_FIELD_MASK` に `places.photos` 追加で写真メタを検索同梱できる可能性（tier 影響を P4-a で検証）。

---

## 9. 実装しない項目（P4-0 スコープ外・禁止事項の遵守）
- 実 API 呼び出し / API key 変更 / env 変更 / Google Cloud 設定変更 / 課金が発生する操作 — **未実施**。
- code 実装 / DB / migration / 永続キャッシュ / production 有効化 — **未実施**。
- 公式属性（Enterprise+Atmosphere）・reviews・rating・地図実埋め込み・経路 API 実徒歩 — **P4 最小スコープ外**。
- 雰囲気 / Wi-Fi / 電源 / 静か — API 非提供 → **honesty 上、未確認のまま（P4 後も埋めない）**。

---

## 10. P4-a 以降の段階計画（再提出・各 GO 分離）

> いずれも flag default OFF・dev/dogfood 限定・production hard block・additive・pure-first・test 付き。

- **P4-a｜pure クライアント＋型（flag OFF・本番不発火）**
  - `fetchPlaceDetails(placeId, fieldMask)`＋`buildPhotoMediaUrl(photoName, maxWidthPx)`＋`PlaceDetailsResult` 型。
  - 既存同様: キー秘匿・rate limit・field mask 最小（案B `id,photos,regularOpeningHours`）・fail-open。
  - `skipHttpRedirect=true` で photoUri 取得。**CI は fetch mock の unit test のみ（実 API を叩かない）**。
- **P4-b｜honesty マッピング（pure）**
  - `PlaceDetailsResult` → 既存 `PlaceAttribute` モデル。営業時間→確認済み行、写真 name→media descriptor。
  - **Wi-Fi/電源/静か/雰囲気は触らない**（未確認のまま）。pure 変換＋test。
- **P4-c｜UI 配線（dev-only・flag-gated）**
  - abstract タイル→実写真（＋authorAttribution caption＋"Powered by Google"）、未確認 営業時間→実時間。
  - **②③ でのみ遅延 fetch・セッション内 memo・永続化なし**。dev smoke（実機）→ flag OFF へ revert。
  - production 有効化は **別 GO（G5）**。
- **P4-d｜（保留・既定で実装しない）永続キャッシュ** — 規約適合確認時のみ・別 GO・法務前提。

---

## 11. リスクと rollback
| ID | リスク | 対応 |
|---|---|---|
| R1 | 料金/無料枠を Google が変更しうる（請求アカウント依存） | 実装直前に D5/D6 再確認＋GCP 予算アラート監視 |
| R2 | field mask に Enterprise+Atmosphere フィールドが 1 つ混入で全 call $0.025 に跳ねる | field mask を定数化＋test で許可フィールドを固定（公式属性を混ぜない） |
| R3 | 写真バイト永続化＝規約違反リスク | 永続化しない・`skipHttpRedirect` の URL を都度表示・authorAttribution 必須 |
| R4 | placeId が >12ヶ月で stale → Details 404 | fail-open で abstract タイル/未確認に自動復帰・必要なら refresh |
| R5 | honesty 後退（雰囲気等を埋めたく見える） | API 非提供項目は未確認据置を test/レビューで固定 |
| R6 | 本番で意図せず課金 | flag default OFF・production hard block・②③ 限定発火 |

**Rollback**: 全 flag OFF で P4 全消滅。永続化ゼロ＝残留データなし。fail-open で既存 abstract/未確認 に自動復帰。コード追加は additive のため revert 容易。

---

## 12. CEO へ（次アクション提案）
1. 本調査により、**招待制・少人数検証では案A/案B とも Google 無料枠内 ≈ $0/月** の見込みを確認。
2. 推奨スコープ = **案B（写真＋営業時間）／公式属性は除外**。最小 field mask `id,photos,regularOpeningHours`＋Photos（maxWidthPx 上限）。
3. 着手判断ゲート（P4 計画 §2 の G1〜G5）— 特に **G1 キー scope（Details/Photo 有効化）・G2 予算上限・G3 キャッシュ/法務・G4 attribution** のご判断を仰ぎます。
4. GO 後、**P4-a（pure クライアント・flag OFF・実 API 不叩き）**から段階実行します。

> 本レポートは **research-only / docs-only**。**P4-a 以降は CEO GO まで着手しません。**
