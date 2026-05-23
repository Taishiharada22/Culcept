# Phase 3-M-3d Readiness Audit (= Calendar/Flow Feasibility Disclosure 展開 + Phase 3 残範囲棚卸し)

**作成日**: 2026-05-23
**承認**: CEO + GPT 合議 (= 2026-05-23 「/plan の計画完了が最優先、 別軸 pivot 撤回、 M-3d → N → /plan complete」 訂正指示)
**範囲**: M-3d Calendar/Flow disclosure 展開 readiness + Phase 3 J/K/L/M/N original plan の残範囲棚卸し + low-risk なら連続 GO 判定
**前提**: M-3c-ui MapTab-only @ `e5527f1b` + closeout @ `39c87663` + current-range closeout @ `ce5dfd6d` + 49 frozen branches

> 本 audit は **docs only**。 low-risk 確認後、 M-3d 実装に連続 GO。 M-3d は「M-3c-ui の MapTab-only pattern を Calendar selected day + Flow visible 7 days に展開する」 のみ。 Calendar month/grid 全件展開は **絶対禁止**。

---

## 0. Phase 3 J/K/L/M/N original plan 棚卸し (= 残範囲の整理)

### 0.1 元 Phase 3 設計の layered architecture (= `alter-plan-phase3-l-transport-design.md` §0.3 より)

```
Layer 0 (= 3-K):  予定と空白の構造 (= DayGraph)
Layer 1 (= 3-L):  移動の存在と所要時間 (= Mobility Truth Layer)
Layer 2 (= 3-M):  間に合うか (= Day Feasibility Truth Layer)
Layer 3 (= 3-N):  Counter-Factual / Pattern Truth Layer (= 別の 1 日の選択肢 / 複数日 pattern)
```

### 0.2 各 phase の現状 + 残範囲

| Phase | 責務 | 着地時点 | 残範囲 |
|---|---|---|---|
| **3-J** Proposal Layer | 提案 hint / Quiet Undo | closeout 済 (= `alter-plan-phase3-j-closeout-audit.md`) | **なし** (= 完了) |
| **3-K** DayGraph Layer | 1 日の構造 (= start/end/event/gap/transition) | closeout 済 (= `alter-plan-phase3-k-closeout-audit.md`) | **なし** (= 完了) |
| **3-L** Mobility Truth Layer | overlay 「移動 約 N 分」 | closeout overview 済 (= `alter-plan-phase3-l-closeout-overview.md`) | **なし** (= MapTab/Calendar/Flow 全 tab 接続済、 L-4d-b1/b2 で展開済) |
| **3-M** Day Feasibility Truth Layer | 余白/不足観測 | **partial** (= M-3c-ui MapTab-only まで) | **M-3d** (= Calendar/Flow 展開) |
| **3-N** Counter-Factual / Pattern Truth Layer | 複数日 pattern / 別の 1 日の選択肢 | **未着手** | 全範囲 (= 元計画では Counter-Factual / 複数日 pattern、 + CEO 補正で Home/Plan final surface polish も含む) |

### 0.3 「未完了」 と確定した項目

| 項目 | 所属 phase | 内容 |
|---|---|---|
| **M-3d: CalendarTab selected day disclosure** | 3-M | M-3c-ui MapTab pattern を Calendar の selected day に展開 |
| **M-3d: FlowTab visible 7 days disclosure** | 3-M | 同 pattern を Flow の 7 日 view に展開 |
| **3-M full closeout** | 3-M | M-3d 完了後の M phase 正式完結宣言 |
| **3-N readiness audit** | 3-N | N の責務確定 (= 元計画 Counter-Factual / Pattern + CEO 補正 Home/Plan polish) |
| **3-N implementation** | 3-N | N の実装 |
| **Home / Plan final surface polish** | 3-N (= CEO 補正) | Home design / layout / Plan 導線 / 見た目 |
| **/plan final closeout** | 3-final | J/K/L/M/N + Home/Plan UI の完了監査 |

### 0.4 「deferred」 だが Phase 3 残範囲 と確認した項目

- density guard (= M-3c-extend) — 必要に応じて M-3d 又は N で取り込む
- N 人 visual smoke (= 個別 phase 外、 必要に応じて拡張)
- ambient indicator / 集計 disclosure / progressive trust (= N 後 or 別 phase)
- **Routes API / 実 API 連携** (= CEO 訂正で「今は deferred」、 N に含まれていない限り後回し)

