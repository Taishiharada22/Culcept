# SR C: month view enablement readiness（read-only audit + docs-only）

> 区分: **read-only audit + readiness（docs-only）**。実装・flag ON・本番接触なし。
> branch: `feat/plan-shift-month-grid-reflection`。
> 目的: build 済の月 view（MonthGridView + 取込 marker）を実ユーザー `/plan` でどう安全に有効化するかを整理する。**今回は readiness まで**。

---

## 1. 現在地（read-only 確認済）

### 1.1 MonthGridView の実装度 = ほぼ完成
| 要素 | 状態 |
|---|---|
| 6×7=42 cell grid + weekday header（日赤/土青） | ✅ M2（presentational・props 注入） |
| 勤務 anchor → 原稿コード chip（E/N/L/G/E-18） | ✅ M3-b polish（`resolveShiftAnchorChip` resolver 注入・辞書疎結合・完全一致なければ短縮 title fallback） |
| 休み/希望休 chip（H/HREQ/BD・rawCode 由来・variant fallback 公/希/休） | ✅ |
| 背景 tint（勤務=sky / 公休=rose / 希望休=violet / 休み=slate） | ✅ |
| selected=ring / today=border / leading-trailing 淡色 | ✅ |
| **取込（shift_image）marker（per-cell「取込」）** | ✅ **B-1 で統合・B-2 visual smoke PASS（6/10・6/12 取込 / 6/11・6/13 なし）** |
| pure model（buildMonthGrid）+ render contract test | ✅ |

→ **月 view は新規実装不要レベルで完成**。残るは「有効化（見せる）か」「mobile/密度の最終確認」のみ。

### 1.2 dormant にしている flag
- `PLAN_FLAGS.calendarMonthGridEnabled` = **`NEXT_PUBLIC_PLAN_CALENDAR_MONTH_GRID_ENABLED === "true"`**（`lib/plan/featureFlags.ts:185`）。
- **default OFF**。**NEXT_PUBLIC = client 到達のため build-time・global**（全 client 共通。後述 §2 の重要制約）。

### 1.3 week view / day view との関係（toggle 機構）
- `lib/plan/calendarViewMode.ts`: `CalendarViewMode = "week"|"month"`・**`DEFAULT_CALENDAR_VIEW_MODE = "week"`**・`shouldShowCalendarViewToggle(monthGridEnabled) = (monthGridEnabled===true)`。
- `CalendarTab`: `viewMode` state は **既定 week**（flag ON でも初期は週）。`showViewToggle = shouldShowCalendarViewToggle(PLAN_FLAGS.calendarMonthGridEnabled)`。
  - **flag OFF（現状）**: toggle 非表示 → week strip のみ → MonthGridView 非描画 → **UI 完全不変**（`calendarTabMonthToggleGating.test` で固定）。
  - **flag ON**: `週 | 月` segmented toggle（`CalendarViewToggle`）出現 → ユーザーが月へ切替 → `CalendarViewBody` が week strip ⇄ MonthGridView を分岐描画。
- **月送り nav は既存**: `currentMonth` state + `addMonths(currentMonth, delta)`（◀ X月 YYYY ▶・selectedDate 同日維持 + 月末 clamp）。week strip と month grid で **共通**。→ 過去月/未来月 navigation は **既に到達可能**（新規実装不要）。
- day view（FlowTab）は独立 tab で本件と無関係（月 toggle は CalendarTab 内のみ）。

### 1.4 imported marker は月 view に入っているか
- ✅ 入っている。`MonthGridView` に `importedShiftSourceIds` prop（B-1）→ per-cell「取込」。CalendarTab が `monthGridProps` 経由で転送。**B-2 で実 component 描画を確認済**。

---

## 2. enablement の選択肢

> **重要制約**: flag が **NEXT_PUBLIC（global・build-time）**のため、**per-user の出し分けは本 flag 単体では不可能**（全 client 一律）。canary を per-user にするなら server 駆動の別 prop（`canaryUserIds` 方式）が追加で必要。

| 案 | 内容 | 実現性 / コスト | 評価 |
|---|---|---|---|
| **A. dev/local only smoke** | flag ON で dev 起動 → toggle + month grid を目視 | **即可**（C-1）。B-2 は MonthGridView component を確認済だが **CalendarTab の toggle 統合は未 smoke** | enablement 前の最終確認として**必須** |
| **B. beta/canary user だけ ON** | 一部 user のみ月 view | **本 flag では不可**（NEXT_PUBLIC global）。server 駆動 per-user flag を新設すれば可能だが**追加実装** | コスト高・今は不要 |
| **C. flag ON（default week のまま toggle 表示）** | 本番 build で flag ON → **全 user に `週\|月` toggle 出現・初期は週・月は opt-in** | **即可**（env 1 個）。default=week なので **週体験は不変**・月は明示 tap でのみ | **低リスク・推奨の本命**。「見せる」= これ |
| **D. まだ ON にせず UI polish 先行** | mobile 密度等を詰めてから C | C の前段。mobile 確認で破綻あれば polish → 再 smoke | C-1 smoke 結果次第で要否判断 |

