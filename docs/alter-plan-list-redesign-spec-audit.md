# Phase 3-N Plan List Redesign Spec Audit (= IA 13 拘束条件 + 第 7 補正 2 留意点 + List 詳細 spec)

**作成日**: 2026-05-24
**branch**: `docs/plan-list-redesign-spec-audit`
**前提**: IA Audit `88fdbef1` 採用確定 (= CEO + GPT 第 7 補正後最終判定、 decision-log 記録)
**性質**: docs only (= 実装変更 0、 既存 file 改変 0、 frozen branches 追加 commit 0、 List 詳細 spec 確定のみ)
**入力**: IA Audit (= 848 lines、 14 section、 13 拘束条件 + 第 7 補正引き継ぎ) + 直接 input: direction audit 1379 lines + 既存 plan UI + 過去 doc
**目的**: List の **component / typography / spacing / color / motion / interaction / a11y** を詳細 spec として確定、 List 実装の **完全な出発点** を作る (= 但しコード実装はまだ不可)

---

## 0. Executive Summary

### 0.1 本 audit の目的

| 段階 | 責務 |
|---|---|
| direction audit (= 完了) | 概念整理 (= 北極星 / 思想 / 範囲) |
| IA Audit (= 完了) | UI と構造の必須条件 (= 13 拘束条件 spec) |
| **本 Spec audit** | **component / token / interaction の詳細 spec** (= 実装の出発点) |
| 後続 impl | 実装 |

### 0.2 結論先出し

