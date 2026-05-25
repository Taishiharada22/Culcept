# Phase 3-M-3c Readiness Audit (= UI 接続境界 — N-fold disclosure / per-transition state / 連続実装可否)

**作成日**: 2026-05-23
**承認**: CEO + GPT 合議 (= 2026-05-23 M-3b-pure 完全 freeze 後、 「M-3c readiness audit に進む。 ただし UI 接続にはまだ入らない。 まず MapTab-only UI 接続を本当に行うべきかを audit してください」 指示)
**範囲**: M-3c の責務 / disclosure UI 案 / trigger / 表示位置 / 表示しない条件 / privacy / low-risk 連続実装可否 + 革新的アイデア + ユーザー心理シナリオ
**前提 freeze**:
- `docs/plan-phase3-m-3b-readiness-audit` @ `34d11a90`
- `feat/alter-plan-phase3-m-3b-pure-disclosure-state-machine` @ `0b560b55`
- `lib/plan/feasibility/feasibilityDisplayPipeline.ts` (= M-3a) freeze
- `lib/plan/feasibility/feasibilityDisclosureState.ts` (= M-3b-pure) freeze

> 本 audit は **docs only**。 MapTab / DayGraphTimeline / Calendar / Flow への UI 実装 (= M-3c-ui 以降) は **絶対に進まない**。 CEO 別承認 + visual smoke 必須。 但し **M-3c-pure** (= per-transition disclosure adapter、 tests only、 UI 0 touch) は本 audit で **連続実装 GO 判定の対象**。

---

## 0. ゴールから逆算 (= 上位思想の根本確認)

Aneurasync の中心問い:
> **「自分って、 そういう人間だったのか」**

M-3b で確立した永続規約:
> **「観測の主導権を user に渡す」** (= observational disclosure)
> default = hidden、 user 操作で expanded、 passive_idle で不変

M-3c はこの規範を **N 個 transition** に拡張するときの設計判断:
- 単一 transition → N 個 transition の lifting
- 各 transition が独立に open/close できる
- 全体状態は **expanded indexes の集合** で表現可能 (= 革新 1 で詳述)
- UI 接続 (= 「不足 N 分」 を画面に出す) は危険境界、 別承認

### 本 audit の中心問い

1. **MapTab-only UI 接続を本当に行うべきか?**
2. **行うならどう行うか?**
3. **行うなら何が danger boundary か?**
4. **行わない判断はあり得るか? その代替は?**

---

## 1. CEO 指定 7 項目への自律推論回答

### 1.1 M-3c の責務 (= CEO 項目 #1)

#### 1.1.1 MapTab の「1 日の構造」 に feasibility disclosure を接続するのか

**結論 (= 自律推論)**:
- **M-3c の責務 = 「N-fold observational disclosure」 の pure layer 実装 (= M-3c-pure) + MapTab 限定 UI 接続 (= M-3c-ui、 CEO 承認必須)**
- M-3c-pure は M-3b-pure を N 個 transition に lift する pure adapter
- M-3c-ui は MapTab `<DayGraphTimeline>` 直下の transition line に bind する

**判断根拠**:
- L-4d-b1 (= CalendarTab) / L-4d-b2 (= FlowTab) で既に movement display は接続済
- MapTab の「1 日の構造」 section は selectedDate-centric で、 user が 1 日を観察するための場
- → feasibility disclosure は **「1 日の観察」 文脈に最も自然**
- Calendar / Flow は 7 日 / 月 grid で観察対象が広い → density 観点で disclosure UI 圧が高くなる可能性
- → **MapTab limited expansion (= η 段階的 path)** が最低リスク

#### 1.1.2 どの transition で開けるのか

**結論**:
- M-3a 出力 `feasibilityDisplayByTransitionKey.has(key)` が true な transition **のみ**
- not_applicable (= sensitive / unresolved / location_unknown) は map から除外済 → 自動 skip
- L overlay の variant=unresolved に対応する transition も自動 skip (= M-1 段階で not_applicable 化)

**判断根拠**:
- M-2a で「not_applicable は map から除外」 が機械保証済
- M-3c で再判定不要 (= 既に M-2a で完了)
- caller (= MapTab) は `map.has(transitionKey)` のみで判断、 PII 露出 0

#### 1.1.3 どこに表示するのか

**結論**:
- DayGraphTimeline `<TransitionItem>` の **直下に補助行を追加** (= expanded 時のみ)
- transition line と同 list item として render、 但し独立 li
- styling = K-3c-iii `tier_2_movement_aux` 階層継承 (= text-xs italic text-slate-400)