**本命 = C**（flag ON で toggle 表示・週 default 維持）。理由: ① default view が week なので**既存 week 体験を一切壊さない**（toggle が増えるだけ）② 月は opt-in tap ③ 月送り nav は既存 ④ rollback は flag OFF で即 dormant。**B（per-user canary）は NEXT_PUBLIC 制約で本 flag では不可**＝採るなら別実装。

---

## 3. UX 確認項目（C-1 smoke で見る）

```
□ 週|月 toggle が分かりやすいか（segmented control・月 header 下の配置）
□ toggle tap で week ⇄ month が自然に切替わるか（agenda は mode 共通で残る）
□ 取込 marker が狭すぎないか（特に 4 文字コード HREQ/E-18 + 取込 の cell）
□ 勤務コード chip が崩れないか（複数 anchor 日 / 同日 work+manual）
□ 休み/希望休の tint が過剰でないか（month 全面で rose/violet/slate のバランス）
□ 今日(border) / 選択日(ring) / leading-trailing(淡色) の区別が month で明瞭か
□ 月送り（◀▶）で過去月/未来月へ到達でき、selectedDate clamp が自然か
□ mobile 幅（~375px）で 7 列 cell が破綻しないか（cell ≈ 44-48px に code+取込）
```

---

## 4. risk

| # | risk | 緩和 |
|---|---|---|
| R1 | **月 view が情報過多**（42 cell に code + tint + 取込） | default=week 維持・月は opt-in。tint は薄め既定。必要なら C-2 で密度調整 |
| R2 | **取込 marker が多い月で過密**（フル取込月は全 cell に code+取込） | 取込は text-[8px] muted。mobile で要確認（R5）。過密なら「月全体が取込なら marker 抑制」等は C-2 候補 |
| R3 | **過去月/未来月 navigation が分かりにくい** | nav は既存（◀ X月 YYYY ▶）。C-1 で到達性・clamp を目視 |
| R4 | **既存 week 体験を壊す** | **default=week・flag ON は toggle 追加のみ**。`calendarTabMonthToggleGating` で flag OFF 不変は固定済。flag ON 時の week 既定も維持 |
| R5 | **mobile 幅で 7 列が破綻**（44px cell に HREQ+取込） | **C-1 の mobile screenshot で要確認**。破綻あれば C-2 polish（chip 省略規則・取込 marker 位置） |
| R6 | NEXT_PUBLIC global ゆえ **一度 ON で全 user 一律** | rollback = flag OFF（env）で即 dormant。段階出しが要るなら server 駆動 flag を別途 |

---

## 5. test / smoke plan

| 種別 | 内容 | 状態 |
|---|---|---|
| render contract（既存） | `monthGridViewRenderContract`(+§11 取込) / `calendarViewBodyRenderContract`(week⇄month seam) / `calendarViewToggleRenderContract` / `calendarTabMonthToggleGating`(flag OFF 不変) / `calendarViewMode` / `calendarMonthGrid` | ✅ 全 PASS（plan 4947） |
| source marker fixture | B-2 `dev-source-marker-smoke`（MonthGridView 直接描画・取込確認） | ✅ PASS |
| **CalendarTab toggle smoke（C-1）** | flag ON で **実 CalendarTab の `週\|月` toggle + month 切替 + 月送り**を目視（B-2 は component 直描画で toggle 未経由） | ⬜ C-1 |
| **mobile screenshot（C-1）** | ~375px で month grid（code+取込）が破綻しないか | ⬜ C-1 |
| imported shift month sample | フル月が取込のケースで過密度を見る（fixture 拡張可） | ⬜ C-1 任意 |

---

## 6. 実装分割案

| step | 内容 | 種別 |
|---|---|---|
| **C-0**（本書） | read-only audit + enablement readiness | **docs-only（完了）** |
| **C-1** | local/dev month view smoke（**flag ON で実 CalendarTab の toggle + month + 月送り + mobile 幅**を目視。B-2 fixture を CalendarTab 経由 or 既存 dev-month-grid 拡張） | dev smoke（CEO gate） |
| **C-2** | UI polish if needed（C-1 で mobile 破綻/過密があれば surgical 調整） | 条件付き UI |
| **C-3** | canary enablement plan（**C=flag ON 推奨**の手順 / rollback / 観測。per-user が要るなら server 駆動 flag 設計） | docs + 本番判断（CEO + 別 GO） |

---

## 結論
- 月 view は **build 完成・取込 marker 統合済・B-2 smoke PASS**。enablement の本体は「**flag ON で toggle を見せる（C 案）**」で、**default=week ゆえ低リスク**（週体験不変・月は opt-in・月送り既存・rollback は flag OFF 即時）。
- **B（per-user canary）は NEXT_PUBLIC global 制約で本 flag では不可**＝採るなら server 駆動 flag の別実装。
- 残作業は **C-1 smoke（CalendarTab toggle 統合 + mobile 幅）**と、その結果次第の **C-2 polish**。flag ON（本番有効化）は **C-1/C-2 通過 + CEO 判断**で C-3 にて。
- **本書は docs-only。flag ON・本番接触なし。** 次は CEO が **C-1 dev smoke 着手の可否**を判断。
