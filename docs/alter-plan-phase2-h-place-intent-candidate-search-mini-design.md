# Alter Plan Phase 2-H — Place Intent Candidate Search / 予定意図ベース場所候補検索 Mini Design

**Status**: docs only (local 起票、未 commit)
**Date**: 2026-05-21
**Branch (予定)**: `feat/alter-plan-phase2-h-place-intent-candidate-search` (= 実装着手時に派生、CEO 承認後)
**Pre-requisite**: Phase 2-D (cda09ef1) / Phase 2-E (677b7b6a) / Phase 2-F (b4ab331e) 凍結済 / Phase 2-G (38292335) docs 凍結
**Author**: Claude × CEO (Aneurasync) — CEO 指摘 + GPT 補正 + 自立推論 + actual code audit

---

## 0. 一行 summary

> Plan の場所候補検索を 「場所 field 単体」 から 「**予定名 (title) + 場所 (locationText) + bias context**」 の **3 軸 query** に進化させる。
> 「ショッピング」 + 「新宿」 を入力した user に対し、**新宿周辺のショッピング候補** を提示する。Plan は単なる「場所入力 UI」 ではなく **「予定の意味から最適な場所候補を出す OS」** に近づく。

---

## 1. 背景と問い (= CEO 指摘の核心)

### 1.1 現状 (= Phase 2-D の Place Picker)

`PlaceCandidatesPanel` の API call は:
```
body = { query: form.locationText, bias?: { lat, lng, radiusMeters } }
```

→ **場所 field 単体** が `textQuery` として Google Places API に渡る。  
→ form.title (= 予定名) は **一切使われない**。

### 1.2 CEO 指摘の問題

> 予定名「**ショッピング**」 + 場所「**新宿**」 を入力 → 「新宿」 だけが検索されて、ショッピング施設候補が出てこない。

正しい体験:
> 予定 = ショッピング、場所 = 新宿 → **新宿周辺のショッピング施設候補** を提示。

### 1.3 本質的問い

> ユーザーが anchor に書く 「予定名」 と 「場所」 は、それぞれ独立した文字列ではなく、**1 つの intent (意図) を 2 軸で表現** している。
> Plan の Place Picker は、この 2 軸を組み合わせて「ユーザーが行こうとしている場所」 を推測すべき。

### 1.4 Aneurasync 思想との整合

- 「第二の自己」 = Alter が user の意図を understand する
- 「観測の入口」 = user 自身に「自分はこういう行動 pattern」 と気付かせる
- 強制せず提案 (= 既存の skip / close / canonical 維持)

Phase 2-D で「場所文字列を解決」 した。Phase 2-H で「**予定の意図を解決**」 する。

### 1.5 Phase 2-H が解かない問題 (= 別 Phase / 別 PR 預け)

- ❌ ML / LLM ベースの intent 推論 (= regex / keyword based に限定、dep / env なし)
- ❌ Personal history learning (= 過去 anchor から user 好みを学習)
- ❌ Time-aware suggestion (= 「ランチ」 を昼 vs 夜で挙動変える)
- ❌ Multi-intent query (= 「会議 + ランチ」 を分解)
- ❌ Category Icon System (= **Phase 2-I に独立分離**、表示層が別責務)
- ❌ Lived Geography integration (= Phase 2-G 完了後に検討、§19)
- ❌ LocationCategory enum 拡張 (= migration、既存 8 値を維持)
- ❌ migration / env / dependency
- ❌ MorningMapView / CoAlter / talk / Mirror / W1-6 / DraftPlan
- ❌ GitHub push / PR / remote ops

---

## 2. 設計思想

### 2.1 「Place Intent Contract / 予定意図契約」

Phase 2-F で「Place Identity Contract」 (= 場所アイデンティティ表示契約) を確立。  
Phase 2-H で「**Place Intent Contract**」 (= 予定意図解釈契約) を確立する。

```
ユーザー入力:
  form.title       = "ショッピング"  ← intent (= 何をするか)
  form.locationText = "新宿"        ← location context (= どこで / どのエリアで)
  baseline         = 千葉県 成田市   ← user の生活拠点 bias

System が解釈:
  intent = "shopping"
  location_context = "新宿" (= エリア指定、具体施設名ではない)
  → Places API への textQuery: "新宿 ショッピング" (= combine)
  → biasing: 新宿座標があれば bias = 新宿、なければ baseline
  → 候補: 新宿周辺のショッピング施設 3-5 件
```

### 2.2 4 階層 Intent Type 判定 (= CEO + GPT 4 段階)

