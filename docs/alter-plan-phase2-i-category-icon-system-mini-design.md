# Alter Plan Phase 2-I — Category Icon System / 分類アイコン体系 Mini Design

**Status**: docs only (local 起票、未 commit)
**Date**: 2026-05-21
**Branch (予定)**: `feat/alter-plan-phase2-i-category-icon-system` (= 実装着手時に派生、CEO 承認後)
**Pre-requisite**: Phase 2-D (cda09ef1) / 2-E (677b7b6a) / 2-F (b4ab331e) 凍結 / 2-G docs (38292335) / 2-H docs (= 同 wave 別 docs)
**Author**: Claude × CEO (Aneurasync) — CEO 指示 + GPT 補正 + 自立推論

---

## 0. 一行 summary

> Plan の category 表示 (= 現状 emoji 中心) を **inline SVG icon library** に置き換え、3 tab + Detail + Map pin で **統一された世界観の icon system** を確立する。
> emoji 依存 (= OS / font ごとの見え方ブレ) を解消し、Aneurasync の glassmorphism design system と整合する細線 SVG で「最高品質」 を実装する。

---

## 1. 背景と問い

### 1.1 現状 (= emoji 主体)

```typescript
// app/(culcept)/plan/tabs/_helpers.ts:443
export const CATEGORY_META = {
  home:    { label: "家",     emoji: "🏠", hint: "自分の聖域" },
  office:  { label: "職場",   emoji: "🏢", hint: "労働の場" },
  school:  { label: "学校",   emoji: "🎓", hint: "学びの場" },
  cafe:    { label: "カフェ", emoji: "☕", hint: "ひと息の場" },
  outdoor: { label: "屋外",   emoji: "🌿", hint: "外の空気" },
  public:  { label: "公共",   emoji: "🏛️", hint: "市民の場" },
  transit: { label: "移動",   emoji: "🚃", hint: "通り道" },
  unknown: { label: "未分類", emoji: "📍", hint: "場所カテゴリ未設定" },
  none:    { label: "場所なし", emoji: "·", hint: "..." },
};

// Map pin 用
export const MAP_CATEGORY_MARKER = {
  home: { color: "#6366f1", emoji: "🏠" },  // indigo
  ...
};
```

### 1.2 emoji 主体の問題

| 問題 | 内容 |
|------|------|
| **OS 依存の見え方** | macOS / iOS / Android / Windows でグリフ別 (= 同じ「🏠」 が全く違う見た目) |
| **font 依存** | system default font が emoji rendering 不可だと豆腐 □ 表示 |
| **解像度 / size 依存** | 16px で潰れる、 100px で粗い |
| **色制御不可** | currentColor で text-color 継承できない (= dark mode / theming 不可) |
| **世界観の統一なし** | Aneurasync glassmorphism design system と無関係な OS-native 見た目 |
| **アクセシビリティ** | screen reader が「🏠」 を読み上げる挙動 OS / locale 依存 |
| **sensitive 配慮の難しさ** | 「医療」 「歯科」 等を抽象化した emoji が存在しない (= 既存 🔒 で代用) |

### 1.3 世界トップアプリの調査

| App | icon 戦略 |
|-----|----------|
| **Apple Calendar** | SF Symbols (= Apple 内製 SVG icon library)、native iOS のみ |
| **Google Calendar** | Material Symbols (= Google 内製 SVG icon library、3000+ icon) |
| **Notion** | emoji 主体だが、icon library (Lucide / Phosphor 系) で代替可能 |
| **Linear** | 内製 SVG icon set、線幅統一 (1.5px)、stroke ベース |
| **Cron / Notion Calendar** | Phosphor Icons 採用、 stroke 1.5px |
| **Things 3** | 独自 SVG icon、塗りつぶし + stroke 混合 |

→ 世界トップは **SVG icon library** が標準。emoji は **暫定** か **personal customization** 用途。

### 1.4 Aneurasync 独自要件

- **glassmorphism design system** との整合: 細線・透明感・抽象度
- **currentColor 継承**: text-color theming 対応
- **size invariance**: 16px / 24px / 32px で見える
- **sensitive 配慮**: medical 系 anchor で情報漏えいしない generic icon
- **既存 emoji と段階移行**: legacy 互換性

