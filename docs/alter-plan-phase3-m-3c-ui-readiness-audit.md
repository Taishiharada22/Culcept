# Phase 3-M-3c-ui Readiness Audit (= MapTab UI 接続 — 「本当に見せるべきか / どの条件なら見せてよいか」)

**作成日**: 2026-05-23
**承認**: CEO + GPT 合議 (= 2026-05-23 M-3c-pure-harden freeze 後、 「M-3c-ui readiness audit に進む。 ただし UI 実装にはまだ入らない」 指示、 10 項目確認指示)
**範囲**: 「不足 N 分」 を user 画面に出すべきか の根本判断 + 出す場合の最小 scope + 発見性 affordance + tab/day reset + visual smoke 計画
**前提 freeze**:
- M-3c-pure-harden @ `399c5783` (= EMPTY_EXPANDED_INDICES export 削除、 mutation 攻撃面構造的除去)
- M-3c readiness audit @ `db1ccd9d` (= 7 項目 + observational disclosure 思想)
- M-3b-pure @ `0b560b55` (= 単一 disclosure state machine、 default hidden 永続規約)
- M-3b readiness audit @ `34d11a90` (= observational disclosure 思想、 7 候補評価)
- M-3a @ `4646a2fd` (= Pre-UI pipeline)
- M-2a/M-2b @ `f42cf539` (= display formatter + 9 invariants)
- M-1 @ `fd2808f8` (= dayFeasibilityComputation)
- K phase / L phase 全 freeze

> 本 audit は **docs only**。 MapTab / DayGraphTimeline / Calendar / Flow への UI 実装 (= 「不足 N 分」 を画面に出す) は **絶対に進まない**。 CEO 別承認 + visual smoke 必須。 「pure 層は堅固、 UI に出す瞬間は別の危険境界」 思想を厳守。

---

## 0. ゴールから逆算 — 「**本当に見せるべきか / どの条件なら見せてよいか**」

### 0.1 中心問い

Aneurasync 中心問い:
> **「自分って、 そういう人間だったのか」**

M-3c-ui の中心問い (= GPT 補正で確定):
> **「不足 N 分」 を user 画面に出すことが、 Aneurasync の自己理解体験を本当に育てるか?**

これは 「pure 層は堅固 vs UI 出力は別の危険境界」 という分離原則の核心:
- M-3c-pure-harden = state machine + mutation 防御で**完全 freeze**
- M-3c-ui = 「画面に出す瞬間」 = **新しい危険境界、 別 audit**

### 0.2 自己理解 体験 vs 圧体験 — 二項対立の解析

| 体験 | pattern | Aneurasync 整合 |
|---|---|---|
| **AI が「不足だ」 と指摘** | 警告化 / push 表示 | ❌ 反 Aneurasync |
| **user が能動 expand で「不足」 観測** | observational disclosure | ✅ Aneurasync 思想 |
| **user が能動 expand で「余白」 観測** | observational disclosure (= ポジティブ確認) | ✅ |
| **「不足」 を見たくない user が見ない選択** | user agency 100% | ✅ |
| **「観測したらきつくなる」 体験** | 観測が user 自身を縛る | ⚠️ 検証必要 |

→ **「user が能動的に観測する」 限り Aneurasync 整合**、 但し 「観測したらきつい」 体験は smoke で検証必要。

### 0.3 「画面に出す瞬間」 の不可逆性

「不足 40 分」 を user が画面で見ると:
- ✅ 「自分は予定詰めすぎる癖がある」 と自己理解
- ⚠️ 「今日のスケジュール、 ヤバいかも」 と焦り
- ⚠️ 「不足を指摘された」 と感じる (= 押し付け感)
- ✅ 「観測したい時だけ見える」 で agency 維持

体験の振れ幅が大きい。 → **smoke 必須**、 「user が能動 expand する文脈」 をしっかり設計する必要。

---

## 1. CEO + GPT 指定 10 項目への自律推論回答

### 1.1 MapTab-only で始めるべきか (= 項目 #1)

**結論**: **YES、 MapTab-only で始める**。

**根拠**:
- MapTab は **selectedDate-centric** (= user が 1 日の流れを観察する場)
- 「1 日の構造」 section に DayGraphTimeline が既に統合済 (= K-3c-i)
- L-4d で MovementDisplayView 接続済 (= 「移動 約 N 分」)
- M-3a の feasibility 出力を同じ DayGraphTimeline に追加するのが自然
- Calendar / Flow は 7 日 grid → density 観点で disclosure UI 圧が高くなる可能性 (= M-3c-extend で別 audit)

**逆ケース**:
- もし「全タブ統一」 で実装すると、 visual smoke 検証範囲が広がる → 不利
- 「MapTab で初観測 → 学習 → Calendar/Flow へ展開」 が user の自然な path

### 1.2 disclosure trigger を何にするか (= 項目 #2)

**結論**: **transition line 単一 tap toggle**。

**詳細**:
- transition `<li>` 自体に `onClick` (= toggle)
- keyboard: `tabIndex={0}` + `onKeyDown` で Enter/Space
- hover は trigger に **使わない** (= CEO 規約)
- mobile tap target 44x44 dp 確保 (= 既存 li padding で実現可能)
- aria-expanded で状態示唆

**実装シグネチャ案**:
```typescript
<li
  role="listitem"
  className={...}
  data-testid="day-graph-transition"
  tabIndex={isInteractive ? 0 : -1}
  onClick={isInteractive ? handleToggle : undefined}
  onKeyDown={isInteractive ? handleKeyDown : undefined}
  aria-expanded={isInteractive ? isExpanded : undefined}
  aria-controls={isInteractive && isExpanded ? `feasibility-${transitionIndex}` : undefined}
  cursor: pointer (= isInteractive 時のみ)
>
  ...
</li>
```

