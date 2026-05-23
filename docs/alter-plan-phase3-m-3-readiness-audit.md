# Phase 3-M-3 Readiness Audit (= Pre-UI Feasibility Pipeline、 M-3a 連続 GO 判定)

**作成日**: 2026-05-23
**承認**: CEO + GPT 合議 (= 2026-05-23 M-2 完全 freeze 後、 「M-3 readiness audit → low-risk なら M-3a pure pipeline helper まで連続実装 OK、 UI 接続 (= M-3b 以降) には進まない」 指示)
**範囲**: 「余白 N 分 / 不足 N 分」 をユーザーに見せる責任の整理 + UI に出す前の合成構造 + sensitive 扱い + 革新アイデア + M-3a 最小 scope 判定

> 本 audit は **docs only**。 M-3a (= pure pipeline helper) が low-risk 確認できれば連続実装に進む。
> M-3b/M-3c (= UI 接続 / Calendar/Map/Flow 改変) は **絶対に進まない**、 CEO smoke 必須。

---

## 0. ゴールから逆算 (= 上位思想の確認)

| Layer | 状態 |
|---|---|
| K = 時間構造観測 | 完了 |
| L = 移動観測 (= Mobility Truth Layer) | 完了 (= L-4d-b2 まで) |
| M-1 = 余白観測 pure data | 完了 |
| M-2 = 余白表記 pure display layer | 完了 |
| **M-3a = 合成 pure pipeline helper** | **本 audit 対象** |
| M-3b = UI 接続 (= MapTab only) | 別 audit (= UI smoke 必須) |
| M-3c = Calendar / Flow 拡張 | 別 audit |
| N 以降 = pattern observation | 別 phase |

**本 audit の重要 mission**:
> 「余白 N 分 / 不足 N 分」 を **画面に出す前の安全な合成 layer** を確立する

---

## 1. 「余白 N 分 / 不足 N 分」 をユーザーに見せる責任

### 1.1 「不足が警告に見える」 危険性 (= CEO 明示懸念)

文言は中立 (= 「不足 N 分」) でも、 **UI の置き方次第で警告に見える** 危険:

| 警告化する要素 | 例 |
|---|---|
| 色 | amber / orange / red |
| 強調 | 太字 / 大 size / 強 border |
| 位置 | Event card と同 row / 上部目立つ位置 |
| 並列表示 | 「余白」 と「不足」 を別 area に並べる (= 対比感) |
| chip / badge UI | 警告 chip 的視覚 |
| 頻度 | 全 transition に出す (= 圧過剰) |
| 並走 element | アイコン / 記号付随 |

**M-3a (= pure layer) では UI を扱わない** が、 caller (= M-3b+ UI 接続層) に渡す **data shape** で warning 化を防止する hint を組み込む:
- tier = `"tier_2_movement_aux"` (= L 補助情報階層、 「予定」 より弱い)
- variant 2 値のみ (= caller は「slack」 「shortfall」 で render 分岐可、 但し同 styling 推奨)
- **caller が逸脱しないための contract assertion** (= M-2b で機械保証済)

### 1.2 「ユーザーへの圧」 を最小化する 5 原則 (= M-3b+ で適用、 audit で明示)

1. **「余白」 と「不足」 を完全同 styling** — 視覚差をつけない (= 「不足」 が目立たない)
2. **「→ 移動」 / 「移動 約 N 分」 line の **下に補助行** として表示** — 同 row に並べない
3. **slate 系 italic / text-xs / dashed** — K-3c-iii 階層 2 と同 weight
4. **chip / badge にしない** — 平文 text として静かに表示
5. **頻度** — not_applicable は除外で表示頻度を最小化 (= 既に M-2a で実装済)

---

## 2. UI に出す前の合成構造 (= M-3a の core)

### 2.1 4 layer 合成 pipeline

```
caller (= 将来 UI 接続層)
  ├→ runMovementDisplayPipeline (= L-4c-pure)
  │    └→ MovementDisplayResult (= 「移動 約 N 分」 等)
  ├→ runFeasibilityDisplayPipeline (= M-3a、 本 audit 対象)
  │    ├→ computeDayFeasibility (= M-1)
  │    ├→ formatFeasibilityForDisplay (= M-2a)
  │    └→ assertFeasibilityDisplayResultCompliance (= M-2b)
  │    → FeasibilityDisplayPipelineResult (= 「余白 / 不足 N 分」 等)
  └→ 同 transitionKey で結合 → UI 表示 (= M-3b+ 別 phase)
```

