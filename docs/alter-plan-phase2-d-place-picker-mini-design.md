# Alter Plan Phase 2-D — 予定追加時の場所候補選択 (Place Picker) Mini Design

**作成日**: 2026-05-20
**Status**: **v2 採択待ち** (Option B、GPT 8 補正 + 自立推論強化を反映済、CEO 採択後に Phase 2-D 実装着手)
**branch**: `docs/alter-plan-phase2-d-place-picker-mini-design` (Phase 2-C impl branch の上に stack、5 段)
**実装範囲**: 本 PR は **docs only**。実装は CEO v2 採択後の別 PR (stacked branch、推定 1 PR / 3-4 commits)

**version 履歴 (本 file 単独の改訂)**:
  - **v2 (2026-05-20、本 commit)**: GPT 8 補正 + 自立推論 hidden weakness 解消を反映。具体: ①W1 locationText を disclosure 外へ昇格 (要件化、§0.4 やらないこと から解除)、②W2 post-select edit live update + AbortController、③W3 locationText を canonical text 化 (cache 衝突回避、migration なし)、④W4 sensitive で in-flight cancel、⑤W5 Phase 2-C+2-D combined budget table + observable metrics、⑥regionCode: JP default + bias transparency UI、⑦Panel close button + ARIA "complementary" + max-height、⑧privacy-first hint header
  - v1 (2026-05-20、commit 10c59eca): 初版起票、17 sections / 1100 行。CEO 「強制ではない場所候補選択」 を mockup pattern + biasing 戦略 + privacy-safe + cost guard で組み立て

**前提**:
  - Phase 2-A 完了凍結 (CalendarTab refactor)
  - Phase 2-B 完了凍結 (FlowTab 7 日リスト)
  - Phase 2-C 完了見込み (MapTab Google Maps + day-centric + baseline city fix)
  - 本 branch は Phase 2-C impl の上に stack、Phase 2-C 完了見込み時点で起票

**関連**:
  - `docs/alter-plan-phase2-c-map-tab-mini-design.md` (Phase 2-C v3、Google Maps + place resolver 流用の前例)
  - `app/(culcept)/plan/components/AnchorFormFields.tsx` (locationText 入力 UI、本 wave で touch 対象)
  - `app/(culcept)/plan/components/AddAnchorModal.tsx` (anchor 追加 modal、本 wave 内部触れず、API 利用のみ)
  - `lib/alter-morning/placesApiClient.ts` (Places API Text Search、本 wave で `maxResultCount=5` で複数候補取得に流用)
  - `lib/alter-morning/placeResolver.ts` (2-layer cache、本 wave で picker 後の cache 書き込みに流用)
  - CEO 指示 (2026-05-20): 場所候補選択の必要性、強制ではない、biasing 必要

---

## 0. ゴール (CEO 指示由来)

### 0.1 CEO 指示の本質

> 場所の設定をユーザーができるようになってるけど、それがもっと細かく教えるの下に
> 設定されてるから、それだと、入力がされない可能性が高いので、明確な場所のリンクは
> 追加するときに必要 (ただし、強制ではないようにする)。たとえば、成田のスタバって
> 言った時に、何個か候補を出してあげてそれをタップしてユーザーが設定できるようにする。
> 候補は、何かしら明確な場所での予定が設定されてたら、その近く。場所が不明確だったら、
> ユーザーの現在地の近く。っていう感じにしよう。

→ 解読:
1. **現状の場所設定 UX が弱い**: 詳細場所 (placeId / lat / lng) は AnchorFormFields の奥に埋もれ、user が入力しない
2. **明確な場所候補リンクが必要 (強制ではない)**: anchor 追加時に locationText から Places API 候補 3-5 件を提示し、user tap で確定
3. **候補 biasing**:
   - 既に明確場所 (resolved) の anchor がある → その近く
   - 不明確 → user の現在地 (browser geolocation)
   - 現在地もない → baseline (Phase 2-C 修正版)
4. **skip 可能**: 候補を選ばずに保存も OK (locationText のまま、MapTab で baseline pin になる)

### 0.2 Aneurasync 哲学整合

- 「第二の自己として必要か?」: 場所選択を user に「強制」 すると friction、「優しく提示」 すると体験
- 「自分って、そういう人間だったのか」: 候補から user が選ぶことで、「私はここに行くんだな」 と self-recognition
- **過度な automation を避ける**: Aneurasync は予測ではなく user の意図を尊重 → 自動選択 (top result を勝手に紐づけ) は採用しない、tap が必須

### 0.3 Phase 2-D v1 の goal

| 達成 | 詳細 |
|---|---|
| **anchor 追加時に locationText 候補 3-5 件を提示** | AnchorFormFields の locationText input 直下に PlaceCandidatesPanel を新規追加 |
| **biasing 戦略を context-aware に** | 直近 resolved anchor → 現在地 → baseline → 入力 text のみ の優先順位 |
| **強制ではない**: user は skip 可能 | 候補が出ても "場所を選ばずに保存" option 常時可、自動選択なし |
| **既存資産 100% 流用** | placesApiClient.searchPlacesByText / placeResolver cache / 既存 env / Phase 2-C 整備済 server endpoint pattern |
| **migration / 新 env / 新 dep すべて 0** | Phase 2-C と同制約、ExternalAnchor schema 不変、place_resolution_cache table 流用 |
| **privacy strict** | outbound payload は textQuery + bias coord のみ、anchor.title / notes / sensitive 不送信 (Phase 2-C と同 spec) |
| **cost guard** | debounce 500ms + min 3 文字 + max 5 候補 + per-user rate limit |
| **MapTab integration**: 選択後の pin 即時表示 | picker で選んだ candidate を place_resolution_cache に write、次の MapTab open で cache hit → resolved pin |

### 0.4 Phase 2-D で **やらないこと** (CEO 制約)

- ❌ **ExternalAnchor schema 変更** (placeId / lat / lng field 追加、migration、別 wave)
- ❌ **forced selection** (skip option 必須、自動選択禁止)
- ❌ **AnchorFormFields の全面 refactor** (touch は locationText 入力 area + PlaceCandidatesPanel 追加 + **"もっと細かく" disclosure 構造の最小限変更** に限定、他 field の挙動は不可触)
- ❌ **AddAnchorModal の signature 変更** (parent 不可触、本 wave は AnchorFormFields internal のみ)
- ❌ **PlanClient / HomeSwipeContainer / Modal lock 変更**
- ❌ **Alter Morning 側 logic 改変** (placesApiClient / placeResolver の内部 logic touch なし、call signature 経由のみ)
- ❌ **新 env / 新 migration / 新 dep / @vis.gl** (Phase 2-C 制約継承)
- ❌ **per-anchor cache (`place_resolution_cache` table に `anchor_id` column 追加)** (Phase 2-D v2 で却下、Phase 2-D+ 預け。代わりに **locationText canonical 化** で衝突回避、§0.5.1 W3 解決策)
- ❌ **localStorage / sessionStorage への persistence** (recent places memory は **session-only in-memory Map** のみ、永続不可。Aneurasync privacy 哲学整合)
- ❌ **永続 recent history / favorites** (Phase 2-D+ で migration を経て検討、本 wave スコープ外)
- ❌ **CoAlter / Mirror / /talk / D-* / W1-6 / DraftPlan / fallback path** 関連
- ❌ **Phase 3 ALTER 提案 flow との結合** (本 wave は静的 selection のみ、Phase 3 で AI 提案接続)
- ❌ **browser geolocation auto-prompt** (user に opt-in 経由でのみ、permission 強制不可)
- ❌ **server-side candidate ranking / 機械学習 personalization** (本 wave は Places API の order を尊重)

### 0.5 v2 補正 (GPT 8 補正 + 自立推論 hidden weakness 解消)

v1 self-review (本 doc 起票後の review turn) で 5 件の hidden weakness を発見、CEO が Option B (= 実装前に docs 補正) を採択。本 v2 で全て解消:

#### 0.5.1 GPT 8 補正の実装

| # | 補正 | v2 反映場所 | core 内容 |
|---|---|---|---|
| **1** | locationText を disclosure 外へ昇格 (W1) | §0.4 やらないこと の解除 / §1.2 audit / §5.1 PlaceCandidatesPanel 配置 / §10 C2 | locationText 入力を **主要 form field 化**、"もっと細かく" は notes / sensitive / endTime 等 advanced field のみに残す。skip / close は常に可能 |
| **2** | PlaceCandidatesPanel 非強制 UI | §5.2 拡張、§5.7 (新) | close button (×) 右上、`role="complementary"` (ARIA 補助 UI、modal ではない)、max-height 240px + overflow-y-auto で modal 圧迫回避、"場所を選ばずに保存" link 常時表示 |
| **3** | 曖昧入力精度向上 | §3.5 (新)、§3.6 (新) | `regionCode: "JP"` default (Places API)、bias source を panel header で **user 透明化** (例: "成田市周辺から探しています") |
| **4** | cache 衝突対策 (W3、canonical text 化) | §5.3 (大幅 update)、§5.4 (新) | 候補 tap で locationText を **canonical text** に update。例: "近所のスタバ" → "スターバックス コーヒー 成田空港第1ターミナル店 / 千葉県成田市古込1番地"。cache key 衝突回避 + MapTab pin 精度向上 + migration 不要 |
| **5** | post-select edit live update (W2) | §5.5 (新)、§5.6 (新) | user が選択後 locationText を編集 → panel が **live update** で新 query 候補表示、既存 selection と input 値が乖離 → 「場所候補が未確定」 扱いに戻る (= cache 不参照、MapTab で baseline pin) |
| **6** | sensitive AbortController cancel (W4) | §5.6 (新)、§7.6 (新) | sensitiveCategory が `false → true` の瞬間: (a) panel close、(b) in-flight fetch を AbortController で **cancel** (= 外送信を最小化)、(c) sensitive draft では panel 完全非表示 |
| **7** | cost guard (W5、combined budget) | §8.4 (新)、§8.5 (新)、§8.6 (新) | Phase 2-C + 2-D combined budget table、observable metrics (cache hit 率 / daily calls / cost-per-anchor / user 当たり call 数)、段階的 limit (warning → 一時 disable) |
| **8** | Beyond 採用 (session memory / 未確定 indicator / bias transparency / privacy hint) | §16 Beyond 拡張 | session-only recent places (in-memory Map、 lifecycle はページ load → close)、Calendar/Flow/Map 全 tab で「場所未確定」 indicator (UI subtle 表示)、bias source mapping を user-facing label に、Privacy-first hint (Panel header に "あなたの場所を Google に確認します" proactive disclosure) |