### 0.5 元計画 N の元来責務 (= `alter-plan-phase3-l-transport-design.md` §0.3 と §14)

- N = **Counter-Factual** (= 「もし違う選択をしたら」 反事実シナリオ差分)
- N = **Pattern Truth Layer** (= 複数日 pattern 観測)
- N = **Arrival Risk Memory との境界** (= 過去観測差分の解釈、 但し warning 文言永続禁止)

**CEO 訂正 (= 2026-05-23)**:
- 「N で Home / Plan final surface polish を含めて計画する」
- → N の範囲は元計画の Pattern Truth + Home/Plan polish に **拡張** される

### 0.6 棚卸し結論

```
J ✅ 完了
K ✅ 完了
L ✅ 完了
M ⏳ partial (= MapTab-only)
  └─ M-3d 必須 (= Calendar/Flow 展開)
N ⏸️ 未着手
  └─ Counter-Factual / Pattern (= 元計画)
  └─ Home/Plan polish (= CEO 補正)
Final closeout ⏸️ N 完了後
Deploy readiness ⏸️ /plan complete 後
```

→ **immediate next: M-3d**

---

## 1. M-3d の責務 (= 自律推論で確定)

### 1.1 M-3d の core 責務

**M-3c-ui MapTab-only の disclosure pattern を Calendar/Flow に展開**:
- CalendarTab の **selected day detail** に同 pattern (= MapTab と同じ 1 day context)
- FlowTab の **visible 7 days** に同 pattern (= 7 day × 各 disclosure、 per-day state)

### 1.2 M-3d の scope (= CEO 明示)

#### IN scope

- CalendarTab selected day detail に feasibility disclosure
- FlowTab visible 7 days に feasibility disclosure
- M-3c-ui と同じ default hidden / 「詳細」 / 「閉じる」 pattern
- hidden 時 DOM 不在 (= conditional render)
- transitionIndex のみで state 管理
- selectedDate / day 切替で reset
- 各 tab で local state (= PlanClient core state 化なし)

#### OUT scope (= 絶対禁止)

- **Calendar month/grid 全件展開** (= selected day detail のみ、 grid 全件は出さない)
- **PlanClient core state 化** (= 各 tab で local state)
- **localStorage / persist** (= 「観測の幕間」 規約継承)
- 常時表示
- amber / orange / red / icon / badge / warning box
- warning / recommendation / optimization 文言
- Arrival Risk Memory
- DB / env / package / dependency 変更
- runtime telemetry sink
- Counterfactual / Routes API / 実 API 連携

---

## 2. 連続 GO 判定 (= low-risk 確認)

### 2.1 判定 chart

| 判定軸 | 評価 |
|---|---|
| **危険境界** (= UI / 「不足 N 分」 / 警告色 / Arrival Risk 等) | **0** (= M-3c-ui と同 pattern、 既に smoke PASS) |
| **既存 file 改変** | 限定的 (= 2 tab + 2 hook 新規、 DayGraphTimeline 改変なし) |
| **DayGraphTimeline 改変** | **0** (= M-3c-ui で 3 props 拡張済、 そのまま再利用) |
| **PlanClient 改変** | **0** (= 各 tab で local state) |
| **DB / env / package / dependency 変更** | **0** |
| **新規 fetch / endpoint / localStorage / telemetry** | **0** |
| **Aneurasync 整合性** | high (= M-3c-ui pattern 継承) |
| **思想保護** | 機械保証 (= 3 props セット AND 条件 + conditional DOM render) |
| **smoke 必要性** | CEO 1 人 smoke (= MapTab smoke と同様、 各 tab で確認) |
| **ロールバック容易性** | 高 (= 各 tab 個別 revert 可能) |
| **density リスク** | FlowTab で **要 smoke** (= 7 日 × N transition の case)、 但し all-open mode なしの場合は user 個別 tap でしか expand しない |

**結論: M-3d **連続実装 GO**** (= 危険境界 0、 既存 pattern 完全継承)

### 2.2 「危険境界 0」 の根拠

