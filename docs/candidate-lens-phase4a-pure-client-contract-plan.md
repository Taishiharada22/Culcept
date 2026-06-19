# Candidate Lens — P4-a: pure / client-contract 計画（実 API を叩かない契約層のみ）

> ステータス: **計画のみ（未実装・実装 GO 未発行）**。本書は CEO 確認用。**承認後に着手**。
> スコープ厳守: P4-a は **pure 型 + honesty mapper + field mask 定数 + fake adapter + flags + tests** に限定。
> **実 API 呼び出し・network・key/env/GCP 変更・課金・server endpoint・UI 実装・DB・永続キャッシュ・production — 全て P4-a 範囲外**。
> 前提調査: `docs/candidate-lens-phase4-0-places-details-research.md`（公式仕様/SKU/料金/規約確認済み）。

---

## 0. 設計方針（Phase 1 モデルを壊さない）
- 既存 `lib/plan/candidateLens/placeAttributeModel.ts`（`PlaceAttribute` / `EvidenceType="fact"|"computed"|"weak"|"unconfirmed"`）は**不変**。
- P4-a は **別モジュールの enrichment 型＋pure mapper** を additive に足し、view 層で**合流させる契約だけ**定義する（実合流は P4-d）。
- 新規ファイル（P4-a で作るのはこれだけ・全て pure / network なし）:
  - `lib/plan/candidateLens/placeDetailsEnrichment.ts` … 型 + field mask 定数 + honesty mapper + flags
  - `lib/plan/candidateLens/placeDetailsAdapter.ts` … adapter **interface** + **FakePlaceDetailsAdapter**（fixtures のみ）
  - `tests/unit/plan/candidateLens/placeDetailsEnrichment.test.ts`
- 実 Google adapter / server fetch / photo media / UI 配線 は **P4-b 以降**（§8）。

---

## 1. 追加する型（`placeDetailsEnrichment.ts`・pure）

```ts
/** fetch の状態（P4-a では fake のみが返す。idle=未試行 / skipped=flag OFF や非対象）。 */
export type EnrichmentFetchStatus = "idle" | "loading" | "ok" | "error" | "skipped";

/** fail-open 用エラー（throw しない・UI は abstract/未確認 に戻す）。 */
export interface EnrichmentError {
  readonly kind: "timeout" | "http" | "parse" | "unavailable" | "disabled";
  readonly message: string; // ★API キー文字列・PII を含めない（既存方針継承）
}

/** 写真 1 枚の attribution（Google D7 必須・値があれば表示義務）。 */
export interface PhotoAuthorAttribution {
  readonly displayName: string | null;
  readonly uri: string | null;        // 撮影者プロフィール
  readonly photoUri: string | null;   // 撮影者アイコン
}

/** 写真メタ（★メタのみ。media URL/バイトは P4-a に持たない＝P4-c で構築）。 */
export interface EnrichedPhoto {
  readonly name: string;                // 形式: places/{PLACE_ID}/photos/{REF}
  readonly widthPx: number | null;
  readonly heightPx: number | null;
  readonly authorAttributions: readonly PhotoAuthorAttribution[]; // 空配列可
}

/** 営業状態（honesty: 不明は推測せず unknown）。 */
export type OpenStateHonest = "open" | "closed" | "unknown";

/** 営業時間（Google `regularOpeningHours` 由来のみ）。 */
export interface EnrichedHours {
  readonly openNow: boolean | null;                 // openNow が無ければ null
  readonly weekdayDescriptions: readonly string[];  // 例「月曜日: 9時00分～18時00分」
  readonly openState: OpenStateHonest;              // openNow→open/closed、無→unknown
}

/**
 * ★Place Details の付加情報（Google 由来のみ・推定と分離）。
 *   - provenance を必ず "google_places" 固定 → 「Google 由来」を型レベルで明示（推定 computed/weak と混ざらない）。
 *   - ★wifi/power/quiet/crowd/ambience/social フィールドは**型に存在しない**（実値化を構造的に不可能化）。
 */
export interface PlaceDetailsEnrichment {
  readonly placeId: string;
  readonly provenance: "google_places";          // 由来明示（リテラル固定）
  readonly photo: EnrichedPhoto | null;          // null = 写真なし → abstract tile fallback
  readonly hours: EnrichedHours | null;          // null = 営業時間なし → 未確認のまま
  readonly fetchStatus: EnrichmentFetchStatus;
  readonly error: EnrichmentError | null;        // fail-open（throw しない）
  readonly fetchedAtMs: number | null;           // ★session-only・永続化しない（記録専用ではない）
}

/** UI に渡す解決済み表示意図（mapper の出力・§2）。 */
export interface EnrichmentResolution {
  readonly photoDisplayable: boolean;            // false → PlaceTile(abstract) を使う
  readonly photoAttributions: readonly PhotoAuthorAttribution[]; // 表示必須（空可）
  readonly hoursConfirmed: boolean;              // true → 確認済み行 / false → UNCONFIRMED_ROWS
  readonly openState: OpenStateHonest;
  readonly hoursLines: readonly string[];        // weekdayDescriptions（confirmed 時のみ非空）
  readonly showGoogleAttribution: boolean;       // photo or hours のどれか表示時 true（Powered by Google）
}
```