#### 0.5.2 自立推論で v2 に追加した強化

- **canonical update の transparency**: tap 直後に「locationText が `〇〇` に更新されます」 を 1.5 秒間 subtle toast 表示 (= user に意思確認、強制感の払拭)
- **session-only recent memory の lifecycle 明示**: ページ load → close で flush、別タブ間共有なし、user identifiable info を server に送らない
- **bias source の 7 階層 user-facing mapping**: 同日 anchor / 直近高頻度 / geolocation / baseline (home/city/prefecture) / なし — 各々の panel header 文言を明文化
- **未確定 indicator の cross-tab consistency**: Calendar/Flow/Map 全 tab で同じ visual (🔍 small icon + "場所未確定" 文言) で表示、user の自己発見を促す
- **AbortController pattern の徹底**: debounce 中の新 query / panel close / sensitive set / unmount すべてで cancel

#### 0.5.3 v2 の最終 stance

| 観点 | v1 (10c59eca) | v2 (本 commit) |
|---|---|---|
| W1 locationText UX | disclosure 内 (CEO 指示の core 未解決) | **disclosure 外昇格** (主要 field) |
| W2 post-select edit | 想定なし | live update + AbortController cancel |
| W3 cache 衝突 | 想定なし | **canonical text 化** (migration なし、cache key 衝突回避) |
| W4 sensitive 後 set | panel 非表示のみ | AbortController で in-flight cancel + cache write 阻止 |
| W5 cost | 単独 hypothesis | Phase 2-C + 2-D combined budget table + observable metrics + 段階的 limit |
| regionCode | 未指定 (global search) | **JP default** |
| bias transparency | 言及あり (label) | **7 階層 mapping を明文化** |
| Privacy hint | 言及なし | **proactive disclosure** (panel header) |
| close button | 言及なし | **× icon 右上** (非強制 UI 補強) |
| ARIA role | 言及なし | `role="complementary"` (補助 UI、modal ではない) |
| Beyond | B1-B5 5 件 | **B1-B10 10 件** (5 件新規、§16 拡張) |

---

## 1. 現状 audit (AnchorFormFields / AddAnchorModal)

### 1.1 ファイル構造

| layer | path | 役割 |
|-------|------|------|
| component | `app/(culcept)/plan/components/AddAnchorModal.tsx` (~190 行) | 「Alter に教える」 modal、AnchorFormFields を wrap |
| component | `app/(culcept)/plan/components/AnchorFormFields.tsx` | title / date / startTime / endTime / locationText / locationCategory / rigidity 等の form 入力 UI |
| type | `lib/plan/anchor-input-form.ts` | AnchorFormState 型 + builders、locationText / locationCategory は optional field |
| 流用 | `lib/alter-morning/placesApiClient.ts` `searchPlacesByText({textQuery, locationBias, maxResultCount, languageCode})` | Places API Text Search、複数候補可 |
| 流用 | `lib/alter-morning/placeResolver.ts` `setCachedResolution()` | L1 + L2 cache write、Phase 2-C 流用 pattern と同 |

### 1.2 現在の locationText 入力 UX (problem、v2 補正で disclosure 構造変更要件化)

#### v1 想定 (= 現状の AnchorFormFields)

```
AnchorFormFields:
  [title input]
  [date input]
  [startTime input]
  [endTime input (optional)]
  [rigidity radio]
  [もっと細かく教える ▼ disclosure ←  ここに locationText / locationCategory が埋もれる]
  [..もっと細かく開いた状態の中..]
    [locationText input]  ← user が「成田のスタバ」 と入力するが、Places API 確定なし
    [locationCategory select]
    [endTime, sensitiveCategory, etc.]
```

→ **CEO 観察**: 「もっと細かく」 disclosure に入っているので、user が一度も開かないと locationText が常に未入力。結果として MapTab で全 anchor が baseline pin になる。

#### v2 補正 (W1、disclosure 構造変更要件化)

```
AnchorFormFields (v2 補正後):
  [title input]
  [date input]
  [startTime input]
  [endTime input (optional)]
  [rigidity radio]
  [📍 場所 (オプション) input]               ← **disclosure 外、主要 field に昇格 (W1 解決)**
  ↓ user が "成田のスタバ" 入力 + 500ms debounce
  [PlaceCandidatesPanel]                   ← 直下に出現、非強制 (close × ボタン + skip link)
    [候補 1] [候補 2] [候補 3] [候補 4] [候補 5]
    [場所を選ばずに保存]
  [locationCategory select]                ← 引き続き optional 表示
  [もっと細かく教える ▼ disclosure]
    [notes / sensitiveCategory / endTime 等 advanced field のみ]
```

→ user は disclosure を開かなくても locationText 入力 + candidate selection が natural flow。CEO 指示「教える の奥に埋もれている」 の core が解消。

### 1.3 ExternalAnchor の location 関連 field

```ts
// lib/plan/external-anchor.ts
interface ExternalAnchorBase {
  ...
  locationText?: string;       // free text、user 自由入力
  locationCategory?: enum;     // home/office/school/cafe/outdoor/public/transit/unknown
  sensitiveCategory?: enum;
  // lat / lng / placeId は **なし** (migration が必要、本 wave スコープ外)
}
```

→ Phase 2-D で picker 結果を **anchor 自体には永続化しない**。代わりに `place_resolution_cache` に書き込むことで、次の MapTab open で cache hit して resolved pin に。

### 1.4 既存 placesApiClient API (本 wave で流用)

```ts
export async function searchPlacesByText(options: {
  textQuery: string;
  locationBias?: { lat: number; lng: number; radius: number };
  languageCode?: string;
  maxResultCount?: number;  // default 5、本 wave で 5 利用
}): Promise<PlacesApiPlace[]>
```

返却 `PlacesApiPlace`:
```ts
{
  id: string;
  displayName: { text: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  types?: string[];
  businessStatus?: string;
}
```

→ Phase 2-C の geocode endpoint と同 API を **maxResultCount=5** で複数候補取得に流用。

---

## 2. CEO mockup 想定 (具体 UX flow)

### 2.1 User flow (autocomplete pattern)

```
[Step 1] user が anchor を追加開始
  ↓
[Step 2] AnchorFormFields に
  - title: "作業"
  - date / startTime
  を入力
  ↓
[Step 3] locationText input に "成田のスタバ" と入力
  ↓
[Step 4] locationText input の **直下** に PlaceCandidatesPanel が出現
   (3 文字以上 + debounce 500ms 後に server fetch、候補 3-5 件)
   ┌───────────────────────────────────────────────┐
   │ ✨ 候補から場所を選ぶ (任意)                       │
   │ ┌─────────────────────────────────────────────┐ │
   │ │ ☕ スターバックス 成田空港第 1 ターミナル店    │ │
   │ │   千葉県成田市古込 1 番地・1.5km from baseline│ │
   │ │   [tap で確定]                              │ │
   │ ├─────────────────────────────────────────────┤ │
   │ │ ☕ スターバックス 成田美郷台店                │ │
   │ │   千葉県成田市美郷台 2 丁目・2.3km            │ │
   │ ├─────────────────────────────────────────────┤ │
   │ │ ☕ スターバックス イオンモール成田店           │ │
   │ │   千葉県成田市 wing 土屋・3.1km              │ │
   │ └─────────────────────────────────────────────┘ │
   │   [場所を選ばずに保存]    ← skip option        │
   └───────────────────────────────────────────────┘
  ↓
[Step 5a] user が候補 tap → locationText を resolved name (e.g., "スターバックス 成田空港第1ターミナル店") で update
   バックグラウンドで place_resolution_cache に write (lat/lng + placeId + resolvedName)
  ↓
[Step 5b] OR user が skip / そのまま保存 → locationText のまま、resolution なし
  ↓
[Step 6] anchor 保存
  ↓
[Step 7a (5a)] MapTab open → resolution cache hit → resolved pin が即出る
[Step 7b (5b)] MapTab open → unresolved → baseline pin
```

### 2.2 mockup ASCII

```
AnchorFormFields の locationText 周辺 (本 wave で変更)

┌─────────────────────────────────────────────────┐
│ 場所 (オプション)                                  │
│ ┌───────────────────────────────────────────────┐ │
│ │ 成田のスタバ                              [×] │ │
│ └───────────────────────────────────────────────┘ │
│                                                  │
│ ┌── ✨ 候補から場所を選ぶ (任意) ──────────────────┐ │
│ │ ☕ スターバックス 成田空港第 1 ターミナル店      │ │
│ │    千葉県成田市古込 1 · 1.5km                  │ │
│ ├─────────────────────────────────────────────── │ │
│ │ ☕ スターバックス 成田美郷台店                  │ │
│ │    千葉県成田市美郷台 · 2.3km                  │ │
│ ├─────────────────────────────────────────────── │ │
│ │ ☕ スターバックス イオンモール成田店             │ │
│ │    千葉県成田市 wing 土屋 · 3.1km              │ │
│ ├─────────────────────────────────────────────── │ │
│ │ [場所を選ばずに保存]                            │ │
│ └─────────────────────────────────────────────── │ │
│                                                  │
│ カテゴリ: [カフェ ▼]                              │
└─────────────────────────────────────────────────┘
```

---

## 3. Candidate biasing 戦略 (CEO 指示反映)

### 3.1 優先順位 (bias point 算出)

CEO 指示:
> 候補は、何かしら明確な場所での予定が設定されてたら、その近く。
> 場所が不明確だったら、ユーザーの現在地の近く。

実装の優先順位 (= bias point の決定):

```
1. 同セッション内で既に作成中の anchor (現 form) に locationCategory のみ あり
   → 同 category の最近 anchor (resolved) があれば その coord

2. 直近 N 日 (default 7 日) 内の **同 day or 直近 day** の resolved anchor coord
   (= 「成田のスタバで朝、夜は成田駅で夜ごはん」 のような同日 plan)

3. 直近 30 日内の最も visit 頻度高い resolved anchor coord (= 通勤先 / 自宅最寄り)

4. browser geolocation (user opt-in 経由、permission granted の場合のみ)
   - 既存 locationOptIn システム (Phase 2-A blocker fix で実装済) を流用 / 確認

5. baseline coords (Phase 2-C 修正版優先順位):
   5a. homeCoords (具体 home)
   5b. municipalityCoords(city)
   5c. PREFECTURE_COORDS[prefecture]

6. なし = free search (Places API に bias なし、入力 text のみで検索)
```

