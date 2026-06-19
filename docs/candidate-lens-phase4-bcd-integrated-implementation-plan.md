# Candidate Lens — P4-b/c/d 統合実装計画（次の GO で一気に進める粒度）

> ステータス: **計画のみ（未実装）**。本書を見て CEO が **G1 API key scope / G2 budget / G3 attribution・legal / G4 dev-only dogfood** をまとめて判断 → GO 後に b/c/d を一括実装。
> 前提: P4-a 着地済（`dea9c5ad4`・pure 型 + honesty mapper + field mask 定数 + Fake adapter + flags）。本計画は P4-a の契約に**実体（server fetch / photo media / UI）を additive に接続するだけ**。
> 根拠: P4-0 調査（`docs/candidate-lens-phase4-0-places-details-research.md`）＋ 本計画作成時の追加確認（skipHttpRedirect の photoUri は lh3 clean URL・photo name は expire/キャッシュ不可）。

---

## 0. 前提を疑った上での設計確定（なぜこの形か）

検証で潰した 2 つの設計分岐:

1. **写真メタはどう取るか** → 別 call で `id,photos`(IDs-Only=無料) も可だが、P4-d は ②③ で**写真と営業時間を同時に出す**。billing は「mask 中の最上位 SKU」なので、**1 回の `id,photos,regularOpeningHours`（Enterprise）に写真メタを相乗りさせる**のが最小（写真メタ分の追加課金ゼロ）。→ **候補 1 件 = Place Details 1 回**に固定。
   - （却下案）`places.photos` を既存 Text Search に畳み込む案は、共有 search の課金/レスポンス形を変える blast radius が大きく、browse 全候補を eager 取得してしまうため **P4 では採らない**（将来の最適化候補としてのみ記載・§13）。
2. **写真メディアの渡し方** → `skipHttpRedirect=true` の戻り `photoUri` は **lh3 の clean URL（キー非埋め込み）**。→ **サーバ側で media を解決し、`photoUri` 文字列だけをクライアントに返す**。クライアントは `<img src={photoUri}>` で表示（キー露出なし・バイトをサーバに保存しない・規約のキャッシュ制約に最適合）。`name`/`photoUri` は expire しうるので**永続化せず毎セッション再取得**。

確定アーキテクチャ（1 候補あたり）:
```
②/③ で候補が開かれた時のみ（browse では呼ばない・session memo で重複排除）:
  ┌ Place Details  (mask = id,photos,regularOpeningHours / Enterprise)  ……… 1 回
  └ Place Photo media (skipHttpRedirect=true / maxWidthPx 上限)  ……… 写真がある時だけ 0〜1 回
→ サーバが {hours, photo:{…, photoUri}, attributions} を返す → クライアントは photoUri を <img>
```

---

## 1. API 呼び出し / 課金 / 回数（CEO 明記要求への回答）

| 問い | 回答 |
|---|---|
| **API 呼び出しが発生する箇所** | 新 server endpoint `app/api/plan/places/details/route.ts` の中だけ（client は自前 endpoint を叩く・Google を直叩きしない）。Google へ出るのは ①Place Details ②Place Photo media の 2 種。 |
| **課金が発生する箇所** | ①Place Details（Enterprise $20/1,000・無料枠1,000/月）②Place Photo media（$7/1,000・無料枠1,000/月）。`<img>` の lh3 ロードは**非課金**。**flag OFF / production では 1 回も発生しない**。 |
| **1 候補あたり最大何回 API を叩くか** | **最大 2 回**（Place Details 1 ＋ Place Photo 1）。写真が無ければ 1 回。session memo ヒット時は **0 回**。 |
| **Photo media 取得の回数制限** | 候補ごと **最大 1 枚**（先頭 photo のみ・全 `photos[]` を取らない）。`maxWidthPx` 上限（既定 400px 相当）。memo で再取得しない。 |
| **② を開いた時 / ③ 比較時 / browse** | **②detail を開いた時 と ③compare に入った時のみ取得**（両者 placeId 単位で同一 memo を共有 → ②→③ 同一候補は 1 回）。**browse(①) では一切取得しない**（捲るたびの課金を構造的に防止）。 |
| **cache** | **session memory（in-process / client は React state + `EnrichmentSessionMemo` Map）のみ**。**localStorage / DB / Supabase / ファイルへ保存しない**。photo バイトも保存しない（photoUri を都度表示）。 |
| **production** | **hard block**（flag＋`NODE_ENV!=="production"`＋endpoint 側 disabled 応答＋budget guard）。 |

---

## 2. P4-b — server endpoint / actual Place Details fetch