| 境界 | 既存制御 |
|---|---|
| 「不足 N 分」 が画面に出る | M-3c-ui で既に成立、 smoke PASS 済 |
| Calendar month/grid 全件展開 | **scope outside** (= selected day detail のみ、 月 grid 各日 cell には出さない) |
| PlanClient core state 化 | **scope outside** (= 各 tab local state) |
| localStorage / persist | **scope outside** (= harden 規約継承) |
| 警告色 / icon / badge | **scope outside** (= MapTab pattern と同 styling) |
| Arrival Risk / recommendation | **scope outside** (= M-2a 文言固定、 M-3c で禁止規約継承) |
| DB / env / package | **scope outside** (= local state + memo) |
| FlowTab 7 日同時 expansion 圧 | smoke で確認、 圧体験あれば density guard 追加 audit (= 別 phase) |

→ 全境界が **既存 frozen 規約**で守られる、 M-3d 新規違反 0。

---

## 3. CalendarTab 接続設計

### 3.1 現状 (= L-4d-b1 で接続済)

CalendarTab は既に:
- `selectedDate: string` (= state)
- `selectedDayAnchors` (= recurring 展開済)
- `selectedDayResolutions` (= usePlanGeocode)
- `calendarMovementDisplayByTransitionIndex` (= useCalendarMovementDisplay hook)
- DayGraphTimeline (= selected day timeline + movementDisplay prop)

### 3.2 M-3d 追加 (= 最小)

```typescript
// 新規 hook (= MapTab hook の写し)
const calendarFeasibilityDisplayByTransitionIndex = useCalendarTabFeasibilityDisplay(
  selectedDayAnchors,
  selectedDate,
  selectedDayResolutions,
);

// disclosure state (= MapTab と同 pattern)
const [expandedTransitionIndices, setExpandedTransitionIndices] = useState<
  ExpandedTransitionIndices
>(resetAllDisclosures);

// selectedDate 切替で reset (= 「観測の幕間」)
useEffect(() => {
  setExpandedTransitionIndices(resetAllDisclosures());
}, [selectedDate]);

// toggle handler
const handleToggleFeasibilityDisclosure = useCallback(
  (transitionIndex: number) => {
    setExpandedTransitionIndices((current) => {
      const currentState = getDisclosureStateForIndex(current, transitionIndex);
      const action = currentState === "expanded" ? "request_collapse" : "request_expand";
      return applyDisclosureAction(current, transitionIndex, action);
    });
  },
  [],
);

// DayGraphTimeline に 3 props 追加
<DayGraphTimeline
  result={...}
  view="user_self"
  movementDisplayByTransitionIndex={calendarMovementDisplayByTransitionIndex}
  feasibilityDisplayByTransitionIndex={calendarFeasibilityDisplayByTransitionIndex}
  expandedTransitionIndices={expandedTransitionIndices}
  onToggleFeasibilityDisclosure={handleToggleFeasibilityDisclosure}
  ...
/>
```

### 3.3 新規 hook: `_useCalendarTabFeasibilityDisplay.ts`

`_useMapTabFeasibilityDisplay.ts` の写し:
- inputs: anchors / date / resolutions
- pipeline: buildDayGraph + L-3c overlay + M-3a runFeasibilityDisplayPipeline
- output: `ReadonlyMap<number, FeasibilityDisplayView>`

CalendarTab 用に **content は同じ**、 import path / hook 名のみ変更 (= MapTab と独立 namespace 維持)。

### 3.4 month / grid 不変

CalendarTab の月 grid (= 各日 cell) は **絶対に触らない**。 disclosure UI は selected day detail (= 下部の DayGraphTimeline) のみ。

---

## 4. FlowTab 接続設計

### 4.1 現状 (= L-4d-b2 で接続済)

FlowTab は既に:
- `useFlowWeekMovementDisplay` hook (= 7 日 per-day map を返す)
- visible 7 days each DayGraphTimeline + per-day movementDisplay

### 4.2 M-3d 追加 (= per-day state 設計)

#### 4.2.1 新規 hook: `_useFlowWeekFeasibilityDisplay.ts`

- `useFlowWeekMovementDisplay` と同 pattern (= per-day map を返す)
- inputs: anchors + visible 7 days + resolutions
- output: `ReadonlyMap<string /* isoDate */, ReadonlyMap<number, FeasibilityDisplayView>>`

#### 4.2.2 per-day disclosure state (= 革新 M-3d-1)