### 2.2 「caller の負担」 を最小化する設計

**選択肢比較**:

| Option | 内容 | 評価 |
|---|---|---|
| A. M-3a が anchors → 全 pipeline (= L-4c-pure + 合成) | 1 call で全て | input が大、 L-4c-pure 重複計算リスク |
| B. M-3a は graph + overlayResult → feasibility display | 軽量 helper | caller が L-4c-pure を別途呼ぶ必要、 重複 0 |
| C. 統合 pipeline (= L + M を 1 つに) | 効率最大 | scope 拡大、 M-3a 範囲外 |

→ **Option B 採用** (= 軽量 helper):
- caller は L-4c-pure 経由で graph + overlay を取得済 (= 通常 pattern)
- M-3a は overlay result を再利用、 重複計算 0
- API 簡潔、 責務明確

将来の統合 (= Option C) は M-4+ で検討余地あり (= 但し現時点で着手しない)。

### 2.3 M-3a 設計確定

```typescript
// lib/plan/feasibility/feasibilityDisplayPipeline.ts

export interface FeasibilityDisplayPipelineInput {
  readonly graph: DayGraph;
  readonly overlayResult: OverlayResult;
  readonly tracingId?: string;
}

export interface FeasibilityDisplayPipelineResult {
  /** M-2a/M-2b 通過済 display (= caller の UI 表示候補) */
  readonly feasibilityDisplay: FeasibilityDisplayResult;
  /** M-1 の完全 counts (= sufficient / insufficient / notApplicable 全件、 caller の集計用) */
  readonly feasibilityCounts: {
    readonly sufficient: number;
    readonly insufficient: number;
    readonly notApplicable: number;
  };
  /** tracingId passthrough (= L-3c hook 整合) */
  readonly tracingId?: string;
}

export function runFeasibilityDisplayPipeline(
  input: FeasibilityDisplayPipelineInput,
): FeasibilityDisplayPipelineResult;
```

挙動:
1. M-1 `computeDayFeasibility` (= sync pure)
2. M-2a `formatFeasibilityForDisplay` (= sync pure、 not_applicable 除外)
3. M-2b `assertFeasibilityDisplayResultCompliance` (= 出荷直前 機械保証)
4. caller に display + counts (= 完全) + tracingId を返す

**純度保証**:
- input mutation 0 (= graph / overlayResult を読み取りのみ)
- 副作用なし
- deterministic

---

## 3. 表示位置の候補 (= M-3b+ UI 接続時の hint、 M-3a 範囲外)

### 3.1 caller (= M-3b+) が選ぶ表示パターン候補

| Pattern | 説明 | M-3a 評価 |
|---|---|---|
| A. movement line の **下に補助行** として | 「→ 移動」 の次行に「余白 N 分」 | ✅ 推奨 (= 静かな配置) |
| B. movement line と **同 row** | 「→ 移動 約 30 分・余白 N 分」 | ⚠️ 視覚情報過多、 警告感増 |
| C. transition area とは別の **summary section** | 1 日まとめ表示 | ❌ day-level summary は M-3a 範囲外 (= M-4+) |
| D. **warning badge / chip** | 「⚠ 不足 N 分」 chip | ❌ **絶対禁止** (= 警告化、 永続禁止) |

**推奨**: A (= 補助行)。 これは L-4d MapTab で「→ 移動」 が表示されている **直下** に同 slate 系で配置。 視覚的に「あくまで補助」 と明確化。

### 3.2 K view との関係

- K view: 「→ 移動」 固定 (= K-3a Negative Capability)
- L-4d: 「→ 移動」 を「移動 約 N 分」 で **置換** (= L overlay の display replacement、 補正 1 で明示)
- **M-3b+ では**: 「移動 約 N 分」 の **下に** 「余白 N 分」 を **追加** (= 置換ではなく augment)

→ M layer は K / L を破壊せず、 補助情報として **追加**する設計。