### 1.5 Phase 2-I が解かない問題 (= 別 phase 預け)

- ❌ icon の画像生成 / 外部 asset 追加 (= GPT 指示「いきなり画像生成や外部 asset 追加には進まず」、inline SVG / React component で内製)
- ❌ icon library として npm package 追加 (= dep / scope 大、CEO 制約)
- ❌ animation (= 動き / transition)、 polish は別 Phase
- ❌ dark mode 完全対応 (= currentColor で対応、theming 拡張は別 Phase)
- ❌ Map pin marker の visual 大改造 (= 既存 color + emoji を SVG 化、layout 変更しない)
- ❌ AnchorThumbnail (= FlowTab 右端の emoji thumbnail) のレイアウト変更
- ❌ Phase 2-H Place Intent Search の機能変更 (= 別 phase、icon は表示のみ)
- ❌ migration / env / dependency / push / PR / remote ops

---

## 2. 設計思想

### 2.1 「Aneurasync Category Icon System」

3 つの原則:

1. **統一された世界観**: 全 icon が同じ stroke-width / corner-radius / 抽象度
2. **CSS-controllable**: currentColor、size を class で制御
3. **段階移行**: 既存 emoji を一度に削除せず、SVG icon と併存 → 段階的 swap

### 2.2 Icon design 仕様 (= 世界トップ整合 + Aneurasync 独自)

```
stroke-width:   1.5px         (= Linear / Phosphor / Lucide 標準)
corner-radius:  2px           (= 角丸線端、glassmorphism 整合)
viewBox:        0 0 24 24     (= Material Symbols / Heroicons 標準)
fill:           none          (= stroke のみ、currentColor 継承)
stroke:         currentColor  (= text-color theming)
size class:     w-4 h-4 (16px) / w-5 h-5 (20px) / w-6 h-6 (24px)
線端:           round         (stroke-linecap)
コーナー:       round         (stroke-linejoin)
```

### 2.3 8 category + sensitive の icon 仕様

| Category | Concept | Icon design |
|----------|---------|-------------|
| home | 家、聖域 | シンプルな house outline (= 屋根 + 壁、ドア / 窓は省略、抽象度高) |
| office | 職場、労働 | building outline (= 縦長矩形 + 窓 grid 簡略) |
| school | 学校、学び | mortarboard (= 卒業帽) or building + 旗 |
| cafe | カフェ、ひと息 | coffee cup (= カップ + 取っ手 + 湯気 1-2 本) |
| outdoor | 屋外、自然 | tree (= 葉部分 + 幹) or mountain (= 山 + 谷) |
| public | 公共、市民の場 | building with column (= ギリシャ柱建物 抽象) |
| transit | 移動、通り道 | train (= 矩形 + 窓 + 車輪) or arrow path |
| unknown | 未分類 | pin / location marker (= 既存 emoji 📍 の SVG 版) |
| **sensitive 系** | 抽象的、内容隠蔽 | shield / lock (= 既存 🔒 の SVG 版、内容を露出しない) |

### 2.4 Aneurasync 思想整合

- emoji の OS 依存を解消 (= 世界観統一)
- glassmorphism の細線・透明感に整合
- 「観測の入口」 (= Phase 2-E / 2-F 思想) と整合した subtle 表現
- 強制せず、user が見て即理解できる icon

---

## 3. Icon library 構造

### 3.1 File 配置

```
components/ui/icons/category/
  ├── CategoryHomeIcon.tsx        (= home category icon)
  ├── CategoryOfficeIcon.tsx
  ├── CategorySchoolIcon.tsx
  ├── CategoryCafeIcon.tsx
  ├── CategoryOutdoorIcon.tsx
  ├── CategoryPublicIcon.tsx
  ├── CategoryTransitIcon.tsx
  ├── CategoryUnknownIcon.tsx
  ├── CategorySensitiveIcon.tsx   (= 抽象、情報漏えい防止)
  └── index.ts                    (= barrel export)
```

### 3.2 Icon component template