```typescript
// per-day disclosure state (= Record<isoDate, ExpandedTransitionIndices>)
const [expandedByDay, setExpandedByDay] = useState<Record<string, ExpandedTransitionIndices>>(
  {},
);

// week 切替で全 day reset (= 「観測の幕間」 革新 5 を week-level に lift)
useEffect(() => {
  setExpandedByDay({});
}, [weekStartIso]);

// per-day toggle handler
const handleToggleFeasibilityDisclosure = useCallback(
  (isoDate: string) => (transitionIndex: number) => {
    setExpandedByDay((current) => {
      const dayExpanded = current[isoDate] ?? resetAllDisclosures();
      const currentState = getDisclosureStateForIndex(dayExpanded, transitionIndex);
      const action = currentState === "expanded" ? "request_collapse" : "request_expand";
      const next = applyDisclosureAction(dayExpanded, transitionIndex, action);
      return { ...current, [isoDate]: next };
    });
  },
  [],
);

// 各日の DayGraphTimeline に渡す
<DayGraphTimeline
  result={...}
  movementDisplayByTransitionIndex={dayMovementDisplay}
  feasibilityDisplayByTransitionIndex={dayFeasibilityDisplay}
  expandedTransitionIndices={expandedByDay[dayIso] ?? undefined}
  onToggleFeasibilityDisclosure={
    feasibilityDisplay ? handleToggleFeasibilityDisclosure(dayIso) : undefined
  }
  ...
/>
```

### 4.3 per-day state 設計 (= 革新 M-3d-1 詳細)

**設計判断**:
- FlowTab visible 7 days は同時 render
- 各日が独立 disclosure context (= 異なる observation contexts)
- `Record<string, ExpandedTransitionIndices>` で各日独立保持
- `undefined` (= 該当日キー未存在) → DayGraphTimeline は disclosure UI 非活性化 (= 3 props セット AND 条件で fallback)

**PII 0 保証**:
- key = isoDate (= "2026-05-23" 形式、 PII ではない)
- value = ReadonlySet<number> (= transitionIndex のみ)
- nodeId / anchorId / locationText / title / userId 不在

**reset 規約**:
- week 切替 → 全 day reset
- 同 week 内 day 切替 → reset しない (= week が observation context)
- → 「観測の幕間」 を week-level で適用

### 4.4 「visible 7 days」 のみ vs all-week

- FlowTab は **currentWeek の 7 日のみ** visible (= 既存挙動)
- 過去 week / 未来 week は別 currentWeek state
- → 7 日 per render、 各日 disclosure 独立

---

## 5. 機械検証 plan

### 5.1 CalendarTab tests (= `calendarTabFeasibilityDisclosureWiring.test.ts`)

| § | 範囲 | tests 数 (予測) |
|---|---|---|
| §1 | DayGraphTimeline 既存 prop 受領 (= K-3c-iii / L-4d 不変) | 3 |
| §2 | CalendarTab に useCalendarTabFeasibilityDisplay 接続 | 5 |
| §3 | useState(resetAllDisclosures) で default hidden | 3 |
| §4 | useEffect([selectedDate]) で reset | 4 |
| §5 | handleToggle callback | 4 |
| §6 | 3 props を DayGraphTimeline に渡す | 3 |
| §7 | privacy grep | 4 |
| §8 | 警告色 / icon / amber/orange/red なし | 4 |
| §9 | month / grid 全件展開なし (= 構造的確認) | 3 |
| §10 | MapTab/FlowTab に影響なし (= backward compat) | 4 |
| §11 | module shape | 2 |
| **合計** | | **~39** |

### 5.2 FlowTab tests (= `flowTabFeasibilityDisclosureWiring.test.ts`)

| § | 範囲 | tests 数 (予測) |
|---|---|---|
| §1 | DayGraphTimeline 既存 prop 受領 | 3 |
| §2 | FlowTab に useFlowWeekFeasibilityDisplay 接続 | 5 |
| §3 | per-day state (= Record<isoDate, ExpandedTransitionIndices>) | 5 |
| §4 | useEffect([weekStartIso]) で全 day reset | 4 |
| §5 | per-day handleToggle callback (= bound to isoDate) | 5 |
| §6 | 3 props を各 day DayGraphTimeline に渡す | 4 |
| §7 | undefined 時 disclosure 無効 (= K-3c-iii fallback) | 3 |
| §8 | privacy grep (= isoDate / number のみ) | 5 |
| §9 | 警告色 / icon / amber/orange/red なし | 4 |
| §10 | visible 7 days のみ (= 月全件展開なし) | 3 |
| §11 | MapTab/CalendarTab に影響なし | 4 |
| §12 | module shape | 2 |
| **合計** | | **~47** |