```
Type 1: 明確な施設名/店舗名 (= explicit_place)
  例: "スターバックス 新宿南口"、"渋谷歯科クリニック"
  → query をそのまま検索 (= 既存 Phase 2-D 挙動)

Type 2: 行為 + エリア名 (= intent_with_area)
  例: title="ショッピング" + locationText="新宿"
  → query = "ショッピング 新宿" (combine) で検索

Type 3: 行為 + 場所空 (= intent_only)
  例: title="カフェ作業" + locationText=""
  → query = "カフェ" + bias = baseline で検索

Type 4: 両方曖昧 (= ambiguous)
  例: title="休み" + locationText=""
  → 候補検索しない (= panel 非表示、ambiguous は強制せず)
```

### 2.3 Category Inference の役割 (= 補助のみ、強制しない)

- title から LocationCategory を **推定** (= 既存 8 値の範囲内、新規 enum 追加しない)
- 結果は AnchorFormFields の **`locationCategory` field の placeholder / suggestion** として表示
- user が select で override 可能 (= 自動確定しない)
- Places API query には **直接組み込まない** (= 既存 LocationCategory は分類ラベルであって検索 keyword ではない、別役割)

### 2.4 Aneurasync 思想 (= 強制せず、気付かせる)

- intent type 判定の結果は **panel header に subtle 表示** (= 透明性)
- 例: 「新宿周辺で 『ショッピング』 候補を探しています」
- user が intent classification を覆したい場合は明示的入力で可 (= ヒントのみ、強制しない)

### 2.5 不変原則 (= Phase 2-D/E/F 凍結部分との整合)

- Phase 2-D の canonical text 保存形式不変
- Phase 2-D C3 場所未確定 indicator 不変
- Phase 2-E 時刻重なり indicator 不変
- Phase 2-F Place Identity Contract (= display layer) 不変
- Phase 2-G Lived Geography Confidence Fallback (= docs 凍結、実装は別 Phase) 不変
- LocationCategory enum 不変 (= 8 値)
- Places API privacy-safe outbound 維持 (= title も privacy-safe 送信)

---

## 3. Actual Code Audit 結果

| 項目 | 確認結果 |
|------|---------|
| `places/search/route.ts` input | `{ query, bias? }` のみ受理、`allowedKeys = ["query", "bias"]` で extra 400 |
| Places API outbound | `textQuery` + `locationBias` のみ (privacy-safe、line 209) |
| 既存 query max | 300 chars (line 177、`MAX_QUERY_LENGTH`) |
| `PlaceCandidatesPanel` props | `query: string`, `biasContext: BiasContext`, etc. (line 67) |
| `PlaceCandidatesPanel` body 構築 | `{ query, bias? }` のみ (line 165) |
| `AnchorFormFields` form state | `form.title`, `form.locationText`, `form.locationCategory` 存在 |
| `AnchorFormFields` → `PlaceCandidatesPanel` 渡し | `query={form.locationText}` のみ、title は未渡し |
| `LocationCategory` 実値 | 8 値: home / office / school / cafe / outdoor / public / transit / unknown |
| `LOCATION_CATEGORY_LABEL` (anchor-detail-format.ts) | 家 / 職場 / 学校 / カフェ / 屋外 / 公共 / 移動 / 未分類 |

→ Phase 2-H では:
- input 拡張: `allowedKeys = ["query", "bias", "title"]`
- body 拡張: `{ query, bias?, title? }`
- Panel props 拡張: `title?: string`
- AnchorFormFields → Panel 渡し: `title={form.title}`
- LocationCategory enum **不変** (= 8 値維持)
- 新規 helper: `intentClassification.ts` / `categoryInference.ts` / `placeSearchQueryBuilder.ts`

---

## 4. Intent Classification 仕様

### 4.1 判定式 (= regex / keyword based、dep なし)

```typescript
type IntentType = "explicit_place" | "intent_with_area" | "intent_only" | "ambiguous";

export function classifyPlaceIntent(args: {
  title: string;
  locationText: string;
}): IntentType;
```

判定アルゴリズム:

```
1. title が空 / whitespace のみ → "ambiguous" (= title 無し、判定不能)
2. locationText に「明確な施設キーワード」 が含まれる
   (= 店名キーワード / 施設キーワード / chain 名)
   → "explicit_place"
3. locationText が空 → "intent_only" (= title だけある)
4. それ以外 (= title あり、locationText あり、locationText は area 名)
   → "intent_with_area"
```

### 4.2 「明確な施設キーワード」 判定

`locationText` が以下のいずれかを含むなら「explicit_place」 と判定:
- chain 名: スターバックス / スタバ / マクドナルド / ファミマ / セブン etc. (= 厳選 list)
- 施設キーワード: クリニック / 歯科 / 美容院 / 駅 / 病院 / 銀行 etc.
- フランチャイズ / 固有名詞っぽい pattern

→ keyword list は **保守可能な const として lib/plan に集中**。