```tsx
// components/ui/icons/category/CategoryHomeIcon.tsx
import * as React from "react";

interface CategoryIconProps {
  className?: string;          // size + color control
  size?: number;               // default 24, can be 16 / 20 / 24
  "aria-label"?: string;
  "aria-hidden"?: boolean;
  title?: string;
}

export function CategoryHomeIcon({
  className,
  size = 24,
  title,
  ...aria
}: CategoryIconProps): React.ReactElement {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={title || aria["aria-label"] ? "img" : "presentation"}
      {...aria}
    >
      {title && <title>{title}</title>}
      {/* 屋根 (= 三角形) + 壁 (= 矩形) + ドア (= 小矩形)、抽象度高 */}
      <path d="M3 11L12 3l9 8" />
      <path d="M5 10v10h14V10" />
      <path d="M10 20v-5h4v5" />
    </svg>
  );
}
```

### 3.3 Icon mapping helper

```typescript
// lib/plan/categoryIconMap.ts (新規)
import * as React from "react";
import type { LocationCategory } from "@/lib/plan/location-category";
import {
  CategoryHomeIcon,
  CategoryOfficeIcon,
  CategorySchoolIcon,
  CategoryCafeIcon,
  CategoryOutdoorIcon,
  CategoryPublicIcon,
  CategoryTransitIcon,
  CategoryUnknownIcon,
  CategorySensitiveIcon,
} from "@/components/ui/icons/category";

export const CATEGORY_ICON_MAP: Record<
  LocationCategory,
  React.ComponentType<{ className?: string; size?: number; "aria-label"?: string }>
> = {
  home: CategoryHomeIcon,
  office: CategoryOfficeIcon,
  school: CategorySchoolIcon,
  cafe: CategoryCafeIcon,
  outdoor: CategoryOutdoorIcon,
  public: CategoryPublicIcon,
  transit: CategoryTransitIcon,
  unknown: CategoryUnknownIcon,
};

/** sensitive anchor 専用 (= LocationCategory に依らず) */
export const SENSITIVE_CATEGORY_ICON = CategorySensitiveIcon;

/**
 * anchor から表示すべき icon component を返す。
 * sensitive anchor は SENSITIVE_CATEGORY_ICON を返す (= privacy 配慮)。
 */
export function pickCategoryIcon(args: {
  category?: LocationCategory;
  sensitive?: boolean;
}): React.ComponentType<{ className?: string; size?: number; "aria-label"?: string }> {
  if (args.sensitive) return SENSITIVE_CATEGORY_ICON;
  const cat = args.category ?? "unknown";
  return CATEGORY_ICON_MAP[cat];
}
```

### 3.4 既存 emoji との段階移行

**Phase 2-I では emoji を全削除しない**。CATEGORY_META は維持し、UI 側で **icon を優先表示、emoji を fallback** として並存:

```tsx
// 例: FlowTab AnchorThumbnail (= Phase 2-I 統合後)
function AnchorThumbnail({ anchor }: { anchor: ExternalAnchor }) {
  const Icon = pickCategoryIcon({
    category: anchor.locationCategory,
    sensitive: !!anchor.sensitiveCategory,
  });
  return (
    <div className="w-14 h-14 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
      <Icon className="w-7 h-7 text-slate-500" aria-label={CATEGORY_META[cat].label} />
    </div>
  );
}
```

emoji の CATEGORY_META は残し、icon が使われない場面 (= test fixture / debug) の fallback として利用。

---

## 4. 統合場所 (= Touched files)

### 4.1 全 icon 統合の影響範囲 (= 完成形、Phase 2-I 完了時)

| 場所 | 現状 | Phase 2-I 後 |
|------|------|------------|
| FlowTab AnchorThumbnail (= 右端 thumbnail) | emoji 中央配置 | SVG Icon 中央配置 |
| MapTab CategoryGrid (= 9 categories 集計 panel) | emoji + label | Icon + label |
| MapTab Map pin marker | color + emoji | color + Icon (= 表示判断要、§4.2) |
| MapTab SelectedAnchorCard (= 左端 icon) | emoji circle | Icon circle |
| AnchorDetailModal categoryLabel (= Phase 2-F 統合済) | text only | text + Icon (= 任意拡張、§4.3) |