### 5.3 Backward Compat
- MapTab: M-3c-ui 接続変更なし、 既存テスト全件 PASS
- DayGraphTimeline: 既存 props 変更なし、 既存テスト全件 PASS
- 既存 movement display: 改変 0
- 既存 K-3c-iii compact mode: 不変

### 5.4 予測総 tests: **80-90 件** (= 39 + 47 ≈ 86)

---

## 6. 革新的アイデア (= M-3d 固有)

### 6.1 革新 M-3d-1: per-day disclosure state (= `Record<isoDate, ExpandedTransitionIndices>`)

通常 pattern: 単一 state を共有
革新: per-day 独立 state、 各日が独立 observation context

利点:
- 7 日 × N transitions の disclosure を per-day 管理
- PII 0 保証 (= isoDate key + number Set)
- week 切替で全 day reset

### 6.2 革新 M-3d-2: 「観測の幕間」 を week-level に lift

M-3c-ui: tab/day 切替で reset
M-3d: **week 切替で全 day reset、 同 week 内 day 切替で reset せず**

理由: FlowTab の context は week (= 7 日 set)、 同 week 内移動は同 observation context。

### 6.3 革新 M-3d-3: per-day handler curry (= `(isoDate) => (transitionIndex) => void`)

FlowTab で各日に bound handler を渡す:
```typescript
const handleToggle = useCallback((isoDate: string) => (transitionIndex: number) => {
  setExpandedByDay((current) => {
    const dayExpanded = current[isoDate] ?? resetAllDisclosures();
    // ... apply action ...
    return { ...current, [isoDate]: next };
  });
}, []);

<DayGraphTimeline
  onToggleFeasibilityDisclosure={feasibilityDisplay ? handleToggle(dayIso) : undefined}
/>
```

利点:
- 各日に bound handler、 DayGraphTimeline 側は `(transitionIndex) => void` を受けるだけ
- DayGraphTimeline の signature 変更 0 (= M-3c-ui で確立した interface 再利用)

### 6.4 革新 M-3d-4: 「3 props セット AND 条件」 の再利用

DayGraphTimeline で M-3c-ui に確立した 3 props セット AND 条件:
- feasibilityDisplayByTransitionIndex
- expandedTransitionIndices
- onToggleFeasibilityDisclosure

CalendarTab / FlowTab は同 3 props を渡せば自動活性化 → DayGraphTimeline 改変 0、 backward compat 100%。

### 6.5 革新 M-3d-5: 「month / grid 不変」 規約

CalendarTab の月 grid (= 各日 cell) は **絶対に disclosure UI を出さない**:
- grid は概観 view、 disclosure context ではない
- selected day detail のみが observation context
- → 同 規約を機械検証 (= test §9)

---

## 7. 危険境界遵守 (= 全件 0)

| 境界 | 結果 |
|---|---|
| **Calendar month/grid 全件展開** | **0** (= scope outside、 §6.5 規約) |
| **PlanClient core state 化** | **0** (= 各 tab local state) |
| **localStorage / persist** | **0** |
| **「不足 N 分」 常時表示** | **0** (= conditional DOM render) |
| Arrival Risk Memory | **0** |
| warning / recommendation / optimization 文言 | **0** (= M-2a 固定継承) |
| amber / orange / red 警告色 | **0** |
| icon / badge / warning box | **0** |
| DB / env / package / dependency 変更 | **0** |
| 新規 fetch / endpoint | **0** |
| runtime telemetry sink | **0** |
| Counterfactual | **0** |
| Routes API / 実 API 連携 | **0** |
| K / L / M-1〜M-3c-ui 既存 file 改変 | **0** (= 拡張のみ) |
| DayGraphTimeline 改変 | **0** (= M-3c-ui props を再利用) |
| MapTab 改変 | **0** |
| reset / restore / stash / branch delete / gh / push | **0** |

---

## 8. CEO Visual Smoke 計画 (= CEO 1 人)

### 8.1 CalendarTab smoke