### 1.3 発見性をどう担保するか (= 項目 #3)

**結論**: **革新 U4 — 最小 textual hint** + 「視覚 affordance 0」 補正。

**設計検討の比較**:

| 案 | 評価 | 採用 |
|---|---|---|
| A. 視覚 affordance 0 (= cursor pointer のみ) | 発見不能リスク (= GPT 補正指摘) | ❌ |
| B. icon / chevron / dot | 警告感 / icon 禁止 (= CEO 規約) | ❌ |
| C. badge / chip | 警告化リスク (= CEO 規約) | ❌ |
| D. amber/orange/red 文字色 | 警告色 (= CEO 規約) | ❌ |
| E. hover 時のみ表示 | hover-only 禁止 (= CEO 規約) | ❌ |
| **F. 最小 textual hint** (= 「詳細」) | 控えめテキスト、 警告感なし、 発見性確保 | ✅ **採用候補** |
| G. underline / dashed | typography 装飾 (= 警告感の可能性) | ⚠️ 補助案 |
| H. 1px border | 視覚境界 (= 警告化リスク) | ❌ |

**革新 U4 詳細**:
- transition line 末尾に **`詳細`** テキスト (= 2 文字、 中立)
- styling = K-3c-iii tier_2_movement_aux と同階調 (= text-xs italic text-slate-400)
- 「詳細」 を選んだ理由:
  - 「観測」 「みる」 → 意図的すぎ、 教育的に響く
  - 「詳細」 → 中立、 一般的、 警告感 0
  - 「›」 等の chevron → icon 扱い、 不採用
- expanded 時は `詳細` → `閉じる` に文言切替 (= a11y 補完)

**Alternative — 発見性をさらに削減する case**:
- 「詳細」 すら付けず、 transition line を hover で背景 0.03 程度の opacity 変化のみ
- 但し hover-only 禁止と矛盾 → 不採用
- → **「詳細」 textual hint 採用が最終結論**

**警告化リスクの再確認**:
- 「詳細」 = 中立、 警告ではない
- styling = K-3c-iii tier_2 と同階調 = 移動 line と並列に弱い
- background なし、 border なし、 icon なし、 警告色なし
- → 警告化リスク **0**

### 1.4 default hidden を UI でどう守るか (= 項目 #4)

**結論**: **`useState<ExpandedTransitionIndices>(resetAllDisclosures)` で機械保証**。

**理由**:
- M-3c-pure-harden で `resetAllDisclosures()` は毎回新規 empty Set を返す
- React lazy initial state pattern (= 関数を渡すと初回マウント時のみ呼ばれる)
- 初期は **必ず**空 Set → 全 hidden
- TypeScript type system で `Set<string>` 等を渡す path がない (= `ExpandedTransitionIndices = ReadonlySet<number>`)

**caller 規約 (= M-3c-ui で永続規約化)**:
```typescript
// 規約: 必ず resetAllDisclosures 経由で初期化
const [expanded, setExpanded] = useState<ExpandedTransitionIndices>(
  resetAllDisclosures,
);

// NG (= 規約違反):
const [expanded, setExpanded] = useState(new Set<number>()); // 永続定数の lookup 不能、 mutation 攻撃可能
```

### 1.5 tab/day 切替時 reset をどう扱うか (= 項目 #5)

**結論**: **`useEffect` で selectedDate 変化を検知 → reset**。

**設計**:
```typescript
const [expanded, setExpanded] = useState<ExpandedTransitionIndices>(
  resetAllDisclosures,
);

useEffect(() => {
  // selectedDate が変わるたびに reset
  setExpanded(resetAllDisclosures());
}, [selectedDate]);
```

**tab 切替 reset**:
- MapTab の unmount で React は state を破棄 → 次回 mount で initial state (= 空 Set) に戻る
- 別途 reset 処理は不要 (= React mount/unmount が自然な reset を担保)
- 但し PlanClient で MapTab を **常時 mount** している場合は明示 reset が必要 → 要確認

**user 体験**:
- selectedDate 変化 → 全 hidden に戻る → 「観測の幕間」 体験
- user は「新しい日 を見るときは fresh な目で観測」

### 1.6 localStorage / persist は使わないこと (= 項目 #6)

**結論**: **遵守、 localStorage / sessionStorage / cookie 0 使用**。

- M-3c-pure-harden は no localStorage (= 機械検証済)
- M-3c-ui でも追加禁止
- 「観測したことを忘れる」 体験 (= 革新 9) を機械保証

### 1.7 transitionIndex のみで state 管理 (= 項目 #7)

**結論**: **遵守、 PII 完全不在**。

- `ExpandedTransitionIndices = ReadonlySet<number>` 型遵守
- DayGraphTimeline に渡す props も number key のみ
- nodeId / anchorId / locationText / title / userId / sensitive 完全排除

**機械検証**:
- M-3c-pure-harden test §13 で JSON.stringify grep 検証済
- M-3c-ui でも同様の test 追加 (= props で渡されるデータの grep)

### 1.8 「余白 N 分」 「不足 N 分」 は user request_expand 後のみ表示 (= 項目 #8)

**結論**: **データ層 + 表示層 + 状態層の三重防御**。

| 防御層 | 規約 | 機械検証 |
|---|---|---|
| データ層 (M-2a) | not_applicable は map から除外 | 既存 M-2b assertion |
| 表示層 (DayGraphTimeline) | `feasibilityDisplayByTransitionIndex.has(idx) === false` なら render しない | M-3c-ui test |
| 状態層 (ExpandedTransitionIndices) | `expandedTransitionIndices.has(idx) === false` なら render しない | M-3c-pure-harden test §15 |