---

## 2. honesty mapping（pure・`resolveEnrichment(enrichment | null): EnrichmentResolution`）

| 入力状態 | photo | 営業時間 | mapper 出力 |
|---|---|---|---|
| enrichment=null / fetchStatus≠"ok" | — | — | 全 fallback（photoDisplayable=false / hoursConfirmed=false / showGoogleAttribution=false）＝**現状と同一** |
| photo あり（name 非空） | 実写真 | — | photoDisplayable=**true**・photoAttributions=enrichment.photo.authorAttributions（**空でも配列を必ず運ぶ**） |
| photo なし（photo=null） | abstract | — | photoDisplayable=**false** → `PlaceTile` 継続 |
| hours あり・openNow=true | — | 営業中 | hoursConfirmed=true・openState="open"・hoursLines=weekdayDescriptions |
| hours あり・openNow=false | — | 閉店中 | hoursConfirmed=true・openState="closed" |
| hours あり・openNow=null（不明） | — | 不明 | hoursConfirmed=true・openState=**"unknown"**（曜日表示はするが現在開閉は推測しない） |
| hours なし（hours=null） | — | 未確認 | hoursConfirmed=**false** → `UNCONFIRMED_ROWS` の 🕐営業時間 のまま |
| **wifi / power / quiet / crowd / 雰囲気 / 会話** | — | — | **常に未確認据置**（mapper は触らない・enrichment に項目自体が無い） |
| showGoogleAttribution | — | — | photo or hours のいずれか表示時のみ true |

- ★**Google 由来 vs 推定の分離**: enrichment は `provenance="google_places"` 固定。Aneurasync 推定（徒歩=computed / 相性=computed / 会話=weak）には**一切混ざらない**。営業時間/写真は「Google 由来の確定」として既存 `fact` 系の見せ方、徒歩等は従来どおり「目安」表記。
- ★honesty の核: **取れたものだけ確認済みに昇格、取れないものは据置**。mapper は enrichment に無いキー（Wi-Fi/電源/静か/雰囲気）を**実値化しない**（型に無い＝不可能）。
- mapper は **pure**（Date/network 不使用）。openState は openNow からのみ導出（曜日記述から開閉を推測しない）。

---

## 3. field mask 固定（`placeDetailsEnrichment.ts`・定数 + ガード）