### 3.2 bias radius

- 1-3 (anchor based): **radius 5km** (= 「同日 plan 周辺」 想定、徒歩 + 短距離移動圏)
- 4 (current location): **radius 5km** (= 「今いる場所周辺」)
- 5a (home): **radius 10km** (= 「家から少し離れた範囲」)
- 5b (city): **radius 20km** (= 「市区町村全域 + 隣接」)
- 5c (prefecture): **radius 50km** (= 「県内 + 隣県の一部」)
- 6 (なし): **bias なし** (Places API global search、text のみ)

### 3.3 bias data の form 入力時に保持する state

```ts
// AnchorFormFields に内部 state として保持 (新規)
interface BiasContext {
  source: "form_resolved_anchor" | "recent_resolved_anchor" | "geolocation" | "baseline_home" | "baseline_city" | "baseline_prefecture" | "none";
  coord: { lat: number; lng: number } | null;
  radiusMeters: number;
  label: string | null;  // user 透明性 UI 用 ("近く: 千葉県 成田市" 等)
}
```

→ PlaceCandidatesPanel は biasContext.label を表示することで、user に「なぜこの候補が出ているか」 を transparent に伝達。

### 3.5 regionCode JP default (v2 新規、GPT 補正 3)

Places API call で **`regionCode: "JP"` を default** に指定:

- 日本ロケール限定 search (= "スタバ" で global Starbucks ではなく日本国内店舗のみ返却)
- 同 query で noise 削減 (例: "成田のスタバ" → "Narita Starbucks" の英語 SEO で混入する海外店舗を排除)
- Places API cost に影響なし (regionCode は free parameter)
- 設定: server endpoint で固定値 `regionCode: "JP"` を request 送信

### 3.6 Bias source の user-facing transparency mapping (v2 新規、GPT 補正 8)

biasContext.label を panel header に表示する具体的 mapping:

| bias source | panel header 表示 |
|---|---|
| same-day resolved anchor | `今日の予定 {anchor.title} ({anchor.startTime}) の近くから探しています` |
| recent freq resolved | `よく行く {anchor.title} の近くから探しています` |
| geolocation (opt-in) | `現在地の近くから探しています` |
| baseline.home | `あなたの自宅 ({label}) の近くから探しています` |
| baseline.city | `あなたの居住地 ({label}) 周辺から探しています` |
| baseline.prefecture | `あなたの居住地 ({prefecture}) の範囲から探しています` |
| none | `場所候補を探しています` (bias なし、free search、regionCode JP のみ) |

各 entry の右に "?" icon、tap で **詳細展開** (= "なぜこの bias が選ばれているか" を user に明示):

例: same-day anchor 選択時の "?" tap → "今日の予定『朝食 (08:00)』 の場所『スターバックス 渋谷店』 を基準にしています。近い場所を優先的に表示中。"

→ user の自己発見を促す Aneurasync 哲学整合 + privacy 透明性確保。

### 3.4 client-side resolution の判断ルート

```ts
function determineBiasContext(
  formAnchor: Partial<AnchorFormState>,
  recentResolvedAnchors: ResolvedAnchorWithCoord[],
  geolocation: { lat, lng } | null,
  baseline: BaselineCoords | null,
): BiasContext {
  // Priority 1: 直近 7 日 同 day の resolved anchor
  const sameDay = recentResolvedAnchors.find((a) => a.date === formAnchor.date);
  if (sameDay) return { source: "form_resolved_anchor", coord: sameDay.coord, radiusMeters: 5000, label: `今日の予定 ${sameDay.title} の近く` };

  // Priority 2: 直近 30 日 高頻度 resolved anchor
  const topFreq = findMostFrequentResolved(recentResolvedAnchors, 30);
  if (topFreq) return { source: "recent_resolved_anchor", coord: topFreq.coord, radiusMeters: 5000, label: `よく行く ${topFreq.title} の近く` };

  // Priority 3: geolocation (opt-in 経由のみ)
  if (geolocation) return { source: "geolocation", coord: geolocation, radiusMeters: 5000, label: "現在地の近く" };

  // Priority 4: baseline (Phase 2-C 整備済優先順位を流用)
  if (baseline) {
    if (baseline.source === "home") return { source: "baseline_home", coord: { lat: baseline.lat, lng: baseline.lng }, radiusMeters: 10000, label: `${baseline.label ?? "自宅"} の近く` };
    if (baseline.source === "city") return { source: "baseline_city", coord: { lat: baseline.lat, lng: baseline.lng }, radiusMeters: 20000, label: `${baseline.label ?? "市区町村"} の中` };
    if (baseline.source === "prefecture") return { source: "baseline_prefecture", coord: { lat: baseline.lat, lng: baseline.lng }, radiusMeters: 50000, label: `${baseline.label ?? "県"} の中` };
  }

  // Priority 5: なし
  return { source: "none", coord: null, radiusMeters: 0, label: null };
}
```

---

## 4. 新 server endpoint: `/api/plan/places/search`

### 4.1 API contract

| 項目 | 値 |
|---|---|
| Path | `POST /api/plan/places/search` |
| Auth | session (Supabase auth)、unauth = 401 |
| Request body | `{ query: string, bias?: { lat: number; lng: number; radiusMeters: number } }` のみ、extra fields は 400 |
| Query max length | 300 chars |
| Per-user rate limit | 60 calls / hour (Phase 2-C と別 limit、autocomplete UX で頻度高くなり得る) |
| Response | `{ ok: true, data: { results: PlaceCandidate[] }, apiAvailable: boolean }` |
| Response items max | 5 |

### 4.2 PlaceCandidate shape (client 返却用)

```ts
interface PlaceCandidate {
  placeId: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  /** Google Places API types (e.g., ["cafe", "restaurant"]) */
  types?: string[];
  /** bias coord からの距離 (m)、bias なしなら null */
  distanceMeters: number | null;
}
```

### 4.3 privacy-safe outbound (Phase 2-C と同 spec)

外部 (Google Places API) 送信:
- `textQuery = query` (trim 後)
- `locationBias = { circle: { center: { lat, lng }, radius: radiusMeters } }` (bias 指定時のみ)
- `languageCode = "ja"`
- `maxResultCount = 5`

**送信しない**:
- anchor metadata (title / notes / sensitiveCategory / userId)
- 他 anchor の情報
- 会話履歴 / Personal Model

### 4.4 audit log (privacy 整合)

- log: `anchorId (作成中の transient ID or "draft") + outcome (cache_hit / api_returned_N / api_throw / rate_limit / validation_fail) + duration_ms`
- log しない: query 実値 / Places API response body / bias coord 実値

### 4.5 擬似 code

```ts
// app/api/plan/places/search/route.ts (新規、Phase 2-C C1 の同 pattern)

const MAX_QUERY_LENGTH = 300;
const MAX_RESULTS = 5;
const RATE_LIMIT_PER_HOUR = 60;  // Phase 2-C より低め、autocomplete UX 想定

export async function POST(request: Request) {
  const supabase = await supabaseServer();
  const auth = await requireAuthenticatedUser(supabase);
  if (!auth.ok) return auth.response;

  // rate limit (Phase 2-C と別 counter、autocomplete 用、別 helper file or 統合)
  const rateOk = checkAndIncrementPlaceSearchRate(auth.userId, Date.now());
  if (!rateOk) return rateLimitResponse;

  // strict input validation (extra fields reject)
  const parsed = await parseJsonBody(request);
  if (!parsed.ok) return parsed.response;
  // ... validation: query は string、bias は { lat, lng, radiusMeters } 形式 ...

  const apiAvailable = isPlacesApiAvailable();
  if (!apiAvailable) {
    return NextResponse.json({ ok: true, data: { results: [], apiAvailable: false } });
  }

  try {
    const places = await searchPlacesByText({
      textQuery: query.trim(),
      maxResultCount: MAX_RESULTS,
      languageCode: "ja",
      ...(bias ? { locationBias: { lat: bias.lat, lng: bias.lng, radius: bias.radiusMeters } } : {}),
    });
    const results = places
      .filter((p) => p.location !== undefined)
      .map((p) => ({
        placeId: p.id,
        name: p.displayName.text,
        address: p.formattedAddress ?? null,
        lat: p.location!.latitude,
        lng: p.location!.longitude,
        types: p.types,
        distanceMeters: bias ? haversineMeters(bias.lat, bias.lng, p.location!.latitude, p.location!.longitude) : null,
      }));
    return NextResponse.json({ ok: true, data: { results, apiAvailable: true } });
  } catch (err) {
    console.warn("[plan/places/search] api_throw");  // log は outcome のみ
    return NextResponse.json({ ok: true, data: { results: [], apiAvailable: true } });  // fail-open
  }
}
```

### 4.6 Cache 戦略

本 endpoint は **cache を直接利用しない** (理由: query は real-time autocomplete で variant が多く、cache hit 率が低い):
- 軽量な request 単位での L1 cache (短時間 e.g., 30 秒) は可、過剰最適化を避けるため v1 では不採用
- ただし **user が候補を選んだ瞬間に place_resolution_cache に write** (= MapTab の cache hit に貢献)

---

## 5. Client UI: PlaceCandidatesPanel

### 5.1 配置

`AnchorFormFields.tsx` の locationText `<input>` の **直下** に新規 component を挿入。
他 field (title / date / category / rigidity / sensitiveCategory 等) は不可触。

```tsx
{/* AnchorFormFields の中、locationText input 直後 */}
<div>
  <label>場所 (オプション)</label>
  <input value={locationText} onChange={...} />

  {/* ↓ 新規追加 */}
  <PlaceCandidatesPanel
    query={locationText}
    biasContext={biasContext}
    onSelect={(candidate) => {
      // 1. locationText を resolved name で update
      setLocationText(candidate.name);
      // 2. cache 書き込み (background、UI ブロックしない)
      void persistPlaceResolutionCache(candidate);
    }}
    onSkip={() => {
      // do nothing、locationText はそのまま
    }}
  />
</div>
```

### 5.2 PlaceCandidatesPanel の挙動

