# D2: bag / accessory engine 拡張 — 設計（design gate, 2026-06-01）

**承認**: CEO（2026-06-01 / branch `claude/loving-pike-fa227a` / D2-0 docs-only commit へ）

D1 で 3 候補保証は完成し、 中央 main 配置 + relaxed/smart 差分 + fallback ladder が動いている。 D2 では engine 提案に **bag / accessory を supplemental category として追加**し、 理想画像のような 5 カテゴリ揃いの提案を出せるようにする。

> ⚠️ **触らない領域** （D2 全体共通）:
> UI 再設計 / My-Style persistence / cutout / quota cleanup / weather route / 既存 item 再処理 /
> server purge / IndexedDB 削除 / localStorage 削除 / Supabase / DB / migration / server-sync / external API /
> package 追加 / push / deploy / production canary

---

## 1. read-only 監査結果（確定事実）

### 1.1 wardrobe item のカテゴリ schema（監査 1）

```ts
// app/(immersive)/my-style/_lib/types.ts
type WardrobeItem = {
  category: "tops" | "bottoms" | "outerwear" | "shoes" | "accessories" | "hat" | "other";  // legacy
  categoryMain?: CategoryMain;
  subcategory?: string;
  ...
};

// app/(immersive)/my-style/_lib/taxonomy.ts
type CategoryMain = "outer" | "tops" | "bottoms" | "shoes" | "bag" | "accessory" | "other";
```

**重要点**:
- `categoryMain` は **bag / accessory の両方を持つ正規語彙**（taxonomy.ts L3）
- legacy `category` には bag は無く、 `"accessories"`（**複数形**）と `"hat"` がある
- `categorize` 関数（outfitEngine.ts L102）は `item.categoryMain || item.category` で読み、 現在は bag/accessory を return null（pool 化されない）

### 1.2 accessory の実データ（監査 2）

```ts
// app/(immersive)/my-style/_lib/taxonomy.ts SUBCATEGORY_OPTIONS
{ value: "subcategory.tote",      label: "トート",       categoryMain: "bag" },
{ value: "subcategory.shoulder",  label: "ショルダー",   categoryMain: "bag" },
{ value: "subcategory.crossbody", label: "クロスボディ", categoryMain: "bag" },
{ value: "subcategory.backpack",  label: "バックパック", categoryMain: "bag" },
{ value: "subcategory.scarf",     label: "スカーフ",     categoryMain: "accessory" },
{ value: "subcategory.hat",       label: "帽子",         categoryMain: "accessory" },
{ value: "subcategory.belt",      label: "ベルト",       categoryMain: "accessory" },
{ value: "subcategory.jewelry",   label: "ジュエリー",   categoryMain: "accessory" },
```

- **bag**: 4 種類（tote / shoulder / crossbody / backpack）
- **accessory**: 4 種類（scarf / hat / belt / jewelry）
- watch は subcategory にない（"jewelry" に内包）
- legacy `category: "hat"` は単独存在（accessory.hat への migration map が必要）

### 1.3 OutfitCollage slot 構成（監査 3）

```ts
// app/(culcept)/plan/tabs/_calendar-outfit/outfitCollagePlacement.ts L17
type OutfitSlot = "outer" | "top" | "bottom" | "shoes" | "bag" | "accessory" | "extra";

// SLOT_LAYOUT (L67-)
top:       { leftPct: 50, topPct: 32, scale: 0.50, z: 3 }
bottom:    { leftPct: 55, topPct: 60, scale: 0.50, z: 2 }
outer:     { leftPct: 70, topPct: 35, scale: 0.42, z: 1 }
shoes:     { leftPct: 60, topPct: 86, scale: 0.25, z: 3 }
bag:       { leftPct: 31, topPct: 68, scale: 0.36, rotateDeg: -3, z: 4 }   ← 左下
accessory: { leftPct: 81, topPct: 24, scale: 0.22, z: 5 }                  ← 右上
```

- **slot は bag / accessory 両方既に完備**（OutfitCollage 側は無改修で対応可能）
- **shapeToSlot** マッピング（L34-50）: `shape === "bag" → "bag"`、 `shape === "watch" → "accessory"` も既存
- **重複対策**: 同一 slot に複数 item が来た場合、 z+offset で破綻なく重ねる（L88-98）。 複数 accessory も安全。