全 3 層を通過した場合のみ「不足 N 分」 が画面に出る → push 表示構造的不可能。

### 1.9 sensitive / not_applicable / unresolved / location_unknown では表示しない (= 項目 #9)

**結論**: **既に M-2a で機械保証済、 M-3c-ui で再確認**。

**検出方法**:
- `feasibilityDisplayByTransitionKey.has(key) === false` で gate
- M-2a で not_applicable は map から除外済
- L overlay の variant=unresolved → M-1 で not_applicable → M-2a で map 不在

**M-3c-ui での二重確認**:
- caller (= MapTab) が `M-3a.feasibilityDisplay` を取得
- DayGraphTimeline に渡す map は **そのまま** (= M-2a 経由でフィルタ済)
- DayGraphTimeline は `map.has(idx) === false` で skip
- → 二重防御が自然に成立

### 1.10 K-3c-iii / L-4d の階層を侵さない (= 項目 #10)

**結論**: **既存階層を完全継承、 optional prop 追加のみ**。

**階調設計** (= K-3c-iii tier_2 継承):

```
[09:00] ショッピング (= event)            ← strong: text-base font-medium text-slate-900
    → 移動 約 90 分  詳細                ← medium: text-sm text-slate-500 (= K-3c-iii) + tap target
    ┊ 余白 40 分                         ← weak: text-xs italic text-slate-400 (= tier_2)
[10:30] ロイヤルホスト (= event)           ← strong
```

階調の段差:
- event = 1.0
- transition (= L-4d MovementDisplayView 経由) = 0.6
- **feasibility disclosure (= M-3c-ui) = 0.3** (= K-3c-iii tier_2 同階調)

**styling 規約 (= 永続)**:
- text-xs italic text-slate-400
- padding-left を transition より 1 段深く (= pl-8)
- background なし
- border なし
- icon なし
- amber/orange/red 不使用
- variant (= slack/shortfall) で class 違い 0

---

## 2. M-3c-ui scope 定義 (= 最小実装)

### 2.1 実装範囲 (= CEO 承認後の M-3c-ui phase)

| 対象 | 内容 | 変更量 |
|---|---|---|
| `DayGraphTimeline.tsx` | optional props 3 つ追加 + TransitionItem 拡張 + 補助行 render | optional 拡張のみ |
| `MapTab.tsx` | feasibility pipeline call + useState + useEffect reset + toggle handler | 限定的接続 |
| `tests/unit/plan/...` | 統合 tests (= UI wiring + a11y + 三重防御) | new file |

### 2.2 DayGraphTimeline 拡張 props (= 3 つ追加)

```typescript
export interface DayGraphTimelineProps {
  // ... 既存 props ...

  /**
   * M-3c-ui: feasibility display (= optional)
   * transitionIndex → FeasibilityDisplayView の map
   * 未指定なら disclosure 機能無効 (= K-3c-iii / L-4d のみ)
   */
  readonly feasibilityDisplayByTransitionIndex?: ReadonlyMap<number, FeasibilityDisplayView>;

  /**
   * M-3c-ui: 現在 expanded な transition の Set
   * 未指定なら disclosure 機能無効
   */
  readonly expandedTransitionIndices?: ReadonlySet<number>;

  /**
   * M-3c-ui: 「詳細 / 閉じる」 tap callback
   * 未指定なら disclosure 機能無効
   */
  readonly onToggleFeasibilityDisclosure?: (transitionIndex: number) => void;
}
```

**3 つ全て指定された時のみ** disclosure UI が有効化。 1 つでも欠ければ既存 K-3c-iii / L-4d 通りの挙動 (= backward compat 100%)。

### 2.3 MapTab 改変範囲

```typescript
// 既存 useMapTabMovementDisplay の隣に新 hook 追加
const feasibilityDisplay = useMapTabFeasibilityDisplay(
  dayGraphByDate[isoDate(selectedDate)],
  overlayResult,
);

// disclosure state
const [expandedTransitions, setExpandedTransitions] = useState<ExpandedTransitionIndices>(
  resetAllDisclosures,
);

// selectedDate 変化で reset (= 「観測の幕間」)
useEffect(() => {
  setExpandedTransitions(resetAllDisclosures());
}, [selectedDate]);

// toggle handler
const handleToggleDisclosure = useCallback((transitionIndex: number) => {
  setExpandedTransitions((current) => {
    const currentState = getDisclosureStateForIndex(current, transitionIndex);
    const action = currentState === "expanded" ? "request_collapse" : "request_expand";
    return applyDisclosureAction(current, transitionIndex, action);
  });
}, []);

// DayGraphTimeline に渡す
<DayGraphTimeline
  result={dayGraphByDate[isoDate(selectedDate)] ?? null}
  movementDisplayByTransitionIndex={movementDisplayByTransitionIndex}
  feasibilityDisplayByTransitionIndex={feasibilityDisplay.feasibilityDisplayByTransitionIndex}
  expandedTransitionIndices={expandedTransitions}
  onToggleFeasibilityDisclosure={handleToggleDisclosure}
  ...
/>
```

### 2.4 useMapTabFeasibilityDisplay 新 hook (= optional、 自律設計)