```tsx
function PlaceCandidatesPanel({
  query,
  biasContext,
  onSelect,
  onSkip,
}: {
  query: string;
  biasContext: BiasContext;
  onSelect: (c: PlaceCandidate) => void;
  onSkip: () => void;
}) {
  const debouncedQuery = useDebounce(query, 500);
  const [results, setResults] = useState<PlaceCandidate[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (debouncedQuery.trim().length < 3) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch("/api/plan/places/search", {
      method: "POST",
      body: JSON.stringify({
        query: debouncedQuery,
        bias: biasContext.coord ? { ...biasContext.coord, radiusMeters: biasContext.radiusMeters } : undefined,
      }),
    })
      .then((r) => r.json())
      .then((res) => {
        if (cancelled) return;
        if (res.ok && res.data) setResults(res.data.results);
      })
      .catch(() => { /* fail-open: results = [] */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [debouncedQuery, biasContext.coord?.lat, biasContext.coord?.lng]);

  if (debouncedQuery.trim().length < 3) return null;

  return (
    <section className="mt-2 rounded-xl border border-slate-200 bg-white p-3">
      <header className="flex items-baseline justify-between mb-2">
        <p className="text-xs font-semibold text-slate-600">
          ✨ 候補から場所を選ぶ (任意)
        </p>
        {biasContext.label && (
          <p className="text-xs italic text-slate-400">
            {biasContext.label}
          </p>
        )}
      </header>

      {loading && <p className="text-xs text-slate-400">候補を確認中...</p>}

      {!loading && results.length === 0 && (
        <p className="text-xs text-slate-400">候補が見つかりませんでした (このまま保存しても OK)</p>
      )}

      {!loading && results.length > 0 && (
        <ul className="space-y-2">
          {results.map((c) => (
            <li key={c.placeId}>
              <button
                type="button"
                onClick={() => onSelect(c)}
                className="w-full text-left rounded-lg border border-slate-100 hover:border-indigo-300 hover:bg-indigo-50 p-2 transition"
              >
                <p className="text-sm font-medium text-slate-900">{c.name}</p>
                {c.address && (
                  <p className="text-xs text-slate-500 truncate">{c.address}</p>
                )}
                {c.distanceMeters !== null && (
                  <p className="text-xs text-slate-400">
                    {formatDistance(c.distanceMeters)} from {biasContext.label}
                  </p>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 text-center">
        <button
          type="button"
          onClick={onSkip}
          className="text-xs text-slate-500 hover:text-slate-700 underline"
        >
          場所を選ばずに保存
        </button>
      </div>
    </section>
  );
}
```

### 5.3 cache write (user が候補選択時、background)

```ts
async function persistPlaceResolutionCache(candidate: PlaceCandidate): Promise<void> {
  // 既存の Phase 2-C C1 server endpoint pattern を mirror
  // /api/plan/places/cache-write を新規 OR /api/plan/places/search に確認 endpoint 追加
  await fetch("/api/plan/places/cache-write", {
    method: "POST",
    body: JSON.stringify({
      query: locationText,  // user 元 input
      candidate: { placeId, name, address, lat, lng },
    }),
  });
}
```

server 側で setCachedResolution() を call、L1+L2 (= place_resolution_cache table) に write。
→ 次に MapTab open すると、user の locationText (resolved name に updated) で cache hit → resolved pin が即出る。

### 5.4 locationText を canonical text に update (v2 新規、GPT 補正 4、W3 解決)

**問題 (v1 で hidden)**: 同 locationText で 2 つの異なる place を別 anchor に紐づけると、`place_resolution_cache` の key が同じ → 後の write が前を上書き → 1 つ目 anchor が間違った場所を指す。

**v2 解決策 (migration なし)**: 候補 tap 時に locationText を **canonical text** に update。

```ts
function onSelect(candidate: PlaceCandidate) {
  // v2 補正: locationText を canonical text に更新
  // canonical text = `${displayName} / ${formattedAddress}`
  // 例: "近所のスタバ" → "スターバックス コーヒー 成田空港第1ターミナル店 / 千葉県成田市古込1番地"
  const canonicalText =
    candidate.address && candidate.address.length > 0
      ? `${candidate.name} / ${candidate.address}`
      : candidate.name;

  setLocationText(canonicalText);

  // 1.5 秒の subtle toast で user に明示 (transparency)
  showToast(`場所を「${candidate.name}」 として保存します`);

  // background で place_resolution_cache に write
  void persistPlaceResolutionCache({
    query: canonicalText,  // ← canonical text を cache key にする (= 衝突回避)
    candidate,
  });
}
```

**効果**:

1. **cache key 衝突回避** (W3 解決): 同 user の 2 つの anchor が「近所のスタバ」 入力 → tap で別 canonical (= 各々の店舗名 + 住所) → cache key 異なる → 上書きなし
2. **MapTab pin 精度向上**: 次回 MapTab open で canonical text → cache hit → resolved pin
3. **migration なし**: ExternalAnchor schema 不変、cache table schema 不変
4. **user transparency**: tap 直後の toast で「locationText を 〇〇 として保存」 を明示

**Edge case 対策**:

- candidate.address が空: `displayName` のみで canonical (例: "Starbucks Coffee 成田空港第1ターミナル店")
- canonical text が長すぎ (e.g., >100 文字): UI truncate (display only)、storage は full
- user が tap **後に** locationText を編集 → §5.5 live update + 「未確定」 戻り

### 5.5 post-select edit live update (v2 新規、GPT 補正 5、W2 解決)

**問題 (v1 で hidden)**: 候補 tap 後 user が locationText を再編集 → cache key 変化 → MapTab で cache miss → 再 geocode (or baseline pin)。

**v2 解決策**:

```tsx
useEffect(() => {
  if (debouncedQuery.trim().length < 3) {
    setResults([]);
    setSelectedCandidate(null);  // ← 編集で既存 selection クリア
    return;
  }

  // 既存 selection と input 値が乖離 → 「未確定」 扱いに戻す
  if (selectedCandidate && debouncedQuery !== selectedCandidate.canonicalText) {
    setSelectedCandidate(null);
  }

  // AbortController で前 fetch を cancel
  const controller = new AbortController();
  setLoading(true);
  fetch("/api/plan/places/search", {
    method: "POST",
    signal: controller.signal,
    body: JSON.stringify({ query: debouncedQuery, bias: biasContext.coord }),
  })
    .then(/* ... */)
    .catch((err) => {
      if (err.name === "AbortError") return;  // 期待された cancel
      /* ... fail-open ... */
    })
    .finally(() => setLoading(false));

  return () => controller.abort();  // unmount / re-run で cancel
}, [debouncedQuery, biasContext.coord]);
```

**user 体験**:

- user が "近所のスタバ" 入力 → "スターバックス 成田空港..." を tap → locationText が canonical に update
- user が canonical text を編集 (e.g., 末尾の住所を削除) → debounce 後 panel が live update、新 query で候補表示
- 既存 selection と乖離 → 既存 selection clear、user は新 candidate を tap or skip
- skip で保存 → cache 不参照 (= 「未確定」)、MapTab で baseline pin

### 5.6 AbortController in-flight cancel (v2 新規、GPT 補正 5+6、W4 解決)

cancel する trigger:

| trigger | 動作 |
|---|---|
| 新 query (debounce 中) | 前 fetch を `controller.abort()` |
| panel close (× button) | in-flight fetch cancel + state clear |
| sensitive set (`false → true`) | in-flight fetch cancel + panel close + cache write 阻止 |
| component unmount | in-flight fetch cancel + listener cleanup |

```tsx
// sensitive 変化を watch
useEffect(() => {
  if (sensitiveCategory) {
    // 在中の controller があれば cancel
    abortControllerRef.current?.abort();
    setResults([]);
    setLoading(false);
    setPanelOpen(false);
  }
}, [sensitiveCategory]);
```

→ **sensitive 後 set 時の外送信 risk を minimum 化** (= 既に発火した fetch も cancel、cache write も阻止)。

### 5.7 PlaceCandidatesPanel UI specs (v2 拡張、GPT 補正 2)

```tsx
<section
  role="complementary"                      // ← ARIA: 補助 UI (modal ではない)
  aria-label="場所候補 (任意)"
  className="
    mt-2 rounded-xl border border-slate-200 bg-white p-3
    max-h-60 overflow-y-auto                // ← max-height で modal 圧迫回避
    relative
  "
>
  {/* close button (右上、明示的に閉じる、非強制 UI) */}
  <button
    type="button"
    onClick={onClose}
    aria-label="場所候補パネルを閉じる"
    className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
  >
    ✕
  </button>

  {/* privacy-first hint (proactive disclosure) */}
  <p className="text-[10px] text-slate-400 italic mb-1">
    あなたが入力した場所を Google に確認します (キャンセル可能)
  </p>

  {/* bias transparency header */}
  <header className="flex items-baseline justify-between mb-2 pr-6">
    <p className="text-xs font-semibold text-slate-600">
      ✨ 候補から場所を選ぶ (任意)
    </p>
    {biasContext.label && (
      <p className="text-xs italic text-slate-500 truncate" title={biasContext.label}>
        {biasContext.label}
      </p>
    )}
  </header>

  {/* candidates list */}
  {/* ... (v1 通り) ... */}

  {/* skip option (常時 visible) */}
  <div className="mt-3 text-center">
    <button type="button" onClick={onSkip} className="text-xs text-slate-500 underline">
      場所を選ばずに保存
    </button>
  </div>
</section>
```

**Key visual constraints**:

- max-height 240px (overflow-y-auto): mobile modal でも form 全体 scroll を圧迫しない
- close button (× icon): 右上、tap で panel state を "closed"、closed 中は同 locationText で再 fetch しない (= user 意思尊重、新 locationText 入力で reset)
- ARIA `role="complementary"`: assistive technology に "補助 UI" と伝達、modal ではないため focus trap 不要
- privacy hint: 候補表示前に proactive disclosure (Google に query が送信されることを明示)
- skip option: 常時 visible、user が「場所を選ばないで保存」 と選択する path

### 5.8 biasContext を AnchorFormFields から PlaceCandidatesPanel に渡すフロー