| 項目 | 期待挙動 |
|---|---|
| 「詳細」 hint が selected day timeline に出る | feasibility あり transition のみ |
| tap で「余白 N 分」 / 「不足 N 分」 展開 | 補助行が現れる |
| 「閉じる」 で消える | DOM から消える |
| selectedDate 切替で reset | 全 hidden に戻る |
| 月 grid に「詳細」 / 補助行が出ない | grid 不変 |
| 警告に見えない | (= 質的判定) |

### 8.2 FlowTab smoke

| 項目 | 期待挙動 |
|---|---|
| 「詳細」 hint が visible 7 days に出る | feasibility あり transition のみ |
| 任意の日で tap で展開 | 該当日のみ展開 (= 他日不影響) |
| 「閉じる」 で消える | DOM から消える |
| 別の日を独立に expand 可能 | 異 day で独立 state |
| week 切替で全 day reset | 全 day hidden に戻る |
| 同 week 内 day 切替で reset せず | observation context 連続 |
| 警告に見えない | (= 質的判定) |
| **7 日同時 expansion で UI 圧を感じない** | (= density 判定、 圧体験あれば density guard 追加 audit) |

### 8.3 backward compat smoke

| 項目 | 期待挙動 |
|---|---|
| MapTab に変化なし | 既存 disclosure 動作不変 |
| DayGraphTimeline の K-3c-iii compact mode 不変 | empty day 表示不変 |
| L-4d movement display 不変 | 「→ 移動」 / 「移動 約 N 分」 表示不変 |

---

## 9. CEO 判断項目 (= 報告で停止) + 停止条件

### 9.1 CEO 判断項目 4 件

1. **M-3d 連続実装 GO 確認** (= 本 audit の low-risk 判定を承認)
2. **per-day reset 設計** (= week 切替で全 day reset、 同 week 内 day 切替で reset せずの是非)
3. **density 体験許容範囲** (= FlowTab 7 日同時 expansion 圧の許容判定、 smoke 後)
4. **CalendarTab month/grid 不変規約** (= selected day detail のみ disclosure、 月 grid に出さない)

### 9.2 即停止条件

以下のいずれかが発生した場合、 **即停止**:
- Calendar month/grid 全件展開が必要
- PlanClient core state 化が必要
- localStorage / persist が必要
- UI が警告っぽくなる (= styling 議論 が必要)
- Arrival Risk / recommendation / optimization に近づく
- DB / env / package / dependency 変更が必要
- frozen branches への追加 commit
- MapTab / DayGraphTimeline の改変

---

## 10. 「3 props セット」 規約継承 (= M-3c-ui からの自然な拡張)

| Component | M-3c-ui の状態 | M-3d 後の状態 |
|---|---|---|
| DayGraphTimeline | 3 optional props 受領 (= 3 件揃で disclosure 活性化) | **改変 0** (= 再利用) |
| MapTab | feasibility hook + state + reset + handler + 3 props pass | **改変 0** |
| CalendarTab | 3 props pass 0 (= disclosure 無効) | feasibility hook + state + reset + handler + 3 props pass (= 活性化) |
| FlowTab | 3 props pass 0 (= disclosure 無効) | feasibility hook + per-day state + week reset + per-day handler + 3 props pass (= 活性化) |

→ **「3 props セット AND 条件」 規約**を 3 tab で再利用、 DayGraphTimeline 改変 0、 backward compat 100% を維持。

---

## 11. M-3d 着地予定

### 11.1 新規 file (= 2 + tests 2)

- `app/(culcept)/plan/tabs/_useCalendarTabFeasibilityDisplay.ts` (~140 行、 MapTab hook の写し)
- `app/(culcept)/plan/tabs/_useFlowWeekFeasibilityDisplay.ts` (~180 行、 7 日 per-day map)
- `tests/unit/plan/calendarTabFeasibilityDisclosureWiring.test.ts` (~39 tests)
- `tests/unit/plan/flowTabFeasibilityDisclosureWiring.test.ts` (~47 tests)

### 11.2 既存 file 改変 (= 2)

- `app/(culcept)/plan/tabs/CalendarTab.tsx` (= 拡張: hook + state + reset + handler + 3 props pass)
- `app/(culcept)/plan/tabs/FlowTab.tsx` (= 拡張: per-day hook + per-day state + week reset + per-day handler)

### 11.3 変更しない (= 機械保証)

- `app/(culcept)/plan/components/DayGraphTimeline.tsx`
- `app/(culcept)/plan/tabs/MapTab.tsx`
- `app/(culcept)/plan/tabs/_useMapTabFeasibilityDisplay.ts`
- `lib/plan/feasibility/*` 全 file
- `lib/plan/transport/*` 全 file
- `lib/plan/dayGraph/*` 全 file