```typescript
function useMapTabFeasibilityDisplay(
  buildResult: BuildDayGraphResult | undefined,
  overlayResult: OverlayResult | undefined,
): {
  feasibilityDisplayByTransitionIndex: ReadonlyMap<number, FeasibilityDisplayView>;
} {
  return useMemo(() => {
    if (!buildResult || !overlayResult) {
      return { feasibilityDisplayByTransitionIndex: new Map() };
    }
    const pipeline = runFeasibilityDisplayPipeline({
      graph: buildResult.graph,
      overlayResult,
    });
    const map = new Map<number, FeasibilityDisplayView>();
    for (const view of pipeline.feasibilityDisplay.feasibilityDisplayByTransitionKey.values()) {
      map.set(view.transitionIndex, view);
    }
    return { feasibilityDisplayByTransitionIndex: map };
  }, [buildResult, overlayResult]);
}
```

→ M-3c-ui 実装時に新規作成。 docs only audit では設計案として明示。

### 2.5 補助行 render 構造 (= DayGraphTimeline 内)

```tsx
{node.kind === "event" && tl.transitionsByFromNodeId[node.anchorId] && (
  <Fragment>
    {/* L-4d MovementDisplayView (= 既存) */}
    <TransitionItem
      view={tl.transitionsByFromNodeId[node.anchorId]!}
      displayOverride={movementDisplayByTransitionIndex?.get(transitionIndex)}
      // M-3c-ui 追加 props
      feasibilityDisplay={feasibilityDisplayByTransitionIndex?.get(transitionIndex)}
      isExpanded={expandedTransitionIndices?.has(transitionIndex) ?? false}
      onToggleDisclosure={
        onToggleFeasibilityDisclosure && feasibilityDisplayByTransitionIndex?.has(transitionIndex)
          ? () => onToggleFeasibilityDisclosure(transitionIndex)
          : undefined
      }
    />

    {/* M-3c-ui 補助行 (= expanded 時のみ) */}
    {expandedTransitionIndices?.has(transitionIndex) &&
      feasibilityDisplayByTransitionIndex?.has(transitionIndex) && (
        <FeasibilityDisclosureLine
          view={feasibilityDisplayByTransitionIndex.get(transitionIndex)!}
          transitionIndex={transitionIndex}
        />
      )}
  </Fragment>
)}
```

### 2.6 FeasibilityDisclosureLine component 案

```tsx
function FeasibilityDisclosureLine({
  view,
  transitionIndex,
}: {
  view: FeasibilityDisplayView;
  transitionIndex: number;
}): ReactElement {
  return (
    <li
      role="listitem"
      id={`feasibility-${transitionIndex}`}
      aria-label={`このtransitionの${view.variant === "slack" ? "余白" : "不足"}`}
      className="text-xs italic text-slate-400 pl-8"
      data-testid="day-graph-feasibility-disclosure"
      data-variant={view.variant}
    >
      {view.displayText}
    </li>
  );
}
```

- styling = K-3c-iii tier_2_movement_aux 同階調
- variant は class でなく data-variant のみ (= 視覚差なし、 偏見 0)
- icon / background / border / 警告色 0

---

## 3. 革新的アイデア集 (= M-3c-ui 固有、 10 件)

### 3.1 革新 U1: 「最小 textual hint」 採用

「詳細」 (= 2 文字、 中立、 警告感 0) を transition line 末尾に追加。 視覚 affordance 0 の発見不能問題を解決しつつ警告化を回避。

### 3.2 革新 U2: expanded 時の文言切替 (= 「詳細」 → 「閉じる」)

a11y 補完 + state 示唆を minimal textual で実現。 chevron 等 icon を使わずに 「open/close」 状態を伝達。

### 3.3 革新 U3: 三重防御で push 表示構造的不可能化

データ層 (M-2a) + 表示層 (DayGraphTimeline) + 状態層 (ExpandedTransitionIndices) の 3 層全てを通過しないと render しない設計。 1 層 breach されても他 2 層で防御。

### 3.4 革新 U4: React lazy initial state で default hidden 機械保証

`useState(resetAllDisclosures)` (= 関数 reference を渡す) で:
- 初期 state は **必ず**新規 empty Set
- harden した「永続定数 export なし」 規約を React 側で遵守
- 「再 render 時に EMPTY 定数を import → mutation 攻撃」 が構造的に不可能

### 3.5 革新 U5: `useEffect([selectedDate])` で 「観測の幕間」 自動 reset

selectedDate 変化で `setExpanded(resetAllDisclosures())` を自動呼出 → user は何もしなくても reset 体験を得る。 forgetting curve / fresh observation 設計 (= 革新 9) の UI 実装。

### 3.6 革新 U6: 「3 props セット」 で disclosure 有効化

`feasibilityDisplayByTransitionIndex` + `expandedTransitionIndices` + `onToggleFeasibilityDisclosure` の **3 つ全て指定**で初めて UI 有効化。 1 つでも欠ければ backward compat 100% (= K-3c-iii / L-4d のまま)。 段階的展開と統一規約。

### 3.7 革新 U7: tap target は line 全体、 textual hint は guide のみ

「詳細」 部分だけが clickable ではなく、 transition line **全体**が tap target。 mobile a11y で 44x44 dp を確実に確保。 「詳細」 は視覚 guide のみ。

### 3.8 革新 U8: variant 別 styling 0 で偏見排除

`data-variant="slack"` / `data-variant="shortfall"` は data attribute のみ、 class 違いなし。 → 余白 / 不足 完全同 styling = 偏見 0 (= ポジティブ偏見も作らない)。

### 3.9 革新 U9: density-aware progressive disclosure (= 将来 audit)

1 日 transition 数で affordance 濃度を変える将来設計:
- 1-2 件 → affordance なし (= 観測する必然性低)
- 3-5 件 → 「詳細」 textual hint (= 本 audit 範囲)
- 6+ 件 → single-open mode (= 同時 1 つだけ expanded、 M-3c-extend)