```
AnchorFormFields の親 (AddAnchorModal)
  ↓ props: 既存
AnchorFormFields
  ↓ 新規 hook: useBiasContext(formAnchor, recentAnchors)
    fetches:
      - usePlanBaseline (既存、Phase 2-C で実装)
      - useRecentResolvedAnchors (新規、anchor 一覧 + cache 経由で resolved 集計)
      - useGeolocationOptIn (既存、Phase 2-A blocker fix で実装、permission granted 時のみ coord 返す)
PlaceCandidatesPanel
  ↓ props: query (= locationText), biasContext
```

---

## 6. 既存資産流用 (Phase 2-C との重複避け、Phase 2-D で追加部分のみ整理)

### 6.1 完全流用 (touch なし、call signature のみ)

| asset | 使用方法 |
|---|---|
| `placesApiClient.searchPlacesByText` | maxResultCount=5、locationBias 指定 |
| `placesApiClient.isPlacesApiAvailable` | 事前 check |
| `placeResolver.setCachedResolution` | 候補選択時に L1+L2 write (Phase 2-C C1 と同 pattern) |
| `placeResolver.getCachedResolution` | 念のため query→cache hit 確認 (オプション、cost 削減用) |
| `GOOGLE_MAPS_API_KEY` env | server-side Places API 認証 |
| `usePlanBaseline` hook | Phase 2-C で実装、biasContext 算出に再利用 |

### 6.2 流用しつつ拡張

| asset | 拡張内容 |
|---|---|
| `lib/plan/geocodeRateLimit.ts` | `checkAndIncrementPlaceSearchRate` 新 function を additive 追加 (Phase 2-C `checkAndIncrementGeocodeRate` と別 counter、limit 60/hour) |
| `lib/plan/api-helpers` | `requireAuthenticatedUser` / `parseJsonBody` (touch なし) |

### 6.3 新規追加 (Phase 2-D 専用)

| asset | 役割 |
|---|---|
| `app/api/plan/places/search/route.ts` | new endpoint、autocomplete 用 multi-result Places search |
| `app/api/plan/places/cache-write/route.ts` | new endpoint、user 候補選択時の cache 書き込み |
| `app/(culcept)/plan/components/PlaceCandidatesPanel.tsx` | new internal component |
| `app/(culcept)/plan/components/_useBiasContext.ts` | new internal hook (biasContext 算出 + 流用 hooks 合成) |
| `app/(culcept)/plan/components/_useRecentResolvedAnchors.ts` | new internal hook (直近 anchor から bias 候補抽出) |
| tests for above |

---

## 7. Privacy guarantees (Phase 2-C と同 spec、再確認)

### 7.1 outbound payload (Google Places API)

送信 OK:
- `textQuery = query` (trim 後)
- `languageCode = "ja"`
- `maxResultCount = 5`
- `locationBias = { circle: { center: { lat, lng }, radius } }` (bias 指定時のみ)

絶対送信しない:
- anchor.title / notes / sensitiveCategory / userId / 会話 / Personal Model
- 他 anchor の情報
- 認証 token (server-side のみ保持)

### 7.2 client → server payload

送信 OK:
- `query: string` (locationText 値)
- `bias?: { lat, lng, radiusMeters }` (client が選んだ bias coord)

絶対送信しない:
- anchor draft の他 field (title / notes / sensitive)
- 他 anchor の情報
- recent anchor 配列 (server は client 算出済 bias coord のみ受け取る)

### 7.3 server → client response

返却 OK:
- candidate の placeId / name / address / lat / lng / types / distanceMeters

返却しない (server で隠す):
- rich Places API metadata (rating / reviews / photos / phone)
- internal log / debug info

### 7.4 audit log

log: `userId + outcome (cache_hit / api_returned_N / api_throw / rate_limit / validation_fail) + duration_ms`

log しない: query 実値 / bias coord 実値 / Places API response body

### 7.5 sensitive anchor の取扱い

draft anchor に `sensitiveCategory` が設定済の場合:
- **PlaceCandidatesPanel を表示しない** (= sensitive event の locationText を Places API に送らない、Phase 2-C と同 privacy guarantee 維持)
- user は手入力 locationText のままで保存可能
- MapTab で baseline pin 化 (Phase 2-C 整合)

### 7.6 Browser key vs Server key

- 本 wave は **server-side endpoint 経由のみ** (browser から Places API 直接 call なし)
- `GOOGLE_MAPS_API_KEY` (server) で認証
- `NEXT_PUBLIC_ALTER_MORNING_MAPS_BROWSER_KEY` は MapTab の地図描画専用、本 wave で touch なし

### 7.7 AbortController で in-flight fetch cancel (v2 新規、GPT 補正 5+6、W4 完全解決)

`fetch()` を AbortController で wrap し、以下 trigger で abort:

| trigger | abort 必須性 | 効果 |
|---|---|---|
| 新 query (debounce 中) | ✅ | 古い fetch の結果が new query 後に到着しても old result を display しない (race condition 防御) |
| panel close (× button) | ✅ | user 意思の即時尊重、無駄 API call 終了 |
| sensitive set (`false → true`) | ✅ | sensitive 設定後の外送信を最大限抑制 (in-flight でも cancel、cache write 阻止) |
| component unmount | ✅ | memory leak 防御、effect cleanup の標準 pattern |

実装 pattern (§5.6 参照):

```tsx
const abortControllerRef = useRef<AbortController | null>(null);

// fetch 開始時
abortControllerRef.current?.abort();
abortControllerRef.current = new AbortController();
fetch(url, { signal: abortControllerRef.current.signal });

// sensitive 監視
useEffect(() => {
  if (sensitiveCategory) {
    abortControllerRef.current?.abort();
    setPanelOpen(false);
    setResults([]);
  }
}, [sensitiveCategory]);
```

→ 「sensitive 設定済 anchor の locationText が Google に届く」 という worst case を **アーキテクチャ的に阻止**。

### 7.8 Privacy-first hint (v2 新規、GPT 補正 8、proactive disclosure)

PlaceCandidatesPanel header に **常時表示**:

```
あなたが入力した場所を Google に確認します (キャンセル可能)
```

文字サイズ 10px、薄色 italic で subtle。tap で詳細展開可能 (option):

> 検索クエリ (例: "成田のスタバ") と検索バイアス座標が Google に送信されます。
> その他の情報 (予定タイトル / メモ / カテゴリ / 機密設定 等) は送信されません。
> いつでも × でキャンセル、場所を選ばずに保存することもできます。

→ user に **「何が外送信されるか」 を proactive に開示**、Aneurasync 透明性哲学整合。GDPR / privacy-by-design 整合。

---

## 8. Cost guard (Phase 2-C より高頻度 query 想定の autocomplete 用)

### 8.1 多層防御

| 層 | 防御 |
|---|---|
| 1. **debounce 500ms** | user 入力ごとに API call せず、500ms 無入力で 1 回 |
| 2. **min 3 文字** | 短すぎる query は API call しない (= "成" だけで成田 search すると候補多すぎ + cost 無駄) |
| 3. **max 5 results** | server で `maxResultCount=5` 制限 |
| 4. **per-user rate limit 60/hour** | Phase 2-C 100/hour より低め、autocomplete UX 想定の頻度キャップ |
| 5. **same-query dedupe** (client) | 同 query を連続 fetch しない (client-side memo) |
| 6. **fail-open** | rate limit / API throw / network error → results=[] で UI 継続 |
| 7. **request cancel** | user が新 query を打つと前 request を cancel (AbortController) |
| 8. **sensitive anchor は panel 表示しない** | sensitive draft の query は server に送らない |

### 8.2 想定コスト (hypothesis、確定値ではない)

Phase 2-C と同じく **hypothesis**:
- 1 user / day: 10 anchor 作成、各 1-3 query → 1 user / day max 30 Places API calls (heavy)
- 月: 30 × 30 = 900 calls / user / month
- × $0.032 / call = **$28.8 / user / month** (上限ケース、heavy user)
- 通常 user: 1 anchor / day、1-2 query → 30-60 calls / month = **$1-2 / user / month** (hypothesis)

→ Phase 2-C の geocode (low-frequency batch) より cost 高くなる可能性。`actual` は実測必須。
→ §15 中断 trigger に「Places search cost が hypothesis の 2 倍超え」 を明記。

### 8.3 cost mitigation strategy

```
debounce + min length + max results + rate limit + dedupe + sensitive skip
= 同一 user の典型 1 日 query 数を 5-10 に compress
```

### 8.4 Combined budget table (Phase 2-C + Phase 2-D、v2 新規、GPT 補正 7、W5 解決)

Phase 2-C と Phase 2-D で Places API call が **両 wave で発生**。combined hypothesis (確定値ではない):

| wave | endpoint | trigger | hypothesis (通常 user) | hypothesis (heavy user) |
|---|---|---|---|---|
| Phase 2-C | `/api/plan/anchors/geocode` | MapTab open 時、batch resolve、cache hit 70% | **$0.19/user/month** | $3.8/user/month (上限) |
| Phase 2-D | `/api/plan/places/search` | anchor 追加時 autocomplete、debounce + min length + cache | **$1-2/user/month** | $28.8/user/month (上限) |
| **combined** | — | — | **$1.19-$2.19/user/month** | **$32.6/user/month** (極端 worst case) |
| **combined median** | — | (典型 use) | **$1.50/user/month** | — |

→ **実装後 actual を観測必須**、上限 case の 2 倍超え (= combined > $5/user/month median) で §15 中断 trigger 該当。

### 8.5 Observable metrics (v2 新規、運用 dashboard 用)

実装後、Google Cloud Console + Vercel analytics + Supabase admin で観測する指標:

| metric | source | 閾値 / 観測目安 |
|---|---|---|
| **Phase 2-C cache hit 率** | `place_resolution_cache` table の `use_count` 集計 | 60% 以上維持 (50% 以下で §15 trigger) |
| **Phase 2-D cache hit 率** | 同上 (cache write が canonical text key で重複しないか) | 30% 以上目標 (autocomplete は cache miss 多め) |
| **daily calls / user** | server log の `[plan/geocode]` + `[plan/places/search]` count | 通常 user < 5/day、heavy user < 30/day |
| **cost per anchor** | daily Places API spend / daily anchor create count | $0.05-$0.15/anchor (hypothesis) |
| **cost per query** | daily Places API spend / daily place_search call count | $0.032/query (Basic field mask、SKU 単価通り) |
| **429 rate** | server log 429 response count | per user 1 日 0 件目標、>10 件/日で abuse 疑い |

→ 月次 review、threshold 超え → CEO に報告 + §15 trigger 判断。