**判断根拠**:
- transition line に **インライン**で「→ 移動 約 90 分 (余白 40 分)」 とすると視覚密度↑、 読みづらい
- 補助行として分離 → user が「観測した結果」 を independent な行として読める
- DayGraphTimeline の既存「→ 移動」 と styling 統一 → 視覚一貫性

#### 1.1.4 default hidden をどう守るのか

**結論 (= 永続規約 candidate)**:
- M-3b-pure `DEFAULT_DISCLOSURE_STATE = "hidden"` を **per-transition で適用**
- 初期 expandedTransitionIndices = `Set<number>()` (= 空 set)
- tab 切替 / 別 day で **reset** (= 全 hidden に戻る、 localStorage 禁止と整合)
- type system + runtime assertion で「初期 state に "expanded" は出てこない」 を保証

**判断根拠**:
- M-3b-pure の defaultIsHidden invariant を継承
- Set<number> 表現で hidden = 補集合 = 暗黙
- persist 不要 = 「観測は今この瞬間のみ」 という生命感
- assertValidDisclosureState 等の assertion を M-3c-pure でも再呼び出し

---

### 1.2 disclosure UI 案 (= CEO 項目 #2)

#### 1.2.1 永続規約 (= 全 M-3c-ui で機械保証)

| 規約 | 詳細 |
|---|---|
| 1. 常時表示しない | 初期は補助行 0、 user 操作で初めて render |
| 2. 「見る」 操作後だけ表示 | request_expand action のみが render trigger |
| 3. chip / badge / warning box にしない | li 要素 + text のみ、 background なし |
| 4. icon を使わない | SVG / Symbol 0 (= 「観測の入口」 を視覚的に主張しない、 革新 2) |
| 5. amber / orange / red 禁止 | slate-400 / italic / text-xs のみ (= K-3c-iii tier_2 継承) |
| 6. 「不足」 だけ強調しない | 余白 / 不足 完全同 styling、 同 variant 別 component 化しない |
| 7. 余白 / 不足 完全同 style | text-slate-400 italic text-xs、 variant 違いを class で表現しない |

#### 1.2.2 表示文言 (= M-2a 固定、 M-3c で変えない)

- 余白の場合: `余白 N 分` (= variant="slack")
- 不足の場合: `不足 N 分` (= variant="shortfall")

→ M-3c で別文言を作るのは M-2a 出し抜き設計違反、 **絶対に変えない**。

#### 1.2.3 縮約 pattern (= 検討した上で 不採用)

候補: 「ここに観測が 1 つ」 のみ示す pattern (= 数値を出さない)

**不採用理由**:
- M-2a が「N 分」 を含む文字列を出力する設計
- 縮約は M-2a の意義を打ち消す
- user が「N 分」 を見たい場合に情報が劣化する
- → M-2a 固定文言で開示するのが思想整合

---

### 1.3 trigger 設計 (= CEO 項目 #3)

#### 1.3.1 規約

| 規約 | 詳細 |
|---|---|
| 1. transition line tap | TransitionItem の単一 tap で `request_expand` / `request_collapse` toggle |
| 2. small disclosure text | 補助行は text-xs (= 最小)、 padding 小 |
| 3. existing detail area 内のみ | DayGraphTimeline 外の他 component には絶対出さない |
| 4. passive display 禁止 | hover / scroll / focus で勝手に開かない |
| 5. hover-only 禁止 | hover で expanded にしない、 必ず tap (= mobile-first) |

#### 1.3.2 affordance — 革新的設計判断

**ジレンマ**:
- 完全 invisible → user は機能を知らない
- 視覚 affordance (= dot / arrow / icon) → 警告化リスク

**自律解決案 (= 革新 2)**:
- transition line を `cursor: pointer` + `aria-expanded={false|true}` で **interactive 示唆のみ**
- 視覚 indicator (= dot / arrow / icon) は **追加しない**
- 視覚的には何も主張しない、 但し tap target は十分大きい (= 最小 44x44 dp、 a11y)

**根拠**:
- user は tap してみて初めて「あ、 こういう情報が見える」 と知る
- これは「観測の入口を物理的にだけ提供する」 設計
- Aneurasync 中心問い (= 「自分って、 そういう人間だったのか」) に整合
- 「観測は user が能動的に発見する」 思想の極致

**警告化リスク評価**:
- 視覚的に何も追加しない → 警告化リスク 0
- mobile a11y は cursor pointer / aria-expanded で担保
- 既存 transition line styling 不変 → K 不変原則維持

#### 1.3.3 keyboard / a11y

- `<TransitionItem>` を `<button>` 化するか `<li>` のまま `tabIndex={0}` + Enter/Space handler 追加するか
- ⚠️ K-3a の現状: `<li>` で render、 button 化していない
- M-3c-ui で button 化すると K 既存 markup に影響 → **button 化はしない**、 `<li>` + onClick + onKeyDown + tabIndex で対応
- `aria-expanded="false|true"` 必須
- `aria-controls` で補助行の id を指す

