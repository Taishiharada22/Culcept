# Alter Plan Phase 2-F — Place Identity Contract / 場所アイデンティティ表示契約 Mini Design

**Status**: docs only (local 起票、未 commit)
**Date**: 2026-05-21
**Branch**: `feat/alter-plan-phase2-f-display-coherence` (= Phase 2-E commit `677b7b6a` 起点)
**Pre-requisite**: Phase 2-D (`cda09ef1`) / Phase 2-E (`677b7b6a`) 凍結済
**Author**: Claude × CEO (Aneurasync) — GPT/CEO 補正 7 点反映版 (= 当初 3 点 + 思想昇格 4 点)

---

## 0. 一行 summary

> Plan の anchor がどの tab で見られても 「同じ場所」 として **一瞬で同定** できる **Place Identity Contract (場所アイデンティティ表示契約)** を確立する。
>
> Phase 2-D で実装した canonical location text helper を、3 tab + AnchorDetailModal で **3 段階表示密度** (Compact / Detail / Machine) に分け、「住所を短くする」 ではなく「**認知負荷を下げる**」 を成功条件とする。

---

## 1. 背景と問い

### 1.1 Phase 2-D/E が解いたこと vs 解いていないこと

| 完成済 | 未完成 (= Phase 2-F の gap) |
|--------|-------------------------|
| canonical text の保存 / parse helpers | 3 tab で canonical full text がそのまま表示 → visual noise |
| 場所未確定 indicator (Phase 2-D C3) | AnchorDetailModal で canonical を 2 行表示する余地 |
| 時刻重なり indicator (Phase 2-E) | `extractDisplayNameForUI` / `parseCanonicalLocationText` が codebase で **0 使用** |

`grep -rn "extractDisplayNameForUI\|parseCanonicalLocationText" app/ lib/` 確認 → **使用 0 件**。
Phase 2-D C3 §19.7 で future improvement として明示的に deferred されたまま。

### 1.2 Phase 2-F が解く問題

> canonical text を保存している anchor が、3 tab で **「スターバックス 成田空港店 · 千葉県成田市古込1番地」** のような長い canonical full text として表示される。
> AnchorDetailModal でも同じ canonical full が 1 行 + category prefix で出ている。
>
> 視認 noise が高く、世界トップ calendar / map app (Apple Maps / Google Maps / Notion / Airbnb 等) の **主名 / 補助 階層表示** から外れる。
> Phase 2-D で確立した canonical text 設計を、表示 layer で活かしきれていない。

### 1.3 「表示 polish」 ではなく 「Place Identity Contract」 として再定義 (= GPT/CEO 思想昇格)

Phase 2-F は単なる文字列処理ではない。**場所アイデンティティ表示契約** = Plan の anchor がどの tab で見られても「同じ場所」 として一瞬で同定できる **UI 契約** を立てる。

- Plan は user が **同じ予定を複数 tab で見る** UI (= Calendar / Flow / Map / Detail)
- tab ごとに locationText の表示が違うと、user は「これは別の場所か?」 と疑念を抱く (= cognitive load 増)
- 「同じ anchor は どこで見ても 同じ場所」 = **identity contract** を立てれば、user は 1 秒で生活パターン理解できる

これは Phase 2-E (= 時刻重なり気付き) と対の構造:
- Phase 2-E: anchor の **時間構造**
- Phase 2-F: anchor の **場所アイデンティティ**
- Phase 2-E + Phase 2-F = **anchor identity 全体**

Aneurasync 「第二の自己」 思想と整合: Alter が user 自身の代理として生活を understand するには、anchor identity の不変性が前提。

### 1.4 Phase 2-F が **解かない** 問題 (CEO 明示)

- ❌ MapTab Geolocation API による現在地 fallback → **Phase 2-G に分離**
- ❌ 3 tab で anchor selection 状態統一 → 不要
- ❌ canonical text の保存形式変更 → round-trip 整合性壊す
- ❌ 場所未確定 / 時刻重なり indicator の判定 / 表示変更 → 完全不変
- ❌ AddAnchorModal / EditAnchorModal の保存挙動 → 完全不変
- ❌ migration / env / dependency 追加
- ❌ GitHub push / PR / remote ops

---

## 2. 設計原則 (CEO/GPT 補正 7 点 = 最重要制約)

### 2.0 Place Identity Contract = 3 段階表示密度 (GPT/CEO 補正 4 反映)

Phase 2-F は表示密度を **3 段階** に分けて契約する。各層は独立した責務を持つ:

| 密度 | 表示場所 | 内容 | 目的 |
|------|---------|------|------|
| **Compact density** | Calendar / Flow / Map SelectedAnchorCard | `primary` のみ | **一瞬の同定** = 同じ anchor を tab 間で迷わず認識 |
| **Detail density** | AnchorDetailModal | `categoryLabel` + `primary` + `secondary` | **詳細の開示** = progressive disclosure による情報リッチ |
| **Machine density** | 保存値 (DB の `locationText`) | canonical `displayName · address` 保存形式 | **data 整合性** = round-trip 不変、Phase 2-D 凍結 |

#### この 3 段階契約が解く問題

| 単一密度の問題 | 3 段階契約の解 |
|--------------|--------------|
| 全 tab で full canonical 表示 → 視覚 noise、anchor 同定遅い | Compact で primary のみ → 1 秒同定 |
| 全 tab で displayName のみ → 詳細情報失われる | Detail で full 開示 → 情報量保持 |
| 保存値を short text に変更 → round-trip 壊す | Machine 不変 → Phase 2-D 凍結維持 |

#### 三層 invariant (Phase 2-D / 2-E / 2-F の責務分離、自立推論で明文化)

| Layer | Phase | 責務 | 不変性 |
|-------|-------|------|------|
| **Data layer** | 2-D (凍結) | canonical `displayName · address` 保存形式 / parse / format helpers | 永続不変 |
| **Decision layer** | 2-D C3 / 2-E (凍結) | `isPlaceUnconfirmed` / `detectTimedAnchorOverlaps` の判定 | 永続不変 |
| **Display layer** | 2-F (新規) | `formatLocationDisplayParts` による 3 段階表示密度 | 新規追加、既存 caller 不変 |

→ Phase 2-F は **Display layer の確立**。Data / Decision layer には一切 touch しない。

---

## 3. CEO/GPT 補正 7 点 (= 設計の最重要制約)

### 補正 1: `formatLocation(anchor)` の戻り値仕様は **変更しない**

既存 caller を壊す可能性があるため、**別 helper を追加** する:

```ts
/**
 * Phase 2-F (新規): canonical location text の display 用 part 分解。
 *
 * 既存 formatLocation(anchor): string は **不変** (他 caller がいる可能性)。
 * 本 helper は AnchorDetailModal + 3 tab で display layer 専用に使う。
 *
 * 補正 3 反映: locationCategory と locationText を **混ぜて parse しない**。
 *   - parseCanonicalLocationText に渡すのは anchor.locationText のみ
 *   - categoryLabel は LOCATION_CATEGORY_LABEL[anchor.locationCategory] から直接取得
 */
export function formatLocationDisplayParts(anchor: ExternalAnchor): {
  categoryLabel?: string;
  primary?: string;     // 主名 (displayName 抽出 or fallback)
  secondary?: string;   // 補助 (canonical なら address、そうでなければ undefined)
};
```

### 補正 2: `extractDisplayNameForUI` が空文字を返しても locationText 行を **非表示にしない**

```
primary = extractDisplayNameForUI(locationText) || locationText.trim() || undefined
```

「視覚 noise 削減」 より 「**保存情報が消えない**」 を優先。

malformed canonical (e.g. `" · 千葉県成田市"`) でも、user が入力 / 保存した情報を消さない。

具体動作:
- `extractDisplayNameForUI(" · 千葉県成田市")` → `""` (parse 後 displayName 空)
- fallback: `locationText.trim()` = `"· 千葉県成田市"`
- → primary に `"· 千葉県成田市"` として表示 (= 消えない)

### 補正 3: `locationCategory` と canonical `locationText` を混ぜて parse しない

既存 `formatLocation(anchor)` は `${catLabel} / ${text}` で 1 行結合した文字列を返す。**この結合文字列を parse 対象にしない**:

```ts
// ✅ 正しい (補正 3)
const { displayName, address } = parseCanonicalLocationText(anchor.locationText);
const categoryLabel = anchor.locationCategory ? LOCATION_CATEGORY_LABEL[anchor.locationCategory] : undefined;

// ❌ 禁止 (補正 3 違反)
const { displayName, address } = parseCanonicalLocationText(formatLocation(anchor));
```

categoryLabel は別 field として返す。display 側で categoryLabel と primary を別表示する。

### 補正 4: 3 段階表示密度の明文化 (GPT 補正、§2.0 で完全展開)

Compact (= 3 tab) / Detail (= AnchorDetailModal) / Machine (= 保存値) の 3 段階を契約として固定。
詳細は §2.0 参照。

### 補正 5: visible text と accessible label を分ける (GPT 補正)

世界トップ accessibility 設計に倣う:

```
画面 visible: 「スターバックス 成田空港店」 (= primary のみ、Compact density)
title 属性 / aria-label: 「スターバックス 成田空港店、千葉県成田市古込1番地」 (= fullLabel)
```

利点:
- 視覚 noise を減らしながら、**情報を失わない**
- mouse hover で full 情報、screen reader で full 情報
- assistive UI / 高 contrast モード / touch + voice over も整合

実装方針:
- helper の戻り値に `fullLabel?: string` を追加
- 構成: `fullLabel = primary + "、" (全角読点) + secondary` (= 日本語 a11y label として自然な区切り、読点であって句点ではない)
- `categoryLabel` は **fullLabel に含めない** (= 分類は場所そのものではない、GPT 指摘)
- secondary なし → fullLabel は primary のみ (= 短文 anchor の場合)
- primary なし → fullLabel undefined

過剰実装にしない: `fullLabel?: string` を helper return に 1 field 追加するだけで、UI 側は `title={fullLabel ?? undefined}` で 1 行 wire-up。

**title / aria-label 方針 (CEO 補正 2026-05-21 反映、正確化)**:
- `fullLabel` は **原則 `title` 属性に入れる** (= mouse hover で tooltip)
- `aria-label` は **clickable row / button / card など、支援技術上の名前として意味を持つ要素に限って** 使う
- **非 interactive な `<p>` / `<span>` には機械的に `aria-label` を付けない** (= aria-label 濫用は screen reader noise になる、W3C ARIA 1.2 仕様遵守)
- visible text は `primary` のみのままで OK
- 既存の anchor row 全体の `aria-label="{anchor.title} の詳細を見る"` (= Phase 2-D C3 既存) は **完全不変** (= location 情報を組み込まない、別 layer の名前)

### 補正 6: `categoryLabel === primary` の重複表示禁止 (GPT 補正)

**問題ケース**: `locationCategory = "home"` + `locationText = "自宅"` のとき:
- categoryLabel = `"自宅"`
- primary = `"自宅"`
- → Detail で 「自宅 / 自宅」 の 2 段表示 = **ダサい / 認知負荷増**

**解決ルール**:
```
Detail 上の categoryLabel 表示は、categoryLabel === primary なら **抑制**。
```

実装: helper 内で吸収 (= 推奨、CEO 推奨):

```ts
type LocationDisplayParts = {
  categoryLabel?: string;        // 元の category label (= 表示判断用には使わない)
  displayCategoryLabel?: string; // UI 用 = category != primary のときだけ値を持つ
  primary?: string;
  secondary?: string;
  fullLabel?: string;
};
```

比較は **trim 後** (= whitespace 差を吸収、自立推論で追加):
```ts
const norm = (s: string) => s.trim();
displayCategoryLabel =
  (categoryLabel && primary && norm(categoryLabel) === norm(primary))
    ? undefined
    : categoryLabel;
```

UI 側は `displayCategoryLabel` を使う、`categoryLabel` は raw 情報として保持 (= debug / test / future 用)。

### 補正 7: success criteria を 「短くなった」 ではなく 「**認知負荷が下がった**」 に再定義 (GPT 補正)

Phase 2-F の **成功条件**:

```
Phase 2-F success is NOT:
- ❌ location text became shorter
- ❌ 住所が消えた
- ❌ display が綺麗になった

Phase 2-F success IS:
- ✅ The same anchor is recognized as the same place across Calendar / Flow / Map within one glance.
  同じ anchor が Calendar / Flow / Map のどこで見ても 1 秒で「同じ場所」 と認識できる
- ✅ Address-level detail is still available in AnchorDetailModal.
  住所詳細は AnchorDetailModal で常に確認可能
- ✅ No saved location information appears lost.
  user が保存した location 情報は一切消えない (= 補正 2 の fallback で担保)
- ✅ Existing uncertainty / overlap indicators remain more visually salient than address noise.
  場所未確定 / 時刻重なり indicator が住所 noise に埋もれず、より目立つ状態を維持
- ✅ No duplicate category/primary lines appear.
  category と primary が重複した冗長な 2 段表示が出ない (= 補正 6)
- ✅ Accessibility / hover で full 情報を失わない (= 補正 5)
```

