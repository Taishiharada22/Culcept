# Alter Plan Phase 2-A — CalendarTab Compact Week Strip 化 Mini Design

**作成日**: 2026-05-20 (initial) / 2026-05-20 (GPT 補正 4 点 + Beyond 強化反映)
**Status**: 採択待ち (CEO 承認後、実装 wave に進む)
**branch**: `docs/alter-plan-phase2-a-calendar-month-view-mini-design`
**実装範囲**: 本 PR は **docs only**。実装は CEO 承認後の別 PR (1 PR / 3 commits)

**前提**:
  - Phase 1 完全 PASS (PR #219 + #221 + W1-Z apply、2026-05-20)
  - `/plan` 直 URL と Home pane の両方で `<CalendarTab>` は同一 instance を使用 (PlanClient displayMode 経由)

**関連**:
  - `docs/alter-plan-home-swipe-full-plan-pane-phase1-complete.md`
  - `docs/alter-plan-w15-ui-mini-design.md` §2 (CalendarTab 初版設計)
  - `docs/alter-plan-w1x3-cell-add-mini-design.md` (現在の cell `+` add 導線)
  - `app/(culcept)/plan/tabs/CalendarTab.tsx` (本命修正対象)
  - `app/(culcept)/plan/tabs/_helpers.ts` (helper、本 PR で拡張)

---

## 0. 設計訂正 (GPT 補正 2026-05-20、CEO 経由)

初版で **Full month grid (6×7)** を本命採用としたが、CEO 完成 mock と世界トップアプリ pattern を精査した結果、**Compact week strip + 選択日 agenda** を Phase 2-A 本命に訂正:

| 候補 | 構造 | Phase 2-A 採用 |
|------|------|----------------|
| **A. Compact week strip + selected day agenda** | 月名 header + 1 週ストリップ + 選択日 anchor list | **✅ 本命 (mock 直訳、Apple/Linear/Cron 系)** |
| B. Full month grid (6×7) | 月名 + Weekday labels + 月 grid + 選択日 anchor | Phase 2-A+ or オプション |
| C. Hybrid (strip + tap で grid expand) | 月名 tap で grid sheet expand | Phase 2-A++ で検討 |

### 訂正理由

1. **mock 直訳**: "20 21 22 [23] 24 25 26" の 1 行表示 = **当週の strip** であって 6×7 grid ではない
2. **世界トップアプリ pattern**:
   - **Linear Calendar / Cron (Notion Calendar)**: 上部 week strip + 下部 agenda、mock と一致
   - **Apple Calendar (List mode)**: week strip + agenda
   - **Fantastical**: week + agenda mode あり
   - Full month grid は (Google Calendar / iOS Month mode) 情報密度高だが mobile pane では overload
3. **Aneurasync philosophy**: "押し付けない・軽い体験"、予定リスト中心の見せ方、6×7 grid は viewport の 30-40% 占有 → 軽さ重視で strip 採用
4. **Phase 1 整合**: Home pane は viewport height 制約あり (`h-[100dvh]` + indicator + composer 等)、strip の方が anchor list 領域広く取れる

---

## 1. ゴール (CEO mock 由来、訂正反映)

### CEO スクショから抽出した完成形

```
[4月 2026] >                        ← 月 header + 月送り arrow (tap)
日 月 火 水 木 金 土                ← 曜日 label (7 col、固定行)
20 21 22 [23] 24 25 26              ← 当週 strip、選択日 (23) = 紫円

[選択日の予定一覧 — 主役領域]
9:30   カフェで仕事
       スターバックス 代官山店
12:30  イタリアンでランチ
15:00  打ち合わせ
       ALTER オフィス
19:00  ジム
       エニタイムフィットネス 恵比寿

                                      [+]
                                  (右下 FAB、紫 gradient)
```

### Phase 2-A 範囲

- **Compact week strip** (1 行 × 7 列) + 月 header + 月送り tap
- **選択日 (selectedDate) state** + 当該日 anchor agenda
- **FAB** (右下、紫 gradient、選択日 prefill で AddAnchorModal)
- date pre-fill 導線維持 (W1-X3 cell `+` は削除、SelectedDay link + FAB で代替)
- /plan 直 URL と Home pane の両方で同一動作

### Phase 2-A で**やらないこと** (CEO 制約遵守)

- ❌ Full month grid (6×7) — Phase 2-A+ or 別 wave
- ❌ FlowTab / MapTab の改修 (Phase 2-B / 2-C)
- ❌ 空き日 → ALTER 提案 flow (Phase 3)
- ❌ Google Maps integration
- ❌ リスト image thumbnail 化
- ❌ CoAlter / Mirror / /talk / D-* / W1-6 / DraftPlan / production env / migration / service_role
- ❌ W1-Z+ cleanup (24-48h 観測後、別 wave)
- ❌ fallback path 削除

---

## 2. 現在の CalendarTab 構造 (read-only audit)

### 2.1 ファイル構造

| layer | path | 役割 |
|-------|------|------|
| component | `app/(culcept)/plan/tabs/CalendarTab.tsx` (180 行) | week view (7 days、月-日) + 各日 anchor list + cell `+` add |
| helper | `app/(culcept)/plan/tabs/_helpers.ts` (270+ 行) | date utility / `getWeekDays` / `anchorsForDay` / `WEEKDAY_LABELS` 等 |
| parent | `app/(culcept)/plan/PlanClient.tsx` | data fetch / activeTab state / Modal 制御 / `onAddRequest` / `onAnchorClick` callback |

### 2.2 現状の表示 logic

```typescript
const days = getWeekDays(baseNow);          // 7 days (月-日) ← strip としてそのまま利用可能
const today = isoDate(utcMidnight(baseNow));

// 各 day cell = GlassCard (header: 曜日 + 日番号 + +button) + anchor list
// → 本 wave で「各 cell 内 anchor list」を **削除**、選択日の anchor を grid 下に集約
```

### 2.3 重要 helper (`_helpers.ts`)

| function | 役割 | 本 wave 取扱 |
|----------|------|--------------|
| `getWeekDays(now)` | 当週の月〜日 (7 日) 配列 | **再利用** (selected date 含む週を返すように signature 拡張可能) |
| `anchorsForDay(anchors, day)` | recurring 展開 + exception_dates 適用 | **再利用、変更なし** |
| `WEEKDAY_LABELS` | ["日", "月", "火", ...] | 再利用 |
| `formatTime` / `formatJpDate` | 表示整形 | 再利用 |

---

## 3. CEO mock との差分

| 項目 | 現状 (week view) | CEO mock (compact strip) | 差分 |
|------|------------------|----------------------------|------|
| 表示日数 | 7 (当週固定) | **7 (週ストリップ)** | 構造は近いが意味が違う (cell ≠ 詳細表示) |
| 月名 header | (なし) | "4月 2026" + ">" navigation | **新規** |
| 月 navigation | (なし) | ◀ ▶ tap | **新規** |
| 選択日 state | (なし、各日 cell 内 anchor list 直接表示) | selected day → 紫円 + agenda 下段 | **state 追加 + visual treatment** |
| 各 cell 内 anchor 表示 | anchor 詳細リスト (時刻 + title + sub) | **数字のみ** | cell 内 anchor list 削除 |
| Today indicator | `ring-2 ring-indigo-400` (枠囲い) | 紫円 (selected と同形) or subtle | **visual treatment 再設計** |
| Cell `+` button (W1-X3) | 各 cell に小さい `+` | mock に未表示 (FAB のみ) | **cell `+` 削除** |
| FAB (右下) | (なし) | **紫 gradient 56px circle、選択日 prefill** | **新規追加** |
| Selected day agenda | (なし) | grid 下に anchor list | **新規 section** |
| 曜日 label 行 | (各 cell header に分散) | grid 上部の独立行 | **独立行に変更** |

---

## 4. 月ビュー (Compact Week Strip) 化の最小安全設計

### 4.1 アーキテクチャ概要

```
<CalendarTab>
  ├ [state] currentMonth: Date (default: 今月)
  ├ [state] selectedDate: string (ISO、default: 今日)
  │
  ├ <MonthHeader>                            ← 新規
  │   ◀  "4月 2026"  ▶                     (tap nav)
  │
  ├ <WeekdayLabels />                         ← 新規 (独立行)
  │   日 月 火 水 木 金 土
  │
  ├ <WeekStrip>                              ← refactor (week → strip、選択日 center)
  │   20 21 22 [23] 24 25 26
  │   各 cell = 数字のみ + selected (紫円) / today (subtle) / 当月外 (薄色)
  │   tap → setSelectedDate
  │
  ├ <SelectedDaySection>                      ← 新規
  │   "4月23日 (水)"
  │   [anchor list (時刻 + title + sub)]
  │   または "予定なし" + 「+ この日に予定を追加」link
  │
  └ <FAB />                                   ← 新規、右下 fixed
      紫 gradient + 56px circle + 「+」
      tap → onAddRequest({ initial: { kind:"one_off", date: selectedDate } })
</CalendarTab>
```

### 4.2 新規 state (CalendarTab 内 useState)

| state | type | 初期値 | 永続化 |
|-------|------|--------|--------|
| `currentMonth` | `Date` (UTC midnight、月初 1 日) | 今日が属する月の月初 | tab unmount で reset |
| `selectedDate` | `string` (ISO "YYYY-MM-DD") | 今日 | tab unmount で reset |

### 4.3 新規 helper (`_helpers.ts` 追加)

```typescript
// pure 関数、deterministic test 可能

/** 当該日が属する月の月初 (1 日 00:00 UTC) */
export function getMonthStart(d: Date): Date;

/** 月加算、月末 overflow は最終日に clamp (1/31 → 2/28 or 2/29 閏年) */
export function addMonths(d: Date, n: number): Date;

/** 月末日を返す (閏年対応、例: 2026/02 → 28、2028/02 → 29) */
export function getLastDayOfMonth(year: number, month: number): number;

/**
 * 指定日付を target month に clamp。同日が存在しない場合は target month の末日。
 * 例: clampDateToMonth(2026, 1 (Feb), 31) → 2026-02-28
 *     clampDateToMonth(2028, 1 (Feb), 31) → 2028-02-29 (閏年)
 *     clampDateToMonth(2026, 4 (May), 31) → 2026-05-31
 */
export function clampDateToMonth(year: number, month: number, day: number): Date;

/**
 * 選択日が属する ISO 週 (月-日) の 7 日配列を返す。
 * 月跨ぎ (例: 4/29 月曜 から 5/5 日曜) を含む。各 cell は inCurrentMonth flag 付き。
 */
export function buildWeekStrip(
  selectedDate: Date,
  currentMonth: Date
): WeekStripCell[];

export type WeekStripCell = {
  date: Date;
  iso: string;
  dayOfMonth: number;
  inCurrentMonth: boolean;  // currentMonth と異なる月の日は薄色表示
};

/** "YYYY年M月" 形式 (mock 整合) */
export function formatJpYearMonth(d: Date): string;
```

### 4.4 selectedDate / currentMonth 連動 (GPT 補正 3 反映)

月送りで currentMonth が変わる時の selectedDate 挙動:

```typescript
function handleMonthChange(delta: number) {
  const newMonth = addMonths(currentMonth, delta);
  // 補正 3: 同日付存在なら維持、存在しなければ月末 clamp
  const dayOfMonth = parseInt(selectedDate.slice(8, 10), 10);
  const clampedDate = clampDateToMonth(
    newMonth.getUTCFullYear(),
    newMonth.getUTCMonth(),
    dayOfMonth
  );
  setCurrentMonth(newMonth);
  setSelectedDate(isoDate(clampedDate));
}
```

例:
- 1/31 → 翌月 tap → `clampDateToMonth(2026, 1, 31)` → 2026-02-28 ✓
- 2/15 → 翌月 tap → `clampDateToMonth(2026, 2, 15)` → 2026-03-15 ✓
- 1/15 → 翌月 tap → 2/15 → 翌月 tap → 3/15 (day 維持) ✓
- 1/31 → 2/28 → 翌月 tap → `clampDateToMonth(2026, 2, 28)` → 2026-03-28 (元の 31 は失われる)
  - これを許容するか別判定: **Phase 2-A は day-of-month 保持の単純実装**、original day を覚えて復元する設計は Phase 2-A+ で検討 (UI 複雑)

### 4.5 WeekStrip cell visual treatment

```tsx
<button
  type="button"
  onClick={() => setSelectedDate(cell.iso)}
  className={cellClasses(cell, today, selectedDate)}
  aria-label={`${formatJpDate(cell.date)} を選択`}
  aria-current={selectedDate === cell.iso ? "date" : undefined}
  aria-pressed={selectedDate === cell.iso}
>
  {cell.dayOfMonth}
</button>
```

`cellClasses` 分岐 (selected が today に支配的):

| cell 状態 | classes |
|-----------|---------|
| selected (today か否か関係なく) | `bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-full font-semibold w-10 h-10` (mock 紫円) |
| today + not selected | `text-indigo-700 font-bold` (subtle、selected と区別) |
| inCurrentMonth + 通常 | `text-slate-700 hover:bg-slate-50 rounded-full w-10 h-10` |
| 他月 (inCurrentMonth=false) | `text-slate-300` (薄色、tap 可) |

a11y: hit area ≥ 44×44 推奨 → cell 全体を 44×44 にして紫円自身は 40×40 で内側配置。

### 4.6 月送り navigation (tap-only)

```tsx
<header className="flex items-center justify-between px-4 py-3">
  <button onClick={() => handleMonthChange(-1)} aria-label="前月" className="...">
    {/* SVG icon、左 chevron */}
  </button>
  <h2 className="text-xl font-semibold">{formatJpYearMonth(currentMonth)}</h2>
  <button onClick={() => handleMonthChange(1)} aria-label="翌月" className="...">
    {/* SVG icon、右 chevron */}
  </button>
</header>
```

**HomeSwipeContainer 衝突回避**:
- tap event = drag offset < 5px、HomeSwipeContainer の drag threshold (30%) 未満で衝突なし
- 月送り **swipe gesture は採用しない**
- keyboard ← → は HomeSwipeContainer の pane swipe nav と衝突するため**本 wave で未実装**、Phase 2-A+ で focus 制御後追加検討

### 4.7 SelectedDaySection (week strip 下、主役領域)

```tsx
<section className="mt-4 px-4">
  <h3 className="text-base font-medium text-slate-700 mb-3">
    {formatJpDate(selectedDateObj)} ({weekdayLabel})
  </h3>

  {selectedDayAnchors.length === 0 ? (
    <div className="rounded-2xl bg-slate-50 px-4 py-6 text-center">
      <p className="text-sm text-slate-500 mb-3">予定なし</p>
      {onAddRequest && (
        <button
          onClick={() => onAddRequest({
            initial: { kind: "one_off", date: selectedDate },
            subtitle: `カレンダー / ${formatJpDate(selectedDateObj)} から`,
          })}
          className="text-sm text-indigo-600 hover:underline"
        >
          + この日に予定を追加
        </button>
      )}
    </div>
  ) : (
    <ul className="space-y-2">
      {selectedDayAnchors.map(anchor => (
        <AnchorRow
          key={anchor.id}
          anchor={anchor}
          onClick={() => onAnchorClick?.(anchor)}
        />
      ))}
    </ul>
  )}
</section>
```

各 `AnchorRow` (内部 component or inline):
- 時刻 (HH:mm) + title (太字) + location (薄色)
- tap で `onAnchorClick(anchor)` (AnchorDetailModal 起動、W1-X5 既存挙動)

### 4.8 FAB (GPT 補正 2 反映、新規追加)

```tsx
<button
  type="button"
  onClick={() => onAddRequest?.({
    initial: { kind: "one_off", date: selectedDate },
    subtitle: `カレンダー / ${formatJpDate(selectedDateObj)} から`,
  })}
  aria-label={`${formatJpDate(selectedDateObj)}に予定を追加`}
  className="
    fixed bottom-6 right-6 w-14 h-14 rounded-full
    bg-gradient-to-br from-indigo-500 to-purple-500
    text-white text-2xl font-light shadow-lg
    hover:shadow-xl active:scale-95 transition-all
    z-30
  "
>
  +
</button>
```

**配置の精緻**:
- `position: fixed`: viewport 基準ではなく、Phase 1 PR #214 の containing block fix で **pane 内に閉じ込まる**
- pane mode: pane の右下 (`right-6` = 24px from pane right edge)
- route mode: viewport 全体の右下 (route mode は `<main className="min-h-screen">` なので fixed = viewport 基準)
- `z-30`: 通常 content より上、Modal (`z-50`) より下
- Modal 開時は visual に重ねないため `z-30` で十分、Modal が overlay する

**dual entry point の整合**:
- FAB (本 wave 新規) + SelectedDay link (本 wave 新規) + PlanClient header "+ 教える" (既存)
- → 重複だが各々の文脈で価値:
  - FAB: 主要 entry (mobile 標準)、目立つ
  - SelectedDay link: empty state 時の自然な誘導
  - Header button: route mode (desktop) で目立つ場所、両 mode で互換性維持

**CEO 判断**: header button を残すか、FAB のみにするか? 推奨は **両方残す** (UI noise だが両 mode で互換性、Phase 2-A+ で整理検討)。

---

## 5. 既存 anchor / recurring / exception_dates の week strip 展開

### 5.1 各 cell

- WeekStrip は **anchor 表示しない** (mock 整合、数字のみ)
- → 各 cell に対して `anchorsForDay` を呼ぶ必要なし

### 5.2 SelectedDaySection

- `anchorsForDay(anchors, selectedDateObj)` を 1 回呼ぶ
- recurring 展開 + exception_dates + valid_from/until すべて含めて返却
- → 既存 helper を 100% 再利用、logic 変更 0

### 5.3 性能

- WeekStrip: 7 cell、anchor 計算なし
- SelectedDaySection: 1 日分 anchorsForDay (recurring N 件 × 1 日 = ms 単位)
- → 月跨ぎ recurring の性能も問題なし

---

## 6. 予定なし日の表示方針

### 6.1 WeekStrip 内

- **数字のみ**、anchor 件数 dot 等は **なし** (mock 整合、視覚 clean)
- inCurrentMonth=false の日は薄色 (`text-slate-300`)

### 6.2 SelectedDaySection 内

- empty state 表示: 灰背景 card + "予定なし" + "+ この日に予定を追加" link
- empty state は subtle、押し付けない

### 6.3 全月予定なし (= 0 anchors total)

- PlanClient の EmptyState が選択される (既存挙動、CalendarTab は render されない)
- 本 wave で変更なし

---

## 7. + 教える 導線の整理 (GPT 補正 4 反映)

| 場所 | 現状 | 本 wave 後 | 用途 |
|------|------|-----------|------|
| PlanClient header「+ 教える」 button | あり (両 mode) | **継続** | route mode で primary entry |
| CalendarTab cell `+` (W1-X3) | 各 cell | **削除** | mock 整合、cell が小さい |
| SelectedDaySection「+ この日に予定を追加」 link | (なし) | **新規** | empty state での自然誘導 |
| **FAB (右下 + 56px gradient)** | (なし) | **新規** | mock 整合、選択日 prefill |

date pre-fill UX (W1-X3 起源) は SelectedDay link + FAB で完全継承:
```typescript
onAddRequest?.({
  initial: { kind: "one_off", date: selectedDate },
  subtitle: `カレンダー / ${formatJpDate(selectedDateObj)} から`,
});
```

→ AddAnchorModal が pre-fill された state で開く (PlanClient 内 `openAdd` 経由、既存)。

---

## 8. Mobile layout / Scroll / Swipe 競合対策

### 8.1 Mobile layout (Home pane 内、height budget)

| section | 高さ概算 |
|---------|----------|
| PlanClient header ("Plan" + 2 button) | ~80px |
| Tab pill segmented | ~50px |
| Month header (◀ "4月 2026" ▶) | ~60px |
| Weekday labels 1 行 | ~30px |
| **WeekStrip (1 行)** | **~50px** (Full month grid 6 行 ~240px 比、**約 190px 節約**) |
| **SelectedDaySection** | **flexible (主役領域)** |
| HomePaneIndicator (overlay 下) | ~40px |
| FAB | fixed overlay (高さに影響しない) |

合計: ~270px + flexible → mobile viewport (~700-900px) で **anchor list 主役、余裕あり**。

### 8.2 Scroll

- CalendarTab 内に独自 scroll を持たない
- 親 `<main>` (PlanClient root) の `h-full overflow-y-auto` (pane mode) で全体 scroll
- SelectedDaySection の anchor 多数時に scroll 発生 → 親 scroll で対応

### 8.3 Swipe 競合 (HomeSwipeContainer)

| 操作 | 動作 | 競合 |
|------|------|------|
| 月送り arrow tap | tap event | なし |
| Week strip cell tap (選択) | tap event | なし |
| anchor row tap (詳細) | tap event | なし |
| **FAB tap** | tap event | なし (`stopPropagation` 不要、ベース要素が pane 内) |
| SelectedDay scroll | 縦 scroll | なし (dragDirectionLock で X 軸排他) |
| Modal open (AddAnchor 等) | Modal lock 発動 (Phase 1 C3) | swipe disable |
| 月送り **swipe gesture** | **採用しない** | 衝突回避 |

### 8.4 Modal swipe lock (Phase 1 C3 継承)

- FAB tap → `onAddRequest` → `setAddOpen(true)` → AddAnchorModal の `useEffect(isOpen)` で lock register
- SelectedDay link tap → 同 path
- → **既存 lock 機構を再利用、本 wave で変更なし**

### 8.5 a11y

- WeekStrip: `role="grid"` (1 行のみ) または `role="tablist"` (each cell = "tab")、後者は意味的に妥当
- 各 cell: `role="tab"` + `aria-selected={selected}` + `aria-current="date"` + `aria-label` full date
- 月送り button: `aria-label="前月"` / `aria-label="翌月"`
- FAB: `aria-label={選択日に予定を追加}` (date を含める)
- keyboard navigation: 本 wave は tap-only、Phase 2-A+ で keyboard ← → 検討

---

## 9. Commit 階段 (1 PR / 3 commits)

### C1: Pure helpers + tests

**Files**:
- `app/(culcept)/plan/tabs/_helpers.ts` — 新規 export: `getMonthStart`, `addMonths`, `getLastDayOfMonth`, `clampDateToMonth`, `buildWeekStrip`, `formatJpYearMonth`
- `tests/unit/plan/calendarMonthHelpers.test.ts` — 新規、edge cases:
  - `clampDateToMonth(2026, 1, 31)` → 2026-02-28
  - `clampDateToMonth(2028, 1, 31)` → 2028-02-29 (閏年)
  - `addMonths` 12 → 1 (年跨ぎ)
  - `buildWeekStrip` 月初週 (前月日を含む) / 月末週 (次月日を含む) / 月中央週

**目的**: pure logic を test coverage 100% で固定、deterministic verify。

### C2: CalendarTab refactor (week view → compact week strip + selected day agenda + FAB)

**Files**:
- `app/(culcept)/plan/tabs/CalendarTab.tsx` — refactor:
  - 旧 week view (各 cell に anchor list 表示) → MonthHeader / WeekdayLabels / WeekStrip / SelectedDaySection / FAB
  - state: currentMonth / selectedDate 追加
  - cell `+` button **削除**
  - FAB **新規追加** (右下 fixed、紫 gradient)
- (Optional) `tests/unit/plan/calendarTab.test.ts` — selectedDate state machine の pure logic test

**変更**:
- 既存 props (`anchors`, `now?`, `onAddRequest?`, `onAnchorClick?`) signature **不変**
- PlanClient / Modal logic 不変
- `anchorsForDay` は `selectedDate` に対してのみ 1 回呼ぶ

### C3: Visual polish + smoke docs update + 月送り animation (optional)

**Files**:
- `app/(culcept)/plan/tabs/CalendarTab.tsx` — visual polish:
  - 月送り transition (framer-motion で 200ms slide、AnimatePresence)
  - selected cell の紫円 grow animation (CSS transition、150ms)
  - 「今日へ」button (selectedDate が today でない時、SelectedDay の隣に small button、optional)
- `docs/alter-plan-home-swipe-visual-smoke.md` — Phase 2-A 完了対応 smoke checklist 更新

---

## 10. Smoke 項目

### 10.1 /plan route (route mode)

- [ ] /plan 直 URL で CalendarTab が **compact week strip** 表示
- [ ] Month header "X月 YYYY年" + ◀ ▶ arrow 表示
- [ ] Weekday labels (日 月 火 水 木 金 土) 表示
- [ ] WeekStrip 1 行 (7 cells) 表示、selected day = 紫円
- [ ] Today が selected でない時、subtle indigo bold で表示
- [ ] 月跨ぎ週 (例: 4/29 月-5/5 日) で前月/次月の日が薄色表示
- [ ] FAB 右下に紫 gradient 56px circle 表示
- [ ] SelectedDaySection に選択日 anchor list 表示

### 10.2 月送り navigation + selectedDate clamp

- [ ] ▶ tap で翌月表示
- [ ] ◀ tap で前月表示
- [ ] `selectedDate = 1/31` → ▶ → currentMonth = 2 月、selectedDate = `2026-02-28` (clamp 確認)
- [ ] `selectedDate = 2/15` → ▶ → currentMonth = 3 月、selectedDate = `2026-03-15` (day 維持)
- [ ] 12 月 → ▶ → 1 月、年が +1 (2026/12 → 2027/01)
- [ ] 1 月 → ◀ → 12 月、年が -1
- [ ] 閏年 2 月 (例: 2028/02) で 1/31 → ▶ → 2028-02-29

### 10.3 日選択 + agenda

- [ ] WeekStrip cell tap で selectedDate 更新、紫円が tap した日に移動
- [ ] SelectedDaySection が選択日の anchor を表示
- [ ] 選択日が予定なし → "予定なし" + 「+ この日に予定を追加」 link
- [ ] 選択日が予定あり → anchor list (時刻 + title + sub)
- [ ] anchor row tap で AnchorDetailModal 起動 (W1-X5 既存)

### 10.4 + 教える 導線

- [ ] PlanClient header「+ 教える」button で AddAnchorModal 起動 (両 mode)
- [ ] SelectedDay「+ この日に予定を追加」link で AddAnchorModal 起動、date pre-filled
- [ ] **FAB tap で AddAnchorModal 起動、date pre-filled** (新規)
- [ ] CalendarTab cell の `+` button は**削除済**で表示なし

### 10.5 Recurring + exception_dates

- [ ] FREQ=WEEKLY recurring anchor が当週 selected day に表示
- [ ] FREQ=DAILY recurring anchor が selected day に表示
- [ ] exception_dates に登録した日は anchor 非表示
- [ ] valid_until 後の日は anchor 非表示
- [ ] 月跨ぎ recurring anchor も正しく表示 (前月/次月の cell に anchor 計算は不要、selected day のみ計算)

### 10.6 Home pane 統合 (pane mode)

- [ ] Home → 左 swipe → Plan pane に **同じ compact week strip + agenda + FAB**
- [ ] FAB が pane 右下に表示 (PR #214 containing block で pane 内に閉じ込まる)
- [ ] Home / Plan pane 切替で state (currentMonth / selectedDate) 保持
- [ ] Modal 開時に Home swipe disable (Phase 1 C3)

### 10.7 /plan 直 URL 互換

- [ ] 別 tab で `/plan` 直接開く → route mode で同 UI
- [ ] route mode で FAB が viewport 右下 fixed (pane 内ではなく viewport)
- [ ] Home pane と /plan インスタンスは state 独立

### 10.8 Network / Console

- [ ] Network filter `aljavfujeqcwnqryjmhl` のみ、`hjcrvndumgiovyfdacwc` 0 hit
- [ ] Network filter `/api/coalter` / `/api/talk` → 0 hit
- [ ] Console filter `[Mirror]` / `[CoAlter]` → 0 error

---

## 11. やらないこと (制約再宣言)

### CEO 補正 + GPT 補正による制約

- ❌ CoAlter / Mirror / /talk / D-* 関連
- ❌ production env 変更 / all Preview env 変更
- ❌ migration 追加 (W1-Z で apply 済、Phase 2-A は code only)
- ❌ service_role / DB password / connection string 使用
- ❌ DraftPlan generator / W1-6 passive drift logging
- ❌ W1-Z+ cleanup (24-48h 観測後、別 wave)
- ❌ fallback path 削除

### Phase 2-A で自重するもの (Phase 2-A+ / 2-B / 2-C / Phase 3 預け)

- ❌ **Full month grid (6×7)** — Phase 2-A+ で別オプション設計
- ❌ FlowTab / MapTab の改修
- ❌ Google Maps integration
- ❌ リスト image thumbnail 化
- ❌ 空き日 → ALTER 提案 flow
- ❌ keyboard navigation (← → でも月送り)
- ❌ 月内 swipe gesture (HomeSwipeContainer 衝突回避)
- ❌ Pull-to-refresh / re-fetch UX
- ❌ Anchor density indicator (各 cell の anchor 件数 dot)
- ❌ AneurasyncHome.tsx 内部改変
- ❌ PlanClient の fetch / Modal logic 変更
- ❌ lib/plan/external-anchor-* / lib/plan/anchor-fetch.ts

---

## 12. 自立推論 — Beyond 設計 (世界トップアプリレベル基準)

### 12.1 buildWeekStrip を pure 関数化する根拠

- selected day を center にしつつ ISO week (月-日 7 日) を固定範囲とする計算
- 月跨ぎ判定 (`inCurrentMonth` flag)
- 閏年 2 月 / 12-1 月跨ぎ等の edge case
- deterministic test 可能、将来 Phase 2-A+ の `buildMonthGrid` との対称性確保

### 12.2 selectedDate clamp の設計判断 (GPT 補正 3 反映)

- 1/31 → 2 月 → 2/28 (or 2/29 閏年)
- 1/15 → 2 月 → 2/15 (day 維持)
- 1/31 → 2/28 → 3 月 → 3/28 (前月 clamp の "値" を保持、original 31 復元は本 wave 不採用)
- → `clampDateToMonth(year, month, day)` pure helper で実装

### 12.3 Today / Selected visual treatment (mock 整合 + a11y)

```
selected               → 紫円 (gradient fill)、a11y "selected"
today + selected       → 紫円 (selected が支配)
today + not selected   → subtle indigo bold + 微小 dot 下 (selected と区別)
other (inCurrentMonth) → 通常 text-slate-700
other (薄色)           → text-slate-300
```

### 12.4 FAB 配置と pane 内閉じ込め (Phase 1 PR #214 連動)

- `position: fixed bottom-6 right-6 z-30`
- pane mode: pane の右下 (PR #214 containing block で pane 内に閉じ込まる)
- route mode: viewport の右下 (PlanClient root は `min-h-screen` で transform なし、fixed = viewport 基準)
- Modal (`z-50`) と重ねない (FAB は背面に隠れる、UX 整合)
- safe-area-inset-bottom 対応で iOS notch / home bar 衝突回避

### 12.5 月送り animation (Phase 2-A で採用)

- `<AnimatePresence>` + `motion.div` key={currentMonth.toISOString()}
- ▶ tap: slide-left in、▶ direction で month + 1
- ◀ tap: slide-right in
- 200ms ease-out
- Apple Calendar 風の natural feel、世界トップアプリ整合

実装: framer-motion で variants 定義。HomeSwipeContainer の framer-motion と独立 (異なる motion.div instance、競合なし)。

### 12.6 「今日へ」button (Today shortcut、Phase 2-A で採用)

- selectedDate が today でない、または currentMonth が今月でない時、SelectedDay header の隣に small button
- tap で `currentMonth = 今月`, `selectedDate = 今日`
- iOS / Google Calendar の "Today" button と同等
- 世界トップアプリ標準機能

実装: small `<button>` text "今日", `text-indigo-600 text-sm`、tap で 2 state setter 呼ぶ。

### 12.7 Anchor row UI の再利用 (世界トップアプリ統一感)

- 既存 cell 内の anchor row UI (`時刻 + title + location` 2 段) を SelectedDaySection で再利用
- ただし mock では各 row が **rounded card + image thumbnail** (将来 Phase 2-B で対応)
- 本 wave は cleaner で軽量な list 表現 (mock の主要要素は時刻と title)

### 12.8 Compact week strip の swipe gesture (Phase 2-A+ で別途)

- 週送り (前週 / 次週) を 月内 swipe で行う案
- HomeSwipeContainer と衝突するため **本 wave で採用しない**
- Phase 2-A+ で focus 検出 + gesture priority 制御後追加検討

### 12.9 Phase 1 invariant 完全継承

- Modal swipe lock (Phase 1 C3): 本 wave で新規 modal 追加なし、既存 modal trigger 経路から開く → lock 自動発動
- Pane isolation (PR #214 containing block): FAB の `position: fixed` も pane 内に閉じ込まる
- displayMode (PR #219 Phase 1 C1): CalendarTab は両 mode 共通、displayMode を渡さない

### 12.10 世界トップアプリ pattern との比較

| 機能 | Apple Calendar | Google Calendar | Linear/Cron | Aneurasync Phase 2-A |
|------|----------------|------------------|-------------|----------------------|
| Default view | Month | Month | Week strip + agenda | **Week strip + agenda** ✅ |
| Selected day agenda | List below | Sheet expand | Right panel | **List below** ✅ |
| Month/Week toggle | あり | あり | あり | (Phase 2-A+) |
| Today button | あり | あり | あり | **あり (Beyond 採用)** ✅ |
| FAB add | あり (右下) | あり (右下) | あり | **あり (本 wave 新規)** ✅ |
| Date pre-fill | 自動 | 自動 | 自動 | **自動 (W1-X3 継承)** ✅ |

→ Aneurasync Phase 2-A の compact week strip + agenda + FAB + Today button は**世界標準 calendar app pattern と整合**。

---

## 13. CEO 判断点 (本 PR merge 後の実装 wave 起票前)

### 判断 1: Mock 解釈 (GPT 補正 1 反映)

| 選択 | 構造 | 採用 |
|------|------|------|
| **A. Compact week strip + selected day agenda** | 月名 + 週 strip + agenda + FAB | **本命 Phase 2-A** ✅ |
| B. Full month grid (6×7) | 月名 + grid + agenda | Phase 2-A+ or 別 wave |
| C. Hybrid (strip + tap で grid expand) | strip + month sheet expand | Phase 2-A++ で検討 |

### 判断 2: FAB の扱い (GPT 補正 2 反映)

- **採用** (本 wave Phase 2-A)、選択日 prefill
- PlanClient header の "+ 教える" button は**継続**するか CEO 判断:
  - 推奨: 両方残す (route mode で header button、pane mode で FAB、互換性最優先)
  - 別案: pane mode 限定で header button 非表示、FAB のみ

### 判断 3: selectedDate clamp 挙動 (GPT 補正 3 反映)

- 同日付存在なら維持
- 存在しなければ月末 clamp (1/31 → 2/28 or 2/29 閏年)
- → `clampDateToMonth(year, month, day)` で実装

### 判断 4: Cell `+` button 削除 (GPT 補正 4 反映)

- **削除採用** (mock 整合)、cell が小さい + FAB / SelectedDay link で代替

### 判断 5: 月送り animation の採用

- Phase 2-A で 200ms slide animation 採用 (世界トップアプリ整合)
- CEO 別案あれば即時 / 不採用も可

### 判断 6: Today button (Beyond 採用)

- Phase 2-A で採用 (selectedDate ≠ today 時に表示)
- 世界トップアプリ標準、UX 向上

### 判断 7: Phase 2-A 後の次フェーズ

| Phase | 内容 | 推奨 timing |
|-------|------|--------------|
| **Phase 2-A+** | Full month grid (6×7) 追加 view mode、keyboard nav、月内 swipe | Phase 2-A PASS 後 |
| **Phase 2-B** | FlowTab を image thumbnail リスト化 | Phase 2-A 完了後 |
| **Phase 2-C** | MapTab Google Maps integration | 別 design (API key 判断含む) |
| **Phase 3** | 空き日 → ALTER 質問 → 提案 flow | Stargazer / Alter engine 接続 |
| **W1-Z+ cleanup** | Repository fallback path 削除 | apply 後 1 週間観測 |
| **production env 投入** | `PLAN_HOME_SWIPE_ENABLED=true` を production | smoke 完了 + 3 日実用後 |

---

## 14. References

- `app/(culcept)/plan/tabs/CalendarTab.tsx` (本命修正対象)
- `app/(culcept)/plan/tabs/_helpers.ts` (helper 拡張)
- `app/(culcept)/plan/PlanClient.tsx` (parent、本 wave で touch しない)
- `docs/alter-plan-w15-ui-mini-design.md` §2 (CalendarTab 初版設計)
- `docs/alter-plan-w1x3-cell-add-mini-design.md` (現在の cell `+` add 導線、本 wave で削除)
- `docs/alter-plan-home-swipe-full-plan-pane-mini-design.md` (Phase 1 設計)
- `docs/alter-plan-home-swipe-full-plan-pane-phase1-complete.md` (Phase 1 完了報告)
- `docs/alter-plan-home-swipe-visual-smoke.md` (smoke runbook、Phase 2-A で更新予定)

### 世界トップアプリ参考

- Apple Calendar (iOS / macOS): Month view + List view 切替
- Google Calendar: Month / Week / Day / Schedule view
- Notion Calendar (旧 Cron): Compact week strip + agenda (mock 最近似)
- Fantastical: List mode (week + agenda hybrid)
- Linear: Roadmap calendar (compact)

---

## 15. 変更履歴

| 日付 | 変更 | 承認 |
|------|------|------|
| 2026-05-20 (initial) | Phase 2-A (Full month grid 6×7) mini design 起票 | CEO レビュー → GPT 補正 4 点 |
| **2026-05-20 (補正版)** | **GPT 補正 4 点反映**: Compact week strip 採用、FAB 追加、selectedDate clamp 明示、cell `+` 削除確認 + Beyond 強化 (Today button / animation / 世界トップアプリ pattern 比較) | CEO レビュー待ち |

---

**End of Mini Design**. CEO レビュー → 判断 1-7 → 実装 wave (3 commits) GO/NO-GO 判断をお待ちします。
