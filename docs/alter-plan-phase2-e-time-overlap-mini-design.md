# Alter Plan Phase 2-E — 時刻重なり気付き Indicator Mini Design

**Status**: docs only (local 起票、未 commit)
**Date**: 2026-05-21
**Branch (予定)**: `feat/alter-plan-phase2-e-time-overlap` (= 実装 branch、起票後 CEO 承認で派生)
**Pre-requisite**: Phase 2-D (cda09ef1) 凍結済
**Author**: Claude × CEO (Aneurasync)

---

## 0. 一行 summary

> Plan の 3 tab すべてに「同じ時間に予定が重なっています」 ことを **subtle に気付ける** indicator を追加する。
> 警告ではなく気付き。解決提案なし。強制なし。色を使わず muted slate のみ。

---

## 1. 背景と問い

### 1.1 Plan の存在意義

Plan のミッションは「動かせない予定」 = anchor の **時間構造** を user に返すこと。Phase 2-A〜D で:

| Phase | 完成成果 |
|-------|---------|
| 2-A | カレンダー (週ビュー + 月送り + 選択日 agenda) |
| 2-B | リスト (今後 7 日 + sticky header + 静的 ALTER 提案 placeholder) |
| 2-C | 地図 (Google Maps integration + baseline pin fallback + 9 カテゴリ集計) |
| 2-D | 場所選択 UX (Places autocomplete + canonical text + 場所未確定 indicator) |

anchor 単体の **入力 / 表示 / 場所** は揃った。次に欠けているのは **anchor 間の関係**。

### 1.2 Phase 2-E が解く問題

> 同じ時間に予定が 2 件以上重なっていても、user は気付けない。

最も基本的な anchor 間関係 = **時刻重なり (overlap)** を、user に **subtle に気付かせる**。

「あれ、月曜 9 時、3 件入ってる」 という self-pattern 認識が、Aneurasync 中心問い「自分って、そういう人間だったのか」 の入口になる。

### 1.3 Phase 2-E が **解かない** 問題 (CEO 明示)

- ❌ 警告 / 危険喚起 / 不安煽り
- ❌ 自動解決 / 移動提案 / 並び替え
- ❌ 通知 / リマインダー
- ❌ rigidity / priority による自動優先度判定
- ❌ multi-day / midnight cross 対応
- ❌ untimed anchor (= endTime null) の overlap 判定

これらは思想違反 (強制感) または scope 外 (Phase 2-F+ / Phase 3 / migration 必要)。

---

## 2. 思想原則 (CEO 補正 1 反映)

### 2.1 用語の統一 (本 docs 全体で厳守)

| 採用する表現 | 避ける表現 (使わない) |
|------------|------------------|
| 時刻重なり | UI 警告 / 警告表示 / warning |
| 気付き | 危険 / 危機 / 注意喚起 |
| indicator / overlap indicator | warning sign / alert / danger badge |
| 「この時刻に他の予定があります」 | 「重複しています、解決してください」 |

「警告」「warning」「alert」「危険」「注意」 という単語は本 docs / 実装 / UI 文言で **使わない**。

### 2.2 三大原則 (Phase 2-D C3 から踏襲、Aneurasync 設計思想)

1. **強制しない** — indicator は subtle、行動 CTA なし、user 自身に判断委ねる
2. **観測の入口** — 「気付き」 のための事実提示のみ、解釈は user
3. **世界観の一貫** — muted slate / subtle dot / text-xs、Phase 2-D C3 と同 trio で統一

### 2.3 色とサイズの厳格制約

| 要素 | 値 | 禁止 |
|------|-----|------|
| 色 | `bg-slate-400`, `text-slate-500`, `ring-slate-500/30` | amber / red / orange / yellow / 警告系 全禁止 |
| dot サイズ | 6-8px | 大きい dot、blinking、 animation 禁止 |
| text サイズ | `text-xs` (12px) または `text-[10px]` | bold / underline / 強調装飾 禁止 |
| アニメ | なし | pulse / shake / blink 禁止 |

### 2.4 「気付き」 vs 「警告」 の境界

| 「気付き」 (Aneurasync 採用) | 「警告」 (採用しない) |
|--------------------------|-------------------|
| 事実だけ提示 | 行動を要求 |
| muted 色 | 強い色 (amber/red) |
| count / 詳細なし | "3 件と重複!" 等の数値強調 |
| static dot + 短文 | 点滅 / 振動 / large badge |
| tap で AnchorDetailModal (既存) | 専用 resolution flow |

---

## 3. 世界トップアプリ調査と差別化

### 3.1 調査対象と所感