### 1.4 engine 側の CategoryGroup 拡張リスク（監査 4）

```ts
// app/(culcept)/calendar/_lib/outfitEngine.ts L100
type CategoryGroup = "outer" | "tops" | "bottoms" | "shoes";

function categorize(item: WardrobeItem): CategoryGroup | null {
  const cat = item.categoryMain || item.category;
  if (cat === "outer" || cat === "outerwear") return "outer";
  if (cat === "tops") return "tops";
  if (cat === "bottoms") return "bottoms";
  if (cat === "shoes") return "shoes";
  return null;  // ← 現在 bag / accessory は null（pool 化されない）
}
```

**影響範囲（Calendar 共用）**:
- `buildCombo` (L240-345): `pools.tops`, `pools.bottoms`, `pools.shoes`, `pools.outer` を直接 reference（**bag / accessory を増やすと型変更が伝搬**）
- `generateDayProposal` (L348-414): `Record<CategoryGroup, WardrobeItem[]>` を初期化（4 key fixed）
- 既存 Calendar test: `companionImpression.test.ts` / `outfitEngineScoringCache.test.ts` / `outfitInvalidation.test.ts` / `sceneWeighting.test.ts` / `moodCorrection.test.ts` / `dressCodeEndpoint.test.ts` 等で indirect に engine を経由

**結論**: CategoryGroup 拡張は **D2-1 で 1 commit にまとめて行い、 Calendar 全テスト PASS を必須条件にする**。 拡張は破壊的ではない（既存 4 key に bag/accessory を追加するだけ・key 削除なし）が、 `Record<CategoryGroup, T>` の網羅性は型レベルで監視される。

### 1.5 scoreCandidate の安全性（監査 5）

bag/accessory の attribute は wardrobe 入力で大半が未設定の可能性が高い。 `scoreCandidate` の各加減点を確認:

| 項目 | 動作 | bag/accessory での挙動 |
|---|---|---|
| `season` | `=== "all" / season → +10`、 `else if (item.season) → -15` | undefined なら**変化なし**（else if が false） |
| `thickness` | `=== recThickness → +10`、 `else if (item.thickness) → +3` | undefined なら**変化なし** |
| `formality` | rank diff で `+15 / +5 / -10` | undefined なら**変化なし**（if 条件で gated） |
| `recentlyWornIds.has(id)` | `-20` | id 一致なら適用、 problem なし |
| `qualityScore` | `+ Math.round(qs/20)` | undefined なら NaN（`Math.round(undefined / 20) = NaN`） |
| `moodShift` | item.formality 必要 | gated |
| persona / satisfaction / rejection / abPreference / rotation | 各サブ関数で fallback あり | (要 D2-2 で再確認) |

**NaN リスク 1 件**:
- `qualityScore` 行（L?）: `if (item.qualityScore) score += Math.round(item.qualityScore / 20);` ← **`if` で gated** なので undefined なら **加点なし**。 NaN にはならない。 安全。

**境界リスク**:
- `selectedItems.length < 2` で null（outfitEngine.ts L331）。 これは tops/bottoms/shoes が最低 2 件無いと proposal が成立しない既存仕様。 bag/accessory **だけ**でも proposal が成立する設計にしてはいけない（D2 でも supplemental に留める根拠）。

**結論**: scoreCandidate の NaN リスクは無い。 ただし bag/accessory に formality/season 等が未設定だと「スコア中性（+50 ベースのまま）」となり、 main の formality 軸調整に乗らない。 D2-2 で **bag/accessory に対する formality 判定を「main の他 item の formality に合わせる」or「無評価」とするかの設計が必要**。

### 1.6 D1 helper / diffScore への影響（監査 6）

`ensureThreeProposals.ts` の現状:
- `OUTER_CATEGORY_LABEL = "アウター"` で outer 有無差を +0.5 加点（diffScore L86-89）
- swap-by-axis は WardrobeItem の formality と categoryMain/category を見て同カテゴリ swap
- bag/accessory が proposal に含まれた場合:
  - `diffScore`: id 対称差で自動カウント（特別扱い不要）
  - `swap-by-axis`: bag/accessory の formality は通常未設定 → swap pool 候補ゼロ → null 返却で問題なし
  - `assignRolesFromEngine`: variant 判定は engine.OutfitProposal.id prefix のみで category 非依存 → 影響なし