### 3.3 Event card との階調差

- K-3c-iii 階層 3 (= 「予定」 EventNode): slate-400 / text-slate-800 / solid / py-2
- K-3c-iii 階層 2 (= 「→ 移動」 / MovementTransition): slate-300 / text-slate-500 / italic / text-xs / dashed
- **M-3a output の tier = `"tier_2_movement_aux"`** → M-3b+ で caller は slate-300/400 系 + italic + text-xs を期待
- 「予定」 より弱く、 「→ 移動」 と同等 or 少しさらに弱く

---

## 4. Sensitive / Unresolved の扱い

### 4.1 既存 防御 layer (= M-1 / M-2 で確立済)

| Layer | 動作 |
|---|---|
| L overlay | sensitive_both / sensitive_adjacent / location_unknown → unresolved 強制 (= cascade early-exit) |
| M-1 computeDayFeasibility | unresolved overlay segment → not_applicable |
| M-2a formatFeasibilityForDisplay | not_applicable → map から除外 (= 表示しない) |

→ **M-3a 出力に sensitive proximity transition は含まれない** (= 構造的保証)。

### 4.2 「余白 / 不足 が sensitive 予定を推測させない」 検証

**シナリオ**:
- 10:00-11:00 ショッピング (= 非 sensitive)
- 12:00-13:00 通院 (= sensitive、 medical)
- 14:00-15:00 ランチ (= 非 sensitive)

K view の MovementTransition は **隣接 EventNode 間のみ**:
- ショッピング → 通院 (= sensitive proximity = true、 L で unresolved、 M で not_applicable、 M-3a 表示 0)
- 通院 → ランチ (= sensitive proximity = true、 同上)

→ sensitive 予定の **隣接 transition の余白 / 不足は M-3a で表示されない**。 sensitive を推測する経路ゼロ。

但し:
- ショッピング → ランチ (= もし sensitive 予定をスキップして直接 K view 上で連続なら) → 表示される可能性

これは設計通り (= sensitive 予定は K view で位置存在自体は表示される、 但し title は redacted、 M-3a で余白を出すこと自体は sensitive を新たに推測させない)。

### 4.3 M-3a での追加防御

不要 (= M-1/M-2 で完結)。 但し M-3a contract / privacy grep test で **「sensitive proximity 関連の field が出力に含まれない」** を再確認。

---

## 5. 革新的アイデア (= 自律推論で導出)

### 5.1 革新 1: 「counts 完全保持」 思想

M-2 display では not_applicable を除外したが、 M-3a output に **M-1 の完全 counts** を含める:
- display は **見せるもの**
- counts は **集計の事実**
- 両者を分離保持することで、 caller (= M-3b+ UI) が「該当外 N 件あった」 等の summary を表示する選択肢を残す (= 但し M-3b+ で慎重に判断)

これは「観測の完全な絵」 を caller に渡す思想:
- 表示は最小限 (= 警告化防止)
- データは完全 (= 集計可能)

### 5.2 革新 2: 「軽量 helper」 設計選択

統合 pipeline (= L + M を 1 つに) ではなく、 **軽量 helper** を選ぶ理由:
- L-4c-pure と M-3a の **責務分離**
- caller の柔軟性 (= L のみ / M のみ / 両方 を選択可能)
- 重複計算 0 (= overlay は 1 度しか計算しない)

将来 (= M-4+ or 別 phase) で「day display pipeline」 (= L + M 統合) を検討する余地は残るが、 現時点では分離が clean。

### 5.3 革新 3: 「観測層 3 段構造 pipeline」 の対称性確立

L-4c-pure (= L) と M-3a (= M) で同 pattern:
- pure pipeline helper
- input: 上位 layer の output (= graph + overlay)
- output: display result + counts + tracingId
- 出荷直前 contract assertion

これは「**観測層 pipeline の標準 template**」 として N 以降の phase でも継承可能 (= pattern 観測 pipeline 等)。

### 5.4 革新 4: 「tracingId passthrough」 の継承

L-3c で確立した tracingId opaque field を M-3a でも passthrough:
- caller (= 将来 telemetry sink) が同一の tracingId で L overlay と M feasibility を join 可能
- runtime telemetry sink は L-4e で別 phase (= CEO 後回し方針) だが、 hook は整合維持