```typescript
// lib/plan/explicitPlaceKeywords.ts (新規)
export const EXPLICIT_PLACE_KEYWORDS: ReadonlyArray<string> = [
  "スターバックス", "スタバ", "マクドナルド", "マクド", "モス",
  "ファミマ", "ローソン", "セブン", "セブンイレブン",
  "クリニック", "医院", "歯科", "歯医者",
  "美容院", "美容室", "サロン",
  "駅", "空港", "ターミナル",
  "病院", "総合病院", "大学病院",
  "銀行", "信金", "信用金庫",
  "図書館", "市役所", "区役所",
  // ... 拡張可能
];
```

判定方法: `locationText.includes(keyword)` で linear scan (= 数十件なら O(N) で問題なし)。

### 4.3 Intent Type の後段使用

- `PlaceCandidatesPanel` の panel header 表示文言で使う
- `placeSearchQueryBuilder` で query 構築方針を分岐
- `ambiguous` の場合は panel 非表示

### 4.4 「強制せず」 哲学

- IntentType が誤判定でも user が困らない設計
- Type 1 → Type 2 と判定が変わる場合は user の手入力が反映 (= regex は補助のみ)
- 候補が出ない場合は既存「候補なし」 文言で graceful fallback

---

## 5. Category Inference 仕様

### 5.1 判定式

```typescript
export function inferLocationCategory(
  title: string,
): LocationCategory | null;
```

- title から LocationCategory を推定
- 既存 8 値の範囲内 (= enum 拡張しない)
- null = 推定不能 (= user 自身が選ぶ、自動補助しない)

### 5.2 Mapping (= keyword 集約)

```typescript
// lib/plan/categoryInferenceMap.ts (新規)
const CATEGORY_KEYWORDS: Readonly<Record<LocationCategory, ReadonlyArray<string>>> = {
  home:    ["自宅", "家", "実家", "在宅", "リモート"],
  office:  ["会議", "打ち合わせ", "MTG", "ミーティング", "出社", "オフィス", "仕事"],
  school:  ["授業", "講義", "学校", "塾", "セミナー", "勉強会"],
  cafe:    ["カフェ", "コーヒー", "スタバ", "ベローチェ", "ドトール", "茶店", "作業"],
  outdoor: ["散歩", "ウォーキング", "ジョギング", "ランニング", "公園", "登山", "ハイキング"],
  public:  ["ショッピング", "買い物", "デパート", "モール", "映画", "シネマ", "ライブ", "美術館", "博物館"],
  transit: ["移動", "電車", "新幹線", "空港", "出張"],
  unknown: [],  // fallback
};
```

判定: title に keyword が含まれていれば該当 category。複数 match の場合は **最初に match した category** (= priority 順、テストで確認)。

### 5.3 UI への反映

- `AnchorFormFields` の locationCategory select に「**suggestion chip**」 を表示
- 例: title「ランチ」 入力 → category=cafe (推定) の chip を select 周辺に表示
- chip tap で `onChange("locationCategory", inferred)` 自動入力
- user が select で覆せる (= 強制しない)

または:
- locationCategory select の placeholder を suggestion で動的に変える: 「カフェ (推定)」
- ただし select の placeholder は static、これは技術的に厳しい → chip 案採用

### 5.4 Aneurasync 哲学

- Alter が user の予定の意味を understand している印象 (= 「第二の自己」)
- 強制せず、user が変えられる
- 推定 confidence 低い場合は chip を出さない (= null)

### 5.5 Test 戦略

- 「ショッピング」 → public
- 「ランチ」 → cafe (or 別 category、判断要)
- 「歯医者」 → null (= sensitive 候補だが LocationCategory に medical なし、未推定が安全)
- 「家でゆっくり」 → home
- pure / deterministic / 入力 mutate なし

---

## 6. Query Builder 仕様

### 6.1 API

```typescript
export interface PlaceSearchQuery {
  /** 最終的に Places API に渡される textQuery */
  textQuery: string;
  /** intent type の判定結果 (UI 透明性用) */
  intentType: IntentType;
  /** category inference 結果 (UI suggestion 用) */
  inferredCategory: LocationCategory | null;
}

export function buildPlaceSearchQuery(args: {
  title: string;
  locationText: string;
}): PlaceSearchQuery;
```

### 6.2 構築 logic

```
intentType = classifyPlaceIntent({ title, locationText })
inferredCategory = inferLocationCategory(title)

switch (intentType) {
  case "explicit_place":
    textQuery = locationText  // 既存挙動、変更なし
    break;
  case "intent_with_area":
    textQuery = `${locationText} ${title}`  // 例: "新宿 ショッピング"
    break;
  case "intent_only":
    textQuery = title  // 例: "ショッピング" (= bias で area 補正)
    break;
  case "ambiguous":
    textQuery = ""  // 候補検索しない
    break;
}

return { textQuery, intentType, inferredCategory };
```

### 6.3 順序 (= "新宿 ショッピング" vs "ショッピング 新宿")

Google Places Text Search API のドキュメント: クエリは natural language として解釈される。順序は影響あるが、 「location query」 (= エリア名) を **前に置く** 方が結果が安定する傾向 (= 業界調査)。