**結論**: D1 helper は bag/accessory が混じっても破綻しない。 ただし「**bag だけ違う候補を意味ある差分**」と扱うかの設計判断は別途（次節）。

---

## 2. supplemental category 方針（CEO 暫定方針の正式化）

```
tops / bottoms / shoes   : outfit 成立に必須（< 2 で null）
outer                    : 気温・季節・天気で条件付き追加
bag / accessory          : supplemental — 提案の見栄え・実用性を上げる補助要素
```

### 2.1 不変原則
- **bag / accessory が無いせいで proposal 全体が null になる設計にしない**（CEO 指示）
- **bag / accessory のみで outfit 成立としない**（既存 `selectedItems.length < 2` 境界を維持）
- **bag / accessory を必須スコアリング対象に含めない**（main の formality/season 軸を歪めない）
- **diff 主軸にしない**（diffScore の primary 判定は tops/bottoms/shoes/outer。 bag/accessory は副次的 id 差分のみ）

### 2.2 選定条件（D2-2 で実装）
- **bag**:
  - 外出 anchor あり（`events` に meeting / commute / school / outing 等）→ 1 件追加
  - 完全在宅日（events 空 or sports/loungewear のみ）→ なし
  - pool に複数あれば最も高いスコアを選ぶ（formality は main の他 item から推測）
- **accessory**:
  - `requiredFormality === "smart" || "dress"` の日 → 1 件追加（scarf / jewelry / belt 優先）
  - 寒冷日（`weather.temp_max < 10` 等）→ scarf 追加候補（ただし D2 では深追いせず、 next iteration へ）
  - pool に複数あれば 1 件のみ採用（D2 では最大 1 件）

### 2.3 「main の他 item から formality を推測」の最小実装案
```ts
// pseudo
const baseFormality = mode(selectedItems.map(i => i.formality).filter(Boolean));
// baseFormality に合う bag/accessory を pickBest
```
- 最頻値（mode）を取り、 同 formality の bag/accessory を優先
- 未設定の bag/accessory はどの formality にも採用可（中性扱い）
- 過剰なペナルティは付けない

---

## 3. D2 commit 分割

| commit | スコープ | 触るファイル |
|---|---|---|
| **D2-0** | 本ドキュメント + decision-log 1 行 | `docs/plan-outfit-bag-accessory-design.md` / `docs/decision-log.md` |
| **D2-1** | `CategoryGroup` 拡張 + `categorize` 更新（pool 作成のみ、 buildCombo 未配線）+ Calendar 全テスト PASS 確認 | `app/(culcept)/calendar/_lib/outfitEngine.ts` |
| **D2-2** | `buildCombo` 末尾で bag / accessory を条件付き選定 + `inferBaseFormality` helper + 既存 Calendar 振る舞い不変回帰 test | 同上 + 新規 unit test |
| **D2-3** | adapter 側の `VARIANT_TITLE` / `wardrobeItemToVM` で bag/accessory の表示確認（ほぼ無改修）+ end-to-end integration test（plan 側） | `app/(culcept)/plan/tabs/_calendar-outfit/outfitEngineAdapter.ts`（必要なら）+ `tests/unit/plan/outfitEngineAdapter.test.ts` |
| **D2-4** | docs close + decision-log 追記 | `docs/plan-outfit-bag-accessory-close.md` / `decision-log.md` |

各 commit の制約:
- 既存 Calendar test を 1 件も壊さない（`tests/unit/calendar/*.test.ts` 全 PASS が D2-1 / D2-2 / D2-3 の必須条件）
- plan 全テスト退化なし
- eslint clean + tsc 差分内 0
- Section 8 三点確認

---

## 4. リスク / 要 CEO 判断ポイント