### 5.5 革新 5: 「pipeline は async ではなく sync」

L-4c-pure は async (= provider が async)、 M-3a は **sync pure**:
- 入力 (= graph / overlayResult) は既に解決済
- M-1 computation も sync
- M-2 format も sync
- M-3a 全体が sync で完結

これは caller の便利性向上 (= await 不要、 useMemo で同期計算可能)。

### 5.6 革新 6: 「per-transition のみ、 day-level summary は M-4+」

M-3a output は per-transition (= L-4a と同 pattern)。 day-level summary (= 「1 日合計余白 N 分」) は:
- 集計に近接 (= 観測から離れる傾向)
- M-4+ 別 phase で検討
- 現時点では着手しない

---

## 6. M-3a 最小 scope (= L-4c-pure と対称、 連続 GO 判定)

### 6.1 M-3a 着地物

| File | 内容 |
|---|---|
| `lib/plan/feasibility/feasibilityDisplayPipeline.ts` | `runFeasibilityDisplayPipeline` 軽量 helper |
| `tests/unit/plan/feasibilityDisplayPipeline.test.ts` | 7 fixture + counts + PII grep + integration |

### 6.2 type 設計確定 (= 上述 §2.3 を再掲)

```typescript
export interface FeasibilityDisplayPipelineInput {
  readonly graph: DayGraph;
  readonly overlayResult: OverlayResult;
  readonly tracingId?: string;
}

export interface FeasibilityDisplayPipelineResult {
  readonly feasibilityDisplay: FeasibilityDisplayResult;
  readonly feasibilityCounts: {
    readonly sufficient: number;
    readonly insufficient: number;
    readonly notApplicable: number;
  };
  readonly tracingId?: string;
}
```

### 6.3 挙動規約

1. M-1 `computeDayFeasibility(input.graph, input.overlayResult)`
2. M-2a `formatFeasibilityForDisplay(feasibility)`
3. M-2b `assertFeasibilityDisplayResultCompliance(display)` (= 出荷直前)
4. caller に { feasibilityDisplay, feasibilityCounts, tracingId } を返す

純度保証:
- input mutation 0
- 副作用なし
- deterministic
- sync (= async なし)

---

## 7. STOP 条件 (= 連続 GO 着手前 必須クリア)

| STOP 条件 | M-3a 範囲 |
|---|---|
| UI 表示が必要 | ❌ 不要 (= M-3b+ 別 phase) |
| Calendar / Map / Flow を触る必要 | ❌ 不要 |
| 「不足 N 分」 を画面に出す必要 | ❌ 不要 |
| Arrival Risk / warning / recommendation / optimization に近づく | ❌ 不要 (= M-2b assertion 継続) |
| localStorage / DB / telemetry / API が必要 | ❌ 不要 |
| K / L / M-1 / M-2 types を破壊的に変える必要 | ❌ 不要 (= 読み取りのみ) |

→ **全 6 STOP 条件未抵触**。 M-3a 連続実装 GO 判定 成立。

---

## 8. UI 接続前の残リスク (= M-3b+ 着手前 確認事項)

| リスク | 内容 |
|---|---|
| 「不足 N 分」 が UI で警告に見える | M-3b で視覚階層 / 色 / 強調を **MapTab-only から段階的**に検証 |
| L「移動 約 N 分」 と M「余白 N 分」 の隣接表示 | tier 階調差で識別、 同 slate 系、 補助行配置 |
| Calendar / Flow / MapTab 全展開 | L-4d-b1/b2 と同 pattern (= 段階的拡張) |
| 「不足」 表示が user に圧を与える | M-3b で UX 設計 + **CEO visual smoke 必須** |
| sensitive 予定の前後表示 | M-1 / M-2 / M-3a で防御済 (= map から除外、 構造的保証) |
| K view との階層侵食 | tier「tier_2_movement_aux」 で「→ 移動」 と同等 or 少しさらに弱く配置 |

---

## 9. CEO 判断ポイント (= 本 audit 着地後)