### 4.2 Map pin marker の特殊性

Map pin は **Google Maps の marker icon** として渡る。Google Maps API は:
- DOM element を marker に渡す: 可能 (Advanced Markers v2)
- icon URL (= image): 標準
- SVG path: 可能

→ SVG icon を Maps marker として使うには、SVG を string にして data URI 化、もしくは Advanced Markers の DOM 統合。

**判断**: Phase 2-I は **Map pin marker を SVG 化しない** (= scope 大、 Google Maps 周辺の visual 改造を避ける)。SelectedAnchorCard / FlowTab / Detail のみ SVG 化、Map pin は既存 color + emoji 維持。

### 4.3 AnchorDetailModal への icon 追加 (= Phase 2-F の `displayCategoryLabel` 補強)

Phase 2-F で displayCategoryLabel を text 表示するが、Phase 2-I で **icon + text** に格上げ:

```tsx
{parts.displayCategoryLabel && (
  <span className="text-xs text-slate-500 flex items-center gap-1">
    <CategoryIcon className="w-3 h-3" aria-hidden="true" />
    {parts.displayCategoryLabel}
  </span>
)}
```

→ Phase 2-F の Detail density を視覚的に強化、世界トップ pattern (Google Calendar / Apple Calendar) 整合。

### 4.4 Touched files 候補

```
新規 (10):
  components/ui/icons/category/CategoryHomeIcon.tsx
  components/ui/icons/category/CategoryOfficeIcon.tsx
  components/ui/icons/category/CategorySchoolIcon.tsx
  components/ui/icons/category/CategoryCafeIcon.tsx
  components/ui/icons/category/CategoryOutdoorIcon.tsx
  components/ui/icons/category/CategoryPublicIcon.tsx
  components/ui/icons/category/CategoryTransitIcon.tsx
  components/ui/icons/category/CategoryUnknownIcon.tsx
  components/ui/icons/category/CategorySensitiveIcon.tsx
  components/ui/icons/category/index.ts
  lib/plan/categoryIconMap.ts

新規 test (1):
  tests/unit/components/categoryIconMap.test.tsx       ~80 行 (pickCategoryIcon の挙動 + snapshot)

変更 (3-4):
  app/(culcept)/plan/tabs/FlowTab.tsx               AnchorThumbnail を Icon に
  app/(culcept)/plan/tabs/MapTab.tsx                CategoryGrid / SelectedAnchorCard の icon
  app/(culcept)/plan/components/AnchorDetailModal.tsx  category icon 追加

合計: 14-15 ファイル (新規 11 + 変更 3-4)
```

### 4.5 触らないファイル (= 凍結 + CEO 制約)

- `lib/plan/external-anchor.ts` (= schema 不変)
- `lib/plan/location-category.ts` (= LocationCategory enum 不変)
- `lib/plan/anchor-detail-format.ts` (= Phase 2-F 凍結部分、`formatLocationDisplayParts` の戻り値型は不変)
- `lib/plan/anchorOverlap.ts` (= Phase 2-E 凍結)
- `lib/plan/locationConfirmationStatus.ts` (= Phase 2-D C3 凍結)
- `lib/plan/livedGeographyFallback.ts` (= Phase 2-G docs only、 実装未着手)
- 3 tab + AnchorDetailModal の **Place Identity Contract 表示** (= Phase 2-F 完全不変、Phase 2-I は icon 追加のみ)
- Map pin marker (= 既存 color + emoji、scope 外)
- PlaceCandidatesPanel / AnchorFormFields (= Phase 2-D / 2-H で別管轄)
- AddAnchorModal / EditAnchorModal (= 保存挙動不変)
- MorningMapView / CoAlter / talk / Mirror / W1-6 / DraftPlan
- migration / env / dependency

---

## 5. Implementation split (= 小さく切る、 GPT 補正)

### 5.1 案 (a): 単一 commit (= 14-15 ファイル、scope 大)

利点: 動作完結  
欠点: PR 重い

