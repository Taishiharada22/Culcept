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
- `gapMinutes` / `formatGap` / `shouldShowGapAdd` — Flow gap add 導線 (W1-X3 で確立、本 wave で **list 表示への refactor 後は使わない**)
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
| **anchor 間 gap** | gap badge + W1-X3 "+ 時刻を教える" link | (mock 未表示、削除) | **削除** |
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

```
<section data-testid="plan-flow-day-{iso}">
  <header>
    <h3>X月Y日 (曜)</h3>
    {予定なし日のみ: <span className="text-slate-400">予定なし ></span>}
  </header>

  {予定あり日}:
  <ul>
    {anchors.map(anchor => <AnchorRow ... />)}
  </ul>

  {予定なし日}:
  (header の "予定なし >" のみ、anchor list なし)
</section>
```

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

### 3.4 下部 ALTER 提案 card (static、Phase 3 で動作)

```tsx
<div className="rounded-2xl bg-gradient-to-br from-indigo-50 to-purple-50 p-4">
  <p className="text-xs text-slate-600 mb-3">予定のない日をタップすると...</p>
  <div className="bg-white rounded-xl p-3 shadow-sm">
    <p className="text-sm font-medium text-slate-800">
      {firstEmptyDayLabel} は何する？
    </p>
    <p className="text-xs text-slate-500 mt-1">その日のおすすめを提案するね</p>
  </div>
</div>
```

- `firstEmptyDayLabel`: 7 日 list 内の最初の「予定なし」日 (mock では「4月24日」)
- 全日に予定あり → card 非表示
- tap で何が起きるか:
  - **Phase 2-B (本 wave)**: 何も起きない or 「Phase 3 で実装予定」placeholder (static)
  - **Phase 3**: ALTER 提案 flow 起動 (Stargazer / Alter engine 接続後)

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
| FlowTab FAB (Phase 2-B 新規) | **追加** (mock 整合) | 主要 entry on mobile |
| 旧 W1-X3 gap add link | **削除** (mock 整合) | timeline 廃止に伴う |
| 「予定なし >」inline (各日 header) | tap で何か? | **Phase 3 預け** (本 wave は tap 無効 or static) |
| ALTER 提案 card 内 button | tap で何か? | **Phase 3 預け** (本 wave は static) |

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

### C1: locationCategory icon helper + tests

**Files**:
- `app/(culcept)/plan/tabs/_helpers.ts` — 既存 `CATEGORY_META` を再利用、軽量 helper 追加 (例: sensitive 判定)
- `app/(culcept)/plan/tabs/_AnchorThumbnail.tsx` (新規 internal) — Thumbnail component
- (Optional) `tests/unit/plan/flowListThumbnail.test.ts` — sensitive 判定 / fallback icon の deterministic test

### C2: FlowTab を 7 日リスト + AnchorThumbnail + ALTER card placeholder に refactor

**Files**:
- `app/(culcept)/plan/tabs/FlowTab.tsx` — refactor (241 行 → 推定 280-320 行)
- 旧 timeline / 日付セレクタ / gap add link を削除
- 7 日 list (date section + anchor list + empty inline)
- 下部 ALTER 提案 card (static)
- FAB (Phase 2-A 同パターン、今日 prefill)

### C3: visual polish + smoke docs 更新

**Files**:
- `app/(culcept)/plan/tabs/FlowTab.tsx` — micro polish (rounded card / shadow / hover)
- `docs/alter-plan-home-swipe-visual-smoke.md` — Phase 2-B 追加 smoke check

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
- [ ] FAB tap → AddAnchorModal 起動、date=今日 prefill
- [ ] ALTER 提案 card tap → 静的 (Phase 3 で動作)
- [ ] 「予定なし >」 tap → 静的 or 「Phase 3 で実装予定」placeholder

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

### 11.5 7 日 list の today section の subtle highlight

mock では明示なしだが、UX 上「今日」を section header で強調すべき:
- 今日: `bg-indigo-50/30` 背景 + `font-bold`
- 他日: `bg-transparent` + `font-medium`

または "今日" badge (small)。

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
| Empty day | 非表示 | 非表示 | (なし) | **inline 1 行 (mock 整合、Phase 3 ALTER 誘導点)** |
| FAB add | あり (右下) | あり | あり | **あり (今日 prefill)** |
| Today highlight | subtle | bold | bold | **bold + subtle bg (Beyond 採用)** |

→ Aneurasync の **empty day inline + ALTER 提案 card** は world unique、Phase 3 の「ALTER が空き日を埋める提案」flow の起点。

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

### 判断 3: ALTER 提案 card の tap 動作 (§3.4、§6.1)

- A. 本 wave: **tap 無効 (static)** ← 推奨、Phase 3 で動作
- B. tap で「Phase 3 で実装予定」alert (placeholder UX)
- C. tap で AddAnchorModal を起動 (簡易 fallback、ALTER 経由でない)

### 判断 4: Today section の visual highlight (§11.5)

- A. `bg-indigo-50/30` + `font-bold` ← 推奨
- B. "今日" badge (small)
- C. なし (mock 直訳)

### 判断 5: 「予定なし」inline の tap 動作 (§6.1)

- A. 本 wave: **tap 無効 (static)** ← 推奨、Phase 3 で動作
- B. tap で AddAnchorModal を起動、date=該当日 prefill (シンプル代替)
- C. tap で ALTER 提案 card にスクロール / focus

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

---

**End of Mini Design**. CEO レビュー → 判断 1-6 → GitHub 復旧後に本 docs を push + PR 起票 → 実装 wave (3 commits) GO/NO-GO 判断をお待ちします。