採用: **`${locationText} ${title}`** (= 場所 → 行為の順)。

### 6.4 query max length

- 既存制限: 300 chars (`MAX_QUERY_LENGTH`)
- combine 結果が 300 超なら **強制 truncate** ではなく **explicit_place fallback** (= locationText のみ送信、title を捨てる)
- これは defensive で稀

### 6.5 outbound privacy

- title + locationText を combine して Places API に送る
- 個人情報 (= 住所 / 電話 / 名前) は通常 title に入らない想定
- ただし「自宅で田中さんとMTG」 のような title は **個人名漏えいリスク**
- 採用 (= GPT 補正の補強): **送信前に title から個人名 pattern を除去**するのは scope 大、現 Phase 2-H では「**title が長すぎる / 個人名 pattern を含む可能性**」 を user に subtle hint で警告
- 厳密な PII filter は Phase 2-H+ 預け

---

## 7. UI 表示仕様

### 7.1 PlaceCandidatesPanel header 拡張

既存:
```tsx
<p className="text-xs font-semibold text-slate-700">✨ 候補から場所を選ぶ (任意)</p>
{biasContext.label && <p>...</p>}
```

Phase 2-H:
```tsx
<p className="text-xs font-semibold text-slate-700">
  {intentType === "intent_with_area"
    ? `「${title}」 を ${locationText} 周辺で探しています`
    : intentType === "intent_only"
      ? `「${title}」 候補を探しています`
      : "✨ 候補から場所を選ぶ (任意)"}  // explicit_place
</p>
```

文言例:
- intent_with_area: 「**『ショッピング』 を 新宿 周辺で探しています**」
- intent_only: 「**『カフェ作業』 候補を探しています**」
- explicit_place: 既存 「✨ 候補から場所を選ぶ (任意)」 維持
- ambiguous: panel 非表示

### 7.2 inferredCategory suggestion chip (= AnchorFormFields)

`AnchorFormFields` の locationCategory field 直上 / 直下:

```tsx
{inferredCategory && form.locationCategory !== inferredCategory && (
  <button
    type="button"
    onClick={() => onChange("locationCategory", inferredCategory)}
    className="text-xs text-slate-500 hover:text-indigo-600 italic"
  >
    💡 「{title}」 → **{LOCATION_CATEGORY_LABEL[inferredCategory]}** ですか?
  </button>
)}
```

- subtle、強制しない
- user が select で別 category を選んでいる場合も chip は出る (= 推定が違う可能性を示唆)
- tap で auto-apply、tap しなければ既存挙動

### 7.3 Aneurasync 思想整合 (= Phase 2-E / 2-F 踏襲)

- warning / amber / red 色禁止
- muted slate / italic / text-xs
- 強制 CTA なし (= 「推定: ◯◯」 のみ、user 判断)
- title 入力途中で intent type が頻繁に切り替わると panel ちらつきの可能性 → **debounce 500ms 維持** (= Phase 2-D 既存)

---

## 8. Helper API 設計 (= 詳細)

### 8.1 File 一覧

```
新規 (4):
  lib/plan/explicitPlaceKeywords.ts          ~30 行 (keyword list 定数)
  lib/plan/intentClassification.ts           ~70 行 (classifyPlaceIntent helper)
  lib/plan/categoryInferenceMap.ts           ~50 行 (keyword mapping 定数)
  lib/plan/categoryInference.ts              ~50 行 (inferLocationCategory helper)
  lib/plan/placeSearchQueryBuilder.ts        ~50 行 (buildPlaceSearchQuery helper)

新規 test (4):
  tests/unit/plan/intentClassification.test.ts        ~150 行 (20+ edge)
  tests/unit/plan/categoryInference.test.ts           ~120 行 (15+ edge)
  tests/unit/plan/placeSearchQueryBuilder.test.ts     ~100 行 (10+ edge)
  tests/unit/plan/placesSearchRoute.test.ts (拡張)    +50 行 (title 追加 case)

変更 (3):
  app/api/plan/places/search/route.ts                 +30 行 (title 受取、query combine)
  app/(culcept)/plan/components/PlaceCandidatesPanel.tsx  +30 行 (title prop、header 文言)
  app/(culcept)/plan/components/AnchorFormFields.tsx  +20 行 (title 渡し、suggestion chip)

合計: 7 新規 file + 3 変更 file = 10 ファイル (= scope 大、分割推奨)
```

### 8.2 Implementation split (= 小さく切る、GPT 補正)

**案 (a)**: 単一 commit (= 全 10 ファイル一気に、scope 大)
- 利点: 動作完結
- 欠点: 復旧時 PR が重い

**案 (b)**: **3 commit 分割** (= 推奨)
- **H-1**: helper + test (= 7 file、helper 完成、UI 未統合)
- **H-2**: `places/search/route.ts` 拡張 (= server 側 title 受取)
- **H-3**: `PlaceCandidatesPanel` + `AnchorFormFields` UI 統合