→ 成功判定は smoke 段階で CEO が user 視点で「**1 秒で生活パターン理解できる**」 を体感確認。

---

## 4. Helper 設計

### 4.1 新規 helper: `formatLocationDisplayParts`

**配置**: `lib/plan/anchor-detail-format.ts` (既存 file に追加、`formatLocation` の隣)

```ts
import { parseCanonicalLocationText } from "@/lib/shared/canonicalLocationText";
// LOCATION_CATEGORY_LABEL は既存定数を再利用

export interface LocationDisplayParts {
  /** raw category label (debug / 内部用、UI は displayCategoryLabel を使う) */
  categoryLabel?: string;
  /**
   * UI 用 category label (= 補正 6 反映):
   *   categoryLabel === primary (trim 後比較) の場合 undefined にし、重複表示を抑制。
   *   それ以外は categoryLabel と同値。
   *   AnchorDetailModal はこの field を使う。
   */
  displayCategoryLabel?: string;
  /** 主名: displayName 抽出後 (空なら locationText.trim() fallback)。locationText 空なら undefined */
  primary?: string;
  /** 補助: canonical なら address、それ以外 undefined */
  secondary?: string;
  /**
   * Accessibility / hover 用 full label (= 補正 5 反映):
   *   primary + "、" (全角読点) + secondary で構成 (= 日本語 a11y label として自然)。
   *   secondary なし → primary のみ。primary なし → undefined。
   *   categoryLabel は **含めない** (= 分類は場所そのものではない、GPT 指摘)。
   *
   *   UI 使用方針 (CEO 補正 2026-05-21 正確化):
   *     - 非 interactive な <p>/<span> → 原則 title 属性のみ (mouse hover tooltip)
   *     - clickable row / button / card → aria-label を組み込んでよい (支援技術名)
   *     - 既存の anchor row 全体 aria-label は不変 (location を組み込まない)
   */
  fullLabel?: string;
}

export function formatLocationDisplayParts(
  anchor: ExternalAnchor,
): LocationDisplayParts {
  const cat = anchor.locationCategory;
  const text = anchor.locationText;

  const categoryLabel = cat ? LOCATION_CATEGORY_LABEL[cat] : undefined;

  // 補正 2: locationText が空 / whitespace-only → primary undefined (= 行を出さない)
  //   ただし locationCategory のみあれば categoryLabel は返す
  if (!text || !text.trim()) {
    if (!categoryLabel) return {};
    return {
      categoryLabel,
      displayCategoryLabel: categoryLabel, // primary なし → 重複比較不要、そのまま表示
    };
  }

  // 補正 3: anchor.locationText のみを parse 対象 (categoryLabel と混ぜない)
  const { displayName, address } = parseCanonicalLocationText(text);

  // 補正 2: displayName 空でも保存情報を消さない → original text.trim() fallback
  const primary = displayName || text.trim();
  const secondary = address ?? undefined;

  // 補正 6: categoryLabel === primary (trim normalize 後) なら displayCategoryLabel を抑制
  const isDuplicate =
    !!categoryLabel && categoryLabel.trim() === primary.trim();
  const displayCategoryLabel = categoryLabel && !isDuplicate ? categoryLabel : undefined;

  // 補正 5: fullLabel = primary + "、" + secondary (categoryLabel は含めない)
  const fullLabel = secondary ? `${primary}、${secondary}` : primary;

  const result: LocationDisplayParts = { primary, fullLabel };
  if (categoryLabel) result.categoryLabel = categoryLabel;
  if (displayCategoryLabel) result.displayCategoryLabel = displayCategoryLabel;
  if (secondary) result.secondary = secondary;
  return result;
}
```

### 4.2 既存 `formatLocation(anchor): string` は **不変**

他 caller に影響しないよう、既存仕様完全保持。Phase 2-F の 3 tab + AnchorDetailModal は新 helper のみ使う。

### 4.3 Display 戦略 (= 3 段階表示密度 §2.0 の具現化)

| 表示先 | density | 使う field | 戦略 |
|--------|---------|-----------|------|
| **CalendarTab** | Compact | `primary` (visible) + `fullLabel` (title/aria) | `📍 ${primary}`、title/aria-label に fullLabel |
| **FlowTab** | Compact | 同上 | 同上 |
| **MapTab SelectedAnchorCard** | Compact | 同上 | `📍 ${primary}` (既存 prefix 維持) + title/aria-label fullLabel |
| **AnchorDetailModal** | Detail | `displayCategoryLabel` + `primary` + `secondary` の 3 part | DetailRow 内側で段組 |

**Compact density** (= 3 tab):
- visible: `primary` のみ表示 (= 視覚 noise 最小)
- title 属性: `fullLabel` (= mouse hover で full 情報)
- aria-label: `fullLabel` (= screen reader で full 情報、補正 5)
- secondary (= address) は visible に出さない (= Compact 整合)

**Detail density** (= AnchorDetailModal):
- displayCategoryLabel: 補正 6 で重複抑制済 (= 「自宅 / 自宅」 出さない)
- primary: 主名 (太字 or 通常)
- secondary: 補助 (灰色 small)
- 空フィールドの段は出さない (= レイアウト崩れ防止)

**Machine density** (= 保存値):
- canonical text `displayName · address` 保存形式は Phase 2-D 凍結、本 Phase で **0 byte 変更**

---

## 5. UI 表示仕様

### 5.1 CalendarTab — anchor row 内

```
既存:
  <p className="text-xs text-slate-500 flex items-center gap-1.5">
    <span className="truncate">{anchor.locationText}</span>
    {isPlaceUnconfirmed(anchor.locationText) && <span>場所未確定 dot</span>}
  </p>

Phase 2-F:
  const { primary, fullLabel } = formatLocationDisplayParts(anchor);
  {primary && (
    <p className="text-xs text-slate-500 flex items-center gap-1.5">
      <span
        className="truncate"
        title={fullLabel}
      >
        {primary}
      </span>
      {isPlaceUnconfirmed(anchor.locationText) && <span>場所未確定 dot</span>}
    </p>
  )}
```