---

### 1.4 表示位置 (= CEO 項目 #4)

#### 1.4.1 規約

| 規約 | 詳細 |
|---|---|
| 1. movement line 直下の補助行 | transition `<li>` の直後に独立 `<li>` を render |
| 2. expanded 時のみ | `expandedTransitionIndices.has(transitionIndex)` で gate |
| 3. same row 表示は避ける | 別 `<li>` として分離、 同 row inline は禁止 |
| 4. event card より弱くする | text-xs italic text-slate-400 (= K-3c-iii tier_2、 EventItem の font-medium より明確に弱い) |

#### 1.4.2 階調設計

```
[09:00] ショッピング (= event)             ← strong: text-base font-medium text-slate-900
   → 移動 約 90 分 (= transition)          ← medium: text-sm text-slate-500 (K-3c-iii)
   ┊ 余白 40 分 (= feasibility disclosure) ← weak: text-xs italic text-slate-400 (tier_2)
[10:30] ロイヤルホスト (= event)            ← strong
```

階調の段差:
- event = 1.0 (= 基準、 user の予定本体)
- transition = 0.6 (= 移動文脈、 hint 情報)
- **feasibility disclosure = 0.3** (= 観測結果、 さらに弱)

#### 1.4.3 補助行構造案

```html
<li role="listitem"
    aria-label="場所の移動"
    className="text-sm italic text-slate-500 pl-4"
    data-testid="day-graph-transition"
    onClick={() => toggleExpanded(transitionIndex)}
    aria-expanded={isExpanded}
    aria-controls={`feasibility-${transitionIndex}`}
    cursor: pointer
>
  → 移動 約 90 分
</li>
{isExpanded && (
  <li role="listitem"
      id={`feasibility-${transitionIndex}`}
      aria-label="このtransitionの余白"
      className="text-xs italic text-slate-400 pl-8"
      data-testid="day-graph-feasibility-disclosure"
      data-variant="slack"
  >
    余白 40 分
  </li>
)}
```

- pl-8 (= transition より深い indent) → 「補助情報」 の視覚階層
- italic text-xs slate-400 (= K-3c-iii tier_2_movement_aux 同階調)
- background なし、 border なし
- variant は data-variant で表現 (= class 違いなし、 styling 不変)

---

### 1.5 表示しない条件 (= CEO 項目 #5)

#### 1.5.1 規約一覧

| 条件 | 検出方法 | M-3c-ui で render skip |
|---|---|---|
| not_applicable | `map.has(transitionKey)` === false | ✅ render なし |
| sensitive proximity | L overlay variant=unresolved (= sensitive_adjacent) → M-1 で not_applicable | ✅ 自動 skip |
| unresolved movement | L overlay variant=unresolved (= no_provider/no_coords) → M-1 で not_applicable | ✅ 自動 skip |
| location_unknown | L overlay variant=unresolved (= no_coords) → M-1 で not_applicable | ✅ 自動 skip |
| M result と L movement display 非対応 | transitionIndex 不一致 → map.has(key) === false | ✅ render なし |
| UI 密度高 (= transition >= N) | density guard (= 革新 4、 別 audit) | ⚠️ M-3c-ui では適用しない、 M-3c-extend で検討 |

#### 1.5.2 防御の二重構造

1. **データ層 (= M-2a で確立済)**: not_applicable は map から除外
2. **表示層 (= M-3c-ui で確立)**: `map.has(key) === false` なら何も render しない

これにより:
- データ層が breach されても表示層で防御
- 表示層が breach されてもデータ層で防御
- 両方 breach する設計は M-2b assertion で test-time に detect

#### 1.5.3 UI 密度 guard (= 革新 4、 将来 audit)

仮設計:
- 1 日 transition 数 >= N で `single-open mode` 切替
- N=5 が candidate (= 検証必須)
- single-open mode = expanded 状態は同時に 1 つだけ

**M-3c-ui では取り入れない**:
- M-3c-pure / M-3c-ui は最小実装に集中
- density guard は M-3c-extend (= 別 audit) で検討

---

### 1.6 privacy (= CEO 項目 #6)

#### 1.6.1 規約

| 規約 | 検証方法 |
|---|---|
| nodeId / anchorId / locationText / title / userId を view model に出さない | `FeasibilityDisplayView` は transitionIndex + displayText + variant + tier のみ持つ |
| disclosure state key に PII を使わない | state key は number (= transitionIndex)、 文字列 PII 不在 |
| transitionIndex ベースを維持 | L-3c の transition_${index} pattern を継承、 anchor id を露出しない |