```ts
/** ★P4 の Details field mask は この定数から逸脱しない（案B＝Enterprise 課金・+Atmosphere を含まない）。 */
export const PLACE_DETAILS_FIELD_MASK = "id,photos,regularOpeningHours" as const;
export const PLACE_DETAILS_FIELD_LIST: readonly string[] = Object.freeze(["id", "photos", "regularOpeningHours"]);

/** ★混入したら課金が跳ねる/規約リスクの「禁止フィールド」（test が交差ゼロを保証）。 */
export const FORBIDDEN_FIELDS: readonly string[] = Object.freeze([
  // Enterprise + Atmosphere（混入で全 call $25/1000 に跳ねる）
  "takeout","delivery","dineIn","reservable","servesCoffee","servesBreakfast",
  "goodForChildren","goodForGroups","restroom","outdoorSeating","reviews",
  // 取得しない上位/別 tier
  "rating","userRatingCount","priceLevel","accessibilityOptions","editorialSummary",
]);
```
- field mask は **文字列リテラル定数 1 つ**に集約（散在させない）。adapter はこの定数を読むだけ（引数で任意 mask を渡せない設計）。
- test（§7）が「定数の完全一致」「禁止フィールド交差ゼロ」を機械保証。

---

## 4. API client contract（P4-a＝実 API を呼ばない）

```ts
// placeDetailsAdapter.ts
export interface PlaceDetailsAdapter {
  /** placeId → enrichment。★実装は P4-b。P4-a は Fake のみ。fail-open（reject しない・error を載せて resolve）。 */
  fetchDetails(placeId: string, opts?: { signal?: AbortSignal }): Promise<PlaceDetailsEnrichment>;
}

/** ★P4-a の唯一の実体: fixtures を返す（network 一切なし）。 */
export class FakePlaceDetailsAdapter implements PlaceDetailsAdapter { /* canned cases */ }
```
- **実 API は呼ばない**: P4-a は `FakePlaceDetailsAdapter` のみ提供。実 `GooglePlaceDetailsAdapter` は **P4-b** で別実装（P4-a には置かないか、`throw "not wired (P4-b)"` の stub に留める）。
- **fail-open**: adapter は **reject しない**。失敗時も `{fetchStatus:"error", photo:null, hours:null, error:{...}}` を **resolve** → 呼び出し側は常に abstract/未確認 に戻せる。
- **timeout/retry 方針（契約として明記・実発火は P4-b）**:
  - timeout = **1500ms**（HDM P4-6.5 canary と整合）。`AbortController` でキャンセル。
  - retry = **0（リトライしない）**。理由: fail-open で十分・**重複課金を避ける**・UX は abstract fallback で劣化しない。
  - 同時実行は ②③ 起点のみ（①browse では発火しない＝P4-d 配線で保証）。
- **no persistent cache**: 重複排除は **session 内 `Map<placeId, PlaceDetailsEnrichment>` memo のみ**（タブを閉じれば消滅）。localStorage/DB/Supabase/ファイルへ**書かない**。P4-a は memo の**型契約だけ**定義（実 fetch が無いので動作はしない）。
- Fake fixtures（test 用 6 ケース）:
  1. `withPhotoAndHours`（photo＋authorAttributions＋openNow=true）
  2. `photoOnly`（hours=null）
  3. `hoursOnly`（photo=null）
  4. `hoursOpenNowNull`（openState=unknown 検証）
  5. `empty`（photo=null・hours=null＝両 fallback）
  6. `errorTimeout`（fetchStatus="error"・kind="timeout"）

---

## 5. UI contract（②③・**契約のみ**・実装は P4-d）

> P4-a では「どこに何を渡すか」の prop 契約だけ定義。実 JSX 変更は P4-d。

- **② 詳細**:
  - メディア: `resolution.photoDisplayable` が true → 実写真（media URL は P4-c）／false → 既存 `PlaceTile`(abstract)。
  - 写真の **author attribution caption** を写真直下に表示（`photoAttributions` 非空時）。
  - 営業時間: `hoursConfirmed` true → 確認済み行（openState バッジ＋必要なら weekday 抜粋）／false → 据置。