ポイント:
- `anchor.locationText` 直接表示 → `primary` 表示に変更 (= Compact density)
- `title` 属性に `fullLabel` を入れる (= 補正 5、mouse hover tooltip)
- **`aria-label` は付けない** (= 非 interactive な `<p>`/`<span>` への aria-label 機械付与は禁止、CEO 補正 2026-05-21 正確化)
- 既存 anchor row 全体の `aria-label` (= `${anchor.title} の詳細を見る`) は **完全不変** (= location 情報を組み込まない)
- 表示条件: `primary && ...` (= primary が空文字 / undefined なら表示しない)
- 場所未確定 indicator は **anchor.locationText で判定** (= helper の結果ではない、isPlaceUnconfirmed の引数は元 locationText、Phase 2-D C3 完全不変)
- 「保存情報が消えない」 = `primary` は補正 2 で fallback 済

### 5.2 FlowTab — AnchorRow 内

```
既存:
  <div className="flex items-center gap-1.5 mt-0.5">
    <p className="text-xs text-slate-500 truncate flex-1 min-w-0">
      {anchor.locationText}
    </p>
    {isPlaceUnconfirmed(anchor.locationText) && (<span>場所未確定 chip</span>)}
  </div>

Phase 2-F:
  const { primary, fullLabel } = formatLocationDisplayParts(anchor);
  {primary && (
    <div className="flex items-center gap-1.5 mt-0.5">
      <p
        className="text-xs text-slate-500 truncate flex-1 min-w-0"
        title={fullLabel}
      >
        {primary}
      </p>
      {isPlaceUnconfirmed(anchor.locationText) && (<span>場所未確定 chip</span>)}
    </div>
  )}
```

`aria-label` は **付けない** (= 非 interactive な `<p>` への機械付与禁止、CEO 補正 2026-05-21)。
既存 AnchorRow 全体の `aria-label="{anchor.title} の詳細を見る"` (= Phase 2-D C3 既存) は完全不変。

### 5.3 MapTab SelectedAnchorCard

```
既存:
  {anchor.locationText && !isSensitive && (
    <p className="text-xs text-slate-500 mt-1 truncate">
      📍 {anchor.locationText}
    </p>
  )}

Phase 2-F:
  const { primary, fullLabel } = formatLocationDisplayParts(anchor);
  {primary && !isSensitive && (
    <p
      className="text-xs text-slate-500 mt-1 truncate"
      title={fullLabel}
    >
      📍 {primary}
    </p>
  )}
```

`aria-label` は **付けない** (= 非 interactive `<p>` 機械付与禁止、CEO 補正 2026-05-21)。
sensitive 配慮 (= `!isSensitive` gate) は既存挙動維持。
SelectedAnchorCard 全体の `role="region" aria-label="選択中の予定の詳細"` (= Phase 2-C 既存) は完全不変。

### 5.4 AnchorDetailModal (= Detail density)

既存:
```tsx
<DetailRow label="場所">{formatLocation(anchor)}</DetailRow>
```

Phase 2-F:
```tsx
const parts = formatLocationDisplayParts(anchor);
<DetailRow label="場所">
  {(!parts.displayCategoryLabel && !parts.primary) ? (
    <span className="text-slate-400">場所未指定</span>
  ) : (
    <div className="flex flex-col">
      {parts.displayCategoryLabel && (
        <span className="text-xs text-slate-500">{parts.displayCategoryLabel}</span>
      )}
      {parts.primary && (
        <span className="text-sm font-medium text-slate-900">{parts.primary}</span>
      )}
      {parts.secondary && (
        <span className="text-xs text-slate-500">{parts.secondary}</span>
      )}
    </div>
  )}
</DetailRow>
```

ポイント:
- `formatLocation` (string 1 行) を `formatLocationDisplayParts` (3 part + fullLabel) に変更
- **`displayCategoryLabel` (= 補正 6 で重複抑制済)** を使う、`categoryLabel` raw は使わない
- `DetailRow` 構造は不変 (= label + children)、children 内側で段組
- 空フィールドの段は出さない (= レイアウト崩れ防止)
- 全空 (displayCategoryLabel / primary 共に undefined) → 既存 「場所未指定」 文言維持
- displayCategoryLabel + primary + secondary の 3 段、Apple Maps / Notion / Material Design pattern 整合
- sensitive masking は既存仕様 (AnchorDetailModal 内の他処理) で対応、本 row では parts をそのまま表示 (= sensitive 時の masking ルールに本 row が違反しないか実装時 audit、§5.6 の audit point)

### 5.5 既存 Phase 2-D/E indicator との共存 (= 完全不変)

| Indicator | 判定 input | Phase 2-F 影響 |
|-----------|-----------|---------------|
| 場所未確定 (Phase 2-D C3) | `isPlaceUnconfirmed(anchor.locationText)` | **input 不変**、表示位置も不変 |
| 時刻重なり (Phase 2-E) | `detectTimedAnchorOverlaps(anchorsForDay)` | **完全不変**、Phase 2-F は location 表示のみ touch |

両 indicator の挙動は本 Phase で **0 byte 変更**。

---

## 5. Edge case (CEO 補正 + Failure scenario 完全網羅)

| # | ケース | 期待動作 |
|---|--------|---------|
| 1 | canonical text `"スターバックス 成田空港店 · 千葉県成田市古込1番地"` | 3 tab: primary `"スターバックス 成田空港店"` のみ表示 / Detail: primary + secondary 2 段 |
| 2 | free text `"自宅"` | 3 tab + Detail とも `"自宅"` そのまま、場所未確定 indicator は既存通り (canonical でないので出る) |
| 3 | malformed canonical `" · 千葉県成田市"` (= displayName 空) | 補正 2: 非表示にせず fallback → primary `"· 千葉県成田市"` (trim 後) |
| 4 | multiple separator `"Cafe · 渋谷区 · 別住所"` | parseCanonicalLocationText 仕様通り: displayName=`"Cafe"`, address=`"渋谷区 · 別住所"` / 3 tab primary=`"Cafe"` / Detail Line 1=`"Cafe"`, Line 2=`"渋谷区 · 別住所"` |
| 5 | locationCategory only (locationText 空) | 3 tab: locationText 行 非表示 (primary なし) / Detail: categoryLabel のみ 1 段、 空行を出さない |
| 6 | locationCategory + canonical locationText | 補正 3: category と canonical を **別扱い**。Detail で categoryLabel `+` primary `+` secondary の 3 段 / 3 tab で primary のみ |
| 7 | sensitive anchor | 既存 masking / privacy 挙動を悪化させない (実装時 audit): MapTab SelectedAnchorCard では既存 `!isSensitive` gate 維持 / Detail で sensitive 時の場所表示は既存仕様維持 (= 必要なら sensitive 時専用文言出す) |
| 8 | Phase 2-D 場所未確定 indicator | `anchor.locationText` で判定継続、表示位置不変、判定不変 |
| 9 | Phase 2-E 時刻重なり indicator | 完全不変 |
| 10 | locationText `""` (空) + locationCategory `""` (空) | parts = `{}` / 3 tab で行非表示 / Detail で `「場所未指定」` 既存文言 |
| 11 | locationText whitespace-only `"   "` | 補正 2 trim 後空 → primary undefined → 3 tab 非表示 / Detail で categoryLabel のみ or `「場所未指定」` |
| 12 | 非常に長い displayName (50 文字超) | truncate (3 tab) / Detail full (= 詳細画面なので OK) |
| 13 | canonical text `"スタバ · "` (= address 空) | parseCanonicalLocationText: displayName=`"スタバ"`, address=null → primary=`"スタバ"` / secondary undefined / Detail で 2 段目出さない |