**案 (c)**: 2 commit (= helper + UI を 1 単位、server を別)
- H-1: helper + test + server route
- H-2: UI 統合

**推奨: 案 (b)** (= 3 commit 分割)。理由:
- Phase 2-D/E/F が 1 commit / 1 PR の流儀、Phase 2-H は **scope が大きいので分割すべき**
- helper + test だけ独立 review 可能 (= 設計の核心)
- server / client の review が分離できる
- CEO 「local 期間に積みすぎない」 制約に整合

### 8.3 推奨 commit 順序

1. **commit 1 (H-1)**: helper + test
   - lib/plan/explicitPlaceKeywords.ts
   - lib/plan/intentClassification.ts
   - lib/plan/categoryInferenceMap.ts
   - lib/plan/categoryInference.ts
   - lib/plan/placeSearchQueryBuilder.ts
   - tests/unit/plan/intentClassification.test.ts
   - tests/unit/plan/categoryInference.test.ts
   - tests/unit/plan/placeSearchQueryBuilder.test.ts

2. **commit 2 (H-2)**: server route 拡張
   - app/api/plan/places/search/route.ts (= title 受取、query builder 使用)
   - tests/unit/plan/placesSearchRoute.test.ts (= title 追加 case)

3. **commit 3 (H-3)**: UI 統合
   - app/(culcept)/plan/components/PlaceCandidatesPanel.tsx
   - app/(culcept)/plan/components/AnchorFormFields.tsx

各 commit 後に検証 (lint / tsc / test / build)、PASS で次へ。

---

## 9. Touched files 候補 (= 上記 §8.1 / §8.3 整理)

```
新規 (7):
  lib/plan/explicitPlaceKeywords.ts
  lib/plan/intentClassification.ts
  lib/plan/categoryInferenceMap.ts
  lib/plan/categoryInference.ts
  lib/plan/placeSearchQueryBuilder.ts
  tests/unit/plan/intentClassification.test.ts
  tests/unit/plan/categoryInference.test.ts
  tests/unit/plan/placeSearchQueryBuilder.test.ts

変更 (3):
  app/api/plan/places/search/route.ts
  tests/unit/plan/placesSearchRoute.test.ts (= 既存 test に追記)
  app/(culcept)/plan/components/PlaceCandidatesPanel.tsx
  app/(culcept)/plan/components/AnchorFormFields.tsx

合計: 10 ファイル (新規 7 + 変更 3-4)、推奨は 3 commit 分割
```

### 9.1 触らないファイル (CEO / 凍結制約)

- `lib/plan/anchor-detail-format.ts` (= Phase 2-F 凍結)
- `lib/plan/anchorOverlap.ts` (= Phase 2-E 凍結)
- `lib/plan/locationConfirmationStatus.ts` (= Phase 2-D C3 凍結)
- `lib/plan/external-anchor.ts` (= schema 不変、LocationCategory enum 不変)
- `lib/plan/location-category.ts` (= enum 不変)
- `lib/plan/livedGeographyFallback.ts` (= Phase 2-G docs 凍結、実装未着手)
- `lib/shared/canonicalLocationText.ts` (= Phase 2-D 凍結)
- 3 tab + AnchorDetailModal の場所表示 (= Phase 2-F 完全不変)
- AddAnchorModal / EditAnchorModal の保存挙動
- MorningMapView / CoAlter / talk / Mirror / W1-6 / DraftPlan
- migration / env / dependency

---

## 10. Invariants

1. `LocationCategory` enum 不変 (= 8 値維持)
2. canonical text 保存形式不変 (= Phase 2-D 凍結)
3. Place picker の close / skip / canonical 化動作完全不変 (= Phase 2-D C2 凍結)
4. Places API outbound privacy-safe 維持 (= textQuery + locationBias のみ、title は内部 combine 後に textQuery として送信)
5. PlaceCandidatesPanel の debounce 500ms / abort / sensitive 抑制 完全不変
6. AnchorFormFields の form state / onChange callback 完全不変 (= title / locationCategory の onChange は既存)
7. 既存 LocationCategory select の動作不変 (= suggestion chip は追加、select は既存挙動)
8. Phase 2-D C3 場所未確定 indicator / Phase 2-E 時刻重なり indicator / Phase 2-F Place Identity Contract すべて完全不変
9. server rate limit (= 60/h、Phase 2-D C1 凍結) 維持
10. server allowedKeys 拡張 (= "title" 追加) のみ、その他 field は依然 400 reject

---

## 11. やること / やらないこと (まとめ)

### 11.1 やること