| 観点 | 結論 |
|---|---|
| 第 7 補正 2 留意点 | **詳細 spec 確定** (= §3 で provenance 多軸 + imported lock 逃がし道) |
| List 4 層 component | **8 component 確定** (= EventCard / TimelineSpine / TransitionChip / SummaryFooter / EmptyDayEntry / SourceIndicator / ExecutionLayerChip / ImportedLockEscape、 §5) |
| Typography | **6 level** (= Display / Title L / Title M / Body / Meta / Caption) |
| Color tokens | **brand 2 + category 4 + source 3 + slate 9 = 18 token** (= §8) |
| Motion | framer-motion 既存依存内、 4 pattern (= fade/reveal/drag/scale) |
| Interaction | 規約 24-extended 継承、 全 surface focus-visible + slate |
| a11y | WCAG AA 整合 + 色覚多様性配慮 (= 第 7 補正 #1 と整合) |
| 13 拘束条件 → component map | §12 で完全 mapping |
| 既存資産整合 | wave 1/2/3/3a + N-3a + 規約 24-extended 完全保持 |
| 実装着手 | Spec 採用 → List impl phase へ、 sub-phase 分割で連続 GO 不可 |

### 0.3 CEO 判断項目 (= §18 で詳細、 主要 8 件)

1. 第 7 補正 2 留意点 詳細 spec (= §3) 採用
2. List 4 層構造 詳細 spec (= §4) 採用
3. 8 component 設計 (= §5) 採用
4. Typography 6 level (= §6) 採用
5. Color tokens 18 件 (= §8) 採用
6. Motion + Interaction + a11y (= §9-§11) 採用
7. 13 拘束条件 component mapping (= §12) 採用
8. List impl phase (= 別 phase) への進行承認

---

## 1. 前提と背景

### 1.1 IA Audit との関係

IA Audit (= `88fdbef1`、 848 lines、 13 拘束条件確定) で確立した **構造**を、 本 Spec audit で **component / token / interaction** に落とし切る。

IA Audit からの引き継ぎ:
- List 4 層構造 (= §3 IA)
- 13 拘束条件 spec (= §2 IA)
- Event Execution Layer 核 (= §8.1 IA)
- 削除対象 (= §6 IA)
- 第 7 補正 2 留意点 (= §10.1.5 IA)

### 1.2 Spec の責務 (= IA との差)

| 観点 | IA Audit | Spec audit |
|---|---|---|
| 抽象度 | 「**何**を表示するか」 「**どこ**に配置するか」 | 「**どんな** component / token で実装するか」 「**どう** interact するか」 |
| 例 | 「event card に source dot を配置」 | 「`SourceIndicator` component (= 色 dot 12px + icon 14px + label string)、 left footer に配置、 `aria-label="source: imported"`」 |
| 出力 | ASCII 図 + 構造定義 | component 設計図 + token table + interaction spec |

### 1.3 第 7 補正 2 留意点 (= IA から引き継ぎ、 本 Spec で必須反映)

| # | 留意点 | 本 Spec で確定 |
|---|---|---|
| 1 | provenance を「色 dot だけ」 にしない (= a11y + 視認性 + 拡張対応) | §3.1 + §5.6 で **色 + アイコン + (必要時) 状態ラベル** 3 軸併用 spec |
| 2 | imported ロックの逃がし道 (= truth 保持 + user 不便回避) | §3.2 + §5.8 で **override 差分管理 (主) + 複製して user event 化 (補助)** 2 方式 spec |

---

## 2. Spec の責務範囲

### 2.1 含める

- List 専用 component の設計 (= 8 件、 §5)
- Typography / Spacing / Color tokens (= §6-§8)
- Motion / Interaction / a11y (= §9-§11)
- 13 拘束条件 → component の mapping (= §12)
- 既存資産との整合 (= 規約 24-extended / N-3a、 §14)

### 2.2 含めない

- Map 専用 component (= 別 audit、 `docs/plan-map-redesign-spec-audit`)
- Design system extraction (= 別 audit、 §15 順序で最後)
- 既存資産の本体改変 (= 規約 24-extended frozen file 不触)
- 実装着手 (= 本 Spec 採用後の別 phase)

---

## 3. 第 7 補正 2 留意点 詳細 spec

### 3.1 provenance 多軸表現 spec (= 第 7 補正 #1、 「色 dot だけ」 禁止)

**確定 spec**: **3 軸併用** (= 色 + アイコン + 状態ラベル)、 表示先によって subset

| 表示先 | 色 dot | icon | 状態ラベル | 理由 |
|---|---|---|---|---|
| **event card 主表示** (= List timeline 上) | ✅ (= 12 px) | ✅ (= 14 px) | ❌ (= 主画面 noise 回避) | 2 軸 (= 色 + icon)、 一目で source 識別、 但し簡潔 |
| **詳細 sheet** (= drill-down) | ✅ | ✅ | ✅ (= caption text) | 3 軸 (= 完全)、 詳細閲覧時に完全情報 |
| **競合解決 modal** (= 拘束 #3 trigger) | ✅ | ✅ | ✅ (= 説明 text) | 3 軸 + 説明、 user の判断負荷を下げる |

**各 source の 3 軸 spec**:

| source | 色 (12 px dot) | icon (14 px) | 状態ラベル (caption) |
|---|---|---|---|
| `user_entered` | **なし** (= 大多数 default、 visual noise 回避) | **なし** | **なし** (= default) |
| `imported` | **slate-500** (= 静的 neutral) | **📄** (= document icon、 source 真実性象徴) | **「シフト表から」** / 「時間割から」 等の source 名 |
| `alter_generated_proposed` (= 未確定) | **indigo-400** (= brand、 subtle) | **✨** (= sparkle、 Alter 標識) | **「提案中」** chip (= subtle、 dashed border) |
| `alter_generated_accepted` (= 確定済) | (= dot 消滅) | (= 詳細 sheet で metadata icon) | (= 詳細 sheet) **「Alter 提案を受け入れ済」** caption |

**a11y 整合**:
- 色 + icon の 2 軸併用で **色覚多様性に対応** (= 色のみ依存禁止)
- `aria-label` 必須 (= 例: `aria-label="source: シフト表から imported"`)
- icon の `role="img"` + `aria-hidden="false"` (= screen reader 対応)
- WCAG AA contrast 整合 (= slate-500 / indigo-400 ともに background 上で AA 通過)

**実装 component**: `SourceIndicator` (= §5.6)

### 3.2 imported lock 逃がし道 spec (= 第 7 補正 #2、 「truth 保持 + user 不便回避」)

**確定 spec**: **override 差分管理 (= 主) + 複製して user event 化 (= 補助)** の **2 方式併用**

#### 3.2.1 方式 A: override 差分管理 (= 主、 推奨)

- imported anchor を **そのまま保持** (= source 真実性)
- user の変更は **diff layer** で別管理 (= internal: `imported_override` metadata)
- 表示: user 編集後内容 (= override の効果)
- metadata で「imported 元」 + 「user 差分」 を保持 (= 詳細 sheet で「元の imported を見る」 可能)
- 同期: 外部 source が更新された時、 imported 元のみ更新、 override は維持 (= user 意図保持)

**長所**: 1 anchor で完結、 視覚的 clean、 imported の正本性保持
**短所**: 実装複雑、 metadata 管理必要

#### 3.2.2 方式 B: 複製して user event 化 (= 補助、 「完全に別予定」 case)

- imported anchor は **不変** (= original 保持)
- user が「複製」 を選択 → **新規 user_entered anchor 作成**
- 結果: 2 anchor 並存 (= imported + user_entered、 但し時刻同じなら競合 modal trigger)
- 競合 modal の選択肢に「両方残す」 が default (= user 選択尊重)

**長所**: 実装 simple、 user の意図が明確
**短所**: visual noise (= 2 anchor)、 競合 modal 頻発

#### 3.2.3 user UX (= modal 提示)

imported anchor の編集 attempt 時 → modal 表示:

```
[imported anchor: シフト 14:00-18:00] 編集

時刻 / 場所は imported source 保護のためロックされています。
どちらの方法で編集しますか?

[ override で差分管理 (= 推奨) ]
  ・元の imported 情報は保持
  ・user の変更だけを別 layer で保存
  ・後で元情報も確認可能

[ 複製して別予定として編集 ]
  ・元の imported 情報は残す
  ・新しい予定として user 編集可能
  ・両方が plan に並ぶ
```

- 1st 選択は **override 差分管理 (= 推奨)** を強調
- user が「完全に別予定」 と判断したい場合のみ B を選択
- modal は subtle (= push しない、 user の override 行為に対する応答)

**実装 component**: `ImportedLockEscape` (= modal + diff layer 管理、 §5.8)

#### 3.2.4 IA 拘束条件との整合

- 拘束 #2 (= 編集可能性、 §2.1 IA): imported 時刻/場所ロック維持、 但し title/メモ/Execution Layer は自由編集
- 第 7 補正 #2: 時刻/場所ロックの「逃がし道」 として override or 複製
- 統合: user 編集の **default は title/メモ/Execution Layer (= 既存 IA #2)**、 時刻/場所変更 attempt 時のみ ImportedLockEscape modal trigger

---

## 4. List 4 層構造 詳細 spec (= IA §3 を実装観点で詳細化)

### 4.1 Layer 1: Header (= sticky)

| 要素 | spec |
|---|---|
| ANEURASYNC ALTER ロゴ | center、 14 px Display weight、 brand color、 縦 2 段 |
| Alter Planning (= section label) | subtle indigo-500/600 Title case、 letter-spacing 0.1em、 text-xs |
| 今日のプラン (= 主見出し) | 24-28 px semibold、 text-slate-900、 line-height 1.2 |
| subtitle | 14 px regular、 text-slate-500、 line-height 1.5、 「時間の流れを把握して、 心地よい 1 日に。」 |
| 配置 | sticky top、 background blur 20px、 padding 16px |

### 4.2 Layer 2: Navigation

| 要素 | spec |
|---|---|
| toggle (= マップ / リスト) | right-aligned、 segmented control、 white bg + indigo selected、 height 40px |
| date selector | center、 `< 6月12日 (木) >`、 chevron + text、 text-sm |
| 配置 | header 直下、 padding 12px、 background slate-50 |

### 4.3 Layer 3: Timeline body (= scroll、 主要領域)

| 要素 | spec |
|---|---|
| 時刻 label (= 09:00 等) | left、 text-base + category color + tabular-nums、 fixed width 56px |
| spine | center vertical line、 2 px slate-200、 height 100% |
| event circle (= icon container) | 32 px、 category color bg、 white icon center、 spine 上 dot |
| event card | right、 EventCard component (= §5.1)、 left margin 16 px from spine |
| transition chip | center、 TransitionChip component (= §5.3)、 「移動」 or 「移動・リフレッシュ」 |
| empty day entry | timeline 末尾 (= empty 日のみ)、 EmptyDayEntry component (= §5.5、 N-3a 連携) |
| scroll | smooth、 momentum、 sticky header との連動 |

### 4.4 Layer 4: Summary footer

| 要素 | spec |
|---|---|
| SummaryFooter component | bottom fixed、 padding 16px、 background white + shadow-top |
| 内容 | 「78% バランス良好」 + circle progress + 説明 + 「リズムを整えるヒント ›」 CTA |
| visual | text-xl 78% + text-sm 説明 + text-sm CTA button |
| height | 80-100 px |

---

## 5. Component 設計 (= 8 件)

### 5.1 EventCard (= 主役 component)

```typescript
type EventCardProps = {
  readonly event: PlanEvent;
  readonly source: SourceType; // 'user_entered' | 'imported' | 'alter_generated_proposed' | 'alter_generated_accepted'
  readonly executionLayer?: EventExecutionLayer;
  readonly onTap: () => void;
};
```

**visual spec**:
- container: `rounded-2xl` + `bg-white` + `shadow-sm`、 padding 16px
- left border: 4px category color
- title: text-lg semibold、 text-slate-900
- 時刻 range: text-sm + category color、 top right
- 場所: text-sm + text-slate-500 + 📍 icon
- Alter 補助文: text-sm + text-slate-600 + ✨ icon (= sparkle)
- semantic visual: 80x80 rounded-2xl (= image or category illustration)
- source indicator: left footer、 SourceIndicator component
- execution chip: right footer、 ExecutionLayerChip component (= 「準備 3」 等)
- 確定前 (= alter_generated_proposed): dashed border + opacity 0.7 + 「受け入れる ›」 chip top right
- focus-visible: `focus-visible:border-slate-300` (= 規約 24-extended)
- hover: `hover:shadow-md` (= subtle)

### 5.2 TimelineSpine (= 構造 component)

```typescript
type TimelineSpineProps = {
  readonly events: ReadonlyArray<PlanEvent>;
  readonly transitions: ReadonlyArray<Transition>;
};
```

**visual spec**:
- 縦 line: 2 px slate-200、 height = events 全長
- circle (= event spine 接続点): 32 px、 category color
- 時刻 label: left of spine、 category color
- 構造のみ、 interactive ではない

### 5.3 TransitionChip (= 「移動」 chip)

```typescript
type TransitionChipProps = {
  readonly fromTime: string;
  readonly toTime: string;
  readonly label?: string; // default '移動'
};
```

**visual spec**:
- 中央寄せ、 text-xs + text-slate-400
- 細い line で前後 event を繋ぐ (= spine 補完)
- label + 時刻 range (= 「移動 ─ 11:00-12:00」)
- non-interactive (= 構造表現のみ)

### 5.4 SummaryFooter (= 1 日全体観測)

```typescript
type SummaryFooterProps = {
  readonly score?: number; // 「78%」 等 (= score の有無は構造論点、 direction §13)
  readonly statusLabel: string; // 「バランス良好」
  readonly description: string; // 「集中と休息のバランスが取れた良いプラン」
  readonly ctaLabel?: string; // 「リズムを整えるヒント ›」
  readonly onCtaTap?: () => void;
};
```

**visual spec**:
- bottom fixed、 white bg + shadow-top
- 78% + circle progress (= multi-segment、 category color encoded)
- 説明文 + 補助 info icon
- CTA button (= outline + sparkle icon)

### 5.5 EmptyDayEntry (= N-3a 連携)

```typescript
type EmptyDayEntryProps = {
  readonly context: EmptyDayEntryContext; // N-3a 既定
  readonly onTap?: () => void; // N-3b 以降で接続
};
```

**visual spec**:
- timeline 末尾 (= empty 日のみ、 isEmptyDay(anchors) === true)
- label: `EMPTY_DAY_ENTRY_LABEL = "ALTER で見る ›"` (= N-3a `d55aab5f`)
- text-sm + text-slate-500、 chevron 付き
- 控えめ tone (= push しない、 user initiated)
- focus-visible: `focus-visible:border-slate-300` (= 規約 24-extended、 N-3a 整合)

### 5.6 SourceIndicator (= 第 7 補正 #1 多軸表現)

```typescript
type SourceIndicatorProps = {
  readonly source: SourceType;
  readonly importedFrom?: string; // 「シフト表から」 等、 source === 'imported' 時
  readonly variant: 'compact' | 'full'; // compact = 色 + icon、 full = 色 + icon + label
};
```

**visual spec**:
- variant `compact` (= event card 主表示): 色 dot (12 px) + icon (14 px)、 horizontal align
- variant `full` (= 詳細 sheet / 競合 modal): 色 dot + icon + label caption (= text-xs + text-slate-500)
- 各 source の色 / icon / label は §3.1 表に従う
- `aria-label`: `source: ${sourceLabel}` (= 例: `source: シフト表から imported`)
- a11y: 色覚多様性に対応 (= 色 + icon の 2 軸併用)

### 5.7 ExecutionLayerChip (= IA #6 軽いサイン)

```typescript
type ExecutionLayerChipProps = {
  readonly counts: {
    readonly preparation?: number;
    readonly post?: number;
    // 他 4 種類 (= execution / conditions / day_notes / learning)
  };
  readonly onTap: () => void;
};
```

**visual spec**:
- text-xs + text-slate-500、 footer 配置
- 0 件: 非表示
- compound 表示: 「準備 3 / 事後 1」 等、 slash 区切り
- tap → 詳細 sheet (= drill-down)
- focus-visible: `focus-visible:border-slate-300`

### 5.8 ImportedLockEscape (= 第 7 補正 #2 逃がし道)

```typescript
type ImportedLockEscapeProps = {
  readonly importedAnchor: ExternalAnchor;
  readonly onOverride: (diff: AnchorDiff) => void;
  readonly onClone: () => void;
  readonly onCancel: () => void;
};
```

**visual spec**:
- modal (= bottom sheet style on mobile)
- title: 「{imported title} 編集」
- 説明: 「時刻 / 場所は imported source 保護のためロックされています」
- 2 button (= vertical stack):
  - 「override で差分管理 (= 推奨)」 (= primary、 indigo)
  - 「複製して別予定として編集」 (= outline、 slate)
- cancel button: top right (= subtle、 x icon)
- focus-visible: 規約 24-extended

---

## 6. Typography spec

### 6.1 Type scale 6 level (= mobile size)

| level | size | weight | line-height | 用途 |
|---|---|---|---|---|
| **Display** | 28-32 px | semibold (= 600) | 1.2 | 主見出し (= 「今日のプラン」、 logo 等) |
| **Title L** | 20-24 px | semibold | 1.3 | event card title |
| **Title M** | 16-18 px | medium (= 500) | 1.4 | section label / sheet title |
| **Body** | 14-15 px | regular (= 400) | 1.6 | 補助文 / 説明 |
| **Meta** | 12-13 px | regular | 1.5 | 時刻 / 住所 / chip / caption |
| **Caption** | 11-12 px | regular | 1.4 | label / legend / aria-text |

### 6.2 font family

- `font-sans` (= Tailwind default、 system font stack)
- 日本語: Hiragino Sans / Yu Gothic UI / Noto Sans JP fallback
- 英数字: -apple-system / BlinkMacSystemFont / Segoe UI

### 6.3 Tabular numbers

- 時刻 (= 09:00 等) / score (= 78%) は `tabular-nums` 強制 (= 桁ズレ防止)

---

## 7. Spacing scale spec

### 7.1 padding / margin scale

| token | px | 用途 |
|---|---|---|
| `--space-xs` | 4 | inline gap、 icon padding |
| `--space-sm` | 8 | chip padding、 small inline gap |
| `--space-md` | 12 | card inner padding、 button padding |
| `--space-lg` | 16 | card outer padding、 section gap |
| `--space-xl` | 24 | major section gap |
| `--space-2xl` | 32 | hero block padding |

### 7.2 gap (= flex / grid)

- timeline events: `gap-4` (= 16 px)
- card 内 elements: `gap-2` (= 8 px)
- transition の前後: `gap-3` (= 12 px)

---

## 8. Color tokens spec (= 18 token)

### 8.1 Brand color (= 2 token)

| token | hex | 用途 |
|---|---|---|
| `--brand-indigo` | indigo-500 | logo / primary CTA / Alter sparkle / brand identity |
| `--brand-purple` | purple-500 | (= 必要時のみ、 subtle accent) |

### 8.2 Category color (= 4 token)

| token | hex | 用途 |
|---|---|---|
| `--category-cafe` | 紫 (= indigo/violet 系) | カフェ event |
| `--category-meal` | オレンジ (= orange-500) | ランチ / 食事 event |
| `--category-work` | 青 (= blue/sky 系) | オフィス / 仕事 event |
| `--category-home` | 緑 (= emerald 系) | 帰宅 / 家 event |

### 8.3 Source color (= 3 token、 第 7 補正 #1 dot 用)

| token | hex | source |
|---|---|---|
| `--source-imported` | slate-500 | `imported` source dot |
| `--source-alter` | indigo-400 | `alter_generated_proposed` source dot |
| (= なし) | — | `user_entered` (= dot なし default) |

### 8.4 Slate scale (= 9 token)

- `slate-50` (= bg)
- `slate-100`-`slate-200` (= border)
- `slate-300`-`slate-400` (= focus-visible / secondary text)
- `slate-500`-`slate-600` (= body text)
- `slate-700`-`slate-900` (= primary text)

→ 規約 24-extended の **focus-visible: slate-300/400** を継承。

---

## 9. Motion spec (= framer-motion 既存依存内)

### 9.1 motion pattern 4 件

| pattern | duration | easing | 用途 |
|---|---|---|---|
| `fade-in` | 200ms | ease-out | card 表示 / sheet 表示 |
| `slide-reveal` | 300ms | ease-in-out | sheet drill-down 開閉 |
| `drag-sheet` | rubber-band | spring | bottom sheet drag |
| `scale-tap` | 100ms | ease-out | card tap feedback (= scale 0.98) |

### 9.2 削除対象 (= 過剰 motion 禁止)

- 自動 looping animation (= 注意を奪う)
- bounce / elastic over-shoot (= playful 過剰)
- parallax / 3D rotation (= 主役を曖昧化)

---

## 10. Interaction spec

### 10.1 tap (= primary action)

- event card tap → 詳細 sheet 開閉 (= drag for full)
- ExecutionLayerChip tap → 詳細 sheet 内の Execution section scroll to
- EmptyDayEntry tap → (= N-3b 以降、 placeholder)
- SourceIndicator tap → tooltip 表示 (= source 詳細)
- ImportedLockEscape modal tap → 2 option (= override / 複製)

### 10.2 hover (= desktop)

- event card hover: `hover:shadow-md`、 brand color border (= category color subtle)
- chip hover: `hover:bg-slate-50`

### 10.3 focus (= keyboard、 規約 24-extended 厳守)

- 全 interactive surface: `focus-visible:border-slate-300` (= ring or border)
- `focus:outline-none` 維持 (= browser default 排除)
- brand color の focus context 禁止 (= 規約 24-extended)

### 10.4 drag (= bottom sheet 等、 Map で使用、 List では minimal)

- List timeline: scroll のみ (= 通常 vertical scroll)
- Map bottom sheet: 3 段階 drag (= peek/half/full、 別 audit)

---

## 11. a11y spec

### 11.1 keyboard navigation

- Tab / Shift+Tab: 全 interactive surface を巡回
- Enter: 主 action (= tap 同等)
- Escape: sheet close / modal close
- Arrow keys: timeline 内 event navigation (= 後段 enhancement)

### 11.2 ARIA

- event card: `role="article"` + `aria-labelledby="event-title-{id}"`
- SourceIndicator: `aria-label="source: ${sourceLabel}"`
- ExecutionLayerChip: `aria-label="${count} 件の実行 layer 項目"`
- EmptyDayEntry: `aria-label="ALTER で見る、 観測の余地"`
- timeline spine: `aria-hidden="true"` (= 装飾要素)
- date selector: `aria-label="日付選択 ${date}"`

### 11.3 contrast

- すべての text と background のペアが **WCAG AA (= 4.5:1)** 以上
- focus-visible (= slate-300) と background のコントラスト確認
- category color と text の contrast 確認

### 11.4 色覚多様性 (= 第 7 補正 #1 整合)

- source provenance は **色 + icon の 2 軸** で表現 (= 色のみ依存禁止)
- category color も **icon + 色** で重複 encoding
- 重要 information は **text** で fallback

### 11.5 screen reader

- 各 event card: title → 時刻 → 場所 → Alter 補助文 → execution chip count の読み上げ順
- timeline 構造: `role="list"` + 各 event card に `role="listitem"`
- empty day: 「観測の余地」 と明示

---

## 12. 13 拘束条件 → component mapping

| # | 拘束条件 | mapping component |
|---|---|---|
| 1 | source provenance UI | `SourceIndicator` (= §5.6、 3 軸 spec) |
| 2 | 各 source 編集可能性 | event card tap → 詳細 sheet (= edit affordance gating) |
| 3 | 競合解決 | confirm modal (= 別 component、 後段) + `SourceIndicator` |
| 4 | 優先表示 | TimelineSpine 内の event ordering |
| 5 | 確定前後表現分離 | EventCard の `confirmedState` prop (= dashed/opacity/chip) |
| **12** | **状態遷移 + 競合解決単位** | EventCard state machine (= props for transition) + `ImportedLockEscape` で override transition |
| 6 | 軽いサイン | `ExecutionLayerChip` (= §5.7) |
| 7 | 詳細 sheet 順序 | 詳細 sheet component (= 別 audit Map と統合) |
| 8 | 出さないイベント | `ExecutionLayerChip` 表示 logic (= counts === 0 で hide) |
| 9 | 由来区別 | 詳細 sheet 内 icon prefix (= sparkle/none/document/repeat) |
| 10 | imported hybrid | event card + `SourceIndicator` (= anchor provenance + Execution layer provenance 分離) |
| 11 | Alter 会話 deep-dive | 詳細 sheet 最下部 button (= 「Alter で深く考える ›」) |
| **13** | **学習ループ + source 別学習** | silent learning (= component 不要、 編集 event → 学習 store、 別 phase) |

---

## 13. ASCII 図 + component map

```
List 画面 (= mobile)
┌─────────────────────────────────────────┐
│ [Layer 1: Header (= sticky)]            │
│   ANEURASYNC ALTER ロゴ                 │
│   Alter Planning (= Title M、 紫 caps)   │
│   今日のプラン (= Display)              │
│   subtitle (= Body)                     │
├─────────────────────────────────────────┤
│ [Layer 2: Navigation]                   │
│   マップ | リスト toggle                │
│   < 6月12日 (木) > date selector        │
├─────────────────────────────────────────┤
│ [Layer 3: Timeline body (= scroll)]    │
│                                          │
│   09:00 ●──── ┌──────────────────────┐ │
│   (= category │ <EventCard>           │ │
│      color)   │  09:00-11:00          │ │
│               │  甲府駅近くのカフェ   │ │
│               │  📍 山梨県甲府市〜   │ │
│               │  ✨ 集中しやすい〜    │ │
│               │  [semantic visual]    │ │
│               │  ●📄 「シフト表から」 │ │
│               │  (= SourceIndicator)  │ │
│               │  準備 3 / 事後 1      │ │
│               │  (= ExecutionLayerChip)│ │
│               └──────────────────────┘ │
│                                          │
│   ─── <TransitionChip> ─── 11:00-12:00 │
│       「移動・リフレッシュ」              │
│                                          │
│   12:00 ●──── ┌──────────────────────┐ │
│               │ <EventCard>           │ │
│               │ ... (= 同構造)        │ │
│               └──────────────────────┘ │
│                                          │
│   [empty 日のみ]                         │
│   <EmptyDayEntry> 「ALTER で見る ›」    │
│                                          │
├─────────────────────────────────────────┤
│ [Layer 4: Summary footer (= fixed)]    │
│   <SummaryFooter>                       │
│   78% バランス良好                      │
│   集中と休息のバランスが取れた〜       │
│   「リズムを整えるヒント ›」 CTA        │
├─────────────────────────────────────────┤
│ [Bottom tab (= global)]                │
│   今日のプラン / インサイト / Alter メモ / 設定 │
└─────────────────────────────────────────┘

[Modal trigger: imported event 時刻/場所編集 attempt]
<ImportedLockEscape>
┌─────────────────────────────────────────┐
│ シフト 14:00-18:00 編集            [×] │
│                                          │
│ 時刻 / 場所は imported source 保護の    │
│ ためロックされています。                 │
│ どちらの方法で編集しますか?              │
│                                          │
│ ┌──────────────────────────────────┐   │
│ │ override で差分管理 (= 推奨)      │   │
│ │ ・元の imported 情報は保持        │   │
│ │ ・user の変更だけ別 layer 保存    │   │
│ └──────────────────────────────────┘   │
│ ┌──────────────────────────────────┐   │
│ │ 複製して別予定として編集          │   │
│ │ ・元の imported 情報は残す        │   │
│ │ ・新しい予定として user 編集可能  │   │
│ │ ・両方が plan に並ぶ              │   │
│ └──────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

---

## 14. 既存資産との整合

### 14.1 規約 24-extended (= 完全保持)

- 全 component の focus surface: `focus-visible:` + `slate-*`
- brand color の focus context 禁止
- 新規 component (= 8 件) は TARGET_FILES に追加 (= 規約 24-extended 機械保証拡張)
- 機械保証 40 → 48 件 (= +8 件想定)

### 14.2 N-3a foundation (= 完全活用)

- `EMPTY_DAY_ENTRY_LABEL`、 `isEmptyDay()`、 `EmptyDayEntryViewModel` を直接利用
- `EmptyDayEntry` component (= §5.5) で N-3a 提供 API を consume
- N-3a 再実装禁止 (= 既存 file 不触)

### 14.3 既存 anchor data model (= 不変)

- `ExternalAnchor` type は変更しない
- 新 view model (= `EventCardViewModel` 等) で anchor を input として transform
- source 属性 (= 第 7 補正 #1 / #2 で活用) は内部 metadata で対応
- API endpoint は不変

### 14.4 既存 plan tab (= 段階的置換)

- `FlowTab.tsx` (= 772 lines)、 `MapTab.tsx` (= 1673 lines)、 `CalendarTab.tsx` (= 688 lines、 redesign 対象外)
- 新 component で段階的置換 (= sub-phase 分割、 各 sub-phase で smoke)
- 完全置換まで old / new 並走可能性 (= feature flag、 別 audit)

---

## 15. 実装順序 (= sub-phase 分割、 IA Audit §13.1 継承)

| # | sub-phase | 内容 | 規模 |
|---|---|---|---|
| 1 | List Spec (= 本 audit) | 詳細 spec 確定 | 大 (= 1000+ lines) |
| 2 | **List impl: foundation** | type / view model / 共通 util (= N-3a pattern) | 中 |
| 3 | **List impl: TimelineSpine + EventCard** | timeline 構造 + event 表示 | 大 |
| 4 | **List impl: TransitionChip + EmptyDayEntry** | 補助要素 | 小 |
| 5 | **List impl: SummaryFooter** | 1 日観測 | 中 |
| 6 | **List impl: SourceIndicator + ExecutionLayerChip** | 第 7 補正 #1 + IA #6 | 中 |
| 7 | **List impl: ImportedLockEscape** | 第 7 補正 #2 modal | 中 |
| 8 | **List impl: 統合 + 既存 FlowTab 置換** | full integration | 大 |
| 9 | List closeout audit | 完了 audit | 小 |
| 10 | Map Redesign Spec audit | Map 専用 spec | 大 |
| 11- | (= Map impl 以降、 IA §13.1 順序) | — | — |

→ **連続 GO 不可**、 各 sub-phase で CEO smoke 必須。

---

## 16. risk 評価

| risk | level | mitigation |
|---|---|---|
| 第 7 補正 spec の実装複雑度 (= override 差分管理) | high | 主は override、 補助は複製 (= simple)、 段階的実装 |
| 8 component の責務肥大 | medium | component 単位で sub-phase 分割、 各 phase で smoke |
| 規約 24-extended 違反復活 | medium | 新規 component は TARGET_FILES に追加、 regression test 拡張 |
| 既存 FlowTab 置換時の機能消失 | medium | 段階的置換 + feature flag 検討 (= 別 audit) |
| Typography / Color tokens の design system 不整合 | low | Design System Extraction audit (= §15 順序最後) で正式化 |
| a11y 不足 | low | §11 で WCAG AA + 色覚多様性 + ARIA 完全網羅 |
| Map との visual 乖離 | low | §5 component は List 専用、 Map で流用する共通 token は §8 |
| Motion 過剰 | low | §9.2 削除対象明示、 4 pattern に限定 |

---

## 17. 禁止事項

### 17.1 永続禁止 (= direction §14.1 継承)

- Arrival Risk / Counter-Factual generation / 禁止語 10 件 / 警告色 / icon badge warning box
- localStorage / DB / env / package / dependency 変更
- fetch / push / gh / reset / restore / stash / branch delete
- Routes API / 実 API
- Deploy readiness / Stargazer pivot / Rendezvous / Genome pivot / 初期ユーザー獲得

### 17.2 Spec audit 固有禁止

- 既存 wave 1/2/3/3a frozen file への追加変更
- N-3a foundation の再実装 (= 既存を consume のみ)
- 13 拘束条件と矛盾する component 設計
- 第 7 補正 2 留意点の単独 dot/lock 設計 (= 多軸 + 逃がし道必須)
- 「ただの観測アプリ」 / 「ただの予定管理アプリ」 / 「独特な planning」 化 (= direction §6.3 継承)
- Map 専用 component の本 Spec への混入 (= 別 audit)
- Design System Extraction の先取り (= 別 audit、 順序最後)

### 17.3 本 audit 段階固有禁止 (= docs only)

- 実装着手 (= 新規 file 作成、 既存 file 改変)
- 別 sub-phase audit (= Map Spec、 Design System Extraction) への独断進行
- frozen branches 追加 commit

---

## 18. CEO 判断項目 (= 報告で停止、 主要 8 件)

### 18.1 第 7 補正 spec

| # | 判断項目 |
|---|---|
| 1 | provenance 3 軸表現 spec (= §3.1、 色 + icon + (必要時) label) 採用 |
| 2 | imported lock 逃がし道 2 方式 (= §3.2、 override 主 + 複製 補助) 採用 |

### 18.2 List 構造 + component

| # | 判断項目 |
|---|---|
| 3 | List 4 層構造 詳細 spec (= §4) 採用 |
| 4 | 8 component 設計 (= §5) 採用 |

### 18.3 token + interaction

| # | 判断項目 |
|---|---|
| 5 | Typography 6 level (= §6) + Spacing scale (= §7) + Color tokens 18 件 (= §8) 採用 |
| 6 | Motion 4 pattern (= §9) + Interaction (= §10) + a11y (= §11) 採用 |

### 18.4 進行

| # | 判断項目 |
|---|---|
| 7 | 13 拘束条件 component mapping (= §12) 採用 |
| 8 | List impl phase (= §15、 sub-phase 分割) 進行承認 |

---

## 19. 結論

### 19.1 本 audit の成果

1. 第 7 補正 2 留意点 詳細 spec 確定 (= §3、 provenance 3 軸 + imported lock 逃がし道 2 方式)
2. List 4 層構造 詳細 spec (= §4)
3. **8 component 設計** (= §5、 EventCard / TimelineSpine / TransitionChip / SummaryFooter / EmptyDayEntry / SourceIndicator / ExecutionLayerChip / ImportedLockEscape)
4. Typography 6 level + Spacing scale + Color tokens 18 件 (= §6-§8)
5. Motion 4 pattern + Interaction + a11y (= §9-§11)
6. 13 拘束条件 → component mapping (= §12)
7. ASCII 図 + component map (= §13)
8. 既存資産整合 + 実装順序 + 禁止事項 (= §14-§17)
9. CEO 判断項目 8 件 (= §18)

### 19.2 List Redesign Spec audit 完了宣言

> 本 Spec audit は IA Audit `88fdbef1` で確立した 13 拘束条件 + 第 7 補正 2 留意点をすべて **component / token / interaction の詳細 spec** として確定した。 List 実装の **完全な出発点** が整った。 但しコード実装は本 audit 採用 + 別 phase 着手承認後。

### 19.3 次のアクション (= CEO + GPT 第 8 補正後最終判定)

1. **Spec 採用確定** (= 2026-05-24、 CEO + GPT 第 8 補正後最終判定、 decision-log で正式記録)
2. **List impl phase** に進行 (= 但し最初の sub-phase から、 各段階で停止して報告)
3. 第 8 補正 3 留意点を **implement で必須反映** (= §19.5 詳細)
4. List impl 完了後 → List closeout → Map Spec → Map impl → Design System Extraction
5. merge: /plan complete まで frozen 維持

### 19.5 第 8 補正 3 留意点 (= List impl で必須反映、 GPT 第 8 補正)

GPT 第 8 補正 (= 2026-05-24): 「実装に進んでよい。 但し全面実装ではなく、 最初の sub-phase から始める。 各段階で停止」

| # | 留意点 | impl での反映 |
|---|---|---|
| 1 | **SummaryFooter は first pass で score / 評価文を作り込まない** | foundation + 初期 sub-phase では **構造の箱まで**。 score / 「78%」 / 「バランス良好」 等の評価文は **凍結**、 timeline / event card / transition / provenance / empty day を優先 |
| 2 | **accepted Alter generated の provenance は完全消失前提にしない** | foundation type で **`alterAcceptedAt?: string` metadata を確保**。 main card は dot 消滅 (= §3.1) 維持、 詳細 sheet では由来表示、 main card に極小 metadata の逃がし道残す (= 後段 sub-phase で実装) |
| 3 | **Event Execution Layer は first pass で全部やらない** | foundation + 初期 sub-phase では **card 上の軽い chip + detail 内の置き場所 + provenance 表示の枠** まで。 学習ループ本実装は後続 sub-phase / 別 phase |

### 19.6 sub-phase 分割の具体 (= §15 詳細化、 各停止点明示、 第 9 補正で表現統一)

**表現統一** (= 第 9 補正 #2): UI 変更ではなく code-level 確認のため、 **「smoke」 → 「checkpoint」** に統一 (= `foundation checkpoint` / `contract checkpoint` / `code-level checkpoint`)。 UI が入った後 (= sub-phase 4+) は「visual smoke」 と区別。

| # | sub-phase | 内容 | 完了 trigger |
|---|---|---|---|
| 2 | **List impl foundation** (= ✅ 着地 `5ccfc163`) | 最小: type 定義 + contract test | **foundation checkpoint** (= type 整合 + test PASS + 既存不触) |
| **3** | **List impl: copy contract + helper + factory** (= **次に着手**) | copy contract + sourceProvenance helper + **factory (= discriminated union + validator で不正組み合わせ機械的禁止、 第 9 補正 #1)** + test | **contract checkpoint** (= 不正組み合わせ作成不能 + test PASS) |
| 4 | List impl: TimelineSpine + EventCard | 主要 component 2 件、 UI 接続なし (= 既存 FlowTab 不触、 別 demo route) | visual smoke (= UI 入った後) |
| 5 | List impl: TransitionChip + EmptyDayEntry | 補助 component | visual smoke |
| 6 | List impl: SourceIndicator + ExecutionLayerChip | 第 7 補正 #1 + IA #6 (= first pass: 枠まで) | visual smoke |
| 7 | List impl: ImportedLockEscape | 第 7 補正 #2 modal (= override 主、 複製 補助) | visual smoke |
| 8 | List impl: SummaryFooter | 第 8 補正 #1: 構造の箱まで、 score 凍結 | visual smoke |
| 9 | List impl: 統合 + FlowTab 段階置換 | 全 component 統合、 feature flag で old/new 並走 | visual smoke |
| 10 | List closeout audit | 完了 audit + freeze 宣言 | — |

→ **連続 GO 不可**、 各 sub-phase で checkpoint or visual smoke 必須、 報告で停止。

### 19.7 第 9 補正 2 留意点 (= List impl 進行で必須反映、 GPT 第 9 補正)

GPT 第 9 補正 (= 2026-05-24): 「foundation 採用、 次の sub-phase 進行 OK。 但し 2 点明示補正」

| # | 留意点 | 反映 |
|---|---|---|
| **1** | **SourceType と ConfirmedState の不正組み合わせ対策** (= 現状 foundation type 上、 `user_entered + proposed` / `imported + proposed` / `alter_generated_proposed + alterAcceptedAt` 等の不正状態が表現可能) | **sub-phase 3 で discriminated union + factory function 採用済** (= commit `66e3a841`)、 **更に sub-phase 3.5 で 2 軸モデル refactor** (= 第 10 補正、 §19.8) |
| **2** | **「CEO smoke」 → 「checkpoint」 表現統一** (= UI 変更ではなく code-level 確認) | 以降の sub-phase で **`foundation checkpoint` / `contract checkpoint` / `code-level checkpoint`** に統一 (= sub-phase 4+ の UI 入った後は「visual smoke」 で区別、 §19.6 update 済) |

**補足**: `EventCategory` 5 値 (= cafe / meal / work / home / other) は **仮**。 最終 domain 凍結扱いせず、 後段 sub-phase / spec / helper で **拡張可能**として保持。

### 19.8 第 10 補正: source model 2 軸分離 (= sub-phase 3.5 で実装、 GPT 第 10 補正)

GPT 第 10 補正 (= 2026-05-24): 「sub-phase 3 commit は採用、 ただし次の UI sub-phase 前に source model の主語整理を helper/factory 層で 1 回入れる」

**問題**: sub-phase 3 の SourceType は 1 軸に「由来 / 所有権 / 確定状態」 を載せて混在。 「accepted Alter generated は user_entered 化」 vs 「alter_generated_accepted」 の説明が揺れる。

**解決** (= 2 軸分離、 sub-phase 3.5 で実装):

| 軸 | 値 | 性質 |
|---|---|---|
| **Origin** | user / imported / alter_generated | 由来 (= **immutable**、 「由来は消えない」) |
| **Authority** | proposed / user_owned / import_locked | 所有権 (= transition 可能) |

**5 valid variant** (= 9 組合せから 4 不正除外、 discriminated union):

| variant | origin | authority | 追加 metadata |
|---|---|---|---|
| UserOwnedSource | user | user_owned | — |
| ImportedLockedSource | imported | import_locked | importedFrom |
| ImportedOverriddenSource | imported | user_owned | importedFrom (= 第 7 補正 #2 override 後) |
| AlterProposedSource | alter_generated | proposed | — |
| **AlterAcceptedSource** | **alter_generated** | **user_owned** | **acceptedAt** (= 第 8 補正 #2 + 第 10 補正本質) |

**accepted Alter generated の正準形**:
```typescript
{
  origin: 'alter_generated',  // 由来は永遠保持
  authority: 'user_owned',    // 編集自由
  acceptedAt: '...',          // 受け入れ時刻
}
```

→ 「由来は消えない」 + 「user が編集できる」 を矛盾なく表現。

**3 transition functions** (= 第 7 補正 + 第 8 補正 統合):
- `acceptAlterProposed` (= 第 8 補正 #2、 acceptedAt 自動付与)
- `overrideImported` (= 第 7 補正 #2 override 主方式、 importedFrom 保持)
- `cloneImported` (= 第 7 補正 #2 複製 補助方式、 新規 user event)

**3 derived helpers** (= UI 判定): `isProposed` / `isImportLocked` / `isAlterOrigin`

**実装** (= sub-phase 3.5):
- `lib/plan/list/sourceProvenance.ts` 全面 refactor (= commit `b6c4b2e2`)
- `tests/unit/plan/list/sourceProvenanceFactoryContract.test.ts` 全面 update (= 31 tests)
- 累計 68 tests PASS

### 19.9 第 11 補正: UI 責務分離 + cloneImported source link (= sub-phase 3.6 で実装、 GPT 第 11 補正)

GPT 第 11 補正 (= 2026-05-24): 「sub-phase 3.5 採用、 ただし UI に入る前に 2 点明示」

#### 19.9.1 UI 責務分離 (= 第 11 補正 #1、 UI 実装で必須遵守)

「UI では origin と authority を混ぜない」 (= GPT 明示)

**3 axis 独立に扱う** (= sub-phase 3.6 source link 追加で更に明示):

| UI 要素 | 責任 axis | 例 |
|---|---|---|
| **provenance 表示** (= SourceIndicator 等) | **origin** | 色 dot / icon / 状態ラベル (= 「シフト表から」、 「Alter 提案を受け入れ済」) |
| **操作可否 / 編集可否** | **authority** | 時刻/場所 編集不可 (= import_locked)、 編集自由 (= user_owned)、 「受け入れる」 button trigger (= proposed) |
| **状態 chip** | **authority** | 「提案中」 chip (= proposed)、 「ロック中」 chip (= import_locked) |
| **派生関係表示** (= 第 11 補正 #2) | **clonedFrom** | 「シフト表からの複製」 caption (= isClonedFromImported true 時) |

→ UI 実装 (= sub-phase 4+) は **必ず 3 axis 独立に扱う**。 混在禁止。

#### 19.9.2 cloneImported source link (= 第 11 補正 #2、 sub-phase 3.6 で実装済)

「cloneImported は source link を残す」 (= GPT 明示)

**実装** (= commit `90af5d32`):

```typescript
// UserOwnedSource に optional metadata 追加
type UserOwnedSource = {
  origin: 'user';
  authority: 'user_owned';
  clonedFrom?: {
    importedEventId: string;
    importedSource: string;
  };
};

// cloneImported: source link 自動付与
function cloneImported(event: ImportedEvent, newId: string): ClonedUserEvent {
  return {
    ...event,
    id: newId,
    sourceModel: {
      origin: 'user',
      authority: 'user_owned',
      clonedFrom: {
        importedEventId: event.id,
        importedSource: event.sourceModel.importedFrom,
      },
    },
  };
}

// 新 helper 2 件
isClonedFromImported(sourceModel): boolean
getClonedSourceLink(sourceModel): { importedEventId, importedSource } | null
```

UI 側で `getClonedSourceLink` を呼んで「派生元 imported」 を表示可能 (= 詳細 sheet で「シフト表 (event id: xxx) からの複製」 caption)

#### 19.9.3 sub-phase 3.6 検証結果 (= contract checkpoint PASS)

| step | 結果 |
|---|---|
| tests | 75/75 PASS (= sub-phase 3.5 から +7、 source link §9) |
| tsc surface | wave list 関連エラー 0 |
| forbidden wording grep | ZERO HIT |
| privacy/PII grep | ZERO HIT |
| git diff scope | 既存 file refactor (= +172/-6) |

### 19.10 第 12 補正: clonedFrom UI hierarchy 補足 (= sub-phase 4 着手前明示、 GPT 第 12 補正)

GPT 第 12 補正 (= 2026-05-24): 「sub-phase 3.6 PASS、 次の sub-phase 4 へ進行 OK。 但し軽い補足 2 + future scope 1」

#### 19.10.1 補足 3 件 (= UI 実装で必須遵守)

| # | 補足 | 反映 |
|---|---|---|
| 1 | **clonedFrom は provenance ではなく「派生関係 (derivation)」 表示として扱う** | §19.9.1 mapping table の axis 名を明確化 (= provenance = origin、 派生関係 = clonedFrom)、 用語混在禁止 |
| 2 | **main card で origin / authority / clonedFrom を同格に出しすぎず、 clonedFrom は詳細 / 小さい caption に寄せる** | main card (= EventCard) は origin dot + authority chip のみ。 clonedFrom 表示は **詳細 sheet** or **小さい caption** (= sub-phase 8 統合時に詳細 sheet で実装、 sub-phase 4 main card では非表示) |
| 3 | **将来 clonedFrom に最小 snapshot 追加余地は残してよいが、 今は不要** (= future scope) | 本 sub-phase ではなし、 後続で必要なら `clonedFrom.snapshot?: {...}` optional 追加可能 (= type 拡張余地保持) |

#### 19.10.2 main card UI hierarchy 確定 (= 第 11 補正 #1 + 第 12 補正 #2 統合)

EventCard main card (= timeline 上) の表示 axis 階層:

| 階層 | 表示 | axis |
|---|---|---|
| **primary** (= 主役) | title + 時刻 + 場所 + Alter 補助文 | content |
| **secondary** (= 状態 visual) | proposed dashed border + opacity 0.7 + 「受け入れる」 chip | authority |
| **tertiary** (= subtle indicator) | source dot (= 色のみ) + execution chip count | origin (= source) + execution |
| **詳細 sheet のみ** (= 主画面非表示) | clonedFrom caption (= 「シフト表からの複製」)、 imported source 名、 acceptedAt timestamp | derivation + provenance detail + metadata |

→ main card は **primary + secondary + 軽い tertiary のみ**。 詳細 sheet (= sub-phase 8 統合時実装) で **全 axis** 表示。

#### 19.10.3 用語確定 (= 第 12 補正 #1)

| 軸 | UI 名称 | 内部 type |
|---|---|---|
| 由来 | **provenance** (= 「シフト表から」 / 「Alter 提案」 / なし) | origin |
| 所有権 | (= 状態を chip / border で間接表現) | authority |
| 派生関係 | **derivation** (= 「シフト表からの複製」、 詳細 sheet) | clonedFrom |

→ UI 表現で **provenance** と **derivation** を **混在禁止** (= 第 11 補正 #1 + 第 12 補正 #1 整合)。

### 19.4 自律推奨 (= 思考原則 ⑤ ゴールから逆算)

- /plan complete までの最短経路: List impl (= sub-phase 8 phase) → List closeout → Map Spec → Map impl → Map closeout → Design System → N-3b → ...
- 13 拘束条件 + 第 7 補正 2 留意点を Spec で確定したことで、 後続 List impl は **逸脱 risk なく着手可能**
- 「概念 → 拘束条件 → spec → impl」 のサイクルが Spec phase で完成
- frozen branches 影響 0、 既存資産活用 100% (= 規約 24-extended + N-3a foundation)

---

**完了**: Plan List Redesign Spec Audit (= IA 13 拘束条件 + 第 7 補正 2 留意点 + List 詳細 spec)。 実装変更 0、 既存 file 改変 0、 frozen branches 追加 commit 0。 List 実装の完全な出発点確定。 CEO 判断待ち (= §18 の 8 項目)。