#### 1.6.2 構造的保証

- M-3a `FeasibilityDisplayView.transitionIndex` は number 型 (= 非 PII)
- M-3c-pure `expandedTransitionIndices: ReadonlySet<number>` は number のみ
- DayGraphTimeline `feasibilityDisplayByTransitionIndex: ReadonlyMap<number, FeasibilityDisplayView>` も number → view
- どこにも PII は出ない

#### 1.6.3 trace / log 規約 (= M-3c-pure で確立)

- 副作用 0 (= no console.log / no telemetry / no localStorage)
- pure function のみ
- caller 側で trace を取りたい場合は別 layer で実装 (= M-3c-pure は trace に PII を出さない)

---

### 1.7 low-risk 連続実装可否 (= CEO 項目 #7)

#### 1.7.1 M-3c 分割

| 段階 | 内容 | 連続実装可否 | CEO 承認 |
|---|---|---|---|
| **M-3c-pure** | per-transition disclosure adapter (= pure function + tests) | ✅ **連続 GO 候補** | 本 audit で判定 |
| **M-3c-ui** | MapTab + DayGraphTimeline に bind (= 「不足 N 分」 が画面に出る) | ❌ 連続禁止 | CEO 別承認 + visual smoke 必須 |
| **M-3c-extend** | Calendar / Flow / ambient indicator / density guard | ❌ 連続禁止 | 別 audit + CEO 承認 |

#### 1.7.2 M-3c-pure scope (= 連続 GO 判定対象)

実装内容:
- `lib/plan/feasibility/feasibilityDisclosureAdapter.ts` (= pure adapter)
- `tests/unit/plan/feasibilityDisclosureAdapter.test.ts` (= tests only)

新規 file = 2、 既存 file 改変 = 0、 UI touch = 0。

#### 1.7.3 M-3c-pure の責務 (= 詳細)

```typescript
/**
 * Phase 3-M-3c-pure — Per-transition Disclosure Adapter
 *
 * 役割: M-3b-pure の単一 state machine を N 個 transition に lift する pure helper。
 *       caller (= 将来 M-3c-ui) は expanded indices set を hold するだけで
 *       全 transition の disclosure 状態を一括管理できる。
 */

import {
  nextDisclosureState,
  DEFAULT_DISCLOSURE_STATE,
  type FeasibilityDisclosureState,
  type FeasibilityDisclosureAction,
} from "./feasibilityDisclosureState";

/**
 * 全 transition の disclosure state を ReadonlySet<number> で表現する設計判断:
 *   - "expanded" indices の集合のみ保持
 *   - "hidden" は補集合 (= 暗黙)
 *   - 初期は空 Set (= 全 hidden、 永続規約 default)
 *
 * 革新点: M-3b-pure の単一 state machine を直接 import + 各 index に適用するだけ。
 *         新規 state machine 設計 0、 既存 invariants 完全継承。
 */
export function getDisclosureStateForIndex(
  expandedIndices: ReadonlySet<number>,
  index: number,
): FeasibilityDisclosureState {
  return expandedIndices.has(index) ? "expanded" : DEFAULT_DISCLOSURE_STATE;
}

/**
 * Per-transition action application:
 *   - 該当 index の現 state を取得
 *   - M-3b-pure の nextDisclosureState で次 state を計算
 *   - Set<number> の add / delete で全体 set を更新
 *
 * 純度保証:
 *   - input set を mutate しない (= 新規 Set を返す)
 *   - 副作用 0
 *   - deterministic
 */
export function applyDisclosureAction(
  expandedIndices: ReadonlySet<number>,
  index: number,
  action: FeasibilityDisclosureAction,
): ReadonlySet<number> {
  const current = getDisclosureStateForIndex(expandedIndices, index);
  const next = nextDisclosureState(current, action);

  if (next === "expanded") {
    if (expandedIndices.has(index)) return expandedIndices;
    const out = new Set(expandedIndices);
    out.add(index);
    return out;
  }
  // next === "hidden" (= request_collapse / 該当 transition 初期 hidden 維持)
  if (!expandedIndices.has(index)) return expandedIndices;
  const out = new Set(expandedIndices);
  out.delete(index);
  return out;
}

/**
 * 「全 transition reset」 helper:
 *   - tab 切替 / 別 day 移動で呼び出す想定
 *   - 「観測の幕間」 思想を実装
 *
 * 革新: localStorage 禁止 + reset 設計 = 「観測は今この瞬間のみ」 という生命感
 */
export const EMPTY_EXPANDED_INDICES: ReadonlySet<number> = new Set<number>();

export function resetDisclosure(): ReadonlySet<number> {
  return EMPTY_EXPANDED_INDICES;
}
```

