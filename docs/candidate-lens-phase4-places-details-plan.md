# Candidate Lens — Phase 4: Places Details 計画（写真 / 営業時間 / 公式属性）

> ステータス: **計画のみ（未実装・未承認）**。本ドキュメントは CEO 判断を仰ぐための提案書。
> 外部 API / 課金 / キャッシュ / 規約に関わるため、CLAUDE.md §1（承認が必要な行動）に該当。**着手は CEO GO 後**。
> 作成: 2026-06-16 / 前提: Phase 1（pure 基盤）・Phase 2-UI・Phase 3（Preference 観測）着地済み。

---

## 0. 目的（なぜ P4 か）

Phase 2-UI の **honesty 絶対原則**により、現状の候補レンズは「外部 API で確認できないもの」を一切捏造していない：

| 項目 | 現状（P2/P3） | 根拠 |
|---|---|---|
| 写真 | category abstract タイル（☕📚🍽️ glyph） | 実写真ソースが無い |
| 地図 | 簡易 map タイル（装飾 grid＋pin） | 実地図埋め込みが無い |
| 営業時間 | ③比較表で **未確認**（dimmed 行） | データソースが無い |
| 雰囲気 / Wi-Fi / 電源 / 静かさ | **未確認**（muted チップ / dimmed 行） | データソースが無い |
| 徒歩 | haversine 直線 ×1.3「約/目安」 | 経路 API 未使用（計算値と明示） |

P4 は、このうち **実データで確認できるもの（写真・営業時間・一部の公式属性）だけ** を実値化し、abstract タイル・未確認行を「確認済み」に昇格させる。
**実データで取れないもの（雰囲気・Wi-Fi・電源・静かさ）は P4 後も未確認のまま据え置く**（後述 §4 honesty）。

中心問い（Aneurasync 設計思想）との整合: 「この機能はユーザーの第二の自己として必要か？」
→ P4 は新しい観測軸を増やさない。**既に見せている UI の honesty 解像度を上げるだけ**の保守的拡張。判断軸（目的レンズ）は不変。

---

## 1. 技術的前提（調査済み・grounded）

### 1.1 既存基盤（再利用できる）
- クライアント: `lib/alter-morning/placesApiClient.ts`
  - base `https://places.googleapis.com/v1`、Places API (New)
  - `searchPlacesByText()` … Text Search (New)、`SEARCH_FIELD_MASK`（Basic tier のみ・コメントに `~$0.032/req` と SKU 意識あり）
  - 認証 `X-Goog-Api-Key`（`GOOGLE_MAPS_API_KEY`）、`X-Goog-FieldMask`
  - `isPlacesApiAvailable()` / `getApiKey()`（**キー文字列をログに出さない**設計）
  - privacy-safe payload（textQuery＋bias のみ）、`!res.ok` で throw → resolver 側 fail-open
- 検索経路: `PlaceCandidatesPanel` → POST `/api/plan/places/search` → `route.ts` → `searchPlacesByText` → `results[]`
- ★**重要な前提（確認済み）**: `app/api/plan/places/search/route.ts:272` が `placeId: p.id`（= Google `places.id` を素通し）。
  - したがって候補の `LensCandidate.placeId` は **実在する Google Place ID**。
  - → Place Details (New) `GET /v1/places/{placeId}` を **そのまま叩ける**（合成 ID の解決問題は無い）。P4 は配線準備が整っている。

### 1.2 P4 で新たに使う API（Places API (New)）
- **Place Details (New)**: `GET https://places.googleapis.com/v1/places/{PLACE_ID}`
  - `X-Goog-FieldMask` で取得フィールドを指定（**field mask が課金 SKU tier を決める**）。
  - 写真メタ: `photos[]`（各 `{ name, widthPx, heightPx, authorAttributions[] }`）
  - 営業時間: `regularOpeningHours`（`openNow` / `weekdayDescriptions` / `periods`）、`currentOpeningHours`
  - 公式属性（例・**要 field→SKU マッピング確認**）: `businessStatus`、`takeout`/`delivery`/`dineIn`/`reservable`/`servesCoffee`/`goodForChildren`/`restroom`/`outdoorSeating`、`accessibilityOptions`（`wheelchairAccessible*`）、`priceLevel`/`rating`/`userRatingCount`