| 領域 | やること |
|------|---------|
| Helper | `classifyPlaceIntent` / `inferLocationCategory` / `buildPlaceSearchQuery` の 3 つを新規追加 |
| Keyword list | `EXPLICIT_PLACE_KEYWORDS` / `CATEGORY_KEYWORDS` 定数集約 |
| Server | `places/search/route.ts` で `title?` 受取、`buildPlaceSearchQuery` 経由 |
| Panel | header 文言を intent type に応じて変化、title prop 受取 |
| Form | `title={form.title}` を PlacePanel に渡す + suggestion chip 表示 |
| Test | 各 helper の 10-20+ edge case、server route の title case 追加 |

### 11.2 やらないこと

| 禁止 | 理由 |
|------|------|
| LocationCategory enum 拡張 | migration、scope 大 |
| ML / LLM ベース推論 | dep / env、現 Phase は regex / keyword |
| auto-apply (= category 自動確定) | 強制感、思想違反 |
| Personal history learning | 別 Phase、scope 大 |
| Multi-intent (= 「会議 + ランチ」) | 別 Phase、複雑性大 |
| Category Icon System | **Phase 2-I に分離** (= 別 docs、表示層が別責務) |
| Lived Geography integration | Phase 2-G 実装後に検討 |
| sensitive anchor の intent 解析 | 既存 sensitive 抑制で panel 非表示、Phase 2-H で挙動変えない |
| Place Picker の close / skip / canonical 挙動変更 | Phase 2-D 凍結 |
| Phase 2-D/E/F/G branch への追加 commit | 凍結 |
| migration / env / dependency | CEO 制約 |
| GitHub push / PR / remote ops | CEO 明示禁止 |

---

## 12. Edge case 完全枚挙

| # | ケース | 期待 |
|---|-------|------|
| 1 | title="ショッピング" + locationText="新宿" | intent_with_area / textQuery="新宿 ショッピング" / inferredCategory=public |
| 2 | title="" + locationText="新宿" | explicit_place (= 既存) / textQuery="新宿" |
| 3 | title="スターバックス" + locationText="新宿" | **explicit_place** (= スターバックス は keyword match) / textQuery="新宿" or "スターバックス 新宿" 要 design 判断 |
| 4 | title="ランチ" + locationText="" | intent_only / textQuery="ランチ" / inferredCategory=cafe (or public) |
| 5 | title="自宅で考える" + locationText="" | intent_only / inferredCategory=home / textQuery="自宅で考える" |
| 6 | title="" + locationText="" | ambiguous / panel 非表示 |
| 7 | title="休み" + locationText="" | intent_only か ambiguous か (= ambiguous 判定の閾値、§4.1 で定義) |
| 8 | title="あ" (= 1 文字) + locationText="" | 短すぎる title、ambiguous |
| 9 | title="ショッピング" + locationText="スターバックス 渋谷" | explicit_place 優先 / textQuery="スターバックス 渋谷" |
| 10 | title 300 字超 + locationText 短 | combine が 300 超 → explicit_place fallback (locationText のみ) |
| 11 | sensitive anchor (sensitiveCategory set) | 既存通り panel 非表示、intent / category 解析しない |
| 12 | inferredCategory == form.locationCategory (= 一致) | suggestion chip 非表示 |
| 13 | inferredCategory null (= 推定不能) | suggestion chip 非表示 |
| 14 | title 変更で intent type が切り替わる (例: "新宿" → "新宿 ランチ") | debounce 500ms 内なら 1 req、debounce 後に header 文言更新 |
| 15 | empty / whitespace-only title | trim 後判定、ambiguous |
| 16 | mixed lang (= 英日) "Lunch 新宿" | intent_with_area / textQuery="新宿 Lunch" / inferredCategory=cafe (= "Lunch" keyword match) |
| 17 | recurring anchor 作成中 | 挙動不変 (= 既存 PlaceCandidatesPanel 仕様で OK) |
| 18 | user が select で category 変更 → title 変更で suggestion chip 再表示 | chip 表示条件は category != inferredCategory、user 選択尊重 |
| 19 | API 429 / network fail | 既存 fail-open (= friendly message)、Phase 2-D 仕様維持 |
| 20 | helper の pure / mutation 不変 | input mutate なし、deterministic、test で検証 |

---

## 13. Smoke scenario (= CEO 実機 smoke で確認すべき項目)

### 13.1 Intent type 別動作

1. **intent_with_area**: title="ショッピング" + locationText="新宿"
   - panel header: 「『ショッピング』 を 新宿 周辺で探しています」
   - 候補: 新宿の伊勢丹 / 高島屋 / マルイ 等
2. **intent_only**: title="カフェ作業" + locationText=""
   - panel header: 「『カフェ作業』 候補を探しています」
   - 候補: baseline 周辺のカフェ (= bias)
3. **explicit_place**: title="ショッピング" + locationText="スターバックス 渋谷"
   - panel header: 既存「✨ 候補から場所を選ぶ (任意)」
   - 候補: スターバックス 渋谷の店舗
4. **ambiguous**: title="" + locationText=""
   - panel **非表示**

### 13.2 Category Inference suggestion chip