**新規**: `lib/plan/candidateLens/googlePlaceDetailsAdapter.ts`（実 adapter）＋ `app/api/plan/places/details/route.ts`（endpoint）。

- **adapter `GooglePlaceDetailsAdapter implements PlaceDetailsAdapter`**:
  - 既存 `lib/alter-morning/placesApiClient.ts` の流儀を継承（base `https://places.googleapis.com/v1`・`X-Goog-Api-Key`・`X-Goog-FieldMask`・**キー文字列をログ/エラーに出さない**・`!res.ok`→fail-open）。
  - **field mask は `PLACE_DETAILS_FIELD_MASK` 定数のみを送る**（引数で mask を受けない＝P4-a 契約）。エンドポイント `GET /v1/places/{placeId}`。
  - **timeout = `ENRICHMENT_FETCH_POLICY.timeoutMs`(1500ms)** を `AbortController` で適用。**retry = 0**（重複課金回避・fail-open で十分）。
  - **fail-open**: timeout/HTTP/parse/key 不在/budget 超過 → `reject せず` `{fetchStatus:"error"|"skipped", photo:null, hours:null, error:{…}}` を resolve。
  - Google レスポンス → `PlaceDetailsEnrichment` 変換（`regularOpeningHours.openNow/weekdayDescriptions` → `buildEnrichedHours`、`photos[0]` → `EnrichedPhoto`、`authorAttributions` 保持）。Wi-Fi/電源/静か/雰囲気は**変換しない**（型に無い）。
- **endpoint `route.ts`**:
  - **POST**・body は `{ placeId: string }` のみ（placeId 形式 validation・他フィールド受け付けない）。
  - **gate**: `isPlaceDetailsFetchEnabled()` false（flag OFF or production）→ Google を叩かず `{fetchStatus:"skipped"}` を 200 返す（fail-open）。
  - `isPlacesApiAvailable()`（キー未設定）false → 同上 skipped。
  - **rate / budget guard**（§8）を通してから adapter 呼び出し。
  - レスポンスは enrichment（photoUri は P4-c で同梱）。**キーは応答に含めない**。
- **API key scope 前提（G1）**: キーに **Place Details (New)** を有効化済みであること（Cloud Console・CEO）。未有効なら endpoint は HTTP error → fail-open で abstract に落ちる（壊れない）。
- **production hard block**: endpoint・adapter とも production で発火しない（flag gate）。

## 3. P4-c — Photo media URL 取得

**型 additive**（P4-a 契約を壊さず拡張）: `EnrichedPhoto` に `readonly photoUri: string | null` を追加（既定 null）。`EnrichmentResolution` に `readonly photoMediaUrl: string | null` を追加。

- **取得**（server 側・`route.ts` 内、Details 成功かつ photo ありの時のみ）:
  - `GET https://places.googleapis.com/v1/{photo.name}/media?maxWidthPx={W}&skipHttpRedirect=true`（`X-Goog-Api-Key`）。
  - **`skipHttpRedirect=true`** で `{name, photoUri}` を受け、`photoUri`（lh3 clean URL）だけを enrichment に載せる。**バイトをサーバに保持しない**。
  - **`maxWidthPx` 上限**（定数 `PHOTO_MAX_WIDTH_PX = 400` 等・1〜4800 範囲）。**先頭 1 枚のみ**。
  - **authorAttributions 保持**: Details の `photos[0].authorAttributions` をそのまま `EnrichedPhoto.authorAttributions` に運ぶ（表示義務・§4）。
  - **fail-open**: media 失敗 → `photoUri=null` のまま（写真は abstract tile に落ちる・営業時間は別途生きる）。
- **回数**: 候補ごと 1 回・memo で再取得なし。
- **no persistent cache**: photoUri/name とも**保存しない**（expire しうる）。`<img>` がそのセッションで表示するだけ。
- **abstract fallback**: photoUri 無し（写真なし or media 失敗 or flag OFF）→ 既存 `PlaceTile`(abstract)。

## 4. P4-d — ②③ UI 配線（dev dogfood）

**改修**: `app/(culcept)/plan/components/CandidateLensPanel.tsx`（②③ のみ）＋ client 取得 hook `usePlaceDetailsEnrichment(placeId)`。

- **取得 hook**（client）:
  - `isPlaceDetailsUiEnabled() && isPlaceDetailsFetchEnabled()` の時だけ作動。`EnrichmentSessionMemo`（React ref Map）を見て、無ければ POST `/api/plan/places/details` → 結果を memo。**②detail を開いた時・③compare に入った時に発火、browse では発火しない**。
  - 戻り `PlaceDetailsEnrichment | null` → `resolveEnrichment()` → `EnrichmentResolution`。