- **Place Photo (New)**: `GET https://places.googleapis.com/v1/{photo.name}/media?maxWidthPx=...`（または `maxHeightPx`）
  - `photo.name` は Place Details / Search の `photos[].name` から取得。
  - **写真は別 SKU として課金**（Details とは別計上）。レスポンスは画像バイナリ（リダイレクト）。

---

## 2. CEO 判断ゲート（着手前に必要な承認・最重要）

> 以下は CLAUDE.md §1 により **CEO 承認が必須**。AI は提案までで、実行しない。

| # | 項目 | 該当（CLAUDE.md §1） | 判断内容 |
|---|---|---|---|
| G1 | **API キー scope** | 外部サービス連携追加・API キー発行 | `GOOGLE_MAPS_API_KEY` に **Place Details (New)** と **Place Photo (New)** を有効化してよいか（現状は Text Search のみ運用想定） |
| G2 | **課金（予算）** | 課金・決済に関わる変更 | 課金 SKU tier の利用可否と **月次予算上限**。SKU は field mask 依存・写真は別計上。**実価格・無料枠は本ドキュメントで断定しない**（知識カットオフ Jan 2026・Google 2025 料金改定後＝**現行ドキュメントで要確認**）。P4-0 で実額見積を提出 |
| G3 | **キャッシュ / 規約** | 法務・プライバシーに関わる変更 | Google Maps Platform 利用規約のキャッシュ制約への準拠方針（§3）。**写真バイト永続化の可否**・**Places コンテンツの保持期間**・**placeId のみ保存**の線引き。法務確認 |
| G4 | **attribution 表示** | 対外公開 / ブランド | 規約が要求する出典表示（写真の `authorAttributions`、必要箇所の "Powered by Google"）を UI に出す設計の承認（§3.3） |
| G5 | **本番反映** | 本番環境へのデプロイ | production 有効化は **Phase 1〜3 と同様に別 GO**。実装クローズ ≠ 有効化クローズ |

**この 5 ゲートのうち G1〜G3 が未承認なら、P4-a（コード）にも着手しない。** P4-0（読み取り調査のみ）は承認不要で先行可。

---

## 3. 外部 API / 課金 / キャッシュ / 規約（CEO 指定の 4 論点）

### 3.1 外部 API
- 追加するのは **Place Details (New)** ＋ **Place Photo (New)** の 2 つ。既存 `placesApiClient.ts` の認証・ログ秘匿・fail-open 設計をそのまま継承する。
- **field mask 最小化が原則**: P4 が描画するフィールドだけを要求（無駄な上位 tier を呼ばない）。
  - 想定 mask（最小）: `id`, `photos`(name＋authorAttributions のみ), `regularOpeningHours`(openNow/weekdayDescriptions), ＋描画する公式属性 boolean。
  - **取得しない**: reviews・rating・editorial summary 等の上位 tier（機能要件に無い・コスト/規約リスク高）。
- **呼び出しの遅延化（コスト核）**: ① browse（複数候補を捲る）では Place Details を呼ばない。**② 詳細を開いた時 / ③ 比較に入った時だけ**、その placeId に対して呼ぶ。
  - → 1 intent あたり最大 1〜2 件の Details 呼び出しに抑制（候補 N 件ぶん呼ばない）。
  - セッション内 memo（placeId→結果・**メモリのみ・永続化なし**）で重複呼び出しを排除。
- **写真**: タイル 1 枚ぶんだけ、`maxWidthPx` を上限指定して取得（全 `photos[]` を prefetch しない）。