### 5.2 案 (b): **3 commit 分割** (= 推奨)

| Commit | 内容 | ファイル数 |
|--------|------|----------|
| **I-1** | Icon library (= 9 component + index + map + test) | 11 file |
| **I-2** | FlowTab + MapTab CategoryGrid / SelectedAnchorCard 統合 | 2 file |
| **I-3** | AnchorDetailModal icon 追加 (= Phase 2-F 補強) | 1 file |

各 commit 後に検証、PASS で次。

### 5.3 案 (c): 2 commit (= library + 全 UI)

中間案。library と UI を 1 単位、Detail を 1 単位。

**推奨: 案 (b)** (= I-1 / I-2 / I-3)。理由:
- icon library 単独で review 可能 (= design 観点)
- UI 統合は分けることで visual diff が見やすい
- Detail への icon 追加は Phase 2-F の延長として独立

---

## 6. Invariants

1. `LocationCategory` enum 不変 (= 8 値、Phase 2-H と共通)
2. `CATEGORY_META` 既存 const 不変 (= emoji / label / hint 維持、icon は別 layer)
3. `MAP_CATEGORY_MARKER` 既存 (= Map pin の color + emoji) 不変 (= §4.2 判断)
4. `formatLocationDisplayParts` 戻り値型 (= Phase 2-F 凍結) 不変
5. Phase 2-D C3 場所未確定 indicator / 2-E 時刻重なり / 2-F Place Identity Contract 完全不変
6. AddAnchorModal / EditAnchorModal の保存挙動 / PlaceCandidatesPanel / AnchorFormFields 完全不変
7. sensitive anchor の icon は **抽象 sensitive icon** で privacy 配慮
8. CATEGORY_META.emoji は **段階移行のため残す** (= fallback / test fixture / debug 利用)
9. Map pin marker は既存 color + emoji 維持 (= Google Maps 周辺の visual 改造回避)
10. 全 icon は `currentColor` 継承、 size class 制御、stroke 1.5px 統一

---

## 7. やること / やらないこと (= まとめ)

### 7.1 やること

| 領域 | やること |
|------|---------|
| Icon library | 9 SVG icon component + index + iconMap helper |
| FlowTab | AnchorThumbnail の emoji → SVG Icon |
| MapTab | CategoryGrid + SelectedAnchorCard の icon (= Map pin は対象外) |
| AnchorDetailModal | displayCategoryLabel に icon 追加 (= Phase 2-F 補強) |
| Test | pickCategoryIcon 単体 test、各 icon component render 確認 |

### 7.2 やらないこと

| 禁止 | 理由 |
|------|------|
| 外部 icon library 追加 (= Lucide / Phosphor / Heroicons 等の npm package) | dep、 CEO 制約 |
| 画像生成 (= PNG / WebP icon) | GPT 指示「いきなり画像生成 / 外部 asset」 禁止 |
| LocationCategory enum 拡張 | migration、 Phase 2-H と共通の制約 |
| CATEGORY_META 削除 | 段階移行、 fallback 用 |
| Map pin marker の SVG 化 | scope 大、 Google Maps 周辺の改造 |
| Animation / transition | scope 外、別 polish phase |
| dark mode 完全対応 | currentColor で部分対応、 theming 拡張は別 phase |
| Phase 2-H と同時実装 | Phase 2-H と 2-I は **別 PR / 別 branch** で並行可能 |
| AddAnchor / EditAnchor の icon | 表示層なので不要、Phase 2-H で category inference suggestion chip は可 |
| Phase 2-D/E/F/G branch への追加 commit | 凍結 |
| migration / env / dependency / push / PR / remote ops | CEO 明示禁止 |

---

## 8. Edge case 完全枚挙

