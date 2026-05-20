# Alter Plan Phase 2-B — FlowTab リスト画面 Mini Design

**作成日**: 2026-05-20
**Status**: 採択待ち (CEO 承認後、実装 wave に進む)
**branch**: `docs/alter-plan-phase2-b-flow-list-mini-design` (local main から分岐、GitHub suspension 中の local-first 運用)
**実装範囲**: 本 PR は **docs only**。実装は CEO 承認後の別 PR (1 PR / 3 commits)

**前提**:
  - Phase 1 完全 PASS (PR #219 + W1-Z apply 済)
  - **Phase 2-A 実装完了** (`feat/alter-plan-phase2-a-calendar-week-strip` branch、5 commits、CEO local smoke PASS、GitHub 復旧後 push 予定の凍結状態)
  - 本 branch は local main から切り出し、Phase 2-A branch とは完全分離 (CEO 補正、PR 境界保持)

**関連**:
  - `docs/alter-plan-phase2-a-calendar-month-view-mini-design.md` (Phase 2-A mini design、CalendarTab refactor の前例)
  - `docs/alter-plan-home-swipe-full-plan-pane-phase1-complete.md` (Phase 1 完了報告)
  - `app/(culcept)/plan/tabs/FlowTab.tsx` (本命修正対象)
  - `app/(culcept)/plan/tabs/_helpers.ts` (helper、本 wave で軽量拡張)
  - CEO mock スクショ (2026-05-20、「ALTER アプリ構造と画面コンプト（最新案）」)

---

## 0. ゴール (CEO mock 由来)

### CEO スクショから抽出した完成形 (リスト tab)

```
Plan
[カレンダー] [リスト ●] [地図]        ← Phase 2-A の pill segmented tab

4月23日 (木)
─────────────────────
09:30  カフェで仕事             [📷 image]
       スターバックス 代官山店
12:30  ランチ                  [📷 image]
       イタリアン 中目黒
15:00  打ち合わせ              [📷 image]
       ALTER オフィス
19:00  ジム                    [📷 image]
       エニタイムフィットネス

4月24日 (金)                  予定なし >       ← inline、薄字
4月25日 (土)                  予定なし >
4月26日 (日)                  予定なし >

┌─────────────────────────┐
│ 予定のない日をタップすると...  │   ← static card、Phase 3 で動作
│ ┌─────────────────────┐ │
│ │ 4月24日は何する？      │ │  ← Phase 3 で ALTER 提案 flow に接続
│ │ その日のおすすめを提案するね │ │
│ └─────────────────────┘ │
└─────────────────────────┘
                              [+]  FAB (Phase 2-A の CalendarTab と同じ右下紫円)
```

### Phase 2-B 範囲

- **複数日 list 表示** (現 FlowTab の 1 日 timeline → 7 日リスト)
- **各 anchor 行に image thumbnail 右端** (`48-64px` square、本 wave は **locationCategory ベース fallback icon** で実装、実画像 API は将来 wave)
- **予定なし日も list 内に inline 表示** (薄字 1 行、tap で何か = Phase 3 預け)
- **下部に static ALTER 提案 card** (Phase 3 で動作実装、本 wave は visual placeholder のみ)
- **FAB** (Phase 2-A CalendarTab と同じ右下紫円、選択日 prefill or 今日 prefill — CEO 判断)
- /plan 直 URL と Home pane の両方で同一 instance、同一動作

### Phase 2-B で**やらないこと** (CEO 制約遵守)

- ❌ MapTab / Google Maps integration (Phase 2-C)
- ❌ 空き日 → ALTER 質問 → 提案 → 1tap 作成 flow (Phase 3、Stargazer / Alter engine 接続)
- ❌ 実画像 API / 画像生成 / Supabase Storage 連携
- ❌ ExternalAnchor 型に `imageUrl` field 追加 (migration 不要、将来別 wave)
- ❌ CoAlter / Mirror / /talk / D-* / W1-6 / DraftPlan / fallback path
- ❌ Production env / all-Preview env / migration / service_role
- ❌ Phase 2-A branch (`feat/alter-plan-phase2-a-calendar-week-strip`) への混入
- ❌ Phase 2-A 既存 (CalendarTab / FAB / SelectedDay 等) の改修 (本 wave は FlowTab 範囲のみ)

---

## 1. 現在の FlowTab 構造 (read-only audit)

### 1.1 ファイル

| layer | path | 役割 |
|-------|------|------|
| component | `app/(culcept)/plan/tabs/FlowTab.tsx` (241 行) | 主観レンズ (その日を生きる)、1 日 timeline |
| helper | `app/(culcept)/plan/tabs/_helpers.ts` | `anchorsForDay` / `gapMinutes` / `formatGap` / `shouldShowGapAdd` 等を再利用 |
| parent | `PlanClient.tsx` | data fetch、Modal 制御、`onAddRequest` / `onAnchorClick` callback |

### 1.2 現状の表示構造 (W1-5 + W1-X3)

```
<FlowTab>
  ├ 日付セレクタ: [昨日] [今日 ●] [明日]   ← FlowOffset (-1 | 0 | 1)
  ├ ヘッダ: "5月20日 (火)"                ← selected date 表示
  ├ Timeline:
  │   - anchor (時刻 + title + sub)
  │   - anchor 間 gap (30+ 分なら gap badge + W1-X3 "+ 時刻を教える" link)
  │   - last anchor
  ├ Empty 状態: "今日は予定なし" + CTA
  └ Day Footer
</FlowTab>
```

### 1.3 重要な既存資産 (本 wave で再利用)

- `anchorsForDay(anchors, day)` — recurring 展開 + exception_dates + validity すべて含む
- `gapMinutes` / `formatGap` / `shouldShowGapAdd` / `suggestGapStartTime` / `FLOW_GAP_MIN_MINUTES` — Flow gap add 導線 (W1-X3 で確立)
  - **本 wave 取扱い (CEO 補正 #3)**: 新リスト UI では **render しない**。ただし helpers / 既存 test は **削除せず保持**。理由:
    1. 将来 (Phase 2-B+ / Phase 3 / AnchorDetailModal 内) で再利用可能性
    2. 削除すると test が落ち、不必要な test 修正で本 wave の diff が膨らむ
    3. 「視覚的に render しない」と「ロジックを抹消する」は別事象 (irreversibility の原則)
- `formatJpDate(day)` — "M月D日 (曜)" 表示整形
- `formatTime(t)` — "HH:mm" 表示整形
- `WEEKDAY_LABELS` — ["日", "月", "火", ...] (Sun-first)
- props signature: `anchors / now? / onAddRequest? / onAnchorClick?` (Phase 2-A の CalendarTab と共通)

### 1.4 ExternalAnchor 型 (image thumbnail field の現状)

```ts
// lib/plan/external-anchor.ts (確認済)
interface ExternalAnchorBase {
  id, userId, title, startTime, endTime?, locationText?, locationCategory?,
  rigidity, sourceId, confirmedAt, confidence?, sensitiveCategory?
}
// + OneOff: { anchorKind: "one_off", date }
// + Recurring: { anchorKind: "recurring", validFrom, recurrenceRule, validUntil?, exceptionDates? }
```

→ **`imageUrl` field なし**。本 wave で migration 追加もしない (CEO 制約)。
→ Image strategy は §4 で「locationCategory ベース fallback icon」で実装。

---

## 2. CEO mock との差分

| 項目 | 現状 (W1-5 + W1-X3 FlowTab) | CEO mock (リスト) | 差分種別 |
|------|---------|-----------|----------|
| **表示日数** | 1 日固定 (-1/0/+1 切替) | **7 日リスト** (連続表示) | **構造 refactor** |
| **各日の表示形式** | timeline (時刻順 + gap) | section header + anchor list | **構造変更** |
| **anchor 行** | 時刻 + title + sub | **時刻 + title + sub + 右端 image thumbnail** | **追加 column** |
| **予定なし日** | "今日は予定なし" 中央表示 | **inline 1 行**「X月Y日 (曜) 予定なし >」薄字 | **layout 変更** |
| **anchor 間 gap** | gap badge + W1-X3 "+ 時刻を教える" link | (mock 未表示) | **視覚的に置換** (新リスト UI で render しない、helpers は保持、§1.3 / CEO 補正 #3) |
| **下部 ALTER 提案 card** | (なし) | **static card**「予定のない日をタップすると...」+ "4月24日は何する？" button | **新規追加 (static)** |
| **FAB** | (なし) | **右下 紫 gradient FAB** (Phase 2-A 既存と同じ視覚) | **新規追加** |
| **日付セレクタ (昨日/今日/明日)** | あり | なし (week-list で日付明示) | **削除** |

---

## 3. リスト画面の情報設計

### 3.1 表示範囲

候補 (CEO 判断):

| 候補 | 範囲 | Pro | Con |
|------|------|-----|-----|
| **A. 今後 7 日** (今日含む) | today, +1, ..., +6 | 「これから」focus、未来志向 | 過去 anchor 見えない |
| B. 当週 7 日 (Sun-Sat) | 当週日曜 〜 当週土曜 | カレンダー的、Phase 2-A の Week Strip と整合 | 過去半週見える、今後 7+ 日見えない |
| C. selectedDate ± 3 日 | -3 〜 +3 | 中央 = 選択日、context 良 | scroll 動作が独特、初期表示が不自然 |
| D. 今日 + 今後 N 日 + 過去 N 日 | -7 〜 +14 等 | 多日数表示 | scroll 多い、render コスト |

**推奨**: **A (今後 7 日)**。リスト画面の目的は「これから何があるか」の把握、過去は Calendar tab で確認可能。

### 3.2 各日 section の構成

```tsx
<section data-testid="plan-flow-day-{iso}" aria-label={sectionAriaLabel}>
  {/* sticky header: scroll しても日付見出しが top に残る */}
  <header className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm px-4 py-2 flex items-baseline justify-between border-b border-slate-100">
    <h3 className="text-sm font-semibold">
      <span className={dayLabelTone /* 今日=indigo / 日曜=red-500 / 土曜=blue-500 / それ以外=slate-900 */}>
        {formatFlowSectionLabel(day, today)  /* "今日 · 5月20日(火)" / "明日 · 5月21日(水)" / "5月22日(木)" */}
      </span>
      {anchorCount > 0 && (
        <span className="ml-2 text-xs font-normal text-slate-400">{anchorCount} 件</span>
      )}
    </h3>

    {/* 予定なし日: header 右端に inline tap target (44pt min、AddAnchorModal date prefill) */}
    {anchorCount === 0 && (
      <button
        type="button"
        onClick={() => onAddRequest?.({
          initial: { kind: "one_off", date: isoDate(day) },
          subtitle: `リスト / ${formatJpDate(day)} から`,
        })}
        className="text-xs text-slate-400 hover:text-slate-600 px-3 py-2 -my-2 -mr-2 rounded-md hover:bg-slate-50 transition-colors min-h-[44px] inline-flex items-center"
        aria-label={`${formatJpDate(day)} に予定を追加`}
      >
        予定なし ›
      </button>
    )}
  </header>

  {/* 予定あり日: anchor list */}
  {anchorCount > 0 && (
    <ul className="flex flex-col gap-2 px-4 py-3">
      {anchors.map(anchor => <AnchorRow key={anchor.id} anchor={anchor} onClick={onAnchorClick} />)}
    </ul>
  )}
</section>
```

#### 設計判断 (Beyond / 世界トップアプリ pattern)

| 要素 | 採用理由 | 参考 |
|------|------|------|
| **sticky header** (`position: sticky; top: 0`) | scroll しても日付見出しが top に残る、7 日 list で orientation を失わない | iOS Reminders / Apple Calendar List / Things 3 / Linear inbox |
| **anchor count badge** (`3 件` 小さく) | quick scan、空き状況を一目把握 | Google Calendar Schedule (件数表示) |
| **dayLabelTone** (今日=indigo / 日曜=red / 土曜=blue / 平日=slate) | 日本ロケール標準 (Phase 2-A WeekdayLabels と整合) | iOS Calendar JP / Google Calendar JP |
| **inline 予定なし button** (header 右、min-h-[44px]) | CEO 補正 #1: tap で既存 AddAnchorModal date prefill、44pt 最小 (Apple HIG) | Apple HIG Touch Targets |
| **backdrop-blur-sm** + `bg-white/95` | sticky 時に下層 anchor が透けて見えても可読性 | Apple Calendar / iOS Mail thread dates |

### 3.3 AnchorRow (mock 整合)

```
[時刻]  [title]                    [thumbnail]
        [locationText (sub)]
```

- 時刻: `text-sm font-mono text-indigo-700`、左 column 固定幅
- title: `text-base font-medium text-slate-900`、main
- locationText: `text-xs text-slate-500`、sub、optional
- thumbnail: 右端、`48 × 48` or `56 × 56` rounded-xl、`flex-shrink-0`
- 行 padding: `p-3`、border `border-slate-100`、rounded-2xl
- hover/focus 効果: `hover:border-indigo-300 hover:shadow-sm`
- clickable: `role="button"` + `tabIndex=0` + Enter/Space (W1-X5 既存挙動継承)
- tap で `onAnchorClick(anchor)` → AnchorDetailModal 起動

### 3.4 下部 ALTER 提案 card (static placeholder、CEO 補正 #2 — ボタン風にしすぎない)

```tsx
{/*
  CEO 補正 #2: 静的 placeholder、ボタン風 styling 禁止。
  - hover/active 効果なし
  - elevation (shadow-md 以上) なし
  - cursor:pointer なし (cursor:default)
  - tabIndex なし (focus 取らない、Tab navigation skip)
  - role="region" + aria-label で screen reader にも "提案 (今後実装予定)" を明示
  - 視覚は「ALTER が何かを語りかける兆し」程度のニュアンス、tap 想起を作らない
*/}
<section
  role="region"
  aria-label="ALTER 提案 (今後の機能、Phase 3 で実装予定)"
  className="mx-4 my-6 rounded-2xl bg-gradient-to-br from-indigo-50/60 to-purple-50/60 p-4 select-none"
  style={{ cursor: "default" }}
>
  <p className="text-xs text-slate-500 mb-3 italic">
    予定のない日には、ALTER が提案を置きにくる予定です
  </p>

  {/* 内側の「カード風」要素も静的、ボタン感を抑制 */}
  <div className="rounded-xl bg-white/70 px-4 py-3 border border-slate-100">
    <p className="text-sm text-slate-700">
      {firstEmptyDayLabel} は何する？
    </p>
    <p className="text-xs text-slate-400 mt-1">
      (Phase 3 で動作予定 — 今は説明だけ)
    </p>
  </div>
</section>
```

#### CEO 補正 #2 の遵守 checklist

| 項目 | NG (ボタン風) | OK (静的) |
|------|------|------|
| 外側 wrapper | `<button>` / `cursor-pointer` / `hover:shadow-md` | `<section>` / `cursor:default` / hover 効果なし |
| 内側 card | `shadow-sm` + `hover:shadow-md` | `border` のみ、shadow なし |
| 文言 | "提案を見る →" "タップで開始" | "ALTER が提案を置きにくる予定" "Phase 3 で動作予定" |
| Tab navigation | `tabIndex={0}` で focus 取る | tabIndex なし (focus skip) |
| ARIA | `role="button"` | `role="region"` (情報 region) |
| Animation | `transition`, `motion.div` | static、animation なし |
| Opacity | full | gradient を `/60` で薄める、より控えめ |

#### Card 内容

- `firstEmptyDayLabel`: 7 日 list 内の最初の「予定なし」日 (mock では「4月24日」)
- 全日に予定あり → card 非表示
- tap 動作:
  - **本 wave**: 何も起きない。視覚的にも click 可能と感じさせない。
  - **Phase 3 (将来 wave)**: ALTER 提案 flow 起動 — その時に**初めて button-like styling に切り替える**。本 wave は不可。

### 3.5 FAB (Phase 2-A CalendarTab と同等)

```tsx
<button
  fixed bottom-20 right-6 z-30
  bg-gradient-to-br from-indigo-500 to-purple-500
  w-14 h-14 rounded-full
  aria-label={prefill 用日付ラベル}
  onClick={handleAddForFAB}
>+</button>
```

`handleAddForFAB` の prefill 戦略 (CEO 判断):

| 候補 | prefill date | Pro | Con |
|------|-------------|-----|-----|
| **A. 今日 prefill** | today | シンプル、state 不要 | mock の FAB context が不明確 |
| B. FlowTab に selectedDate state を持つ | user 選択 | Phase 2-A CalendarTab と対称 | state 二重管理 |
| C. PlanClient に selectedDate state lift up | 両 tab 共有 | 統一感最大 | Phase 2-A の touch 必要 (CalendarTab を変更) |

**推奨**: **A (今日 prefill)**。Phase 2-B では FlowTab に selectedDate state を持たない (リスト 7 日全表示なので selected の概念希薄)。FAB は今日 prefill、user は modal 内で日付を変更可能。

---

## 4. Image thumbnail の扱い

### 4.1 設計原則

- 本 wave で **実画像なし** (CEO 制約)
- ExternalAnchor 型に `imageUrl` field 追加しない (migration 不要)
- **locationCategory ベース fallback icon** を実装
- 将来 anchor に画像を持たせる時 (別 wave) に switch しやすい構造

### 4.2 locationCategory → icon mapping

既存 `categoryOf(anchor)` (locationCategory を含む) + `CATEGORY_META[cat].emoji` を利用:

```ts
// _helpers.ts (既存)
CATEGORY_META["cafe"]    = { label: "カフェ", emoji: "☕", ... }
CATEGORY_META["office"]  = { label: "職場", emoji: "🏢", ... }
CATEGORY_META["school"]  = { label: "学校", emoji: "🎓", ... }
CATEGORY_META["outdoor"] = { label: "屋外", emoji: "🌿", ... }
CATEGORY_META["public"]  = { label: "公共", emoji: "🏛", ... }
CATEGORY_META["transit"] = { label: "移動", emoji: "🚃", ... }
CATEGORY_META["home"]    = { label: "家", emoji: "🏠", ... }
CATEGORY_META["unknown"] = { label: "未分類", emoji: "📍", ... }
CATEGORY_META["none"]    = { label: "場所なし", emoji: "·", ... }
```

→ 各 anchor の thumbnail = `CATEGORY_META[categoryOf(anchor)].emoji` を中央配置した灰色 rounded-xl square。

### 4.3 Thumbnail コンポーネント設計

```tsx
function AnchorThumbnail({ anchor }: { anchor: ExternalAnchor }) {
  const cat = categoryOf(anchor);
  const meta = CATEGORY_META[cat];
  return (
    <div
      className="w-14 h-14 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0"
      aria-label={`カテゴリ: ${meta.label}`}
      role="img"
    >
      <span className="text-2xl">{meta.emoji}</span>
    </div>
  );
}
```

将来拡張:
- `anchor.imageUrl` field (別 migration wave) を追加した時、AnchorThumbnail を `imageUrl` 優先 → fallback の emoji の順に書き換えるだけ
- Supabase Storage / S3 等の実画像も同 component で 1 行追加

### 4.4 Sensitive category の扱い

`sensitiveCategory` (`medical` / `legal` / `exam` / `other`) は **fallback icon 表示せず**、灰色 square + 「🔒」など generic icon にする (privacy 配慮)。

```ts
if (anchor.sensitiveCategory) {
  return <SensitiveThumbnail />;  // 🔒 generic icon、内容を visual に晒さない
}
```

---

## 5. Anchor row click → detail modal 既存導線維持

- 各 AnchorRow は `onClick={() => onAnchorClick(anchor)}` で AnchorDetailModal 起動
- W1-X5 既存挙動継承: `role="button"` + `tabIndex=0` + Enter/Space 対応 + `aria-label="<title> の詳細を見る"`
- PlanClient の `openDetail` → `AnchorDetailModal` (Modal lock 自動発火、Phase 1 C3)

→ **本 wave で AnchorDetailModal / EditAnchorModal / Modal lock 全て不変**。

---

## 6. + 教える / FAB / date prefill 関係

### 6.1 導線整理

| 場所 | 状態 | 用途 |
|------|------|------|
| PlanClient header「+ 教える」 | 継続 (両 mode) | route mode で primary entry |
| FlowTab FAB (Phase 2-B 新規) | **追加** (mock 整合) | 主要 entry on mobile (今日 prefill) |
| 旧 W1-X3 gap add link | **視覚的に非表示** (CEO 補正 #3: 新リスト UI で render しない、helpers は保持) | timeline 廃止に伴う UI 移行 |
| 「予定なし ›」inline (各日 header 右) | **AddAnchorModal を date prefill で起動** (CEO 補正 #1) | Phase 3 ALTER 提案 flow ではなく、既存追加導線の流用 |
| ALTER 提案 card 全体 | **静的 placeholder、tap 不可** (CEO 補正 #2) | Phase 3 で動作実装、本 wave は視覚的 placeholder のみ |

### 6.2 prefill 戦略 (FAB 用)

§3.5 で議論済、推奨 **A (今日 prefill)**。

```ts
const handleAddForFAB = () => {
  const todayIso = isoDate(utcMidnight(baseNow));
  onAddRequest?.({
    initial: { kind: "one_off", date: todayIso },
    subtitle: `リスト / ${formatJpDate(baseNow)} から`,
  });
};
```

### 6.3 Phase 2-A CalendarTab FAB との重複

- Phase 2-A: CalendarTab 内に FAB (selectedDate prefill)
- Phase 2-B (本 wave): FlowTab 内に FAB (今日 prefill)
- → tab 切替で **どちらか 1 つだけ visible** (両 tab の component が conditional render される)
- mock 整合: 両 tab で同視覚の FAB が「現れる」のは UX として一貫性高い

### 6.4 「予定なし ›」 inline handler の code snippet (CEO 補正 #1)

```ts
// FlowTab.tsx (擬似 code)
const handleEmptyDayClick = useCallback((day: Date) => {
  onAddRequest?.({
    initial: { kind: "one_off", date: isoDate(day) },
    subtitle: `リスト / ${formatJpDate(day)} から`,
  });
}, [onAddRequest]);
```

**動作要件**:
- `kind: "one_off"` — one-off anchor として作成 (recurring 起票は別 entry)
- `date: isoDate(day)` — 該当日の UTC midnight を ISO 文字列化、AddAnchorModal の date input prefill 値
- `subtitle` — modal 内 context 表示 ("リスト / 5月22日(木) から") で entry source 透明性
- **Phase 3 預けの ALTER 提案 flow とは無関係** (既存 AddAnchorModal の date prefill 機能だけを流用)

**AddAnchorModal 側の前提**:
- `subtitle` prop は既存 (W1-X3 で導入済)
- `initial.date` prop は既存 (`AddAnchorPayload.initial.date`)
- → C2 実装で AddAnchorModal の signature 変更不要 (既存 API のまま使う、本 wave で AddAnchorModal は不可触)

---

## 7. Home swipe / scroll / modal lock 干渉対策

### 7.1 Home swipe (HomeSwipeContainer) との関係

- FlowTab は縦に長い list (7 日 × 数 anchor) → 縦 scroll
- HomeSwipeContainer は X 軸 dragDirectionLock (Phase 1 C1)
- → 衝突なし (CalendarTab と同 pattern)

### 7.2 Modal lock (Phase 1 C3) との関係

- AnchorDetailModal / AddAnchorModal (FAB → 起動) 開時は HomeSwipeContainer drag disable (既存)
- 本 wave で追加 modal なし、新規 lock 不要

### 7.3 ALTER 提案 card の tap → Modal? (Phase 2-B 範囲)

- 本 wave: tap で何も起きない (static placeholder)
- Phase 3: ALTER 質問 → 提案 → AddAnchorModal 起動 (実装は別 wave)
- → 本 wave では Modal lock 影響なし

### 7.4 Today (今日) section の highlight

- 7 日 list の最初 = 今日 → 視覚的 highlight (mock では明示なしだが UX 向上)
- header に subtle indigo bg or "今日" badge
- 採用判断 CEO

---

## 8. Commit 階段 (実装 wave 用、本 PR では実装しない)

### C1: list helpers + thumbnail helper + tests

**Files**:
- `app/(culcept)/plan/tabs/_helpers.ts` (additive only)
  - 新規 `buildFlowDateRange(now: Date, count: number = 7): Date[]` — 今日含む N 日の UTC midnight 配列
  - 新規 `formatFlowSectionLabel(day: Date, today: Date): string` — "今日 · 5月20日(火)" / "明日 · 5月21日(水)" / "5月22日(木)"
  - 新規 `weekdayTone(day: Date): "today" | "sunday" | "saturday" | "weekday"` — section header の色味 selector (UI Tailwind class mapping は FlowTab 側、helper は pure な分類のみ)
  - 既存 `gapMinutes` / `formatGap` / `shouldShowGapAdd` / `suggestGapStartTime` / `FLOW_GAP_MIN_MINUTES` は **削除しない** (CEO 補正 #3、§1.3)
- `tests/unit/plan/flowListHelpers.test.ts` (新規)
  - `buildFlowDateRange` の境界 (年跨ぎ / 月末跨ぎ / count=7 default / count=14 オプション)
  - `formatFlowSectionLabel` の "今日" / "明日" 判定 + 通常日 + 年跨ぎ
  - `weekdayTone` の 4 分岐 (今日優先 → 日曜 → 土曜 → 平日)

→ **AnchorThumbnail は C2 で FlowTab 内 internal component** (`_AnchorThumbnail.tsx` 分離はせず、FlowTab.tsx 内に小さい closure 関数 or 同 file 内 const として持つ — Phase 2-A の Cell pattern と同様)。理由: thumbnail は FlowTab specific、reuse 想定なし、file 分散を避ける。

### C2: FlowTab を 7 日リスト + AnchorThumbnail + 静的 ALTER card + FAB に refactor

**Files**:
- `app/(culcept)/plan/tabs/FlowTab.tsx` — refactor (241 行 → 推定 300-360 行)
  - 旧 timeline (FlowOffset -1/0/+1 切替) を削除
  - 旧 W1-X3 gap add link を render しない (helpers は呼ばない、§1.3 / CEO 補正 #3)
  - 7 日 list (sticky date section + anchor list + empty inline `予定なし ›` button)
  - **「予定なし ›」 button の onClick = AddAnchorModal date prefill** (CEO 補正 #1、§6.4)
  - AnchorThumbnail (locationCategory ベース、sensitive 配慮)
  - 下部 **静的** ALTER 提案 card (CEO 補正 #2、§3.4 — ボタン風 styling 禁止)
  - FAB (Phase 2-A 同パターン、今日 prefill)
  - `data-testid` 整備 (`plan-flow-section-{iso}` / `plan-flow-anchor-{id}` / `plan-flow-empty-{iso}` / `plan-flow-static-alter-card`)

### C3: visual polish + smoke docs 更新

**Files**:
- `app/(culcept)/plan/tabs/FlowTab.tsx` — micro polish (sticky header backdrop-blur / hover transitions / focus ring)
- `docs/alter-plan-home-swipe-visual-smoke.md` — Phase 2-B 追加 smoke check (新リスト UI 確認項目)

---

## 9. Smoke 項目 (実装 wave 用)

### 9.1 /plan route (route mode)

- [ ] /plan 直 URL で 3 tab 表示 (カレンダー / リスト / 地図)
- [ ] "リスト" tab tap → 7 日 list 表示
- [ ] 各日 section header "X月Y日 (曜)" 表示
- [ ] 予定あり日: anchor list (時刻 + title + sub + 右端 thumbnail)
- [ ] 予定なし日: header に "予定なし >" 薄字
- [ ] 下部 static ALTER 提案 card (最初の予定なし日を参照、全日予定あり → 非表示)
- [ ] FAB 右下に紫 gradient 56px circle 表示

### 9.2 Thumbnail (locationCategory based)

- [ ] locationCategory=cafe → ☕ icon
- [ ] locationCategory=office → 🏢 icon
- [ ] locationCategory=outdoor → 🌿 icon
- [ ] locationCategory なし → 灰色 square + 「·」 (none)
- [ ] sensitiveCategory 設定済 → 🔒 generic icon (privacy 配慮)

### 9.3 Click 動作

- [ ] anchor row tap → AnchorDetailModal 起動 (W1-X5 既存)
- [ ] FAB tap → AddAnchorModal 起動、date=今日 prefill (`subtitle="リスト / <今日> から"`)
- [ ] 「予定なし ›」 tap → **AddAnchorModal 起動、date=該当日 prefill** (CEO 補正 #1、§6.4)
  - 例: "5月22日(木)" 行の "予定なし ›" → AddAnchorModal で date=2026-05-22, subtitle="リスト / 5月22日(木) から"
- [ ] ALTER 提案 card tap → **何も起きない** (CEO 補正 #2、§3.4 — 静的 placeholder、cursor:default、tabIndex なし)
  - DevTools で確認: card に `onClick` / `cursor:pointer` / `:hover` shadow が無いこと
- [ ] 旧 W1-X3 gap add link → **画面上に存在しない** (helpers は code-level で残るが UI render 0、§1.3 / CEO 補正 #3)

### 9.4 Home pane 統合 (pane mode)

- [ ] Home → 左 swipe → Plan pane → リスト tab tap → 同 UI
- [ ] FAB が pane 内 (Phase 1 PR #214 containing block で閉じ込め) で右下表示
- [ ] FAB / anchor row tap → Modal 起動、Modal 開時 swipe disable (Phase 1 C3)

### 9.5 Recurring + exception_dates + validity

- [ ] FREQ=WEEKLY recurring anchor が当週同曜日に表示
- [ ] FREQ=DAILY recurring anchor が 7 日全日に表示
- [ ] exception_dates 適用 (除外日は anchor 非表示)
- [ ] valid_until 後の日は anchor 非表示

### 9.6 Network / Console

- [ ] Network `aljavfujeqcwnqryjmhl` (Production) のみ、`hjcrvndumgiovyfdacwc` (Alter staging) 0 hit
- [ ] Network `/api/coalter` / `/api/talk` → 0 hit
- [ ] Console `[Mirror]` / `[CoAlter]` → 0 error

---

## 10. やらないこと (制約再宣言)

### CEO 補正による制約 (Phase 2-A 通算)

- ❌ CoAlter / Mirror / /talk / D-* 関連
- ❌ MapTab / Google Maps integration (Phase 2-C 預け)
- ❌ Production env / all-Preview env 変更
- ❌ migration 追加
- ❌ service_role / DB password / connection string 使用
- ❌ DraftPlan generator / W1-6 passive drift logging
- ❌ W1-Z+ cleanup (apply 後 1 週間観測、別 wave)
- ❌ fallback path 削除
- ❌ **Phase 2-A branch (`feat/alter-plan-phase2-a-calendar-week-strip`) への混入**

### Phase 2-B で自重するもの (Phase 3 / 別 wave 預け)

- ❌ ALTER 提案 flow 実装 (空き日 → 質問 → おすすめ → 1tap 作成) — Phase 3
- ❌ 実画像生成 / API / Supabase Storage 連携 — 別 wave
- ❌ ExternalAnchor 型に `imageUrl` field 追加 (migration) — 別 wave
- ❌ Sensitive category の細分化処理 — 既存 categoryOf を使用
- ❌ FlowTab に selectedDate state を持つ設計 (本 wave は今日 prefill で完結)
- ❌ Phase 2-A の CalendarTab / FAB / SelectedDay の改修
- ❌ HomeSwipeContainer / PlanClient / Modal logic 変更 (CalendarTab refactor と同パターン)
- ❌ AnchorRow の編集 UI (タップで edit) — 既存 onAnchorClick (AnchorDetailModal 経由) を維持
- ❌ 過去 anchor 表示 (現在 today 含む今後 7 日のみ)
- ❌ infinite scroll / pagination (固定 7 日)
- ❌ Long-press による quick action menu (Phase 2-B+ 預け、§11.13)
- ❌ AddAnchorModal の signature 変更 (既存 `subtitle` / `initial.date` を使うだけ、AddAnchorModal 自体は不可触)

### Phase 2-B で **削除しない** もの (irreversibility 原則、CEO 補正 #3)

- ✅ `gapMinutes` / `formatGap` / `shouldShowGapAdd` / `suggestGapStartTime` / `FLOW_GAP_MIN_MINUTES` helpers — **保持** (新 UI で render しないだけ)
- ✅ 既存 helper の test — **保持** (落ちる原因にならない)
- ✅ `docs/alter-plan-w1x3-cell-add-mini-design.md` — **保持** (過去仕様の記録、Phase 3 で再利用可能性)
- ✅ Phase 2-A の `_helpers.ts` 月 helpers (`getMonthStart` 等) — **不触** (Phase 2-A の API を変えない)

---

## 11. 自立推論 — Beyond 設計 (世界トップアプリレベル)

### 11.1 「今後 7 日」固定 vs scroll-based infinite list

mock は 7 日程度の表示。アプリ標準:
- Apple Calendar List view: 数か月分 infinite scroll
- Google Calendar Schedule view: 同上
- Linear / Cron / Notion Calendar: agenda 形式、scroll で +∞

**Phase 2-B 採用**: 7 日固定 (mock 整合 + 実装最小)。将来 Phase 2-B+ で「もっと見る」button を末尾追加 → 7 日 chunk で expand (CSS list virtualization 不要)。

### 11.2 Thumbnail を image にしない設計判断

実画像を持たない理由:
- ExternalAnchor 型に `imageUrl` field なし
- 画像生成は AI 推論 cost / Supabase Storage / 著作権 issue 多発
- mock の image は "category 視覚化" 程度の見せ方

→ **emoji-based fallback icon** で十分。CEO mock の意図 (anchor を category で一目区別) を達成。将来実画像 wave で easy switch。

### 11.3 Sensitive category の privacy 配慮

medical / legal / exam / other は **画像で内容を晒さない** (例: 病院 = 🏥 icon にすると "通院" 含意が漏れる)。
→ `sensitiveCategory` 設定済 anchor は generic 🔒 icon に統一。詳細は AnchorDetailModal でのみ表示。

### 11.4 ALTER 提案 card の position と placeholder 戦略

mock は list 末尾に card。これは 7 日 list の overview 後に「予定なし日 → ALTER に相談する」誘導の意図。

- 本 wave: visual placeholder のみ、tap で何も起きない
- 「Phase 3 で実装予定」と aria-label or subtle hint で示す
- 全日予定あり → card 非表示 (誘導不要)

### 11.5 7 日 list の today / 曜日色の locale 標準

mock では明示なしだが、日本ロケール標準として section header の色味を 4 分類:

| 種別 | tone | Tailwind | 根拠 |
|------|------|------|------|
| **今日** | indigo (primary) | `text-indigo-700 font-semibold` | UX 強調、Phase 2-A CalendarTab Today button と整合 |
| **日曜** | red (休日色) | `text-red-500` | iOS Calendar JP / Google Calendar JP 標準、日本カレンダー文化 |
| **土曜** | blue (週末色) | `text-blue-500` | 同上 |
| **平日** | slate (中立) | `text-slate-900` | デフォルト |

加えて **"今日" prefix** ("今日 · 5月20日(火)") を section label に明示 → quick scan で今日を瞬時に識別。明日は **"明日 · ..."** prefix。day index ≥ 2 は通常 label のみ。

これは `formatFlowSectionLabel(day, today)` helper で表現 (§8 C1)。

### 11.6 Phase 2-A の FAB と context 整合

両 tab で同視覚の FAB が「現れる」UX:
- Phase 2-A CalendarTab: selectedDate prefill (mock 整合度高い)
- Phase 2-B FlowTab: 今日 prefill (シンプル)

将来 Phase 2-B+ で context-aware prefill (scroll 位置の date を読む) を検討可能。

### 11.7 prefers-reduced-motion 対応

list は scroll、animation 不要。Phase 2-A の月送り animation のような fancy transition なし。

### 11.8 a11y

- 各日 section: `<section aria-label="X月Y日">` で screen reader 区別
- anchor row: `role="button"` + Enter/Space (既存)
- thumbnail: `role="img" aria-label="カテゴリ: <name>"` (既存 emoji を意味化)
- FAB: `aria-label="予定を追加 (今日)"`
- ALTER card: `role="region" aria-label="提案 (Phase 3 で実装予定)"`

### 11.9 世界トップアプリ pattern 比較

| 機能 | Apple Calendar (List) | Google Calendar (Schedule) | Notion Calendar | Aneurasync Phase 2-B |
|------|--------------|--------------|--------------|----------------------|
| 表示単位 | infinite scroll | infinite scroll | day blocks | **7 日固定 (Phase 2-B+ で expand)** |
| Thumbnail | (なし) | (なし、color dot) | event color | **category emoji (privacy 配慮)** |
| Empty day | 非表示 | 非表示 | (なし) | **inline 1 行 + tap で AddAnchorModal** (Aneurasync unique) |
| FAB add | あり (右下) | あり | あり | **あり (今日 prefill)** |
| Today highlight | subtle | bold | bold | **prefix "今日 ·" + indigo color + sticky** |
| Sticky day header | あり (small) | あり | (day card) | **あり (`backdrop-blur` で可読性)** |
| 曜日色 (日/土) | iOS 標準 | あり | (テーマ依存) | **日=red / 土=blue (JP 標準)** |
| Day count badge | (なし) | あり | あり | **あり (`X 件` 小さく)** |

→ Aneurasync の **empty day inline + 静的 ALTER 提案 card** は world unique、Phase 3 の「ALTER が空き日を埋める提案」flow の起点。本 wave では **empty day tap が既に AddAnchorModal を起動する** ことで Phase 3 を待たずに最小機能が成立する。

### 11.10 Empty day を **「隠さない」** 設計哲学 (Aneurasync unique)

主要 calendar app は empty day を **非表示** にする (Apple Calendar / Google Calendar / Fantastical 等):
- 思想: 「予定がない = 表示する情報がない」 → UI から除外
- 副作用: ユーザは「今週の空き」を意識しにくい、自分の時間の量に無自覚

Aneurasync は **逆の選択**:
- 思想: 「予定がない日 = ALTER と未来を相談できる場所」「自分の時間が見える状態を維持する」
- 表示: `予定なし ›` を薄字 inline 1 行で 1 日ずつ並べる、空白の連なりが「ある」ことを visual に提示
- tap 動作: 既存 AddAnchorModal date prefill (本 wave) → Phase 3 で ALTER 提案 flow に進化
- 結果: ユーザは「埋めるべき焦り」ではなく「開かれた未来」を見る

これは Heart Dynamics Model の「未来 = generative space」哲学と整合 (memory: `heart-dynamics-model-v1.md`、time 構造: 気候 + 季節 + 天気)。

### 11.11 Sticky section header — orientation 維持の必須要素

7 日 list で anchor 数が増えると、scroll 中に「今どの日を見ているか」がわからなくなる。

**業界 pattern**:
- iOS Reminders: sticky section header (リスト名)、scroll 中に top に張り付く
- Apple Calendar List: sticky day header
- Things 3: sticky section + soft fade transition
- Linear inbox: sticky day header + filter chip
- Notion: sticky page title
- 共通要素: `position: sticky; top: 0;` + `backdrop-blur` で下層 anchor が透けて見えても可読性確保

**Phase 2-B 採用**: `sticky top-0 z-10 bg-white/95 backdrop-blur-sm`。`z-10` で AnchorRow を覆い、`backdrop-blur-sm` で下層が薄く透ける。

### 11.12 Anchor count badge — quick scan 補助

各 section header に `3 件` 等の anchor 数表示。

**Pro**: scroll せず「今日は何個ある」が一目で分かる
**Con**: visual noise の増加

→ 採用、ただし `text-xs font-normal text-slate-400` で控えめに。予定なし日は count 表示しない (代わりに `予定なし ›` button)。

### 11.13 Touch target 44pt 最小 — Apple HIG / Material Design 準拠

Mobile UI の必須:
- Apple HIG: **44 × 44 pt** 最小 (https://developer.apple.com/design/human-interface-guidelines/accessibility)
- Material Design 3: 48 × 48 dp 推奨
- WCAG 2.5.5: Target Size minimum 24 × 24 CSS pixels (AA)、44 × 44 (AAA)

**Phase 2-B 採用**:
- AnchorRow: padding `p-3` (12px) + 内容 → 48px+ 縦
- `予定なし ›` button: `min-h-[44px] px-3 py-2 -my-2 -mr-2` (negative margin で visual size を絞りつつ tap area は確保)
- FAB: `w-14 h-14` = 56px (default `text-3xl` SVG 中央)
- ALTER 提案 card: tap target ではない (静的、tabIndex なし)

### 11.14 Long-press による quick actions — Phase 2-B+ 預け

iOS Mail / Things 3 / Linear 等で long-press で peek/preview / quick edit menu が出る。Phase 2-B は採用しない:
- 実装複雑度高い (Touch events / pointer events / 既存 framer-motion drag との衝突)
- mobile only、desktop equivalent (right-click) は別実装
- 本 wave スコープ外、Phase 2-B+ で検討

→ 本 wave は **tap → AnchorDetailModal、それ以上のジェスチャは無し** で完結。シンプル原則。

### 11.15 Reduced motion / Accessibility

- list は scroll のみ、月送り animation のような transition は無し
- `prefers-reduced-motion` でも変化なし (もとから animation 控えめ)
- screen reader:
  - `<section aria-label="5月20日(火) · 今日">` で日の context を明示
  - `<button aria-label="5月22日(木) に予定を追加">` で empty day tap の意味を明示
  - `<div role="region" aria-label="ALTER 提案 (今後の機能)">` で static card の文脈を明示
  - AnchorThumbnail は `role="img" aria-label="カテゴリ: <name>"` で emoji を意味化

### 11.16 Subtle vs strong UI — Aneurasync trust 構築のための restraint

Calendar app は色が多くなりがち (Google Calendar の色付き event 等)。Aneurasync は restraint を選ぶ:
- 色: indigo / slate / 日曜の red / 土曜の blue のみ、AnchorRow は border-slate-100 と low contrast
- shadow: anchor hover/focus でのみ subtle に出現
- typography: font-mono の時刻 + font-medium の title、weight 強調は最小限
- 静的 ALTER card は gradient を `/60` で薄める、注意を引きすぎない

これは Aneurasync 哲学「第二の自己として必要か?」「整合性と世界観を優先」に沿う。

---

## 12. CEO 判断点 (本 PR merge 後の実装 wave 起票前)

### 判断 1: 表示範囲 (§3.1)

- A. **今後 7 日** (今日含む) ← 推奨
- B. 当週 7 日 (Sun-Sat)
- C. selectedDate ± 3 日
- D. 今日 + 今後 N 日 + 過去 N 日

### 判断 2: FAB の prefill (§3.5)

- A. **今日 prefill** ← 推奨 (state 不要、シンプル)
- B. FlowTab に selectedDate state を持つ
- C. PlanClient に selectedDate state lift up (Phase 2-A touch 必要)

### 判断 3: ALTER 提案 card の tap 動作 (§3.4、§6.1) — **CEO 補正 #2 で確定**

- **A. 本 wave: tap 完全無効、ボタン風 styling 禁止 (静的 placeholder) ← 確定** (CEO 補正 #2)
- B. ~~tap で「Phase 3 で実装予定」alert~~ (boton 想起を作るため不採用)
- C. ~~tap で AddAnchorModal を起動~~ (空き日 → ALTER 体験を取り違える、Phase 3 接続点を曖昧にする)

### 判断 4: Today section の visual highlight (§11.5、§3.2 で確定済)

- **A. prefix "今日 ·" + `text-indigo-700 font-semibold` + 日曜/土曜の locale color + sticky header ← 推奨** (Beyond で強化)
- B. "今日" badge (small) のみ
- C. なし (mock 直訳、UX 弱い)

### 判断 5: 「予定なし」inline の tap 動作 (§6.1、§6.4) — **CEO 補正 #1 で確定**

- A. ~~本 wave: tap 無効 (static)~~ (旧推奨、CEO 補正で却下)
- **B. tap で AddAnchorModal を起動、date=該当日 prefill ← 確定** (CEO 補正 #1)
  - Phase 3 の ALTER 提案 flow ではなく、**既存追加導線の流用**
  - AddAnchorModal の signature は触らない (`subtitle` / `initial.date` は既存 prop)
- C. ~~tap で ALTER 提案 card にスクロール / focus~~ (intent が曖昧、CEO 補正 #1 と矛盾)

### 判断 6: Phase 2-B 後の次フェーズ優先順位

| Phase | 内容 | 推奨 timing |
|-------|------|--------------|
| **Phase 2-C** | MapTab Google Maps integration | API key 判断含む別 design |
| **Phase 2-B+** | FlowTab 7 日 → expandable scroll | Phase 2-B 着地後 |
| **Phase 3** | 空き日 → ALTER 質問 → 提案 flow | Stargazer / Alter engine 接続 (大型) |
| **Phase 2-A+** | Full month grid view mode 追加 | 別 design |
| **W1-Z+ cleanup** | Repository fallback path 削除 | apply 後 1 週間観測 |

---

## 13. 制約遵守 (本 PR 通算)

- ✅ docs only (実装 / migration / env 変更 0)
- ✅ Phase 2-A branch (`feat/alter-plan-phase2-a-calendar-week-strip`) への混入なし (本 PR は local main から切った新 branch)
- ✅ GitHub 操作 0 (suspension 中、push / pull / fetch / gh 全禁止維持)
- ✅ CoAlter / Mirror / /talk / D-* / W1-6 / DraftPlan / fallback path 不触
- ✅ Production / all-Preview env 不触
- ✅ migration 追加なし (ExternalAnchor 型 imageUrl 追加は別 wave)
- ✅ service_role / DB password / connection string 不使用
- ✅ Phase 2-C / Phase 3 / Phase 2-B+ は別 wave 預け
- ✅ Phase 2-A 実装の改修なし (CalendarTab / SelectedDay / 月送り animation / Today button 不変)

---

## 14. References

- `app/(culcept)/plan/tabs/FlowTab.tsx` (本命修正対象、本 PR で touch しない)
- `app/(culcept)/plan/tabs/_helpers.ts` (既存 helper、本 wave で軽量拡張のみ)
- `app/(culcept)/plan/PlanClient.tsx` (parent、本 wave で touch しない)
- `lib/plan/external-anchor.ts` (ExternalAnchor 型、本 wave で touch しない)
- `docs/alter-plan-w15-ui-mini-design.md` §2 (FlowTab 初版設計)
- `docs/alter-plan-w1x3-cell-add-mini-design.md` (旧 gap add 導線、本 wave で削除)
- `docs/alter-plan-phase2-a-calendar-month-view-mini-design.md` (Phase 2-A、本 wave の前例パターン、復旧後 main 整合で参照可能)
- CEO mock スクショ (2026-05-20)

### 世界トップアプリ参考

- Apple Calendar List mode (iOS / macOS)
- Google Calendar Schedule view
- Notion Calendar (旧 Cron) agenda
- Linear roadmap
- Fantastical List mode

---

## 15. 変更履歴

| 日付 | 変更 | 承認 |
|------|------|------|
| 2026-05-20 | Phase 2-B (FlowTab リスト画面) mini design 起票、GitHub suspension 中 local-first 運用、Phase 2-A branch とは完全分離 | CEO レビュー待ち (GitHub 復旧後) |
| 2026-05-20 | **CEO 補正 1-3 反映**: ①「予定なし ›」tap → AddAnchorModal date prefill (Phase 3 ALTER flow ではない)、② ALTER 提案 card は静的、ボタン風 styling 禁止、③ 旧 gap add helpers は削除せず新 UI で render しないだけ。+ Beyond 改善 (sticky header / count badge / 曜日色 / touch target 44pt / long-press defer / empty day 哲学 / world unique 比較強化) | CEO レビュー後着手 |
| 2026-05-20 | **§16 追加**: Phase 2-A merge 方式の柔軟性 (Merge commit / Squash どちらでも `--onto` で stacked rebase 可能)、GitHub 復旧後 procedure を明文化 | CEO 共有 |

---

## 16. GitHub 復旧後の手順 (stacked branch 方式)

### 16.1 stacked branch の構造

```
local main      b07eeab5  (suspension 時点の snapshot、復旧後 pull で advance)
                ↑
                merge-base
                ↑
Phase 2-A       6e37ad38  (feat/alter-plan-phase2-a-calendar-week-strip、5 commits)
                ↑
                stacked-base
                ↑
Phase 2-B impl  HEAD       (feat/alter-plan-phase2-b-flow-list、3+ commits、本 wave 実装)
```

### 16.2 復旧後 procedure (CEO 操作、本 docs は AI が事前に整理)

```bash
# (1) suspension 解除確認
gh auth status   # token healthy 確認

# (2) Phase 2-A branch を push
git checkout feat/alter-plan-phase2-a-calendar-week-strip
git push origin feat/alter-plan-phase2-a-calendar-week-strip
# → PR #223 自動更新 (CI 再 trigger)

# (3) CI / smoke / CEO review → PR #223 merge
#    merge 方式は復旧時の repo 設定 / PR #223 状態 / 運用に合わせて CEO が選ぶ
#    ※ 本 mini design では merge 方式を固定しない (CEO 判断 2026-05-20)

# (4) main pull で local main を最新化
git checkout main
git pull origin main

# (5) Phase 2-B impl branch を最新 main へ rebase
git checkout feat/alter-plan-phase2-b-flow-list
# ↓ Phase 2-A の merge 方式によって rebase command が変わる:

# (5-a) Merge commit (PR #223 が merge commit で merge された場合)
git rebase main
#   → Phase 2-A 5 commits は main の ancestor、Phase 2-B 3 commits だけ replay
#   → conflict 期待値: 0 (file 直交、_helpers.ts additive)

# (5-b) Squash merge (PR #223 が squash merge で main に 1 commit に圧縮された場合)
git rebase --onto main 6e37ad38 feat/alter-plan-phase2-b-flow-list
#   → 6e37ad38 (Phase 2-A HEAD) より上の Phase 2-B 3 commits だけを main 上に replay
#   → Phase 2-A 5 commits は git patch-id で重複認識される可能性、conflict は file 直交により低い
#   → conflict 出た場合は手動 resolve、cherry-pick 同等のもの

# (5-c) Rebase merge (PR #223 が rebase merge で main に 5 commits 個別 replay された場合)
git rebase main
#   → 5-a 同様、conflict 期待値 0 (内容同一だが hash 違い → git が認識して skip)

# (6) Phase 2-B branch を push
git push -u origin feat/alter-plan-phase2-b-flow-list

# (7) PR 起票
gh pr create --title "Phase 2-B: FlowTab を 7 日リスト化 (mock 整合)" \
   --body "..."   # 本 mini design への link + smoke 項目 + CEO 補正 1-3 遵守確認
```

### 16.3 merge 方式選択の参考 (CEO 判断、復旧後)

| Phase 2-A merge 方式 | Phase 2-B rebase command | Conflict 期待値 | history 視認性 |
|------|------|------|------|
| **Merge commit** | `git rebase main` (シンプル) | 0 (file 直交) | C1/C2/C3 5 commit 段階が main の history に残る (Phase 2-A 進化が後で読める) |
| **Squash merge** | `git rebase --onto main 6e37ad38 ...` (`--onto` 必要) | 低 (patch-id 重複認識) | main は 1 commit に圧縮、Phase 2-A の C1/C2/C3 段階は失われる |
| **Rebase merge** | `git rebase main` (シンプル) | 0 (hash 違い skip) | main の history は綺麗、Phase 2-A 5 commit 残る |

→ **どの方式でも復旧手順は確立済**。CEO は復旧時の状況に合わせて選んで OK。

### 16.4 復旧前の禁止事項 (継続)

- ❌ `git push` / `git pull` / `git fetch`
- ❌ `gh auth login` / `gh pr` (任意の gh コマンド)
- ❌ `git branch -D` / `git branch -d` / `git checkout -B`
- ❌ `git reset --hard` / `git checkout --` / `git restore .` / `git clean -f` / `git stash`
- ❌ Phase 2-A branch (`feat/alter-plan-phase2-a-calendar-week-strip`) への追加 commit
- ❌ local main (`main`) への追加 commit
- ❌ Phase 2-B impl branch 以外の branch での実装作業

### 16.5 復旧前にできること (継続)

- ✅ Phase 2-B mini design への docs 補正 (本 PR、複数 commit OK)
- ✅ Phase 2-A branch から Phase 2-B impl branch を切る (`feat/alter-plan-phase2-b-flow-list`)
- ✅ Phase 2-B impl branch で C1/C2/C3 実装 commit
- ✅ local test (`npx tsc --noEmit` / `npx vitest run` / `npm run build`)
- ✅ CEO local smoke (CEO 環境で実機確認)

---

**End of Mini Design**. CEO レビュー → 判断 1-6 → 実装 wave (3 commits) GO/NO-GO 判断をお待ちします。

復旧前に既に許可された範囲は §16.5、復旧後手順は §16.2-16.3。実装は stacked branch (Phase 2-A の上に積む) で安全に進行可能。