M-3c-ui では取り入れず、 future audit でのみ提案。

### 3.10 革新 U10: 5 人 visual smoke で「不足体験」 を質的検証

実装前に 5 人 user smoke:
- 「ここに観測がある」 を発見できるか?
- 「不足 40 分」 を見た時の体験を質的に聞く
- 「観測したい時」 と「観測したくない時」 を判定

CEO smoke の延長、 質的データで「画面に出すべきか」 を最終判断。

---

## 4. ユーザー心理シナリオ — 10 件深掘り (= M-3b/M-3c で 8 件、 M-3c-ui で +10 新規)

### 4.1 シナリオ 1: 「初めて MapTab を見た user」

- 朝 8 時、 MapTab を開く
- DayGraphTimeline に 4 transitions、 各 line 末尾に「詳細」
- → user は「あ、 これ tap できるな」 と気付く (= 発見性確保)
- 試しに 1 つ tap → 「余白 40 分」 展開
- → 「あ、 こういう情報が見える」 学習体験

評価: ✅ Aneurasync 中心問い接続 (= 「自分って、 そういう人間だったのか」 の入口)

### 4.2 シナリオ 2: 「全 transition tap して全部見たい user」

- 4 件全部 tap → 補助行 4 行展開
- 画面密度↑、 但し許容範囲 (= 1 日 transition 数が少ない)
- 1 日 6+ transition なら density guard 必要 (= M-3c-extend)

評価: ✅ user agency 維持、 future improvement あり

### 4.3 シナリオ 3: 「不足を見たくない user」

- 朝 MapTab → 「詳細」 hint があるが tap しない
- 静かな timeline のまま
- → push なし、 user 選択で「観測しない」 を保持

評価: ✅ user agency 100% (= 「観測したくない」 を尊重)

### 4.4 シナリオ 4: 「うっかり tap user」

- tap → 「不足 30 分」 が出る
- 「あ、 違う、 閉じよう」 → 「閉じる」 (= 同じ位置の textual hint) tap
- 状態が hidden に戻る → user 安心

評価: ✅ undo affordance (= tap toggle で可逆)

### 4.5 シナリオ 5: 「不足を見て焦る user」

- tap → 「不足 60 分」
- → 「ヤバい、 今日のスケジュール無理かも」 と焦る
- これは Aneurasync 整合か?

**自律分析**:
- 「user 能動 expand なので押し付けではない」 → 思想整合
- 但し体験として「観測したらきつい」 → smoke 必要
- 「不足を見たくない」 user は最初から expand しないので影響なし

評価: ⚠️ smoke 必要 (= 「観測したら焦る」 体験が許容範囲か質的判定)

### 4.6 シナリオ 6: 「不足を見て自己理解する user」

- 1 週間後、 過去日を振り返り
- 連続日で「不足」 を観測 → 「自分は予定詰めすぎる癖がある」 と気付く
- → Aneurasync 中心問い直接接続

評価: ✅ self-awareness trigger (= 最高体験)

### 4.7 シナリオ 7: 「忙しく tab 切替する user」

- MapTab → CalendarTab → 戻ってきた MapTab
- React 側で state は破棄 → mount で空 Set → 全 hidden
- user は「あ、 また見に行く」 と能動性再起動

評価: ✅ 「観測の幕間」 設計 (= revolutionary 5)

### 4.8 シナリオ 8: 「観測しすぎを自覚する user」

- 毎日 MapTab で「不足」 を確認する習慣
- → user 自身が「観測しすぎかも」 と気付く
- 「観測しない日」 を選ぶ自由がある

評価: ✅ user 自身が観測習慣を制御 (= 「観測したことを忘れる」 体験で習慣化を防ぐ)

### 4.9 シナリオ 9: 「共有 user (= 友人に画面を見せる)」

- MapTab を友人に見せる
- expanded 状態が残っていると 友人にも「不足 40 分」 が見える
- これは privacy 問題か?

**自律分析**:
- 「不足 N 分」 は数字のみで、 anchor / location / title は出ない (= PII 0)
- 共有時に「自分の予定の余白」 が見えるのは想定内 (= user の選択)
- 但し共有頻度高 user は「観測を見せたくない」 ことも → reset 必須

**緩和策**: tab 切替で reset (= 「観測の幕間」、 革新 5)

評価: ✅ PII 0、 reset 設計でカバー

### 4.10 シナリオ 10: 「sensitive な日 (= 性病院通院等) の user」

- selectedDate に sensitive anchor あり
- → L overlay で variant=unresolved → M-1 で not_applicable
- → 「移動」 は表示されるが「不足/余白」 は出ない (= 三重防御)
- 「詳細」 hint も出ない (= M-3a 出力に該当 transition がないため)

評価: ✅ sensitive proximity 構造的保護 (= L-3c 規律継承)

---

## 5. 二重 / 三重防御 plan (= 機械検証)

### 5.1 表示しない条件 一覧

| 条件 | 検出層 | 機械検証 |
|---|---|---|
| not_applicable | M-2a で map から除外 | M-3a tests + M-2b assertion |
| sensitive proximity | L-3c で overlay variant=unresolved → M-1 で not_applicable | L-3c hardening tests |
| unresolved movement | 同上 | 同上 |
| location_unknown | 同上 | 同上 |
| M result と L view 非対応 | transitionIndex 不一致 → map.has(key)===false | M-2a / M-3c-ui test |
| user が expand していない | `expandedTransitionIndices.has(idx)===false` | M-3c-pure-harden test §15 + M-3c-ui test |

### 5.2 三重防御の構造