---

## 12. 自律推奨 + 連続 GO 判定

### 12.1 自律推奨

- **M-3d 連続実装 GO** (= low-risk、 既存 pattern 完全継承、 危険境界 0)
- 実装後 CEO visual smoke (= CEO 1 人)
- smoke PASS なら M full closeout
- その後 Phase 3-N readiness audit

### 12.2 「連続 GO」 判定の根拠

- M-3c-ui で MapTab smoke PASS → 同 pattern を Calendar/Flow に展開するだけ
- DayGraphTimeline 改変 0 (= 3 props セット規約再利用)
- 危険境界 0 (= 既存 frozen 規約で守られる)
- backward compat 100% (= 3 props 未指定で従来挙動)
- 機械検証 80-90 件で全件保証

### 12.3 停止条件再確認

実装中に以下が発生した場合、 **即停止**:
- DayGraphTimeline 改変が必要 (= 設計違反)
- MapTab 改変が必要 (= 設計違反)
- DOM の hidden (= visibility:hidden / display:none) が必要 (= conditional render 規約違反)
- PlanClient core state 化が必要 (= 設計違反)
- 警告色 / icon / 警告文言が必要 (= 永続規約違反)

---

## 13. 凍結 / 連続 OK / 禁止リスト

### 13.1 凍結対象 (= 触らない)

- 全 49 frozen branches
- M-3c-ui MapTab-only @ `e5527f1b`
- DayGraphTimeline (= M-3c-ui で確立した 3 props 拡張、 改変 0)
- MapTab (= M-3c-ui wiring、 改変 0)
- 全 lib/plan/feasibility / lib/plan/transport / lib/plan/dayGraph

### 13.2 連続 OK

- 本 audit (= docs only)
- M-3d 実装 (= low-risk なら連続 GO):
  - `_useCalendarTabFeasibilityDisplay.ts` 新規
  - `_useFlowWeekFeasibilityDisplay.ts` 新規
  - CalendarTab.tsx 拡張
  - FlowTab.tsx 拡張
  - tests 2 件新規
- decision-log 追記

### 13.3 禁止

- frozen branches への追加 commit
- DayGraphTimeline 改変 (= 設計違反)
- MapTab 改変 (= 設計違反)
- Calendar month/grid 全件展開
- PlanClient core state 化
- localStorage / persist
- amber / orange / red / icon / badge / warning box
- warning / recommendation / optimization 文言
- Arrival Risk Memory
- DB / env / package / dependency 変更
- runtime telemetry sink
- Counterfactual / Routes API / 実 API 連携
- fetch / push / gh / reset / restore / stash / branch delete

---

## 14. CEO 報告 + 停止条件

### 14.1 本 audit の到達点

- Phase 3 J/K/L/M/N 残範囲棚卸し (= §0)
- M-3d 責務確定 (= Calendar/Flow 展開)
- 連続 GO 判定 (= §2)
- CalendarTab / FlowTab 接続設計 (= §3-4)
- per-day state 設計 (= 革新 M-3d-1)
- 機械検証 plan (= 80-90 tests)
- 危険境界遵守 全件 0
- 自律推奨: **連続実装 GO**

### 14.2 次の流れ

1. ✅ 本 audit 着地 (= 棚卸し + readiness)
2. ⏳ M-3d 実装連続 GO (= CEO 承認 or 連続 GO)
3. CEO visual smoke (= CalendarTab + FlowTab + backward compat)
4. M full closeout
5. Phase 3-N readiness audit (= Home/Plan polish 含む)

### 14.3 停止条件

以下が発生したら **即停止**:
- 実装中に DayGraphTimeline / MapTab / PlanClient 改変が必要
- DOM hidden (= visual hidden) が必要
- Calendar month/grid 展開が必要
- 警告色 / icon / 警告文言が必要
- localStorage / DB / env / package / dependency が必要
- Arrival Risk / Counterfactual / Routes API に近づく

---

**完了**: M-3d readiness audit 着地。 Phase 3 残範囲棚卸し + M-3d 責務確定 + 連続 GO 判定 + 設計詳細 + 機械検証 plan + 危険境界 0 確認。 自律推奨は **連続実装 GO**。