### 5.1 Sensitive 時の AnchorDetailModal location 表示の audit point

実装着手時に確認すべき:
- AnchorDetailModal が sensitive anchor で title / location を **どう masking しているか**
- Phase 2-F の `formatLocationDisplayParts` を使う場合、**masking ルール違反していないか**
- 既存挙動が `formatLocation(anchor)` 経由で safe なら、新 helper でも同じ safety が確保されるか

(= 実装着手前にこの 1 点を確認、もし sensitive で外部送信されないルールがあれば、本 row もそれに従う)

---

## 6. Touched file 候補

```
新規 (1):
  tests/unit/plan/formatLocationDisplayParts.test.ts                ~150 行 (edge case 13+ + pure)

変更 (5):
  lib/plan/anchor-detail-format.ts                                  +35 -0 (formatLocationDisplayParts 追加、formatLocation 不変)
  app/(culcept)/plan/tabs/CalendarTab.tsx                           +5 -3
  app/(culcept)/plan/tabs/FlowTab.tsx                               +5 -3
  app/(culcept)/plan/tabs/MapTab.tsx                                +5 -3 (SelectedAnchorCard 内)
  app/(culcept)/plan/components/AnchorDetailModal.tsx               +20 -2

合計: 6 ファイル (新規 1 + 変更 5)
```

### 6.1 触らないファイル (CEO 制約遵守)

- `lib/shared/canonicalLocationText.ts` (= helper 既存、parse / extractDisplayNameForUI 使うのみ)
- `lib/plan/locationConfirmationStatus.ts` (= Phase 2-D C3 凍結)
- `lib/plan/anchorOverlap.ts` (= Phase 2-E 凍結)
- `lib/plan/external-anchor.ts` (= schema 不変)
- `app/(culcept)/plan/components/AnchorFormFields.tsx` / `PlaceCandidatesPanel.tsx` / `_useBiasContext.ts` (= Phase 2-D 凍結)
- `app/(culcept)/plan/components/AddAnchorModal.tsx` / `EditAnchorModal.tsx` / `SourceListModal.tsx` (= 編集挙動不変)
- `MorningMapView` / CoAlter / talk / Mirror / W1-6 / DraftPlan
- `env` / `migration` / `dependency`

---

## 7. やること / やらないこと (まとめ)

### 7.1 やること

| 領域 | やること |
|------|---------|
| Helper | `formatLocationDisplayParts(anchor): LocationDisplayParts` 追加 (新 helper、既存不変) |
| 3 tab | locationText 表示を `primary` に変更 (CalendarTab / FlowTab / MapTab) |
| AnchorDetailModal | `DetailRow label="場所"` 内を 3 段表示 (categoryLabel / primary / secondary) |
| Test | 新 helper の 13+ edge case unit test |

### 7.2 やらないこと

| 禁止 | 理由 |
|------|------|
| `formatLocation(anchor)` 戻り値変更 | 補正 1: 既存 caller 壊す可能性 |
| canonical text 保存形式変更 | round-trip 整合性壊す |
| 場所未確定 / 時刻重なり indicator 判定 / 表示変更 | 完全不変、Phase 2-D/E 凍結部分 |
| AddAnchorModal / EditAnchorModal 保存挙動変更 | 完全不変 |
| Geolocation API / MapTab fallback 改修 | Phase 2-G 預け |
| locationCategory と locationText を混ぜて parse | 補正 3 |
| displayName 空時に locationText 行を非表示 | 補正 2: 保存情報を消さない |
| migration / env / dependency | CEO 制約 |
| Phase 2-D / 2-E branch への追加 commit | 凍結 |
| GitHub push / PR / remote ops | CEO 明示禁止 |

---

## 8. 実装順序

実装着手は **CEO 承認後**。

1. `lib/plan/anchor-detail-format.ts` に `formatLocationDisplayParts` 追加
2. `tests/unit/plan/formatLocationDisplayParts.test.ts` 作成 (13+ edge case)
3. helper 単体 test PASS 確認 (= 早期 fail 検知)
4. CalendarTab で適用
5. FlowTab で適用
6. MapTab SelectedAnchorCard で適用
7. AnchorDetailModal で 3 段表示適用
8. AnchorDetailModal の sensitive masking 既存挙動の audit (= §5.1)
9. 全 unit test 再実行 PASS
10. `npm run lint` / `npx tsc --noEmit` / `npm run test:unit` / `npm run build`
11. Phase 2-F touched files に新規問題 0 確認
12. CEO smoke 待ち (dev server inline env で起動)
13. PASS → local commit 待ち (= remote ops 禁止のまま)

---

## 9. Smoke checklist

### 9.0 Success criteria (= 補正 7 反映、認知負荷で測る)

Phase 2-F の **本質的成功** は CEO が user 視点で以下を体感確認できるか:

- [ ] **「同じ anchor が Calendar / Flow / Map のどこで見ても 1 秒で『同じ場所』 と認識できる」** ← 最重要
- [ ] Address-level 詳細は AnchorDetailModal で常に確認可能
- [ ] 保存した location 情報が一切消えていない
- [ ] 場所未確定 / 時刻重なり indicator が住所 noise に埋もれず、より目立つ
- [ ] category と primary が重複した冗長な 2 段表示が出ない
- [ ] hover / accessibility で full 情報が取得できる

### 9.1 Place Identity Contract 検証 (= 補正 4 / Cross-tab 一貫性)