- **③ 比較**:
  - 2 候補のメディアカードも同様（photoDisplayable で実写真 or abstract、attribution caption 付き）。
  - `UNCONFIRMED_ROWS` の 🕐**営業時間**は、`hoursConfirmed` の時だけ **未確認群から確認済み行へ移す**（openState/曜日）。それ以外（雰囲気/Wi-Fi/電源/静か）は**据置**。
- **attribution 配置**:
  - 写真: `authorAttributions`（撮影者名＋リンク）を**写真を表示する全箇所**に併記（D7 必須）。
  - **"Powered by Google"**: `showGoogleAttribution` true（写真 or 営業時間を実表示）時、Lens Overlay の ②/③ フッターに **1 箇所**表示（Google Maps ロゴ ≥16dp、狭ければ "Google Maps" テキスト＝Roboto400・改変なし）。enrichment 非表示時は出さない。
- **fallback**:
  - 写真未取得（null/error/flag OFF）→ **abstract `PlaceTile` に戻す**（既存と同一）。
  - 営業時間未取得 → **未確認のまま**。
  - UI flag OFF → enrichment を一切読まず**現状の view と完全一致**。

---

## 6. flags（`placeDetailsEnrichment.ts`・UI と fetch を分離）

```ts
// ★fetch flag: 実 network 発火を許可するか（P4-b で実 adapter が参照。P4-a は未使用）。
export const PLACE_DETAILS_ENRICH_FETCH_ENABLED = false;
export function isPlaceDetailsFetchEnabled(): boolean {
  return PLACE_DETAILS_ENRICH_FETCH_ENABLED && process.env.NODE_ENV !== "production"; // production hard block
}
// ★UI flag: ②③ で enrichment を描画するか（P4-d で参照）。fetch と独立。
export const PLACE_DETAILS_ENRICH_UI_ENABLED = false;
export function isPlaceDetailsUiEnabled(): boolean {
  return PLACE_DETAILS_ENRICH_UI_ENABLED && process.env.NODE_ENV !== "production";
}
```
- **UI flag と fetch flag を分ける**（CEO 問いへの回答＝**分ける**）。理由: ①shadow fetch（コスト観測のみ・UI 不変）／②Fake adapter で UI dogfood（課金ゼロ）を独立に切れる。P3-b/P3-c の obs/apply 分離と同思想。
- 両方 **default OFF・production hard block**。**P4-a では fetch は一切起きない**（実 adapter 未配線・Fake のみ）。
- 既存 `PLACE_CANDIDATE_LENS_UI_ENABLED`（候補レンズ UI 全体）は**不変**。P4 UI は「候補レンズ ON」かつ「enrich UI ON」の二重ゲート下でのみ作動。

---

## 7. tests（`placeDetailsEnrichment.test.ts`・全 pure・network なし）