```
[L overlay] → [M-1 dayFeasibility] → [M-2a display formatter] → [M-3a pipeline] → [M-3c-ui]
                                                                                       ↓
                                          [feasibilityDisplayByTransitionIndex.has(idx)] ← Layer 1: データ層
                                                                                       ↓
                                                                          [expandedTransitionIndices.has(idx)] ← Layer 2: 状態層
                                                                                       ↓
                                                                            [render <FeasibilityDisclosureLine>] ← Layer 3: 表示層
```

1 層でも false → render しない (= 「不足 N 分」 が画面に出ない)。

### 5.3 機械検証 plan (= M-3c-ui tests)

- §1. 三重防御 unit test (= 各層独立)
- §2. integration test (= 3 層全件通過時のみ render)
- §3. sensitive proximity case (= L-3c 経由で not_applicable が render しない)
- §4. unresolved movement case (= 同上)
- §5. user が expand しない case (= render しない)
- §6. user が expand した case (= render する)
- §7. tab/day 切替 reset
- §8. a11y (= aria-expanded / aria-controls / keyboard)
- §9. PII grep (= props で渡るデータが PII 不在)
- §10. K-3c-iii / L-4d 既存 styling 不変
- §11. Backward compat (= 3 props 未指定で従来挙動)

予測 test 数: 50-70 件。

---

## 6. visual smoke 計画 (= 質的検証、 CEO 承認後)

### 6.1 smoke 範囲

- **5 人 user smoke** (= テストユーザー、 知人、 CEO 本人)
- MapTab + DayGraphTimeline + feasibility disclosure を実機で観察
- 各 user に以下を質問:
  1. 「ここに観測がある」 を発見できますか? (= 発見性検証)
  2. tap してみてください → 「不足 40 分」 を見た時の体験は?
  3. 「閉じる」 で閉じてください → 元に戻れますか?
  4. selectedDate 変えてみてください → reset 体験は?
  5. 「観測したい時」 と「観測したくない時」 はあるか?

### 6.2 評価基準

| 指標 | 合格条件 |
|---|---|
| 発見性 | 5 人中 4 人以上が tap 可能性に気付く |
| 体験 | 「焦る」 「圧」 を感じる user 0 人 / 5 人 (= 圧体験 0 が必須) |
| undo 体験 | 5 人中 5 人が「閉じる」 を発見 |
| reset 体験 | 5 人中 3 人以上が「日切替で reset 」 を体感 |
| user agency | 5 人中 5 人が「観測したくない時は tap しない」 を理解 |

**1 つでも不合格 → M-3c-ui ロールバック または revise**。

### 6.3 smoke 環境

- localhost (= preview deploy ではなく実機 dev)
- 5 人別々のセッション
- 質的データを記録 (= ユーザー音声 / 文字起こし)
- 数値化は最小限 (= 「焦った」 vs 「平静」 等の二値)

### 6.4 smoke 失敗時の対応

| 失敗 case | 対応 |
|---|---|
| 発見性不足 | textual hint を「詳細」 → 「観測」 等に修正 (= M-3c-ui revision) |
| 圧体験あり | 「不足」 を見たときの体験設計を再検討 (= M-3c-ui rollback) |
| undo 不発見 | 「閉じる」 文言を「× 閉じる」 等に強化 (= 但し icon 不使用 規約) |
| reset 不体験 | selectedDate UI を強化 (= 別 issue) |
| user agency 不理解 | docs / onboarding 追加 (= 別 issue) |

---

## 7. caller (= MapTab) / callee (= DayGraphTimeline) 改変範囲

### 7.1 MapTab.tsx 改変一覧

**追加**:
- `useMapTabFeasibilityDisplay` 新 hook (= 別 file)
- `useState<ExpandedTransitionIndices>(resetAllDisclosures)` for disclosure state
- `useEffect([selectedDate])` で reset
- `handleToggleDisclosure` callback
- DayGraphTimeline に 3 props 追加 pass

**変更 file** (= 予測):
- `app/(culcept)/plan/tabs/MapTab.tsx` (= 拡張)
- `app/(culcept)/plan/tabs/_useMapTabFeasibilityDisplay.ts` (= 新規)

**変更しない**:
- CalendarTab.tsx
- FlowTab.tsx
- PlanClient.tsx
- 他全 tab / component

### 7.2 DayGraphTimeline 改変一覧

**追加**:
- 3 optional props (= feasibilityDisplayByTransitionIndex / expandedTransitionIndices / onToggleFeasibilityDisclosure)
- TransitionItem の onClick / tabIndex / onKeyDown / aria-expanded / aria-controls
- 「詳細 / 閉じる」 textual hint render (= conditional)
- `<FeasibilityDisclosureLine>` 補助行 render (= conditional)

**変更 file**:
- `app/(culcept)/plan/components/DayGraphTimeline.tsx` (= 拡張)

**変更しない**:
- 既存 K-3c-iii compact mode
- 既存 L-4d MovementDisplayView 接続
- 既存 EventItem / GapItem / BoundaryItem
- 既存 a11y (= role / aria-label 等)

### 7.3 backward compat 保証

- 3 optional props 全て未指定 → 既存 K-3c-iii / L-4d 通りの挙動
- 1 つでも欠ければ disclosure 無効
- 既存 caller (= CalendarTab / FlowTab) は本 audit では何も渡さない → 影響 0

---

## 8. tests scope (= M-3c-ui 実装時に追加予定)

### 8.1 unit tests