- [ ] 同 anchor の `primary` 表示が **Calendar / Flow / Map で完全一致**
- [ ] 同 anchor の `fullLabel` が hover (title) で表示される (= Compact density で情報失われない確認)
- [ ] AnchorDetailModal で同 anchor が `displayCategoryLabel / primary / secondary` の 3 段表示 (= Detail density)
- [ ] DB 保存値の `locationText` が canonical `displayName · address` のまま不変 (= Machine density)
- [ ] 3 tab + Detail すべてが **同 helper `formatLocationDisplayParts` のみ使用**、独自 parse なし
- [ ] `grep -E "parseCanonicalLocationText|extractDisplayNameForUI" app/(culcept)/plan/tabs/ app/(culcept)/plan/components/AnchorDetailModal.tsx` で **本 helper 経由のみ** 確認

### 9.2 Cross-tab display coherence

- [ ] canonical anchor (`"スターバックス 成田空港店 · 千葉県成田市古込1番地"`) を 3 tab で見る → primary `"スターバックス 成田空港店"` のみ
- [ ] AnchorDetailModal で同 anchor: displayCategoryLabel (任意) / primary (主名) / secondary (`"千葉県成田市古込1番地"`) の 3 段
- [ ] free text anchor (`"自宅"`) は 3 tab + Detail で `"自宅"` そのまま表示
- [ ] malformed canonical (`" · 千葉県成田市"`) は **fallback で表示** (= 補正 2、消えない)
- [ ] multiple separator (`"Cafe · 渋谷区 · 別住所"`): primary=`"Cafe"`、Detail secondary=`"渋谷区 · 別住所"`

### 9.3 重複抑制 (= 補正 6)

- [ ] `locationCategory="home"` + `locationText="自宅"` → Detail で **「自宅 / 自宅」 が出ない** (displayCategoryLabel 抑制)
- [ ] `locationCategory="home"` + `locationText="自宅 "` (末尾 space) → trim normalize で同様に抑制
- [ ] `locationCategory="cafe"` + `locationText="カフェ・ベローチェ"` → 両者違うので両方表示 (= 「カフェ」 / 「カフェ・ベローチェ」)

### 9.4 Accessibility / visible vs accessible (= 補正 5、CEO 補正 2026-05-21 正確化)

- [ ] 3 tab で visible は `primary` のみ、**非 interactive な `<p>`/`<span>` には `title={fullLabel}` のみ付ける**
- [ ] 非 interactive な `<p>`/`<span>` に **機械的に `aria-label` を付けない** (= W3C ARIA 1.2 / aria-label 濫用回避)
- [ ] 既存 clickable row / button / card の `aria-label` (= `${anchor.title} の詳細を見る` 等) は **完全不変**、location を組み込まない
- [ ] mouse hover で `title` の fullLabel が tooltip 表示
- [ ] fullLabel に `categoryLabel` は **含まれない** (= primary + secondary のみ、補正 5)
- [ ] free text anchor で fullLabel = primary (= secondary なし)
- [ ] fullLabel の区切り文字は `"、"` (全角読点)、`"。"` (句点) ではない

### 9.5 LocationCategory 分離 (= 補正 3)

- [ ] locationCategory のみ (locationText 空): 3 tab で行非表示、Detail で displayCategoryLabel のみ 1 段
- [ ] locationCategory + canonical locationText: Detail で displayCategoryLabel と canonical parse が **混ざらない** (= 補正 3)

### 9.6 既存 indicator 不変 (= Phase 2-D/E 完全不変)

- [ ] 場所未確定 indicator: canonical anchor で出ない / free text anchor で出る (= Phase 2-D C3 既存挙動 100% 維持)
- [ ] 時刻重なり indicator: 3 tab で出る anchor が Phase 2-F でも 100% 同じ (= Phase 2-E 既存挙動完全不変)
- [ ] Phase 2-D/E indicator が住所 noise が消えた後 **より目立つ** (= 補正 7 success criteria)

### 9.7 Sensitive 配慮

- [ ] sensitive anchor の title masking が悪化していない
- [ ] sensitive anchor の location 表示が既存仕様と一致 (= MapTab `!isSensitive` gate / Detail の sensitive 時挙動)
- [ ] 外部送信されない情報の漏えい無し
- [ ] sensitive anchor で fullLabel / aria-label が privacy 漏えいを起こさないか実装時 audit

### 9.8 既存挙動不変

- [ ] AddAnchorModal / EditAnchorModal の保存挙動完全不変
- [ ] `formatLocation(anchor)` を使う他 caller (もしあれば) が壊れていない (= 補正 1 遵守)
- [ ] MorningMapView 完全不触
- [ ] Phase 2-D Place picker 動作不変

### 9.9 Visual quality

- [ ] 視覚 noise が Phase 2-E commit (`677b7b6a`) 時より明らかに減少
- [ ] AnchorDetailModal で 場所セクションが情報リッチに見える (= Apple Maps / Notion / Material Design pattern 整合)
- [ ] 空行や `"undefined"` 表示が一切出ない

---

## 10. Test case 一覧 (CEO 指示の最低項目を全て含む)

### 10.1 `formatLocationDisplayParts` の test (新規)

`tests/unit/plan/formatLocationDisplayParts.test.ts`:

| # | describe | name | 入力 | 期待戻り値 |
|---|---------|------|------|----------|
| 1 | canonical | standard canonical | locationText=`"スターバックス 成田空港店 · 千葉県成田市古込1番地"`、locationCategory=undefined | `{ primary: "スターバックス 成田空港店", secondary: "千葉県成田市古込1番地", fullLabel: "スターバックス 成田空港店、千葉県成田市古込1番地" }` |
| 2 | canonical | + categoryLabel | locationText=canonical、locationCategory=`"cafe"` (=「カフェ」) | `{ categoryLabel: "カフェ", displayCategoryLabel: "カフェ", primary: ..., secondary: ..., fullLabel: "primary、secondary" }` |
| 3 | free text | free text | locationText=`"自宅"` | `{ primary: "自宅", fullLabel: "自宅" }` (secondary なし、fullLabel は primary のみ) |
| 4 | free text | category === primary 重複抑制 | locationText=`"自宅"`、locationCategory=`"home"` (=「自宅」) | `{ categoryLabel: "自宅", displayCategoryLabel: undefined, primary: "自宅", fullLabel: "自宅" }` (補正 6: 重複抑制) |
| 5 | malformed | displayName 空 (fallback) | locationText=`" · 千葉県成田市"` | `{ primary: "· 千葉県成田市", fullLabel: "· 千葉県成田市" }` (補正 2: fallback、消えない) |
| 6 | malformed | address 空 | locationText=`"スタバ · "` | `{ primary: "スタバ", fullLabel: "スタバ" }` (secondary なし) |
| 7 | malformed | separator のみ | locationText=`" · "` | `{ primary: "·", fullLabel: "·" }` (補正 2 fallback) |
| 8 | boundary | multiple separator | locationText=`"Cafe · 渋谷区 · 別住所"` | `{ primary: "Cafe", secondary: "渋谷区 · 別住所", fullLabel: "Cafe、渋谷区 · 別住所" }` |
| 9 | empty | locationText 空 | locationText=`""` | `{}` (= 空 object、fullLabel なし) |
| 10 | empty | whitespace-only | locationText=`"   "` | `{}` (= trim 後空、fullLabel なし) |
| 11 | empty | category のみ (locationText 空) | locationText=`""`、locationCategory=`"cafe"` | `{ categoryLabel: "カフェ", displayCategoryLabel: "カフェ" }` (= primary なし、重複比較不要、補正 3) |
| 12 | duplicate | category + primary 重複 (trim normalize) | locationText=`"自宅 "` (末尾 space)、locationCategory=`"home"` | `{ categoryLabel: "自宅", displayCategoryLabel: undefined, primary: "自宅", fullLabel: "自宅" }` (補正 6 + trim 比較) |
| 13 | duplicate | category != primary | locationText=`"カフェ・ベローチェ"`、locationCategory=`"cafe"` (=「カフェ」) | `{ categoryLabel: "カフェ", displayCategoryLabel: "カフェ", primary: "カフェ・ベローチェ", fullLabel: "カフェ・ベローチェ" }` (補正 6: 異なるので両表示) |
| 14 | null safety | locationText null | locationText=null/undefined | `{}` |
| 15 | sensitive | sensitive anchor も判定対象 | sensitive=`"medical"`、locationText=canonical | helper は sensitive で挙動変えない、`{ primary, secondary, fullLabel }` 通常通り (UI 側で privacy 配慮) |
| 16 | fullLabel | secondary なし時の fullLabel | free text の場合 fullLabel = primary | (= ケース 3 / 6 / 7 で確認) |
| 17 | fullLabel | categoryLabel を fullLabel に **含めない** | category + canonical anchor で fullLabel が primary + secondary のみ | 補正 5 strict |
| 18 | pure | deterministic | 同入力 2 回 | 結果一致 |
| 19 | pure | 入力 mutate なし | snapshot 比較 | 一致 |

### 10.2 既存 Phase 2-D/E indicator の挙動不変 test

- 既存 `tests/unit/plan/locationConfirmationStatus.test.ts` (Phase 2-D C3) → 変更なし、PASS 維持
- 既存 `tests/unit/plan/anchorOverlap.test.ts` (Phase 2-E) → 変更なし、PASS 維持

### 10.3 既存 `formatLocation(anchor): string` の挙動不変 test (もしあれば)

- 既存 caller がいる前提で、既存戻り値仕様完全保持
- 補正 1 遵守確認

---

## 11. 検証コマンド (Phase 2-E と同 pattern)

```
1. 単体 test 先行 (早期 fail 検知)
   npx vitest run tests/unit/plan/formatLocationDisplayParts.test.ts

2. 並列実行
   npm run lint                                                       (background)
   NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit            (background)
   npm run test:unit                                                  (background)
   npm run build                                                      (background)

3. 確認基準
   - Phase 2-F touched files に lint / type / test 新規問題 0
   - 既存 baseline (Phase 2-E 時点 = ESLint 2608 problems / tsc 1115 errors) と同等 or 改善
   - 全 unit test PASS (Phase 2-F new + Phase 2-D/E existing 完全 PASS)
   - build exit 0
```

---

## 12. Branch / commit 方針 (= CEO 制約整理)

- **base**: Phase 2-E commit `677b7b6a` を起点に派生
- **branch name**: `feat/alter-plan-phase2-f-display-coherence`
- **既存 Phase 2-D 凍結 branch** (`feat/alter-plan-phase2-d-place-picker`、HEAD `cda09ef1`) は **不変**
- **既存 Phase 2-E branch** (`feat/alter-plan-phase2-e-time-overlap`、HEAD `677b7b6a`) は **不変** (= 追加 commit しない、別 branch で派生済)
- **既存 docs branch** (`docs/alter-plan-phase2-e-time-overlap-mini-design`、HEAD `329a7145`) は **不変**
- **scope 外 dirty** (next-env.d.ts / supabase/.temp/cli-latest / *.png) は **stage しない** (CLAUDE.md 規約遵守)
- **commit**: CEO 承認後の local commit のみ
- **remote**: push / PR / gh / merge / fetch / pull **全禁止** (CEO 明示)

### 12.1 想定 commit 構造

Phase 2-F は **単一 commit (案 a)** で着地予定:
```
feat/alter-plan-phase2-f-display-coherence
└── (実装 commit) feat(plan): apply canonical location displayName extraction across tabs
    └── 677b7b6a feat(plan): add cross-tab time overlap indicator (Phase 2-E)
         └── 329a7145 docs(plan): add Phase 2-E time-overlap indicator mini design
              └── cda09ef1 feat(plan): surface unconfirmed place anchors across Plan tabs (Phase 2-D 凍結)
```

mini design docs (= 本 docs) は **別 commit** にするか / 単一 commit に統合するかは CEO 判断。
私の暫定推奨: **mini design docs を先に local commit (= 設計記録)、実装は別 commit** (Phase 2-D / 2-E と同 pattern)。

---

## 13. Beyond / 不採用案 (透明性)

| 案 | 却下理由 |
|----|---------|
| `formatLocation(anchor)` の戻り値を変更 | 補正 1 違反、既存 caller 壊す可能性 |
| displayName 空時 locationText 行を非表示 | 補正 2 違反、保存情報消失 |
| `formatLocation` の戻り値 (category + text 結合) を parse | 補正 3 違反、混在判定 |
| primary を AddAnchorModal / EditAnchorModal 内 input 表示にも適用 | 編集中は full canonical で見えた方が user 自然、現状維持 |
| 3 tab で address (secondary) もサブテキストで表示 | 視覚 noise 増、世界トップ pattern は主名のみ |
| AnchorDetailModal で「Maps で開く」 button 追加 | scope 外、Phase 2-G+ |
| Geolocation 現在地 fallback | Phase 2-G 預け |
| canonical text 内 separator を `"｜"` 等に変更 | round-trip 壊す、Phase 2-D 凍結部分 |
| 同 location anchor の grouping 視覚 | Aneurasync 思想整合だが scope 大、別 phase |