| # | ケース | 期待 |
|---|-------|------|
| 1 | locationCategory = "cafe" + 通常 anchor | CategoryCafeIcon 表示 |
| 2 | locationCategory = undefined + 通常 anchor | CategoryUnknownIcon (= unknown fallback) |
| 3 | sensitive anchor (sensitiveCategory set) | **CategorySensitiveIcon** (= category 値に関わらず privacy 優先) |
| 4 | sensitive + locationCategory both set | sensitive 優先で CategorySensitiveIcon |
| 5 | icon size = 16px 表示 (= text-sm context) | 視認可能、 stroke 1.5px で潰れない |
| 6 | icon size = 32px 表示 (= title context) | 同上、解像度問題なし (= SVG vector) |
| 7 | dark mode (= 暗背景 + text-white) | currentColor 継承で stroke white |
| 8 | aria-label 渡し | screen reader に読み上げ正しい |
| 9 | aria-hidden=true 渡し | screen reader 読み上げ skip (= decorative) |
| 10 | className="text-indigo-500" 渡し | stroke が indigo-500 になる |
| 11 | unknown category fallback | CategoryUnknownIcon (= 既存 📍 emoji の SVG 版) |
| 12 | Map pin marker (= scope 外) | 既存 emoji 維持、 SVG 化しない |
| 13 | FlowTab AnchorThumbnail | Icon w-7 h-7 中央配置 |
| 14 | MapTab CategoryGrid (= 9 grid) | 各 grid cell に Icon + label |
| 15 | AnchorDetailModal categoryLabel | Icon w-3 h-3 + text inline |
| 16 | icon component snapshot test | DOM 構造一定 |

---

## 9. Test plan (= 最小限)

### 9.1 categoryIconMap.test.tsx (= 新規)

```
describe("pickCategoryIcon")
  describe("LocationCategory mapping")     # 各 8 category で expected component が返る
  describe("sensitive anchor")             # sensitive 時は CategorySensitiveIcon
  describe("sensitive + category both")    # sensitive 優先
  describe("undefined category fallback")  # unknown へ
```

### 9.2 各 Icon component の render smoke

各 icon を render して `<svg>` / `<path>` が出ることを最小確認。snapshot test で構造 lock。

### 9.3 既存 test 不変確認

- Phase 2-D / 2-E / 2-F の既存 test PASS 維持
- LocationCategory enum / CATEGORY_META 不変確認
- Phase 2-H と並行可能なので、Phase 2-H 既存 test も PASS

---

## 10. Smoke scenario

### 10.1 FlowTab で icon 表示

1. cafe anchor を作成 → FlowTab で右端 thumbnail に CategoryCafeIcon (= コーヒーカップ SVG)
2. 「家でゆっくり」 home anchor → CategoryHomeIcon (= house outline)
3. sensitive anchor → CategorySensitiveIcon (= shield / lock SVG)、title masking 維持

### 10.2 MapTab CategoryGrid

4. 9 categories Grid で全 8 icon が均一線幅で並ぶ (= 統一感)
5. 各 grid に icon + label が縦配置

### 10.3 MapTab SelectedAnchorCard

6. anchor 選択 → SelectedAnchorCard 左端の category circle に SVG icon
7. sensitive anchor → CategorySensitiveIcon、 場所 masking 既存挙動維持

### 10.4 AnchorDetailModal

8. anchor 詳細 → displayCategoryLabel の前に icon (= Phase 2-F 補強)
9. text + icon が inline で並ぶ

### 10.5 Map pin (= scope 外 / 既存維持)

10. Map pin marker は既存 color + emoji 維持 (= scope 外、 変化なし)

### 10.6 Cross-tab consistency

11. 同 anchor の category icon が FlowTab / MapTab / Detail で同じ icon

### 10.7 既存挙動完全不変

12. Phase 2-D C3 / 2-E / 2-F の indicator 動作完全不変
13. 既存 AddAnchor / EditAnchor の保存動作完全不変
14. CATEGORY_META.emoji を debug 用に呼び出し可能 (= legacy 維持)

---

## 11. Branch / commit 方針

- **base**: Phase 2-F commit `b4ab331e` を起点に派生
- **branch name**: `feat/alter-plan-phase2-i-category-icon-system`
- **既存凍結 branch すべて不変**: Phase 2-D `cda09ef1` / 2-E `677b7b6a` / 2-F `b4ab331e` / 2-G docs `38292335` / 2-H docs (= 同 wave で起票予定)
- **Phase 2-H と Phase 2-I は並行可能** (= 別 branch / 別 PR、 file 干渉なし)
- **scope 外 dirty** (next-env.d.ts / supabase/.temp / *.png) は **stage しない**
- **commit**: CEO 承認後の local commit のみ、3 commit 分割推奨 (= §5.2)
- **remote**: push / PR / gh / merge / fetch / pull **全禁止**