| § | 範囲 | tests 数 |
|---|---|---|
| §1 | 三重防御 unit | 6 |
| §2 | integration (3 層通過) | 4 |
| §3-4 | sensitive / unresolved | 4 |
| §5-6 | user expand 状態 | 4 |
| §7 | tab/day 切替 reset | 3 |
| §8 | a11y (keyboard / aria) | 6 |
| §9 | PII grep (= props 経由) | 4 |
| §10 | K-3c-iii / L-4d 不変 | 4 |
| §11 | backward compat | 3 |
| **合計** | | **~38** |

### 8.2 integration test (= MapTab smoke 相当)

- MapTab 全体の wiring (= feasibility hook + state + DayGraphTimeline pass) — 6 tests

### 8.3 a11y dedicated tests

- aria-expanded toggle 動作 — 3 tests
- keyboard navigation — 4 tests
- aria-controls 関連 — 2 tests

**予測総 tests**: 50-60 件。

---

## 9. CEO 判断項目 (= 報告で停止)

### 9.1 7 件の根本判断

1. **M-3c-ui 着手 timing**: 本 audit 直後 / smoke 後 / N phase 後 / pivot
2. **「不足 N 分」 画面表示の最終容認**: ✅ 容認 (= 既に M-3c で条件付き容認) / 別文言で代替 / 取りやめ
3. **発見性 affordance「詳細」 採用**: ✅ 採用 / 別文言 (= 「観測」 「みる」 「拡張」 等) / 視覚 0 維持
4. **tab/day reset 設計**: useEffect 自動 reset 採用 / 別手段 / persist 検討
5. **5 人 visual smoke 計画**: 採用 / 1-3 人で十分 / smoke 不要
6. **density-aware 取入れ**: M-3c-extend で / M-3c-ui に含める / 不要
7. **「不要なら不採用」 選択肢**: 着手 / 取りやめ (= pure 層で完結) / 保留

### 9.2 critical boundary (= CEO 必須判断)

| Boundary | 内容 |
|---|---|
| **G1**: 「不足 N 分」 が画面に出ること | M-3c で条件付き容認、 M-3c-ui で実画面初露出 |
| **G2**: 発見性 affordance vs 警告化 | 「詳細」 採用案、 user smoke で最終判定 |
| **G3**: reset 設計の妥当性 | useEffect 自動 vs 明示 button |
| **G4**: smoke 5 人不足の保証 | 質的データで「圧体験 0 / 5 人」 必須 |
| **G5**: 「pure で完結する」 選択肢 | pure 層 (M-3c-pure-harden) で停止して N phase に進む path |

---

## 10. 「UI 接続しない」 選択肢の検討 (= 自律で別案提示)

### 10.1 「pure で完結」 path

- M-3c-pure-harden で完全 freeze (= 既に達成)
- M-3c-ui は実装しない
- N phase / 別軸 pivot に進む

**メリット**:
- 危険境界に近づかない
- pure 層が完全堅固
- Aneurasync 思想の最大尊重 (= 「不足を見せない」 完全形)

**デメリット**:
- M-1 / M-2 / M-3a / M-3b の実装が user に届かない
- 自己理解体験 (= 「自分って、 そういう人間だったのか」) への直結が遅れる
- pure 層は実用化されないまま完結

### 10.2 「条件付き UI 接続」 path (= 本 audit 推奨)

- M-3c-ui で MapTab-only UI 接続
- visual smoke で質的検証
- 圧体験 0 が確認できた場合のみ本実装

**メリット**:
- 段階的 risk 抑制
- user 体験を質的検証可能
- Aneurasync 思想接続

**デメリット**:
- smoke で「圧体験あり」 だった場合 rollback コスト
- UI に出す瞬間が新たな危険境界 (= GPT 指摘)

### 10.3 「集計 disclosure 別 path」 (= M-4+ 別軸)

- per-transition disclosure は実装しない
- 別軸で 「daily summary」 「weekly pattern」 等を別 UI に出す
- → 「個別 transition の不足」 ではなく「自分の傾向」 として disclosure

**メリット**:
- 個別不足の警告化リスク回避
- 「傾向理解」 が Aneurasync 思想に近い

**デメリット**:
- 大規模設計 (= 集計 + UI + smoke)
- M phase ロードマップ大幅延長

### 10.4 自律推奨

- **第 1 候補**: 「条件付き UI 接続」 (= M-3c-ui readiness audit 採用 → smoke → 実装)
- **第 2 候補**: 「pure で完結」 + N phase 進行 (= 危険境界回避)
- **第 3 候補**: 「集計 disclosure」 + 別軸 (= M-4+)

CEO + GPT 判断で最終確定。

---

## 11. 段階的 path (= M-3 + M-4 ロードマップ)

```
M-3a (= Pre-UI Pipeline)
  └─ ✅ 着地済 (= 24 tests PASS、 frozen)

M-3b (= disclosure 思想 + pure state machine)
  ├─ M-3b readiness audit ✅
  └─ M-3b-pure ✅ (= 58 tests PASS)

M-3c (= per-transition + UI 接続境界)
  ├─ M-3c readiness audit ✅
  ├─ M-3c-pure ✅ (= 75 tests PASS、 superseded by harden)
  ├─ M-3c-pure-harden ✅ (= 80 tests PASS、 mutation 攻撃面除去)
  ├─ M-3c-ui readiness audit ⏳ (= 本 doc)
  ├─ M-3c-ui implementation ⏸️ (= CEO 別承認 + smoke 必須)
  └─ M-3c-extend ⏸️ (= Calendar / Flow / density guard)

M-4 (= 集計 disclosure / 傾向理解)
  └─ ⏸️ TBD (= 別 audit、 別 phase)

M-5+ (= ?)
  └─ ⏸️ TBD
```

---

## 12. 思想 transmission (= 永続規約 candidate)