### 8.6 段階的 limit (v2 新規、GPT 補正 7)

per-user で本来の rate limit (60/hour、Phase 2-D) を超えた場合の段階対応:

| level | 条件 | 動作 |
|---|---|---|
| **normal** | 60 calls/hour 以内 | 通常動作 |
| **warning** | 60 calls 到達 (= rate limit 発火) | client に 429 + Retry-After 3600、user に "少し時間をおいて再試行..." 表示 (現 v1 設計) |
| **soft-disable** (v2 新規) | 1 user で月 500 calls 超え (持続的 abuse / bug) | server で 7 日間 disable、user は手入力 locationText のまま保存可 (= panel 非表示)、CEO に admin notification |
| **hard-disable** (v2 新規) | server-wide で月 cost が hypothesis の 5 倍超え (= combined $7.5+ /user 平均) | server-wide で endpoint 一時 disable、CEO 緊急判断 |

実装上は **warning までを v1 範囲、soft/hard-disable は Phase 2-D 実装の C3 polish で追加**。本 wave で hard-disable 機構を最小実装 (= env flag で endpoint kill switch を準備、Phase 2-D+ で本格運用)。

---

## 9. やらないこと (制約再宣言)

### 9.1 Phase 2-C 継承制約

- ❌ migration / 新 env / 新 dep / @vis.gl
- ❌ MorningMapView 挙動変更
- ❌ Alter Morning logic 改変 (placesApiClient / placeResolver 内部 logic touch なし)
- ❌ ExternalAnchor schema 変更 (lat / lng / placeId 永続化なし、cache 経由のみ)
- ❌ CoAlter / Mirror / /talk / W1-6 / DraftPlan / fallback path

### 9.2 Phase 2-D 固有制約

- ❌ AnchorFormFields の他 field 変更 (本 wave は locationText input 直下に PlaceCandidatesPanel 追加 + biasContext hook のみ)
- ❌ AddAnchorModal の signature 変更
- ❌ PlanClient / HomeSwipeContainer / Modal lock 変更
- ❌ forced selection (skip option 必須、自動選択禁止)
- ❌ browser geolocation auto-prompt (locationOptIn 経由のみ)
- ❌ server-side ML personalization / ranking 改変 (Places API order 尊重)
- ❌ Phase 3 ALTER 提案 flow 接続 (Phase 3 wave 預け)
- ❌ keyboard shortcut for select (mobile-first、tap 最優先)
- ❌ "もっと細かく" disclosure の構造変更 (locationText が disclosure 内にある場合でも、本 wave は **disclosure の中身を変更しない** で済む設計、CEO 別判断で disclosure 外に出すか可)

### 9.3 削除しないもの (irreversibility)

- ✅ AnchorFormFields の他 field (title / date / time / rigidity / category / sensitive 等)
- ✅ Phase 2-A / Phase 2-B / Phase 2-C 実装
- ✅ `place_resolution_cache` table schema
- ✅ existing tests

---

## 10. Commit 階段 (実装 wave 用、v2 補正反映、本 PR では実装しない)

### C1: server endpoints + helpers + tests

**Files**:
- `app/api/plan/places/search/route.ts` (新規、POST autocomplete-style search、`regionCode: "JP"` default + bias 対応)
- `app/api/plan/places/cache-write/route.ts` (新規、候補選択時の cache 書き込み + canonical text を key に使う)
- `lib/plan/geocodeRateLimit.ts` (既存に additive 追加: `checkAndIncrementPlaceSearchRate`、別 counter、60/hour)
- (Optional kill switch flag) `lib/plan/placesSearchKillSwitch.ts` (env flag で server-wide disable、Phase 2-D+ で本格運用、本 wave は minimum 実装)
- `tests/unit/plan/planPlacesSearchRoute.test.ts` (新規、regionCode JP / bias / rate limit / privacy validation / fail-open / abort 対応)
- `tests/unit/plan/planPlacesCacheWriteRoute.test.ts` (新規、canonical text key で write、Phase 2-C cache lookup 整合性確認)

### C2: client UI + hooks + AnchorFormFields refactor (v2 補正で disclosure 構造変更含む)

**Files**:
- `app/(culcept)/plan/components/PlaceCandidatesPanel.tsx` (新規、close button + ARIA `complementary` + max-height + privacy hint + bias transparency + locationText canonical update + skip)
- `app/(culcept)/plan/components/_useBiasContext.ts` (新規 internal hook、§3.6 bias source mapping)
- `app/(culcept)/plan/components/_useRecentResolvedAnchors.ts` (新規 internal hook)
- `app/(culcept)/plan/components/_useSessionRecentPlaces.ts` (新規、session-only in-memory Map、localStorage 不使用)
- `app/(culcept)/plan/components/AnchorFormFields.tsx` (refactor: **disclosure 構造変更**、locationText を主要 field に昇格、PlaceCandidatesPanel を直下に配置、"もっと細かく" disclosure には advanced field のみ残す)
- `app/(culcept)/plan/components/AddAnchorModal.tsx` (signature 不可触、AnchorFormFields の structure 変化は modal 内 layout 整理のみで吸収)
- AbortController pattern: panel close / new query / sensitive set / unmount で in-flight cancel
- tests for hooks / panel + AnchorFormFields refactor 整合性

### C3: Beyond features + cross-tab indicator + smoke docs

**Files**:
- `app/(culcept)/plan/components/PlaceCandidatesPanel.tsx` (Beyond polish: privacy hint + canonical toast)
- `app/(culcept)/plan/components/_useSessionRecentPlaces.ts` (session memory wire + UI 反映)
- Cross-tab `未確定 indicator`:
  - `app/(culcept)/plan/tabs/CalendarTab.tsx` 内 SelectedDayAnchorRow (Phase 2-A) に "🔍 場所未確定" subtle indicator
  - `app/(culcept)/plan/tabs/FlowTab.tsx` 内 AnchorRow (Phase 2-B) に同 indicator
  - `app/(culcept)/plan/tabs/MapTab.tsx` 内 SelectedAnchorCard (Phase 2-C v2) で既存 "場所未定 — baseline 周辺" 文言に統合
- 判定: `anchor.locationText` が空 or canonical 化されていない (= "/ 千葉県成田市..." 形式ではない) → 未確定 indicator 表示
- `docs/alter-plan-home-swipe-visual-smoke.md` (Phase 2-D 追加 smoke section)
- `app/api/plan/places/search/route.ts` の kill switch env flag (Optional、Phase 2-D+ で本格運用)

---

## 11. Smoke 項目 (実装 wave 用)

### 11.1 基本 UX

- [ ] anchor 追加 modal を開く → AnchorFormFields の locationText input が visible
- [ ] locationText に "成田の" と入力 (3 文字未満) → PlaceCandidatesPanel 非表示
- [ ] "成田のスタバ" と入力 (3 文字以上) → 500ms 後に PlaceCandidatesPanel 出現
- [ ] PlaceCandidatesPanel header: "✨ 候補から場所を選ぶ (任意)" + 右に biasContext.label

### 11.2 候補表示

- [ ] 候補 3-5 件表示 (Places API 結果)
- [ ] 各候補: 名前 (太字) + address (薄字) + bias 距離 (e.g., "1.5km from 成田市")
- [ ] 候補 tap → locationText が resolved name に更新 (e.g., "スターバックス 成田空港第1ターミナル店")
- [ ] バックグラウンド cache 書き込み → MapTab open で resolved pin 表示

### 11.3 Skip option

- [ ] panel 下部に "場所を選ばずに保存" link が常時表示
- [ ] tap → panel 閉じる (or 何もしない) + locationText はそのまま
- [ ] anchor 保存 → MapTab で baseline pin (Phase 2-C 整合)

### 11.4 Biasing 戦略 verify

- [ ] **同日 resolved anchor あり**: 「今日の予定 〇〇 の近く」 label、5km radius
- [ ] **同日なし + 直近 30 日 high-freq resolved あり**: 「よく行く 〇〇 の近く」 label
- [ ] **resolved なし + geolocation opt-in granted**: 「現在地の近く」 label
- [ ] **resolved + geolocation なし + baseline home**: 「{home label} の近く」 label
- [ ] **baseline city のみ**: 「{prefecture city} の中」 label、20km radius
- [ ] **何もなし**: biasContext.label = null、bias なし free search

### 11.5 Privacy audit (GPT 補正 2 / Phase 2-C 整合)

- [ ] DevTools Network で `/api/plan/places/search` request body: `{ query, bias? }` のみ、anchor metadata 一切なし
- [ ] sensitive draft (draft anchor が sensitiveCategory 設定済) → PlaceCandidatesPanel 表示しない (server fetch 0)
- [ ] DevTools Network で `places.googleapis.com` は server-side のみ、browser から不可視
- [ ] response に rich metadata (rating / reviews / photos) なし、placeId/name/address/lat/lng/distance のみ

### 11.6 Cost guard (Phase 2-D 固有)

- [ ] debounce: 連続入力 → 500ms 無入力で 1 request、頻発 fetch なし
- [ ] min 3 文字: 短すぎる query は API call なし
- [ ] max 5 results: 候補は最大 5 件
- [ ] rate limit 60/hour: 61 回目 → 429 + Retry-After
- [ ] 同 query 連続 fetch dedupe (client-side memo)
- [ ] request cancel: user が新 query を打つと前 request を cancel (AbortController)

### 11.7 fail-open

- [ ] Places API throw → results=[] panel に "候補が見つかりませんでした" 表示、user は skip で保存可
- [ ] server `GOOGLE_MAPS_API_KEY` 未設定 → apiAvailable=false 返却、panel は "現在候補は使えません" + skip 可
- [ ] network error / 500 → results=[] fail-open、UI ブロックなし
- [ ] rate limit 429 → 一時的に panel 非表示 + "少し時間をおいて再試行..." 文言

### 11.8 anchor 保存後 → MapTab integration

- [ ] PlaceCandidatesPanel で候補選択 → anchor 保存 → MapTab open → 該 anchor が resolved pin で即表示 (cache hit)
- [ ] skip で保存 → MapTab で baseline pin (Phase 2-C 整合)

### 11.9 sensitive anchor の挙動