### 3.2 課金（課金）
- 課金は **per-request × SKU tier**。tier は field mask で決まる（基本 < Pro < Enterprise < Enterprise+Atmosphere の順に高い）。**写真は別 SKU**。
- 営業時間・公式属性は中位 tier（Pro 相当）に入る見込み、写真は写真 SKU。**正確な tier 区分と単価・無料枠は現行 Google ドキュメントで要確認**（断定しない）。
- コスト制御策（設計に内蔵）:
  1. field mask 最小化（§3.1）
  2. ②③ でのみ遅延呼び出し（browse では呼ばない）
  3. セッション内 memo で重複排除
  4. 写真は 1 枚・`maxWidthPx` 上限
  5. flag default OFF・dev/dogfood 限定 → **production で課金が発生しない**（有効化は G5 別 GO）
- **P4-0 で月次コスト試算**（想定 DAU × intent 率 × ②③開封率 × 単価）を CEO に提出してから G2 を仰ぐ。

### 3.3 キャッシュ（キャッシュ）
- Google Maps Platform 利用規約はコンテンツのキャッシュ/保存を制約する（**現行規約の条文・保持期間は法務確認必須**。一般に知られる範囲を以下に記すが、最新条文を P4-0 で確認）:
  - **placeId は無期限に保存可**（規約上の例外）。→ Aneurasync 側で安全に保持してよい唯一の ID。
  - **その他の Places コンテンツ**（名称・住所・営業時間・属性等）は**長期キャッシュ不可**（一定の短期/性能目的の範囲に限られる）。
  - **写真バイトは原則 永続化しない**。表示は API URL から都度取得（保存・再配布しない）。
- **P4 の既定方針 = 永続キャッシュしない**:
  - Place Details / Photo の結果は **セッション内メモリのみ**（タブを閉じれば消える）。localStorage / DB / Supabase / ファイルに **書かない**。
  - 保存してよいのは **placeId だけ**（既に candidate が持っている）。
  - 永続キャッシュ（コスト削減目的）が必要になったら **P4-d として別 GO・法務承認前提**（既定では実装しない）。
- Phase 3 の Preference 観測は **opaque key（hash）のみ**保存で、元々 Places コンテンツを保存していない → P4 と矛盾しない。

### 3.4 規約 / attribution（規約）
- **出典表示義務**（G4）:
  - 写真には `authorAttributions[]`（撮影者名／リンク）を**必ず併記**して表示する。
  - 必要箇所に "Powered by Google" 等の表示（現行規約の要求に従う）。
  - 返却される `*Attribution` フィールドがあれば表示する。
- **禁止事項の遵守**:
  - Places コンテンツで **競合データベースを構築しない**（スクレイピング/恒久蓄積による DB 化の禁止）。
  - 規約で許可された UI 表示の範囲を超えてデータを再利用しない。
- これらは **法務レビュー（G3/G4）の対象**。UI 設計に attribution slot を最初から組み込む（後付けにしない）。

---

## 4. honesty 統合（絶対原則の維持）

P4 は honesty を**緩めない**。「取れたものだけ確認済みに昇格、取れないものは未確認のまま」を厳守する。

| UI 要素 | P4 で実値化 | 取れない場合 |
|---|---|---|
| ① ② ③ メディアタイル（写真） | `photos[0]` の media URL ＋ authorAttribution キャプション | abstract category タイルのまま（fallback 維持） |
| ③比較表「営業時間」行 | `regularOpeningHours`（開店中/曜日別）→ **確認済み行に昇格** | 未確認（dimmed）のまま |
| 公式属性（テイクアウト/座席/バリアフリー等） | Google が返した boolean だけ honest チップで表示 | 表示しない（**未確認を捏造しない**） |
| **雰囲気 / Wi-Fi / 電源 / 静かさ** | — | **P4 後も未確認のまま**。Places API は Wi-Fi/電源/静けさを標準提供しない → ここを埋めない（honesty の要） |
| 地図 | （P4 範囲外。実地図埋め込みは別検討） | 簡易 map タイルのまま |
| 徒歩 | （P4 範囲外。経路 API は別） | haversine「約/目安」のまま |