1. 観測の主導権を user に渡す (= M-3b 継承)
2. default = 全 hidden 永続規約 (= M-3b N-fold lift)
3. per-transition は M-3b-pure を N-fold lift (= M-3c)
4. tab/day 切替で reset (= 「観測の幕間」)
5. 余白 / 不足 完全同 styling (= 偏見 0)
6. counts は disclosure しない (= 集計警告化防止)
7. 永続 Set 定数を外部公開しない (= M-3c-pure-harden)
8. caller は always-function-call (= harden)
9. **「pure 層は堅固、 UI に出す瞬間は別の危険境界」** (= NEW M-3c-ui)
10. **最小 textual hint「詳細」 で発見性確保 + 警告化回避** (= NEW M-3c-ui)
11. **三重防御 (= データ層 + 状態層 + 表示層) で push 表示構造的不可能化** (= NEW M-3c-ui)
12. **5 人 visual smoke で質的検証必須** (= NEW M-3c-ui)

---

## 13. 残リスク (= M-3c-ui 着手前 CEO 確認材料)

| リスク | 内容 | 緩和策 |
|---|---|---|
| **R1**: 「不足」 体験の圧 | user smoke で 1 人でも「焦る」 → rollback | 5 人 smoke 必須 |
| **R2**: 発見性「詳細」 の警告化 | 「詳細」 が「重要なこと」 と読み取られる | 同 styling + tier_2 階調維持 |
| **R3**: density 高時の UI 圧 | 1 日 6+ transition で密度↑ | M-3c-extend で density guard |
| **R4**: tab 切替 reset の体験喪失感 | user が「さっき見た情報」 を再観測 | localStorage 禁止と整合、 「観測の幕間」 体験として受容 |
| **R5**: 「観測しすぎ」 習慣化 | user が毎日「不足」 を見る習慣 | reset 設計 + user agency 100% で緩和 |
| **R6**: 共有時の「不足」 露出 | 友人に見せた時に「不足」 が見える | PII 0 + tab 切替 reset で緩和 |
| **R7**: a11y screen reader 対応 | aria-expanded / aria-controls の正確な実装 | M-3c-ui tests §8 で機械検証 |
| **R8**: backward compat 破壊 | 既存 K-3c-iii / L-4d / CalendarTab / FlowTab に影響 | 3 props 全て optional + 既存 caller 不変 |

---

## 14. 凍結 / 連続 OK / 禁止リスト

### 14.1 凍結対象 (= 触らない)

- M-3c-pure-harden `lib/plan/feasibility/feasibilityDisclosureAdapter.ts` @ `399c5783`
- M-3c-pure-harden tests @ 同上
- M-3c readiness audit `docs/alter-plan-phase3-m-3c-readiness-audit.md` @ `db1ccd9d`
- M-3b-pure `lib/plan/feasibility/feasibilityDisclosureState.ts` @ `0b560b55`
- M-3b readiness audit `docs/alter-plan-phase3-m-3b-readiness-audit.md` @ `34d11a90`
- M-3a `lib/plan/feasibility/feasibilityDisplayPipeline.ts`
- M-2a / M-2b / M-1 / L / K phase 全 file
- 全 46 frozen branches

### 14.2 連続 OK (= 本 audit のみ)

- `docs/alter-plan-phase3-m-3c-ui-readiness-audit.md` 新規作成
- `docs/decision-log.md` 追記
- branch: `docs/plan-phase3-m-3c-ui-readiness-audit`

### 14.3 禁止 (= 絶対に進まない)

- **M-3c-ui 実装** (= MapTab / DayGraphTimeline 変更)
- MapTab / CalendarTab / FlowTab 変更
- DayGraphTimeline 変更
- 「不足 N 分」 / 「余白 N 分」 の画面表示
- Arrival Risk Memory
- warning / recommendation / optimization 文言
- amber / orange / red 警告色
- icon / warning badge
- localStorage / persist
- DB / env / package / dependency 変更
- runtime telemetry sink
- Counterfactual
- Routes API
- fetch / endpoint
- gh / push / reset / restore / stash / branch delete

---

## 15. CEO 報告 + 停止条件

### 15.1 CEO への報告内容

1. M-3c-ui readiness audit 完了 (= 本 doc)
2. **UI 接続すべきか / まだしないべきか**: 自律推奨 **「条件付き UI 接続」** (= smoke 後実装)
3. **実装するなら最小 scope**: §2 で確定 (= 3 props 追加 + MapTab-only)
4. **CEO 判断項目 7 件** (= §9.1)
5. **critical boundary 5 件** (= §9.2)
6. **「UI 接続しない」 選択肢** (= §10、 第 2 候補)
7. **段階的 path** (= §11、 M-3 + M-4 ロードマップ)

### 15.2 停止条件 (= 自律推論の境界)

以下のいずれかが発生した場合、 **即停止**:
- MapTab / DayGraphTimeline / Calendar / Flow を触る必要が出る
- 「不足 N 分」 を画面に出す必要が出る
- style / layout 判断が必要
- amber / orange / red 警告色を使う必要が出る
- icon / warning badge を使う必要が出る
- Arrival Risk / warning / recommendation / optimization に近づく
- localStorage / DB / env / package / dependency 変更が必要
- fetch / endpoint / runtime telemetry sink が必要
- Counterfactual / Routes API / mode 推定が必要

---

**完了**: M-3c-ui readiness audit 着地。 「本当に見せるべきか / どの条件なら見せてよいか」 の根本判断材料を CEO + GPT に提示、 自律推奨 + 7 CEO 判断項目 + 段階的 path + 「UI 接続しない」 選択肢を整理。