#### 1.7.4 M-3c-pure の tests scope

- §1. `getDisclosureStateForIndex` — index in/out of set
- §2. `applyDisclosureAction` — 9 transitions (= state × action) × 多 index
- §3. expand / collapse の独立性 (= 異 index 操作で他 index 影響 0)
- §4. input mutation 0 (= 元 Set を不変)
- §5. deterministic
- §6. `resetDisclosure` — 全 hidden に戻る
- §7. EMPTY_EXPANDED_INDICES = 永続規約 (= 初期空 Set)
- §8. M-3b-pure invariants の N-fold lift 検証
- §9. PII grep (= number のみ、 文字列 PII 不在)

予測 test 数: 30-50 tests。

#### 1.7.5 危険境界遵守 (= M-3c-pure 0 touch)

| 境界 | 結果 |
|---|---|
| UI 接続 | **0** (= M-3c-ui 別 phase) |
| MapTab / CalendarTab / FlowTab / DayGraphTimeline 改変 | **0** |
| 「不足 N 分」 画面表示 | **0** |
| Arrival Risk Memory / 警告文言 | **0** |
| localStorage / DB / env / package / dependency | **0** |
| K / L / M-1 / M-2 / M-3a / M-3b 既存 file 改変 | **0** |
| fetch / endpoint / runtime telemetry sink | **0** |
| Counterfactual / Routes API / mode 推定 | **0** |
| reset / restore / stash / branch delete / git push | **0** |

---

## 2. ユーザー心理シナリオ — 8 種推論 (= 自律推論で深掘り)

### 2.1 シナリオ 1: 朝に MapTab を開いたユーザー

- selectedDate = 今日
- DayGraphTimeline に 4 transitions
- 初期: expandedTransitionIndices = 空 Set
- → user は「今日の流れ」 を timeline で見る、 余白/不足は **見えない**
- user が「この移動、 余裕あるかな?」 と気になって 1 つの transition line を tap
- → request_expand → 補助行 「余白 40 分」 が出る
- → **「自分で観測した」 体験**

評価: ✅ Aneurasync 整合

### 2.2 シナリオ 2: 暇な時間に過去日を振り返るユーザー

- selectedDate を 1 週間前に切替
- → tab 切替で reset = 空 Set (= 全 hidden)
- 初期: timeline は静か
- user が「あの日、 結構走り回ったな」 と思って tap → 「不足 30 分」 展開
- → 「あの日きつかった理由が見えた」 観測体験

評価: ✅ Aneurasync 中心問い直接接続 (= 「自分って、 そういう人間だったのか」)

### 2.3 シナリオ 3: 「不足」 を見たくないユーザー

- 朝に MapTab を開く、 timeline は静か (= 全 hidden)
- user は「観測したくない」 状態 = そのまま閉じる
- → AI からの押し付け 0、 user の選択

評価: ✅ user agency 100% 保証

### 2.4 シナリオ 4: 「全部見たい」 ユーザー

- timeline を順番に全部 tap → 全 transition の補助行が展開
- すべての「余白/不足」 を一度に観測
- 但し画面密度は上がる → density guard (= 革新 4) の必要性が出てくる

評価: ⚠️ density guard は M-3c-extend で検討。 M-3c-ui では取り入れない (= user の選択を尊重)

### 2.5 シナリオ 5: 「うっかり tap してしまった」 ユーザー

- 別の操作をしようとして transition line を誤 tap → 補助行展開
- user は驚かない (= 補助行は警告色なし、 controlled tone)
- 補助行を再 tap → request_collapse → 閉じる

評価: ✅ undo affordance = tap toggle で完全可逆

### 2.6 シナリオ 6: 「不足」 をきっかけに自己理解するユーザー

- 1 週間後に過去日を振り返り、 数日連続で「不足」 を観測
- → 「あ、 自分は予定詰めすぎる癖がある」 と気付く
- → Aneurasync 中心問い体験

評価: ✅ self-awareness trigger (= 自己理解 trigger)

但し: counts (= 「今週は不足 7 件」) を常時表示すると押し付けになる → counts は disclosure しない (= 革新 8)

### 2.7 シナリオ 7: 「移動余裕しかない」 ユーザー

- すべての transition で「余白」 表示
- user は「ゆとりある日だ」 と確認
- → ポジティブ observed disclosure

評価: ✅ 余白 disclosure もある = 押し付けは 0 (= ポジティブ偏見も作らない、 同 styling)

### 2.8 シナリオ 8: 「観測したことを忘れる」 ユーザー