- **② detail**（現 `CandidateLensPanel.tsx` 内 PlaceTile 226 行付近）:
  - `isPlaceDetailsUiEnabled() && resolution.photoDisplayable && resolution.photoMediaUrl` → 実写真 `<img src={photoMediaUrl}>`（+ **author attribution caption**）。else → 既存 `PlaceTile`(abstract)。
  - `resolution.hoursConfirmed` → 営業時間を**確認済み行**として表示（openState バッジ: 営業中/閉店中/不明 + 必要なら weekday 抜粋）。else → 表示しない（従来通り）。
- **③ compare**（PlaceTile 296/304 行・UNCONFIRMED_ROWS 341 行付近）:
  - 2 候補メディアカードも同様（実写真 or abstract・caption）。
  - `UNCONFIRMED_ROWS` の **🕐営業時間** は、`hoursConfirmed` の候補について**未確認群から確認済み行へ移す**（openState）。**雰囲気/Wi-Fi/電源/静か は未確認のまま不動**。
- **Powered by Google / author attribution**:
  - 写真表示箇所すべてに **author attribution**（撮影者名 + プロフィール link）を caption 表示（`photoAttributions` 非空時）。
  - `showGoogleAttribution`（写真 or 営業時間を実表示）時、②/③ フッターに **"Powered by Google"**（Google Maps ロゴ ≥16dp・狭ければ "Google Maps" テキスト・改変なし）を **1 箇所**。
- **degradation ladder（honesty）**: 写真解決成功→実写真 / 写真 media 失敗→abstract（壊れ画像にしない）/ 営業時間あり→確認済み / なし or 失敗→未確認 / Wi-Fi 等→常に未確認。
- **Wi-Fi/電源/静か/雰囲気維持**: P4-d でも `UNCONFIRMED_ROWS`/`UNCONFIRMED_CHIPS` のこれらは**実値化しない**（enrichment に項目が無い）。
- **dev dogfood smoke**（G4）: flag を dev override ON → 実機（mobile viewport）で ①捲り→②写真/営業時間→③比較表 を確認 → revert（既存 smoke 手順に準拠・production には出さない）。

---

## 5. field mask 逸脱しない保証
- 送信 mask は **`PLACE_DETAILS_FIELD_MASK = "id,photos,regularOpeningHours"` 定数のみ**（adapter は mask 引数を持たない）。
- test: adapter の outgoing `X-Goog-FieldMask` ヘッダ === 定数（fetch mock で検証）。
- test: `FORBIDDEN_FIELDS`（takeout/serves*/reviews/rating/priceLevel/accessibilityOptions/…）∩ mask = ∅（P4-a 済を再アサート）。
- Photo media は field mask を使わない（resource name + maxWidthPx のみ）→ +Atmosphere 混入の余地なし。

## 6. cache / no-persist
- 取得結果は **`EnrichmentSessionMemo`(Map・client ref) ＋ React state** のみ。タブを閉じれば消滅。
- **localStorage / DB / migration / Supabase write 一切なし**。photo バイト/name/photoUri を保存しない。
- placeId は候補が既に保持（Google 規約上 placeId のみ無期限保存可だが、P4 は新規保存もしない）。

## 7. flags / production hard block / flag OFF 完全不変
- **2 flag**（P4-a 既存・default OFF・production hard block）: `PLACE_DETAILS_ENRICH_FETCH_ENABLED`（fetch）/ `PLACE_DETAILS_ENRICH_UI_ENABLED`（UI）。
- **flag OFF 完全不変**: UI は `isPlaceDetailsUiEnabled()` が false の時 enrichment を**一切読まず**既存 `PlaceTile`/`UNCONFIRMED_ROWS` パスへ（早期分岐）→ DOM バイト不変。hook は両 flag OFF で fetch しない。endpoint は flag OFF で skipped。
- production: 全経路で発火しない（flag＋NODE_ENV＋endpoint disabled＋budget guard の四重）。

## 8. rate / budget guard
- **app 側（best-effort・新規 `enrichmentBudgetGuard.ts`・in-memory）**: per-process カウンタ（分/日/月）＋ per-session 上限。閾値超過 → adapter を呼ばず `{fetchStatus:"skipped"}`（fail-open）。既定は保守的（例: 60/min・500/day・月 Enterprise 無料枠 1,000 を超えない目安）。
  - ★限界（正直に明記）: serverless の複数インスタンス間ではカウンタが分散し**厳密な上限保証にならない**。