### 4.1 engine 本体（`generateDayProposal`）に触る承認
D1 では「engine 不可触」だったが、 D2 はこれを限定的に解除する必要がある。
- 変更箇所: `CategoryGroup` の union 拡張、 `categorize` の return 拡張、 `buildCombo` 末尾に **2 行追加**（bag / accessory 選定）
- 既存挙動への影響: 既存 tops/bottoms/shoes/outer の選定ロジックは**完全に不変**。 bag/accessory は末尾追加で `selectedItems.push` するだけ。

### 4.2 既存 Calendar test の前提を壊さないか
- Calendar テストは category 判定（`categorize`）を直接 assertion していない（indirect 参照）
- `pools` 構造は内部実装で外部 export していない → 拡張は API 互換
- 既存 test wardrobe data に bag/accessory item が混在しているケースを **D2-0 完了直後の D2-1 着手前に 1 回実行**して baseline 確認する（D2-1 mini plan に明記）

### 4.3 selectedItems.length < 2 境界
- 既存 boundary を維持。 bag/accessory のみでは null。
- ただし bag/accessory が tops/bottoms/shoes に加算されて push されるため、 件数判定の閾値は触らない

### 4.4 diff 保証への含め方（CEO 質問 #6 への回答）
**結論**: D2 では bag/accessory を diff 主軸にしない（CEO 提案 B 採用）。
- `diffScore` の主判定は tops/bottoms/shoes/outer の id 差分のまま
- bag/accessory は id 集合に自動的に含まれるため、 副次的 diff として効く（特別扱い無し）
- 「bag だけ違うけど main/bottoms 同じ」のような候補は **完全一致扱い**にして mock pad 置換しない（既存 diffScore ≥ 1 の閾値で自然に通る or 通らない）
- 別軸として bag/accessory 有無差を加点する設計は D3 以降の検討事項

---

## 5. D2-1 mini plan（先取り）

D2-0 close 後の D2-1 で実施:

1. **read-only 確認**:
   - 既存 Calendar test を全件 PASS 状態で baseline 記録（`npx vitest run tests/unit/calendar`）
   - `companionImpression.test.ts` / `outfitEngineScoringCache.test.ts` 等 6 ファイルの内容を読み、 bag/accessory が wardrobe fixture に存在するか軽く監査
2. **`CategoryGroup` 拡張**:
   ```ts
   type CategoryGroup = "outer" | "tops" | "bottoms" | "shoes" | "bag" | "accessory";
   ```
3. **`categorize` 更新**:
   ```ts
   function categorize(item: WardrobeItem): CategoryGroup | null {
     const cat = item.categoryMain || item.category;
     if (cat === "outer" || cat === "outerwear") return "outer";
     if (cat === "tops") return "tops";
     if (cat === "bottoms") return "bottoms";
     if (cat === "shoes") return "shoes";
     if (cat === "bag") return "bag";
     if (cat === "accessory" || cat === "accessories" || cat === "hat") return "accessory";
     return null;
   }
   ```
   - legacy `"accessories"` (複数形) と `"hat"` を accessory に migration
4. **`pools` 初期化拡張**:
   ```ts
   const pools: Record<CategoryGroup, WardrobeItem[]> = {
     outer: [], tops: [], bottoms: [], shoes: [], bag: [], accessory: [],
   };
   ```
5. **`buildCombo` は未変更**（bag/accessory pool に items が入るが pickBest は呼ばない＝ proposal に含まれない）
6. **検証**: Calendar 全テスト PASS / plan 全テスト退化なし / eslint clean / tsc 差分内 0
7. **commit**: `feat(calendar): D2-1 extend CategoryGroup with bag/accessory pools (no buildCombo wiring yet)`

---

## 6. D2-1 完了後に進む基準

- Calendar 全テスト 1 件も退化なし
- plan 全テスト 1 件も退化なし
- tsc 差分内 0
- CEO 確認 → D2-2 mini plan 提出 → CEO 承認 → D2-2 着手

---

## 7. State Safety
- 本ドキュメントは docs-only commit（D2-0）
- 以降の D2-1 / D2-2 / D2-3 は実装 commit。 commit ごとに Section 8 三点確認、 個別 file add、 一時 instrumentation は commit しない。
- D2 全体が close するまで `push` / `deploy` は行わない。
- engine 本体に触る前は必ず Calendar 全テストの baseline を確認する（D2-1 の冒頭で 1 回）