- 朝に 3 transition を tap → 補助行展開
- 数時間後に MapTab に再 open → tab 切替で reset → 全 hidden
- user は「あ、 また見に行こう」 と思える

評価: ✅ fresh observation 体験 (= 革新 9、 forgetting curve 設計)

---

## 3. 革新的アイデア集 (= 自律推論で導出した 10 件)

### 3.1 革新 1: per-transition disclosure ≠ 単一 state

**通常 pattern**: state machine を array<state> に拡張
**革新**: state machine は **transitionIndex → state の Map** ではなく、 **expanded transitionIndices の Set + 単一 state machine の各 index 適用**

利点:
- Set<number> は最小 representation
- 各 index に対し M-3b-pure の state machine を独立適用
- 全体状態は Set のみで完全表現可能
- type system 上、 PII 露出 0 が機械保証

### 3.2 革新 2: 「観測の入口を視覚的に主張しない」 設計

**通常**: tappable 要素は dot / arrow / icon を出す
**革新**: tappable transition line を **既存 line と完全同 styling** に保つ + `cursor: pointer` + `aria-expanded` のみ

利点:
- 警告化リスク 0
- 「観測は user が能動的に発見する」 思想の極致
- Aneurasync 中心問いと整合

トレードオフ:
- user は機能を知らないかもしれない → 但し探索体験そのものが Aneurasync 設計

### 3.3 革新 3: M-3c-pure は M-3b-pure を「N-fold lift」

**通常**: 新規 state machine 設計
**革新**: M-3b-pure の単一 state machine を直接 import + 各 index に適用するだけ

利点:
- 新規 state machine 設計 0
- 既存 9 invariants の継承
- Set<number> のみ追加
- maintainability 高

### 3.4 革新 4: density-aware disclosure (= 将来 audit)

仮設計:
- 1 日 transition 数 >= N で `single-open mode` 切替
- single-open mode = 同時に 1 transition のみ expanded

**M-3c-ui では取り入れない**、 M-3c-extend (= 別 audit) で検討。

### 3.5 革新 5: 「観測の幕間」 と reset

tab 切替 / 別 day 移動で disclosure state を **reset**:
- tab 切替 = 「観測の場を変える」 = 全 hidden に戻る
- 別 day = 「観測対象を変える」 = 全 hidden に戻る

利点:
- localStorage 禁止と整合 (= persist しない)
- 「観測は今この瞬間のみ」 という生命感

### 3.6 革新 6: 余白 / 不足 同 styling = 偏見 0

- 余白を positive 強調 → user に「不足は negative」 と暗黙伝達 → 偏見
- → 完全同 styling で「両方とも観測対象」 として平等

利点:
- 「不足は警告ではなく観測」 が styling で機械保証
- ポジティブ偏見も作らない

### 3.7 革新 7: 「再観測のための再 hidden」

disclosure expanded → user が「観測した」 → user が「もう見たくない」 → request_collapse → hidden

利点:
- 観測の「閉じ方」 を user に任せる
- user agency 100%

### 3.8 革新 8: Counts は disclosure しない

M-3a 出力に `counts = { slack: N, shortfall: M }` がある。

**判断**: M-3c では counts も hidden default。 disclosure trigger 無し。

理由:
- 「今日は不足 3 件」 という表示は集計警告に変質
- user は自分で観測したい

将来 audit (= M-4+) で「集計 disclosure」 を別軸検討可能。 但し M-3c では絶対禁止。

### 3.9 革新 9: 「観測したことを忘れる」 体験

tab 切替で state reset = user が再度 MapTab に戻ったときは全 hidden。

利点:
- forgetting curve / fresh observation の設計
- 「あ、 また見に行こう」 と思える
- user の能動性を毎回再起動

### 3.10 革新 10: tier system 継承で視覚一貫性

M-3a で `tier: "tier_2_movement_aux"` 指定済。
M-3c-ui styling は K-3c-iii tier_2 と同階調を使う:
- text-xs italic
- text-slate-400
- amber/orange/red 不使用
- background なし

利点: 「移動 約 N 分」 と「余白 N 分」 が同階調 = 視覚一貫性

---

## 4. M-3c-ui 着手前 残リスク (= CEO 判断材料)

### 4.1 6 件の残リスク