| App | overlap 表現 | Aneurasync 適合度 |
|-----|------------|---------------|
| Google Calendar | week view: auto-stacking (50/50 split) / month view: 表示なし | ⚪ stacking 自体は中立だが scope 大 |
| Apple Calendar | week view: auto-stacking + 警告 icon | ✗ 警告 icon NG |
| Fantastical | subtle "+N" badge (gray) | ✅ tone 整合、ただし count NG |
| Notion Calendar (旧 Cron) | auto-stacking + 上端 hint text | ⚪ stacking scope 大 |
| Sunsama | orange "conflict" chip | ✗ orange NG |
| TickTick | red ribbon | ✗ red NG |
| Outlook | red "Time conflict" text | ✗ red NG |
| Things 3 | (タスク管理ゆえ overlap 概念なし) | — |
| Linear / Asana | (タスク管理) | — |

### 3.2 差別化要素 (Aneurasync 独自)

世界トップアプリの大半は「警告 / 解決」 軸。 Aneurasync は **「ただ気付かせる」 軸**:

- ✅ 色を強くしない (muted slate のみ)
- ✅ 数を出さない (「N 件」 count なし)
- ✅ 他 anchor 名を tooltip で開示しない (privacy / noise 回避)
- ✅ 解決 CTA を出さない (user の判断委譲)
- ✅ stacking visual 変更しない (anchor row は agenda 風維持)
- ✅ Phase 2-D C3 場所未確定 indicator と完全同 trio (UI 一貫性)

これは Aneurasync 設計思想「観測の入口」 「強制しない」 「自分自身に気付いてもらう」 を時間軸に表出させたもの。

### 3.3 Aneurasync 内での位置付け

- Phase 2-D C3 (場所未確定 indicator) — 場所軸の subtle 気付き
- **Phase 2-E (時刻重なり indicator) — 時間軸の subtle 気付き** ← 本 docs
- Phase 2-F+ (summary view、未着手) — pattern 集計化、self-pattern 認識
- Phase 3 (ALTER 提案 flow、CEO 禁止解除後) — 気付きを Alter 行動に統合

つまり Phase 2-E は **「個別気付き → pattern 認識 → ALTER 提案」 の階段の最下段**。

---

## 4. Overlap 判定仕様

### 4.1 判定対象

- **両方 timed な anchor のみ** (= `startTime` AND `endTime` 共に有効値)
- **同日内のみ** (= anchorsForDay 展開後の occurrence 集合内)
- **recurring**: anchorsForDay 段階で展開済の occurrence を対象 (exception_dates は除外済)

### 4.2 判定式 (半開区間)

```
overlap(A, B) ⇔ A.start < B.end ∧ B.start < A.end
```