- **GCP 側（authoritative・G1/G2・Cloud Console = CEO 操作）**: ①API キーを Place Details/Photo の 2 種に**制限**＋referrer/IP 制限 ②各 API に **per-minute / per-day quota** 設定 ③**Billing budget + アラート**。← これが本当の安全弁。app 側は二次防御。
- 既存 search route のレート制御パターンがあれば踏襲。

## 9. security
- API キーは **server endpoint 内のみ**（`process.env.GOOGLE_MAPS_API_KEY`）。client・レスポンス・ログ・エラーに**出さない**（既存 placesApiClient 方針継承）。
- photo は **server で skipHttpRedirect 解決 → clean photoUri のみ client へ**（キー露出ゼロ）。
- endpoint は placeId のみ受理・形式 validation・他パラメータ拒否。privacy: 予定タイトル/本文/座標を Google に送らない（placeId だけ）。

## 10. tests / smoke
- **unit（fetch mock・実 API 不叩き）**:
  - adapter: outgoing field mask === 定数 / timeout 発火で fail-open / HTTP500 で fail-open / Google JSON → enrichment 変換（hours openNow→openState・photos→EnrichedPhoto・attributions 保持）/ 写真なし→photo=null / budget 超過→skipped。
  - photo media: skipHttpRedirect レスポンス→photoUri 抽出 / media 失敗→photoUri=null（写真 fallback・hours 生存）/ maxWidthPx 上限 / 1 枚のみ。
  - endpoint: flag OFF→skipped / key 不在→skipped / placeId validation / キーを応答に含めない。
  - guard: 分日月上限・per-session 上限・超過時 skipped。
  - **honesty 再アサート**: Wi-Fi/電源/静か/雰囲気は実値化されない / 営業時間 null→未確認 / openNow null→unknown。
  - **flag OFF 不変**: UI flag OFF で ②③ DOM が現行と一致（構造 test）。
- **smoke（G4・dev-only）**: flag override ON → 実機 mobile で ②写真+営業時間・③比較表の営業時間昇格・attribution/Powered by Google 表示・写真欠落時 abstract fallback を確認 → 全 override revert。**production smoke はしない**。

## 11. rollback
- **flag OFF**（既定）で全機能消滅・既存挙動バイト不変。
- 物理 rollback: 新規 `googlePlaceDetailsAdapter.ts` / `route.ts` / `usePlaceDetailsEnrichment` / `enrichmentBudgetGuard.ts` 削除＋`CandidateLensPanel.tsx` の P4-d 差分 revert（gate で囲うため revert は局所）。
- 永続物ゼロ（DB/localStorage なし）→ 残留データなし。
- 課金 rollback: flag OFF で即時に Google 呼び出し停止。GCP 側 quota=0 で完全遮断可（CEO）。

## 12. GO 条件（CEO 判断 4 点）
| ゲート | 対象 | 本計画での担保 |
|---|---|---|
| **G1 API key scope** | キーに Place Details/Photo 有効化＋制限 | endpoint は有効化前提・未有効なら fail-open。キー制限は Cloud Console（CEO） |
| **G2 budget** | 課金上限 | 無料枠内設計＋app guard＋**GCP budget/quota が本丸**（CEO） |
| **G3 attribution / legal** | 写真 attribution・Powered by Google・キャッシュ規約 | §4 表示・§6 no-persist・photoUri 都度表示で適合（法務確認） |
| **G4 dev-only dogfood** | 本番に出さず dogfood | flag dev-only・production hard block・smoke は dev のみ |

## 13. 実装予定ファイル一覧（GO 後）
- 新規: `lib/plan/candidateLens/googlePlaceDetailsAdapter.ts`（実 adapter）
- 新規: `lib/plan/candidateLens/enrichmentBudgetGuard.ts`（rate/budget guard）
- 新規: `app/api/plan/places/details/route.ts`（server endpoint）
- 新規: `app/(culcept)/plan/components/usePlaceDetailsEnrichment.ts`（client hook・memo）
- 改修: `lib/plan/candidateLens/placeDetailsEnrichment.ts`（`EnrichedPhoto.photoUri` / `EnrichmentResolution.photoMediaUrl` を additive 追加・定数 `PHOTO_MAX_WIDTH_PX`）
- 改修: `app/(culcept)/plan/components/CandidateLensPanel.tsx`（②③ を flag gate 下で写真/営業時間/attribution 表示・OFF で不変）
- 新規/追記: tests（adapter / endpoint / guard / honesty / flag-off 不変）
- （将来最適化・P4 外）: `SEARCH_FIELD_MASK` に `places.photos` 畳み込み案（browse 写真の $0 化）は別途検討。

---

> 本書は **P4-b/c/d 統合計画の提出のみ**。実装は **G1〜G4 をまとめた CEO GO 後**に一括着手します。**ここで停止します。**