1. **field mask 固定**: `PLACE_DETAILS_FIELD_MASK === "id,photos,regularOpeningHours"`・`PLACE_DETAILS_FIELD_LIST` 一致。
2. **+Atmosphere 混入防止**: `FORBIDDEN_FIELDS` ∩ `PLACE_DETAILS_FIELD_LIST` = ∅（takeout/dineIn/serves\*/goodFor\*/restroom/outdoorSeating/reviews を含まない）。
3. **reviews/rating/attributes 混入防止**: rating/userRatingCount/priceLevel/accessibilityOptions/editorialSummary を含まない。
4. **honesty: 写真あり/なし**: photo 非 null → photoDisplayable=true・attributions 運搬／photo=null → false（abstract fallback）。
5. **honesty: 営業時間あり/なし**: hours 非 null → hoursConfirmed=true・openState 正しい／hours=null → false（未確認据置）。
6. **closed/open/unknown**: openNow true→"open" / false→"closed" / null→**"unknown"**（推測しない）。
7. **attribution 必須**: photo 表示時 `photoAttributions` を必ず出力（空配列でもキー存在）。`showGoogleAttribution` は写真 or 営業時間表示時 true、未表示時 false。
8. **fail-open**: `errorTimeout` fixture → mapper は throw せず全 fallback（photoDisplayable=false/hoursConfirmed=false/showGoogleAttribution=false）。
9. **Wi-Fi/電源/静か/雰囲気を実値化しない**: どの fixture でも mapper 出力に wifi/power/quiet/crowd/ambience 相当の値が**現れない**（型に無いことの保証 + 既存 attrs の該当キーが null のまま）。
10. **abstract fallback 等価**: enrichment=null の resolution は「現状（P4 前）の表示意図」と等価。
11. **既存 UI flag OFF 不変**: `PLACE_CANDIDATE_LENS_UI_ENABLED`=false で既存パネル `<ul>` 不変（再アサート）。
12. **flags default OFF + production hard block**: 新 2 flag が false・production で常に false。
13. **fake adapter**: 6 fixtures が型に適合し、`FakePlaceDetailsAdapter.fetchDetails` が reject しない（fail-open 契約）。

---

## 8. P4-b 以降の分割（各 GO 分離・段階）

| Phase | 内容 | 課金/規約ゲート | 状態 |
|---|---|---|---|
| **P4-a** | pure 型 + honesty mapper + field mask 定数 + Fake adapter + flags + tests（**network/UI なし**） | なし（実 API 不叩き） | ←本計画 |
| **P4-b** | **server endpoint / 実 Details fetch**: `GooglePlaceDetailsAdapter`（既存 `placesApiClient` 流儀・`PLACE_DETAILS_FIELD_MASK`・rate limit・キー秘匿・timeout1500/retry0・fail-open）。server route or action。**CI は mock**。 | ★**G1 キー scope・G2 予算**（実課金発生点） | 別 GO |
| **P4-c** | **Photo media URL**: `buildPhotoMediaUrl`（`skipHttpRedirect=true`→photoUri・maxWidthPx 上限・attribution 同梱）。バイト非保存。 | G1/G2（Place Photos SKU） | 別 GO |
| **P4-d** | **UI dogfood 配線**: ②③ に実写真/営業時間/attribution/Powered by Google を描画・abstract/未確認 fallback・②③ 限定遅延 fetch・session memo・UI flag ON（dev-only）・smoke。 | ★**G3 キャッシュ/法務・G4 attribution** | 別 GO |
| **P4-e** | **production 判断**: 法務/予算 sign-off 後に flag を production 有効化。 | ★**G5 本番反映** | 別 GO |

> ゲート G1〜G5 は `docs/candidate-lens-phase4-places-details-plan.md` §2 を参照。

---

## 9. リスクと rollback（P4-a 範囲）
- P4-a は **network/UI/DB ゼロ**＝既存挙動はバイト単位で不変。Fake adapter は test だけが使用。
- 新 2 flag default OFF・production hard block → 万一参照されても production で無効。
- field mask 定数 + 禁止フィールド test で「+Atmosphere/reviews 混入による課金跳ね」を**コード時点で封じる**（実 fetch は P4-b だが、定数は P4-a で固定）。
- **Rollback**: 新 3 ファイルを削除すれば完全消滅（additive・既存 import なし）。

---

## 10. CEO へ
- 本計画は **P4-a（pure/client-contract・実 API なし）の提出のみ**。
- 含むもの: ①型 ②honesty mapping ③field mask 固定 ④adapter 契約（Fake のみ）⑤UI 契約 ⑥flags（UI/fetch 分離）⑦tests ⑧P4-b〜e 分割。
- **実装は GO 後に着手**します。P4-b（実 fetch）以降は課金/規約ゲート（G1〜G5）を都度仰ぎます。

> 本書は計画。**CEO の P4-a 実装 GO まで着手しません。**
