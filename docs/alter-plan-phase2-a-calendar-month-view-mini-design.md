# Alter Plan Phase 2-A — CalendarTab 月ビュー化 Mini Design

**作成日**: 2026-05-20
**Status**: 採択待ち (CEO 承認後、実装 wave に進む)
**branch**: `docs/alter-plan-phase2-a-calendar-month-view-mini-design`
**実装範囲**: 本 PR は **docs only**。実装は CEO 承認後の別 PR (1 PR / 3 commits)

**前提**:
  - Phase 1 完全 PASS (PR #219 + #221 + W1-Z apply 完了、2026-05-20)
  - `/plan` 直 URL と Home pane の両方で `<CalendarTab>` は共通 instance を使用 (PlanClient displayMode 経由)

**関連**:
  - `docs/alter-plan-home-swipe-full-plan-pane-phase1-complete.md` (Phase 1 完了報告)
  - `docs/alter-plan-w15-ui-mini-design.md` §2 (CalendarTab 初版設計)
  - `docs/alter-plan-w1x3-cell-add-mini-design.md` (現在の cell `+` add 導線)
  - `app/(culcept)/plan/tabs/CalendarTab.tsx` (本命修正対象)
  - `app/(culcept)/plan/tabs/_helpers.ts` (helper、本 PR で拡張)

---

## 0. ゴール (CEO mock 由来)

### CEO スクショから抽出した完成形 (再精読)

CEO mock「ALTER アプリ構造と画面コンプト（最新案）」のカレンダー tab パート:

```
[4月 2026] >                        ← 月 header + 月送り arrow
日 月 火 水 木 金 土                ← 曜日 label (7 col)
20 21 22 [23] 24 25 26              ← 日付行、選択日 (23) = 紫円ハイライト

9:30  カフェで仕事                  ← 選択日の anchor list (時刻 + title + sub)
      スターバックス 代官山店
12:30 イタリアンでランチ
15:00 打ち合わせ
      ALTER オフィス
19:00 ジム
      エニタイムフィットネス 恵比寿

                                  +
                              (右下 FAB)
```

### Mock 解釈の 2 候補

| 候補 | 構造 | 採用 |
|------|------|------|
| **A. Week-in-month view** | 月 header + 1 週 (7 日) のみ表示 + 選択日 anchor list | 簡素だが「月ビュー」名称と不一致 |
| **B. Full month grid** | 月 header + 6 行 × 7 列 = 42 日 grid + 選択日 anchor list | **推奨** (Google / iOS Calendar 標準 pattern、CEO "月ビュー" 整合) |

mock スクショは 1 行のみ表示しているが、これは「**当該週の strip**」を例示と解釈。CEO 用語「月ビュー」は Google/iOS の月 grid pattern を含意するため、**B を推奨**。CEO 判断で A も選択可。

### ゴール (本 wave 範囲)

- **CalendarTab を週 grid から month grid (6×7) に refactor**
- 選択日 (selectedDate) state を追加、選択日 anchor list を grid 下に表示
- 月送り (前月/翌月) tap navigation
- /plan 直 URL と Home pane の両方で同一 instance、同一動作

### Phase 2-A で**やらないこと** (CEO 制約遵守)

- ❌ FlowTab / MapTab の改修 (Phase 2-B / 2-C)
- ❌ 空き日 → ALTER 提案 flow (Phase 3、Stargazer 接続後)
- ❌ Google Maps integration (Phase 2-C)
- ❌ リスト tab の image thumbnail 化 (Phase 2-B)
- ❌ FAB (右下 +) の新規追加 — PlanClient header の「+ 教える」を継続維持で代替
- ❌ CoAlter / Mirror / /talk / D-* / W1-6 / DraftPlan / production env / migration
- ❌ W1-Z+ cleanup (24-48h 観測後、別 wave)

---

## 1. 現在の CalendarTab 構造 (read-only audit)

### 1.1 ファイル構造

| layer | path | 役割 |
|-------|------|------|
| component | `app/(culcept)/plan/tabs/CalendarTab.tsx` (180 行) | week view (7 days、月-日) + 各日 anchor list + cell `+` add |
| helper | `app/(culcept)/plan/tabs/_helpers.ts` (270+ 行) | date utility / `getWeekDays` / `anchorsForDay` / `WEEKDAY_LABELS` 等 |
| parent | `app/(culcept)/plan/PlanClient.tsx` | data fetch / activeTab state / Modal 制御 / `onAddRequest` / `onAnchorClick` callback |

### 1.2 現状の表示 logic

```typescript
const days = getWeekDays(baseNow);          // 7 days (月-日)
const today = isoDate(utcMidnight(baseNow));

return (
  <div className="space-y-3 md:grid md:grid-cols-7 md:gap-3">
    {days.map((day) => {
      const dayAnchors = anchorsForDay(anchors, day);  // recurring 展開 + exception_dates 適用済
      // 各日 = GlassCard (header: 曜日 + 日番号 + + button) + anchor list
      // today は ring-2 ring-indigo-400 + text-indigo-700 でハイライト
    })}
  </div>
);
```

### 1.3 propsとcallback

| prop | 役割 |
|------|------|
| `anchors` | 全 anchor (ExternalAnchor[]) |
| `now?` | test inject 用、現在時刻 |
| `onAddRequest?` | cell `+` button tap で AddAnchorModal を pre-fill 起動 (W1-X3) |
| `onAnchorClick?` | anchor row 行 click で AnchorDetailModal を起動 (W1-X5) |

### 1.4 重要 helper (`_helpers.ts`)

| function | 役割 |
|----------|------|
| `utcMidnight(d)` | UTC midnight に丸める |
| `addDays(d, n)` | 日数加算 |
| `isoDate(d)` | "YYYY-MM-DD" 形式 |
| `getMondayOf(now)` | 当週の月曜日 |
| `getWeekDays(now)` | 当週の月〜日 (7 日) 配列 |
| `anchorsForDay(anchors, day)` | **recurring 展開 + exception_dates 適用済** で day 該当 anchor を返す |
| `formatTime(t)` | "HH:mm" 表示整形 |
| `formatJpDate(d)` | "M月D日" 表示整形 |
| `WEEKDAY_LABELS` | ["日", "月", "火", ...] |

→ **`anchorsForDay` は本 wave で再利用、recurring / exception 関連 logic 変更不要**。

---

## 2. CEO mock との差分 (gap analysis)

| 項目 | 現状 (week view) | CEO mock (month view) | 差分 |
|------|------------------|------------------------|------|
| 表示日数 | 7 (当週固定) | 42 (6 行 × 7 col 月 grid) | **構造拡張** |
| 月 navigation | (なし、今週固定) | ◀ ▶ tap で前月/翌月 | **新規** |
| 選択日 (selectedDate) state | (なし、各日 cell に anchor 直接表示) | **selected day → 紫円**、anchor は下に list | **state 追加 + visual treatment** |
| 各 day cell 内の anchor 表示 | anchor 詳細リスト (時刻 + title + sub) | **数字のみ** (anchor 件数 dot 等は mock に未表示) | cell 内 anchor list 削除、選択日 list は下段 |
| Today indicator | `ring-2 ring-indigo-400` (枠囲い) | 紫円 (selected と同形、もしくは別形) | **visual treatment 再設計** |
| Cell `+` button (W1-X3) | 各 cell に小さい `+` | mock では未表示 (FAB 右下のみ) | cell `+` 削除、PlanClient header の "+ 教える" で代替 |
| FAB (右下 + 大円) | (なし) | 紫 gradient、右下 fixed | **本 wave で追加しない** (PlanClient header の "+ 教える" で代替、重複回避) |
| 曜日 label 行 | (各 cell header に "月" 等) | grid 上部の独立行 (日月火水木金土) | **独立行に変更** |

---

## 3. 月ビュー化の最小安全設計

### 3.1 アーキテクチャ概要

```
<CalendarTab>
  ├ [state] currentMonth: Date (default: 今月)
  ├ [state] selectedDate: string (ISO、default: 今日 or 今月の 1 日)
  │
  ├ <MonthHeader>                  ← 新規
  │   "4月 2026" + ◀ ▶ buttons
  │
  ├ <WeekdayLabels />               ← 新規 (現在は各 cell header に分散)
  │   日 月 火 水 木 金 土
  │
  ├ <MonthGrid>                    ← refactor (week → month)
  │   6 行 × 7 col = 42 day cells
  │   各 cell = 数字 + selected/today 視覚処理
  │   prev/next 月の日は薄色 (greyed)
  │   tap → setSelectedDate
  │
  └ <SelectedDaySection>            ← 新規
      "4月23日 (水)" header
      anchor list (時刻 + title + sub)
      anchor 0 件 → "予定なし" + "+ この日に予定を追加" link
</CalendarTab>
```

### 3.2 新規 state

| state | type | 初期値 | 永続化 |
|-------|------|--------|--------|
| `currentMonth` | `Date` (UTC midnight、月初 1 日) | `utcMidnight(new Date())` の月初 | pane mount 中保持、unmount で reset |
| `selectedDate` | `string` (ISO "YYYY-MM-DD") | 今日の ISO | 同上 |

state は CalendarTab 内 useState、PlanClient には漏らさない (parent 不変)。

### 3.3 新規 helper (`_helpers.ts` 追加)

```typescript
// 新規 export、pure 関数
export function getMonthStart(d: Date): Date {
  // d の UTC 月初 (1 日 00:00 UTC) を返す
}

export function addMonths(d: Date, n: number): Date {
  // 月加算 (n=1: 翌月、n=-1: 前月)、月末 overflow は最終日に clamp
}

export function buildMonthGrid(year: number, month: number): MonthGridCell[] {
  // 月の 6 行 × 7 col = 42 day を返す
  // 月初の曜日に応じて prev 月の日で先頭埋め
  // 月末以降は next 月の日で末尾埋め
  // 各 cell: { date: Date, iso: string, inCurrentMonth: boolean }
}

export type MonthGridCell = {
  date: Date;
  iso: string;
  inCurrentMonth: boolean;  // false = prev/next month の日 (薄色)
};
```

### 3.4 anchor の月 grid 展開

各 cell に対して `anchorsForDay(anchors, cell.date)` を呼ぶ。既存 helper をそのまま再利用:

- one_off anchor: `date` 一致で該当
- recurring anchor: `expandRecurrence` で月内全日に展開、`exception_dates` 除外
- → 既存 logic 変更不要、recurring / exception の振る舞いは保証

### 3.5 各 cell の表示 (mock 整合)

```tsx
<button
  type="button"
  onClick={() => setSelectedDate(cell.iso)}
  className={cellClasses(cell, today, selectedDate)}
  aria-label={`${formatJpDate(cell.date)} を選択`}
  aria-current={selectedDate === cell.iso ? "date" : undefined}
>
  <span className="text-sm font-medium">{cell.date.getUTCDate()}</span>
</button>
```

`cellClasses` 分岐:

| cell 状態 | classes |
|-----------|---------|
| 当月 + 今日 + 選択中 | `bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-full` (mock 紫円) |
| 当月 + 今日 + 非選択 | `bg-indigo-50 text-indigo-700 font-semibold` |
| 当月 + 今日でない + 選択中 | `border-2 border-indigo-500 text-indigo-700 rounded-full` |
| 当月 + 通常 | `text-slate-700 hover:bg-slate-100` |
| 他月 (薄色) | `text-slate-300` |

### 3.6 月送り navigation

mock の `>` arrow は翌月。本 wave では `◀` と `▶` 両方の button を提供:

```tsx
<header className="flex items-center justify-between">
  <button onClick={() => setCurrentMonth(addMonths(currentMonth, -1))} aria-label="前月">◀</button>
  <h2>{formatJpYearMonth(currentMonth)}</h2>  // "4月 2026"
  <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} aria-label="翌月">▶</button>
</header>
```

`onClick` で `setCurrentMonth`、stopPropagation は不要 (HomeSwipeContainer drag は 30% threshold で発火、tap は影響しない)。

**Gesture 競合回避**:
- 月送り **swipe gesture を使わない** (HomeSwipeContainer drag と衝突回避)
- tap-only navigation
- keyboard ← → は CalendarTab focused 時のみで month change にすべきだが、HomeSwipeContainer の keyboard nav と衝突するため **本 wave では keyboard nav は未実装、tap のみ**

### 3.7 SelectedDaySection (grid 下)

```tsx
<section className="mt-6">
  <h3 className="text-base font-semibold">{formatJpDate(selectedDateObj)}</h3>

  {selectedDayAnchors.length === 0 ? (
    <>
      <p className="text-sm text-slate-500">予定なし</p>
      {onAddRequest && (
        <button
          onClick={() => onAddRequest({ initial: { kind: "one_off", date: selectedDate } })}
          className="mt-2 text-sm text-indigo-600 hover:underline"
        >
          + この日に予定を追加
        </button>
      )}
    </>
  ) : (
    <ul className="space-y-2">
      {selectedDayAnchors.map(anchor => (
        <li key={anchor.id} onClick={() => onAnchorClick?.(anchor)} ...>
          {/* 既存 anchor row UI を再利用 */}
        </li>
      ))}
    </ul>
  )}
</section>
```

### 3.8 + 教える 導線整理

| 場所 | 現状 | 本 wave 後 |
|------|------|----------|
| PlanClient header の「+ 教える」button | あり (両 mode) | **継続** (主要 entry) |
| CalendarTab cell の「+」button (W1-X3) | 各 cell に小さく | **削除** (mock 整合、cell が小さい、視覚 noise) |
| SelectedDaySection の「+ この日に予定を追加」link | (なし) | **追加** (selected day から直接登録) |

→ W1-X3 cell add の **意図 (date pre-fill)** は SelectedDaySection の link で代替。pre-fill 引数 `initial.date = selectedDate` を渡す。

### 3.9 Mobile layout 検討

Home pane (h-[100dvh]) 内での各 section 高さ:

| section | 高さ概算 (mobile) |
|---------|-------------------|
| PlanClient header ("Plan" + 2 button) | ~80px |
| Tab pill segmented | ~50px |
| Month header (◀ "4月 2026" ▶) | ~50px |
| Weekday labels (1 行) | ~30px |
| Month grid (6 行 × ~40px) | ~240px |
| SelectedDaySection | flexible (scroll for overflow) |
| HomePaneIndicator (overlay 下) | ~40px |

合計: ~500px + flexible → mobile 標準 viewport (~700-900px) に収まる、SelectedDaySection は scroll で対応。

Home pane の `overflow-y-auto` (PlanClient `displayMode=pane` で適用済) で全体 scroll 可能。

### 3.10 Gesture 競合対策 (HomeSwipeContainer との関係)

| 操作 | 動作 | HomeSwipeContainer との競合 |
|------|------|---------------------------|
| 月送り arrow tap | tap event、即時 | なし (tap は drag threshold 未満) |
| 日 cell tap (選択) | tap event | なし |
| anchor row tap (詳細) | tap event | なし |
| SelectedDaySection 内 scroll | 縦 scroll | なし (dragDirectionLock で X 軸排他) |
| Modal open (AddAnchor 等) | Modal lock 発動 (Phase 1 C3 で実装済) | swipe disable |
| 月送り **swipe gesture** | **採用しない** | 衝突回避 |

---

## 4. 既存 anchor / recurring / exception_dates の月 grid 展開

### 4.1 one_off anchor

- 各 day cell に対して `anchorsForDay(anchors, cell.date)` を呼ぶ
- `date` 一致のみで該当判定
- 月跨ぎ (例: 4/30 一日 anchor → 5 月 grid で 4/30 cell に表示) は cell の `inCurrentMonth: false` で薄色だが、anchor list は表示
- ただし**多分**, prev/next 月の cell には anchor を表示しない (cell が小さい、視覚 noise) — selected day section は selected day のみ
- → cell には数字のみ、anchor 詳細は selected day section のみ

### 4.2 recurring anchor

- `expandRecurrence(anchor, day)` を `anchorsForDay` 内で呼ぶ (既存 logic)
- recurring rule (FREQ=WEEKLY / DAILY / MONTHLY 等) に従って当該日が該当するか判定
- 月 grid 全 42 日 × recurring 件数 (通常 10-20) の loop → 月内 instances ~30-60 程度、性能問題なし

### 4.3 exception_dates

- `anchorsForDay` 内で除外判定済 (`exception_dates.includes(iso)` で除外)
- 月跨ぎでも正しく動作 (ISO date 文字列比較)
- → 本 wave で exception_dates logic 変更不要

### 4.4 Validity range (valid_from / valid_until)

- `anchorsForDay` 内で `valid_from <= day && (valid_until == null || day <= valid_until)` 判定
- 月跨ぎでも正しく動作

→ **既存 helper を完全に再利用、recurring / exception / validity logic は本 wave で touch しない**。

---

## 5. 予定なし日の表示方針

### 5.1 Cell 内 (grid)

- **数字のみ表示**、anchor 件数 dot や empty 表示は **なし** (mock 整合、視覚 clean)
- 当月 + 通常: `text-slate-700`
- 他月 (prev/next): `text-slate-300` (薄色)
- 今日 / 選択日: §3.5 cellClasses 表に従い

### 5.2 SelectedDaySection 内 (grid 下)

- 選択日が予定なし: 「予定なし」 + 「+ この日に予定を追加」 link
- 選択日が予定あり: anchor list 表示

### 5.3 全月予定なし (= 0 anchors total)

- PlanClient の Empty State が選択される (`state.kind === "ok" && state.anchors.length === 0`)
- → CalendarTab は render されない、Empty State の「+ Alter に教える」が表示
- 本 wave で変更なし (PlanClient 既存挙動)

---

## 6. + 教える 導線をどう残すか

§3.8 で整理:

1. **PlanClient header の「+ 教える」button** — 主要 entry、両 mode (route / pane) で表示、本 wave で**継続**
2. **CalendarTab cell `+` button (W1-X3)** — 本 wave で**削除** (mock 整合、cell が小さい)
3. **SelectedDaySection の「+ この日に予定を追加」 link** — 本 wave で**新規追加** (selected day pre-fill)

W1-X3 で確立した「date pre-fill UX」は **#3 で継承**。tap 後の挙動:

```typescript
onAddRequest?.({
  initial: { kind: "one_off", date: selectedDate },
  subtitle: `カレンダー / ${formatJpDate(selectedDateObj)} から`,
});
```

PlanClient の `openAdd` → AddAnchorModal が pre-fill された state で開く (既存挙動)。

---

## 7. Mobile layout / Scroll / Swipe 競合対策

### 7.1 Mobile layout (Home pane 内)

§3.9 の section 高さ表参照。各 section の `min-width: 0` で grid が圧縮されないよう設計。

```tsx
<div className="space-y-4 px-4">  {/* CalendarTab root */}
  <MonthHeader ... />              {/* flex flex-row justify-between */}
  <WeekdayLabels />                {/* grid grid-cols-7 text-center text-xs */}
  <MonthGrid ... />                 {/* grid grid-cols-7 gap-1 */}
  <SelectedDaySection ... />        {/* flexible height */}
</div>
```

### 7.2 Scroll

- CalendarTab 内に独自 scroll を持たない
- 親の `<main>` (PlanClient root) が `h-full overflow-y-auto` (pane mode) or `min-h-screen` (route mode) で scroll
- → CalendarTab は naturally 縦に伸びる、親が scroll

### 7.3 Swipe 競合 (HomeSwipeContainer)

§3.10 表参照。すべて tap-based 操作のため衝突なし。

### 7.4 Modal swipe lock (Phase 1 C3)

- `AddAnchorModal` 開時に `registerHomeSwipeModalOpen` 発火 (既存)
- 本 wave で SelectedDaySection の「+ この日に予定を追加」link → `onAddRequest` → `setAddOpen(true)` → AddAnchorModal の `useEffect(isOpen)` で lock register
- → **既存 lock 機構をそのまま再利用、本 wave で変更不要**

### 7.5 a11y

- 月 grid: `role="grid"` + 各 cell `role="gridcell"`、選択日に `aria-selected="true"` or `aria-current="date"`
- 月送り button: `aria-label="前月"` / `aria-label="翌月"`
- keyboard navigation: 本 wave では tap のみ、← → key は HomeSwipeContainer の pane swipe との衝突回避で **本 wave 未実装**、Phase 2-A+ で別途検討
- focus trap は不要 (modal でない)

---

## 8. Commit 階段 (1 PR / 3 commits)

### C1: Pure helpers + tests

**Files**:
- `app/(culcept)/plan/tabs/_helpers.ts` — `getMonthStart`, `addMonths`, `buildMonthGrid`, `formatJpYearMonth` (各 pure 関数) 追加
- `tests/unit/plan/monthGridHelpers.test.ts` — 新規、edge cases (月初日曜 / 月末土曜 / 月跨ぎ / 閏年 / 12月→1月)

**目的**: pure logic を test-coverage 100% で固定、deterministic verify。

### C2: CalendarTab refactor (week → month)

**Files**:
- `app/(culcept)/plan/tabs/CalendarTab.tsx` — week grid → month grid 構造変更、currentMonth / selectedDate state 追加、MonthHeader / WeekdayLabels / MonthGrid / SelectedDaySection 分離 (内部 sub-component)
- (Optional) tests を `tests/unit/plan/calendarTab.test.ts` で新規 — state machine 純粋 logic のみ

**変更**:
- cell `+` button 削除
- 各 cell 内 anchor list 削除
- SelectedDaySection で選択日 anchor + 「+ この日に予定を追加」link

**不変**:
- props (`anchors`, `now?`, `onAddRequest?`, `onAnchorClick?`) は同一 signature
- PlanClient / Modal logic 不変

### C3: Visual polish + smoke docs update

**Files**:
- `app/(culcept)/plan/tabs/CalendarTab.tsx` — visual polish (cell 高さ / weekday label 色 / 月送り arrow icon / animation)
- `docs/alter-plan-home-swipe-visual-smoke.md` — Phase 2-A 完了に対応した smoke 追加 (月送り / 日選択 / 月跨ぎ recurring 確認)

---

## 9. Smoke 項目

### 9.1 /plan route (route mode)

- [ ] /plan 直 URL で CalendarTab が **月ビュー**表示
- [ ] 月 header "X月 YYYY年" + ◀ ▶ arrow 表示
- [ ] Weekday labels (日 月 火 水 木 金 土) 表示
- [ ] Month grid 6 行 × 7 col 表示
- [ ] 今日 cell が特別 highlight (indigo bg)
- [ ] 選択日 cell が紫円 highlight
- [ ] prev/next 月の cell が薄色 (text-slate-300)

### 9.2 月送り navigation

- [ ] ▶ tap で翌月表示、selectedDate は新月内に clamp (新月の 1 日? or 同日?)
- [ ] ◀ tap で前月表示
- [ ] 月跨ぎ (4/30 → 5/1) で grid 正しく更新
- [ ] 12 月 → 1 月で年が更新 (例: 2026/12 → 2027/01)
- [ ] 1 月 → 12 月で年が逆更新

### 9.3 日選択

- [ ] cell tap で selectedDate 更新
- [ ] SelectedDaySection が選択日の anchor を表示
- [ ] 選択日が予定なしなら「予定なし」 + 「+ この日に予定を追加」 link
- [ ] 選択日が予定ありなら anchor list (時刻 + title + sub)
- [ ] anchor row tap で AnchorDetailModal 起動 (W1-X5 既存)

### 9.4 + 教える 導線

- [ ] PlanClient header の「+ 教える」button で AddAnchorModal 起動 (両 mode)
- [ ] SelectedDaySection の「+ この日に予定を追加」link で AddAnchorModal 起動、date pre-filled
- [ ] CalendarTab cell の `+` button は**削除済**で表示なし

### 9.5 Recurring + exception_dates

- [ ] FREQ=WEEKLY recurring anchor が月内全週同曜日に表示
- [ ] FREQ=DAILY recurring anchor が月内全日に表示
- [ ] exception_dates に登録した日は anchor 非表示
- [ ] valid_until 後の日は anchor 非表示

### 9.6 Home pane 統合

- [ ] Home → 左 swipe → Plan pane に **同じ月ビュー** が表示
- [ ] Home / Plan pane 切替で CalendarTab state (currentMonth / selectedDate) 保持
- [ ] Home pane で Modal 開時に Home swipe disable (Phase 1 C3)

### 9.7 /plan 直 URL 互換

- [ ] 別 tab で `/plan` 直接開く → route mode で月ビュー
- [ ] Home pane で見ていた selectedDate / currentMonth は /plan インスタンスと独立

### 9.8 Network / Console

- [ ] Network filter `aljavfujeqcwnqryjmhl` のみ
- [ ] Network filter `/api/coalter` / `/api/talk` → 0 hit
- [ ] Console filter `[Mirror]` / `[CoAlter]` → 0 error
- [ ] Console filter `[Plan]` / `rpc_fallback` → 通常運用範囲

---

## 10. やらないこと (制約再宣言)

### CEO 補正に基づく制約

- ❌ CoAlter / Mirror / /talk / D-* 関連
- ❌ production env 変更
- ❌ all Preview env 変更
- ❌ migration 追加 (Plan 関連 migration apply は W1-Z で完了済、Phase 2-A は code only)
- ❌ service_role / DB password / connection string 使用
- ❌ DraftPlan generator / W1-6 passive drift logging
- ❌ W1-Z+ cleanup (24-48h 観測後、別 wave)
- ❌ fallback path 削除

### Phase 2-A で自重するもの (Phase 2-B / 2-C / Phase 3 預け)

- ❌ FlowTab / MapTab の改修
- ❌ Google Maps integration
- ❌ リスト image thumbnail 化
- ❌ 空き日 → ALTER 提案 flow
- ❌ FAB 新規追加 (PlanClient header の「+ 教える」継続維持)
- ❌ keyboard navigation (← → でも月送り、Phase 2-A+ 別途検討)
- ❌ Pull-to-refresh / re-fetch UX
- ❌ Anchor density indicator (各 cell の anchor 件数 dot)
- ❌ AneurasyncHome.tsx 内部改変
- ❌ PlanClient の fetch / Modal logic 変更
- ❌ lib/plan/external-anchor-* / lib/plan/anchor-fetch.ts

---

## 11. 自立推論 — Beyond 設計

### 11.1 buildMonthGrid を pure 関数化する根拠

- 月 grid 生成 logic (year/month → 42 cells with edge cases) を component から分離
- deterministic test 可能: 月初日曜 / 月末土曜 / 閏年 2 月 / 12→1 月跨ぎ等
- 将来 Phase 2-A+ で「**週送り** (week navigation)」追加時にも再利用可能 (buildWeekGrid との対称性)

### 11.2 selectedDate 初期値の設計判断

| candidate | 動作 |
|-----------|------|
| 今日 (default) | 起動時に今日選択、最も自然 |
| 月初 1 日 | 月送りごとに 1 日選択、predictable だが不自然 |
| 今月内 today、他月では月初 | 月跨ぎ時の挙動が複雑 |

**推奨**: 今日 (default)、月送りで他月に行ったら selectedDate を維持 (他月の today に相当する日へ移すロジックを入れない)。Mock の挙動と整合。

### 11.3 today / selected の visual overlap

mock では「23 番に紫丸」 → これは today + selected の組合せか、selected (today でなくても紫円) か曖昧。

**設計判断**:
- **selected 状態** = 紫円 (gradient fill、mock 整合)
- **today 状態** = subtle indigo bg + bold 数字 (selected と独立、両立可能)
- → today + selected = 紫円 (selected が支配)、今日が選択中の表示

### 11.4 月送り tap の HomeSwipeContainer 共存設計

- 月 header の ◀ ▶ button は **tap event** で動作 (click handler)
- HomeSwipeContainer の drag は **30% threshold** + velocity 500px/s
- → 普通の tap (drag offset < 5px) では HomeSwipeContainer は反応しない
- → 衝突しない

### 11.5 月跨ぎ recurring anchor の正確性

- `anchorsForDay` は recurring に対して `expandRecurrence` を呼び、`valid_from / valid_until / exception_dates` を全て考慮
- 月 grid 42 cell × recurring N 件で `anchorsForDay` N × 42 回呼ぶ
- 性能: recurring 通常 10-20 件、42 × 20 = 840 呼び出し / 月送り、各呼び出し ms 単位 → 月送り transition は smooth

### 11.6 grid cell の最小 hit area (a11y)

- Mobile: cell 幅 = container幅 / 7 ≈ 50px、高さ ~40px → 最小 hit area 44×44px に近い、a11y OK
- aria-current="date" で screen reader が「現在選択中」を announce
- aria-label で full date 読み上げ

### 11.7 月送り animation (任意、polish)

- framer-motion で 月 grid を slide-in / slide-out 可能
- ただし HomeSwipeContainer も framer-motion を使うため、入れ子の animation context に注意
- 本 wave では shipping 重視で **animation 入れず**、tap 後の content 切替は instant
- Phase 2-A+ で polish 検討

### 11.8 SelectedDaySection の anchor list scroll

- 1 日に anchor が 10 件以上ある場合、SelectedDaySection が長くなる
- 親 `<main>` の `overflow-y-auto` で対応、SelectedDaySection 自体は `flex-1` で flexible height
- 上限 cap (例: "最大 5 件 + 残り N 件は /plan で") は **本 wave で入れない**、実 user の利用パターンを観測後に Phase 2-A+ で検討

### 11.9 Phase 1 で確立した invariant の継承

- Modal swipe lock (Phase 1 C3): 本 wave で新規 modal 追加なし、既存 modal trigger 経路から開く → lock 自動発動
- Pane isolation (PR #214 containing block): 本 wave で CSS 構造変更なし、modal は pane 内に閉じ込まる挙動継続
- displayMode (PR #219 Phase 1 C1): 本 wave で CalendarTab は両 mode 共通、displayMode を CalendarTab に渡さない

---

## 12. CEO 判断点 (本 PR merge 後の実装 wave 起票前)

### 判断 1: Mock 解釈 A vs B

| 選択 | 構造 | 推奨 |
|------|------|------|
| A. Week-in-month (1 週のみ) | 月 header + 1 週 grid + 選択日 anchor | mock 直訳 |
| **B. Full month grid (6×7)** | 月 header + 月 grid + 選択日 anchor | **推奨** (CEO "月ビュー" 整合、Google/iOS pattern) |

### 判断 2: 月送り gesture

- 本 wave: **tap-only** (◀ ▶ button)、推奨
- Phase 2-A+ 後追い: keyboard ← → (HomeSwipeContainer との競合解消後)
- Phase 2-A++: 月内 swipe (HomeSwipeContainer と排他制御)

### 判断 3: Today / Selected の visual treatment

§11.3 推奨案:
- selected = 紫円 gradient fill
- today + not selected = subtle indigo bg + bold

CEO 別案あれば修正可。

### 判断 4: Cell `+` button 削除の是非

- 削除推奨 (mock 整合、cell が小さい)
- SelectedDaySection の「+ この日に予定を追加」で代替
- CEO が cell `+` 維持を希望なら維持可 (cell が窮屈な UI トレードオフ)

### 判断 5: Phase 2-A 後の次フェーズ優先順位

| Phase | 内容 | 着手条件 |
|-------|------|---------|
| **Phase 2-A+** | keyboard nav / 月内 swipe / animation polish | Phase 2-A PASS 後の polish |
| **Phase 2-B** | FlowTab を image thumbnail リスト化 | mock 寄せ、優先度 中 |
| **Phase 2-C** | MapTab Google Maps integration | API key 判断 + 別 design |
| **Phase 3** | 空き日 → ALTER 質問 → 提案 flow | Stargazer / Alter engine 接続 |
| **W1-Z+ cleanup** | Repository fallback path 削除 | apply 後 1 週間観測 |
| **production env 投入** | `PLAN_HOME_SWIPE_ENABLED=true` を production | smoke 完了 + 3 日実用後 |

---

## 13. References

- `app/(culcept)/plan/tabs/CalendarTab.tsx` (本命修正対象)
- `app/(culcept)/plan/tabs/_helpers.ts` (helper 拡張)
- `app/(culcept)/plan/PlanClient.tsx` (parent、本 wave で touch しない)
- `docs/alter-plan-w15-ui-mini-design.md` §2 (CalendarTab 初版設計)
- `docs/alter-plan-w1x3-cell-add-mini-design.md` (現在の cell `+` add 導線、本 wave で削除予定)
- `docs/alter-plan-home-swipe-full-plan-pane-mini-design.md` (Phase 1 設計)
- `docs/alter-plan-home-swipe-full-plan-pane-phase1-complete.md` (Phase 1 完了報告)
- `docs/alter-plan-home-swipe-visual-smoke.md` (smoke runbook、Phase 2-A で更新予定)

---

## 14. 変更履歴

| 日付 | 変更 | 承認 |
|------|------|------|
| 2026-05-20 | Phase 2-A (CalendarTab 月ビュー化) mini design 起票、Phase 1 完全 PASS 後の最初の UI 進化 wave | CEO レビュー待ち |

---

**End of Mini Design**. CEO レビュー → 判断 1-5 → 実装 wave (3 commits) GO/NO-GO 判断をお待ちします。