= 半開区間 `[start, end)` の交差。世界標準 (Allen's Interval Algebra の "overlap" / "during" / "starts" / "finishes" / "equals" を一括検出)。

### 4.3 接触 (touching) の扱い

09:00-10:00 と 10:00-11:00 のように **端点が一致する** 場合 → **overlap しない**。

理由:
- 半開区間定義による
- user の意図として「9 時から 10 時の予定」 「10 時から 11 時の予定」 は別物
- 接触まで overlap 扱いすると false positive 増

### 4.4 untimed anchor (endTime null) の扱い (CEO 明示指定への完全回答)

**完全除外**。endTime が無い anchor は overlap 集合に含めず、indicator も出さない。

根拠:
- user が endTime を意図的に省略している可能性 (「歯医者 9 時」 だけ覚えている)
- default 60 分等の機械推論は強制感 (Aneurasync 思想違反)
- 「duration が無い anchor は時間幅を持たない」 と扱うのが最も透明

既知の trade-off:
- 「09:00 開始 (endTime null) と 09:30-10:30 (両 timed)」 で表示位置は重なるが indicator 出ない
- これは現時点で許容、将来 untimed の point-in-time overlap を別 indicator で表現可能 (Phase 2-E+ 預け、§14)

### 4.5 rigidity / priority による優先度

**判定しない**。

- すべての anchor は overlap 判定で対等
- 「hard vs soft どっち優先」 「fixed vs flexible どっち主」 は user の判断、UI 側でランクづけしない
- indicator は両 anchor に等しく付与する

### 4.6 multi-day / midnight cross

**Phase 2-E では未対応** (CEO 明示)。

具体:
- 23:00-25:00 のように 24h を跨ぐ表現は **同日内 anchorsForDay レベルで存在しない前提**
- もし入力データに `startTime > endTime` (= 同 row で日跨ぎ表現) が混入 → §4.7 defensive skip
- 真の multi-day overlap (= 別日 anchor との重なり) は ExternalAnchor schema 拡張 (migration) 必要 → 別 Phase

### 4.7 Defensive skip

helper 内で **以下の anchor は overlap 集合から完全除外** (= indicator 出さない):

| 条件 | skip 理由 |
|------|----------|
| startTime / endTime のいずれかが null / undefined / 空文字 | untimed (§4.4) |
| toMinutes 変換失敗 (型不正、形式不正) | malformed data (§7.2) |
| start >= end (= zero-duration / inverted) | 時間幅なし / data 矛盾 |
| start / end が時刻範囲外 (e.g. 25:00) | malformed data |

defensive skip により、不正データでも helper は throw せず空集合 or 部分集合を返す。

---

## 5. UI 表示仕様 (3 tab)

### 5.1 共通デザイン token (Phase 2-D C3 から踏襲、3 tab 一貫)

| 要素 | 値 |
|------|-----|
| dot 色 | `bg-slate-400` |
| dot ring | `ring-1 ring-slate-500/30` |
| dot サイズ | 6-8 px (h-2 w-2 = 8px が WCAG 1.4.11 配慮で安全) |
| text 色 | `text-slate-500` |
| font size (短文) | `text-[10px]` |
| font size (長文) | `text-xs` (12px) |
| 短文 | 「重なり」 |
| 長文 | 「この時刻に他の予定があります」 |
| aria-label | 「この時刻に他の予定があります」 (短/長関係なく screen reader 用は long) |

### 5.2 既存 Phase 2-D C3 indicator との共存ルール (CEO 補正 5 反映)

意味と位置を **完全分離**:

| Indicator | 配置軸 | 表現 |
|-----------|------|------|
| 場所未確定 (Phase 2-D C3) | **location 行** (📍 の行) | dot + 「場所未確定」 |
| **時刻重なり (Phase 2-E)** | **time 行** (時刻 chip の行) | dot + 「重なり」 |

→ 同 anchor が両方該当しても、視覚的に **混ざらない**。time と location で意味の軸が分かれる。

警告色を一切使わないため、両方並んでも「強い印象」 にならず subtle。

### 5.3 CalendarTab — anchor chip 内 inline

#### 5.3.1 表示位置

時刻 chip 行 (= `09:00` + `固定` Badge と同 row) に、subtle dot + 短文。場所未確定 dot は location 行に既存配置 → 軸が分離。

```
┌──────────────────────────────────┐
│ [09:00]  [固定]  ● 重なり        │  ← 時刻 row (Phase 2-E 新規)
│ タイトル                          │
│ 📍 場所名  ●                     │  ← 場所 row (Phase 2-D C3 既存)
└──────────────────────────────────┘
```

#### 5.3.2 実装方針

- `selectedDayAnchors` を `detectTimedAnchorOverlaps` で **useMemo (1 回計算)**
- 各 anchor row で `overlapSet.has(anchor.id)` 判定
- 表示時は dot (8px slate-400 + ring) + text-[10px] 「重なり」 を inline-flex

#### 5.3.3 a11y

- `aria-label="この時刻に他の予定があります"`
- `role="img"` (= 意味的な指示子)
- focus / hover は anchor row 全体で既存、indicator 自体は tap target ではない

### 5.4 FlowTab — anchor row 内 inline

#### 5.4.1 表示位置

時刻表示 chip + 「固定」 Badge と同 row の末尾に、subtle dot + 短文。場所未確定 indicator は location 行に既存配置。

```
┌──────────────────────────────────┐
│ 09:00 – 10:00  [固定]  ● 重なり │  ← time row
│ タイトル                          │
│ 📍 場所名  ● 場所未確定          │  ← location row
└──────────────────────────────────┘
```

#### 5.4.2 実装方針

- `dayAnchorsMap` の各 day で `detectTimedAnchorOverlaps` を **useMemo (1 day 毎)**
- AnchorRow に `hasOverlap: boolean` prop を追加
- 表示は dot + 「重なり」 inline-flex

### 5.5 MapTab SelectedAnchorCard — footer banner

#### 5.5.1 表示位置

既存の「場所未確定 banner」 / 「baselineSourceLabel」 の下に、subtle 1 行 banner。

```
┌──────────────────────────────────┐
│ 09:00 – 10:00                    │
│ タイトル                          │
│ 📍 場所名                        │
│ 場所未確定 — もっと具体的に…      │  ← Phase 2-D C3 既存
│ この時刻に他の予定があります      │  ← Phase 2-E 新規
└──────────────────────────────────┘
```

#### 5.5.2 実装方針 (CEO 補正 3 反映、第一候補)

**第一候補**: MapTab 側で日付ごとの overlapSet を pre-compute、SelectedAnchorCard に **`hasOverlap` prop で渡す**。

理由:
- 3 tab 単一 helper 使用方針と整合
- SelectedAnchorCard private function が肥大化しにくい
- 将来 summary view 拡張時、MapTab レベルの overlapSet を再利用可能

許容案:
- prop 渡しが既存構造で過剰になる場合 (例: SelectedAnchorCard が複数 day を扱う設計に変わった等)、SelectedAnchorCard 内で helper を呼んでも良い
- ただし **独自判定は禁止**、必ず `detectTimedAnchorOverlaps` のみ使用

第一候補の擬似実装:

```ts
// MapTab 内
const overlapsForSelectedDate = useMemo(() => {
  if (!selectedAnchor) return new Set<string>();
  const day = anchorsForDay(state.anchors, selectedAnchorDate);
  return detectTimedAnchorOverlaps(day);
}, [state.anchors, selectedAnchorDate, selectedAnchor]);

const selectedHasOverlap = selectedAnchor
  ? overlapsForSelectedDate.has(selectedAnchor.id)
  : false;

return (
  <SelectedAnchorCard
    anchor={selectedAnchor}
    pinKind={...}
    baselineCoords={...}
    hasOverlap={selectedHasOverlap}  // ← Phase 2-E 新 prop
    onOpenDetail={...}
  />
);
```

SelectedAnchorCard 内:

```tsx
{hasOverlap && !isSensitive && (
  <p
    data-testid="plan-map-selected-overlap-banner"
    className="text-xs text-slate-500 mt-1 italic"
  >
    この時刻に他の予定があります
  </p>
)}
```

#### 5.5.3 sensitive anchor 配慮

sensitive anchor が overlap している場合:
- 表示は「この時刻に他の予定があります」 のみ
- 他 anchor の title / 場所 / 詳細を一切開示しない (= count / list なし)
- → 既存 sensitive privacy 仕様維持

### 5.6 既存挙動への影響 (なし)

- AddAnchorModal / EditAnchorModal の保存挙動 → **完全不変**
- AnchorDetailModal → 不変 (overlap indicator は出さない、tab レベルのみ)
- onAnchorClick / onAddRequest 等 callback → 不変
- recurring 展開ロジック (`anchorsForDay`) → 不変、活用のみ

---

## 6. Helper API 設計

### 6.1 File: `lib/plan/anchorOverlap.ts` (新規)

```ts
import type { ExternalAnchor } from "@/lib/plan/external-anchor";

/**
 * 同日内 timed anchor の重なり検出 (Pure helper)
 *
 * 仕様 (Phase 2-E mini design §4 厳守):
 *   - startTime + endTime 両方ある anchor のみ対象 (= "timed anchor")
 *   - 半開区間 [start, end) で交差判定 (= touching は overlap しない)
 *   - rigidity / priority による優先度なし、全 anchor 対等
 *   - 同 anchor 自身とは比較しない
 *   - malformed / start >= end の anchor は defensive skip
 *
 * Cross-tab 単一仕様 (Phase 2-D C3 ルール踏襲):
 *   CalendarTab / FlowTab / MapTab すべて本 helper のみ使用、独自判定禁止。
 *
 * Complexity: O(n²) pairwise。anchor 数 typical < 50 で問題なし。
 *   Future optimize: sweepline で O(n log n) 化可能 (§14)。
 *
 * @param anchorsForDay 1 日分の anchor (recurring 展開済 / exception_dates 除外済)
 * @returns 他 anchor と時刻が重なる anchor id の Set。空集合あり得る。
 */
export function detectTimedAnchorOverlaps(
  anchorsForDay: ReadonlyArray<ExternalAnchor>,
): Set<string>;

/**
 * Single anchor の overlap 判定 convenience。
 * 個別呼び出し場面 (e.g. SelectedAnchorCard で 1 anchor のみ判定) で利用可。
 *
 * 大量呼び出しでは detectTimedAnchorOverlaps + Set.has が効率的。
 */
export function isAnchorOverlapping(
  anchor: ExternalAnchor,
  overlappingIds: ReadonlySet<string>,
): boolean;
```

### 6.2 内部 helper (export しない)

```ts
/**
 * 時刻文字列を minutes (0-1439) に変換。
 *
 * 想定: "HH:MM" 形式 (実装時に ExternalAnchor 型 / formatTime 周辺で確認、CEO 補正 2)。
 * Defensive:
 *   - null / undefined / 空文字 → null
 *   - 形式不正 ("abc" / "9-00" / "25:00") → null
 *   - 範囲外 (h>23, m>59) → null
 *
 * → null を返す anchor は呼び出し側で skip される設計。
 */
function toMinutes(time: string | null | undefined): number | null;
```

### 6.3 Pure 性 / Side effect

- helper は完全 pure (no React hook, no fetch, no DOM)
- 入力 ExternalAnchor[] を **mutate しない** (test で snapshot 検証)
- 出力 Set は呼び出し側で `.has()` 読み取り専用前提 (= ReadonlySet として扱う)
- deterministic (同入力 → 同出力)

---

## 7. データ型と defensive 戦略 (CEO 補正 2 反映)

### 7.1 startTime / endTime の現時点想定

- ExternalAnchor の `startTime` / `endTime` は **"HH:MM" 形式の文字列** と想定 (= Phase 2-A 等の `formatTime` 観察より推定)
- ただし **本 docs では断定しない**。実装時に以下を確認:
  - `lib/plan/external-anchor.ts` の type 定義
  - `formatTime` (in `tabs/_helpers.ts`) の処理
  - 実 DB から取得した anchor サンプルの形式
- helper 内では **文字列比較に頼らず必ず minutes 化** (toMinutes) して数値比較

### 7.2 toMinutes の defensive 仕様

```
入力                  → 出力
---------------------------------
null / undefined      → null
""                    → null
"  "                  → null (trim 後空)
"09:00"               → 540
"23:59"               → 1439
"00:00"               → 0
"24:00"               → null (時刻範囲外)
"25:30"               → null
"9:00" (1 桁 h)       → null (期待: 2 桁 ゼロ埋め)
"09:0" (1 桁 m)       → null
"abc"                 → null
"9-00"                → null (separator 不正)
```

実装時に「1 桁 h を tolerant にすべきか」 は ExternalAnchor 実データを見て判断。デフォルトは strict 2 桁前提 (formatTime と整合)。

### 7.3 malformed data に対する helper の振る舞い

- `toMinutes(start) === null` または `toMinutes(end) === null` の anchor → overlap 集合から **除外**
- `start >= end` の anchor → overlap 集合から **除外**
- helper は throw しない (= empty set or 部分集合を返す)
- log にも出さない (silent defensive、UI 側で warning 出さないため)

### 7.4 ExternalAnchor schema 不変 (重要)

本 Phase 2-E では:
- ExternalAnchor 型に新フィールド追加なし
- migration なし
- 既存 anchor data の解釈変更なし
- 既存 recurring 展開 / exception_dates ロジック不変

→ helper は既存 data 構造から **読み取り専用** で overlap を導出するだけ。

---

## 8. Edge case 完全枚挙

| # | ケース | 期待 | 根拠 |
|---|--------|------|------|
| 1 | 完全別時刻 (09:00-10:00 / 11:00-12:00) | overlap なし | 半開区間で交差なし |
| 2 | 完全重複 (09:00-10:00 / 09:00-10:00) | 両 overlap | 一致 |
| 3 | **接触 (09:00-10:00 / 10:00-11:00)** | **overlap なし** | 半開区間定義 |
| 4 | 完全包含 (09:00-12:00 / 10:00-11:00) | 両 overlap | 包含も交差 |
| 5 | 部分重複 (09:00-10:30 / 10:00-11:00) | 両 overlap | 0.5h 重なる |
| 6 | zero-duration (09:00-09:00) と他 | 他とは overlap せず | start >= end skip (§4.7) |
| 7 | inverted (10:00-09:00、data 矛盾) | overlap なし | start >= end skip (§4.7) |
| 8 | **endTime null** | overlap なし | 仕様で除外 (§4.4) |
| 9 | startTime null | overlap なし | 仕様で除外 |
| 10 | 両 null | overlap なし | 仕様で除外 |
| 11 | 3 件以上同時 (09-10 / 09:30-10:30 / 09:45-10:15) | 全 3 件 overlap | pairwise 全検出 |
| 12 | anchor 1 件のみ (= 比較相手なし) | overlap なし | i ≠ j skip |
| 13 | empty array | empty Set | 自明 |
| 14 | malformed HH:MM ("abc" / "9-00") | overlap なし | toMinutes null fallback (§7.2) |
| 15 | 範囲外 (25:00 / 24:00) | overlap なし | toMinutes null fallback (§7.2) |
| 16 | 異日 anchor 混入 (helper に渡してはいけないが念のため) | helper は日付 check しない、呼び出し側責任 | 同日前提 |
| 17 | sensitive anchor 同士 overlap | overlap 検出 | sensitivity と overlap 独立、UI 側で title 開示しないので privacy 維持 |
| 18 | recurring + 通常 anchor 同日 overlap | 両 overlap | anchorsForDay 展開段階で同列扱い |
| 19 | recurring の exception 日に他 anchor 単独 | overlap なし (recurring は除外済) | anchorsForDay 段階で exception 除外 |
| 20 | midnight cross (23:00-01:00) | overlap なし (= 同 row では §4.7 skip) | start > end は inverted 扱い |

### 8.1 pure 性 / mutation 不変

| # | 検証 | 方法 |
|---|------|------|
| 21 | deterministic | 同入力で 2 回呼び、Set 内容一致 |
| 22 | 入力 mutate なし | JSON.stringify(input) 前後で snapshot 比較 |
| 23 | 出力 mutate なし | 戻り値 Set を変更しても次回呼び出し独立 |

### 8.2 test ファイルでの cover

`tests/unit/plan/anchorOverlap.test.ts` に 20+ ケースを describe ごとに整理:

```
describe("detectTimedAnchorOverlaps", () => {
  describe("基本判定", () => { /* #1-#5 */ });
  describe("defensive skip", () => { /* #6-#10, #14-#15 */ });
  describe("3 件以上 / boundary", () => { /* #11-#13 */ });
  describe("recurring / sensitive", () => { /* #16-#19 */ });
  describe("midnight cross / multi-day", () => { /* #20 */ });
  describe("pure 性 / immutability", () => { /* #21-#23 */ });
});
describe("isAnchorOverlapping", () => {
  /* Set.has wrap の動作確認 */
});
```

---

## 9. ファイル変更マップ

```
新規 (3):
  lib/plan/anchorOverlap.ts                                 ~90 行 (helper + toMinutes + isAnchorOverlapping)
  tests/unit/plan/anchorOverlap.test.ts                     ~200 行 (20+ edge case + pure)
  docs/alter-plan-phase2-e-time-overlap-mini-design.md      ~600 行 (本 docs)

変更 (3):
  app/(culcept)/plan/tabs/CalendarTab.tsx                   indicator 追加 (時刻 row、useMemo + dot + text-[10px])
  app/(culcept)/plan/tabs/FlowTab.tsx                       indicator 追加 (時刻 row、AnchorRow に hasOverlap prop)
  app/(culcept)/plan/tabs/MapTab.tsx                        MapTab で overlapSet pre-compute、SelectedAnchorCard に hasOverlap prop

合計: 6 ファイル
```

### 9.1 触らないファイル (CEO 制約遵守)

- `MorningMapView.tsx` (Home view、別 component)
- `AddAnchorModal.tsx` / `EditAnchorModal.tsx` / `AnchorDetailModal.tsx`
- `AnchorFormFields.tsx` / `PlaceCandidatesPanel.tsx` / `_useBiasContext.ts`
- `lib/shared/canonicalLocationText.ts` / `lib/plan/locationConfirmationStatus.ts` (= Phase 2-D 凍結)
- `lib/plan/external-anchor.ts` (= schema 不変)
- `lib/plan/anchorOverlap.ts` の helper 以外 (= 必要なら _helpers.ts 等も読むが変更しない)
- CoAlter / talk / Mirror / W1-6 / DraftPlan 全範囲

### 9.2 env / migration / dependency

- `.env.local` / `.env*` → **不触**
- `supabase/migrations/` → **不触**
- `package.json` / `package-lock.json` → **不触**
- 新 npm package → **追加しない**

---

## 10. やること / やらないこと (まとめ)

### 10.1 やること (Phase 2-E)

| 領域 | やること |
|------|---------|
| Helper | `detectTimedAnchorOverlaps` + `isAnchorOverlapping` + `toMinutes` (内部) |
| Test | 20+ edge case unit test |
| CalendarTab | 時刻 row に dot + 「重なり」 inline |
| FlowTab | 時刻 row に dot + 「重なり」 inline |
| MapTab SelectedAnchorCard | footer に「この時刻に他の予定があります」 banner |
| Docs | 本 mini design (§1-§15) + smoke checklist |

### 10.2 やらないこと

| 禁止項目 | 理由 |
|---------|------|
| 自動解決 / 移動提案 | 強制感、Phase 3 領域 |
| 並び替え (auto-stack visual) | scope 大、anchor row 設計変更 |
| 通知 / リマインダー | env / dep 必要 |
| count 表示 (「N 件重なり」) | 数で煽る、思想違反 |
| 他 anchor 名 tooltip / list | privacy / noise |
| amber / red / orange / yellow | CEO 明示禁止 |
| rigidity 優先度 visual | 強制感、user 判断尊重 |
| midnight cross / multi-day | scope 外 |
| endTime null の duration 推定 | 強制感 |
| timeline / week view visual | scope 大 |
| confirm / dismiss button | 操作要求 = 強制 |
| pulse / blink / shake animation | 警告風、思想違反 |
| underline / bold 強調 | 警告風 |
| AnchorDetailModal 内表示 | scope 外、tab level のみ |

---

## 11. 実装順序

実装着手は **CEO 承認後**。本 docs commit 後、CEO の GO 判断で別 commit として実装。

### 11.1 着手順序

1. `lib/plan/anchorOverlap.ts` 作成 (helper + types + toMinutes)
2. `tests/unit/plan/anchorOverlap.test.ts` 作成 (20+ edge case)
3. helper 単体テスト PASS 確認
4. CalendarTab に indicator 追加
5. FlowTab に indicator 追加 (AnchorRow に hasOverlap prop)
6. MapTab に overlapSet pre-compute + SelectedAnchorCard に hasOverlap prop
7. 全 unit test 再実行 PASS
8. `npm run lint` PASS
9. `npx tsc --noEmit` で C3 ファイル群 0 error 確認 (pre-existing errors は無関係)
10. `npm run build` PASS
11. CEO smoke 待ち (dev server inline env で起動済)
12. PASS → commit 待ち

### 11.2 各 step での前提確認

| Step | 前提確認 |
|------|---------|
| 1 | ExternalAnchor 型 (`lib/plan/external-anchor.ts`) と `formatTime` の実装を確認、startTime / endTime の実形式を観察 |
| 4 | CalendarTab 内 anchor row の現状 layout 観察、time row への inline 追加位置決定 |
| 5 | FlowTab AnchorRow の現状 props / className 観察 |
| 6 | MapTab SelectedAnchorCard と MapTab 親の data flow 観察、prop 渡しが現実的か確認 |

---

## 12. Smoke checklist (CEO 補正 5 反映)

### 12.1 判定単一仕様 (Cross-tab、Phase 2-D C3 ルール踏襲)

- [ ] `grep "detectTimedAnchorOverlaps" app/(culcept)/plan/tabs/*.tsx` で 3 tab すべて hit
- [ ] 3 tab すべてが helper のみ使用、独自判定なし (= Cross-tab 単一仕様)

### 12.2 Overlap 検出 (基本)

- [ ] 完全別時刻 → indicator 出ない (3 tab)
- [ ] 完全重複 → 両 indicator 出る (3 tab)
- [ ] 接触 (touching) → indicator 出ない (3 tab、半開区間検証)
- [ ] 部分重複 → 両 indicator 出る (3 tab)
- [ ] 3 件以上同時 → 全 indicator 出る (3 tab)

### 12.3 untimed anchor 除外

- [ ] startTime のみ (endTime null) の anchor は indicator 出ない (= false positive 防止)
- [ ] 「歯医者 9:00」 (endTime null) が他 anchor と並んでも indicator 出ない

### 12.4 recurring 展開

- [ ] recurring anchor の occurrence が同日 timed anchor と overlap → indicator 出る
- [ ] exception_dates の日は展開されず、その日に他 anchor あっても影響なし

### 12.5 sensitive 配慮

- [ ] sensitive anchor が overlap → indicator 出る (count なし、他 anchor 名なし)
- [ ] sensitive anchor の title は依然 masked (Phase 2-C 既存挙動維持)

### 12.6 UI 思想整合 (= 「気付き」 vs 「警告」 境界)

- [ ] amber / red / orange / yellow 一切なし
- [ ] muted slate (slate-400 / slate-500) のみ
- [ ] text-xs / text-[10px] 範囲、bold / underline / 強調なし
- [ ] アニメーション (pulse / blink / shake) なし
- [ ] 文言は「重なり」 / 「この時刻に他の予定があります」 のみ
- [ ] CTA / 行動ボタン (移動 / 解決 / dismiss) なし
- [ ] count (「N 件」) なし
- [ ] 他 anchor 名 / location tooltip なし

### 12.7 Phase 2-D C3 場所未確定 indicator との共存 (CEO 補正 5 新規)

- [ ] 同 anchor が **場所未確定 + 時刻重なり** の両方を持つ場合、表示位置が混ざらない
  - CalendarTab: 時刻重なり = 時刻 row / 場所未確定 = location 行 (📍 の行)
  - FlowTab: 同上、別行で並列
  - MapTab SelectedAnchorCard: 「場所未確定 — もっと具体的に…」 banner + 「この時刻に他の予定があります」 banner が **縦に並ぶ、色が同 tone**
- [ ] 両 indicator 同時表示でも、視覚的に **強い警告感** にならない (muted slate のみ)
- [ ] amber / red を絶対使わない (補正 5 明示)
- [ ] CalendarTab: 時刻 row indicator と location 行 indicator が **意味的に独立して読める**
- [ ] FlowTab: 「場所未確定」 と 「重なり」 が **同じ text style、別 row**
- [ ] MapTab: 2 banner が並ぶ時の縦余白が窮屈にならない (= mt-1 同程度)

### 12.8 既存挙動不変

- [ ] AddAnchorModal / EditAnchorModal / AnchorDetailModal の保存挙動完全不変
- [ ] MorningMapView 完全不触
- [ ] Phase 2-D Place picker (PlaceCandidatesPanel) 動作完全不変
- [ ] recurring 展開 / exception_dates 処理不変
- [ ] sensitive anchor の masking ルール維持

### 12.9 性能 / Cross-tab 一貫性

- [ ] CalendarTab: 1 selectedDay 内で `detectTimedAnchorOverlaps` を `useMemo` で 1 回計算
- [ ] FlowTab: 各 day section ごとに `useMemo` (= 1 day 毎 1 回)
- [ ] MapTab: selectedAnchorDate に応じて `useMemo` で再計算 (毎 render しない)
- [ ] 同 anchor が 3 tab で同じ overlap 判定 (= Cross-tab 一貫)

---

## 13. Beyond / 不採用案 (透明性)

| 案 | 却下理由 |
|----|---------|
| amber / red warning color | CEO 明示禁止、思想違反 |
| 「N 件重なってます」 count 表示 | 数で煽る、思想違反 |
| 他 anchor 名 tooltip / list | privacy / noise |
| 自動 stack visual (Google Cal week view 型) | scope 大、Aneurasync は agenda 風維持 |
| conflict resolution button | 強制 / Phase 3 領域 |
| notification on overlap creation | env / dep 必要 |
| endTime null を 60 分 default で扱う | 機械推論で false positive、思想違反 |
| rigidity 優先度で「主・副」 visual | 強制感、user 判断尊重 |
| Phase 2-F summary view 内 「衝突回数」 pattern 表示 | Phase 2-E では未着手、Phase 2-F 候補 D で別途検討 |
| AnchorDetailModal 内 overlap 詳細表示 | scope 外、tab level のみで気付き提供で十分 |
| 中点 (`·`) で 「09:00 · 重なり」 inline 装飾 | canonical separator (` · `) と意味混乱 |
| left-border 縦線 indicator | Phase 2-A rigidity visual と被る |
| 触感 feedback (haptic) | mobile native API 必要、scope 外 |
| audio feedback | 思想違反 (強い警告風) |
| pulse / blink / shake animation | 警告風 |
| 「重複!」 「! 重なり」 等 exclamation 装飾 | 強い感情想起、思想違反 |

---

## 14. 将来拡張ポイント (Phase 2-E+ 預け)

### 14.1 untimed anchor の point-in-time overlap (Phase 2-E+ 候補)

現 Phase 2-E では untimed anchor は overlap 判定対象外。将来:
- 「09:00 開始 (endTime null)」 と 「09:00-10:00」 を **point-in-time touching** として別 indicator 化
- 別 dot 色 / 別文言 (e.g. 「同時刻開始」) で表現
- ExternalAnchor schema 変更なしで helper 拡張可能

### 14.2 sweepline 化 (Phase 2-E+ 候補、性能最適化)

現 O(n²) → sweepline で O(n log n) 化:
- start 時刻順 sort
- active set を BST で管理
- 大量 anchor (n > 100) で意味、現状は不要

### 14.3 Phase 2-F (Plan summary view) との統合

- 週次 / 月次の overlap 回数集計
- 「あなたは月曜 9 時に重ねがち」 self-pattern 認識
- ALTER 提案 flow (Phase 3) で 「重なりやすい時間を避けて提案」 inputs に

### 14.4 multi-day / midnight cross (Phase 2-E+ 候補)

- ExternalAnchor schema 拡張で `endDate` 追加 (migration 必要、CEO 承認案件)
- helper 拡張で日跨ぎ判定

### 14.5 「重なってる anchor 同士の関係視覚化」 (Phase 2-F+ 候補)

- 例: 「いつも金曜 10 時の MTG と歯医者が重なる」 pattern を summary 化
- 既存 anchor pair の重複頻度を集計、subtle 提示

---

## 15. 変更履歴

### 2026-05-21 v1 (本起票)

- Phase 2-D (cda09ef1) 凍結後、Phase 2-E 候補 A 「時刻重なり気付き indicator」 を CEO 採択
- CEO 補正 5 点反映:
  - 補正 1: 「警告」 → 「気付き」 用語統一
  - 補正 2: startTime/endTime 型は実装時確認前提、helper 内 minutes 化、defensive skip
  - 補正 3: MapTab overlap 判定は MapTab 側で pre-compute、SelectedAnchorCard に prop 渡し第一候補
  - 補正 4: docs only commit、push / PR / remote 操作なし、local docs commit 前提
  - 補正 5: smoke checklist に「Phase 2-D C3 場所未確定 indicator との共存」 追加
- 自立推論 (Beyond):
  - 世界トップ calendar app 8 種の overlap 表現を調査、Aneurasync 独自化方針確立
  - edge case を 20+ 枚挙、3 区分 (基本 / defensive / boundary) で test 化
  - Phase 2-F / Phase 3 との関係を「気付き → pattern → 提案」 階段として明示
  - 既存 Phase 2-D C3 indicator との位置 / 色 / 文言の完全分離を仕様化

---

**End of Phase 2-E Mini Design v1**. CEO 採択判断 → 実装 GO/NO-GO 判断をお待ちします。

Aneurasync 設計思想 「自分って、そういう人間だったのか」 への寄与:
時刻重なりは個別気付きで完結せず、Phase 2-F summary / Phase 3 ALTER 提案へ繋がる pattern 認識の **最下段**。
世界トップ calendar app の「警告 / 解決」 軸に対し、Aneurasync は 「ただ気付かせる」 軸で差別化。
強制せず、不安を煽らず、user 自身の判断を尊重する indicator として実装する。