5. title="ランチ" 入力 → AnchorFormFields の locationCategory field 周辺に chip:
   - 「💡 『ランチ』 → カフェ ですか?」
6. chip tap → locationCategory = cafe に自動入力
7. user が select で別 category 選択 → chip は表示維持 (= user が変えられる余地、Aneurasync 哲学)
8. category と inferredCategory 一致時 → chip 非表示

### 13.3 既存挙動完全不変

9. Phase 2-D の skip / close / canonical 化動作 → 完全不変
10. Phase 2-D C3 場所未確定 indicator → canonical でない anchor で出る、不変
11. Phase 2-E 時刻重なり indicator → 完全不変
12. Phase 2-F Place Identity Contract (= 3 tab + Detail で primary 表示) → 完全不変
13. sensitive anchor → panel 完全非表示、intent / category 解析されない
14. AddAnchor 保存 → success、anchor が正しく作成される

### 13.4 Privacy

15. Network tab 確認: outbound body は `{ query, bias?, title? }` のみ
16. server log: title / query / category 実値出力されない
17. Places API outbound: title + locationText を combine した textQuery のみ

---

## 14. Failure scenario (= 警戒すべき edge)

### 14.1 intent classification 誤判定

- 「スタバ」 が explicit_place 判定されるが、user の意図は「スタバっぽい場所」 だった
- → user 自身が手入力で覆せる、helper は補助のみ
- → 重大障害ではない

### 14.2 inferredCategory が user の意図と違う

- 「ランチ会議」 → cafe? office? 判定揺れ
- → user が select で覆せる、suggestion chip 非強制
- → category keyword 設計の見直しは Phase 2-H+ で

### 14.3 query 順序による検索結果の差

- "新宿 ショッピング" vs "ショッピング 新宿"
- Google Places API の挙動依存
- → docs §6.3 で「場所 → 行為」 採用、smoke で確認、必要なら逆順 fallback

### 14.4 debounce 中の title 変化

- title を高速入力する間、panel header が ちらつく
- → 既存 debounce 500ms (= Phase 2-D 凍結) で吸収、新規 ちらつき発生しない設計

### 14.5 個人情報漏えい

- title に個人名 / 電話 / 住所 を user が入力 → Places API に送信される
- → 現 Phase 2-H では filter しない、 future PII filter (= §1.5 解かない、Phase 2-H+)

---

## 15. Test plan (= 50+ ケース)

### 15.1 intentClassification.test.ts (= 20+ ケース)

```
describe("classifyPlaceIntent")
  describe("explicit_place")           # 5 件 (スターバックス / クリニック / 駅 / chain / generic 施設キーワード)
  describe("intent_with_area")         # 5 件 (ショッピング+新宿 / ランチ+渋谷 / カフェ作業+成田 / etc)
  describe("intent_only")              # 3 件 (locationText 空、title あり)
  describe("ambiguous")                # 3 件 (両方空、whitespace、短すぎ)
  describe("edge / mixed lang")        # 3 件 (英日 / 数字 / 記号)
  describe("pure / immutability")      # 2 件
```

### 15.2 categoryInference.test.ts (= 15+ ケース)

```
describe("inferLocationCategory")
  describe("home")                     # 2 件 (自宅 / 在宅)
  describe("office")                   # 2 件 (会議 / MTG)
  describe("school")                   # 2 件
  describe("cafe")                     # 3 件 (カフェ / スタバ / Lunch)
  describe("outdoor")                  # 2 件 (散歩 / ジョギング)
  describe("public")                   # 2 件 (ショッピング / 映画)
  describe("transit")                  # 1 件
  describe("null (= 推定不能)")        # 3 件 (歯医者 / 病院 / 短すぎ title)
  describe("pure / immutability")      # 2 件
```

### 15.3 placeSearchQueryBuilder.test.ts (= 10+ ケース)

```
describe("buildPlaceSearchQuery")
  describe("intent_with_area")         # 2 件 (textQuery 構築確認)
  describe("intent_only")              # 2 件
  describe("explicit_place")           # 2 件 (textQuery = locationText)
  describe("ambiguous")                # 2 件 (textQuery = "")
  describe("query max length fallback") # 2 件 (300 超で explicit_place fallback)
  describe("pure / immutability")      # 2 件
```

### 15.4 placesSearchRoute.test.ts 拡張 (= +5 ケース)

- title 受取 → 200 OK
- title が string でない → 400
- title が 300 chars 超 → 400
- title + query combine → Places API outbound 確認
- allowedKeys 拡張 (= "title" 含む、extra fields 400 維持)

---

## 16. Branch / commit 方針