---

## 8. GO / NO-GO
- **D2 design gate: GO（docs-only commit へ）**
- **D2-1 着手は CEO の D2-0 承認後**
- 累計 commit 目安: D2-0（docs） + D2-1（pools 拡張） + D2-2（buildCombo 配線） + D2-3（adapter/plan 確認）+ D2-4（docs close）= **5 commits**

---

# D2 close（2026-06-01）

**承認**: CEO 最終 PASS（2026-06-01 / branch `claude/loving-pike-fa227a`、 D2 全実装完了）

D2 設計の全 5 段階を実機 PASS で完了し、 close とする。 wardrobe に bag / accessory を含めて `/plan` を開くと、 engine path で 5 カテゴリ揃った 3 候補が中央 main で表示されることを CEO 実機確認済み（D2-3 黙示確認）。

## D2 累計 commit（5 commits）

| | commit | 役割 |
|---|---|---|
| 1 | `271b2dec` | **D2-0 design docs**（本ドキュメント。 read-only 監査 6 項目 + supplemental 方針確定） |
| 2 | `6ddd1383` | **D2-1 pools 拡張（no-op）** — `CategoryGroup` に `"bag" \| "accessory"` 追加 / `categorize` で正規 + legacy migration（`"accessories"`/`"hat"`→accessory）/ pools 6 key 初期化。 buildCombo 未配線で UI に出ない段階。 |
| 3 | `c8e87da4` | **D2-2 supplemental selection** — buildCombo 末尾に bag/accessory を条件付き push。 needsBag = engine 既知 4 種（`work / meeting / date / party`）、 needsAccessory = baseFormality `smart \| dress`。 `scoreCandidate` 未接触、 既存 outfit 成立判定（`selectedItems.length < 2`）も不変。 |
| 4 | `ba1fa183` | **D2-3 adapter pass-through 固定（test-only）** — 実 import path `"@/lib/shared/outfitEngine"` + 実 `CATEGORY_MAIN_JA` label（`"バッグ"` / `"小物"`）で end-to-end test。 production code 0 行変更。 |
| 5 | （本コミット） | **D2-4 close docs** — design docs に本 section 追記 + decision-log 1 行。 |

## 確定した実装仕様（D2 結論）

### bag / accessory が engine proposal に supplemental として入る
- pool: `categoryMain="bag" / "accessory"`、 legacy `"accessories"` (複数形) / `"hat"` は accessory pool へ migration（D2-1）
- 選定: `buildCombo` 末尾で `selectedItems.length < 2` 判定**通過後**に末尾 push（D2-2）

### bag / accessory は必須カテゴリではない
- 主軸（必須）= tops / bottoms / shoes（既存）
- 条件付き = outer（気温・季節）
- **supplemental = bag / accessory**（無くても proposal は成立）

### bag / accessory が無くても proposal は成立する
- pool 空 → `if (pools.X.length > 0)` で skip → proposal は既存 4 カテゴリのまま成立
- `selectedItems.length < 2` 境界は据え置き（bag/accessory のみでは null）
- adapter contract test ⑤⑥ + buildCombo end-to-end test ⑤⑧ で固定

### D2-2 の needsBag は work / meeting / date / party に限定
- TPO_FORMALITY_MAP の正規 8 種（`constants.ts:27`）から、 外出が確実な 4 種のみ採用
- `casual / outdoor / sports / travel` は安全側で除外（在宅可能性 + 多義性）
- 未知 event_type も false（過剰広げ防止）
- 実装: `BAG_REQUIRED_EVENT_TYPES = new Set(["work", "meeting", "date", "party"])`

### accessory は smart / dress gate で採用する
- `inferBaseFormality(selectedItems)`: 既選択 items の formality 最頻値
- gate: `inferBaseFormality(items) ?? adjustedFormality` が `"smart" \| "dress"` なら採用
- baseFormality null（全 item formality 未設定）→ variant 補正後の adjustedFormality fallback
- → wardrobe に formality 属性が全く無くても variant=dressy 等で accessory を出せる
- **採用 gate 専用** — scoring には流さない（CEO 補正 2 = A 採用）