---

## 12. Beyond / 不採用案 (透明性)

| 案 | 却下理由 |
|----|---------|
| Lucide Icons / Phosphor Icons npm 追加 | dep、CEO 制約 |
| 画像生成 (= PNG / WebP) | GPT 指示禁止 |
| Animation / spring transition | scope 外、別 polish phase |
| LocationCategory enum 拡張 (= shopping / fitness 等) | migration、Phase 2-H と共通制約 |
| CATEGORY_META.emoji 削除 | 段階移行、 fallback 維持 |
| Map pin marker SVG 化 | Google Maps 周辺改造、scope 大 |
| dark mode 専用 icon variant | currentColor で部分対応、scope 外 |
| Phase 2-H と統合実装 | 別管轄、別 branch / 別 PR で並行 |

---

## 13. 将来拡張ポイント

1. **Map pin marker の SVG 化** (= Google Advanced Markers v2 統合)
2. **animation / transition** (= hover / tap で subtle motion)
3. **dark mode 専用 variant** (= stroke 太め / 抽象度調整)
4. **icon variant** (= filled vs outlined、context 別 weight)
5. **sensitive category 細分化 icon** (= 現在 1 抽象 icon、将来「medical 抽象」 「legal 抽象」 等の Privacy-safe variant)
6. **3rd-party icon library 検討** (= dep 解禁時に Lucide / Phosphor adopt 検討)
7. **AnchorThumbnail layout 変更** (= Phase 2-I 後の visual polish、別 phase)
8. **Phase 2-H の Category Inference suggestion chip に Icon 追加** (= 「💡 ☕ 「カフェ作業」 → カフェ ですか?」、Phase 2-H 後の補強)

---

## 14. 変更履歴

### 2026-05-21 v1 (本起票、CEO 指示 + GPT 補正 + 自立推論)

- CEO 指示: 「分類のアイコンは、claude に最高のデザインのアイコンを作らせてください」
- GPT 補正:
  - inline SVG / React icon component (= 画像生成・外部 asset 追加せず)
  - category 統一線幅・角丸・世界観
  - small UI でも見える
  - Calendar / Flow / Map / Detail で一貫利用
  - sensitive 系は情報漏えいしない抽象 icon
- 自立推論で追加:
  - **「Aneurasync Category Icon System」** として概念化
  - 世界トップ icon library (SF Symbols / Material Symbols / Lucide / Phosphor) を調査、Aneurasync 独自を抽出
  - stroke 1.5px / corner-round / viewBox 24x24 / currentColor の **strict design token** 定義
  - 8 category + sensitive の icon concept 仕様
  - Map pin marker は **scope 外** (= Google Maps 周辺改造回避)
  - emoji を **段階移行** (= CATEGORY_META 維持、UI 側で icon 優先)
  - 3 commit 分割 (= I-1 library / I-2 UI 統合 / I-3 Detail icon)
  - Phase 2-H と並行可能 (= 別 branch / 別 PR で干渉なし)
  - 将来拡張 8 項目 (= Map pin SVG / animation / variant / dark mode / 3rd-party)

---

**End of Phase 2-I Mini Design v1**. CEO 採択判断 → docs only commit → 実装 GO/NO-GO 判断をお待ちします。

Aneurasync 設計思想への寄与:
emoji 主体の OS 依存 visual から、Aneurasync 独自の **統一された細線 SVG icon system** へ移行。
glassmorphism design system と整合する世界観、currentColor theming、sensitive privacy 配慮 を内包。

Phase 2-H (Place Intent Contract) で「予定の意味を読み取る」 + Phase 2-I (Category Icon System) で「読み取った分類を世界観統一で見せる」 。
Plan の **「予定 → 場所 → 分類 → 表示」 全体の意味整合** が完成する。