- **base**: Phase 2-F commit `b4ab331e` を起点に派生 (= Phase 2-G docs branch とは独立)
- **branch name**: `feat/alter-plan-phase2-h-place-intent-candidate-search`
- **既存凍結 branch すべて不変**: Phase 2-D `cda09ef1` / 2-E `677b7b6a` / 2-F `b4ab331e` / 2-G docs `38292335` / 2-E docs `329a7145`
- **scope 外 dirty** (next-env.d.ts / supabase/.temp / *.png) は **stage しない**
- **commit**: CEO 承認後の local commit のみ、3 commit 分割推奨 (= §8.2)
- **remote**: push / PR / gh / merge / fetch / pull **全禁止**

---

## 17. Beyond / 不採用案 (透明性)

| 案 | 却下理由 |
|----|---------|
| LLM / ML ベース intent classification | dep / env、scope 大 |
| LocationCategory enum 拡張 (= shopping / food / fitness 等) | migration、影響範囲大 |
| auto-apply category (= 確認なし設定) | 強制感、思想違反 |
| Personal history learning (= user 好み学習) | scope 大、別 Phase |
| Multi-intent query 分解 | 複雑性大 |
| Time-aware suggestion (= 昼ランチ / 夜ディナー) | scope 大、Phase 2-H+ |
| PII filter (= title 内の個人名 / 電話除去) | scope 大、Phase 2-H+ |
| Category Icon System | **Phase 2-I に分離** |
| Lived Geography 統合 | Phase 2-G 実装後 |
| title が空 / 短すぎ で intent_only にすべきか ambiguous にすべきか | 仕様: 1 文字 = ambiguous、2 文字以上 = intent_only (= 仮、smoke で再判断) |

---

## 18. 将来拡張ポイント (= Phase 2-H+ / Phase 2-I 預け)

1. **Phase 2-I (Category Icon System)**: SVG icon library、3 tab + Detail で統一 icon 表示 (= 別 docs で起票)
2. **PII filter**: title 内の個人名 / 電話 / 住所 pattern 除去 (= privacy 強化)
3. **Personal history learning**: 過去 anchor から user 好み category / location 学習
4. **Time-aware suggestion**: 昼 = ランチ / 夜 = ディナー (= 時間文脈付き intent)
5. **Multi-intent query**: 「会議 + ランチ 渋谷」 を分解、両 category の候補
6. **LLM-based intent refinement**: 「ちょっと散歩」 「いつもの」 等の柔らかい自然言語に対応
7. **Lived Geography 統合 (= Phase 2-G + Phase 2-H)**: intent_only の bias を baseline ではなく lived geography で
8. **failure recovery hint**: 候補なし時に「もしかして '◯◯ + 場所' で探しますか?」 (= Aneurasync 思想)
9. **confidence indication**: 「推定: ショッピング (確信度 高)」 等の transparency
10. **Aneurasync 思想 — pattern teaching**: 「あなたはよく『ショッピング』 を新宿で予定する pattern があります」 (= 観測の入口)

---

## 19. 変更履歴

### 2026-05-21 v1 (本起票、CEO 指摘 + GPT 補正 + 自立推論 + actual code audit)

- Phase 2-F (b4ab331e) smoke PASS 後、CEO から「予定名 + 場所 → 候補検索」 の体験改善要求
- GPT 補正:
  - 4 階層 intent type 判定 (explicit_place / intent_with_area / intent_only / ambiguous)
  - category inference を補助のみ (= 強制 auto-apply しない)
  - Place picker の close / skip / canonical 既存挙動完全不変
- 自立推論で追加:
  - **Place Intent Contract** として概念化 (= Phase 2-F 「Place Identity Contract」 と対の構造)
  - 4 階層 intent type で switch + query combine の strict 仕様化
  - keyword list を `EXPLICIT_PLACE_KEYWORDS` / `CATEGORY_KEYWORDS` const として集約
  - 3 commit 分割 (= helper / server / UI) を採用、scope 大の対応
  - Edge case 20+ 完全枚挙
  - Privacy 維持 (= title も Places API outbound textQuery として combine 後送信、独立 field 不要)
  - UI 文言: 「『ショッピング』 を 新宿 周辺で探しています」 (= 透明性、Aneurasync 思想)
  - suggestion chip で category inference を非強制 UI に
  - Category Icon System は **Phase 2-I に独立分離** (= 表示層責務が別、設計を混ぜない)
  - 将来拡張 10 項目 (= PII filter / personal history / time-aware / multi-intent / LLM 等)

---

**End of Phase 2-H Mini Design v1**. CEO 採択判断 → docs only commit → 実装 GO/NO-GO 判断をお待ちします。

Aneurasync 設計思想への寄与:
Plan は「場所入力 UI」 から **「予定の意味を読み取って最適な場所候補を出す OS」** に進化する。
Phase 2-D で場所文字列を解決した。Phase 2-H で「予定の意図」 を解決する。
強制せず、補助として、user 自身に「自分はこういう pattern」 と気付かせる入口を提供する。

Place Identity Contract (Phase 2-F、場所アイデンティティ) + Place Intent Contract (Phase 2-H、予定意図) で、Plan の「場所体験」 が完成する。