| リスク | 内容 | 緩和策 |
|---|---|---|
| **R1**: visual 圧の発生 | user が全 transition を一度に tap して密度↑ | density guard (= 革新 4) を M-3c-extend で検討 |
| **R2**: tap target 不明瞭 | 視覚 affordance 0 で user が機能を発見しにくい | Aneurasync 思想として受容、 「探索体験」 を尊重 |
| **R3**: 「観測する責任」 の重さ | user が「不足を見ること」 を恐れる可能性 | 同 styling + 自由意志で観測選択を保証 |
| **R4**: tab 切替 reset の体験喪失感 | user が「さっき見た情報」 を再度見るための再操作 | localStorage 禁止と整合、 fresh observation 体験として受容 |
| **R5**: density-aware の不在 | 1 日 6+ transition の場合 UI 密度↑ | 革新 4 の density guard で将来対応 |
| **R6**: K / L 改変リスク | DayGraphTimeline に prop 追加で K 不変原則違反? | optional prop 追加のみ、 既存 caller 不変、 K 不変原則維持 (= L-4d でも同 pattern 採用済) |

### 4.2 緩和不能な根本リスク (= CEO 判断必須)

| 項目 | 内容 |
|---|---|
| **G1**: 「不足 N 分」 が画面に出る | M-3c-ui で初めて「不足」 文言が UI に出る。 これは Aneurasync 思想上、 user 能動 expanded 時のみとは言え、 出ること自体が初 |
| **G2**: 視覚 affordance 0 で発見性低 | user が機能を知らないリスク。 → 別の発見性設計 (= help tooltip 等) は革新 2 思想に反するため取り入れない |
| **G3**: tab 切替 reset の妥当性 | persist しない設計が user 体験として正しいか? localStorage 禁止と整合だが、 user の「観測継続性」 を失う |

→ G1 / G2 / G3 は **CEO 判断必須**。

### 4.3 「UI 接続しない」 選択肢の検討

M-3c-ui を **やらない** という選択もあり得る:
- M-3a (= Pre-UI Pipeline) で停止
- 将来 N phase で別観測層に進む
- 「不足 N 分」 は画面に出さない

利点:
- 危険境界に近づかない
- M-3 phase を pure 層で完結

欠点:
- M-1 / M-2 / M-3a の実装が利用されない (= 実用に至らない)
- Aneurasync の「自己理解」 体験への直結が遅れる

**自律推奨**:
- M-3c-pure (= adapter + tests) は連続 GO 候補
- M-3c-ui は CEO 別承認 (= 「不足 N 分」 を画面に出すか否か の根本判断)

---

## 5. M-3c-pure 連続実装 GO 判定 (= 本 audit の中心結論)

### 5.1 連続実装 GO 判定 chart

| 判定軸 | 評価 | 結論 |
|---|---|---|
| 危険境界 (= UI touch / MapTab/Map/Flow 改変 / 警告文言 / DB等) | 0 | ✅ low-risk |
| Aneurasync 整合性 | high (= M-3b-pure 規範を N-fold lift) | ✅ 整合 |
| 既存 file 改変 | 0 (= K / L / M-1 / M-2 / M-3a / M-3b 全 freeze 維持) | ✅ |
| 新規 fetch / endpoint / localStorage | 0 | ✅ |
| DB / env / package / dependency 変更 | 0 | ✅ |
| 機械検証可能性 (= tests) | 高 (= pure function、 deterministic) | ✅ |
| ロールバック容易性 | 高 (= 2 files 削除のみ) | ✅ |
| 思想保護 | 機械保証 (= type system + assertion) | ✅ |

**結論: M-3c-pure 連続実装 GO**

### 5.2 M-3c-pure 着地予定内容

- branch: `feat/alter-plan-phase3-m-3c-pure-per-transition-disclosure-adapter`
- file 1: `lib/plan/feasibility/feasibilityDisclosureAdapter.ts` (~150 行)
- file 2: `tests/unit/plan/feasibilityDisclosureAdapter.test.ts` (~250 行、 30-50 tests)
- 既存 file 改変: 0
- UI 改変: 0
- 危険境界: 0

### 5.3 M-3c-ui 着手前 必要事項 (= CEO 承認後)

1. M-3c-ui readiness audit (= 別 doc) で:
   - tap target size / a11y 詳細設計
   - aria-expanded / aria-controls 詳細
   - density guard 仮設計 (= 革新 4)
   - visual smoke 計画
2. CEO 別承認
3. dev server 立ち上げ + visual smoke
4. user 観測体験の確認

---

## 6. 凍結 / 連続 OK / 禁止リスト

### 6.1 凍結対象 (= 触らない)

- M-3b readiness audit `docs/alter-plan-phase3-m-3b-readiness-audit.md` @ `34d11a90`
- M-3b-pure `lib/plan/feasibility/feasibilityDisclosureState.ts` @ `0b560b55`
- M-3a `lib/plan/feasibility/feasibilityDisplayPipeline.ts`
- M-2a / M-2b / M-1 / L / K phase 全 file
- 全 44 frozen branches

### 6.2 連続 OK (= M-3c-pure)