| Q | 内容 | 自律推奨 |
|---|---|---|
| Q1 | M-3a 責務「Pre-UI Feasibility Pipeline」 と定義 (= L-4c-pure 対称) | **YES** |
| Q2 | Option B (= 軽量 helper) を採用 (= L-4c-pure と独立、 重複計算 0) | **YES** |
| Q3 | M-3a output に M-1 完全 counts を含める (= caller の集計選択肢) | **YES** |
| Q4 | tracingId passthrough を継承 (= L-3c hook 整合) | **YES** |
| Q5 | M-3a 連続実装 GO (= 全 STOP 条件未抵触) | **YES** |
| Q6 | M-3b 以降 (= UI 接続) は別 readiness audit + CEO smoke 経由 | **YES** |

---

## 10. 永続禁止 (= 本 audit 以降に維持)

❌ M-3a で UI 接続 (= M-3b+ 別 readiness audit)
❌ M-3a で Calendar / Map / Flow を触る
❌ M-3a で 「不足 N 分」 を画面に直接出す
❌ M で Arrival Risk Memory / warning / recommendation / optimization 文言
❌ M で 「ギリギリ」 「快適」 「危険」 等の質的評価語 / 緊急感表現 / 相対表現
❌ M で 記号 (= ⚠ / ❗ / ❌ / ! / ?)
❌ M で DB / env / package / dependency 変更
❌ M で localStorage / runtime telemetry sink
❌ M で Counterfactual / mode 推定 / Routes API
❌ K / L / M-1 / M-2 既存 types 改変
❌ frozen branches への commit (= 40 + 本 commit = 41 branches)
❌ fetch / push / gh
❌ reset / restore / stash / branch delete

---

## 11. 関連 docs

- `docs/alter-plan-phase3-m-readiness-audit.md` (= M 全体責務)
- `docs/alter-plan-phase3-m-2-readiness-audit.md` (= M-2 「不足を警告に見せない」)
- `docs/alter-plan-phase3-l-4c-bridge-readiness-audit.md` (= L-4c-pure 対称 pattern)
- `docs/alter-plan-phase3-l-closeout-overview.md` (= L 全体図)
- `docs/decision-log.md`

---

## 12. 着地状態 + freeze 確定

本 commit 着地と同時に `docs/plan-phase3-m-3-readiness-audit` を **frozen 扱い** (= 41 frozen branches 計、 以後 commit 禁止)。

次は M-3a 実装 branch を別途切り、 audit 結論 (= low-risk 連続 GO) に従って実装着手。 UI 接続前に停止。

---

## 13. 思想 transmission (= M-3 readiness audit から学ぶ)

1. **「画面に出す前の安全な合成 layer」 の確立** — UI 接続前の data shape で warning 化を防止
2. **counts 完全保持 思想** — 表示と集計を分離、 caller の柔軟性
3. **軽量 helper 設計** — 統合 pipeline ではなく responsibility 分離
4. **「観測層 pipeline の標準 template」 確立** — L-4c-pure / M-3a の対称、 N 以降にも継承
5. **「ユーザーへの圧 5 原則」** — 表示位置 / 階調 / 色 / chip 禁止 / 頻度 で警告化防止 (= M-3b+ 用 hint)

---

## 14. 結語 — M-3a の意義

M-3a = **Pre-UI Feasibility Pipeline** = M-1 + M-2 を pure に合成し、 caller (= 将来 UI 接続層) に「警告化しない安全な display data」 を提供する layer。

**M-3a の核心**:
- L-4c-pure と完全対称な軽量 helper
- counts 完全保持 (= 表示と集計の分離)
- tracingId passthrough (= L-3c hook 整合)
- 出荷直前 M-2b assertion 必須
- sync pure (= caller 便利性最大化)

「不足 N 分」 を画面に出す前に、 **data 層で warning 化を防止する 3 重防御** を構造的に確立:
- layer 1 (= M-2 contract): 文言 / 記号 / 視覚要素の grep 防御
- layer 2 (= M-3a pipeline): 出荷直前 contract assertion 必須
- layer 3 (= 将来 M-3b+ UI): tier hint / 補助行配置 / 同 styling 厳守

**M-3a 連続実装 GO**。 次は実装 branch + helper + tests を着地。 UI 接続 (= M-3b+) は別 audit で慎重に。