---

## 14. 将来拡張ポイント (Phase 2-F+ 預け)

1. **Phase 2-G: MapTab Geolocation 現在地 fallback** (= GPT 観点 3、permission flow + state)
2. **Phase 2-H+: 同 location anchor grouping** (= 「同じ場所に 3 件」 pattern teaching)
3. **Phase 2-H+: Plan summary view** (= 週次集計、self-pattern 認識)
4. **Phase 3: ALTER 提案 flow 動作実装** (= CEO 禁止解除後)
5. **AnchorDetailModal の「Maps で開く」 deep link** (= 詳細画面の experience 拡張)

---

## 15. 変更履歴

### 2026-05-21 v1.2 (CEO 軽微補正 2 点、commit 直前 docs only 補正)

- **補正 1**: `fullLabel` 区切り文字の説明を **「全角読点」** で明示 (= 「、」 は読点であって句点ではない)
  - helper docstring + §3 補正 5 + §15 v1.1 補正項目で表記正確化
  - `"。"` (句点) と区別して `"、"` (読点) を docs 全体で統一
- **補正 2**: `title` / `aria-label` 方針の正確化 (= W3C ARIA 1.2 / aria-label 濫用回避):
  - `fullLabel` は **原則 `title` 属性に入れる** (= mouse hover tooltip)
  - `aria-label` は **clickable row / button / card など、支援技術上の名前として意味を持つ要素に限って** 使う
  - **非 interactive な `<p>` / `<span>` には機械的に `aria-label` を付けない**
  - 既存 anchor row 全体 / SelectedAnchorCard 全体の `aria-label` (= Phase 2-C/D C3 既存) は **完全不変**、location 情報を組み込まない
  - §3 補正 5 + §4.1 helper docstring + §5.1-5.3 implementation snippets + §9.4 smoke checklist で反映

### 2026-05-21 v1.1 (GPT/CEO 思想昇格補正 4 点 + 自立推論強化、docs only)

- **核心概念昇格**: Phase 2-F を「canonical text 表示整合 polish」 から **「Place Identity Contract / 場所アイデンティティ表示契約」** に re-define
  - Plan の anchor がどの tab で見られても 「同じ場所」 として一瞬で同定できる **UI 契約** として位置付け
  - Phase 2-E (時間構造) と対の構造: Phase 2-F = 場所アイデンティティ = anchor identity の完成
  - Aneurasync 「第二の自己」 思想と整合: Alter が anchor identity の不変性を前提に user 理解

- **補正 4 反映: 3 段階表示密度の契約化** (§2.0)
  - Compact density (3 tab、primary only) / Detail density (Modal、3 part) / Machine density (DB 保存値、不変)
  - 三層 invariant 明示 (Data / Decision / Display layer、自立推論で追加)

- **補正 5 反映: visible text と accessible label の分離** (§3 補正 5、§4.1 helper)
  - `fullLabel?: string` を `LocationDisplayParts` に追加
  - 構成: `primary + "、" + secondary` (= 日本語 a11y label として自然、自立推論で区切り文字確定)
  - `categoryLabel` は fullLabel に **含めない** (= 分類は場所そのものではない、GPT 指摘)
  - 3 tab で `title` / `aria-label` に fullLabel 出力 (mouse hover + screen reader 両対応)

- **補正 6 反映: categoryLabel === primary の重複表示禁止** (§3 補正 6、§4.1 helper)
  - `displayCategoryLabel?: string` を `LocationDisplayParts` に追加 (= helper 側で吸収)
  - 比較は **trim 後 normalize** (= whitespace 差吸収、自立推論で追加)
  - UI 側は `displayCategoryLabel` を使う、`categoryLabel` raw は内部用

- **補正 7 反映: success criteria を 「短くなった」 → 「認知負荷が下がった」** (§3 補正 7、§9.0)
  - 「住所を消す」 が目的ではない、「user が 1 秒で生活パターン理解」 が目的
  - smoke で CEO が user 視点で体感確認、6 項目で本質確認

- **自立推論で追加した補正項目**:
  - **Cross-tab Place Identity Contract 検証** を smoke checklist §9.1 として追加 (= 同 primary が 3 tab で一致する保証)
  - **三層 invariant 明文化** (Data / Decision / Display) で Phase 2-D / 2-E / 2-F の責務分離を明確化
  - **trim normalize 比較ルール** で `categoryLabel === primary` 判定の whitespace 安全性
  - **fullLabel 区切り文字 "、"** を日本語 a11y label として自然な選択として確定
  - **test ケース 16 件 → 19 件** に増、fullLabel / displayCategoryLabel / 重複抑制 + trim normalize / fullLabel に categoryLabel 含めない strict を網羅

### 2026-05-21 v1 (本起票、CEO 当初補正 3 点反映)

- Phase 2-D (cda09ef1) / Phase 2-E (677b7b6a) 凍結後、Phase 2-F 候補「canonical location display coherence」 を CEO 採択 (A 補正付き GO)
- CEO 補正 3 点反映:
  - 補正 1: `formatLocation(anchor)` 戻り値変更しない、新 helper `formatLocationDisplayParts` 追加
  - 補正 2: `extractDisplayNameForUI` 空文字時の locationText fallback (= 保存情報を消さない)
  - 補正 3: `locationCategory` と canonical `locationText` を混ぜて parse しない
- 自立推論 (Beyond):
  - Phase 2-D/E 完了後の real gap として canonical text 表示整合のみを抽出
  - Geolocation 案を Phase 2-G に分離 (scope 大)
  - 3 tab + Detail の display 戦略を分離 (= 3 tab は primary のみ / Detail は 3 part)
  - 世界トップ pattern (Apple Maps / Google Maps / Notion / Airbnb) との差別化を Aneurasync 思想で再構成
  - edge case 13+ を完全枚挙、CEO 指示の最低 test 項目をすべて統合

---

**End of Phase 2-F Mini Design v1**. CEO 採択判断 → 実装 GO/NO-GO 判断をお待ちします。

Aneurasync 設計思想への寄与:
Phase 2-D で「Places autocomplete を保存」した anchor が、Plan 全体で「主名 + 補助」 の世界トップ pattern として整合する。
Phase 2-E で「時刻重なり」 を気付かせた anchor が、Phase 2-F で「場所主名」 として清潔に並ぶ。
便利機能追加 (Phase 2-D/E) → 整合性 polish (Phase 2-F) で Plan 全体の「観測の入口」 体験を仕上げる。