- `lib/plan/feasibility/feasibilityDisclosureAdapter.ts` 新規作成
- `tests/unit/plan/feasibilityDisclosureAdapter.test.ts` 新規作成
- `docs/decision-log.md` 追記
- branch: `feat/alter-plan-phase3-m-3c-pure-per-transition-disclosure-adapter`

### 6.3 禁止 (= 絶対に進まない)

- M-3c-ui 実装
- MapTab / CalendarTab / FlowTab / DayGraphTimeline 変更
- 「不足 N 分」 の画面表示
- Arrival Risk Memory
- warning / recommendation / optimization 文言
- amber / orange / red 警告色
- icon / warning badge
- localStorage
- DB / env / package / dependency 変更
- runtime telemetry sink
- Counterfactual
- Routes API
- fetch / endpoint
- gh / push / reset / restore / stash / branch delete

---

## 7. UI 接続すべきか / まだしないべきか の判断材料 (= CEO 判断要点)

### 7.1 「UI 接続すべき」 派の論点

1. M-1 / M-2 / M-3a の実装が画面に出ないと user に届かない
2. Aneurasync 中心問い (= 「自分って、 そういう人間だったのか」) への直接接続を遅らせない
3. observational disclosure 思想は M-3b-pure で確立済、 後は適用するだけ

### 7.2 「まだしない」 派の論点

1. 「不足 N 分」 が画面に出ること自体が Aneurasync 思想上の挑戦
2. user 心理シナリオ 8 件を実機で検証する必要
3. density guard (= 革新 4) を先に整備すべき
4. visual smoke を慎重に行う必要

### 7.3 自律推奨 (= 「中間ペース」)

- **M-3c-pure は連続実装 GO** (= adapter + tests、 UI 0 touch)
- **M-3c-ui は本 audit では着手しない**、 CEO 別承認 + visual smoke 計画
- M-3c-ui readiness audit (= 別 doc) を将来作成

### 7.4 CEO 判断項目

1. **M-3c-pure 連続実装 GO?** (= 推奨: GO)
2. **M-3c-ui 着手判断 timing**: M-3c-pure 完了後 / N phase 完了後 / 別軸 pivot
3. **「不足 N 分」 が画面に出ること**: 容認 / 容認しない / 別文言で代替
4. **発見性設計**: 革新 2 (= 視覚 affordance 0) 採用 / help tooltip 追加 / 別案
5. **tab 切替 reset**: 採用 / persist 検討 / localStorage 例外申請

---

## 8. M-3c 全体 phase 図 (= 段階的 path)

```
M-3a (= Pre-UI Pipeline)
  └─ ✅ 着地済 (= 24 tests PASS、 frozen)

M-3b (= disclosure 思想 + pure state machine)
  ├─ M-3b readiness audit ✅ (= 7 候補評価、 frozen)
  └─ M-3b-pure ✅ (= 58 tests PASS、 frozen)

M-3c (= per-transition + UI 接続境界)
  ├─ M-3c readiness audit ✅ (= 本 doc、 frozen 予定)
  ├─ M-3c-pure ⏳ (= 連続 GO 候補、 adapter + tests)
  ├─ M-3c-ui ⏸️ (= CEO 別承認、 MapTab UI 接続、 visual smoke)
  └─ M-3c-extend ⏸️ (= Calendar / Flow、 density guard、 別 audit)

M-4+ (= 別観測層)
  └─ ⏸️ TBD
```

---

## 9. 思想 transmission (= 永続規約 candidate)

1. **観測の主導権を user に渡す** (= M-3b 継承)
2. **default = hidden 永続規約** (= M-3b 継承)
3. **per-transition は M-3b-pure を N-fold lift** (= 新規規約)
4. **tab 切替 / 別 day で reset** (= 新規規約、 「観測の幕間」)
5. **余白 / 不足 完全同 styling** (= M-3b 確立、 偏見 0)
6. **counts は disclosure しない** (= 新規規約、 集計警告化防止)
7. **視覚 affordance 0** (= 新規規約、 「観測の入口を主張しない」)
8. **expanded indices = Set<number>** (= 新規規約、 PII 0 機械保証)

---

## 10. CEO 報告 + 停止条件

### 10.1 CEO への報告内容

1. M-3c readiness audit 完了 (= 本 doc)
2. **M-3c-pure 連続実装 GO 推奨** (= adapter + tests、 UI 0 touch)
3. **M-3c-ui は別 audit + CEO 承認**、 本 audit では着手しない
4. CEO 判断項目 4 件 (= §7.4)

### 10.2 停止条件 (= 自律推論の境界)

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

**完了**: M-3c readiness audit 着地。 CEO 判断 4 件 + M-3c-pure 連続 GO 判定 + UI 接続境界の明文化。