### scoreCandidate には触っていない
- `app/(culcept)/calendar/_lib/outfitEngine.ts` の `scoreCandidate` 関数は **D2 全体で 1 文字も変更なし**
- bag/accessory のスコアリングは既存 `if (item.X)` ガードで未設定属性を中性扱い（NaN リスクなし、 D2-0 監査で確認）
- formality 軸での bag/accessory weighting は **D3 以降の検討事項**

### UI / OutfitCollage は無改修で通った
- D2-0 監査の予測どおり、 production code 変更は engine 1 ファイル（outfitEngine.ts）のみ
- adapter (`wardrobeItemToVM` + `CATEGORY_MAIN_JA`) 既に bag/accessory 対応済 → 無改修
- D1 helper (`ensureThreeProposals` / `diffScore` / `swap-by-axis`) → 無改修（id 対称差は bag/accessory が混じっても破綻しない）
- hook (`useCalendarOutfit`) → 無改修（patch.proposals を流すだけ）
- UI (`OutfitCarousel` / `OutfitCard` / `OutfitCollage`) → 無改修（`OutfitSlot` に bag/accessory 完備・SLOT_LAYOUT 配置済）
- D2-3 は **test-only commit** で済んだ

### 実画面上でも正常動作を確認した（2026-06-01）
CEO 実機確認: wardrobe に bag + accessory を含めて `/plan` を開くと、 engine path のおすすめコーデに bag / accessory が反映されることを目視確認。 D1 既存挙動（3 候補保証・写真表示・中央 main）も維持。

## D2 で触っていない領域
UI 全体再設計 / My-Style persistence / cutout 生成・C1L-5 / quota cleanup / weather route / 既存 item 再処理 / server purge / IndexedDB 削除 / localStorage 削除 / Supabase / DB / migration / server-sync / external API / package 追加 / push / deploy / production canary / `ensureThreeProposals.ts` / `outfitEngineAdapter.ts` の production code（D2-3 は test-only）/ `useCalendarOutfit.ts` / `OutfitCollage.tsx` / `scoreCandidate` 関数本体

## 検証総括
- Calendar 全テスト: **236 PASS**（D2 開始時 202 → 236、 +34 = 新規分のみ、 退化 0）
- plan 全テスト: **3501 PASS**（D2 開始時 3495 → 3501、 +6 = 新規分のみ、 退化 0）
- eslint: **clean**
- tsc: 全体 **1116 baseline 維持** / 自分のファイル **差分内 0**

## 残課題 / D3 候補（着手は CEO 判断・別ターン）

### チューニング候補
1. **travel で bag を出す**: 旅行確定の event_type で bag whitelist を拡張するか（D2-2 では安全側除外）。 backpack 優先などの subcategory 整合も同時検討
2. **寒い日 scarf 優先**: `weather.temp_max < 10°C` 等で accessory pool 内 `subcategory.scarf` を優先
3. **accessory 複数対応**: 現在 max 1 件。 dress 時の belt + jewelry など 2 件並列採用
4. **雨日 bag 防水**: 既存 shoes の water フィルタパターンを bag にも展開（`item.attributes?.water === "waterproof" / "repellent"`）

### 拡張候補（D1 helper への限定変更が必要）
5. **bag/accessory を diff 主軸に取り込む**: 「bag だけ違う候補」を意味ある差分と扱う（D1 helper `diffScore` への加点）
6. **bag subcategory による formality 整合**: smart event 時に backpack ではなく tote/shoulder を優先（subcategory 別 weight）

### audit 候補
7. **hydrated_mock path** で wardrobe の bag/accessory が mock スロットに patch されるか確認（`wardrobeToOutfit.hydrateOutfitVM` の slot mapping 監査）
8. **accessory subcategory** による gate 精緻化（hat=季節 / belt=casual 可 / jewelry=dress 専用）

### scoring 軸への進出（要 CEO 判断）
9. **scoreCandidate に bag/accessory 用 weight 追加**: D2 では未接触原則を守ったが、 D3 で限定的に解除するか

D3 詳細計画は D2-4 完了報告と同時に提出する。