- [ ] AnchorFormFields で sensitiveCategory を set (medical 等) → PlaceCandidatesPanel が非表示になる (panel が disappear)
- [ ] sensitiveCategory を unset → panel 再表示
- [ ] sensitive のまま保存 → MapTab で baseline pin (locationText に何が入っていても 🔒 + 場所未指定扱い、Phase 2-C 整合)

### 11.10 Alter Morning regression

- [ ] `npx vitest run tests/unit/alter-morning/` 全 PASS
- [ ] MorningMapView / placesApiClient / placeResolver の挙動不変
- [ ] place_resolution_cache table への Plan 経由 write が Morning 側 cache 読み込みで問題なし (= cache 共有が positive 効果のみ)

### 11.11 v2 補正の verification (新規 smoke)

#### W1: disclosure 構造変更
- [ ] AddAnchorModal を open → locationText input が **disclosure 外** に visible (主要 field 化)
- [ ] "もっと細かく" disclosure を開かずに locationText 入力 + PlaceCandidatesPanel 動作確認
- [ ] "もっと細かく" 内には notes / sensitiveCategory / endTime のみ表示

#### W2: post-select edit live update
- [ ] 候補 tap で locationText が canonical text に update
- [ ] update 後の locationText を user が編集 → 500ms debounce 後 panel が **live update** (new query で候補)
- [ ] selectedCandidate と input 値が乖離 → 既存 selection clear、"未確定" 戻り
- [ ] AbortController で前 fetch cancel (Network panel で確認、古い response は無視)

#### W3: canonical text 化 + cache 衝突回避
- [ ] locationText="近所のスタバ" で "Starbucks 成田空港" tap → locationText が "スターバックス コーヒー 成田空港第1ターミナル店 / 千葉県成田市古込1番地" に update
- [ ] subtle toast "場所を「スターバックス コーヒー 成田空港第1ターミナル店」 として保存します" 表示
- [ ] 別 anchor で同じ "近所のスタバ" → 別店舗 tap → canonical 異なる、cache 衝突なし
- [ ] anchor 保存後 MapTab で **resolved pin** (具体 location) 即表示

#### W4: sensitive AbortController cancel
- [ ] AnchorFormFields で locationText 入力 → panel が候補 fetch 中 (loading 状態)
- [ ] sensitiveCategory を "medical" に set → **panel 即 close + in-flight fetch cancel** (Network panel で abort 確認)
- [ ] cache_resolution_cache に write されないこと確認 (server log)

#### W5: combined cost + observable metrics
- [ ] Google Cloud Console で Phase 2-C + Phase 2-D combined daily API call count を観測
- [ ] cache hit 率を `place_resolution_cache` table の `use_count` 集計で確認
- [ ] cost per anchor / cost per query を月次 review

#### regionCode JP
- [ ] DevTools Network で `/api/plan/places/search` request body に regionCode 含まない (server で固定)
- [ ] server log で Places API call が regionCode="JP" で発火 (国内 results のみ返却)

#### Bias transparency
- [ ] panel header に "{bias label} から探しています" 形式の文言表示
- [ ] "?" tap で詳細展開 (= "なぜこの bias?" を user に明示)
- [ ] 7 階層 (same-day / recent / geolocation / home / city / prefecture / none) 各々で文言確認

#### Privacy-first hint
- [ ] panel header 上部に "あなたが入力した場所を Google に確認します (キャンセル可能)" 常時表示
- [ ] text size 10px、薄色 italic で subtle (UI 圧迫しない)

#### Close button + ARIA
- [ ] panel 右上に × icon button 表示
- [ ] tap で panel close、closed 状態は同 locationText で再 fetch しない
- [ ] 新 locationText 入力で panel state reset
- [ ] ARIA: `role="complementary"`、aria-label 含む

#### Cross-tab 未確定 indicator
- [ ] anchor の locationText が空 or canonical 化されていない → CalendarTab AnchorRow / FlowTab AnchorRow / MapTab SelectedAnchorCard に "🔍 場所未確定" indicator 表示
- [ ] canonical 化済み anchor (= "/ 住所" 形式) → indicator 非表示

---

## 12. CEO 判断点 (本 PR merge 後の実装 wave 起票前)

### 判断 1: PlaceCandidatesPanel の表示 trigger
- A. **入力 3 文字以上 + debounce 500ms** (推奨)
- B. user が "場所候補を見る" button tap で発火 (deliberate trigger)
- C. blur (focus 外れる) で fetch

### 判断 2: 候補件数
- A. **最大 5 件** (推奨、cost + UX balance)
- B. 最大 3 件 (cost 重視)
- C. 最大 7 件 (UX 重視)

### 判断 3: rate limit 値
- A. **60 calls / hour** (推奨、Phase 2-C と別 counter)
- B. 100 calls / hour (Phase 2-C と同 limit、別 counter)
- C. 30 calls / hour (cost 重視)

### 判断 4: biasing 優先順位 (§3.1)
- A. **同日 resolved anchor > 直近 30 日 high-freq > geolocation > baseline (home > city > prefecture) > なし** (推奨、CEO 指示反映)
- B. CEO 別案

### 判断 5: Geolocation 利用方針
- A. **既存 locationOptIn システム (Phase 2-A blocker fix で実装済) を流用、permission granted 時のみ bias に使う** (推奨、CEO「強制ではない」 整合)
- B. browser geolocation 直接 prompt (Aneurasync の opt-in 哲学に反、不採用)
- C. Geolocation 不使用 (baseline まで前倒し、CEO 指示の "現在地" を満たさない)

### 判断 6: 候補選択後の cache 書き込み
- A. **picker で選択 → server に POST → place_resolution_cache table に write** (推奨、MapTab 即 cache hit)
- B. anchor 保存時に server 側で再度 geocode + cache write (= 重複 API call、cost 増)
- C. cache write しない、MapTab で都度 geocode (= 重複 API call、確実だが cost 増)

### 判断 7: Sensitive anchor 時の挙動
- A. **PlaceCandidatesPanel を完全非表示** (推奨、privacy 強)
- B. panel 表示するが server に送らない (mock の "skip 推奨" 表示) — 半端

### 判断 8: locationText 直下表示 vs 上 / modal
- A. **input 直下に inline panel** (推奨、mockup 整合)
- B. button tap で modal 開く (UI 複雑化、cost 削減)
- C. dropdown autocomplete style (input と一体感、ただし keyboard 操作の整合性弱)

### 判断 9: "場所を選ばずに保存" skip option の文言
- A. **"場所を選ばずに保存"** (推奨、明示的 skip)
- B. "後で設定する"
- C. "このまま保存"
- D. 文言なし、panel 自動で消える

### 判断 10: 直近 resolved anchor の検索範囲
- A. **直近 7 日 (同日 + 前後 3 日)** (推奨、近接時間 plan を bias に)
- B. 直近 30 日 (高頻度パターン bias、ただし新規場所が出にくい)
- C. 全期間 history (cost / complexity 高)

### 判断 11: Phase 2-D の次フェーズ優先順位
- Phase 3 (ALTER 提案 flow、Stargazer 接続)
- Phase 2-D+ (= 候補に AI-curated suggestions 追加、user の生活パターン学習)
- Phase 2-A+ (Calendar full month grid)
- Real-map enhancement (lat/lng 永続化、 migration あり、別 wave)

---

## 13. 制約遵守

- ✅ docs only (実装 / migration / env 変更 0)
- ✅ Phase 2-A / 2-B / 2-C docs / 2-C impl branch への混入なし (本 PR は新 branch)
- ✅ GitHub 操作 0 (suspension 中、push / pull / fetch / gh 全禁止維持)
- ✅ CoAlter / Mirror / /talk / D-* / W1-6 / DraftPlan / fallback path 不触
- ✅ Production / all-Preview env 不触
- ✅ 新 env / 新 migration / 新 dep / @vis.gl すべて 0 維持
- ✅ MorningMapView / placesApiClient / placeResolver の内部 logic 不可触
- ✅ ExternalAnchor schema 変更なし (placeId / lat / lng 永続化なし、cache 経由のみ)
- ✅ AnchorFormFields の他 field 変更なし (本 wave は locationText input 直下のみ touch)
- ✅ AddAnchorModal / PlanClient 不可触

---

## 14. References

### 既存 files (実装 wave で touch / 流用)

- `app/(culcept)/plan/components/AnchorFormFields.tsx` (本 wave で refactor、locationText 直下のみ)
- `app/(culcept)/plan/components/AddAnchorModal.tsx` (本 wave で touch なし、API 利用のみ)
- `lib/alter-morning/placesApiClient.ts` (流用、内部 logic 不可触)
- `lib/alter-morning/placeResolver.ts` (流用、setCachedResolution call signature のみ)
- `lib/plan/geocodeRateLimit.ts` (additive 拡張)
- `lib/plan/api-helpers.ts` (流用、touch なし)
- `app/(culcept)/plan/tabs/_usePlanBaseline.ts` (Phase 2-C で実装、再利用)
- `place_resolution_cache` table (既存、Phase 2-C と共有)

### 関連設計書

- `docs/alter-plan-phase2-c-map-tab-mini-design.md` v3 (Phase 2-C、本 wave の前例)
- `docs/alter-plan-phase2-b-flow-list-mini-design.md` (Phase 2-B、static ALTER card pattern)
- `docs/alter-plan-w1x1-mini-design.md` (anchor input modal 初版)
- `docs/alter-plan-w1x2-edit-anchor-mini-design.md` (anchor edit modal)
- `docs/alter-plan-home-swipe-visual-smoke.md` (smoke runbook、本 wave で Phase 2-D section 追加)

### 世界トップアプリ参考 (autocomplete / place picker pattern)

- **Google Maps app**: place autocomplete on search input (autocomplete dropdown + tap to select)
- **Apple Maps Add Place**: candidate list with distance from current location
- **Foursquare Add Place**: similar pattern, but checkin-focused
- **Uber destination input**: bias 強 (current location)、recent destinations 優先
- **Calendar app event location**: most apps require explicit choice; Aneurasync は optional + skip 重視

→ Aneurasync Phase 2-D の unique 立ち位置: **strict optional + biased + privacy-safe + sensitive 配慮 + skip recovery via baseline pin**。

---

## 15. 中断 trigger (実装中に CEO 確認に戻る条件)

実装中、以下のいずれかが必要になった瞬間 → **作業中断 + CEO 確認**:

| カテゴリ | trigger |
|---|---|
| migration | ExternalAnchor に placeId / lat / lng 永続化が必要 / place_resolution_cache schema 変更 |
| env | 新 env / 既存 env rename / Plan 用 key 追加 |
| dependency | `@vis.gl` / `@googlemaps/*` / 他 geo / autocomplete 系 dep install |
| Alter Morning 改変 | placesApiClient / placeResolver / placeCacheStore の内部 logic 変更必要 |
| cost spike | Places search call が hypothesis ($1-2/user/month) を **2 倍以上超過** / rate limit 429 が user 当たり >10 回/day |
| privacy | anchor metadata (title / notes / sensitive) を server / Places API に送る必要 / audit log に query 実値が出る |
| forced UI | user に候補選択を強制する design 要求 / skip option 削除 / panel を modal にして閉じれない設計 |
| sensitive leak | sensitive draft の query を Places API に送る必要 |
| scope creep | Phase 3 ALTER 提案 flow 実装 / Phase 2-A/B/C 既存実装の改修 / CoAlter 接続 / W1-6 接続 |

---

## 16. 自立推論 — Beyond 設計 (世界トップアプリ研究 + Aneurasync 哲学)

### 16.1 「強制ではない」 哲学の徹底 (CEO 指示の核心)

CEO は明示的に「強制ではない」 を強調。これは Aneurasync 哲学 (memory: `feedback_no_identity_locks.md`、「全 identity 要素は最初からアクセス可能、ロック禁止」) と整合。

実装的に保証する 5 つの規律:
1. PlaceCandidatesPanel は **常に skip 可能** (= "場所を選ばずに保存" link 常時表示)
2. 自動選択なし (= top result を勝手に locationText に紐づけない、必ず tap 必須)
3. PlaceCandidatesPanel が出ない場合の体験を degrade させない (= 候補なくても locationText 自由入力 OK)
4. sensitive anchor は完全に panel 非表示 (= privacy 強制 + skip 強制両立)
5. skip 後の MapTab UX も完備 (= baseline pin、Phase 2-C の "予定→pin guarantee" 整合)

### 16.2 biasing の Aneurasync unique

世界のトップ autocomplete:
- Google Maps: bias = user 現在地 + 検索 history
- Apple Maps: bias = recent searches
- Uber: bias = current location + frequent destinations

Aneurasync の unique:
- bias = **user の予定 (anchor) 自体**を含む (= "今日の plan の中の流れ")
- = 「成田のスタバで朝、夜に成田駅で飲み会」 → 夜の anchor の場所候補が成田駅近くで bias
- これは「user の生活パターンを尊重する」 Aneurasync 哲学の autocomplete 版

### 16.3 cache 共有による cost amortization

Phase 2-D で `place_resolution_cache` に書き込み、Phase 2-C MapTab 経由でも cache hit:
- user が picker で「成田空港」 を選択 → cache に write
- 翌日 user が "成田 airport" と locationText 入力 → MapTab で normalized dedupe 後 cache hit (resolved pin)
- → Phase 2-C / 2-D 双方で cost を amortize

### 16.4 Empty state philosophy

候補が見つからない場合:
- 旧来: "見つかりませんでした" + 何もしない (= user 困惑)
- Phase 2-D: "候補が見つかりませんでした (このまま保存しても OK)" + skip option 即 visible

→ user に「次の action」 を即提示、行き止まり感を避ける。

### 16.5 sensitive anchor の透明性

panel 非表示時に user が混乱しないよう:
- panel が出ない場合 (sensitive draft) は静かに省く (= 「panel が出ない =正常」 のはず)
- もし user が "panel が出ない、なんで?" と疑問を持ったら、AnchorFormFields の sensitiveCategory 注意書きに「sensitive 設定中は場所候補は出ません (privacy)」 を含める

### 16.6 Performance / UX micro

- debounce 500ms: 入力中の頻発 API call を抑制、user 体感は「タイピング止めたら 0.5 秒後に panel」
- request cancel (AbortController): 古い request の遅延 response が新 query を上書きしない
- 候補 tap 後 panel close (= 確定済を visual に伝達)
- skip option は文字 link (button ではない subtle 表現)

### 16.7 keyboard navigation 配慮 (Beyond、判断後検討)

- desktop で input → arrow down で候補 navigate → enter で confirm
- mobile では tap が中心 (本 wave 必須)
- keyboard nav は Phase 2-D+ 預け (mobile-first で v1 は tap focus)

### 16.8 Beyond v2 追加 (GPT 補正 8 + 自立推論強化、B6-B10)

#### B6. canonical text 戦略 (GPT 採用、§5.4 と整合)

- 候補 tap で locationText を `${displayName} / ${formattedAddress}` 形式に update
- cache key 衝突回避 (W3 解決) + MapTab pin 精度向上 + migration なし
- subtle toast (1.5 秒) で user に transparency
- canonical text が長すぎる場合は UI truncate (display only、storage は full)

#### B7. disclosure 構造変更 (GPT 採用、§1.2 v2 / §10 C2 と整合)

- locationText を AnchorFormFields の主要 field に昇格
- "もっと細かく" disclosure には advanced (notes / sensitiveCategory / endTime) のみ残す
- CEO 指示「教える の奥に埋もれている」 の core 解決

#### B8. Cross-tab "場所未確定" indicator (自立推論強化)

- Calendar/Flow/Map 全 tab で同一 visual ("🔍 場所未確定" subtle text or icon) で表示
- 判定: `locationText` が空 or canonical 化されていない (= "/" 区切りで displayName + address 形式ではない) → 未確定
- 効果: user が「この予定の場所、後で設定したい」 と気づける self-recognition

#### B9. Bias source transparency 7 階層 mapping (§3.6 と整合)

- panel header に「{bias source の自然語} から探しています」 を表示
- "?" tap で詳細展開 (= "なぜこの bias?" を user に明示)
- 7 階層 (same-day / recent freq / geolocation / home / city / prefecture / none) を一覧化

#### B10. AbortController in-flight cancel pattern の徹底 (W4 完全解決)

- panel close / new query / sensitive set / unmount すべてで cancel
- race condition 防御 (古い fetch の結果が new query 後に到着しても無効化)
- sensitive 設定後の外送信を最大限抑制
- worst case (sensitive set 直前に query 発火 + 直後に set) でも、in-flight cancel + cache write 阻止

---

## 17. 変更履歴

| 日付 | 変更 | 承認 |
|------|------|------|
| 2026-05-20 v1 (commit 10c59eca) | Phase 2-D mini design 起票、CEO 指示「予定追加時の明確な場所候補選択」 + GPT 整理を反映。Phase 2-C impl branch (8 commits) の上に 5 段 stacked。docs only。1100 行 17 sections | CEO + GPT review → 5 件 hidden weakness 発見、Option B 採択 |
| **2026-05-20 v2 (本 commit)** | **GPT 8 補正 + 自立推論強化を反映**: ①W1 locationText を disclosure 外昇格 (主要 field、§0.4 やらないこと 解除)、②W2 post-select edit live update + AbortController、③W3 locationText canonical text 化 (cache 衝突回避、migration なし)、④W4 sensitive in-flight cancel、⑤W5 Phase 2-C+2-D combined budget table + observable metrics + 段階的 limit、⑥regionCode JP default、⑦Panel close button + ARIA complementary + max-height + privacy-first hint、⑧Beyond B6-B10 5 件追加 (canonical / disclosure 変更 / cross-tab indicator / bias transparency / AbortController pattern) | CEO 採択待ち (実装 GO 判断) |

---

## 18. GitHub 復旧後の手順 (5 段 stacked branch)

### 18.1 stacked branch 構造

```
local main b07eeab5  (suspension 時点)
   ↑
Phase 2-A 6e37ad38  (feat/alter-plan-phase2-a-calendar-week-strip、5 commits、凍結)
   ↑
Phase 2-B 99e7c02a  (feat/alter-plan-phase2-b-flow-list、3 commits、凍結)
   ↑
Phase 2-C docs 209e5f49  (docs/alter-plan-phase2-c-map-tab-mini-design、3 commits、凍結)
   ↑
Phase 2-C impl HEAD  (feat/alter-plan-phase2-c-map-tab、8 commits)
   ↑
Phase 2-D docs HEAD  (docs/alter-plan-phase2-d-place-picker-mini-design、本 PR、1 commit)
   ↑ (実装 wave 着手後)
Phase 2-D impl  (feat/alter-plan-phase2-d-place-picker、推定 3 commits、未着手)
```

### 18.2 復旧後 procedure (順序通り)

```bash
gh auth status  # suspension 解除確認

# 順番に push & merge
git checkout feat/alter-plan-phase2-a-calendar-week-strip
git push origin feat/alter-plan-phase2-a-calendar-week-strip  # PR #223 更新
# CI / CEO review → merge

git checkout feat/alter-plan-phase2-b-flow-list
git rebase main  # or --onto (squash 時)
git push -u origin feat/alter-plan-phase2-b-flow-list
# 新 PR、merge

git checkout docs/alter-plan-phase2-c-map-tab-mini-design
git rebase main
git push -u origin docs/alter-plan-phase2-c-map-tab-mini-design
# 新 PR、merge

git checkout feat/alter-plan-phase2-c-map-tab
git rebase main
git push -u origin feat/alter-plan-phase2-c-map-tab
# 新 PR、merge

git checkout docs/alter-plan-phase2-d-place-picker-mini-design  # 本 PR
git rebase main
git push -u origin docs/alter-plan-phase2-d-place-picker-mini-design
# 新 PR、CEO review → merge

# (Phase 2-D 採択後、実装 branch を派生)
git checkout main
git pull origin main
git checkout -b feat/alter-plan-phase2-d-place-picker
# C1 / C2 / C3 実装
git push -u origin feat/alter-plan-phase2-d-place-picker
```

---

**End of Phase 2-D Mini Design**. CEO レビュー → 判断 1-11 → 実装 wave (3 commits) GO/NO-GO 判断をお待ちします。

CEO 指示「予定追加時の明確な場所のリンクは追加するときに必要 (ただし、強制ではないようにする)」 を mockup pattern + biasing 戦略 + privacy-safe + cost guard + sensitive 配慮 で実装可能な最小設計に落とし込みました。Phase 2-C で確立した「予定 → pin guarantee + baseline fallback + privacy spec」 を継承しつつ、anchor 追加時の "明確な場所選択" UX を Aneurasync 哲学 (強制ではない / skip 可能 / privacy 強) で組み立て。