★**最重要の honesty ガード**: P4 で写真と営業時間が入っても、**Wi-Fi・電源・静かさ・雰囲気は依然「未確認」**。
Places Details は雰囲気/Wi-Fi/電源を信頼できる形で返さないため、ここを「確認済み」に見せることは禁止。
優位ハイライト・推薦は従来どおり **表示値に差がある確認済み軸のみ**（P3-c の canonical 判定は不変）。

---

## 5. 実装フェーズ（各 GO 分離・Phase 1〜3 と同じ規律）

> いずれも flag default OFF・dev/dogfood 限定・production hard block・additive・pure-first・test 付き。

- **P4-0｜前提調査（read-only・承認不要で先行可）**
  - 現行 Google ドキュメントで「field→SKU tier・単価・無料枠・キャッシュ条文・attribution 要件」を確認。
  - キーに 2 API が有効か確認（無効なら G1 要請）。月次コスト試算を作成。
  - 成果物 = CEO 判断用メモ（コード変更なし・課金呼び出しなし）。→ G1〜G3 を仰ぐ。
- **P4-a｜pure クライアント＋型（flag OFF・本番不発火）**
  - `fetchPlaceDetails(placeId, fieldMask)` ＋ `buildPhotoMediaUrl(photoName, maxWidthPx)`（`placesApiClient.ts` 追記 or `placeDetailsClient.ts` 新設）。
  - 既存同様: キー秘匿・rate limit・fail-open・field mask 最小。`PlaceDetailsResult` 型定義。
  - **CI で実 API を叩かない**（fetch mock の unit test のみ）。
- **P4-b｜honesty マッピング（pure）**
  - `PlaceDetailsResult` → 既存 `PlaceAttribute` モデルへ変換。営業時間→確認済み行、公式属性 boolean→honest チップ、写真 name→media descriptor。
  - **Wi-Fi/電源/静か/雰囲気は触らない**（未確認のまま）。pure 変換＋test。
- **P4-c｜UI 配線（dev-only・flag-gated）**
  - abstract タイル→実写真（＋authorAttribution キャプション＋"Powered by Google"）、未確認 営業時間→実時間。
  - ②③ でのみ遅延 fetch・セッション内 memo・**永続化しない**。dev smoke（実機）→ flag OFF へ revert。
  - production 有効化は **G5 別 GO**。
- **P4-d｜（保留・既定で実装しない）永続キャッシュ**
  - コスト削減目的の永続キャッシュは規約適合が確認できた場合のみ・**別 GO・法務承認前提**。既定 = 永続化なし。

---

## 6. やらないこと（スコープ外・別 GO）
- 地図の実埋め込み（簡易 map タイルのまま）／経路 API による実徒歩時間（haversine のまま）。
- reviews・rating・editorial summary 等の上位 tier 取得（機能要件外・コスト/規約リスク）。
- Places コンテンツの永続キャッシュ／DB 保存（既定で不可）。
- ranking 反映・「あなたの傾向から」UI 表示（Phase 3 の別 GO 群。P4 と独立）。
- production 有効化（G5）。

---

## 7. ロールバック / 安全性
- 全 flag default OFF・production hard block → **既存挙動はバイト単位で不変**（フラグを消すだけで P4 全消滅）。
- 永続化ゼロ（セッションメモリのみ）→ 残留データ無し・rollback は flag OFF のみで完了。
- fail-open: Place Details / Photo が落ちても従来の abstract タイル・未確認に**自動フォールバック**（UI は壊れない）。
- キー秘匿・privacy-safe payload を既存基盤から継承。

---

## 8. 提案する次アクション（CEO へ）
1. **G1〜G3 の可否**（キー scope / 予算 / キャッシュ・法務方針）をご判断ください。
2. 可なら **P4-0（read-only 調査・課金発生なし）** に着手し、**実コスト試算＋現行規約の確認結果**を提出します。
3. その上で P4-a 以降を **段階 GO** で進めます（実装クローズと本番有効化は分離）。

> 本ドキュメントは提案。**CEO GO まで P4-a 以降には着手しません。**
